'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const util = require('node:util');
const { createRequire } = require('node:module');
const { test } = require('node:test');

function core(overrideFs) {
  const file = path.join(__dirname, 'lens_database_backup.cjs');
  const realRequire = createRequire(file);
  const localRequire = specifier => overrideFs && ['fs/promises', 'node:fs/promises'].includes(specifier)
    ? overrideFs : realRequire(specifier);
  const context = { require: localRequire, module: { exports: {} }, Buffer };
  vm.runInNewContext(fs.readFileSync(file, 'utf8') + '\n' +
    fs.readFileSync(path.join(__dirname, 'lens_stored_database_coverage.cjs'), 'utf8') +
    '\nmodule.exports.codec={canonicalRow,rowHash,digest,limits};', context);
  return context.module.exports;
}

const api = core();
const columns = [{ name: 'id', type: 'int', charset: null },
  { name: 'value', type: 'text', charset: 'utf8mb4' }];
const create = 'CREATE TABLE `synthetic` (`id` int PRIMARY KEY, `value` text) ENGINE=InnoDB AUTO_INCREMENT=2';

async function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-history-test-'));
  fs.chmodSync(root, 0o700);
  let ordinal = 0;
  function database(values, options = {}) {
    const directory = path.join(root, 'snapshot-' + ordinal++);
    fs.mkdirSync(directory, { mode: 0o700 });
    const lines = values.map(row => api.codec.canonicalRow(row));
    const content = lines.length ? lines.join('\n') + '\n' : '';
    const table = { name: 'synthetic', columns: options.columns || columns,
      create: options.create || create, file: 'table-0.jsonl',
      fileHash: api.codec.digest(content), rowCount: lines.length,
      rowHash: api.codec.rowHash(lines) };
    const manifest = { version: 1, database: options.database || 'synthetic',
      databaseFingerprint: options.fingerprint || 'a'.repeat(64),
      bounds: api.codec.limits({}), tables: [table], rowCount: lines.length };
    fs.writeFileSync(path.join(directory, table.file), content, { mode: 0o600 });
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest), { mode: 0o600 });
    return directory;
  }
  function destination() {
    const directory = path.join(root, 'archive-' + ordinal++);
    fs.mkdirSync(directory, { mode: 0o700 });
    return directory;
  }
  function requireFeature() {
    assert.equal(typeof api.prepareStoredRetentionHistory, 'function');
    assert.equal(typeof api.verifyStoredRetentionHistory, 'function');
  }
  try { requireFeature(); await run({ root, database, destination }); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}

async function prepare(currentDirectory, olderDirectories, destinationDirectory) {
  return api.prepareStoredRetentionHistory({ currentDirectory, olderDirectories, destinationDirectory });
}

async function coverage(directory, currentDirectory, sourceDirectory, row, count = 1) {
  const proof = await api.verifyStoredRetentionHistory({ directory, currentDirectory });
  const source = await api.loadStoredForRetention(sourceDirectory);
  const table = source.tables.get('synthetic');
  return proof.covers({ table: 'synthetic', structure: table.structure,
    row: api.codec.digest(api.codec.canonicalRow(row)), count });
}

test('retains changed historical values without changing either source', async () => fixture(async f => {
  const current = f.database([[1, 'new']]), older = f.database([[1, 'old']]), destination = f.destination();
  const before = fs.readFileSync(path.join(older, 'table-0.jsonl'));
  const report = await prepare(current, [older], destination);
  assert.equal(report.archivedRowVersionCount, 1);
  assert.equal(await coverage(destination, current, older, [1, 'old']), true);
  assert.equal(await coverage(destination, current, older, [1, 'unpreserved']), false);
  assert.deepEqual(fs.readFileSync(path.join(older, 'table-0.jsonl')), before);
}));

test('deduplicates the same historical value across snapshots', async () => fixture(async f => {
  const current = f.database([[1, 'new']]), a = f.database([[1, 'old']]), b = f.database([[1, 'old']]);
  const report = await prepare(current, [a, b], f.destination());
  assert.equal(report.archivedRowVersionCount, 1);
  assert.equal(report.archivedRowCount, 1);
}));

test('preserves row multiplicity rather than only membership', async () => fixture(async f => {
  const row = [1, 'same'], current = f.database([row]), old = f.database([row, row]);
  const destination = f.destination(), report = await prepare(current, [old], destination);
  assert.equal(report.archivedRowCount, 1);
  assert.equal(await coverage(destination, current, old, row, 2), true);
  assert.equal(await coverage(destination, current, old, row, 3), false);
}));

test('retains all supported cell types with their exact canonical representation', async () => fixture(async f => {
  const types = ['int', 'blob', 'bigint', 'datetime', 'text', 'tinyint', 'double'];
  const typedColumns = types.map((type, i) => ({ name: 'c' + i, type, charset: null }));
  const typedCreate = 'CREATE TABLE `synthetic` (' + types.map((type, i) => '`c' + i + '` ' + type).join(', ') + ')';
  const row = [null, Buffer.from([0, 128, 255]), BigInt('9007199254740993'),
    new Date('2024-01-01T00:00:00.000Z'), 'synthetic-old-secret', false, -0];
  const current = f.database([], { columns: typedColumns, create: typedCreate });
  const older = f.database([row], { columns: typedColumns, create: typedCreate });
  const destination = f.destination(), report = await prepare(current, [older], destination);
  assert.equal(await coverage(destination, current, older, row), true);
  assert.equal(JSON.stringify(report).includes('synthetic-old-secret'), false);
  const proof = await api.verifyStoredRetentionHistory({ directory: destination, currentDirectory: current });
  assert.equal(util.inspect(proof).includes('synthetic-old-secret'), false);
}));

test('does not archive unchanged data for a sequence-only schema difference', async () => fixture(async f => {
  const current = f.database([[1, 'same']]), older = f.database([[1, 'same']], { create: create.replace('=2', '=1') });
  const destination = f.destination(), report = await prepare(current, [older], destination);
  assert.equal(report.archivedRowVersionCount, 0);
  assert.equal(await coverage(destination, current, older, [1, 'same']), true);
}));

test('does not normalize AUTO_INCREMENT text inside a quoted default', async () => fixture(async f => {
  const sql = create.replace('`value` text', "`value` text DEFAULT ' AUTO_INCREMENT=12 '");
  const current = f.database([[1, 'same']], { create: sql });
  const older = f.database([[1, 'same']], { create: sql.replace("DEFAULT ' AUTO_INCREMENT=12 '", "DEFAULT ' AUTO_INCREMENT=13 '") });
  const report = await prepare(current, [older], f.destination());
  assert.equal(report.archivedRowVersionCount, 1);
}));

test('preserves older schema alongside a genuinely changed column type', async () => fixture(async f => {
  const current = f.database([[1, 'same']]), older = f.database([[1, 'same']], {
    create: create.replace('`value` text', '`value` varchar(20)'),
    columns: [columns[0], { name: 'value', type: 'varchar(20)', charset: 'utf8mb4' }],
  });
  const destination = f.destination(), report = await prepare(current, [older], destination);
  assert.equal(report.archivedRowVersionCount, 1);
  assert.equal(await coverage(destination, current, older, [1, 'same']), true);
}));

test('binds the archive to the exact current snapshot', async () => fixture(async f => {
  const current = f.database([[1, 'new']]), older = f.database([[1, 'old']]), destination = f.destination();
  await prepare(current, [older], destination);
  const different = f.database([[1, 'different']]);
  await assert.rejects(api.verifyStoredRetentionHistory({ directory: destination, currentDirectory: different }));
}));

test('rejects corrupt source data before writing an archive', async () => fixture(async f => {
  const current = f.database([]), older = f.database([[1, 'old']]), destination = f.destination();
  fs.appendFileSync(path.join(older, 'table-0.jsonl'), 'corrupt');
  await assert.rejects(prepare(current, [older], destination));
  assert.deepEqual(fs.readdirSync(destination), []);
}));

test('rejects a source with another database identity', async () => fixture(async f => {
  const current = f.database([]), older = f.database([[1, 'old']], { fingerprint: 'b'.repeat(64) });
  await assert.rejects(prepare(current, [older], f.destination()));
}));

test('never overwrites an existing archive', async () => fixture(async f => {
  const current = f.database([]), older = f.database([[1, 'old']]), destination = f.destination();
  await prepare(current, [older], destination);
  const names = fs.readdirSync(destination), before = fs.readFileSync(path.join(destination, names[0]));
  await assert.rejects(prepare(current, [older], destination));
  assert.deepEqual(fs.readFileSync(path.join(destination, names[0])), before);
}));

test('never changes the current backup directory in place', async () => fixture(async f => {
  const current = f.database([]), older = f.database([[1, 'old']]);
  const names = fs.readdirSync(current);
  await assert.rejects(prepare(current, [older], current));
  assert.deepEqual(fs.readdirSync(current), names);
}));

test('rejects unsafe destination permissions', async () => fixture(async f => {
  const current = f.database([]), destination = f.destination();
  fs.chmodSync(destination, 0o777);
  await assert.rejects(prepare(current, [], destination));
  assert.deepEqual(fs.readdirSync(destination), []);
}));

test('rejects tampering and unsafe archive permissions', async () => fixture(async f => {
  const current = f.database([]), older = f.database([[1, 'old']]), destination = f.destination();
  await prepare(current, [older], destination);
  const file = path.join(destination, fs.readdirSync(destination)[0]);
  fs.chmodSync(file, 0o644);
  await assert.rejects(api.verifyStoredRetentionHistory({ directory: destination, currentDirectory: current }));
  fs.chmodSync(file, 0o600);
  fs.appendFileSync(file, 'corrupt');
  await assert.rejects(api.verifyStoredRetentionHistory({ directory: destination, currentDirectory: current }));
}));

test('rejects a symbolic link in place of an archive', async () => fixture(async f => {
  const current = f.database([]), older = f.database([[1, 'old']]), destination = f.destination();
  await prepare(current, [older], destination);
  const file = path.join(destination, fs.readdirSync(destination)[0]), copy = path.join(f.root, 'copy');
  fs.renameSync(file, copy);
  fs.symlinkSync(copy, file);
  await assert.rejects(api.verifyStoredRetentionHistory({ directory: destination, currentDirectory: current }));
}));

test('carries older archived values into a new archive', async () => fixture(async f => {
  const first = f.database([[1, 'middle']]), oldest = f.database([[1, 'oldest']]), firstArchive = f.destination();
  await prepare(first, [oldest], firstArchive);
  const name = fs.readdirSync(firstArchive)[0];
  fs.copyFileSync(path.join(firstArchive, name), path.join(first, name));
  fs.chmodSync(path.join(first, name), 0o600);
  const current = f.database([[1, 'newest']]), destination = f.destination();
  const report = await prepare(current, [first], destination);
  assert.equal(report.archivedRowVersionCount, 2);
  assert.equal(await coverage(destination, current, oldest, [1, 'oldest']), true);
  assert.equal(await coverage(destination, current, first, [1, 'middle']), true);
}));

test('removes a partially written new archive on an I/O failure', async () => fixture(async f => {
  const current = f.database([]), older = f.database([[1, 'old']]), destination = f.destination();
  let injected = false;
  const filesystem = new Proxy(fs.promises, { get(target, key) {
    if (key !== 'open') return target[key];
    return async (...args) => {
      const descriptor = await target.open(...args);
      if (args[1] !== 'wx') return descriptor;
      injected = true;
      return { stat: (...values) => descriptor.stat(...values), close: () => descriptor.close(),
        writeFile: async () => { await descriptor.writeFile('partial'); throw new Error('synthetic_io_failure'); } };
    };
  } });
  const isolated = core(filesystem);
  await assert.rejects(isolated.prepareStoredRetentionHistory({ currentDirectory: current,
    olderDirectories: [older], destinationDirectory: destination }));
  assert.equal(injected, true);
  assert.deepEqual(fs.readdirSync(destination), []);
  assert.equal(fs.existsSync(path.join(older, 'table-0.jsonl')), true);
}));

test('rejects a valid JSON rewrite that changes an archived value', async () => fixture(async f => {
  const current = f.database([]), older = f.database([[1, 'old']]), destination = f.destination();
  await prepare(current, [older], destination);
  const file = path.join(destination, fs.readdirSync(destination)[0]);
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  value.tables[0].rows[0].data = api.codec.canonicalRow([1, 'changed']);
  fs.writeFileSync(file, JSON.stringify(value) + '\n', { mode: 0o600 });
  await assert.rejects(api.verifyStoredRetentionHistory({ directory: destination, currentDirectory: current }));
}));

test('proves a complete source snapshot including its previous history', async () => fixture(async f => {
  const middle = f.database([[1, 'middle']]), oldest = f.database([[1, 'oldest']]);
  const firstArchive = f.destination();
  await prepare(middle, [oldest], firstArchive);
  const name = fs.readdirSync(firstArchive)[0];
  fs.copyFileSync(path.join(firstArchive, name), path.join(middle, name));
  fs.chmodSync(path.join(middle, name), 0o600);
  const current = f.database([[1, 'current']]), destination = f.destination();
  await prepare(current, [middle], destination);
  const proof = await api.verifyStoredRetentionHistory({ directory: destination, currentDirectory: current });
  assert.equal(typeof proof.coversSnapshot, 'function');
  assert.equal(await proof.coversSnapshot(await api.loadStoredForRetention(middle), middle), true);
}));

test('a current snapshot without an archive cannot cover unpreserved old history', async () => fixture(async f => {
  const middle = f.database([[1, 'same']]), oldest = f.database([[1, 'oldest']]);
  const firstArchive = f.destination();
  await prepare(middle, [oldest], firstArchive);
  const name = fs.readdirSync(firstArchive)[0];
  fs.copyFileSync(path.join(firstArchive, name), path.join(middle, name));
  fs.chmodSync(path.join(middle, name), 0o600);
  const current = f.database([[1, 'same']]);
  const proof = await api.verifyStoredRetentionHistory({ directory: current, currentDirectory: current, optional: true });
  assert.equal(await proof.coversSnapshot(await api.loadStoredForRetention(middle), middle), false);
}));

test('retains a historical empty table definition with a different structure', async () => fixture(async f => {
  const current = f.database([]), older = f.database([], { create: create.replace('`value` text', '`value` varchar(20)'),
    columns: [columns[0], { name: 'value', type: 'varchar(20)', charset: 'utf8mb4' }] });
  const destination = f.destination(), report = await prepare(current, [older], destination);
  assert.equal(report.archivedSchemaCount, 1);
  const proof = await api.verifyStoredRetentionHistory({ directory: destination, currentDirectory: current });
  assert.equal(await proof.coversSnapshot(await api.loadStoredForRetention(older), older), true);
}));
