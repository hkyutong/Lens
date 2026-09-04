import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serviceDir = path.resolve(scriptDir, '..');
const academicDir = path.resolve(serviceDir, '..', 'academic-4.0');
const pythonPath = path.join(academicDir, 'venv', 'bin', 'python');
const proxyKeys = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'NO_PROXY',
  'no_proxy',
];

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const reservePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(error => (error ? reject(error) : resolve(port)));
    });
  });

const readJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { response, body };
};

const rowsFrom = body => (Array.isArray(body?.rows) ? body.rows : null);

const stopProcess = async child => {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGINT');
  const deadline = Date.now() + 5000;
  while (child.exitCode === null && Date.now() < deadline) await wait(100);
  if (child.exitCode === null) child.kill('SIGTERM');
};

const run = async () => {
  const summary = {
    isolated: true,
    businessWriteCalled: false,
    generationCalled: false,
    externalModelCalled: false,
    projectStorageTouched: false,
    passed: false,
    steps: [],
  };
  let tempRoot = '';
  let child = null;

  try {
    const pythonStat = await fs.stat(pythonPath).catch(() => null);
    if (!pythonStat?.isFile()) {
      summary.steps.push({
        name: 'academic-4.0 runtime',
        passed: false,
        reason: 'venv_python_missing',
      });
      process.exitCode = 2;
      return;
    }

    const port = await reservePort();
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lens-academic-contract-'));
    const directories = ['shared', 'logs', 'private', 'mpl', 'cache'];
    await Promise.all(
      directories.map(name => fs.mkdir(path.join(tempRoot, name), { recursive: true })),
    );

    const childEnv = { ...process.env };
    for (const key of proxyKeys) delete childEnv[key];
    Object.assign(childEnv, {
      GPT_ACADEMIC_API_KEY: '',
      GPT_ACADEMIC_USE_PROXY: 'False',
      GPT_ACADEMIC_PATH_LOGGING: path.join(tempRoot, 'logs'),
      GPT_ACADEMIC_PATH_PRIVATE_UPLOAD: path.join(tempRoot, 'private'),
      ACADEMIC_SHARED_UPLOAD_ROOT: path.join(tempRoot, 'shared'),
      ACADEMIC_TEMP_TTL_HOURS: '876000',
      ACADEMIC_EXTRACT_TTL_HOURS: '876000',
      ACADEMIC_RESULT_TTL_DAYS: '365000',
      MPLCONFIGDIR: path.join(tempRoot, 'mpl'),
      XDG_CACHE_HOME: path.join(tempRoot, 'cache'),
      ACADEMIC_HOST: '127.0.0.1',
      ACADEMIC_PORT: String(port),
      ACADEMIC_LOG_FILE: path.join(tempRoot, 'academic.log'),
      PYTHONUNBUFFERED: '1',
    });

    child = spawn(pythonPath, ['main.py'], {
      cwd: academicDir,
      env: childEnv,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    let childError = null;
    child.once('error', error => {
      childError = error;
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    let ready = false;
    const deadline = Date.now() + 30000;
    while (!ready && Date.now() < deadline) {
      if (child.exitCode !== null || childError) break;
      try {
        const probe = await readJson(`${baseUrl}/academic/core-function-list`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        ready = probe.response.status === 200 && rowsFrom(probe.body) !== null;
      } catch {
        await wait(250);
      }
    }
    summary.steps.push({ name: 'academic service readiness', passed: ready });
    if (!ready) {
      summary.steps.push({
        name: 'academic service startup',
        passed: false,
        reason: childError
          ? 'process_spawn_failed'
          : child.exitCode === null
          ? 'timeout'
          : 'process_exit',
      });
      process.exitCode = 1;
      return;
    }

    const core = await readJson(`${baseUrl}/academic/core-function-list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const coreRows = rowsFrom(core.body);
    const coreNames = new Set(
      (coreRows || []).map(row => String(row.displayName || row.name || '')),
    );
    const corePassed =
      core.response.status === 200 && coreRows !== null && coreNames.has('中文润色');
    summary.steps.push({
      name: 'core function list',
      passed: corePassed,
      status: core.response.status,
      rowCount: coreRows?.length ?? 0,
    });

    const plugins = await readJson(`${baseUrl}/academic/plugin-list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const pluginRows = rowsFrom(plugins.body);
    const pluginNames = new Set(
      (pluginRows || []).map(row => String(row.displayName || row.name || '')),
    );
    const pluginPassed =
      plugins.response.status === 200 &&
      pluginRows !== null &&
      pluginNames.has('论文速读') &&
      pluginNames.has('LaTeX 精准翻译');
    summary.steps.push({
      name: 'plugin list',
      passed: pluginPassed,
      status: plugins.response.status,
      rowCount: pluginRows?.length ?? 0,
    });

    const form = new FormData();
    form.append(
      'files',
      new Blob(['Lens academic contract gate\n'], { type: 'text/plain' }),
      'lens-contract.txt',
    );
    form.append('user_name', 'contract-gate');
    const upload = await readJson(`${baseUrl}/academic/upload`, { method: 'POST', body: form });
    const uploadedFiles = Array.isArray(upload.body?.files) ? upload.body.files : [];
    const uploadedPath = uploadedFiles.find(file => /lens-contract\.txt$/i.test(String(file)));
    const uploadPassed = upload.response.status === 200 && Boolean(uploadedPath);
    summary.steps.push({
      name: 'isolated upload',
      passed: uploadPassed,
      status: upload.response.status,
      fileCount: uploadedFiles.length,
    });

    let filePassed = false;
    let fileStatus = 0;
    if (uploadedPath) {
      const fileResponse = await fetch(
        `${baseUrl}/academic/file?path=${encodeURIComponent(uploadedPath)}`,
      );
      fileStatus = fileResponse.status;
      const content = await fileResponse.text();
      filePassed = fileResponse.status === 200 && content === 'Lens academic contract gate\n';
    }
    summary.steps.push({ name: 'isolated file read', passed: filePassed, status: fileStatus });
    summary.passed = summary.steps.every(step => step.passed);
    process.exitCode = summary.passed ? 0 : 1;
  } catch (error) {
    const message = String(error?.message || '').replace(/[\r\n]+/g, ' ').slice(0, 240)
    const environmentBlocked = /listen EPERM|operation not permitted 127\.0\.0\.1/i.test(message)
    summary.steps.push({
      name: 'contract gate',
      passed: false,
      reason: environmentBlocked ? 'local_port_permission_denied' : error?.name || 'request_failed',
      ...(message ? { message } : {}),
    });
    process.exitCode = environmentBlocked ? 2 : 1;
  } finally {
    await stopProcess(child);
    if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
    console.log(JSON.stringify(summary, null, 2));
  }
};

run();
