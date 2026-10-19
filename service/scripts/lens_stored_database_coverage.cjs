// Evaluated with the existing database backup core in a private closure.
// No database values or file identities leave that closure.
const storedRetentionRecords = new WeakMap();
const retentionHistoryFile = 'retention-history.json';

function retentionStructureKey(table) {
  const masked = table.create.replace(/`(?:``|[^`])*`|'(?:\\.|''|[^'\\])*'|"(?:\\.|""|[^"\\])*"|\/\*[\s\S]*?\*\/|--[^\r\n]*|#[^\r\n]*/g,
    quoted => ' '.repeat(quoted.length));
  const end = masked.lastIndexOf(')');
  let create = table.create;
  const options = [...masked.matchAll(/\bAUTO_INCREMENT\s*=\s*\d+(?=\s|$)/g)]
    .filter(match => match.index > end);
  for (const option of options.reverse()) {
    create = create.slice(0, option.index) + 'AUTO_INCREMENT=*' + create.slice(option.index + option[0].length);
  }
  return digest(JSON.stringify({ columns: table.columns, create }));
}

async function loadStoredForRetention(directory, observe = () => {}) {
  let bounds = limits({});
  const manifestFile = 'manifest.json';
  const manifest = await readPrivateFile(path.join(directory, manifestFile), bounds.maxBytes);
  const parsed = JSON.parse(manifest);
  observe('manifest_read');
  const keys = (value, allowed) => value && typeof value === 'object' &&
    !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key));
  const text = value => typeof value === 'string' && value.length > 0 && value.length <= 4096;
  const count = value => Number.isSafeInteger(value) && value >= 0 && value <= bounds.maxRows;
  const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  if (!keys(parsed, ['version', 'database', 'databaseFingerprint', 'tables', 'rowCount', 'bounds']) ||
      parsed.version !== 1 || !text(parsed.database) || !text(parsed.databaseFingerprint) ||
      !keys(parsed.bounds, ['maxRows', 'maxBytes']) ||
      !Array.isArray(parsed.tables) || parsed.tables.length > 10000) {
    throw new Error('stored_backup_invalid');
  }
  bounds = limits(parsed.bounds);
  if (!count(parsed.rowCount)) throw new Error('stored_backup_invalid');
  observe('manifest_valid');
  const names = new Set(), files = new Set([manifestFile]);
  let total = 0;
  for (const table of parsed.tables) {
    if (!keys(table, ['name', 'columns', 'create', 'file', 'fileHash', 'rowCount', 'rowHash']) ||
        !text(table.name) || names.has(table.name) || typeof table.create !== 'string' ||
        table.create.length === 0 || Buffer.byteLength(table.create) > bounds.maxBytes ||
        !Array.isArray(table.columns) || table.columns.length > 4096 ||
        !table.columns.every(column => keys(column, ['name', 'type', 'charset']) &&
          text(column.name) && text(column.type) &&
          (column.charset === null || typeof column.charset === 'string')) ||
        typeof table.file !== 'string' || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}$/.test(table.file) ||
        files.has(table.file) || !hash(table.fileHash) || !hash(table.rowHash) || !count(table.rowCount)) {
      throw new Error('stored_backup_invalid');
    }
    names.add(table.name); files.add(table.file); total += table.rowCount;
  }
  if (total !== parsed.rowCount || total > bounds.maxRows) throw new Error('stored_backup_invalid');
  observe('tables_valid');
  const identity = stat => [stat.dev, stat.ino, stat.mode, stat.uid, stat.nlink,
    stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(':');
  const capture = async () => {
    const result = new Map();
    for (const file of files) {
      const stat = await fs.lstat(path.join(directory, file), { bigint: true });
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) {
        throw new Error('stored_backup_invalid');
      }
      result.set(file, identity(stat));
    }
    return result;
  };
  try { await fs.lstat(path.join(directory, retentionHistoryFile)); files.add(retentionHistoryFile); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const before = await capture();
  const captured = await loadBundle({ directory, bounds, manifestHash: digest(manifest),
    database: parsed.database, fingerprint: parsed.databaseFingerprint,
    tables: parsed.tables, rowCount: parsed.rowCount });
  observe('bundle_valid');
  const after = await capture();
  if ([...before].some(([name, value]) => after.get(name) !== value)) {
    throw new Error('stored_backup_changed');
  }
  const tables = new Map();
  for (const { table, decoded } of captured) {
    const rows = new Map();
    for (const row of decoded) {
      const key = digest(canonicalRow(row));
      rows.set(key, (rows.get(key) || 0) + 1);
    }
    const proof = { schema: digest(JSON.stringify({ columns: table.columns, create: table.create })), rows };
    Object.defineProperty(proof, 'structure', { value: retentionStructureKey(table) });
    tables.set(table.name, proof);
  }
  const result = { database: parsed.database, fingerprint: parsed.databaseFingerprint, tables, files: after };
  storedRetentionRecords.set(result, { captured, manifestHash: digest(manifest), capture, directory });
  return result;
}
module.exports.loadStoredForRetention = loadStoredForRetention;

function retentionHistoryError() { return new Error('retention_history_invalid'); }

function retentionHistoryStats(tables, sources) {
  return Object.freeze({ archivedSchemaCount: tables.length,
    archivedRowVersionCount: tables.reduce((sum, table) => sum + table.rows.length, 0),
    archivedRowCount: tables.reduce((sum, table) => sum + table.rows.reduce((total, row) => total + row.count, 0), 0),
    sourceSnapshotCount: sources.length });
}

async function retentionDirectory(directory, owner) {
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 ||
      (owner !== undefined && stat.uid !== owner)) throw retentionHistoryError();
  return stat;
}

async function retentionHistoryIdentity(file, owner) {
  const stat = await fs.lstat(file, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || (stat.mode & 0o077n) !== 0n ||
      (owner !== undefined && stat.uid !== BigInt(owner))) {
    throw retentionHistoryError();
  }
  return [stat.dev, stat.ino, stat.mode, stat.uid, stat.nlink, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(':');
}

async function readStoredRetentionHistory(directory, current, optional = false) {
  const bounds = limits({}), file = path.join(directory, retentionHistoryFile);
  const owner = (await retentionDirectory(directory)).uid;
  let before;
  try { before = await retentionHistoryIdentity(file, owner); }
  catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
  const content = await readPrivateFile(file, bounds.maxBytes);
  const value = JSON.parse(content);
  const keys = (object, allowed) => object && typeof object === 'object' && !Array.isArray(object) &&
    Object.keys(object).length === allowed.length && Object.keys(object).every(key => allowed.includes(key));
  const hash = text => typeof text === 'string' && /^[a-f0-9]{64}$/.test(text);
  const text = value => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= bounds.maxBytes;
  const material = storedRetentionRecords.get(current);
  if (!keys(value, ['version', 'baseManifestHash', 'databaseFingerprint', 'sourceBindings', 'tables', 'contentHash']) ||
      value.version !== 1 || value.baseManifestHash !== material.manifestHash ||
      value.databaseFingerprint !== current.fingerprint ||
      !Array.isArray(value.sourceBindings) || value.sourceBindings.length > 1024 ||
      !value.sourceBindings.every(hash) || new Set(value.sourceBindings).size !== value.sourceBindings.length ||
      !Array.isArray(value.tables) || value.tables.length > 1024 || JSON.stringify(value) + '\n' !== content) {
    throw retentionHistoryError();
  }
  const { contentHash, ...payload } = value;
  if (!hash(contentHash) || digest(JSON.stringify(payload)) !== contentHash) throw retentionHistoryError();
  const seen = new Set();
  let count = 0;
  for (const table of value.tables) {
    if (!keys(table, ['name', 'columns', 'create', 'structure', 'rows']) || !text(table.name) || !text(table.create) ||
        !Array.isArray(table.columns) || table.columns.length > 1024 ||
        !table.columns.every(column => keys(column, ['name', 'type', 'charset']) && text(column.name) &&
          text(column.type) && (column.charset === null || typeof column.charset === 'string')) ||
        !hash(table.structure) || table.structure !== retentionStructureKey(table) ||
        !Array.isArray(table.rows) || table.rows.length > bounds.maxRows) throw retentionHistoryError();
    const key = JSON.stringify([table.name, table.structure]);
    if (seen.has(key)) throw retentionHistoryError();
    seen.add(key);
    const rowHashes = new Set();
    for (const row of table.rows) {
      if (!keys(row, ['data', 'count']) || typeof row.data !== 'string' ||
          !Number.isSafeInteger(row.count) || row.count <= 0 || row.count > bounds.maxRows) throw retentionHistoryError();
      const encoded = JSON.parse(row.data);
      if (!Array.isArray(encoded) || encoded.length !== table.columns.length ||
          canonicalRow(encoded.map(decodeValue)) !== row.data) throw retentionHistoryError();
      const rowKey = digest(row.data);
      if (rowHashes.has(rowKey)) throw retentionHistoryError();
      rowHashes.add(rowKey);
      count += row.count;
      if (count > bounds.maxRows) throw retentionHistoryError();
    }
  }
  if (await retentionHistoryIdentity(file, owner) !== before) throw retentionHistoryError();
  return { value, file, identity: before };
}

function retainedRowCount(current, table, structure, row) {
  const found = current.tables.get(table);
  return found && found.structure === structure ? found.rows.get(row) || 0 : 0;
}

function storedHistoryProof(current, archive) {
  const value = archive ? archive.value : { tables: [], sourceBindings: [] };
  const tables = new Map();
  for (const table of value.tables) {
    tables.set(JSON.stringify([table.name, table.structure]), new Map(table.rows.map(row => [digest(row.data), row.count])));
  }
  const result = { ok: true, ...retentionHistoryStats(value.tables, value.sourceBindings) };
  const covers = ({ table, structure, row, count }) => {
    if (typeof table !== 'string' || typeof structure !== 'string' || typeof row !== 'string' ||
        !Number.isSafeInteger(count) || count < 0) return false;
    const archived = tables.get(JSON.stringify([table, structure]))?.get(row) || 0;
    return retainedRowCount(current, table, structure, row) + archived >= count;
  };
  Object.defineProperty(result, 'covers', { value: covers });
  Object.defineProperty(result, 'coversSnapshot', { value: async (snapshot, directory) => {
    try {
      const material = storedRetentionRecords.get(snapshot);
      if (!material || path.resolve(material.directory) !== path.resolve(directory) ||
          snapshot.database !== current.database || snapshot.fingerprint !== current.fingerprint) return false;
      for (const { table, decoded } of material.captured) {
        const structure = retentionStructureKey(table);
        if (current.tables.get(table.name)?.structure !== structure &&
            !tables.has(JSON.stringify([table.name, structure]))) return false;
        const counts = new Map();
        for (const row of decoded) { const hash = digest(canonicalRow(row)); counts.set(hash, (counts.get(hash) || 0) + 1); }
        for (const [row, count] of counts) if (!covers({ table: table.name, structure, row, count })) return false;
      }
      const previous = await readStoredRetentionHistory(directory, snapshot, true);
      if (previous) for (const table of previous.value.tables) {
        if (current.tables.get(table.name)?.structure !== table.structure &&
            !tables.has(JSON.stringify([table.name, table.structure]))) return false;
        for (const row of table.rows) {
          const hash = digest(row.data);
          const count = row.count + retainedRowCount(snapshot, table.name, table.structure, hash);
          if (!covers({ table: table.name, structure: table.structure, row: hash, count })) return false;
        }
      }
      const after = await material.capture();
      return after.size === snapshot.files.size && [...snapshot.files].every(([name, value]) => after.get(name) === value);
    } catch (_) { return false; }
  } });
  return Object.freeze(result);
}

async function verifyStoredRetentionHistory({ directory, currentDirectory, optional = false }) {
  try {
    const current = await loadStoredForRetention(currentDirectory);
    return storedHistoryProof(current, await readStoredRetentionHistory(directory, current, optional));
  } catch (_) { throw retentionHistoryError(); }
}

async function prepareStoredRetentionHistory({ currentDirectory, olderDirectories, destinationDirectory }) {
  let created = false, createdIdentity;
  const destination = path.join(destinationDirectory, retentionHistoryFile);
  try {
    if (!Array.isArray(olderDirectories) || olderDirectories.length > 1024) throw retentionHistoryError();
    const owner = (await retentionDirectory(currentDirectory)).uid;
    await retentionDirectory(destinationDirectory, owner);
    if ((await fs.readdir(destinationDirectory)).length) throw retentionHistoryError();
    const target = await fs.realpath(destinationDirectory);
    const directories = [...new Set([currentDirectory, ...olderDirectories])];
    const sources = [];
    for (const directory of directories) {
      await retentionDirectory(directory, owner);
      const real = await fs.realpath(directory), relative = path.relative(real, target);
      if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
        throw retentionHistoryError();
      }
      sources.push({ directory, snapshot: await loadStoredForRetention(directory) });
    }
    const current = sources[0].snapshot, material = storedRetentionRecords.get(current);
    const grouped = new Map(), bindings = new Set(), archives = [];
    function group(table) {
      const structure = retentionStructureKey(table);
      const key = JSON.stringify([table.name, structure]);
      if (!grouped.has(key)) grouped.set(key, { name: table.name, columns: table.columns, create: table.create, structure, rows: new Map() });
      return grouped.get(key);
    }
    function include(table, data, count) {
      const structure = retentionStructureKey(table), row = digest(data);
      const missing = Math.max(0, count - retainedRowCount(current, table.name, structure, row));
      if (!missing) return;
      const retained = group(table), previous = retained.rows.get(row);
      if (previous && previous.data !== data) throw retentionHistoryError();
      retained.rows.set(row, { data, count: Math.max(previous?.count || 0, missing) });
    }
    for (const source of sources) {
      const snapshot = source.snapshot, details = storedRetentionRecords.get(snapshot);
      if (snapshot.database !== current.database || snapshot.fingerprint !== current.fingerprint) throw retentionHistoryError();
      bindings.add(details.manifestHash);
      for (const { table, decoded } of details.captured) {
        if (current.tables.get(table.name)?.structure !== retentionStructureKey(table)) group(table);
        const values = new Map();
        for (const cells of decoded) {
          const data = canonicalRow(cells);
          values.set(data, (values.get(data) || 0) + 1);
        }
        for (const [data, count] of values) include(table, data, count);
      }
      const archiveFile = path.join(source.directory, retentionHistoryFile);
      let present = false;
      try { await fs.lstat(archiveFile); present = true; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (present) {
        const archive = await readStoredRetentionHistory(source.directory, snapshot);
        archives.push({ ...archive, snapshot });
        for (const binding of archive.value.sourceBindings) bindings.add(binding);
        for (const table of archive.value.tables) {
          if (current.tables.get(table.name)?.structure !== table.structure) group(table);
          for (const row of table.rows) {
            include(table, row.data, row.count + retainedRowCount(snapshot, table.name, table.structure, digest(row.data)));
          }
        }
      }
    }
    const tables = [...grouped.values()].map(table => ({ ...table, rows: [...table.rows.values()] }));
    const payload = { version: 1, baseManifestHash: material.manifestHash, databaseFingerprint: current.fingerprint,
      sourceBindings: [...bindings].sort(), tables };
    const value = { ...payload, contentHash: digest(JSON.stringify(payload)) };
    const content = JSON.stringify(value) + '\n';
    if (Buffer.byteLength(content) > limits({}).maxBytes) throw retentionHistoryError();
    const descriptor = await fs.open(destination, 'wx', 0o600);
    created = true;
    try {
      const stat = await descriptor.stat({ bigint: true });
      createdIdentity = [stat.dev, stat.ino].map(String).join(':');
      await descriptor.writeFile(content);
    } finally { await descriptor.close(); }
    const proof = storedHistoryProof(current, await readStoredRetentionHistory(destinationDirectory, current));
    for (const source of sources) {
      const snapshot = source.snapshot, details = storedRetentionRecords.get(snapshot);
      const after = await details.capture();
      if (after.size !== snapshot.files.size || [...snapshot.files].some(([name, value]) => after.get(name) !== value)) {
        throw retentionHistoryError();
      }
      for (const { table, decoded } of details.captured) {
        const counts = new Map();
        for (const row of decoded) { const key = digest(canonicalRow(row)); counts.set(key, (counts.get(key) || 0) + 1); }
        for (const [row, count] of counts) if (!proof.covers({ table: table.name,
          structure: retentionStructureKey(table), row, count })) throw retentionHistoryError();
      }
    }
    for (const archive of archives) {
      if (await retentionHistoryIdentity(archive.file) !== archive.identity) throw retentionHistoryError();
      for (const table of archive.value.tables) for (const row of table.rows) {
        const key = digest(row.data);
        const count = row.count + retainedRowCount(archive.snapshot, table.name, table.structure, key);
        if (!proof.covers({ table: table.name, structure: table.structure, row: key, count })) {
          throw retentionHistoryError();
        }
      }
    }
    return Object.freeze({ ok: true, ...retentionHistoryStats(tables, value.sourceBindings) });
  } catch (_) {
    if (created) {
      try {
        const stat = await fs.lstat(destination, { bigint: true });
        if (!stat.isFile() || stat.isSymbolicLink() || !createdIdentity ||
            [stat.dev, stat.ino].map(String).join(':') !== createdIdentity) throw retentionHistoryError();
        await fs.unlink(destination);
      } catch (_) { throw new Error('retention_history_cleanup_required'); }
    }
    throw retentionHistoryError();
  }
}

module.exports.prepareStoredRetentionHistory = prepareStoredRetentionHistory;
module.exports.verifyStoredRetentionHistory = verifyStoredRetentionHistory;


async function commitStoredRetentionHistory(options) {
  const transactionError = 'retention history transaction failed';
  const fields = new Set(['currentDirectory', 'olderDirectories', 'destinationDirectory']);
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      Object.keys(options).some(key => !fields.has(key))) throw new Error(transactionError);
  const { currentDirectory, olderDirectories, destinationDirectory } = options;
  if (typeof currentDirectory !== 'string' || !currentDirectory ||
      (destinationDirectory !== undefined && (typeof destinationDirectory !== 'string' || !destinationDirectory)) ||
      !Array.isArray(olderDirectories) ||
      olderDirectories.some(directory => typeof directory !== 'string' || !directory)) {
    throw new Error(transactionError);
  }
  if (destinationDirectory === undefined) {
    return await commitStoredHistoryInOwnedStage(currentDirectory, olderDirectories);
  }
  const recoveryError = 'retention history recovery required';
  const target = path.join(currentDirectory, 'retention-history.json');
  const staged = path.join(destinationDirectory, 'retention-history.json');
  const previousPath = path.join(destinationDirectory, '.retention-history.previous');
  const lockPath = path.join(currentDirectory, '.retention-history.lock');
  const descriptors = [], ownedFiles = new Map(), unidentifiedCreated = new Set();
  let stagedIdentity, originalIdentity, directoryIdentity;
  let installed = false, committed = false, recoveryRequired = false;

  async function stat(file) {
    try { return await fs.lstat(file); }
    catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
  }
  function same(left, right) {
    return Boolean(left && right && left.dev === right.dev && left.ino === right.ino);
  }
  async function currentDirectoryUnchanged() {
    const now = await stat(currentDirectory);
    return same(now, directoryIdentity) && now.isDirectory() && !now.isSymbolicLink();
  }
  async function removeOwned(file, identity) {
    if (!identity) return true;
    const now = await stat(file);
    if (!now) return true;
    if (!same(now, identity) || !now.isFile() || now.nlink !== 1) return false;
    await fs.unlink(file);
    return true;
  }
  async function openPrivate(file, expected) {
    const handle = await fs.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    descriptors.push(handle);
    const identity = await handle.stat();
    if (!same(identity, expected) || !identity.isFile() || identity.nlink !== 1 ||
        (identity.mode & 0o777) !== 0o600) throw new Error(transactionError);
    return { identity, bytes: await handle.readFile() };
  }
  async function writePrivate(file, bytes) {
    const handle = await fs.open(file, fs.constants.O_WRONLY | fs.constants.O_CREAT |
      fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    descriptors.push(handle);
    unidentifiedCreated.add(file);
    const identity = await handle.stat();
    ownedFiles.set(file, identity);
    unidentifiedCreated.delete(file);
    await handle.writeFile(bytes);
    await handle.sync();
    return identity;
  }
  async function syncDirectory() {
    if (!await currentDirectoryUnchanged()) throw new Error(recoveryError);
    const handle = await fs.open(currentDirectory, fs.constants.O_RDONLY |
      fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    try {
      if (!same(await handle.stat(), directoryIdentity)) throw new Error(recoveryError);
      await handle.sync();
    } finally { await handle.close(); }
  }

  try {
    await loadStoredForRetention(currentDirectory);
    directoryIdentity = await stat(currentDirectory);
    if (!directoryIdentity || !directoryIdentity.isDirectory() || directoryIdentity.isSymbolicLink()) {
      throw new Error(transactionError);
    }
    await writePrivate(lockPath, Buffer.from('retention-history-transaction\n'));
    originalIdentity = await stat(target);
    const previous = originalIdentity ? await openPrivate(target, originalIdentity) : undefined;
    await prepareStoredRetentionHistory({ currentDirectory, olderDirectories, destinationDirectory });
    stagedIdentity = await stat(staged);
    await openPrivate(staged, stagedIdentity);
    await verifyStoredRetentionHistory({ directory: destinationDirectory, currentDirectory });
    if (previous) await writePrivate(previousPath, previous.bytes);
    const currentTarget = await stat(target);
    if (!await currentDirectoryUnchanged() || (originalIdentity ? !same(currentTarget, originalIdentity) : currentTarget)) {
      throw new Error(transactionError);
    }
    await fs.rename(staged, target);
    installed = true;
    await syncDirectory();
    const proof = await verifyStoredRetentionHistory({ directory: currentDirectory, currentDirectory });
    for (const directory of olderDirectories) {
      const snapshot = await loadStoredForRetention(directory);
      if (!await proof.coversSnapshot(snapshot, directory)) throw new Error(transactionError);
    }
    if (!await currentDirectoryUnchanged() || !same(await stat(target), stagedIdentity)) throw new Error(recoveryError);
    committed = true;
  } catch (_) {
    try {
      if (stagedIdentity && same(await stat(target), stagedIdentity)) {
        if (!await currentDirectoryUnchanged()) throw new Error(recoveryError);
        if (originalIdentity) {
          if (!same(await stat(previousPath), ownedFiles.get(previousPath))) throw new Error(recoveryError);
          await fs.rename(previousPath, target);
          ownedFiles.delete(previousPath);
          await verifyStoredRetentionHistory({ directory: currentDirectory, currentDirectory });
        } else if (!await removeOwned(target, stagedIdentity)) {
          throw new Error(recoveryError);
        }
        await syncDirectory();
      } else if (installed) {
        recoveryRequired = true;
      }
    } catch (_) { recoveryRequired = true; }
  } finally {
    if (unidentifiedCreated.size) recoveryRequired = true;
    if (!recoveryRequired) {
      try {
        if (!await removeOwned(staged, stagedIdentity) ||
            !await removeOwned(previousPath, ownedFiles.get(previousPath))) recoveryRequired = true;
      } catch (_) { recoveryRequired = true; }
    }
    const lockIdentity = ownedFiles.get(lockPath);
    if (lockIdentity) {
      try {
        if (!await currentDirectoryUnchanged() || !await removeOwned(lockPath, lockIdentity)) recoveryRequired = true;
      } catch (_) { recoveryRequired = true; }
    }
    for (const handle of descriptors) {
      try { await handle.close(); } catch (_) { recoveryRequired = true; }
    }
  }
  if (recoveryRequired) throw new Error(recoveryError);
  if (!committed) throw new Error(transactionError);
  return Object.freeze({ committed: true, previousArchivePresent: Boolean(originalIdentity), cleanupComplete: true });
}

async function commitStoredHistoryInOwnedStage(currentDirectory, olderDirectories) {
  const transactionError = 'retention history transaction failed';
  const recoveryError = 'retention history recovery required';
  let stage, handle, identity, receipt, failure;
  try {
    await loadStoredForRetention(currentDirectory);
    stage = await fs.mkdtemp(path.join(path.dirname(currentDirectory), '.lens-retention-history-'));
    handle = await fs.open(stage, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    identity = await handle.stat();
    if (!identity.isDirectory() || (identity.mode & 0o777) !== 0o700) throw new Error(transactionError);
    receipt = await commitStoredRetentionHistory({ currentDirectory, olderDirectories, destinationDirectory: stage });
  } catch (error) {
    failure = error.message === recoveryError ? recoveryError : transactionError;
  } finally {
    if (stage) {
      try {
        const now = await fs.lstat(stage);
        if (!identity || now.dev !== identity.dev || now.ino !== identity.ino ||
            !now.isDirectory() || now.isSymbolicLink()) throw new Error(recoveryError);
        if ((await fs.readdir(stage)).length !== 0) throw new Error(recoveryError);
        await fs.rmdir(stage);
      } catch (_) { failure = recoveryError; }
    }
    if (handle) {
      try { await handle.close(); } catch (_) { failure = recoveryError; }
    }
  }
  if (failure) throw new Error(failure);
  return receipt;
}

module.exports.commitStoredRetentionHistory = commitStoredRetentionHistory;

async function verifyStoredRetentionHistoryMemoryRecovery({ directory, currentDirectory, decoderSource, optional = false }) {
  const error = 'retention history recovery verification failed';
  try {
    if (typeof decoderSource !== 'string' || !decoderSource || decoderSource.length > 65536 ||
        typeof optional !== 'boolean') throw new Error(error);
    const current = await loadStoredForRetention(currentDirectory);
    const archive = await readStoredRetentionHistory(directory, current, optional);
    if (!archive) return Object.freeze({ verified: true, schemaCount: 0, rowVersionCount: 0, rowCount: 0, sourceCount: 0 });
    const content = await readPrivateFile(archive.file, limits({}).maxBytes);
    const rawHash = digest(content);
    const child = require('node:child_process').spawnSync('python3', ['-c', decoderSource], {
      input: JSON.stringify({ archive: Buffer.from(content).toString('base64'), sha256: rawHash }),
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: 4096, timeout: 15000,
    });
    if (child.error || child.status !== 0) throw new Error(error);
    const result = JSON.parse(child.stdout);
    const fields = ['ok', 'schema_count', 'row_version_count', 'row_count', 'source_count'];
    if (!result || typeof result !== 'object' || Array.isArray(result) ||
        Object.keys(result).length !== fields.length || Object.keys(result).some(key => !fields.includes(key)) ||
        result.ok !== true || fields.slice(1).some(key => !Number.isSafeInteger(result[key]) || result[key] < 0)) {
      throw new Error(error);
    }
    const expected = retentionHistoryStats(archive.value.tables, archive.value.sourceBindings);
    if (result.schema_count !== expected.archivedSchemaCount || result.row_version_count !== expected.archivedRowVersionCount ||
        result.row_count !== expected.archivedRowCount || result.source_count !== expected.sourceSnapshotCount) throw new Error(error);
    const after = await loadStoredForRetention(currentDirectory);
    if (after.fingerprint !== current.fingerprint || after.files.size !== current.files.size ||
        [...current.files].some(([name, signature]) => after.files.get(name) !== signature) ||
        await retentionHistoryIdentity(archive.file, (await retentionDirectory(directory)).uid) !== archive.identity ||
        digest(await readPrivateFile(archive.file, limits({}).maxBytes)) !== rawHash) throw new Error(error);
    return Object.freeze({ verified: true, schemaCount: result.schema_count,
      rowVersionCount: result.row_version_count, rowCount: result.row_count, sourceCount: result.source_count });
  } catch (_) { throw new Error(error); }
}
module.exports.verifyStoredRetentionHistoryMemoryRecovery = verifyStoredRetentionHistoryMemoryRecovery;
