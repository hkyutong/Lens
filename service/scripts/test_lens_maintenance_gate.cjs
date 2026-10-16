'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {prepare} = require('./lens_maintenance_gate.cjs');
const {parseTokens, tokenizeNginx} = require('./lens_download_boundary.cjs');

const config = 'server {\n server_name lens.example.test;\n set $launch_gate 1;\n if ($launch_gate = 1) { return 503; }\n location / { proxy_pass http://127.0.0.1:19080; }\n}\n';

function fixture(t, source = config, overrides = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lens-maintenance-unit-')));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const file = path.join(root, 'site.conf'), bundle = path.join(root, 'backup');
  fs.writeFileSync(file, source, {mode: 0o640}); fs.mkdirSync(bundle, {mode: 0o700});
  const events = [];
  const options = {files: new Map([[file, source]]), runtime: {config: file}, hosts: ['lens.example.test'],
    parse: parseTokens, tokenize: tokenizeNginx, bundle, master: {},
    validate: () => { events.push('validate'); return true; },
    reload: () => events.push('reload'), waitForOpen: async () => { events.push('ready'); return true; }, ...overrides};
  return {file, bundle, events, create: () => prepare(options)};
}

test('backs up without opening, opens one setter, and restores exact bytes and permissions', async t => {
  const f = fixture(t), gate = f.create();
  assert.equal(gate.required, true); assert.equal(gate.verifyBackup(), true);
  assert.equal(fs.readFileSync(f.file, 'utf8'), config); assert.deepEqual(f.events, []);
  assert.deepEqual(JSON.parse(JSON.stringify(gate)), {required: true});
  await gate.open('synthetic-hash');
  assert.equal(fs.readFileSync(f.file, 'utf8'), config.replace('set $launch_gate 1;', 'set $launch_gate 0;'));
  assert.deepEqual(f.events, ['validate','reload','ready']);
  await gate.restore();
  assert.equal(fs.readFileSync(f.file, 'utf8'), config);
  assert.equal(fs.statSync(f.file).mode & 0o777, 0o640);
  assert.deepEqual(f.events, ['validate','reload','ready','validate','reload','ready']);
  assert.equal(fs.readdirSync(f.bundle).length, 1);
});

test('validation failure leaves a restorable snapshot', async t => {
  let checks = 0; const f = fixture(t, config, {validate: () => ++checks > 1}), gate = f.create();
  await assert.rejects(gate.open('synthetic-hash'), /maintenance_gate_failed/);
  await gate.restore(); assert.equal(fs.readFileSync(f.file, 'utf8'), config);
});

test('inspection verifies the candidate without changing configuration or creating backups', t => {
  const f = fixture(t, config, {inspectOnly: true});
  assert.deepEqual(f.create(), {required: true});
  assert.equal(fs.readFileSync(f.file, 'utf8'), config);
  assert.deepEqual(fs.readdirSync(f.bundle), []); assert.deepEqual(f.events, []);
});

test('frontend mismatch is restored before the caller rolls back the application', async t => {
  const f = fixture(t, config, {waitForOpen: async (_host, _hash, closed) => closed === true}), gate = f.create();
  await assert.rejects(gate.open('synthetic-hash'), /maintenance_gate_failed/);
  await gate.restore(); assert.equal(fs.readFileSync(f.file, 'utf8'), config);
});

test('concurrent edits are preserved and opening is rejected', async t => {
  const f = fixture(t), gate = f.create();
  fs.appendFileSync(f.file, '# independent operator edit\n');
  await assert.rejects(gate.open('synthetic-hash'), /maintenance_gate_failed/);
  assert.equal(fs.readFileSync(f.file, 'utf8'), config + '# independent operator edit\n');
  assert.deepEqual(f.events, []);
});

test('damaged backup prevents opening', async t => {
  const f = fixture(t), gate = f.create();
  fs.writeFileSync(path.join(f.bundle, 'nginx-maintenance-backup.json'), '{}');
  await assert.rejects(gate.open('synthetic-hash'), /maintenance_gate_failed/);
  assert.equal(fs.readFileSync(f.file, 'utf8'), config);
});

test('already open gate and sites without a gate remain unchanged', async t => {
  for (const source of [config.replace('set $launch_gate 1;', 'set $launch_gate 0;'), config.replace(/ set \$launch_gate 1;\n if[^\n]+\n/, '')]) {
    const f = fixture(t, source), gate = f.create();
    assert.equal(gate.required, false); await gate.open(); await gate.restore();
    assert.equal(fs.readFileSync(f.file, 'utf8'), source); assert.deepEqual(f.events, []);
    assert.deepEqual(fs.readdirSync(f.bundle), []);
  }
});

test('shared hosts, ambiguous setters and unsupported guard shapes are rejected', t => {
  for (const source of [
    config.replace('server_name lens.example.test;', 'server_name lens.example.test other.example.test;'),
    config.replace('set $launch_gate 1;', 'set $launch_gate 1;\n set $launch_gate 1;'),
    config.replace('$launch_gate = 1', '$launch_gate != 0'),
    config.replace('return 503;', 'return 503; set $unrelated 1;'),
    config + config,
  ]) assert.throws(() => fixture(t, source).create(), /maintenance_gate_failed/);
});

test('a misleading setter inside a comment cannot select a different change', t => {
  const source = config.replace(' set $launch_gate 1;', ' # set $launch_gate 1;\n set $launch_gate 1;');
  const f = fixture(t, source), gate = f.create();
  assert.equal(gate.required, true); assert.equal(fs.readFileSync(f.file, 'utf8'), source);
});
