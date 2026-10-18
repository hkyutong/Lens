'use strict';

// Stage-only bridge. Operational state and credentials never leave closures.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const http = require('node:http');
const dns = require('node:dns').promises;
const vm = require('node:vm');
const util = require('node:util');

const MANAGED = Object.freeze(['LENS_ACADEMIC_INTERNAL_SECRET', 'LENS_ACADEMIC_WORKSPACE_ROOT',
  'PATH_LOGGING', 'PATH_PRIVATE_UPLOAD', 'ACADEMIC_TEMP_ROOT']);
const STATUS = Object.freeze(['ok', 'error', 'prepared', 'files_applied', 'configs_applied',
  'backup_verified', 'rollback_completed', 'manual_intervention', 'changed_files']);
const ERRORS = new Set(['academic_context_invalid', 'academic_controller_failed', 'academic_manager_failed',
  'academic_apply_failed', 'academic_route_invalid', 'academic_ready_failed', 'academic_restore_failed', 'academic_cleanup_failed']);

function failure(code) {
  const error = new Error(ERRORS.has(code) ? code : 'academic_context_invalid');
  error.lensCode = error.message;
  return error;
}
function insist(condition, code = 'academic_context_invalid') { if (!condition) throw failure(code); }
function exact(value, keys) { return value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0'); }
function privateJson(file, maximum = 65536, owner) {
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const st = fs.fstatSync(fd);
    insist(st.isFile() && st.nlink === 1 && (st.mode & 0o777) === 0o600
      && st.uid === (owner ? owner[0] : process.geteuid())
      && (!owner || st.gid === owner[1]) && st.size <= maximum);
    return JSON.parse(fs.readFileSync(fd));
  } catch (_) { throw failure('academic_context_invalid'); }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}
function closedStatus(value) {
  insist(exact(value, STATUS), 'academic_controller_failed');
  for (const key of STATUS.filter(k => !['error', 'changed_files'].includes(k)))
    insist(typeof value[key] === 'boolean', 'academic_controller_failed');
  insist(typeof value.error === 'string' && /^[a-z_]{1,64}$/.test(value.error)
    && Number.isInteger(value.changed_files) && value.changed_files >= 0 && value.changed_files <= 7, 'academic_controller_failed');
  return value;
}
function controller(stage) {
  const child = cp.spawn('python3', ['-B', 'lens_academic_transaction.py', '--control'], {
    cwd: stage, stdio: ['pipe', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH || '', PYTHONDONTWRITEBYTECODE: '1' },
  });
  let pending = null, buffer = '', broken = false;
  let ended = false;
  const exited = new Promise(resolve => child.once('close', () => { ended = true; resolve(); }));
  const reject = () => { broken = true; if (pending) { clearTimeout(pending.timer); pending.reject(failure('academic_controller_failed')); pending = null; } };
  child.stderr.on('data', () => {});
  child.on('error', reject);
  child.on('close', reject);
  child.stdin.on('error', reject);
  child.stdout.on('data', chunk => {
    buffer += chunk.toString('utf8');
    if (buffer.length > 1024 * 1024) { reject(); child.kill(); return; }
    while (buffer.includes('\n')) {
      const index = buffer.indexOf('\n'), line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
      if (!pending) { reject(); child.kill(); return; }
      const request = pending; pending = null; clearTimeout(request.timer);
      try { request.resolve(closedStatus(JSON.parse(line))); }
      catch (_) { request.reject(failure('academic_controller_failed')); reject(); }
    }
  });
  return {
    async call(request, timeout = 30000) {
      insist(!broken && !pending, 'academic_controller_failed');
      return new Promise((resolve, rejectRequest) => {
        const timer = setTimeout(() => { reject(); child.kill(); }, timeout);
        pending = { resolve, reject: rejectRequest, timer };
        child.stdin.write(JSON.stringify(request) + '\n', error => { if (error) reject(); });
      });
    },
    kill() { child.kill(); },
    async terminate() {
      if (!ended) child.kill();
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 1500))]);
      if (!ended) { child.kill('SIGKILL'); await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 1500))]); }
      insist(ended, 'academic_controller_failed');
    },
    get broken() { return broken; },
  };
}

function methodSource(source, name) {
  const marker = new RegExp('(?:^|\\n)\\s*' + name + '\\s*\\([^)]*\\)\\s*\\{', 'g');
  const match = marker.exec(source); insist(match);
  const begin = match.index + match[0].indexOf(name), open = marker.lastIndex - 1;
  let depth = 1, quote = null, escaped = false, comment = null, i = open + 1;
  for (; i < source.length && depth; i++) {
    const c = source[i], next = source[i + 1];
    if (comment === 'line') { if (c === '\n') comment = null; continue; }
    if (comment === 'block') { if (c === '*' && next === '/') { comment = null; i++; } continue; }
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = null; continue; }
    if (c === '/' && next === '/') { comment = 'line'; i++; continue; }
    if (c === '/' && next === '*') { comment = 'block'; i++; continue; }
    if (['"', "'", '`'].includes(c)) quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  insist(depth === 0 && i - begin < 16384);
  return source.slice(begin, i);
}
function selectedAcademicUrls(nodeCwd, environment) {
  const source = fs.readFileSync(path.join(nodeCwd, 'dist/main.js'), 'utf8');
  insist(source.length <= 64 * 1024 * 1024);
  const normalize = methodSource(source, 'normalizeAcademicBaseUrl');
  const select = methodSource(source, 'getAcademicBaseUrls');
  insist(select.includes('process.env.ACADEMIC_API_URL'));
  // Execute only the two attested selection methods, with one projected env key.
  const result = vm.runInNewContext('(()=>{const service={' + normalize + ',' + select
    + '};return service.getAcademicBaseUrls();})()', {
    process: Object.freeze({ env: Object.freeze({ ACADEMIC_API_URL: environment }) }),
  }, { timeout: 100, contextCodeGeneration: { strings: false, wasm: false } });
  insist(Array.isArray(result) && result.length > 0 && result.length <= 16
    && result.every(value => typeof value === 'string' && value.length <= 2048));
  return [...result];
}
function loopback(address) {
  const normalized = String(address || '').toLowerCase().replace(/^::ffff:/, '');
  return normalized === '::1' || /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(normalized)
    && normalized.split('.').every(piece => Number(piece) <= 255);
}
async function routeEndpoint(urls, listeners) {
  insist(Array.isArray(urls) && urls.length > 0 && urls.length <= 16, 'academic_route_invalid');
  insist(Array.isArray(listeners) && listeners.length === 1, 'academic_route_invalid');
  const [host, port] = listeners[0];
  insist(typeof host === 'string' && loopback(host) && Number.isInteger(port) && port >= 1 && port <= 65535, 'academic_route_invalid');
  // The attested application selector retains fallback candidates.  Only its
  // first candidate is contacted; a successful signed probe proves that route.
  let selected; try { selected = new URL(urls[0]); } catch (_) { throw failure('academic_route_invalid'); }
  insist(selected.protocol === 'http:' && !selected.username && !selected.password && !selected.search && !selected.hash
    && selected.pathname === '/' && ['localhost', '127.0.0.1', '[::1]'].includes(selected.hostname), 'academic_route_invalid');
  insist(Number(selected.port || 80) === port, 'academic_route_invalid');
  if (selected.hostname === 'localhost') {
    const addresses = await dns.lookup('localhost', { all: true });
    insist(addresses.length > 0 && addresses.every(row => loopback(row.address)), 'academic_route_invalid');
  } else insist(selected.hostname.replace(/^\[|\]$/g, '') === host, 'academic_route_invalid');
  return { url: selected, host, port };
}
async function request(endpoint, resource, headers = {}) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const fail = () => { if (!finished) { finished = true; reject(failure('academic_ready_failed')); } };
    const operation = http.request({ protocol: 'http:', hostname: endpoint.url.hostname.replace(/^\[|\]$/g, ''),
      port: endpoint.port, path: resource, method: 'GET', headers, agent: false,
    }, response => {
      const peer = String(response.socket.remoteAddress || '').replace(/^::ffff:/, '');
      if (!loopback(peer) || peer !== endpoint.host || response.socket.remotePort !== endpoint.port) { response.destroy(); operation.destroy(); fail(); return; }
      let body = Buffer.alloc(0);
      response.on('data', chunk => { body = Buffer.concat([body, chunk]); if (body.length > 8192) { response.destroy(); fail(); } });
      response.on('error', fail);
      response.on('end', () => { if (!finished) { finished = true; resolve({ status: response.statusCode, body }); } });
    });
    operation.setTimeout(2500, () => { operation.destroy(); fail(); });
    operation.on('error', fail);
    operation.end();
  });
}
async function verifyAcademicRoute({ urls, listeners, secret }) {
  try {
    insist(typeof secret === 'string' && /^[\x21-\x7e]{32,256}$/.test(secret), 'academic_route_invalid');
    const endpoint = await routeEndpoint(urls, listeners);
    const health = await request(endpoint, '/health');
    let payload; try { payload = JSON.parse(health.body); } catch (_) { throw failure('academic_ready_failed'); }
    insist(health.status === 200 && exact(payload, ['status', 'service', 'contract']) && payload.status === 'ready'
      && payload.service === 'academic-runtime' && payload.contract === 'lens-academic-v1', 'academic_ready_failed');
    const requestId = crypto.randomUUID(), reference = 'academic-report:' + requestId + ':' + crypto.randomUUID();
    const resource = '/academic/file?' + new URLSearchParams({ path: reference }).toString();
    const unsigned = await request(endpoint, resource);
    insist([401, 403].includes(unsigned.status), 'academic_ready_failed');
    function headers(valid) {
      const stamp = String(Math.floor(Date.now() / 1000)), nonce = crypto.randomUUID();
      const canonical = ['GET', resource, crypto.createHash('sha256').update('').digest('hex'), stamp, nonce, '1', requestId].join('\n');
      return { 'X-Lens-Academic-Timestamp': stamp, 'X-Lens-Academic-Nonce': nonce,
        'X-Lens-Academic-Owner': '1', 'X-Lens-Academic-Request': requestId,
        'X-Lens-Academic-Signature': valid ? crypto.createHmac('sha256', secret).update(canonical).digest('hex') : '0'.repeat(64) };
    }
    const invalid = await request(endpoint, resource, headers(false));
    insist([401, 403].includes(invalid.status), 'academic_ready_failed');
    const signed = await request(endpoint, resource, headers(true));
    insist(signed.status === 404, 'academic_ready_failed');
    return true;
  } catch (error) { throw failure(error?.lensCode === 'academic_route_invalid' ? 'academic_route_invalid' : 'academic_ready_failed'); }
}

async function independent(stage, bundle, mode, payload) {
  return new Promise((resolve, reject) => {
    const recovery = path.join(bundle, 'academic-recovery');
    const cwd = fs.existsSync(path.join(stage, 'lens_academic_transaction.py')) ? stage : recovery;
    const child = cp.spawn('python3', ['-B', 'lens_academic_transaction.py', mode], { cwd,
      stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH || '', PYTHONDONTWRITEBYTECODE: '1' } });
    let output = '', settled = false;
    const timer = setTimeout(() => { child.kill(); fail(); }, 60000);
    function fail() { if (!settled) { settled = true; clearTimeout(timer); reject(failure('academic_restore_failed')); } }
    child.stderr.on('data', () => {}); child.on('error', fail);
    child.stdout.on('data', chunk => { output += chunk.toString('utf8'); if (output.length > 1024 * 1024) { child.kill(); fail(); } });
    child.on('close', code => {
      if (settled) return;
      try { const result = closedStatus(JSON.parse(output)); insist(code === 0 && result.ok && result.rollback_completed); settled = true; clearTimeout(timer); resolve(result); }
      catch (_) { fail(); }
    });
    child.stdin.on('error', fail);
    child.stdin.end(JSON.stringify(payload));
  });
}
async function recover(stage, bundle) {
  return independent(stage, bundle, '--recover', { action: 'restore', bundle });
}
async function prepare(options) {
  let control, academicManager;
  const disconnectManager = () => {
    if (academicManager) {
      const manager = academicManager; academicManager = undefined;
      manager.disconnect();
    }
  };
  try {
    const { stage, bundle, releaseId, nodeCwd, privateStorage, entries, pm2, pm2Call,
      pm2ModuleRoot, nodeProcessId, getNodeProcessId } = options;
    insist(typeof pm2Call === 'function' && pm2 && path.isAbsolute(stage) && path.isAbsolute(bundle) && path.isAbsolute(nodeCwd));
    const attestedNode = nodeProcessId !== undefined;
    insist(!attestedNode || Number.isInteger(nodeProcessId) && nodeProcessId > 1 && typeof getNodeProcessId === 'function');
    control = controller(stage);
    const prepared = await control.call({ action: 'prepare', stage, bundle, release_id: releaseId,
      node_cwd: nodeCwd, private_storage: privateStorage, entries,
      ...(attestedNode ? { node_process_id: nodeProcessId } : {}) });
    insist(prepared.ok && prepared.prepared, 'academic_context_invalid');
    const controlFile = path.join(stage, 'academic-control.json'), observed = privateJson(controlFile);
    const controlFields = ['version', 'process_id', 'pm2_id', 'pm2_home', 'cwd', 'executable', 'arguments',
      'clear_environment', 'source_root', 'node_cwd', 'listener_endpoints', 'academic_url_environment'];
    const nodeOwnerPresent = Object.hasOwn(observed, 'node_owner');
    insist(exact(observed, [...controlFields, ...(nodeOwnerPresent ? ['node_owner'] : [])]));
    insist(!nodeOwnerPresent || Array.isArray(observed.node_owner) && observed.node_owner.length === 2
      && observed.node_owner.every(value => Number.isSafeInteger(value) && value >= 0));
    insist(observed.version === 1 && Number.isInteger(observed.process_id) && observed.process_id > 0
      && /^\d+$/.test(observed.pm2_id) && observed.node_cwd === nodeCwd
      && JSON.stringify(observed.clear_environment) === JSON.stringify(MANAGED));
    if (pm2ModuleRoot !== undefined) {
      insist(typeof pm2ModuleRoot === 'string' && path.isAbsolute(pm2ModuleRoot)
        && typeof observed.pm2_home === 'string' && path.isAbsolute(observed.pm2_home));
      const home = fs.lstatSync(observed.pm2_home);
      const socket = fs.lstatSync(path.join(observed.pm2_home, 'rpc.sock'));
      insist(home.isDirectory() && !home.isSymbolicLink() && home.uid === process.geteuid()
        && !(home.mode & 0o022) && fs.realpathSync(observed.pm2_home) === observed.pm2_home
        && socket.isSocket() && socket.uid === home.uid);
      const api = require(pm2ModuleRoot);
      insist(typeof api.custom === 'function');
      academicManager = new api.custom({ pm2_home: observed.pm2_home });
      await new Promise((resolve, reject) => academicManager.connect(error =>
        error ? reject(failure('academic_manager_failed')) : resolve()));
    }
    const targetManager = academicManager || pm2;
    const call = async (method, ...args) => { try { return await pm2Call(targetManager, method, ...args); } catch (_) { throw failure('academic_manager_failed'); } };
    const rows = await call('list');
    insist(Array.isArray(rows));
    const matches = rows.filter(row => row?.pid === observed.process_id && String(row.pm_id) === observed.pm2_id
      && row.pm2_env?.pm_cwd === observed.cwd);
    insist(matches.length === 1);
    const initial = matches[0].pm2_env;
    insist(initial && typeof initial.name === 'string' && typeof initial.pm_exec_path === 'string'
      && initial.pm_cwd === observed.cwd && initial.status === 'online' && initial.watch === false
      && Number(initial.instances || 1) === 1 && initial.env && typeof initial.env === 'object' && !Array.isArray(initial.env));
    const original = structuredClone({ name: initial.name, namespace: initial.namespace, script: initial.pm_exec_path,
      cwd: initial.pm_cwd, interpreter: initial.exec_interpreter, args: initial.args,
      node_args: initial.node_args, exec_mode: 'fork', watch: false, instances: 1, env: initial.env,
      autorestart: initial.autorestart === undefined ? true : initial.autorestart });
    fs.unlinkSync(controlFile);
    let applied = false, restored = false, stopped = false, closed = false, readyVerified = false;
    const ownedIds = new Set([Number(observed.pm2_id)]);
    async function matchingRows() {
      const currentRows = await call('list');
      insist(Array.isArray(currentRows), 'academic_manager_failed');
      const result = currentRows.filter(row => row?.pm2_env?.name === original.name && row.pm2_env?.pm_cwd === original.cwd
        && row.pm2_env?.pm_exec_path === original.script && (row.pm2_env?.namespace || 'default') === (original.namespace || 'default'));
      insist(result.length <= 1, 'academic_manager_failed'); return result;
    }
    async function current() {
      const rows = await matchingRows();
      insist(rows.every(row => ownedIds.has(Number(row.pm_id))), 'academic_manager_failed');
      return rows;
    }
    async function stop() {
      for (const row of await current()) await call('stop', row.pm_id);
      stopped = true;
    }
    async function start(isNew) {
      insist(stopped, 'academic_manager_failed');
      if (!isNew) insist(restored || !applied, 'academic_restore_failed');
      for (const row of await current()) await call('delete', row.pm_id);
      const app = structuredClone(original);
      if (isNew) for (const key of MANAGED) app.env[key] = '';
      app.env.INIT_DB_ON_BOOT = 'false';
      async function adoptStarted() {
        const rows = await matchingRows();
        for (const row of rows) {
          const environment = row.pm2_env.env || {};
          insist(String(environment.INIT_DB_ON_BOOT ?? row.pm2_env.INIT_DB_ON_BOOT) === 'false'
            && MANAGED.every(key => String(environment[key] ?? '') === String(app.env[key] ?? '')), 'academic_manager_failed');
          ownedIds.add(Number(row.pm_id));
        }
        return rows;
      }
      try { await call('start', app); }
      catch (_) { await adoptStarted(); throw failure('academic_manager_failed'); }
      const deadline = Date.now() + 30000;
      do {
        const rows = await adoptStarted();
        if (rows.length === 1 && rows[0].pm2_env?.status === 'online') { stopped = false; return true; }
        await new Promise(resolve => setTimeout(resolve, 200));
      } while (Date.now() < deadline);
      throw failure('academic_manager_failed');
    }
    const methods = {
      stop,
      async nodeEnvironment(environment) {
        insist(applied && environment && typeof environment === 'object' && !Array.isArray(environment), 'academic_context_invalid');
        const verified = await control.call({ action: 'verify' });
        insist(verified.ok && verified.backup_verified, 'academic_context_invalid');
        insist(Array.isArray(observed.listener_endpoints) && observed.listener_endpoints.length === 1, 'academic_route_invalid');
        const [host, port] = observed.listener_endpoints[0];
        insist(typeof host === 'string' && loopback(host) && Number.isInteger(port) && port >= 1 && port <= 65535, 'academic_route_invalid');
        const projected = structuredClone(environment);
        for (const key of MANAGED) projected[key] = '';
        projected.INIT_DB_ON_BOOT = 'false';
        projected.ACADEMIC_API_URL = 'http://' + (host.includes(':') ? '[' + host + ']' : host) + ':' + port;
        const urls = selectedAcademicUrls(nodeCwd, projected.ACADEMIC_API_URL);
        await routeEndpoint(urls, observed.listener_endpoints);
        return projected;
      },
      async apply() { const value = await control.call({ action: 'apply' }); applied = value.files_applied || value.configs_applied;
        insist(value.ok && value.backup_verified, 'academic_apply_failed'); return true; },
      async startNew() { insist(applied, 'academic_apply_failed'); return start(true); },
      async ready() {
        const currentNode = attestedNode ? await getNodeProcessId() : undefined;
        insist(!attestedNode || Number.isInteger(currentNode) && currentNode > 1, 'academic_ready_failed');
        const value = await control.call({ action: 'ready',
          ...(attestedNode ? { node_process_id: currentNode } : {}) }); insist(value.ok, 'academic_ready_failed');
        const readyFile = path.join(stage, 'academic-ready.json'), ready = privateJson(readyFile);
        insist(exact(ready, ['version', 'listener_endpoints', 'academic_url_environment']) && ready.version === 1, 'academic_ready_failed');
        fs.unlinkSync(readyFile);
        const configuration = privateJson(path.join(nodeCwd, '.lens-academic-private.json'), 8192,
          nodeOwnerPresent ? observed.node_owner : undefined);
        insist(exact(configuration, ['version', 'secret', 'workspace_root', 'log_root', 'upload_root']) && configuration.version === 1, 'academic_ready_failed');
        const urls = selectedAcademicUrls(nodeCwd, ready.academic_url_environment);
        const passed = await verifyAcademicRoute({ urls, listeners: ready.listener_endpoints, secret: configuration.secret });
        readyVerified = passed; return passed;
      },
      async restore() {
        let value;
        try { value = await control.call({ action: 'restore' }, 60000); insist(value.ok && value.rollback_completed, 'academic_restore_failed'); }
        catch (_) { await control.terminate(); value = await recover(stage, bundle); }
        restored = value.ok && value.rollback_completed; applied = !restored;
        insist(restored, 'academic_restore_failed'); return true;
      },
      async startOld() {
        await start(false);
        await independent(stage, bundle, '--old-ready', { action: 'old_ready', source_root: observed.source_root,
          cwd: observed.cwd, executable: observed.executable, manager_home: observed.pm2_home,
          listener_endpoints: observed.listener_endpoints });
        return true;
      },
      async close(options = {}) { insist(exact(options, []) || exact(options, ['committed']) && typeof options.committed === 'boolean', 'academic_cleanup_failed');
        if (options.committed === true) insist(applied && !restored && !stopped && readyVerified, 'academic_cleanup_failed');
        if (closed) return true; closed = true;
        try {
          if (!control.broken) { try { const value = await control.call({ action: 'close' }); insist(value.ok); } catch (_) { control.kill(); throw failure('academic_cleanup_failed'); } }
        } finally {
          try { await control.terminate(); } finally { disconnectManager(); }
        }
        return true; },
    };
    const opaque = Object.create(null);
    for (const [name, method] of Object.entries(methods)) Object.defineProperty(opaque, name, { value: async (...args) => {
      try { return await method(...args); } catch (error) { throw failure(error?.lensCode); }
    } });
    Object.defineProperty(opaque, 'toJSON', { value() { throw failure('academic_context_invalid'); } });
    Object.defineProperty(opaque, util.inspect.custom, { value() { return '<AcademicRelease redacted>'; } });
    return Object.freeze(opaque);
  } catch (error) {
    if (control) { try { await control.terminate(); } catch (_) {} }
    try { disconnectManager(); } catch (_) {}
    throw failure(error?.lensCode);
  }
}

module.exports = Object.freeze({ prepare, verifyAcademicRoute, selectedAcademicUrls });
