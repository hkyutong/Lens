"use strict";

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const handles = new WeakMap();
const IDENTIFIER = /^[A-Za-z0-9_]{1,64}$/;
const HASH = /^[a-f0-9]{64}$/;
const BINARY = new Set(['binary', 'varbinary', 'tinyblob', 'blob', 'mediumblob', 'longblob', 'bit']);
const TEXT = new Set(['char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext', 'enum', 'set', 'json']);
const ASCII = new Set(['tinyint', 'smallint', 'mediumint', 'int', 'bigint', 'decimal', 'date', 'time', 'datetime', 'timestamp', 'year']);
const CHARSETS = new Set(['ascii', 'latin1', 'utf8', 'utf8mb3', 'utf8mb4', 'binary', 'ucs2', 'utf16', 'utf16le', 'utf32']);
class BackupFault extends Error {
  constructor(code, unsupported = false) { super(code); this.code = code; this.unsupported = unsupported; }
}
function fault(code, unsupported = false) { throw new BackupFault(code, unsupported); }
function quote(value) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) fault('unsupported_identifier', true);
  return '`' + value + '`';
}
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function closed(status, error = null, facts = {}) {
  return Object.freeze({ ok: status === 'backup_ready' || status === 'verified', status, error,
    backup_created: facts.backup === true, restore_verified: facts.verified === true,
    temporary_database_removed: facts.cleaned !== false,
    table_count: facts.tables || 0, row_count: facts.rows || 0,
    source_unchanged: true, needs_manual_review: facts.manual === true });
}
function classify(error) { return error instanceof BackupFault ? error.code : 'database_backup_failed'; }
function limits(options) {
  const maxRows = options.maxRows === undefined ? 100000 : options.maxRows;
  const maxBytes = options.maxBytes === undefined ? 134217728 : options.maxBytes;
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 1000000 || !Number.isSafeInteger(maxBytes) || maxBytes < 1024 || maxBytes > 536870912) fault('invalid_limits');
  return { maxRows, maxBytes };
}
async function rows(connection, sql, parameters = [], asArray = false) {
  const response = await connection.query(asArray ? { sql, rowsAsArray: true } : sql, parameters);
  if (!Array.isArray(response) || !Array.isArray(response[0])) fault('invalid_adapter_response');
  return response[0];
}
async function identity(connection, fingerprint) {
  if (!connection || typeof connection.query !== 'function' || typeof fingerprint !== 'string' || !HASH.test(fingerprint)) fault('invalid_request');
  const response = await rows(connection, 'SELECT DATABASE() AS schema_name');
  if (response.length !== 1 || typeof response[0].schema_name !== 'string' || digest(response[0].schema_name) !== fingerprint) fault('database_identity_mismatch');
  quote(response[0].schema_name); return response[0].schema_name;
}
async function catalogVisibility(connection, database) {
  const grants = await rows(connection, 'SHOW GRANTS FOR CURRENT_USER()');
  const directAll = grants.some((row) => Object.values(row).some((value) => {
    if (typeof value !== 'string') return false;
    const match = value.match(/^GRANT ALL PRIVILEGES ON (\*|`(?:``|[^`])+`)\.\* TO /i);
    if (!match) return false;
    const scope = match[1] === '*' ? '*' : match[1].slice(1, -1).replace(/``/g, '`').replace(/\\([_%])/g, '$1');
    return scope === '*' || scope === database;
  }));
  if (!directAll) fault('catalog_visibility_unproven', true);
}
async function noTransaction(connection) {
  // A no-op returns the protocol status flags on both MySQL and MariaDB.
  // @@session.in_transaction is not available on all supported servers.
  const response = await connection.query('DO 0');
  const status = Array.isArray(response) && response[0] && response[0].serverStatus;
  if (!Number.isInteger(status) || status < 0 || status > 0xffff) fault('invalid_adapter_response');
  if ((status & 0x0001) !== 0) fault('transaction_already_active');
}
async function sessionStart(connection) {
  const response = await rows(connection, 'SELECT @@session.time_zone AS time_zone, @@session.sql_mode AS sql_mode');
  if (response.length !== 1 || typeof response[0].time_zone !== 'string' || typeof response[0].sql_mode !== 'string') fault('unsupported_session', true);
  const original = response[0];
  const modes = original.sql_mode.split(',').filter(Boolean);
  if (modes.some((mode) => !/^[A-Z0-9_]+$/.test(mode))) fault('unsupported_session', true);
  const restoreModes = modes.filter((mode) => !['NO_ZERO_DATE', 'NO_ZERO_IN_DATE'].includes(mode));
  if (!restoreModes.includes('NO_AUTO_VALUE_ON_ZERO')) restoreModes.push('NO_AUTO_VALUE_ON_ZERO');
  try {
    await connection.query('SET SESSION time_zone = ?', ['+00:00']);
    await connection.query('SET SESSION sql_mode = ?', [restoreModes.join(',')]);
  } catch (error) {
    try { await sessionEnd(connection, original); } catch { fault('session_cleanup_failed'); }
    throw error;
  }
  return original;
}
async function sessionEnd(connection, original) {
  let failed = false;
  try { await connection.query('SET SESSION sql_mode = ?', [original.sql_mode]); } catch { failed = true; }
  try { await connection.query('SET SESSION time_zone = ?', [original.time_zone]); } catch { failed = true; }
  if (failed) fault('session_cleanup_failed');
}
function encodeValue(value) {
  if (value === null) return ['null'];
  if (Buffer.isBuffer(value)) return ['buffer', value.toString('hex')];
  if (typeof value === 'bigint') return ['bigint', value.toString()];
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (!Number.isFinite(value.getTime())) fault('unsupported_value', true);
    return ['date', value.toISOString()];
  }
  if (typeof value === 'string') return ['string', value];
  if (typeof value === 'boolean') return ['boolean', value];
  if (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return ['number', Object.is(value, -0) ? '-0' : String(value)];
  fault('unsupported_value', true);
}
function decodeValue(value) {
  if (!Array.isArray(value)) fault('backup_integrity_failed');
  if (value[0] === 'null' && value.length === 1) return null;
  if (value.length !== 2) fault('backup_integrity_failed');
  if (value[0] === 'buffer' && typeof value[1] === 'string' && /^(?:[a-f0-9]{2})*$/.test(value[1])) return Buffer.from(value[1], 'hex');
  if (value[0] === 'bigint' && typeof value[1] === 'string' && /^-?\d+$/.test(value[1])) return BigInt(value[1]);
  if (value[0] === 'date' && typeof value[1] === 'string') { const date = new Date(value[1]); if (Number.isFinite(date.getTime()) && date.toISOString() === value[1]) return date; }
  if (value[0] === 'string' && typeof value[1] === 'string') return value[1];
  if (value[0] === 'boolean' && typeof value[1] === 'boolean') return value[1];
  if (value[0] === 'number' && typeof value[1] === 'string') {
    const number = Number(value[1]);
    if (Number.isFinite(number) && (!Number.isInteger(number) || Number.isSafeInteger(number)) && String(number) === value[1]) return number;
    if (value[1] === '-0') return -0;
  }
  fault('backup_integrity_failed');
}
function canonicalRow(row) { return JSON.stringify(row.map(encodeValue)); }
function rowHash(lines) {
  const hash = createHash('sha256');
  for (const line of [...lines].sort()) hash.update(String(Buffer.byteLength(line)) + ':').update(line);
  return hash.digest('hex');
}
function sqlOutsideLiterals(sql) {
  let output = '', quoteCharacter = null;
  for (let index = 0; index < sql.length; index++) {
    const character = sql[index];
    if (quoteCharacter) {
      if (character === '\\' && quoteCharacter !== '`') { index++; continue; }
      if (character === quoteCharacter) {
        if (sql[index + 1] === quoteCharacter) { index++; continue; }
        quoteCharacter = null;
      }
    } else if (["'", '"', '`'].includes(character)) { quoteCharacter = character; output += ' '; }
    else output += character;
  }
  if (quoteCharacter) fault('unsupported_ddl', true);
  return output;
}
function validateCreate(sql, tableName) {
  if (typeof sql !== 'string' || !sql.startsWith('CREATE TABLE ' + quote(tableName) + ' (')) fault('unsupported_ddl', true);
  const tokens = sqlOutsideLiterals(sql);
  if (/;|\/\*|--|#/.test(tokens) || /\b(?:SELECT|LIKE|FOREIGN|PARTITION|TABLESPACE|DIRECTORY|ENCRYPTION|DROP|INSERT|DELETE|ALTER|RENAME|TRIGGER|PROCEDURE|FUNCTION|EVENT|VIEW|UNION|OUTFILE|DUMPFILE|LOAD|LOAD_FILE|CALL|SLEEP|BENCHMARK|CONNECTION)\b/i.test(tokens) || (tokens.match(/\bCREATE\b/gi) || []).length !== 1 || (tokens.match(/\bTABLE\b/gi) || []).length !== 1 || (tokens.match(/\bENGINE\s*=/gi) || []).length !== 1 || !/\bENGINE\s*=\s*InnoDB\b/i.test(tokens)) fault('unsupported_ddl', true);
  return sql;
}
function structuralSql(sql) {
  const schema = sql.replace(/ AUTO_INCREMENT=\d+(?=\s|$)/g, '');
  // SHOW CREATE may omit a charset inherited from the table default.
  // Mask literals, identifiers and comments before inspecting SQL structure.
  const masked = schema.replace(
    /`(?:``|[^`])*`|'(?:\\.|''|[^'\\])*'|"(?:\\.|""|[^"\\])*"|\/\*[\s\S]*?\*\/|--[^\r\n]*|#[^\r\n]*/g,
    quoted => '~'.repeat(quoted.length),
  );
  const columnEnd = masked.lastIndexOf(')');
  if (columnEnd < 0) return schema;
  const defaultCharset = /\b(?:DEFAULT\s+)?(?:CHARSET|CHARACTER\s+SET)\s*(?:=\s*)?([A-Za-z0-9_]+)\b/i.exec(masked.slice(columnEnd + 1));
  if (!defaultCharset) return schema;
  const declarations = [...masked.slice(0, columnEnd).matchAll(/\s+CHARACTER\s+SET\s+([A-Za-z0-9_]+)\b/gi)];
  let canonical = schema;
  for (const declaration of declarations.reverse()) {
    if (declaration[1].toUpperCase() === defaultCharset[1].toUpperCase()) {
      canonical = canonical.slice(0, declaration.index) + canonical.slice(declaration.index + declaration[0].length);
    }
  }
  return canonical;
}
async function catalog(connection, database) {
  const tables = await rows(connection, 'SELECT TABLE_NAME AS table_name, TABLE_TYPE AS table_type, ENGINE AS engine FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME', [database]);
  if (!tables.length || tables.length > 256) fault('unsupported_table_count', true);
  const columns = await rows(connection, 'SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type, CHARACTER_SET_NAME AS character_set_name, EXTRA AS extra, GENERATION_EXPRESSION AS generation_expression, ORDINAL_POSITION AS ordinal_position FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION', [database]);
  for (const [kind, query] of [
    ['triggers', 'SELECT COUNT(*) AS object_count FROM INFORMATION_SCHEMA.TRIGGERS WHERE TRIGGER_SCHEMA = ?'],
    ['routines', 'SELECT COUNT(*) AS object_count FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = ?'],
    ['events', 'SELECT COUNT(*) AS object_count FROM INFORMATION_SCHEMA.EVENTS WHERE EVENT_SCHEMA = ?'],
    ['foreign_keys', 'SELECT COUNT(*) AS object_count FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL'],
  ]) {
    const response = await rows(connection, query, [database]);
    if (response.length !== 1 || !Number.isSafeInteger(Number(response[0].object_count)) || Number(response[0].object_count) < 0) fault('invalid_adapter_response');
    if (Number(response[0].object_count) !== 0) fault('unsupported_' + kind, true);
  }
  const result = [];
  const seen = new Set();
  for (const table of tables) {
    quote(table.table_name);
    if (seen.has(table.table_name)) fault('invalid_adapter_response');
    seen.add(table.table_name);
    if (table.table_type !== 'BASE TABLE' || String(table.engine).toUpperCase() !== 'INNODB') fault('unsupported_table', true);
    const tableColumns = columns.filter((column) => column.table_name === table.table_name).sort((a, b) => Number(a.ordinal_position) - Number(b.ordinal_position));
    if (!tableColumns.length || tableColumns.length > 512 || new Set(tableColumns.map((column) => column.column_name)).size !== tableColumns.length) fault('unsupported_columns', true);
    const normalized = tableColumns.map((column, index) => {
      quote(column.column_name);
      if (Number(column.ordinal_position) !== index + 1 || ![...BINARY, ...TEXT, ...ASCII].includes(column.data_type) || String(column.generation_expression || '') || /(?:^|\s)(?:VIRTUAL|STORED)\s+GENERATED|\bINVISIBLE\b/i.test(String(column.extra || ''))) fault('unsupported_columns', true);
      const charset = column.character_set_name || (TEXT.has(column.data_type) && column.data_type === 'json' ? 'utf8mb4' : null);
      if (TEXT.has(column.data_type) && !CHARSETS.has(charset)) fault('unsupported_charset', true);
      return { name: column.column_name, type: column.data_type, charset };
    });
    const response = await rows(connection, 'SHOW CREATE TABLE ' + quote(database) + '.' + quote(table.table_name));
    if (response.length !== 1) fault('invalid_adapter_response');
    const create = validateCreate(response[0]['Create Table'], table.table_name);
    result.push({ name: table.table_name, columns: normalized, create });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}
function catalogHash(tables) { return digest(JSON.stringify(tables.map((table) => ({ ...table, create: structuralSql(table.create) })))); }
async function tableRows(connection, database, table, bounds) {
  const expressions = table.columns.map((column) => 'HEX(CAST(' + quote(column.name) + ' AS BINARY))');
  const response = await rows(connection, 'SELECT ' + expressions.join(', ') + ' FROM ' + quote(database) + '.' + quote(table.name) + ' LIMIT ' + (bounds.maxRows + 1), [], true);
  if (response.length > bounds.maxRows) fault('unsupported_backup_size', true);
  const lines = [];
  let byteCount = 0;
  for (const row of response) {
    if (!Array.isArray(row) || row.length !== table.columns.length) fault('invalid_adapter_response');
    const values = row.map((value) => {
      if (value === null) return null;
      if (typeof value !== 'string' || !/^(?:[A-Fa-f0-9]{2})*$/.test(value)) fault('invalid_adapter_response');
      return Buffer.from(value, 'hex');
    });
    const line = canonicalRow(values); byteCount += Buffer.byteLength(line) + 1;
    if (byteCount > bounds.maxBytes) fault('unsupported_backup_size', true);
    lines.push(line);
  }
  return { lines, bytes: byteCount, count: lines.length, hash: rowHash(lines) };
}
async function privateFile(file, content) { await fs.writeFile(file, content, { flag: 'wx', mode: 0o600 }); }
async function readPrivateFile(file, maximum) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.size > maximum) fault('backup_integrity_failed');
  const descriptor = await fs.open(file, require('node:fs').constants.O_RDONLY | require('node:fs').constants.O_NOFOLLOW);
  try { return await descriptor.readFile('utf8'); } finally { await descriptor.close(); }
}
function facts(state, additional = {}) { return { backup: true, tables: state.tables.length, rows: state.rowCount, ...additional }; }

/** Capture a bounded, lossless logical snapshot into a newly created private
 * bundle directory. The caller supplies the trusted identity fingerprint and
 * owns retention of completed bundles. Requires direct schema/global ALL
 * privileges to prove catalog visibility; role-only grants, floating point,
 * foreign keys, generated columns, and non-table objects are unsupported.
 * Row and byte limits are explicit and fail closed. No credential is accepted
 * or emitted, and the supplied connection must be exclusively owned. */
async function createDatabaseBackup(connection, options = {}) {
  let session, transaction = false, madeDirectory = false, directory;
  const createdFiles = [];
  let state, outcome;
  try {
    const bounds = limits(options);
    directory = options.bundleDirectory;
    if (typeof directory !== 'string' || !path.isAbsolute(directory) || directory.includes('\0')) fault('invalid_bundle_directory');
    const database = await identity(connection, options.databaseFingerprint);
    await noTransaction(connection);
    await catalogVisibility(connection, database);
    session = await sessionStart(connection);
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', []);
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY', []); transaction = true;
    const tables = await catalog(connection, database);
    let rowCount = 0, byteCount = 0;
    const captured = [];
    for (const table of tables) {
      const data = await tableRows(connection, database, table, bounds);
      rowCount += data.count; byteCount += data.bytes;
      if (rowCount > bounds.maxRows || byteCount > bounds.maxBytes) fault('unsupported_backup_size', true);
      captured.push(data);
    }
    if (catalogHash(tables) !== catalogHash(await catalog(connection, database))) fault('schema_changed_during_backup');
    await identity(connection, options.databaseFingerprint);
    await connection.query('COMMIT', []); transaction = false;
    await fs.mkdir(directory, { mode: 0o700 }); madeDirectory = true;
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) fault('invalid_bundle_directory');
    const manifestTables = [];
    for (let index = 0; index < tables.length; index++) {
      const file = 'table-' + index + '.jsonl';
      const data = captured[index]; const content = data.lines.length ? data.lines.join('\n') + '\n' : '';
      createdFiles.push(file); await privateFile(path.join(directory, file), content);
      manifestTables.push({ ...tables[index], file, rowCount: data.count, rowHash: data.hash, fileHash: digest(content) });
    }
    const manifest = JSON.stringify({ version: 1, database, databaseFingerprint: options.databaseFingerprint, tables: manifestTables, rowCount, bounds });
    createdFiles.push('manifest.json'); await privateFile(path.join(directory, 'manifest.json'), manifest);
    state = { connection, fingerprint: options.databaseFingerprint, database, directory, tables: manifestTables, rowCount, bounds, manifestHash: digest(manifest), verified: false };
    outcome = closed('backup_ready', null, facts(state));
  } catch (error) {
    outcome = closed(error instanceof BackupFault && error.unsupported ? 'unsupported' : error instanceof BackupFault && error.code === 'session_cleanup_failed' ? 'manual_review_required' : 'blocked', classify(error), { manual: error instanceof BackupFault && error.code === 'session_cleanup_failed' });
  } finally {
    let cleanupFailed = false;
    if (transaction) { try { await connection.query('ROLLBACK', []); } catch { cleanupFailed = true; } }
    if (session) { try { await sessionEnd(connection, session); } catch { cleanupFailed = true; } }
    if (cleanupFailed) outcome = closed('manual_review_required', 'session_cleanup_failed', { backup: !!state, tables: state ? state.tables.length : 0, rows: state ? state.rowCount : 0, manual: true });
    if (madeDirectory && !state) {
      try { for (const file of createdFiles) { try { await fs.unlink(path.join(directory, file)); } catch (error) { if (error.code !== 'ENOENT') throw error; } } await fs.rmdir(directory); } catch { outcome = closed('manual_review_required', 'backup_cleanup_failed', { manual: true }); }
    }
  }
  if (state) handles.set(outcome, state);
  return outcome;
}
async function loadBundle(state) {
  const stat = await fs.lstat(state.directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) fault('backup_integrity_failed');
  const manifest = await readPrivateFile(path.join(state.directory, 'manifest.json'), state.bounds.maxBytes);
  if (digest(manifest) !== state.manifestHash) fault('backup_integrity_failed');
  const parsed = JSON.parse(manifest);
  if (parsed.version !== 1 || parsed.database !== state.database || parsed.databaseFingerprint !== state.fingerprint || JSON.stringify(parsed.tables) !== JSON.stringify(state.tables) || parsed.rowCount !== state.rowCount) fault('backup_integrity_failed');
  const result = [];
  for (const table of state.tables) {
    if (!/^table-\d+\.jsonl$/.test(table.file)) fault('backup_integrity_failed');
    const content = await readPrivateFile(path.join(state.directory, table.file), state.bounds.maxBytes);
    if (digest(content) !== table.fileHash || (content !== '' && !content.endsWith('\n'))) fault('backup_integrity_failed');
    const lines = content === '' ? [] : content.slice(0, -1).split('\n');
    if (lines.length !== table.rowCount || rowHash(lines) !== table.rowHash) fault('backup_integrity_failed');
    const decoded = lines.map((line) => {
      const row = JSON.parse(line);
      if (!Array.isArray(row) || row.length !== table.columns.length) fault('backup_integrity_failed');
      const value = row.map(decodeValue);
      if (canonicalRow(value) !== line) fault('backup_integrity_failed');
      return value;
    });
    result.push({ table, decoded });
  }
  return result;
}
async function restoreRecord(state, initial = false) {
  const file = path.join(state.directory, 'restore-state.json');
  const flags = initial ? 'wx' : require('node:fs').constants.O_WRONLY | require('node:fs').constants.O_NOFOLLOW | require('node:fs').constants.O_TRUNC;
  const descriptor = await fs.open(file, flags, 0o600);
  try {
    await descriptor.writeFile(JSON.stringify({ fingerprint: state.fingerprint, temporaryDatabase: state.pending.name, acknowledged: state.pending.acknowledged, dataVerified: state.pending.dataVerified }));
    await descriptor.close();
  } catch (error) {
    try { await descriptor.close(); } catch {}
    if (initial) { try { await fs.unlink(file); } catch { fault('restore_record_cleanup_failed'); } }
    throw error;
  }
}
function parameterExpression(column) {
  if (BINARY.has(column.type)) return '?';
  const charset = TEXT.has(column.type) ? column.charset : 'ascii';
  if (!CHARSETS.has(charset)) fault('backup_integrity_failed');
  return 'CONVERT(? USING ' + charset + ')';
}

/** Restore every table into an independently created temporary database and
 * compare normalized structure, complete row counts, and complete row hashes.
 * Only a successfully acknowledged CREATE DATABASE grants cleanup authority.
 * A completed source backup is always retained, including on verification failure. */
async function verifyDatabaseBackup(connection, handle) {
  const state = handle && handles.get(handle);
  if (!state || state.connection !== connection) return closed('blocked', 'invalid_backup_handle');
  if (state.pending) {
    const blocked = closed('manual_review_required', 'restore_cleanup_required', facts(state, { cleaned: false, manual: true }));
    handles.set(blocked, state); return blocked;
  }
  let session, temporary, created = false, attempted = false, cleaned = true, sessionCleaned = true, verified = false, outcome;
  try {
    await identity(connection, state.fingerprint); await noTransaction(connection);
    const bundle = await loadBundle(state);
    session = await sessionStart(connection);
    temporary = 'lens_restore_' + randomBytes(16).toString('hex');
    if (temporary === state.database) fault('restore_identity_mismatch');
    state.pending = { name: temporary, acknowledged: false, dataVerified: false };
    try { await restoreRecord(state, true); } catch (error) { if (!(error instanceof BackupFault && error.code === 'restore_record_cleanup_failed')) state.pending = null; throw error; }
    attempted = true;
    await connection.query('CREATE DATABASE ' + quote(temporary), []); created = true;
    state.pending.acknowledged = true; await restoreRecord(state);
    for (const { table, decoded } of bundle) {
      validateCreate(table.create, table.name);
      const prefix = 'CREATE TABLE ' + quote(table.name);
      const create = 'CREATE TABLE ' + quote(temporary) + '.' + quote(table.name) + table.create.slice(prefix.length);
      await connection.query(create, []);
      const expression = '(' + table.columns.map(parameterExpression).join(', ') + ')';
      for (let index = 0; index < decoded.length; index += 100) {
        const batch = decoded.slice(index, index + 100);
        const sql = 'INSERT INTO ' + quote(temporary) + '.' + quote(table.name) + ' (' + table.columns.map((column) => quote(column.name)).join(', ') + ') VALUES ' + batch.map(() => expression).join(', ');
        await connection.query(sql, batch.flat());
      }
    }
    const restored = await catalog(connection, temporary);
    if (catalogHash(restored) !== catalogHash(state.tables.map(({ name, columns, create }) => ({ name, columns, create })))) fault('restore_schema_mismatch');
    for (const table of state.tables) {
      const data = await tableRows(connection, temporary, table, state.bounds);
      if (data.count !== table.rowCount || data.hash !== table.rowHash) fault('restore_data_mismatch');
    }
    await identity(connection, state.fingerprint); verified = true; state.pending.dataVerified = true;
    outcome = closed('verified', null, facts(state, { verified: true }));
  } catch (error) {
    outcome = closed(error instanceof BackupFault && error.unsupported ? 'unsupported' : 'blocked', classify(error), facts(state));
  } finally {
    if (created) {
      try {
        await identity(connection, state.fingerprint);
        if (!temporary || temporary === state.database || !/^lens_restore_[a-f0-9]{32}$/.test(temporary)) fault('restore_identity_mismatch');
        await connection.query('DROP DATABASE ' + quote(temporary), []);
      } catch { cleaned = false; }
    } else if (attempted) {
      // An unacknowledged CREATE may have reached the server. Never guess
      // ownership or drop a database after a collision/network ambiguity.
      cleaned = false;
    }
    if (state.pending) {
      if (cleaned) {
        try { await fs.unlink(path.join(state.directory, 'restore-state.json')); state.pending = null; }
        catch { sessionCleaned = false; }
      } else { try { await restoreRecord(state); } catch { sessionCleaned = false; } }
    }
    if (session) { try { await sessionEnd(connection, session); } catch { sessionCleaned = false; } }
    if (!cleaned) outcome = closed('manual_review_required', 'restore_cleanup_required', facts(state, { cleaned: false, manual: true }));
    else if (!sessionCleaned) outcome = closed('manual_review_required', 'session_cleanup_failed', facts(state, { cleaned: true, manual: true }));
  }
  state.verified = verified && cleaned && sessionCleaned;
  handles.set(outcome, state);
  return outcome;
}
function isVerifiedDatabaseBackup(connection, handle) {
  const state = handle && handles.get(handle);
  return !!(state && state.connection === connection && state.verified && handle.ok && handle.restore_verified && handle.temporary_database_removed);
}

/** Restore the complete snapshot through a distinct, caller-owned connection.
 * Session-local InnoDB tables reproduce every table definition and row without
 * requiring global CREATE/DROP DATABASE privileges or changing business tables.
 * Only acknowledged temporary tables are explicitly removed; the caller must
 * always close the dedicated connection, including after an uncertain reply. */
async function verifyDatabaseBackupInSession(connection, handle, restoreConnection) {
  const state = handle && handles.get(handle);
  if (!state || state.connection !== connection) return closed('blocked', 'invalid_backup_handle');
  if (state.pending) return closed('manual_review_required', 'restore_cleanup_required', facts(state, { cleaned: false, manual: true }));
  let session, uncertainCreate = false, cleaned = true, sessionCleaned = true, verified = false, outcome;
  const created = [];
  state.verified = false;
  try {
    if (!restoreConnection || restoreConnection === connection) fault('restore_connection_invalid');
    await identity(connection, state.fingerprint);
    await identity(restoreConnection, state.fingerprint);
    await noTransaction(connection);
    await noTransaction(restoreConnection);
    const sourceId = await rows(connection, 'SELECT CONNECTION_ID() AS connection_id');
    const targetId = await rows(restoreConnection, 'SELECT CONNECTION_ID() AS connection_id');
    if (sourceId.length !== 1 || targetId.length !== 1 ||
        !/^[1-9]\d{0,19}$/.test(String(sourceId[0].connection_id)) ||
        !/^[1-9]\d{0,19}$/.test(String(targetId[0].connection_id)) ||
        String(sourceId[0].connection_id) === String(targetId[0].connection_id)) fault('restore_connection_invalid');
    const bundle = await loadBundle(state);
    session = await sessionStart(restoreConnection);
    for (const { table, decoded } of bundle) {
      validateCreate(table.create, table.name);
      const temporary = 'lens_restore_' + randomBytes(16).toString('hex');
      const qualified = quote(state.database) + '.' + quote(temporary);
      const prefix = 'CREATE TABLE ' + quote(table.name);
      uncertainCreate = true;
      await restoreConnection.query('CREATE TEMPORARY TABLE ' + qualified + table.create.slice(prefix.length), []);
      created.push(qualified); uncertainCreate = false;
      const expression = '(' + table.columns.map(parameterExpression).join(', ') + ')';
      for (let index = 0; index < decoded.length; index += 100) {
        const batch = decoded.slice(index, index + 100);
        await restoreConnection.query('INSERT INTO ' + qualified + ' (' + table.columns.map(column => quote(column.name)).join(', ') + ') VALUES ' + batch.map(() => expression).join(', '), batch.flat());
      }
      const definition = await rows(restoreConnection, 'SHOW CREATE TABLE ' + qualified);
      const actual = definition.length === 1 && definition[0]['Create Table'];
      const actualPrefix = 'CREATE TEMPORARY TABLE ' + quote(temporary);
      if (typeof actual !== 'string' || !actual.startsWith(actualPrefix + ' (') ||
          structuralSql(prefix + actual.slice(actualPrefix.length)) !== structuralSql(table.create)) fault('restore_schema_mismatch');
      const data = await tableRows(restoreConnection, state.database, { ...table, name: temporary }, state.bounds);
      if (data.count !== table.rowCount || data.hash !== table.rowHash) fault('restore_data_mismatch');
    }
    await identity(connection, state.fingerprint);
    verified = true;
    outcome = closed('verified', null, facts(state, { verified: true }));
  } catch (error) {
    outcome = closed(error instanceof BackupFault && error.unsupported ? 'unsupported' : 'blocked', classify(error), facts(state));
  } finally {
    for (const qualified of created.reverse()) {
      try { await restoreConnection.query('DROP TEMPORARY TABLE ' + qualified, []); }
      catch { cleaned = false; }
    }
    if (uncertainCreate) cleaned = false;
    if (session) { try { await sessionEnd(restoreConnection, session); } catch { sessionCleaned = false; } }
    if (!cleaned) outcome = closed('manual_review_required', 'restore_cleanup_required', facts(state, { cleaned: false, manual: true }));
    else if (!sessionCleaned) outcome = closed('manual_review_required', 'session_cleanup_failed', facts(state, { manual: true }));
  }
  state.verified = verified && cleaned && sessionCleaned;
  handles.set(outcome, state);
  return outcome;
}

module.exports = { createDatabaseBackup, verifyDatabaseBackup, verifyDatabaseBackupInSession, isVerifiedDatabaseBackup };
