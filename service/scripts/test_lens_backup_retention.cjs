'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { inventoryBackupNamespace } = require('./lens_backup_inventory.cjs');
const { auditAndRetainBackups } = require('./lens_backup_retention.cjs');

function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lens-retention-contract-')));
  const owner = 'synthetic-owner', metadata = { version: 1, project: owner };
  fs.writeFileSync(path.join(root, 'owner.json'), JSON.stringify(metadata));
  function bundle(name, verified, files = { 'synthetic-build.js': 'synthetic-code', 'synthetic-data.sql': 'synthetic-data' }) {
    const directory = path.join(root, name); fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'control.json'), JSON.stringify(metadata));
    if (verified) fs.writeFileSync(path.join(directory, 'verified.json'), JSON.stringify({ ...metadata, bundle_verified: true }));
    for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), value);
    return directory;
  }
  const retained = bundle('synthetic-retained', true);
  const candidate = bundle('synthetic-candidate', false);
  return { root, owner, retained, candidate, bundle,
    run(options = {}) { return auditAndRetainBackups({ namespace: root, owner, inventory: inventoryBackupNamespace, expectedBackups: 2, expectedUnverified: 1, ...options }); },
    close() { fs.rmSync(root, { recursive: true, force: true }); } };
}
function tree(directory) {
  const result = {};
  for (const name of fs.readdirSync(directory).sort()) {
    const file = path.join(directory, name), stat = fs.lstatSync(file);
    result[name] = stat.isDirectory() ? tree(file) : stat.isSymbolicLink() ? 'synthetic-link' : crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
  return result;
}
function scenario(name, body) { test(name, () => { const f = fixture(); try { body(f); } finally { f.close(); } }); }

scenario('audit is read-only and identifies duplicate content', f => {
  const before = tree(f.root), result = f.run();
  assert.equal(result.ok, true); assert.equal(result.eligible_count, 1);
  assert.equal(result.removed_count, 0); assert.deepEqual(tree(f.root), before);
});
scenario('cleanup removes only reviewed duplicate and preserves retained backup bytes', f => {
  const retained = tree(f.retained), result = f.run({ cleanup: true });
  assert.equal(result.ok, true); assert.equal(result.removed_count, 1);
  assert.equal(result.sole_verified_backup, true);
  assert.deepEqual(tree(f.retained), retained); assert.equal(fs.existsSync(f.candidate), false);
});
scenario('metadata-only failed bundle is removable', f => {
  for (const name of ['synthetic-build.js', 'synthetic-data.sql']) fs.unlinkSync(path.join(f.candidate, name));
  assert.equal(f.run({ cleanup: true }).removed_count, 1);
});
scenario('unique data is preserved', f => {
  fs.writeFileSync(path.join(f.candidate, 'synthetic-data.sql'), 'synthetic-unique-data');
  const before = tree(f.root), result = f.run({ cleanup: true });
  assert.equal(result.unique_content_candidate_count, 1); assert.equal(result.removed_count, 0);
  assert.deepEqual(tree(f.root), before);
});
scenario('extra content is preserved', f => {
  fs.writeFileSync(path.join(f.candidate, 'synthetic-extra.txt'), 'synthetic-unique');
  assert.equal(f.run({ cleanup: true }).removed_count, 0);
});
scenario('multiple verified backups block cleanup', f => {
  f.bundle('synthetic-second-retained', true);
  const before = tree(f.root), result = f.run({ cleanup: true, expectedBackups: 3 });
  assert.equal(result.ok, false); assert.equal(result.removed_count, 0); assert.deepEqual(tree(f.root), before);
});
scenario('ownership mismatch blocks cleanup', f => {
  fs.writeFileSync(path.join(f.candidate, 'control.json'), JSON.stringify({ version: 1, project: 'synthetic-other-owner' }));
  assert.equal(f.run({ cleanup: true }).removed_count, 0); assert.equal(fs.existsSync(f.candidate), true);
});
scenario('unmatched symlink candidate content is preserved', f => {
  fs.symlinkSync(path.join(f.retained, 'synthetic-data.sql'), path.join(f.candidate, 'synthetic-link'));
  const result = f.run({ cleanup: true });
  assert.equal(result.removed_count, 0); assert.equal(result.unique_content_candidate_count, 1);
});
scenario('hardlinked candidate content is preserved', f => {
  fs.linkSync(path.join(f.retained, 'synthetic-data.sql'), path.join(f.candidate, 'synthetic-hardlink'));
  assert.equal(f.run({ cleanup: true }).removed_count, 0);
});
scenario('candidate change after review blocks removal', f => {
  let calls = 0;
  const result = f.run({ cleanup: true, inventory(...args) {
    if (++calls === 2) fs.writeFileSync(path.join(f.candidate, 'synthetic-data.sql'), 'synthetic-changed');
    return inventoryBackupNamespace(...args);
  } });
  assert.equal(result.error, 'changed_during_review'); assert.equal(result.removed_count, 0);
});
scenario('retained backup change blocks removal', f => {
  let calls = 0;
  const result = f.run({ cleanup: true, inventory(...args) {
    if (++calls === 2) fs.writeFileSync(path.join(f.retained, 'synthetic-data.sql'), 'synthetic-changed');
    return inventoryBackupNamespace(...args);
  } });
  assert.equal(result.error, 'changed_during_review'); assert.equal(result.removed_count, 0);
});
scenario('unexpected namespace entry blocks removal', f => {
  let calls = 0;
  const result = f.run({ cleanup: true, inventory(...args) {
    if (++calls === 2) fs.writeFileSync(path.join(f.root, 'synthetic-unknown'), 'synthetic');
    return inventoryBackupNamespace(...args);
  } });
  assert.equal(result.removed_count, 0); assert.equal(result.error, 'changed_during_review');
});
scenario('changed counts block removal', f => {
  const result = f.run({ cleanup: true, expectedBackups: 12, expectedUnverified: 11 });
  assert.equal(result.error, 'inventory_mismatch'); assert.equal(result.removed_count, 0);
});
scenario('unknown metadata is preserved', f => {
  fs.writeFileSync(path.join(f.candidate, 'control.json'), JSON.stringify({ version: 1, project: f.owner, synthetic_unknown: 'synthetic-private' }));
  const result = f.run({ cleanup: true });
  assert.equal(result.error, 'metadata_rejected'); assert.equal(result.removed_count, 0);
  assert.equal(JSON.stringify(result).includes('synthetic-private'), false);
});
scenario('exceptions expose only a closed failure class', f => {
  const result = f.run({ cleanup: true, inventory() { throw new Error('synthetic-private'); } });
  assert.equal(result.error, 'operation_failed');
  assert.equal(JSON.stringify(result).includes('synthetic-private'), false);
});
scenario('audit never calls a removal primitive', f => {
  const original = fs.rmSync;
  try {
    fs.rmSync = () => { throw new Error('synthetic-forbidden-removal'); };
    assert.equal(f.run().ok, true);
  } finally { fs.rmSync = original; }
});
scenario('partial removal failure preserves recovery evidence and reports actual remainder', f => {
  const second = f.bundle('synthetic-second-candidate', false);
  const retained = tree(f.retained), original = fs.rmSync;
  let result;
  try {
    fs.rmSync = (directory, options) => {
      if (directory === second) throw new Error('synthetic-removal-failure');
      return original(directory, options);
    };
    result = f.run({ cleanup: true, expectedBackups: 3, expectedUnverified: 2 });
  } finally { fs.rmSync = original; }
  assert.equal(result.ok, false); assert.equal(result.removed_count, 1);
  assert.equal(result.backup_count_after, 2); assert.equal(result.retained_unverified_count, 1);
  assert.equal(result.verified_backup_preserved, true); assert.deepEqual(tree(f.retained), retained);
});
scenario('equivalent internal symlinks are compared as metadata without reading linked content', f => {
  fs.symlinkSync('synthetic-data.sql', path.join(f.retained, 'synthetic-internal-link'));
  fs.symlinkSync('synthetic-data.sql', path.join(f.candidate, 'synthetic-internal-link'));
  const before = tree(f.retained), result = f.run({ cleanup: true });
  assert.equal(result.removed_count, 1); assert.equal(result.sole_verified_backup, true);
  assert.deepEqual(tree(f.retained), before);
});
scenario('backup referenced by retained symlink is preserved', f => {
  fs.symlinkSync(path.join(f.candidate, 'synthetic-data.sql'), path.join(f.retained, 'synthetic-reference'));
  const result = f.run({ cleanup: true });
  assert.equal(result.removed_count, 0); assert.equal(result.referenced_candidate_count, 1);
  assert.equal(fs.existsSync(f.candidate), true);
});
scenario('equivalent external symlinks are preserved in the retained backup', f => {
  const external = path.join(os.tmpdir(), 'synthetic-missing-retention-target');
  fs.symlinkSync(external, path.join(f.retained, 'synthetic-external-link'));
  fs.symlinkSync(external, path.join(f.candidate, 'synthetic-external-link'));
  const result = f.run({ cleanup: true });
  assert.equal(result.removed_count, 1);
  assert.equal(fs.readlinkSync(path.join(f.retained, 'synthetic-external-link')), external);
});
