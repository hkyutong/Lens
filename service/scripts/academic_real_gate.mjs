import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'http://127.0.0.1:9520/api';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

const successEnvelope = body =>
  body?.success === true || body?.code === 200 || body?.status === 200;

const rowsFrom = body => {
  const rows = body?.data?.rows ?? body?.data;
  return Array.isArray(rows) ? rows : null;
};

const objectDataFrom = body =>
  body?.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : null;

export async function runAcademicRealGate({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const baseUrl = String(env.LENS_ACADEMIC_BASE_URL || env.BASE_URL || DEFAULT_BASE_URL).replace(
    /\/+$/,
    '',
  );
  const token = String(env.LENS_ACADEMIC_E2E_TOKEN || '').trim();
  const allowRemote = String(env.LENS_ACADEMIC_ALLOW_REMOTE || '').toLowerCase() === 'true';
  const expectedRemoteHost = String(env.LENS_ACADEMIC_REMOTE_HOST || '')
    .trim()
    .toLowerCase();
  const shareCode = String(env.LENS_ACADEMIC_SHARE_CODE || '').trim();
  const timeoutMs = Math.min(Math.max(Number(env.LENS_ACADEMIC_TIMEOUT_MS || 10000), 1000), 30000);
  const steps = [];

  const blocked = message => ({ exitCode: 2, error: `Academic 真实预检阻塞：${message}` });
  const addStep = (name, passed, detail = {}) => {
    steps.push({ name, passed: Boolean(passed), ...detail });
  };

  let parsedBase;
  try {
    parsedBase = new URL(baseUrl);
  } catch (_error) {
    return blocked('LENS_ACADEMIC_BASE_URL 不是有效 URL。');
  }

  if (!['http:', 'https:'].includes(parsedBase.protocol)) {
    return blocked('目标 URL 只允许 HTTP 或 HTTPS。');
  }
  if (parsedBase.username || parsedBase.password) {
    return blocked('URL 禁止包含用户名或密码。');
  }
  if (parsedBase.search || parsedBase.hash) {
    return blocked('基础 URL 禁止包含查询参数或片段。');
  }
  if (parsedBase.pathname.replace(/\/+$/, '') !== '/api') {
    return blocked('基础 URL 路径必须精确为 /api。');
  }
  if (!LOCAL_HOSTS.has(parsedBase.hostname) && !allowRemote) {
    return blocked('目标不是本机；远端只读访问必须显式设置 LENS_ACADEMIC_ALLOW_REMOTE=true。');
  }
  if (!LOCAL_HOSTS.has(parsedBase.hostname) && parsedBase.protocol !== 'https:') {
    return blocked('远端只读验证必须使用 HTTPS，防止凭据明文传输。');
  }
  if (!LOCAL_HOSTS.has(parsedBase.hostname) && parsedBase.hostname !== expectedRemoteHost) {
    return blocked('远端 hostname 必须与 LENS_ACADEMIC_REMOTE_HOST 完全一致。');
  }
  if (!token) {
    return blocked(
      '缺少 LENS_ACADEMIC_E2E_TOKEN；请注入获授权的短期 Bearer token，脚本不会读取或打印其他凭据。',
    );
  }
  if (shareCode && !/^[A-Za-z0-9]{8}$/.test(shareCode)) {
    return blocked('LENS_ACADEMIC_SHARE_CODE 必须是 8 位字母数字。');
  }
  if (typeof fetchImpl !== 'function') return blocked('当前 Node.js 运行时不支持 fetch。');

  const getApiUrl = apiPath => `${baseUrl}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`;

  const readJson = async (apiPath, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(getApiUrl(apiPath), {
        ...options,
        redirect: 'error',
        signal: controller.signal,
        headers: {
          ...(options.body == null ? {} : { 'Content-Type': 'application/json' }),
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      });
    } finally {
      clearTimeout(timer);
    }

    let body = null;
    try {
      body = await response.json();
    } catch (_error) {
      body = null;
    }
    return { response, body };
  };

  const addReadStep = (name, result, valid, detail = {}) => {
    addStep(name, result.response.ok && successEnvelope(result.body) && valid, {
      status: result.response.status,
      ...detail,
    });
  };

  try {
    const info = await readJson('/auth/getInfo');
    const userInfo = info.body?.data?.userInfo;
    addReadStep('登录态', info, Boolean(userInfo), {
      userIdPresent: Boolean(userInfo?.id),
    });

    const config = await readJson('/config/queryFront');
    addReadStep('前台配置', config, objectDataFrom(config.body) !== null);

    const groups = await readJson('/group/query');
    const groupRows = rowsFrom(groups.body);
    addReadStep('会话列表', groups, groupRows !== null, {
      rowCount: groupRows?.length ?? 0,
    });

    const firstGroupId = Number(groupRows?.find(row => Number(row?.id || 0) > 0)?.id || 0);
    if (firstGroupId > 0) {
      const history = await readJson(`/chatlog/chatList?groupId=${firstGroupId}&size=1`);
      const historyRows = rowsFrom(history.body);
      addReadStep('历史消息读取', history, historyRows !== null, {
        rowCount: historyRows?.length ?? 0,
      });
    } else {
      addStep('历史消息读取', true, { skipped: true, reason: 'account_has_no_groups' });
    }

    const balance = await readJson('/balance/query');
    addReadStep('余额与会员状态', balance, objectDataFrom(balance.body) !== null);

    const models = await readJson('/models/list');
    addReadStep('可用模型', models, objectDataFrom(models.body) !== null);

    const packages = await readJson('/crami/queryAllPackage?status=1&type=1&size=1');
    const packageRows = rowsFrom(packages.body);
    addReadStep('公开套餐', packages, packageRows !== null, {
      rowCount: packageRows?.length ?? 0,
    });

    const core = await readJson('/academic/core-function-list', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const coreRows = rowsFrom(core.body);
    addReadStep('Academic 核心能力', core, coreRows !== null, {
      rowCount: coreRows?.length ?? 0,
    });

    const plugins = await readJson('/academic/plugin-list', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const pluginRows = rowsFrom(plugins.body);
    addReadStep('Academic 插件能力', plugins, pluginRows !== null, {
      rowCount: pluginRows?.length ?? 0,
    });

    if (shareCode) {
      const share = await readJson(`/share/${shareCode}`);
      const htmlContent = share.body?.data?.htmlContent;
      const htmlPresent = typeof htmlContent === 'string' && htmlContent.length > 0;
      addReadStep('只读分享', share, htmlPresent, { htmlPresent });
    } else {
      addStep('只读分享', true, { skipped: true, reason: 'share_code_not_provided' });
    }
  } catch (error) {
    addStep('请求可达性', false, { reason: error?.name || 'request_failed' });
  }

  const result = {
    baseUrl,
    readOnly: true,
    timeoutMs,
    writeOperationsCalled: false,
    generationCalled: false,
    uploadCalled: false,
    shareCreationCalled: false,
    steps,
    passed: steps.every(step => step.passed),
  };
  return { exitCode: result.passed ? 0 : 1, result };
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const outcome = await runAcademicRealGate();
  if (outcome.error) console.error(outcome.error);
  if (outcome.result) console.log(JSON.stringify(outcome.result, null, 2));
  process.exitCode = outcome.exitCode;
}
