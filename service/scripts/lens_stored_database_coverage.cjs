// Evaluated with the existing database backup core in a private closure.
// No database values or file identities leave that closure.
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
    tables.set(table.name, {
      schema: digest(JSON.stringify({ columns: table.columns, create: table.create })), rows,
    });
  }
  return { database: parsed.database, fingerprint: parsed.databaseFingerprint, tables, files: after };
}
module.exports.loadStoredForRetention = loadStoredForRetention;
