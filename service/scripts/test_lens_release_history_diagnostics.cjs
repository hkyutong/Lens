const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const worker = ts.createSourceFile('worker.cjs', fs.readFileSync(path.join(__dirname, "lens_production_release_worker.cjs"), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const deploy = worker.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === '__deploy');
const statements = deploy.body.statements;
const index = statements.findIndex(node => ts.isTryStatement(node));
const body = statements[index].tryBlock.statements;
const historyIndex = body.findIndex(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(worker) === 'historyStep'));
assert.ok(historyIndex >= 0);
assert.ok(ts.isTryStatement(body[historyIndex + 1]));
const recoveryFailure = worker.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === '__historyRecoveryFailure');
const program = recoveryFailure.getText(worker) + '\n' + '(async () => {' + body[historyIndex].getText(worker) + body[historyIndex + 1].getText(worker) + '})()';
async function execute(failureStage) {
  const calls = [];
  const call = (stage, value) => {
    calls.push(stage);
    if (stage === failureStage) { const error = new Error('synthetic-private-diagnostic-value'); error.lensCode = 'synthetic-private-diagnostic-value'; throw error; }
    return value;
  };
  const sandbox = {
    context: { serviceCwd: '/synthetic/service' }, bundle: '/synthetic/backup/new',
    __path: path, __owner: () => 'synthetic-owner',
    __lensBackupInventory: { inventoryBackupNamespace: () => call('inventory', {ok: true, scan_complete: true, namespace_owned: true, unknown_entry_count: 0, unsafe_entry_count: 0, declared_verified_count: 1}) },
    __backupHistoryCoverage: async () => call('capture', () => true),
    __lensBackupCoverage: { inheritBackupHistory: async () => call('inherit', {committed: true}) },
    __lensStoredDatabaseCoverage: { verifyStoredRetentionHistoryMemoryRecovery: async () => call('recover', {verified: true}) },
    __lensHistoryRecoverySource: 'synthetic-decoder',
    __fail: code => { const error = new Error('release_failed'); error.lensCode = code; throw error; },
  };
  try { await vm.runInNewContext(program, sandbox); return calls; }
  catch (error) { error.calls = calls; throw error; }
}
for (const stage of ['inventory', 'capture', 'inherit', 'recover']) {
  test('history ' + stage + ' failure returns a fixed classification without private exception content', async () => {
    await assert.rejects(execute(stage), error => error.lensCode === ({inventory:'backup_history_inventory_failed',capture:'backup_history_capture_failed',inherit:'backup_history_inheritance_failed',recover:'backup_history_recovery_failed'})[stage] && error.message === 'release_failed' && !JSON.stringify(error).includes('synthetic-private-diagnostic-value'));
  });
}
test('successful history finalization preserves independent recovery order', async () => {
  assert.deepEqual(await execute(), ['inventory','capture','inherit','recover']);
});


require('node:test')('independent decoder shares the archive writer byte bound', () => {
  const fsLocal = require('node:fs');
  const pathLocal = require('node:path');
  const vmLocal = require('node:vm');
  const tsLocal = require('typescript');
  const assertLocal = require('node:assert/strict');
  const source = fsLocal.readFileSync(pathLocal.join(__dirname, 'lens_database_backup.cjs'), 'utf8');
  const parsed = tsLocal.createSourceFile('synthetic.cjs', source, tsLocal.ScriptTarget.Latest, true, tsLocal.ScriptKind.JS);
  const declaration = parsed.statements.find(node => tsLocal.isFunctionDeclaration(node) && node.name?.text === 'limits');
  assertLocal.ok(declaration);
  const body = tsLocal.createPrinter().printNode(tsLocal.EmitHint.Unspecified, declaration, parsed);
  const writerBound = vmLocal.runInNewContext(body + '; limits({}).maxBytes', { fault: () => { throw new Error('invalid synthetic limits'); } });
  const child = require('node:child_process').spawnSync('python3', ['-c',
    'import importlib.util,sys; s=importlib.util.spec_from_file_location("decoder",sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(m._MAX_BYTES)',
    pathLocal.join(__dirname, 'lens_retention_history_recovery.py')], { encoding: 'utf8' });
  assertLocal.equal(child.status, 0);
  assertLocal.match(child.stdout, /^\d+\s*$/);
  assertLocal.equal(Number(child.stdout), writerBound);
});
