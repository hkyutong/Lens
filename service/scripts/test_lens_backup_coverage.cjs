'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { prepareBackupCoverage, createFileBackupVerifier } = require('./lens_backup_coverage.cjs');
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
