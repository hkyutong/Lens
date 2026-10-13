import { decodeJwtSubject, successEnvelope, responseData, parseNdjson } from './academic_gate_protocol.mjs';
import { resolveControlledWriteActor } from './academic_write_identity.mjs';
import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const WRITE_CONFIRMATION = 'CONFIRM_LENS_ACADEMIC_TEST_WRITES';
const RESIDUE_CONFIRMATION = 'CONFIRM_LENS_ACADEMIC_UPLOAD_AND_SHARE_RESIDUE';






const normalizeBalance = data => ({
  sumModel3Count: Number(data?.sumModel3Count || 0),
  useModel3Count: Number(data?.useModel3Count || 0),
  useModel3Token: Number(data?.useModel3Token || 0),
  sumModel4Count: Number(data?.sumModel4Count || 0),
  useModel4Count: Number(data?.useModel4Count || 0),
  useModel4Token: Number(data?.useModel4Token || 0),
  packageId: Number(data?.packageId || 0),
});



const referenceFingerprint = value =>
  crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex')
    .slice(0, 16);

export async function runAcademicControlledWriteGate({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const baseUrl = String(env.LENS_ACADEMIC_BASE_URL || 'http://127.0.0.1:9520/api').replace(
    /\/+$/,
    '',
  );
  const token = String(env.LENS_ACADEMIC_E2E_TOKEN || '').trim();
  const expectedUserId = Number(env.LENS_ACADEMIC_EXPECTED_USER_ID || 0);
  const model = String(env.LENS_ACADEMIC_E2E_MODEL || '').trim();
  const expectedDeduction = String(env.LENS_ACADEMIC_EXPECT_DEDUCTION || '').toLowerCase();
  const confirmWrites = String(env.LENS_ACADEMIC_WRITE_CONFIRM || '').trim();
  const confirmResidue = String(env.LENS_ACADEMIC_RESIDUE_CONFIRM || '').trim();
  const enableUpload = String(env.LENS_ACADEMIC_TEST_UPLOAD || '').toLowerCase() === 'true';
  const enableShare = String(env.LENS_ACADEMIC_TEST_SHARE || '').toLowerCase() === 'true';
  const allowRemote = String(env.LENS_ACADEMIC_ALLOW_REMOTE || '').toLowerCase() === 'true';
  const expectedRemoteHost = String(env.LENS_ACADEMIC_REMOTE_HOST || '')
    .trim()
    .toLowerCase();
  const timeoutMs = Math.min(
    Math.max(Number(env.LENS_ACADEMIC_WRITE_TIMEOUT_MS || 120000), 5000),
    300000,
  );
  const runId = `lens-e2e-${Date.now()}`;
  const steps = [];
  const residues = [];
  let createdGroupId = 0;

  const blocked = message => ({ exitCode: 2, error: `Academic 受控写入阻塞：${message}` });
  const addStep = (name, passed, detail = {}) => {
    steps.push({ name, passed: Boolean(passed), ...detail });
  };

  let parsedBase;
  try {
    parsedBase = new URL(baseUrl);
  } catch (_error) {
    return blocked('LENS_ACADEMIC_BASE_URL 不是有效 URL。');
  }
  if (!['http:', 'https:'].includes(parsedBase.protocol)) return blocked('目标只允许 HTTP/HTTPS。');
  if (parsedBase.username || parsedBase.password || parsedBase.search || parsedBase.hash) {
    return blocked('基础 URL 禁止包含凭据、查询参数或片段。');
  }
  if (parsedBase.pathname.replace(/\/+$/, '') !== '/api') {
    return blocked('基础 URL 路径必须精确为 /api。');
  }
  const localTarget = LOCAL_HOSTS.has(parsedBase.hostname);
  if (!localTarget && !allowRemote) return blocked('远端目标必须显式设置允许开关。');
  if (!localTarget && parsedBase.protocol !== 'https:') return blocked('远端目标必须使用 HTTPS。');
  if (!localTarget && parsedBase.hostname !== expectedRemoteHost) {
    return blocked('远端 hostname 必须与 LENS_ACADEMIC_REMOTE_HOST 完全一致。');
  }
  if (!token) return blocked('缺少获授权的短期 Bearer token。');
  if (!expectedUserId || expectedUserId < 1) return blocked('必须指定正整数测试用户 ID。');
  if (decodeJwtSubject(token) !== expectedUserId)
    return blocked('token 用户与指定测试用户不一致。');
  if (!model) return blocked('必须显式指定本次测试模型。');
  if (!['charged', 'free'].includes(expectedDeduction)) {
    return blocked('必须用 LENS_ACADEMIC_EXPECT_DEDUCTION 明确声明 charged 或 free。');
  }
  if (confirmWrites !== WRITE_CONFIRMATION) return blocked('缺少受控写入确认口令。');
  if ((enableUpload || enableShare) && confirmResidue !== RESIDUE_CONFIRMATION) {
    return blocked('上传或分享创建可能留下记录，必须提供独立残留确认口令。');
  }
  if (typeof fetchImpl !== 'function') return blocked('当前 Node.js 运行时不支持 fetch。');

  const request = async (apiPath, { method = 'GET', body, multipart = false } = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${apiPath}`, {
        method,
        redirect: 'error',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body != null && !multipart ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body == null ? undefined : multipart ? body : JSON.stringify(body),
      });
      const contentType = String(response.headers.get('content-type') || '');
      if (contentType.includes('application/x-ndjson')) {
        return { response, text: await response.text(), body: null };
      }
      let parsedBody = null;
      try {
        parsedBody = await response.json();
      } catch (_error) {}
      return { response, body: parsedBody, text: '' };
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const info = await request('/auth/getInfo');
    const infoData = responseData(info.body);
    const infoUser = infoData?.userInfo ?? infoData;
    const actualUserId = resolveControlledWriteActor(infoUser, expectedUserId, {
      publicIdentity: env.LENS_ACADEMIC_EXPECTED_PUBLIC_USER_ID,
      username: env.LENS_ACADEMIC_EXPECTED_USERNAME,
    });
    addStep('测试用户身份', info.response.ok && actualUserId === expectedUserId, {
      userIdMatched: actualUserId === expectedUserId,
    });
    if (actualUserId !== expectedUserId) throw new Error('test_user_mismatch');

    const balanceBeforeResult = await request('/balance/query');
    const balanceBefore = normalizeBalance(responseData(balanceBeforeResult.body));
    addStep(
      '计费基线',
      balanceBeforeResult.response.ok && successEnvelope(balanceBeforeResult.body),
    );

    const group = await request('/group/create', {
      method: 'POST',
      body: { appId: 0, params: JSON.stringify({ source: runId }) },
    });
    createdGroupId = Number(responseData(group.body)?.id || 0);
    addStep('创建临时研究会话', group.response.ok && createdGroupId > 0, {
      groupCreated: createdGroupId > 0,
    });
    if (!createdGroupId) throw new Error('group_create_failed');

    let fileUrl = '';
    if (enableUpload) {
      const form = new FormData();
      form.append(
        'file',
        new Blob(['Lens controlled upload fixture\n'], { type: 'text/markdown' }),
        `${runId}.md`,
      );
      const upload = await request(`/upload/file?dir=${encodeURIComponent(`lens-e2e/${runId}`)}`, {
        method: 'POST',
        body: form,
        multipart: true,
      });
      fileUrl = String(responseData(upload.body) || '');
      addStep('上传最小研究夹具', upload.response.ok && Boolean(fileUrl), {
        uploadReturnedPath: Boolean(fileUrl),
      });
      if (!fileUrl) throw new Error('upload_failed');
      residues.push({ kind: 'upload', referenceFingerprint: referenceFingerprint(fileUrl) });
    } else {
      addStep('上传最小研究夹具', true, { skipped: true, reason: 'upload_not_enabled' });
    }

    const academic = await request('/academic/chat-process', {
      method: 'POST',
      body: {
        function: 'chat',
        main_input: '请用一句话说明可复现研究为什么重要。',
        model,
        modelName: model,
        modelType: 1,
        appId: 0,
        fileUrl: fileUrl
          ? JSON.stringify([{ name: `${runId}.md`, url: fileUrl, type: 'document' }])
          : '',
        options: { groupId: createdGroupId, usingNetwork: false, usingDeepThinking: false },
      },
    });
    const events = parseNdjson(academic.text);
    const streamError = events.find(event => event?.streamError)?.streamError;
    const hasResult = events.some(
      event =>
        String(event?.finalContent || '').trim() ||
        String(event?.content || '').trim() ||
        String(event?.finishReason || '').toLowerCase() === 'stop',
    );
    addStep('一次最小 Academic 请求', academic.response.ok && hasResult && !streamError, {
      eventCount: events.length,
      hasResult,
      streamErrorPresent: Boolean(streamError),
    });
    if (!academic.response.ok || !hasResult || streamError) throw new Error('academic_failed');

    const balanceAfterResult = await request('/balance/query');
    const balanceAfter = normalizeBalance(responseData(balanceAfterResult.body));
    const charged =
      balanceAfter.sumModel3Count < balanceBefore.sumModel3Count ||
      balanceAfter.useModel3Count > balanceBefore.useModel3Count ||
      balanceAfter.useModel3Token > balanceBefore.useModel3Token ||
      balanceAfter.sumModel4Count < balanceBefore.sumModel4Count ||
      balanceAfter.useModel4Count > balanceBefore.useModel4Count ||
      balanceAfter.useModel4Token > balanceBefore.useModel4Token;
    const unchanged = JSON.stringify(balanceBefore) === JSON.stringify(balanceAfter);
    const accountingDirectionValid =
      balanceAfter.sumModel3Count <= balanceBefore.sumModel3Count &&
      balanceAfter.useModel3Count >= balanceBefore.useModel3Count &&
      balanceAfter.useModel3Token >= balanceBefore.useModel3Token &&
      balanceAfter.sumModel4Count <= balanceBefore.sumModel4Count &&
      balanceAfter.useModel4Count >= balanceBefore.useModel4Count &&
      balanceAfter.useModel4Token >= balanceBefore.useModel4Token &&
      balanceAfter.packageId === balanceBefore.packageId;
    const matchesExpectation = expectedDeduction === 'charged' ? charged : unchanged;
    const billingPassed =
      balanceAfterResult.response.ok &&
      successEnvelope(balanceAfterResult.body) &&
      accountingDirectionValid &&
      matchesExpectation;
    addStep('计费结果符合声明', billingPassed, {
      expected: expectedDeduction,
      charged,
      unchanged,
      accountingDirectionValid,
    });
    if (!billingPassed) throw new Error('billing_expectation_mismatch');

    if (enableShare) {
      const share = await request('/share/create', {
        method: 'POST',
        body: { htmlContent: '<article><p>Lens 受控验收结果</p></article>' },
      });
      const shareCode = String(responseData(share.body)?.shareCode || '');
      const validShareCode = /^[A-Za-z0-9]{8}$/.test(shareCode);
      addStep('创建只读分享', share.response.ok && validShareCode, {
        shareCodePresent: validShareCode,
      });
      if (!validShareCode) throw new Error('share_create_failed');
      residues.push({ kind: 'share', referenceFingerprint: referenceFingerprint(shareCode) });

      const shared = await request(`/share/${shareCode}`);
      const html = String(responseData(shared.body)?.htmlContent || '');
      addStep('读取只读分享', shared.response.ok && html.includes('Lens 受控验收结果'), {
        htmlPresent: Boolean(html),
      });
    } else {
      addStep('创建及读取分享', true, { skipped: true, reason: 'share_not_enabled' });
    }
  } catch (error) {
    addStep('受控写入流程', false, { reason: error?.message || error?.name || 'failed' });
  } finally {
    if (createdGroupId > 0) {
      try {
        const cleanup = await request('/group/del', {
          method: 'POST',
          body: { groupId: createdGroupId },
        });
        addStep('清理临时研究会话', cleanup.response.ok && successEnvelope(cleanup.body));
      } catch (error) {
        addStep('清理临时研究会话', false, { reason: error?.name || 'cleanup_failed' });
      }
    }
  }

  const result = {
    baseUrl,
    controlledWrites: true,
    runId,
    userId: expectedUserId,
    expectedDeduction,
    operations: {
      order: false,
      payment: false,
      package: false,
      crami: false,
      database: false,
      upload: enableUpload,
      shareCreation: enableShare,
    },
    residues,
    steps,
    passed: steps.length > 0 && steps.every(step => step.passed),
  };
  return { exitCode: result.passed ? 0 : 1, result };
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const outcome = await runAcademicControlledWriteGate();
  if (outcome.error) console.error(outcome.error);
  if (outcome.result) console.log(JSON.stringify(outcome.result, null, 2));
  process.exitCode = outcome.exitCode;
}
