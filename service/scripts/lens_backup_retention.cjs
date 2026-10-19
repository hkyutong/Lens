'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_FILES = 200000;
const MAX_STAT_VISITS = 5000000;
const MAX_HASH_BYTES = 8 * 1024 * 1024 * 1024;
const controlKeys = new Set(['version', 'project', 'init_db_on_boot', 'config_hash', 'config_mode', 'old_indexes']);
const markerKeys = new Set(['version', 'project', 'bundle_verified']);

function auditAndRetainBackups({ namespace, owner, inventory, cleanup = false,
  expectedBackups, expectedUnverified, proveCoverage = null }) {
  const result = {
    coverage_latest_valid: false, coverage_unknown_file_count: 0, coverage_unknown_symlink_count: 0, coverage_unknown_regular_file_count: 0, coverage_unknown_empty_file_count: 0, coverage_unknown_empty_directory_count: 0, coverage_unknown_directory_file_count: 0, coverage_unknown_directory_count: 0, coverage_binding_failure_count: 0, coverage_extra_database_file_count: 0, coverage_manifest_read: false, coverage_manifest_valid: false, coverage_tables_valid: false, coverage_bundle_valid: false, coverage_database_valid_count: 0, coverage_database_unique_count: 0, coverage_database_invalid_count: 0, coverage_unknown_layout_count: 0, coverage_metadata_rejected_count: 0, ok: false, scan_complete: false, namespace_owned: false,
    backup_count_before: 0, verified_count: 0, unverified_count: 0,
    eligible_count: 0, retained_unverified_count: 0,
    unique_content_candidate_count: 0, metadata_rejected_count: 0,
    referenced_candidate_count: 0,
    unsafe_candidate_count: 0, removed_count: 0, backup_count_after: 0,
    verified_backup_preserved: false, sole_verified_backup: false,
    history_memory_recovery_verified: false, history_archived_schema_count: 0, history_archived_version_count: 0, history_archived_row_count: 0, history_source_snapshot_count: 0, history_committed: false, history_cleanup_complete: false,
    cleanup_requested: cleanup === true, error: 'scan_incomplete',
    failure_stage: 'none', failure_reason: 'none' };
  let statVisits = 0, hashedBytes = 0, retained, stage = 'inventory';
  const taggedError = (code, reason = 'none') => Object.assign(new Error(code), { retentionCode: code, retentionReason: reason });
  const identity = (stat) => [stat.dev, stat.ino, stat.mode, stat.uid, stat.nlink,
    stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(':');
  const contained = (root, target) => target === root || target.startsWith(root + path.sep);
  const safeStat = (file, directory = false) => {
    const stat = fs.lstatSync(file, { bigint: true });
    if (stat.isSymbolicLink()) throw taggedError('unsafe_entry', 'symbolic_link');
    if (directory ? !stat.isDirectory() : !stat.isFile()) throw taggedError('unsafe_entry', 'wrong_type');
    if (!directory && stat.nlink !== 1n) throw taggedError('unsafe_entry', 'multiple_links');
    if ((stat.mode & 0o022n) !== 0n) throw taggedError('unsafe_entry', 'writable_by_others');
    return stat;
  };
  const readMetadata = (file, optional, allowed) => {
    let stat;
    try { stat = safeStat(file); } catch (error) {
      if (optional && error.code === 'ENOENT') return null;
      throw error;
    }
    if (stat.size > 16384n) throw taggedError('metadata_rejected');
    const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      if (identity(fs.fstatSync(descriptor, { bigint: true })) !== identity(stat)) throw taggedError('changed_during_review');
      const value = JSON.parse(fs.readFileSync(descriptor, 'utf8'));
      if (!value || Array.isArray(value) || typeof value !== 'object'
        || Object.keys(value).some(key => !allowed.has(key))
        || value.version !== 1 || value.project !== owner) throw taggedError('metadata_rejected');
      return value;
    } finally { fs.closeSync(descriptor); }
  };
  const digest = (file, expected) => {
    hashedBytes += Number(expected.size);
    if (hashedBytes > MAX_HASH_BYTES) throw taggedError('limits_exceeded');
    const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      if (identity(fs.fstatSync(descriptor, { bigint: true })) !== identity(expected)) throw taggedError('changed_during_review');
      const hash = crypto.createHash('sha256'), buffer = Buffer.alloc(1024 * 1024);
      let length;
      while ((length = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, length));
      if (identity(fs.fstatSync(descriptor, { bigint: true })) !== identity(expected)) throw taggedError('changed_during_review');
      return hash.digest('hex');
    } finally { fs.closeSync(descriptor); }
  };
  const snapshot = (directory) => {
    const entries = new Map();
    const rootStat = safeStat(directory, true);
    let fileCount = 0;
    const visit = (relative) => {
      const target = path.join(directory, relative);
      const names = fs.readdirSync(target).sort();
      for (const name of names) {
        if (++fileCount > MAX_FILES || ++statVisits > MAX_STAT_VISITS) throw taggedError('limits_exceeded');
        const child = path.join(relative, name), file = path.join(directory, child);
        const stat = fs.lstatSync(file, { bigint: true });
        if (stat.uid !== rootStat.uid) throw taggedError('unsafe_entry', 'different_owner');
        if (stat.isSymbolicLink()) {
          const target = fs.readlinkSync(file);
          if (Buffer.byteLength(target) > 4096) throw taggedError('limits_exceeded');
          const resolved = path.resolve(path.dirname(file), target);
          let reference = resolved;
          try { reference = fs.realpathSync(resolved); } catch (error) {
            if (error.code !== 'ENOENT') throw taggedError('unsafe_entry', 'symbolic_link');
          }
          if (identity(fs.lstatSync(file, { bigint: true })) !== identity(stat)) throw taggedError('changed_during_review');
          entries.set(child, { identity: identity(stat), directory: false, symlink: true,
            link: contained(directory, resolved) ? 'internal:' + path.relative(directory, resolved) : 'external:' + reference,
            reference, size: stat.size });
          continue;
        }
        safeStat(file, stat.isDirectory());
        entries.set(child, { identity: identity(stat), directory: stat.isDirectory(), size: stat.size });
        if (stat.isDirectory()) visit(child);
      }
    };
    visit('');
    return { directory, root: identity(rootStat), entries };
  };
  const unchanged = (before) => {
    const after = snapshot(before.directory);
    return before.root === after.root && before.entries.size === after.entries.size
      && [...before.entries].every(([name, entry]) => after.entries.get(name)?.identity === entry.identity
        && after.entries.get(name)?.reference === entry.reference);
  };
  try {
    const before = inventory(namespace, owner);
    result.namespace_owned = before.namespace_owned === true;
    result.backup_count_before = before.backup_directory_count;
    result.backup_count_after = before.backup_directory_count;
    result.verified_count = before.declared_verified_count;
    result.unverified_count = before.owned_unverified_count;
    result.retained_unverified_count = before.owned_unverified_count;
    if (!before.ok || !before.scan_complete || !before.namespace_owned
      || before.unknown_entry_count || before.unsafe_entry_count
      || before.backup_directory_count !== expectedBackups
      || before.owned_unverified_count !== expectedUnverified) throw taggedError('inventory_mismatch');
    if (before.declared_verified_count !== 1) throw taggedError('unique_verified_backup_required');
    stage = 'namespace_security';
    const namespaceStat = safeStat(namespace, true);
    const bundles = [];
    for (const name of fs.readdirSync(namespace).sort()) {
      if (name === 'owner.json') continue;
      stage = 'bundle_security';
      const directory = path.join(namespace, name), stat = safeStat(directory, true);
      if (stat.uid !== namespaceStat.uid) throw taggedError('unsafe_entry', 'different_owner');
      stage = 'bundle_metadata';
      const control = readMetadata(path.join(directory, 'control.json'), false, controlKeys);
      const marker = readMetadata(path.join(directory, 'verified.json'), true, markerKeys);
      bundles.push({ directory, control, marker, verified: marker?.bundle_verified === true });
    }
    const verified = bundles.filter(bundle => bundle.verified);
    if (verified.length !== 1) throw taggedError('unique_verified_backup_required');
    stage = 'retained_tree';
    retained = snapshot(verified[0].directory);
    const hashes = new Map(), eligible = [];
    for (const candidate of bundles.filter(bundle => !bundle.verified)) {
      try {
        stage = 'candidate_tree';
        const candidateSnapshot = snapshot(candidate.directory);
        if ([...retained.entries.values()].some(entry => entry.symlink && contained(candidate.directory, entry.reference))) {
          result.referenced_candidate_count++;
          continue;
        }
        let unique = false;
        for (const [relative, entry] of candidateSnapshot.entries) {
          if (relative === 'control.json' || relative === 'verified.json' || entry.directory) continue;
          const reference = retained.entries.get(relative);
          if (entry.symlink) {
            if (!reference?.symlink || reference.link !== entry.link) { unique = true; break; }
            continue;
          }
          if (!reference || reference.directory || reference.symlink || reference.size !== entry.size) { unique = true; break; }
          stage = 'content_hash';
          if (!hashes.has(relative)) hashes.set(relative, digest(path.join(retained.directory, relative), safeStat(path.join(retained.directory, relative))));
          if (digest(path.join(candidate.directory, relative), safeStat(path.join(candidate.directory, relative))) !== hashes.get(relative)) { unique = true; break; }
        }
        if (unique && typeof proveCoverage === 'function' &&
            proveCoverage({ candidate: candidateSnapshot, retained }) === true) unique = false;
        if (unique) result.unique_content_candidate_count++;
        else eligible.push(candidateSnapshot);
      } catch (error) {
        if (error.retentionCode === 'unsafe_entry') result.unsafe_candidate_count++;
        else throw error;
      }
    }
    result.eligible_count = eligible.length;
    result.scan_complete = true;
    stage = 'retained_recheck';
    result.verified_backup_preserved = unchanged(retained);
    if (!result.verified_backup_preserved) throw taggedError('changed_during_review');
    if (cleanup === true) {
      for (const candidate of eligible) {
        stage = 'pre_delete_check';
        const current = inventory(namespace, owner);
        if (current.backup_directory_count !== expectedBackups - result.removed_count
          || current.declared_verified_count !== 1 || current.unknown_entry_count
          || current.unsafe_entry_count || !unchanged(retained) || !unchanged(candidate)) throw taggedError('changed_during_review');
        stage = 'delete';
        fs.rmSync(candidate.directory, { recursive: true, force: false });
        result.removed_count++;
      }
    }
    stage = 'final_check';
    const after = inventory(namespace, owner);
    if (after.backup_directory_count !== expectedBackups - result.removed_count
      || after.unknown_entry_count || after.unsafe_entry_count) throw taggedError('changed_during_review');
    result.backup_count_after = after.backup_directory_count;
    result.retained_unverified_count = after.owned_unverified_count;
    result.verified_backup_preserved = after.declared_verified_count === 1 && unchanged(retained);
    result.sole_verified_backup = after.sole_verified_backup === true;
    result.ok = after.ok && after.scan_complete && result.verified_backup_preserved;
    result.error = result.ok ? 'none' : 'scan_incomplete';
  } catch (error) {
    const allowed = new Set(['unsafe_entry', 'metadata_rejected', 'changed_during_review',
      'limits_exceeded', 'inventory_mismatch', 'unique_verified_backup_required']);
    result.error = allowed.has(error.retentionCode) ? error.retentionCode : 'operation_failed';
    result.failure_stage = stage;
    const reasons = new Set(['none', 'symbolic_link', 'wrong_type', 'multiple_links', 'writable_by_others', 'different_owner']);
    result.failure_reason = reasons.has(error.retentionReason) ? error.retentionReason : 'none';
    if (error.retentionCode === 'metadata_rejected') result.metadata_rejected_count++;
    if (error.retentionCode === 'unsafe_entry') result.unsafe_candidate_count++;
    if (result.removed_count) {
      try {
        const after = inventory(namespace, owner);
        result.backup_count_after = after.backup_directory_count;
        result.retained_unverified_count = after.owned_unverified_count;
        result.sole_verified_backup = after.sole_verified_backup === true;
        result.verified_backup_preserved = after.declared_verified_count === 1 && retained && unchanged(retained);
      } catch { result.verified_backup_preserved = false; }
    }
  }
  if (proveCoverage && proveCoverage.facts) {
      result.coverage_latest_valid = proveCoverage.facts.coverage_latest_valid === true;
      for (const key of ["coverage_manifest_read","coverage_manifest_valid","coverage_tables_valid","coverage_bundle_valid"]) result[key] = proveCoverage.facts[key] === true;
      for (const key of ['coverage_unknown_symlink_count', 'coverage_unknown_regular_file_count', 'coverage_unknown_empty_file_count', 'coverage_unknown_empty_directory_count', 'coverage_unknown_directory_file_count', "coverage_database_valid_count","coverage_database_unique_count","coverage_database_invalid_count","coverage_unknown_layout_count","coverage_metadata_rejected_count","coverage_unknown_file_count","coverage_unknown_directory_count","coverage_binding_failure_count","coverage_extra_database_file_count"]) {
        const value = proveCoverage.facts[key];
        if (Number.isSafeInteger(value) && value >= 0) result[key] = value;
      }
    }
    return result;
}

module.exports = { auditAndRetainBackups };
