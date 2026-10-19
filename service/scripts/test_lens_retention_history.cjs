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


async function withHistoryTransactionFixture(action, overrides) {
  await fixture(async fixture => {
    const oldDirectory = fixture.database([[1, 'new']]);
    const currentDirectory = fixture.database([[1, 'old']]);
    const destinationDirectory = fixture.destination();
    const transactionCore = core(overrides ? { ...require('node:fs').promises, ...overrides } : undefined);
    require('node:assert/strict').equal(typeof transactionCore.commitStoredRetentionHistory, 'function');
    await action({ core: transactionCore, fixture, oldDirectory, currentDirectory, destinationDirectory,
      anotherCurrent: () => fixture.database([[1, 'old']]) });
  });
}

test('commits historical rows beside the current database and removes staging files', async () => {
  await withHistoryTransactionFixture(async ({ core, oldDirectory, currentDirectory, destinationDirectory }) => {
    const io = require('node:fs');
    const p = require('node:path');
    const check = require('node:assert/strict');
    const before = io.readdirSync(currentDirectory).sort();
    const result = await core.commitStoredRetentionHistory({ currentDirectory,
      olderDirectories: [oldDirectory], destinationDirectory });
    check.equal(result.committed, true);
    const proof = await core.verifyStoredRetentionHistory({ directory: currentDirectory, currentDirectory });
    check.equal(await proof.coversSnapshot(await core.loadStoredForRetention(oldDirectory), oldDirectory), true);
    check.deepEqual(io.readdirSync(destinationDirectory), []);
    check.deepEqual(io.readdirSync(currentDirectory).sort(), [...before, 'retention-history.json'].sort());
    check.equal(io.statSync(p.join(currentDirectory, 'retention-history.json')).mode & 0o777, 0o600);
  });
});

test('keeps the previous archive when installation fails', async () => {
  let failRename = false;
  await withHistoryTransactionFixture(async ({ core, oldDirectory, currentDirectory, destinationDirectory }) => {
    const io = require('node:fs'), p = require('node:path'), check = require('node:assert/strict');
    await core.commitStoredRetentionHistory({ currentDirectory, olderDirectories: [oldDirectory], destinationDirectory });
    const previous = io.readFileSync(p.join(currentDirectory, 'retention-history.json'));
    failRename = true;
    await check.rejects(core.commitStoredRetentionHistory({ currentDirectory,
      olderDirectories: [oldDirectory], destinationDirectory }), /retention history transaction failed/);
    check.deepEqual(io.readFileSync(p.join(currentDirectory, 'retention-history.json')), previous);
    check.deepEqual(io.readdirSync(destinationDirectory), []);
  }, { rename: async (...args) => {
    if (failRename) throw new Error('synthetic rename failure');
    return require('node:fs').promises.rename(...args);
  }});
});

test('restores the previous archive after installed content fails verification', async () => {
  let corruptInstall = false;
  await withHistoryTransactionFixture(async ({ core, oldDirectory, currentDirectory, destinationDirectory }) => {
    const io = require('node:fs'), p = require('node:path'), check = require('node:assert/strict');
    await core.commitStoredRetentionHistory({ currentDirectory, olderDirectories: [oldDirectory], destinationDirectory });
    const previous = io.readFileSync(p.join(currentDirectory, 'retention-history.json'));
    corruptInstall = true;
    await check.rejects(core.commitStoredRetentionHistory({ currentDirectory,
      olderDirectories: [oldDirectory], destinationDirectory }), /retention history transaction failed/);
    check.deepEqual(io.readFileSync(p.join(currentDirectory, 'retention-history.json')), previous);
    await core.verifyStoredRetentionHistory({ directory: currentDirectory, currentDirectory });
    check.deepEqual(io.readdirSync(destinationDirectory), []);
  }, { rename: async (from, to) => {
    const io = require('node:fs');
    await io.promises.rename(from, to);
    if (corruptInstall && require('node:path').basename(from) === 'retention-history.json') {
      corruptInstall = false;
      io.writeFileSync(to, '{}');
    }
  }});
});

test('restores an absent archive after first installation fails verification', async () => {
  await withHistoryTransactionFixture(async ({ core, oldDirectory, currentDirectory, destinationDirectory }) => {
    const io = require('node:fs'), p = require('node:path'), check = require('node:assert/strict');
    await check.rejects(core.commitStoredRetentionHistory({ currentDirectory,
      olderDirectories: [oldDirectory], destinationDirectory }), /retention history transaction failed/);
    check.equal(io.existsSync(p.join(currentDirectory, 'retention-history.json')), false);
    check.equal(io.existsSync(p.join(currentDirectory, '.retention-history.lock')), false);
    check.deepEqual(io.readdirSync(destinationDirectory), []);
  }, { rename: async (from, to) => {
    const io = require('node:fs');
    await io.promises.rename(from, to);
    if (require('node:path').basename(from) === 'retention-history.json') io.writeFileSync(to, '{}');
  }});
});

test('leaves an existing transaction lock untouched', async () => {
  await withHistoryTransactionFixture(async ({ core, oldDirectory, currentDirectory, destinationDirectory }) => {
    const io = require('node:fs'), p = require('node:path'), check = require('node:assert/strict');
    const lock = p.join(currentDirectory, '.retention-history.lock');
    io.writeFileSync(lock, 'synthetic lock', { mode: 0o600 });
    await check.rejects(core.commitStoredRetentionHistory({ currentDirectory,
      olderDirectories: [oldDirectory], destinationDirectory }), /retention history transaction failed/);
    check.equal(io.readFileSync(lock, 'utf8'), 'synthetic lock');
    check.equal(io.existsSync(p.join(currentDirectory, 'retention-history.json')), false);
    check.deepEqual(io.readdirSync(destinationDirectory), []);
  });
});

test('carries earlier historical rows through a later backup generation', async () => {
  await withHistoryTransactionFixture(async ({ core, oldDirectory, currentDirectory, destinationDirectory, anotherCurrent }) => {
    const check = require('node:assert/strict');
    const oldest = await core.loadStoredForRetention(oldDirectory);
    await core.commitStoredRetentionHistory({ currentDirectory,
      olderDirectories: [oldDirectory], destinationDirectory });
    const nextDirectory = anotherCurrent();
    await core.commitStoredRetentionHistory({ currentDirectory: nextDirectory,
      olderDirectories: [currentDirectory], destinationDirectory });
    const proof = await core.verifyStoredRetentionHistory({ directory: nextDirectory, currentDirectory: nextDirectory });
    check.equal(await proof.coversSnapshot(oldest, oldDirectory), true);
    check.equal(await proof.coversSnapshot(await core.loadStoredForRetention(currentDirectory), currentDirectory), true);
  });
});


test('preserves an unexpected replacement and the independent rollback copy', async () => {
  let replaceInstalled = false;
  await withHistoryTransactionFixture(async ({ core, oldDirectory, currentDirectory, destinationDirectory }) => {
    const io = require('node:fs'), p = require('node:path'), check = require('node:assert/strict');
    await core.commitStoredRetentionHistory({ currentDirectory, olderDirectories: [oldDirectory], destinationDirectory });
    const previous = io.readFileSync(p.join(currentDirectory, 'retention-history.json'));
    replaceInstalled = true;
    await check.rejects(core.commitStoredRetentionHistory({ currentDirectory,
      olderDirectories: [oldDirectory], destinationDirectory }), /retention history recovery required/);
    check.equal(io.readFileSync(p.join(currentDirectory, 'retention-history.json'), 'utf8'), 'synthetic replacement');
    check.deepEqual(io.readFileSync(p.join(destinationDirectory, '.retention-history.previous')), previous);
    check.equal(io.existsSync(p.join(currentDirectory, '.retention-history.lock')), false);
  }, { rename: async (from, to) => {
    const io = require('node:fs').promises;
    await io.rename(from, to);
    if (replaceInstalled && require('node:path').basename(from) === 'retention-history.json') {
      replaceInstalled = false;
      await io.unlink(to);
      await io.writeFile(to, 'synthetic replacement', { flag: 'wx', mode: 0o600 });
    }
  }});
});

test('removes its own partial lock after a write failure', async () => {
  await withHistoryTransactionFixture(async ({ core, oldDirectory, currentDirectory, destinationDirectory }) => {
    const io = require('node:fs'), p = require('node:path'), check = require('node:assert/strict');
    await check.rejects(core.commitStoredRetentionHistory({ currentDirectory,
      olderDirectories: [oldDirectory], destinationDirectory }), /retention history transaction failed/);
    check.equal(io.existsSync(p.join(currentDirectory, '.retention-history.lock')), false);
    check.deepEqual(io.readdirSync(destinationDirectory), []);
  }, { open: async (...args) => {
    const handle = await require('node:fs').promises.open(...args);
    if (require('node:path').basename(args[0]) !== '.retention-history.lock') return handle;
    return new Proxy(handle, { get(target, key) {
      if (key === 'writeFile') return async () => { throw new Error('synthetic lock write failure'); };
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    }});
  }});
});

test('reports recovery when a created lock cannot be identified', async () => {
  await withHistoryTransactionFixture(async ({ core, oldDirectory, currentDirectory, destinationDirectory }) => {
    const io = require('node:fs'), p = require('node:path'), check = require('node:assert/strict');
    await check.rejects(core.commitStoredRetentionHistory({ currentDirectory,
      olderDirectories: [oldDirectory], destinationDirectory }), /retention history recovery required/);
    check.equal(io.existsSync(p.join(currentDirectory, '.retention-history.lock')), true);
    check.deepEqual(io.readdirSync(destinationDirectory), []);
  }, { open: async (...args) => {
    const handle = await require('node:fs').promises.open(...args);
    if (require('node:path').basename(args[0]) !== '.retention-history.lock') return handle;
    return new Proxy(handle, { get(target, key) {
      if (key === 'stat') return async () => { throw new Error('synthetic identity failure'); };
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    }});
  }});
});


test('rejects malformed transaction input with a fixed public error', async () => {
  const check = require('node:assert/strict');
  const engine = core();
  for (const input of [undefined, null, {},
    { currentDirectory: 7, olderDirectories: [], destinationDirectory: 'synthetic' },
    { currentDirectory: 'synthetic', olderDirectories: [null], destinationDirectory: 'synthetic' }]) {
    await check.rejects(engine.commitStoredRetentionHistory(input), error =>
      error && error.message === 'retention history transaction failed');
  }
});


test('allocates and removes an independent history staging directory', async () => {
  await withHistoryTransactionFixture(async ({ core, oldDirectory, currentDirectory }) => {
    const io = require('node:fs'), p = require('node:path'), check = require('node:assert/strict');
    await core.commitStoredRetentionHistory({ currentDirectory, olderDirectories: [oldDirectory] });
    const proof = await core.verifyStoredRetentionHistory({ directory: currentDirectory, currentDirectory });
    check.equal(await proof.coversSnapshot(await core.loadStoredForRetention(oldDirectory), oldDirectory), true);
    check.deepEqual(io.readdirSync(p.dirname(currentDirectory)).filter(name => name.startsWith('.lens-retention-history-')), []);
  });
});

test('removes automatic staging after an installation failure', async () => {
  let failInstall = false;
  await withHistoryTransactionFixture(async ({ core, oldDirectory, currentDirectory }) => {
    const io = require('node:fs'), p = require('node:path'), check = require('node:assert/strict');
    await core.commitStoredRetentionHistory({ currentDirectory, olderDirectories: [oldDirectory] });
    const previous = io.readFileSync(p.join(currentDirectory, 'retention-history.json'));
    failInstall = true;
    await check.rejects(core.commitStoredRetentionHistory({ currentDirectory,
      olderDirectories: [oldDirectory] }), /retention history transaction failed/);
    check.deepEqual(io.readFileSync(p.join(currentDirectory, 'retention-history.json')), previous);
    check.deepEqual(io.readdirSync(p.dirname(currentDirectory)).filter(name => name.startsWith('.lens-retention-history-')), []);
  }, { rename: async (...args) => {
    if (failInstall) throw new Error('synthetic install failure');
    return require('node:fs').promises.rename(...args);
  }});
});

test('preserves automatic staging when independent recovery is required', async () => {
  let replaceInstall = false;
  await withHistoryTransactionFixture(async ({ core, oldDirectory, currentDirectory }) => {
    const io = require('node:fs'), p = require('node:path'), check = require('node:assert/strict');
    await core.commitStoredRetentionHistory({ currentDirectory, olderDirectories: [oldDirectory] });
    const previous = io.readFileSync(p.join(currentDirectory, 'retention-history.json'));
    replaceInstall = true;
    await check.rejects(core.commitStoredRetentionHistory({ currentDirectory,
      olderDirectories: [oldDirectory] }), /retention history recovery required/);
    const stages = io.readdirSync(p.dirname(currentDirectory)).filter(name => name.startsWith('.lens-retention-history-'));
    check.equal(stages.length, 1);
    check.deepEqual(io.readFileSync(p.join(p.dirname(currentDirectory), stages[0], '.retention-history.previous')), previous);
    check.equal(io.readFileSync(p.join(currentDirectory, 'retention-history.json'), 'utf8'), 'synthetic replacement');
  }, { rename: async (from, to) => {
    const io = require('node:fs').promises;
    await io.rename(from, to);
    if (replaceInstall && require('node:path').basename(from) === 'retention-history.json') {
      replaceInstall = false;
      await io.unlink(to);
      await io.writeFile(to, 'synthetic replacement', { flag: 'wx', mode: 0o600 });
    }
  }});
});

test('independent memory recovery needs no original historical snapshots', async () => {
  await withHistoryTransactionFixture(async ({ core: transactionCore, oldDirectory, currentDirectory, destinationDirectory }) => {
    await transactionCore.commitStoredRetentionHistory({ currentDirectory, olderDirectories: [oldDirectory], destinationDirectory });
    const source = fs.readFileSync(path.join(__dirname, 'lens_retention_history_recovery.py'), 'utf8');
    fs.rmSync(oldDirectory, { recursive: true });
    const receipt = await transactionCore.verifyStoredRetentionHistoryMemoryRecovery({
      directory: currentDirectory, currentDirectory, decoderSource: source });
    assert.equal(receipt.verified, true);
    assert.ok(receipt.rowVersionCount > 0);
    assert.ok(receipt.sourceCount > 0);
  });
});

test('memory recovery rejects a decoder returning unapproved fields', async () => {
  await withHistoryTransactionFixture(async ({ core: transactionCore, oldDirectory, currentDirectory, destinationDirectory }) => {
    await transactionCore.commitStoredRetentionHistory({ currentDirectory, olderDirectories: [oldDirectory], destinationDirectory });
    await assert.rejects(transactionCore.verifyStoredRetentionHistoryMemoryRecovery({
      directory: currentDirectory, currentDirectory,
      decoderSource: 'import json; print(json.dumps({"ok":True,"synthetic-private":"synthetic"}))',
    }), /retention history recovery verification failed/);
  });
});
