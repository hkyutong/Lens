'use strict';

const fs = require('fs');
const path = require('path');

function inventoryBackupNamespace(namespace, owner) {
  const result = {
    ok: false,
    namespace_owned: false,
    scan_complete: false,
    backup_directory_count: 0,
    declared_verified_count: 0,
    owned_unverified_count: 0,
    unknown_entry_count: 0,
    unsafe_entry_count: 0,
    sole_verified_backup: false,
    error: 'namespace_unverified',
  };
  const unsafe = () => {
    result.unsafe_entry_count += 1;
    throw new Error('unsafe');
  };
  const readMetadata = filename => {
    let stat;
    try { stat = fs.lstatSync(filename); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (stat.isSymbolicLink() || !stat.isFile()) unsafe();
    if (stat.size > 16_384) throw new Error('bounded');
    const descriptor = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const opened = fs.fstatSync(descriptor);
      if (opened.dev !== stat.dev || opened.ino !== stat.ino || !opened.isFile()) unsafe();
      const buffer = Buffer.alloc(16_385);
      const length = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
      if (length > 16_384) throw new Error('bounded');
      const value = JSON.parse(buffer.subarray(0, length).toString('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape');
      return value;
    } finally { fs.closeSync(descriptor); }
  };
  const owned = value => value && value.version === 1 && value.project === owner;
  try {
    if (typeof namespace !== 'string' || !path.isAbsolute(namespace) ||
        typeof owner !== 'string' || !owner || owner.length > 256) return result;
    const resolved = path.resolve(namespace);
    if (fs.realpathSync(resolved) !== resolved || !fs.lstatSync(resolved).isDirectory()) return result;
    if (!owned(readMetadata(path.join(resolved, 'owner.json')))) return result;
    result.namespace_owned = true;
    result.error = 'scan_incomplete';
    const names = fs.readdirSync(resolved);
    if (names.length > 4_096) return result;
    for (const name of names) {
      if (name === 'owner.json') continue;
      const directory = path.join(resolved, name);
      const stat = fs.lstatSync(directory);
      if (stat.isSymbolicLink()) { result.unsafe_entry_count += 1; continue; }
      if (!stat.isDirectory()) { result.unknown_entry_count += 1; continue; }
      result.backup_directory_count += 1;
      const control = readMetadata(path.join(directory, 'control.json'));
      const marker = readMetadata(path.join(directory, 'verified.json'));
      if (!owned(control) || (marker && !owned(marker))) {
        result.unknown_entry_count += 1;
      } else if (marker && marker.bundle_verified === true) {
        result.declared_verified_count += 1;
      } else {
        result.owned_unverified_count += 1;
      }
    }
    result.scan_complete = true;
    result.ok = result.unsafe_entry_count === 0;
    result.error = result.ok ? 'none' : 'scan_incomplete';
    result.sole_verified_backup = result.ok &&
      result.backup_directory_count === 1 && result.declared_verified_count === 1 &&
      result.unknown_entry_count === 0 && result.owned_unverified_count === 0;
  } catch {
    result.error = result.namespace_owned ? 'scan_incomplete' : 'namespace_unverified';
  }
  return result;
}

module.exports = { inventoryBackupNamespace };
