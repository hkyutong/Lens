'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const util = require('node:util');
const bridge = require('./lens_academic_release.cjs');
const SECRET = 'synthetic-academic-bridge-secret-0123456789';

async function server(t, behavior = 'signed') {
  const counts = { requests: 0, signed: 0 };
  const instance = http.createServer((request, response) => {
    counts.requests++;
    if (behavior === 'redirect') { response.writeHead(302, { Location: 'http://127.0.0.1:1/synthetic-forbidden' }); return response.end(); }
    if (request.url === '/health') return response.end(JSON.stringify({ status: 'ready', service: 'academic-runtime', contract: 'lens-academic-v1' }));
    const h = request.headers;
    const canonical = ['GET', request.url, crypto.createHash('sha256').update('').digest('hex'), h['x-lens-academic-timestamp'],
      h['x-lens-academic-nonce'], h['x-lens-academic-owner'], h['x-lens-academic-request']].join('\n');
    const expected = crypto.createHmac('sha256', SECRET).update(canonical).digest('hex');
    const valid = h['x-lens-academic-signature'] === expected;
    if (valid) counts.signed++;
    response.statusCode = valid ? 404 : 401; response.end();
  });
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => instance.close(resolve)));
  const port = instance.address().port;
  return { urls: ['http://127.0.0.1:' + port], listeners: [['127.0.0.1', port]], secret: SECRET, counts };
}

test('real HTTP signed unknown report closes the selected route without user writes', async t => {
  const endpoint = await server(t);
  assert.equal(await bridge.verifyAcademicRoute(endpoint), true);
  assert.equal(endpoint.counts.requests, 4);
  assert.equal(endpoint.counts.signed, 1);
});
test('wrong loopback port and unsafe candidates fail before issuing HTTP', async t => {
  const endpoint = await server(t);
  const badPort = endpoint.listeners[0][1] === 65535 ? 1 : endpoint.listeners[0][1] + 1;
  await assert.rejects(bridge.verifyAcademicRoute({ ...endpoint, listeners: [['127.0.0.1', badPort]] }), /academic_route_invalid/);
  for (const bad of ['https://127.0.0.1/', 'http://example.invalid/', 'http://synthetic:password@127.0.0.1/', endpoint.urls[0] + '/unexpected'])
    await assert.rejects(bridge.verifyAcademicRoute({ ...endpoint, urls: [bad, endpoint.urls[0]] }), /academic_route_invalid/);
  assert.equal(endpoint.counts.requests, 0);
});
test('wrong shared secret and redirects do not produce a false route pass', async t => {
  const endpoint = await server(t);
  await assert.rejects(bridge.verifyAcademicRoute({ ...endpoint, secret: SECRET + '-incorrect' }), /academic_ready_failed/);
  const redirect = await server(t, 'redirect');
  await assert.rejects(bridge.verifyAcademicRoute(redirect), /academic_ready_failed/);
  assert.equal(redirect.counts.requests, 1);
});

async function fixture(t, mode = 'normal') {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'synthetic-academic-bridge-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const stage = path.join(base, 'stage'), bundle = path.join(base, 'bundle'), nodeCwd = path.join(base, 'node'), academic = path.join(base, 'academic');
  for (const directory of [stage, bundle, nodeCwd, academic]) fs.mkdirSync(directory, { mode: 0o700 });
  const endpoint = await server(t);
  const environment = { ACADEMIC_API_URL: endpoint.urls[0], OTHER: 'synthetic-preserved', INIT_DB_ON_BOOT: 'true',
    LENS_ACADEMIC_INTERNAL_SECRET: 'synthetic-old-secret-01234567890123456789',
    LENS_ACADEMIC_WORKSPACE_ROOT: '/synthetic/old/workspace', PATH_LOGGING: '/synthetic/old/logs',
    PATH_PRIVATE_UPLOAD: '/synthetic/old/uploads', ACADEMIC_TEMP_ROOT: '/synthetic/old/temp' };
  const original = { name: 'synthetic-academic', namespace: 'synthetic', pm_exec_path: path.join(academic, 'entry.py'),
    pm_cwd: academic, exec_interpreter: '/synthetic/python', args: ['synthetic-argument'], node_args: [],
    watch: false, instances: 1, status: 'online', env: environment };
  let row = { pid: 11, pm_id: 2, pm2_env: structuredClone(original) }, starts = 0;
  const mutations = [], pm2 = Object.freeze({ synthetic: true });
  async function pm2Call(target, method, argument) {
    assert.equal(target, pm2);
    if (method === 'list') return row ? [structuredClone(row)] : [];
    mutations.push({ method, argument: structuredClone(argument) });
    if (method === 'stop') { row.pid = 0; row.pm2_env.status = 'stopped'; return []; }
    if (method === 'delete') { row = null; return []; }
    if (method === 'start') {
      starts++;
      if (mode === 'start-failure' && starts === 1) throw new Error('synthetic private diagnostic must be discarded');
      row = { pid: 20 + starts, pm_id: 4 + starts, pm2_env: { ...structuredClone(original), ...structuredClone(argument),
        pm_exec_path: argument.script, pm_cwd: argument.cwd, status: 'online' } };
      if (mode === 'partial-start-failure' && starts === 1) throw new Error('synthetic private diagnostic must be discarded');
      return [row];
    }
    throw new Error('synthetic unexpected operation');
  }
  const contract = { version: 1, process_id: 11, pm2_id: '2', pm2_home: '/synthetic/manager', cwd: academic,
    executable: '/synthetic/python', arguments: ['/synthetic/python', 'entry.py'], source_root: academic, node_cwd: nodeCwd,
    clear_environment: ['LENS_ACADEMIC_INTERNAL_SECRET', 'LENS_ACADEMIC_WORKSPACE_ROOT', 'PATH_LOGGING', 'PATH_PRIVATE_UPLOAD', 'ACADEMIC_TEMP_ROOT'],
    listener_endpoints: endpoint.listeners, academic_url_environment: endpoint.urls[0] };
  fs.writeFileSync(path.join(stage, 'fixture.json'), JSON.stringify({ contract, mode }), { mode: 0o600 });
  const python = `import json,os,sys\nfrom pathlib import Path\nfixture=json.loads(Path('fixture.json').read_text())\ns=dict(ok=True,error='none',prepared=True,files_applied=False,configs_applied=False,backup_verified=True,rollback_completed=False,manual_intervention=False,changed_files=0)\ndef emit():\n print(json.dumps(s),flush=True)\nif '--recover' in sys.argv or '--old-ready' in sys.argv:\n s['rollback_completed']=True\n emit()\nelse:\n for line in sys.stdin:\n  action=json.loads(line)['action']\n  if action=='prepare':\n   p=Path('academic-control.json');p.write_text(json.dumps(fixture['contract']));p.chmod(0o600)\n  elif action=='apply':\n   if fixture['mode']=='controller-crash':os._exit(7)\n   s.update(files_applied=True,configs_applied=True,changed_files=7)\n  elif action=='ready':\n   p=Path('academic-ready.json');p.write_text(json.dumps(dict(version=1,listener_endpoints=fixture['contract']['listener_endpoints'],academic_url_environment=('http://127.0.0.1:1' if fixture['mode']=='wrong-node-route' else fixture['contract']['academic_url_environment']))));p.chmod(0o600)\n  elif action=='restore':s.update(files_applied=False,configs_applied=False,rollback_completed=True)\n  emit()\n  if action=='close':break\n`;
  fs.writeFileSync(path.join(stage, 'lens_academic_transaction.py'), python, { mode: 0o600 });
  const recovery = path.join(bundle, 'academic-recovery');
  fs.mkdirSync(recovery, { mode: 0o700 });
  fs.writeFileSync(path.join(recovery, 'lens_academic_transaction.py'), python, { mode: 0o600 });
  fs.copyFileSync(path.join(stage, 'fixture.json'), path.join(recovery, 'fixture.json'));

  const module = path.join(nodeCwd, 'dist/main.js');
  fs.mkdirSync(path.dirname(module), { recursive: true });
  fs.writeFileSync(module, `class Synthetic {\n normalizeAcademicBaseUrl(url) { return String(url || '').trim().replace(/\\/+$/, ''); }\n getAcademicBaseUrls() { const configured = String(process.env.ACADEMIC_API_URL || '').split(',').filter(Boolean).map(item => this.normalizeAcademicBaseUrl(item)); return configured.filter((url, index, rows) => rows.indexOf(url) === index); }\n}\n`);
  fs.writeFileSync(path.join(nodeCwd, '.lens-academic-private.json'), JSON.stringify({ version: 1, secret: SECRET,
    workspace_root: '/synthetic/new/workspaces', log_root: '/synthetic/new/logs', upload_root: '/synthetic/new/uploads' }), { mode: 0o600 });
  return { options: { stage, bundle, releaseId: 'abc01234'.repeat(4), nodeCwd,
    privateStorage: path.join(nodeCwd, 'private/attachments'), entries: [], pm2, pm2Call }, mutations, environment };
}
test('bridge lifecycle preserves old start and clears only managed environment on new start', async t => {
  const value = await fixture(t);
  const release = await bridge.prepare(value.options);
  assert.equal(util.inspect(release), '<AcademicRelease redacted>');
  assert.deepEqual(Object.keys(release), []);
  assert.throws(() => JSON.stringify(release), /academic_context_invalid/);
  await release.stop(); await release.apply(); await release.startNew(); await release.ready();
  await release.stop(); await release.restore(); await release.startOld(); await release.close();
  const starts = value.mutations.filter(item => item.method === 'start');
  assert.equal(starts.length, 2);
  assert.equal(starts[0].argument.env.LENS_ACADEMIC_INTERNAL_SECRET, '');
  assert.equal(starts[0].argument.env.ACADEMIC_TEMP_ROOT, '');
  assert.equal(starts[0].argument.env.OTHER, 'synthetic-preserved');
  assert.equal(starts[1].argument.env.LENS_ACADEMIC_INTERNAL_SECRET, value.environment.LENS_ACADEMIC_INTERNAL_SECRET);
  assert.equal(starts[1].argument.env.ACADEMIC_TEMP_ROOT, value.environment.ACADEMIC_TEMP_ROOT);
  assert.ok(starts.every(item => item.argument.env.INIT_DB_ON_BOOT === 'false'));
});
test('controller crash falls back to independent recovery before old start', async t => {
  const value = await fixture(t, 'controller-crash');
  const release = await bridge.prepare(value.options);
  await release.stop();
  await assert.rejects(release.apply(), /academic_controller_failed/);
  await release.restore(); await release.startOld(); await release.close();
  assert.equal(value.mutations.filter(item => item.method === 'start').length, 1);
});
test('failed new manager start can recover and restore original startup environment', async t => {
  const value = await fixture(t, 'start-failure');
  const release = await bridge.prepare(value.options);
  await release.stop(); await release.apply();
  await assert.rejects(release.startNew(), /academic_manager_failed/);
  await release.stop(); await release.restore(); await release.startOld(); await release.close();
  const last = value.mutations.filter(item => item.method === 'start').at(-1).argument;
  assert.equal(last.env.OTHER, value.environment.OTHER);
  assert.equal(last.env.INIT_DB_ON_BOOT, 'false');
});
test('selection executes attested methods with only the projected environment key', async t => {
  const value = await fixture(t);
  const url = value.environment.ACADEMIC_API_URL;
  assert.deepEqual(bridge.selectedAcademicUrls(value.options.nodeCwd, ' ' + url + '/,' + url), [url]);
});

test('partially successful manager start is owned and stopped before rollback', async t => {
  const value = await fixture(t, 'partial-start-failure');
  const release = await bridge.prepare(value.options);
  await release.stop(); await release.apply();
  await assert.rejects(release.startNew(), /academic_manager_failed/);
  await release.stop(); await release.restore(); await release.startOld(); await release.close();
  const newStart = value.mutations.findIndex(item => item.method === 'start');
  const nextStop = value.mutations.findIndex((item, index) => index > newStart && item.method === 'stop');
  assert.ok(newStart >= 0 && nextStop > newStart);
  assert.equal(value.mutations[nextStop].argument, 5);
});
test('prepare identity mismatch never stops or deletes any manager row', async t => {
  const value = await fixture(t);
  const fixturePath = path.join(value.options.stage, 'fixture.json');
  const synthetic = JSON.parse(fs.readFileSync(fixturePath));
  synthetic.contract.process_id = 999;
  fs.writeFileSync(fixturePath, JSON.stringify(synthetic), { mode: 0o600 });
  await assert.rejects(bridge.prepare(value.options), /academic_context_invalid/);
  assert.equal(value.mutations.length, 0);
});
test('later fallback candidates do not invalidate a verified first target', async t => {
  const endpoint = await server(t);
  assert.equal(await bridge.verifyAcademicRoute({ ...endpoint, urls: [...endpoint.urls, 'http://example.invalid/'] }), true);
  assert.equal(endpoint.counts.requests, 4);
});

test('new Node environment derives one route from observed listener without mutating old environment', async t => {
  const value = await fixture(t);
  const release = await bridge.prepare(value.options);
  await assert.rejects(release.nodeEnvironment(value.environment), /academic_context_invalid/);
  await release.stop(); await release.apply();
  const projected = await release.nodeEnvironment(value.environment);
  assert.notEqual(projected, value.environment);
  assert.equal(projected.OTHER, value.environment.OTHER);
  assert.equal(projected.ACADEMIC_API_URL, value.environment.ACADEMIC_API_URL);
  assert.equal(projected.LENS_ACADEMIC_INTERNAL_SECRET, '');
  assert.equal(projected.INIT_DB_ON_BOOT, 'false');
  assert.equal(value.environment.INIT_DB_ON_BOOT, 'true');
  await release.restore(); await release.startOld(); await release.close();
});
test('ready rejects new Node route drift even when Python health is green', async t => {
  const value = await fixture(t, 'wrong-node-route');
  const release = await bridge.prepare(value.options);
  await release.stop(); await release.apply(); await release.startNew();
  await assert.rejects(release.ready(), /academic_route_invalid/);
  await release.stop(); await release.restore(); await release.startOld(); await release.close();
});

test('controller and stage loss recover and attest old runtime through persisted toolkit', async t => {
  const value = await fixture(t, 'controller-crash');
  const release = await bridge.prepare(value.options);
  await release.stop();
  await assert.rejects(release.apply(), /academic_controller_failed/);
  fs.rmSync(value.options.stage, { recursive: true });
  await release.restore(); await release.startOld(); await release.close();
  assert.equal(value.mutations.filter(item => item.method === 'start').length, 1);
});
