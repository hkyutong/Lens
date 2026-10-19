'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { prepareBackupCoverage, createFileBackupVerifier, commitBackupHistory, inheritBackupHistory, recoverBackupHistory } = require('./lens_backup_coverage.cjs');
const { auditAndRetainBackups } = require('./lens_backup_retention.cjs');

const privateModule = { exports: {} };
new Function('require', 'module',
  fs.readFileSync(path.join(__dirname, 'lens_database_backup.cjs'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, 'lens_stored_database_coverage.cjs'), 'utf8') +
  '\nmodule.exports.codec = { digest, rowHash, canonicalRow, limits };')(require, privateModule);
const core = privateModule.exports;
const roles = { control: 'control.json', verified: 'verified.json', database: 'database',
  files: ['control.json', 'verified.json', 'config.json'], directories: ['dependencies'] };
const write = (file, value) => fs.writeFileSync(file,
  typeof value === 'string' ? value : JSON.stringify(value), { mode: 0o600 });

function database(directory, values) {
  fs.mkdirSync(directory, { mode: 0o700 });
  const lines = values.map(value => core.codec.canonicalRow([value]));
  const content = lines.length ? lines.join('\n') + '\n' : '';
  const table = { name: 'synthetic_records', columns: [{ name: 'value', type: 'varchar', charset: 'utf8mb4' }],
    create: 'CREATE TABLE synthetic_records (value varchar(255))', file: 'table-0.jsonl',
    fileHash: core.codec.digest(content), rowCount: lines.length, rowHash: core.codec.rowHash(lines) };
  write(path.join(directory, table.file), content);
  write(path.join(directory, 'manifest.json'), { version: 1, database: 'synthetic_database',
    databaseFingerprint: 'a'.repeat(64), tables: [table], rowCount: lines.length, bounds: core.codec.limits({}) });
}

function fixture(fn) {
  return async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-coverage-synthetic-'));
    try {
      const older = path.join(root, 'older'), latest = path.join(root, 'latest');
      for (const dir of [older, latest]) {
        fs.mkdirSync(dir, { mode: 0o700 });
        write(path.join(dir, roles.control), { version: 1, project: 'synthetic_owner' });
      }
      write(path.join(latest, roles.verified), { version: 1, project: 'synthetic_owner', bundle_verified: true });
      await fn({ root, older, latest });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  };
}

function snapshot(directory) {
  const entries = new Map();
  function visit(relative = '') {
    for (const name of fs.readdirSync(path.join(directory, relative))) {
      const child = path.join(relative, name), stat = fs.lstatSync(path.join(directory, child), { bigint: true });
      entries.set(child, { directory: stat.isDirectory(), symlink: stat.isSymbolicLink(),
        identity: [stat.dev, stat.ino, stat.mode, stat.uid, stat.nlink, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(':') });
      if (stat.isDirectory()) visit(child);
    }
  }
  visit(); return { directory, entries };
}

async function proof({ root, older, latest }) {
  const prove = await prepareBackupCoverage({ namespace: root, owner: 'synthetic_owner', roles, databaseCore: core });
  return prove({ candidate: snapshot(older), retained: snapshot(latest) });
}

test('database rows covered by a newer snapshot permit known historical artifacts', fixture(async f => {
  database(path.join(f.older, roles.database), ['old']);
  database(path.join(f.latest, roles.database), ['old', 'new']);
  write(path.join(f.older, 'config.json'), { version: 'synthetic_old' });
  write(path.join(f.latest, 'config.json'), { version: 'synthetic_current' });
  assert.equal(await proof(f), true);
}));
test('unique business row remains protected', fixture(async f => {
  database(path.join(f.older, roles.database), ['unique']); database(path.join(f.latest, roles.database), ['new']);
  assert.equal(await proof(f), false);
}));
test('duplicate row multiplicity remains protected', fixture(async f => {
  database(path.join(f.older, roles.database), ['same', 'same']); database(path.join(f.latest, roles.database), ['same']);
  assert.equal(await proof(f), false);
}));
test('unknown business file remains protected', fixture(async f => {
  database(path.join(f.older, roles.database), []); database(path.join(f.latest, roles.database), []);
  write(path.join(f.older, 'unknown.txt'), 'synthetic_unique'); assert.equal(await proof(f), false);
}));
test('partial deployment without a database contains only recognized historical artifacts', fixture(async f => {
  database(path.join(f.latest, roles.database), []);
  write(path.join(f.older, 'config.json'), { version: 'synthetic_old' }); assert.equal(await proof(f), true);
}));
test('database file tampering invalidates proof', fixture(async f => {
  database(path.join(f.older, roles.database), ['same']); database(path.join(f.latest, roles.database), ['same']);
  write(path.join(f.older, roles.database, 'table-0.jsonl'), 'invalid'); assert.equal(await proof(f), false);
}));
test('a change after proof preparation invalidates the bound snapshot', fixture(async f => {
  database(path.join(f.older, roles.database), ['same']); database(path.join(f.latest, roles.database), ['same']);
  const prove = await prepareBackupCoverage({ namespace: f.root, owner: 'synthetic_owner', roles, databaseCore: core });
  write(path.join(f.older, roles.database, 'table-0.jsonl'), 'changed');
  assert.equal(prove({ candidate: snapshot(f.older), retained: snapshot(f.latest) }), false);
}));
test('unlisted database files remain protected', fixture(async f => {
  database(path.join(f.older, roles.database), []); database(path.join(f.latest, roles.database), []);
  write(path.join(f.older, roles.database, 'extra.json'), {}); assert.equal(await proof(f), false);
}));
test('metadata symlinks cannot authorize a candidate', fixture(async f => {
  database(path.join(f.latest, roles.database), []);
  fs.unlinkSync(path.join(f.older, roles.control));
  fs.symlinkSync(path.join(f.latest, roles.control), path.join(f.older, roles.control));
  assert.equal(await proof(f), false);
}));

test('content proof permits deletion while preserving the verified bundle', fixture(async f => {
  database(path.join(f.older, roles.database), ['same']);
  database(path.join(f.latest, roles.database), ['same', 'new']);
  write(path.join(f.older, 'config.json'), { version: 'synthetic_old' });
  write(path.join(f.latest, 'config.json'), { version: 'synthetic_latest' });
  const proveCoverage = await prepareBackupCoverage({ namespace: f.root, owner: 'synthetic_owner', roles, databaseCore: core });
  const inventory = () => {
    const count = fs.readdirSync(f.root).filter(name => fs.lstatSync(path.join(f.root, name)).isDirectory()).length;
    return { ok: true, scan_complete: true, namespace_owned: true, backup_directory_count: count,
      declared_verified_count: 1, owned_unverified_count: count - 1, unknown_entry_count: 0,
      unsafe_entry_count: 0, sole_verified_backup: count === 1 };
  };
  const result = auditAndRetainBackups({ namespace: f.root, owner: 'synthetic_owner', inventory,
    cleanup: true, expectedBackups: 2, expectedUnverified: 1, proveCoverage });
  assert.equal(result.ok, true);
  assert.equal(result.removed_count, 1);
  assert.equal(result.sole_verified_backup, true);
  assert.equal(fs.existsSync(f.latest), true);
}));

test('existing file transaction backups require independent verification and the approved policy', () => {
  const source = fs.readFileSync(path.join(__dirname, 'lens_release_transaction.py'), 'utf8');
  const script = `import json,sys,tempfile,inspect,shutil
task_data=json.load(sys.stdin)
exec(compile(task_data['source'], '<synthetic-core>', 'exec'),globals())
task_root=Path(tempfile.mkdtemp(prefix='lens-file-coverage-synthetic-')).resolve()
try:
    task_source=task_root/'source'; task_target=task_root/'target'; task_bundle=task_root/'backup'
    task_bundle.mkdir(mode=0o700)
    for task_dir in (task_source,task_target):
        (task_dir/'public').mkdir(parents=True)
    (task_source/'public'/'index.html').write_text('synthetic_after')
    (task_target/'public'/'index.html').write_text('synthetic_before')
    task_roots=('public',)
    task_baseline=capture_baseline(task_target,['public/index.html'],artifact_roots=task_roots)
    task_plan=prepare_release_plan(task_source,task_target,[ManifestEntry('public/index.html','public/index.html')],release_id='a'*32,baseline=task_baseline,backup_root=task_bundle,artifact_roots=task_roots,source_artifact_roots=task_roots)
    task_result=execute_release(task_plan)
    if not task_result.ok: raise ValueError('synthetic_prepare_failed')
    print(json.dumps({'ok':True,'root':str(task_root),'bundle':str(task_bundle),'policy':{'artifact_roots':task_roots,'protected_roots':inspect.signature(prepare_release_plan).parameters['protected_roots'].default}}))
except BaseException:
    shutil.rmtree(task_root,ignore_errors=True)
    print(json.dumps({'ok':False}))
`;
  const made = spawnSync('python3', ['-c', script], { input: JSON.stringify({ source }), encoding: 'utf8' });
  let f;
  try {
    f = JSON.parse(made.stdout);
    assert.equal(f.ok, true, 'synthetic transaction must prepare successfully');
    assert.equal(createFileBackupVerifier({ source, policy: f.policy })(f.bundle), true);
    assert.equal(createFileBackupVerifier({ source, policy: { ...f.policy, artifact_roots: ['other'] } })(f.bundle), false);
    fs.writeFileSync(path.join(f.bundle, 'unexpected.txt'), 'synthetic_unknown');
    assert.equal(createFileBackupVerifier({ source, policy: f.policy })(f.bundle), false);
  } finally { if (f?.root) fs.rmSync(f.root, { recursive: true, force: true }); }
});


test('accepts complete historical rows only after they are archived in the retained backup', fixture(async context => {
  const { older, latest } = context;
  const oldDatabase = path.join(older, roles.database), currentDatabase = path.join(latest, roles.database);
  database(oldDatabase, ['historical']);
  database(currentDatabase, ['current']);
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-history-coverage-'));
  try {
    await core.prepareStoredRetentionHistory({ currentDirectory: currentDatabase,
      olderDirectories: [oldDatabase], destinationDirectory: staging });
    const archive = fs.readdirSync(staging)[0];
    fs.copyFileSync(path.join(staging, archive), path.join(currentDatabase, archive));
    fs.chmodSync(path.join(currentDatabase, archive), 0o600);
    assert.equal(await proof(context), true);
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
}));

test('refuses to discard history stored only in the older backup', fixture(async context => {
  const { older, latest } = context;
  const oldDatabase = path.join(older, roles.database), currentDatabase = path.join(latest, roles.database);
  database(oldDatabase, ['same']);
  database(currentDatabase, ['same']);
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-history-coverage-'));
  try {
    const origin = path.join(workspace, 'origin'), staging = path.join(workspace, 'archive');
    database(origin, ['historical']);
    fs.mkdirSync(staging, { mode: 0o700 });
    await core.prepareStoredRetentionHistory({ currentDirectory: oldDatabase,
      olderDirectories: [origin], destinationDirectory: staging });
    const archive = fs.readdirSync(staging)[0];
    fs.copyFileSync(path.join(staging, archive), path.join(oldDatabase, archive));
    fs.chmodSync(path.join(oldDatabase, archive), 0o600);
    assert.equal(await proof(context), false);
  } finally { fs.rmSync(workspace, { recursive: true, force: true }); }
}));


test('requires a captured coverage context before writing history', async () => {
  const check = require('node:assert/strict');
  const api = require('./lens_backup_coverage.cjs');
  check.equal(typeof api.commitBackupHistory, 'function');
  await check.rejects(api.commitBackupHistory({}), /backup history context invalid/);
});


async function historyCoverage(context) {
  return prepareBackupCoverage({ namespace: context.root,
    owner: JSON.parse(fs.readFileSync(path.join(context.latest, roles.control), 'utf8')).project,
    roles, databaseCore: core });
}

test('explicit history commit rechecks and preserves unique synthetic rows', fixture(async context => {
  database(path.join(context.older, roles.database), ['synthetic-history-only']);
  database(path.join(context.latest, roles.database), ['synthetic-current-only']);
  const before = snapshot(context.root);
  const coverage = await historyCoverage(context);
  assert.deepEqual(snapshot(context.root), before, 'inspection must remain read only');
  assert.equal(coverage({ candidate: snapshot(context.older), retained: snapshot(context.latest) }), false);
  assert.deepEqual(await commitBackupHistory(coverage),
    { committed: true, noHistoryRequired: false, cleanupComplete: true });
  assert.equal(await proof(context), true);
  await assert.rejects(commitBackupHistory(coverage), /backup history context invalid/);
}));

test('history commit rejects a changed source snapshot', fixture(async context => {
  const older = path.join(context.older, roles.database);
  database(older, ['synthetic-original']);
  database(path.join(context.latest, roles.database), ['synthetic-current']);
  const coverage = await historyCoverage(context);
  fs.rmSync(older, { recursive: true });
  database(older, ['synthetic-replacement']);
  await assert.rejects(commitBackupHistory(coverage), /backup history context changed/);
  await assert.rejects(commitBackupHistory(coverage), /backup history context invalid/);
}));

test('history commit rejects partial database inspection', fixture(async context => {
  database(path.join(context.older, roles.database), ['synthetic-broken']);
  database(path.join(context.latest, roles.database), ['synthetic-current']);
  const files = fs.readdirSync(path.join(context.older, roles.database));
  for (const file of files) fs.writeFileSync(path.join(context.older, roles.database, file), 'invalid synthetic data');
  const coverage = await historyCoverage(context);
  assert.equal(coverage.facts.coverage_database_invalid_count, 1);
  await assert.rejects(commitBackupHistory(coverage), /backup history context invalid/);
}));

test('history commit rejects failed metadata inspection', fixture(async context => {
  database(path.join(context.older, roles.database), ['synthetic-old']);
  database(path.join(context.latest, roles.database), ['synthetic-current']);
  fs.writeFileSync(path.join(context.older, roles.control), 'invalid synthetic metadata');
  const coverage = await historyCoverage(context);
  await assert.rejects(commitBackupHistory(coverage), /backup history context invalid/);
}));


test('new backup inherits current archive and earlier row versions', fixture(async context => {
  database(path.join(context.older, roles.database), ['synthetic-first-generation']);
  database(path.join(context.latest, roles.database), ['synthetic-second-generation']);
  await commitBackupHistory(await historyCoverage(context));
  const next = path.join(context.root, 'synthetic-next-generation');
  fs.mkdirSync(next, { mode: 0o700 });
  fs.copyFileSync(path.join(context.older, roles.control), path.join(next, roles.control));
  database(path.join(next, roles.database), ['synthetic-third-generation']);
  const coverage = await historyCoverage(context);
  await assert.rejects(inheritBackupHistory(coverage, context.root), /backup history context invalid/);
  const receipt = await inheritBackupHistory(coverage, path.join(next, roles.database));
  assert.equal(receipt.committed, true);
  fs.copyFileSync(path.join(context.latest, roles.verified), path.join(next, roles.verified));
  fs.unlinkSync(path.join(context.latest, roles.verified));
  const nextCoverage = await historyCoverage(context);
  assert.equal(nextCoverage({ candidate: snapshot(context.older), retained: snapshot(next) }), true);
  assert.equal(nextCoverage({ candidate: snapshot(context.latest), retained: snapshot(next) }), true);
}));

test('unknown layout facts distinguish links without authorizing deletion', fixture(async context => {
  database(path.join(context.older, roles.database), ['synthetic-same']);
  database(path.join(context.latest, roles.database), ['synthetic-same']);
  fs.symlinkSync('synthetic-missing', path.join(context.older, 'synthetic-link'));
  const coverage = await historyCoverage(context);
  assert.equal(coverage({ candidate: snapshot(context.older), retained: snapshot(context.latest) }), false);
  assert.equal(coverage.facts.coverage_unknown_symlink_count, 1);
  assert.equal(coverage.facts.coverage_unknown_regular_file_count, 0);
}));

test('identical unrecognized files remain covered by the verified backup', fixture(async context => {
  database(path.join(context.older, roles.database), ['synthetic-same']);
  database(path.join(context.latest, roles.database), ['synthetic-same']);
  for (const directory of [context.older, context.latest]) {
    write(path.join(directory, 'synthetic-unrecognized-file'), 'synthetic-identical-content');
    fs.mkdirSync(path.join(directory, 'synthetic-unrecognized-directory'), { mode: 0o700 });
    write(path.join(directory, 'synthetic-unrecognized-directory', 'synthetic-nested-file'), 'synthetic-identical-nested-content');
  }
  assert.equal(await proof(context), true);
}));

test('unrecognized content differences cannot be hidden by database coverage', fixture(async context => {
  database(path.join(context.older, roles.database), ['synthetic-same']);
  database(path.join(context.latest, roles.database), ['synthetic-same']);
  write(path.join(context.older, 'synthetic-unrecognized-file'), 'synthetic-old-content');
  write(path.join(context.latest, 'synthetic-unrecognized-file'), 'synthetic-new-content');
  assert.equal(await proof(context), false);
}));

test('unrecognized directory content must exist in the verified backup', fixture(async context => {
  database(path.join(context.older, roles.database), ['synthetic-same']);
  database(path.join(context.latest, roles.database), ['synthetic-same']);
  for (const directory of [context.older, context.latest]) fs.mkdirSync(path.join(directory, 'synthetic-unrecognized-directory'), { mode: 0o700 });
  write(path.join(context.older, 'synthetic-unrecognized-directory', 'synthetic-only-old-file'), 'synthetic-content');
  assert.equal(await proof(context), false);
}));


test("unknown file changed during hashing cannot obtain coverage", fixture(async context => {
  database(path.join(context.older, roles.database), ["synthetic-row"]);
  database(path.join(context.latest, roles.database), ["synthetic-row"]);
  const name = "synthetic-unknown.txt";
  for (const directory of [context.older, context.latest]) write(path.join(directory, name), "synthetic-content");
  const coverage = await historyCoverage(context);
  const candidate = snapshot(context.older), retained = snapshot(context.latest);
  const original = fs.readSync;
  let changed = false;
  fs.readSync = function (...args) {
    const length = original.apply(this, args);
    if (!changed && length > 0) {
      changed = true;
      write(path.join(context.older, name), "synthetic-replaced");
    }
    return length;
  };
  try {
    assert.equal(coverage({ candidate, retained }), false);
    assert.equal(changed, true);
  } finally { fs.readSync = original; }
}));

test("unknown file mutation invalidates cached hash coverage", fixture(async context => {
  database(path.join(context.older, roles.database), ["synthetic-row"]);
  database(path.join(context.latest, roles.database), ["synthetic-row"]);
  const name = "synthetic-unknown.txt";
  for (const directory of [context.older, context.latest]) write(path.join(directory, name), "synthetic-content");
  const coverage = await historyCoverage(context);
  const candidate = snapshot(context.older), retained = snapshot(context.latest);
  assert.equal(coverage({ candidate, retained }), true);
  write(path.join(context.latest, name), "synthetic-replaced");
  assert.equal(coverage({ candidate, retained }), false);
  assert.equal(coverage({ candidate: snapshot(context.older), retained: snapshot(context.latest) }), false);
}));


test("private history preserves different file versions after originals are removed", fixture(async context => {
  database(path.join(context.older, roles.database), ["synthetic-older"]);
  database(path.join(context.latest, roles.database), ["synthetic-current"]);
  write(path.join(context.older, "synthetic-version.txt"), "synthetic-older-file");
  write(path.join(context.latest, "synthetic-version.txt"), "synthetic-current-file");
  assert.equal(await proof(context), false);
  await commitBackupHistory(await historyCoverage(context));
  assert.equal(await proof(context), true);
  fs.rmSync(context.older, { recursive: true });
  const source = fs.readFileSync(path.join(__dirname, 'lens_retention_history_recovery.py'), 'utf8');
  const receipt = await recoverBackupHistory(await historyCoverage(context), source);
  assert.equal(receipt.verified, true);
}));

test("private history preserves unknown directories and empty directories", fixture(async context => {
  database(path.join(context.older, roles.database), ["synthetic-row"]);
  database(path.join(context.latest, roles.database), ["synthetic-row"]);
  fs.mkdirSync(path.join(context.older, 'synthetic-folder'), { mode: 0o700 });
  fs.mkdirSync(path.join(context.older, 'synthetic-empty'), { mode: 0o700 });
  write(path.join(context.older, 'synthetic-folder', 'synthetic.bin'), Buffer.from([0, 255, 1]).toString('base64'));
  await commitBackupHistory(await historyCoverage(context));
  assert.equal(await proof(context), true);
}));

test("private file history is inherited across a new complete backup", fixture(async context => {
  database(path.join(context.older, roles.database), ["synthetic-older"]);
  database(path.join(context.latest, roles.database), ["synthetic-current"]);
  write(path.join(context.older, 'synthetic-history.txt'), 'synthetic-older-file');
  await commitBackupHistory(await historyCoverage(context));
  const next = path.join(context.root, 'synthetic-next');
  fs.mkdirSync(next, { mode: 0o700 });
  fs.copyFileSync(path.join(context.older, roles.control), path.join(next, roles.control));
  database(path.join(next, roles.database), ['synthetic-next-row']);
  await inheritBackupHistory(await historyCoverage(context), path.join(next, roles.database));
  fs.copyFileSync(path.join(context.latest, roles.verified), path.join(next, roles.verified));
  fs.unlinkSync(path.join(context.latest, roles.verified));
  fs.rmSync(context.older, { recursive: true });
  const coverage = await historyCoverage(context);
  assert.equal(coverage({ candidate: snapshot(context.latest), retained: snapshot(next) }), true);
  const decoderSource = fs.readFileSync(path.join(__dirname, 'lens_retention_history_recovery.py'), 'utf8');
  assert.equal((await recoverBackupHistory(coverage, decoderSource)).verified, true);
}));

test("a source file changed after capture prevents archive submission", fixture(async context => {
  database(path.join(context.older, roles.database), ['synthetic-row']);
  database(path.join(context.latest, roles.database), ['synthetic-row']);
  const file = path.join(context.older, 'synthetic-input.txt');
  write(file, 'synthetic-before');
  const coverage = await historyCoverage(context);
  write(file, 'synthetic-after');
  await assert.rejects(commitBackupHistory(coverage), /backup history context changed/);
}));

test("unknown symbolic links cannot be committed into private file history", fixture(async context => {
  database(path.join(context.older, roles.database), ['synthetic-row']);
  database(path.join(context.latest, roles.database), ['synthetic-row']);
  fs.symlinkSync('synthetic-missing', path.join(context.older, 'synthetic-link'));
  await assert.rejects(commitBackupHistory(await historyCoverage(context)), /backup history context invalid/);
}));

test("a late artifact change rolls back the previous private archive", fixture(async context => {
  const currentDirectory = path.join(context.latest, roles.database);
  const olderDirectory = path.join(context.older, roles.database);
  database(olderDirectory, ['synthetic-before']);
  database(currentDirectory, ['synthetic-current']);
  await core.commitStoredRetentionHistory({ currentDirectory, olderDirectories: [olderDirectory] });
  const before = new Map(fs.readdirSync(currentDirectory).map(name => [name, fs.readFileSync(path.join(currentDirectory, name))]));
  const content = Buffer.from('synthetic-new-file');
  const artifact = { name: 'synthetic.txt', kind: 'file', mode: 0o600,
    sha256: core.codec.digest(content), data: content.toString('base64') };
  let visits = 0;
  await assert.rejects(core.commitStoredRetentionHistory({ currentDirectory, olderDirectories: [olderDirectory],
    artifacts: [artifact], assertArtifactsUnchanged: () => ++visits < 3 }), /retention history transaction failed/);
  assert.equal(visits, 3);
  assert.deepEqual(new Map(fs.readdirSync(currentDirectory).map(name => [name, fs.readFileSync(path.join(currentDirectory, name))])), before);
}));


test("a source file added after capture prevents archive submission", fixture(async context => {
  database(path.join(context.older, roles.database), ['synthetic-row']);
  database(path.join(context.latest, roles.database), ['synthetic-row']);
  const coverage = await historyCoverage(context);
  write(path.join(context.older, 'synthetic-added.txt'), 'synthetic-added');
  await assert.rejects(commitBackupHistory(coverage), /backup history context changed/);
}));

test("an excessive unknown source file cannot be archived", fixture(async context => {
  database(path.join(context.older, roles.database), ['synthetic-row']);
  database(path.join(context.latest, roles.database), ['synthetic-row']);
  const file = path.join(context.older, 'synthetic-large.bin');
  write(file, '');
  fs.truncateSync(file, 16777217);
  await assert.rejects(commitBackupHistory(await historyCoverage(context)), /backup history context invalid/);
}));


test("malformed private file history cannot change the previous archive", fixture(async context => {
  const currentDirectory = path.join(context.latest, roles.database);
  const olderDirectory = path.join(context.older, roles.database);
  database(olderDirectory, ['synthetic-before']);
  database(currentDirectory, ['synthetic-current']);
  await core.commitStoredRetentionHistory({ currentDirectory, olderDirectories: [olderDirectory] });
  const before = new Map(fs.readdirSync(currentDirectory).map(name => [name, fs.readFileSync(path.join(currentDirectory, name))]));
  const bytes = Buffer.from('synthetic-data');
  const valid = { name: 'synthetic.txt', kind: 'file', mode: 0o600,
    sha256: core.codec.digest(bytes), data: bytes.toString('base64') };
  for (const update of [{ name: '../synthetic' }, { name: '/synthetic' }, { sha256: '0'.repeat(64) },
      { mode: 0o666 }, { data: 'AA===' }, { unexpected: true }]) {
    await assert.rejects(core.commitStoredRetentionHistory({ currentDirectory,
      olderDirectories: [olderDirectory], artifacts: [{ ...valid, ...update }] }), /retention history transaction failed/);
    assert.deepEqual(new Map(fs.readdirSync(currentDirectory).map(name => [name, fs.readFileSync(path.join(currentDirectory, name))])), before);
  }
}));


test("archive durability failure preserves the previous complete history", fixture(async context => {
  const currentDirectory = path.join(context.latest, roles.database);
  const olderDirectory = path.join(context.older, roles.database);
  database(olderDirectory, ['synthetic-before']);
  database(currentDirectory, ['synthetic-current']);
  await core.commitStoredRetentionHistory({ currentDirectory, olderDirectories: [olderDirectory] });
  const before = new Map(fs.readdirSync(currentDirectory).map(name => [name, fs.readFileSync(path.join(currentDirectory, name))]));
  const original = fs.promises.open;
  let injected = false;
  fs.promises.open = async function (...args) {
    const handle = await original.apply(this, args);
    if (typeof args[1] === 'string' && args[1].includes('w')) {
      handle.sync = async () => { injected = true; throw new Error('synthetic-durability-fault'); };
    }
    return handle;
  };
  try {
    await assert.rejects(core.commitStoredRetentionHistory({ currentDirectory, olderDirectories: [olderDirectory] }), /retention history transaction failed/);
    assert.equal(injected, true);
    assert.deepEqual(new Map(fs.readdirSync(currentDirectory).map(name => [name, fs.readFileSync(path.join(currentDirectory, name))])), before);
  } finally { fs.promises.open = original; }
}));
