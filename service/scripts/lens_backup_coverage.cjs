'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function createFileBackupVerifier({ source, policy }) {
  const program = `import json,sys
try:
    task_input = json.load(sys.stdin)
    exec(compile(task_input['source'], '<controlled-backup-core>', 'exec'), globals())
    task_original_policy = _policy
    def _policy(artifact_roots, protected_roots):
        if tuple(artifact_roots) != tuple(task_input['artifact_roots']) or tuple(protected_roots) != tuple(task_input['protected_roots']):
            raise ValueError('policy_mismatch')
        return task_original_policy(artifact_roots, protected_roots)
    task_result = verify_backup(Path(task_input['directory']))
    print(json.dumps({'ok': task_result.ok is True and task_result.backup_verified is True}))
except BaseException:
    print(json.dumps({'ok': False}))
`;
  return directory => {
    const result = spawnSync('python3', ['-c', program], {
      input: JSON.stringify({ source, directory, ...policy }), encoding: 'utf8',
      timeout: 60000, maxBuffer: 4096,
    });
    try { return result.status === 0 && JSON.parse(result.stdout).ok === true; }
    catch { return false; }
  };
}

// Versions of code, dependencies and deployment metadata are historical state.
// Database rows require an exact multiset inclusion proof before removal.
async function prepareBackupCoverage({ namespace, owner, roles, databaseCore, fileBackupVerifier }) {
  const backupHistoryState = { snapshots: new Map(), unsupported: false };

  const proofs = new Map();
  const facts = { coverage_latest_valid: false, coverage_database_valid_count: 0,
    coverage_manifest_read: false, coverage_manifest_valid: false,
    coverage_tables_valid: false, coverage_bundle_valid: false,
    coverage_unknown_file_count: 0, coverage_unknown_symlink_count: 0, coverage_unknown_regular_file_count: 0, coverage_unknown_empty_file_count: 0, coverage_unknown_empty_directory_count: 0, coverage_unknown_directory_file_count: 0, coverage_unknown_directory_count: 0,
    coverage_binding_failure_count: 0, coverage_extra_database_file_count: 0,
    coverage_database_unique_count: 0, coverage_database_invalid_count: 0,
    coverage_unknown_layout_count: 0, coverage_metadata_rejected_count: 0 };
  const reject = () => Object.assign(() => false, { facts });
  const identity = stat => [stat.dev, stat.ino, stat.mode, stat.uid, stat.nlink,
    stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(':');
  const artifactProof = directory => {
    if (!roles.artifacts) return new Map();
    const root = path.join(directory, roles.artifacts);
    if (!fs.existsSync(root)) return new Map();
    const capture = () => {
      const files = new Map();
      const visit = relative => {
        if (files.size > 200000) throw new Error('artifact_limit');
        const stat = fs.lstatSync(path.join(root, relative), { bigint: true });
        if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new Error('artifact_invalid');
        files.set(relative, identity(stat));
        if (stat.isDirectory()) for (const name of fs.readdirSync(path.join(root, relative))) visit(path.join(relative, name));
      };
      visit(''); return files;
    };
    const before = capture();
    if (typeof fileBackupVerifier !== 'function' || !fileBackupVerifier(root)) throw new Error('artifact_invalid');
    const after = capture();
    if (before.size !== after.size || [...before].some(([name, value]) => after.get(name) !== value)) {
      throw new Error('artifact_changed');
    }
    return after;
  };
  let preserved;
  const bundles = [];
  try {
    const root = fs.lstatSync(namespace);
    if (!root.isDirectory() || root.isSymbolicLink()) return reject();
    const readMetadata = file => {
      const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== root.uid ||
            (stat.mode & 0o077) !== 0 || stat.size > 16384) throw new Error('metadata_invalid');
        return JSON.parse(fs.readFileSync(fd, 'utf8'));
      } finally { fs.closeSync(fd); }
    };
    for (const name of fs.readdirSync(namespace)) {
      const directory = path.join(namespace, name);
      const stat = fs.lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== root.uid) continue;
      const control = readMetadata(path.join(directory, roles.control));
      if (control.version !== 1 || control.project !== owner) continue;
      let verified = false;
      try {
        const marker = readMetadata(path.join(directory, roles.verified));
        verified = marker.version === 1 && marker.project === owner && marker.bundle_verified === true;
      } catch {}
      bundles.push({ directory, verified });
    }
    const retained = bundles.filter(bundle => bundle.verified);
    if (retained.length !== 1) return reject();
    preserved = retained[0].directory;
    const latest = await observeBackupHistorySnapshot(databaseCore.loadStoredForRetention(path.join(preserved, roles.database), stage => {
      if (['manifest_read', 'manifest_valid', 'tables_valid', 'bundle_valid'].includes(stage)) {
        facts['coverage_' + stage] = true;
      }
    }), backupHistoryState, path.join(preserved, roles.database));
    facts.coverage_latest_valid = true;
    const history = typeof databaseCore.verifyStoredRetentionHistory === 'function'
      ? await observeBackupHistoryCurrent(databaseCore.verifyStoredRetentionHistory({ directory: path.join(preserved, roles.database),
        currentDirectory: path.join(preserved, roles.database), optional: true }), backupHistoryState, databaseCore, path.join(preserved, roles.database)) : null;
    if (history && !await history.coversSnapshot(latest, path.join(preserved, roles.database))) return reject();
    const latestArtifacts = artifactProof(preserved);
    for (const bundle of bundles.filter(item => !item.verified)) {
      try {
        const databaseDirectory = path.join(bundle.directory, roles.database);
        const hasDatabase = fs.existsSync(databaseDirectory);
        const older = hasDatabase
          ? await observeBackupHistorySnapshot(databaseCore.loadStoredForRetention(databaseDirectory), backupHistoryState, databaseDirectory)
          : { database: latest.database, fingerprint: latest.fingerprint, tables: new Map(), files: new Map() };
        facts.coverage_database_valid_count++;
        if (older.database !== latest.database || older.fingerprint !== latest.fingerprint) {
          backupHistoryState.unsupported = true;
          continue;
        }
        let covered = !hasDatabase || (history ? await history.coversSnapshot(older, databaseDirectory) : true);
        if (!history) {
          for (const [name, table] of older.tables) {
            const current = latest.tables.get(name);
            if (!current || current.schema !== table.schema ||
                [...table.rows].some(([row, count]) => (current.rows.get(row) || 0) < count)) {
              covered = false; break;
            }
          }
        }
        if (covered) proofs.set(bundle.directory, {
          older: { files: older.files, artifacts: artifactProof(bundle.directory) },
          latest: { files: latest.files, artifacts: latestArtifacts },
        });
        else facts.coverage_database_unique_count++;
      } catch { backupHistoryState.unsupported = true;
        facts.coverage_database_invalid_count++; }
    }
  } catch { facts.coverage_metadata_rejected_count++; return reject(); }
  const knownFiles = new Set(roles.files);
  const knownDirectories = new Set(roles.directories);
  const unknownHashes = new Map();
  let unknownHashedBytes = 0n;
  const hashUnknownFile = (snapshot, relative, expected) => {
    const file = path.join(snapshot.directory, relative);
    const before = fs.lstatSync(file, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n ||
        identity(before) !== expected.identity || before.size > 16777216n) throw new Error('backup coverage changed');
    const key = file + ':' + expected.identity;
    if (unknownHashes.has(key)) return unknownHashes.get(key);
    unknownHashedBytes += before.size;
    if (unknownHashedBytes > 67108864n) throw new Error('backup coverage bounded');
    const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      if (identity(fs.fstatSync(descriptor, { bigint: true })) !== expected.identity) throw new Error('backup coverage changed');
      const digest = require('node:crypto').createHash('sha256'), buffer = Buffer.alloc(65536);
      let length;
      while ((length = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) digest.update(buffer.subarray(0, length));
      if (identity(fs.fstatSync(descriptor, { bigint: true })) !== expected.identity ||
          identity(fs.lstatSync(file, { bigint: true })) !== expected.identity) throw new Error('backup coverage changed');
      const hash = digest.digest('hex');
      unknownHashes.set(key, hash);
      return hash;
    } finally { fs.closeSync(descriptor); }
  };
  const equivalentUnknown = (snapshot, relative, entry, retained) => {
    const reference = retained.entries.get(relative);
    if (!reference || entry.symlink || reference.symlink || entry.directory !== reference.directory) return false;
    if (entry.directory) return true;
    try { return hashUnknownFile(snapshot, relative, entry) === hashUnknownFile(retained, relative, reference); }
    catch (_) { return false; }
  };
  const matches = (snapshot, stored, retained) => {
    for (const [name, identity] of stored.files) {
      const entry = snapshot.entries.get(path.join(roles.database, name));
      if (!entry || entry.directory || entry.symlink || entry.identity !== identity) {
        facts.coverage_binding_failure_count++; return false;
      }
    }
    for (const [relative, entry] of snapshot.entries) {
      const parts = relative.split(path.sep);
      if (parts[0] === roles.database) {
        if (parts.length === 1) { if (!entry.directory || entry.symlink) return false; }
        else if (parts.length !== 2 || !stored.files.has(parts[1])) {
          facts.coverage_extra_database_file_count++; return false;
        }
      } else if (parts[0] === roles.artifacts) {
        const child = parts.slice(1).join(path.sep);
        if (stored.artifacts.get(child) !== entry.identity) {
          facts.coverage_binding_failure_count++; return false;
        }
      } else if (parts.length === 1 && !entry.directory && !entry.symlink && knownFiles.has(parts[0])) {
        continue;
      } else if (!knownDirectories.has(parts[0]) ||
          (parts.length === 1 && (!entry.directory || entry.symlink))) {
        if (equivalentUnknown(snapshot, relative, entry, retained)) continue;
        if (entry.directory) {
          facts.coverage_unknown_directory_count++;
          const descendants = [...snapshot.entries].filter(([name]) => name.startsWith(relative + path.sep));
          if (!descendants.length) facts.coverage_unknown_empty_directory_count++;
          facts.coverage_unknown_directory_file_count += descendants.filter(([, child]) => !child.directory).length;
        } else {
          facts.coverage_unknown_file_count++;
          if (entry.symlink) facts.coverage_unknown_symlink_count++;
          else {
            facts.coverage_unknown_regular_file_count++;
            if (entry.size === 0n || entry.size === 0) facts.coverage_unknown_empty_file_count++;
          }
        }
        return false;
      }
    }
    return true;
  };
  return rememberBackupHistory(Object.assign(({ candidate, retained }) => {
    const proof = proofs.get(candidate.directory);
    if (retained.directory !== preserved || !proof) return false;
    const covered = matches(candidate, proof.older, retained) && matches(retained, proof.latest, retained);
    if (!covered) facts.coverage_unknown_layout_count++;
    return covered;
  }, { facts }), backupHistoryState);
}

module.exports = { prepareBackupCoverage, createFileBackupVerifier ,
  commitBackupHistory, inheritBackupHistory, recoverBackupHistory
};


const backupHistoryContexts = new WeakMap();

function sameBackupHistoryFiles(left, right) {
  if (!left || !right || typeof left.entries !== 'function' || typeof right.get !== 'function' ||
      left.size !== right.size) return false;
  for (const [file, signature] of left) {
    if (typeof file !== 'string' || typeof signature !== 'string' || right.get(file) !== signature) return false;
  }
  return true;
}

async function observeBackupHistorySnapshot(promise, state, directory) {
  const snapshot = await promise;
  if (!snapshot || typeof snapshot.fingerprint !== 'string' ||
      !snapshot.files || typeof snapshot.files.entries !== 'function' ||
      !sameBackupHistoryFiles(snapshot.files, snapshot.files)) {
    state.unsupported = true;
    return snapshot;
  }
  const previous = state.snapshots.get(directory);
  if (previous && (previous.fingerprint !== snapshot.fingerprint ||
      !sameBackupHistoryFiles(previous.files, snapshot.files))) state.unsupported = true;
  state.snapshots.set(directory, { fingerprint: snapshot.fingerprint, files: new Map(snapshot.files) });
  return snapshot;
}

async function observeBackupHistoryCurrent(promise, state, core, currentDirectory) {
  const result = await promise;
  state.core = core;
  state.currentDirectory = currentDirectory;
  return result;
}

function rememberBackupHistory(result, state) {
  if (result && typeof result === 'function' && !state.unsupported &&
      state.core && typeof state.core.commitStoredRetentionHistory === 'function' &&
      typeof state.currentDirectory === 'string' && state.snapshots.has(state.currentDirectory)) {
    backupHistoryContexts.set(result, state);
  }
  return result;
}

async function commitBackupHistory(coverage) {
  return commitObservedBackupHistory(coverage);
}

async function recoverBackupHistory(coverage, decoderSource) {
  const state = backupHistoryContexts.get(coverage);
  if (!state || typeof state.core.verifyStoredRetentionHistoryMemoryRecovery !== 'function') {
    throw new Error('backup history context invalid');
  }
  return state.core.verifyStoredRetentionHistoryMemoryRecovery({ directory: state.currentDirectory,
    currentDirectory: state.currentDirectory, decoderSource, optional: true });
}

async function inheritBackupHistory(coverage, currentDirectory) {
  if (typeof currentDirectory !== 'string' || !currentDirectory) {
    throw new Error('backup history context invalid');
  }
  return commitObservedBackupHistory(coverage, currentDirectory);
}

async function commitObservedBackupHistory(coverage, destination) {
  const state = backupHistoryContexts.get(coverage);
  if (!state || (destination !== undefined &&
      (destination === state.currentDirectory || !state.snapshots.has(destination)))) {
    throw new Error('backup history context invalid');
  }
  backupHistoryContexts.delete(coverage);
  try {
    for (const [directory, original] of state.snapshots) {
      const current = await state.core.loadStoredForRetention(directory);
      if (current.fingerprint !== original.fingerprint || !sameBackupHistoryFiles(original.files, current.files)) {
        throw new Error('backup history context changed');
      }
    }
    const currentDirectory = destination === undefined ? state.currentDirectory : destination;
    const olderDirectories = [...state.snapshots.keys()].filter(directory => directory !== currentDirectory);
    if (olderDirectories.length === 0) {
      return Object.freeze({ committed: false, noHistoryRequired: true, cleanupComplete: true });
    }
    const result = await state.core.commitStoredRetentionHistory({ currentDirectory, olderDirectories });
    if (result.committed !== true || result.cleanupComplete !== true) throw new Error('backup history commit failed');
    return Object.freeze({ committed: true, noHistoryRequired: false, cleanupComplete: true });
  } catch (error) {
    const known = new Set(['backup history context changed', 'retention history recovery required']);
    throw new Error(known.has(error.message) ? error.message : 'backup history commit failed');
  }
}
