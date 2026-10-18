'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { inventoryBackupNamespace } = require('./lens_backup_inventory.cjs');

const owner = 'synthetic-project';
const expectedKeys = [
  'ok', 'namespace_owned', 'scan_complete', 'backup_directory_count',
  'declared_verified_count', 'owned_unverified_count', 'unknown_entry_count',
  'unsafe_entry_count', 'sole_verified_backup', 'error',
].sort();

function fixture(run) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lens-backup-test-')));
  const namespace = path.join(root, 'backups');
  fs.mkdirSync(namespace, { mode: 0o700 });
  const write = (directory, file, value) => fs.writeFileSync(
    path.join(directory, file), JSON.stringify(value), { mode: 0o600 },
  );
  write(namespace, 'owner.json', { version: 1, project: owner });
  const backup = (name, verified) => {
    const directory = path.join(namespace, name);
    fs.mkdirSync(directory, { mode: 0o700 });
    write(directory, 'control.json', { version: 1, project: owner });
    if (verified !== undefined) {
      write(directory, 'verified.json', { version: 1, project: owner, bundle_verified: verified });
    }
    return directory;
  };
  try { return run({ root, namespace, write, backup }); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}

function snapshot(root) {
  const rows = [];
  const visit = directory => {
    for (const name of fs.readdirSync(directory).sort()) {
      const item = path.join(directory, name);
      const stat = fs.lstatSync(item);
      rows.push([path.relative(root, item), stat.mode, stat.size,
        stat.isFile() ? crypto.createHash('sha256').update(fs.readFileSync(item)).digest('hex') : null]);
      if (stat.isDirectory()) visit(item);
    }
  };
  visit(root);
  return rows;
}

test('counts one declared verified backup without changing its files', () => fixture(({ namespace, backup }) => {
  backup('release-a', true);
  const before = snapshot(namespace);
  const result = inventoryBackupNamespace(namespace, owner);
  assert.deepEqual(Object.keys(result).sort(), expectedKeys);
  assert.equal(result.ok, true);
  assert.equal(result.scan_complete, true);
  assert.equal(result.backup_directory_count, 1);
  assert.equal(result.declared_verified_count, 1);
  assert.equal(result.sole_verified_backup, true);
  assert.deepEqual(snapshot(namespace), before);
  assert.equal(JSON.stringify(result).includes(namespace), false);
  assert.equal(JSON.stringify(result).includes(owner), false);
}));

test('counts failed-release evidence separately from verified backups', () => fixture(({ namespace, backup }) => {
  backup('release-a', true);
  backup('release-b');
  const result = inventoryBackupNamespace(namespace, owner);
  assert.equal(result.ok, true);
  assert.equal(result.backup_directory_count, 2);
  assert.equal(result.declared_verified_count, 1);
  assert.equal(result.owned_unverified_count, 1);
  assert.equal(result.sole_verified_backup, false);
}));

test('does not treat a false verification marker as verified', () => fixture(({ namespace, backup }) => {
  backup('release-a', false);
  const result = inventoryBackupNamespace(namespace, owner);
  assert.equal(result.declared_verified_count, 0);
  assert.equal(result.owned_unverified_count, 1);
}));

test('rejects a namespace owned by another project', () => fixture(({ namespace, write, backup }) => {
  backup('release-a', true);
  write(namespace, 'owner.json', { version: 1, project: 'another-synthetic-project' });
  const result = inventoryBackupNamespace(namespace, owner);
  assert.equal(result.ok, false);
  assert.equal(result.namespace_owned, false);
  assert.equal(result.scan_complete, false);
  assert.equal(result.error, 'namespace_unverified');
}));

test('does not follow a backup directory symlink', () => fixture(({ root, namespace }) => {
  const outside = path.join(root, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'private.txt'), 'synthetic-only');
  fs.symlinkSync(outside, path.join(namespace, 'release-linked'));
  const result = inventoryBackupNamespace(namespace, owner);
  assert.equal(result.ok, false);
  assert.equal(result.unsafe_entry_count, 1);
  assert.equal(result.declared_verified_count, 0);
}));

test('does not follow a verification-file symlink', () => fixture(({ root, namespace, backup, write }) => {
  const directory = backup('release-a');
  write(root, 'synthetic-marker.json', { version: 1, project: owner, bundle_verified: true });
  fs.symlinkSync(path.join(root, 'synthetic-marker.json'), path.join(directory, 'verified.json'));
  const result = inventoryBackupNamespace(namespace, owner);
  assert.equal(result.ok, false);
  assert.equal(result.unsafe_entry_count, 1);
  assert.equal(result.declared_verified_count, 0);
}));

test('flags unexpected namespace entries without deleting them', () => fixture(({ namespace }) => {
  const item = path.join(namespace, 'unclassified.txt');
  fs.writeFileSync(item, 'synthetic-only');
  const result = inventoryBackupNamespace(namespace, owner);
  assert.equal(result.unknown_entry_count, 1);
  assert.equal(result.sole_verified_backup, false);
  assert.equal(fs.existsSync(item), true);
}));

test('rejects oversized metadata with a closed error result', () => fixture(({ namespace, backup }) => {
  const directory = backup('release-a');
  fs.writeFileSync(path.join(directory, 'verified.json'), 'x'.repeat(16_385));
  const result = inventoryBackupNamespace(namespace, owner);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'scan_incomplete');
  assert.equal(JSON.stringify(result).includes('xxxxx'), false);
}));

test('does not mistake an empty namespace for a restorable backup', () => fixture(({ namespace }) => {
  const result = inventoryBackupNamespace(namespace, owner);
  assert.equal(result.ok, true);
  assert.equal(result.scan_complete, true);
  assert.equal(result.sole_verified_backup, false);
  assert.equal(result.declared_verified_count, 0);
}));

test('does not claim a marker proves file or database restoration', () => fixture(({ namespace, backup }) => {
  backup('release-a', true);
  const result = inventoryBackupNamespace(namespace, owner);
  assert.equal(result.declared_verified_count, 1);
  assert.equal('backup_verified' in result, false);
  assert.equal('database_restore_verified' in result, false);
}));
