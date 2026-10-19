'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, 'lens_production_release_worker.cjs'), 'utf8');
const parsed = ts.createSourceFile('synthetic-worker.cjs', source, ts.ScriptTarget.Latest, true);
const functions = ['__lensControl', '__backupHistoryCoverage', '__historyRecoveryFacts'].map(name =>
  parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === name).getText(parsed));

async function exercise(mode, { auditOk = true, commitFails = false, recoverFails = false } = {}) {
  const events = [];
  const receipts = [];
  let result;
  const context = {
    process: { stdout: { write() {} }, stderr: { write() {} } },
    globalThis: { __lensCapture: () => ({ serviceCwd: '/synthetic/lens/service' }) },
    __lensRequest: { mode, expected_backups: 2, expected_unverified: 1 },
    __lensHistoryRecoverySource: "synthetic decoder source",
    __path: path,
    __owner: () => 'synthetic-owner',
    __lensEmit(value) { result = value; },
    __lensBackupCoverage: {
      async prepareBackupCoverage() {
        const receipt = () => false;
        receipts.push(receipt);
        events.push('prepare');
        return receipt;
      },
      async commitBackupHistory(receipt) {
        assert.equal(receipt, receipts[0]);
        events.push('commit');
        if (commitFails) throw new Error('synthetic failure');
        return { committed: true, cleanupComplete: true };
      },
      async recoverBackupHistory(receipt) {
        assert.equal(receipt, receipts.at(-1));
        events.push('recover');
        if (recoverFails) throw new Error('synthetic failure');
        return { verified: true, schemaCount: 1, rowVersionCount: 2, rowCount: 2, sourceCount: 2 };
      },
      createFileBackupVerifier() { return () => true; },
    },
    __lensStoredDatabaseCoverage: {},
    __lensFileBackupVerifierFactory: {},
    __lensBackupInventory: { inventoryBackupNamespace() {} },
    __lensBackupRetention: {
      auditAndRetainBackups(options) {
        assert.equal(options.proveCoverage, receipts.at(-1));
        events.push(options.cleanup ? 'cleanup' : 'audit');
        return { ok: auditOk, metadata_rejected_count: 0, unsafe_candidate_count: 0,
          referenced_candidate_count: 0, coverage_database_invalid_count: 0 };
      },
    },
  };
  const invoke = vm.runInNewContext(functions.join('\n') + '\n__lensControl', context);
  await invoke();
  return { result, events };
}

test('history commit is explicit and re-audits with a new receipt', async () => {
  const { result, events } = await exercise('backup_history_commit');
  assert.deepEqual(events, ['prepare', 'audit', 'commit', 'prepare', 'audit']);
  assert.equal(result.history_committed, true);
  assert.equal(result.history_cleanup_complete, true);
});

test('default audit never commits or deletes history', async () => {
  const { result, events } = await exercise('backup_retention_audit');
  assert.equal(result.ok, true);
  assert.deepEqual(events, ['prepare', 'audit']);
});

test('failed preflight cannot commit history', async () => {
  const { result, events } = await exercise('backup_history_commit', { auditOk: false });
  assert.equal(result.ok, false);
  assert.deepEqual(events, ['prepare', 'audit']);
});

test('failed commit never proceeds to cleanup', async () => {
  const { result, events } = await exercise('backup_history_commit', { commitFails: true });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'history_commit_failed');
  assert.deepEqual(events, ['prepare', 'audit', 'commit']);
});


test('explicit memory recovery never commits or deletes history', async () => {
  const { result, events } = await exercise('backup_history_recovery');
  assert.deepEqual(events, ['prepare', 'audit', 'recover']);
  assert.equal(result.history_memory_recovery_verified, true);
  assert.equal(result.history_archived_row_count, 2);
});

test('failed memory recovery blocks all cleanup', async () => {
  const { result, events } = await exercise('backup_retention_cleanup', { recoverFails: true });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'history_recovery_failed');
  assert.deepEqual(events, ['prepare', 'recover', 'audit']);
});
