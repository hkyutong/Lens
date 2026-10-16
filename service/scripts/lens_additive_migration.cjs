'use strict';

const { createHash } = require('node:crypto');
const { Table } = require('typeorm');
const { isAdditiveAttachmentPlan } = require('./attachment_schema_plan.cjs');

/* BEGIN APPROVED SCHEMA */
// Explicit contract for this reviewed entity revision; never inferred from the live database.
const APPROVED = Object.freeze({"metadataHash":"c967d030463f7db98cb8a44279def6764b8bac28adb9fe322990caab7b88c7d4","attachmentName":"attachment","planName":"crami_package"});
/* END APPROVED SCHEMA */

const plans = new WeakMap();
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const TYPES = new Set(['tinyint', 'smallint', 'mediumint', 'int', 'bigint', 'float', 'double', 'decimal', 'date', 'time', 'datetime', 'timestamp', 'year', 'char', 'varchar', 'binary', 'varbinary', 'tinytext', 'text', 'mediumtext', 'longtext', 'tinyblob', 'blob', 'mediumblob', 'longblob', 'enum', 'set', 'json']);
const NUMERIC = new Set(['tinyint', 'smallint', 'mediumint', 'int', 'bigint', 'float', 'double', 'decimal']);
const TEMPORAL = new Set(['datetime', 'timestamp', 'time']);
const FINGERPRINT = /^[a-f0-9]{64}$/;

class MigrationFault extends Error {
  constructor(code) { super(code); this.code = code; }
}
function fail(code) { throw new MigrationFault(code); }
function identifier(value) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) fail('invalid_metadata');
  return value;
}
function quote(value) { return '`' + identifier(value) + '`'; }
function integer(value, maximum = 65535) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > maximum) fail('invalid_metadata');
  return number;
}
function scalar(value) {
  if (value === undefined || value === null) return null;
  if (!['string', 'number', 'boolean'].includes(typeof value)) fail('invalid_metadata');
  if (typeof value === 'number' && !Number.isFinite(value)) fail('invalid_metadata');
  const result = String(value);
  if (result.length > 8192 || result.includes('\0')) fail('invalid_metadata');
  return result;
}
function normalizeMetadata(metadata) {
  if (!Array.isArray(metadata) || metadata.length === 0 || metadata.length > 256) fail('invalid_metadata');
  const tables = metadata.map((entity) => {
    if (!entity || !entity.connection || !entity.connection.driver) fail('invalid_metadata');
    const table = Table.create(entity, entity.connection.driver);
    const name = identifier(table.name);
    const columns = table.columns.map((column) => {
      const type = String(column.type).toLowerCase();
      if (!TYPES.has(type)) fail('unsupported_metadata');
      return {
        name: identifier(column.name), type, length: integer(column.length),
        precision: integer(column.precision), scale: integer(column.scale),
        nullable: column.isNullable === true, primary: column.isPrimary === true,
        generated: column.isGenerated === true, unsigned: column.unsigned === true, unique: column.isUnique === true,
        default: scalar(column.default), onUpdate: scalar(column.onUpdate),
        enum: column.enum ? column.enum.map(scalar) : null,
      };
    });
    const indices = table.indices.map((index) => ({
      name: identifier(index.name), columns: index.columnNames.map(identifier),
      unique: index.isUnique === true, fulltext: index.isFulltext === true,
      spatial: index.isSpatial === true,
    })).sort((a, b) => a.name.localeCompare(b.name));
    if (!columns.length || new Set(columns.map((column) => column.name)).size !== columns.length) fail('invalid_metadata');
    if (new Set(indices.map((index) => index.name)).size !== indices.length) fail('invalid_metadata');
    if (indices.some((index) => !index.columns.length || index.columns.some((name) => !columns.some((column) => column.name === name)))) fail('invalid_metadata');
    // Foreign keys and unique constraints belong to the metadata fingerprint,
    // but are never generated or modified by this migration.
    const foreignKeys = table.foreignKeys.map((key) => ({
      name: identifier(key.name), columns: key.columnNames.map(identifier),
      table: identifier(key.referencedTableName), referenced: key.referencedColumnNames.map(identifier),
    })).sort((a, b) => a.name.localeCompare(b.name));
    const uniques = table.uniques.map((key) => ({ name: identifier(key.name), columns: key.columnNames.map(identifier) })).sort((a, b) => a.name.localeCompare(b.name));
    return { name, columns, indices, foreignKeys, uniques };
  }).sort((a, b) => a.name.localeCompare(b.name));
  if (new Set(tables.map((table) => table.name)).size !== tables.length) fail('invalid_metadata');
  return tables;
}
function schemaDigest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function approvedMetadata(metadata) {
  const tables = normalizeMetadata(metadata);
  if (!APPROVED || schemaDigest(tables) !== APPROVED.metadataHash) fail('metadata_contract_mismatch');
  const attachment = tables.find((table) => table.name === APPROVED.attachmentName);
  const plan = tables.find((table) => table.name === APPROVED.planName);
  const entitlement = plan && plan.columns.find((column) => column.name === 'entitlements');
  if (!attachment || !entitlement || !entitlement.nullable || entitlement.primary || entitlement.generated || entitlement.default !== null) fail('metadata_contract_mismatch');
  if (attachment.foreignKeys.length || attachment.uniques.length) fail('unsupported_metadata');
  return { tables, attachment, plan, entitlement };
}
function result(status, error = null, creates = 0, adds = 0, manual = false) {
  return Object.freeze({
    ok: status === 'ready' || status === 'applied' || status === 'already_current', status, error,
    create_tables: creates, add_columns: adds, data_preserved: true, needs_manual_review: manual,
  });
}
function errorCode(error) { return error instanceof MigrationFault ? error.code : 'database_operation_failed'; }
function connectionCheck(connection, fingerprint) {
  if (!connection || typeof connection.query !== 'function' || typeof fingerprint !== 'string' || !FINGERPRINT.test(fingerprint)) fail('invalid_request');
}
async function queryRows(connection, sql, parameters = []) {
  const response = await connection.query(sql, parameters);
  if (!Array.isArray(response) || !Array.isArray(response[0])) fail('invalid_adapter_response');
  return response[0];
}
async function assertIdentity(connection, fingerprint) {
  const rows = await queryRows(connection, 'SELECT DATABASE() AS schema_name');
  if (rows.length !== 1 || typeof rows[0].schema_name !== 'string' || !rows[0].schema_name) fail('database_identity_mismatch');
  const digest = createHash('sha256').update(rows[0].schema_name).digest('hex');
  if (digest !== fingerprint) fail('database_identity_mismatch');
}
function catalogProjection(row, fields) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) fail('invalid_adapter_response');
  const projected = {};
  for (const [alias, native] of fields) {
    const key = Object.prototype.hasOwnProperty.call(row, alias) ? alias : native;
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const value = row[key];
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) fail('invalid_adapter_response');
    if (typeof value === 'number' && !Number.isFinite(value)) fail('invalid_adapter_response');
    projected[alias] = value;
  }
  return projected;
}
const TABLE_FIELDS = [
  ['table_name', 'TABLE_NAME'], ['engine', 'ENGINE'], ['table_type', 'TABLE_TYPE'],
  ['row_format', 'ROW_FORMAT'], ['table_collation', 'TABLE_COLLATION'],
  ['create_options', 'CREATE_OPTIONS'], ['table_comment', 'TABLE_COMMENT'],
];
const COLUMN_FIELDS = [
  ['table_name', 'TABLE_NAME'], ['column_name', 'COLUMN_NAME'], ['ordinal_position', 'ORDINAL_POSITION'],
  ['data_type', 'DATA_TYPE'], ['column_type', 'COLUMN_TYPE'], ['is_nullable', 'IS_NULLABLE'],
  ['column_default', 'COLUMN_DEFAULT'], ['extra', 'EXTRA'], ['character_length', 'CHARACTER_MAXIMUM_LENGTH'],
  ['character_octet_length', 'CHARACTER_OCTET_LENGTH'], ['numeric_precision', 'NUMERIC_PRECISION'],
  ['numeric_scale', 'NUMERIC_SCALE'], ['datetime_precision', 'DATETIME_PRECISION'],
  ['character_set_name', 'CHARACTER_SET_NAME'], ['collation_name', 'COLLATION_NAME'],
  ['column_key', 'COLUMN_KEY'], ['column_comment', 'COLUMN_COMMENT'],
  ['generation_expression', 'GENERATION_EXPRESSION'], ['srs_id', 'SRS_ID'],
];
const INDEX_FIELDS = [
  ['table_name', 'TABLE_NAME'], ['index_name', 'INDEX_NAME'], ['non_unique', 'NON_UNIQUE'],
  ['sequence_number', 'SEQ_IN_INDEX'], ['column_name', 'COLUMN_NAME'], ['sub_part', 'SUB_PART'],
  ['index_type', 'INDEX_TYPE'], ['collation', 'COLLATION'], ['packed', 'PACKED'], ['nullable', 'NULLABLE'],
  ['comment', 'COMMENT'], ['index_comment', 'INDEX_COMMENT'], ['is_visible', 'IS_VISIBLE'], ['expression', 'EXPRESSION'],
];
async function readSnapshot(connection) {
  // Read optional version-specific structural fields without requiring a
  // particular server version. Operational counters, privileges, schema names,
  // cardinality and timestamps are discarded inside this function.
  const tables = (await queryRows(connection, 'SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()')).map((row) => catalogProjection(row, TABLE_FIELDS));
  const columns = (await queryRows(connection, 'SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE()')).map((row) => catalogProjection(row, COLUMN_FIELDS));
  const indices = (await queryRows(connection, 'SELECT * FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE()')).map((row) => catalogProjection(row, INDEX_FIELDS));
  const snapshot = new Map();
  for (const row of tables) {
    if (typeof row.table_name !== 'string' || snapshot.has(row.table_name)) fail('invalid_adapter_response');
    snapshot.set(row.table_name, { engine: row.engine, tableType: row.table_type, structure: row, columns: new Map(), indices: new Map() });
  }
  for (const row of columns) {
    const table = snapshot.get(row.table_name);
    if (!table || typeof row.column_name !== 'string' || table.columns.has(row.column_name)) fail('invalid_adapter_response');
    table.columns.set(row.column_name, row);
  }
  for (const row of indices) {
    const table = snapshot.get(row.table_name);
    if (!table || typeof row.index_name !== 'string' || !Number.isInteger(Number(row.sequence_number))) fail('invalid_adapter_response');
    const entries = table.indices.get(row.index_name) || [];
    entries.push(row); table.indices.set(row.index_name, entries);
  }
  return snapshot;
}
function normalizedDefault(value) {
  if (value === undefined || value === null) return null;
  let text = String(value);
  if (text.startsWith("'") && text.endsWith("'")) text = text.slice(1, -1).replace(/''/g, "'").replace(/\\'/g, "'");
  if (/^current_timestamp(?:\(\d*\))?$/i.test(text)) return text.toUpperCase().replace(/\(0?\)$/, '');
  return text;
}
function compatibleColumn(expected, actual) {
  if (actual.data_type !== expected.type || (actual.is_nullable === 'YES') !== expected.nullable || (actual.column_key === 'PRI') !== expected.primary) return false;
  if (String(actual.generation_expression || '') !== '') return false;
  const extra = String(actual.extra || '').toLowerCase();
  if (extra.includes('auto_increment') !== expected.generated || /\bzerofill\b/i.test(String(actual.column_type || ''))) return false;
  if (/\bunsigned\b/i.test(String(actual.column_type || '')) !== expected.unsigned) return false;
  if (['varchar', 'char', 'binary', 'varbinary'].includes(expected.type) && Number(actual.character_length) !== (expected.length || 255)) return false;
  if (['float', 'double'].includes(expected.type) && expected.precision !== null && Number(actual.numeric_precision) !== expected.precision) return false;
  if (expected.type === 'decimal' && (Number(actual.numeric_precision) !== (expected.precision || 10) || Number(actual.numeric_scale) !== (expected.scale || 0))) return false;
  if (TEMPORAL.has(expected.type) && Number(actual.datetime_precision || 0) !== (expected.precision || 0)) return false;
  if (normalizedDefault(actual.column_default) !== normalizedDefault(expected.default)) return false;
  const update = extra.match(/on update (current_timestamp(?:\(\d*\))?)/i);
  if (normalizedDefault(update ? update[1] : null) !== normalizedDefault(expected.onUpdate)) return false;
  if (expected.enum) {
    const literal = expected.type + '(' + expected.enum.map((value) => "'" + value.replace(/'/g, "''") + "'").join(',') + ')';
    if (String(actual.column_type).replace(/\\'/g, "''") !== literal) return false;
  }
  return true;
}
function compatibleIndex(expected, entries) {
  if (!entries || entries.length !== expected.columns.length) return false;
  const ordered = [...entries].sort((a, b) => Number(a.sequence_number) - Number(b.sequence_number));
  return ordered.every((entry, index) => Number(entry.sequence_number) === index + 1 && entry.column_name === expected.columns[index] && !entry.sub_part && (Number(entry.non_unique) === 0) === expected.unique && (String(entry.index_type).toUpperCase() === 'FULLTEXT') === expected.fulltext && (String(entry.index_type).toUpperCase() === 'SPATIAL') === expected.spatial);
}
function inspect(contract, snapshot) {
  const operations = [];
  for (const expected of contract.tables) {
    const actual = snapshot.get(expected.name);
    if (!actual) {
      if (expected.name !== contract.attachment.name) fail('unexpected_missing_table');
      operations.push({ kind: 'create_attachment' }); continue;
    }
    if (actual.tableType !== 'BASE TABLE' || String(actual.engine).toUpperCase() !== 'INNODB') fail('incompatible_schema');
    if (expected.name === contract.attachment.name) {
      const allowedIndices = new Set([...expected.indices.map((index) => index.name), 'PRIMARY']);
      if (actual.columns.size !== expected.columns.length || [...actual.indices.keys()].some((name) => !allowedIndices.has(name))) fail('incompatible_schema');
    }
    for (const column of expected.columns) {
      const live = actual.columns.get(column.name);
      if (!live) {
        if (expected.name !== contract.plan.name || column.name !== 'entitlements') fail('unexpected_missing_column');
        operations.push({ kind: 'add_entitlements' }); continue;
      }
      if (!compatibleColumn(column, live)) fail('incompatible_schema');
    }
    const primary = expected.columns.filter((column) => column.primary).map((column) => column.name);
    if (primary.length && !compatibleIndex({ columns: primary, unique: true, fulltext: false, spatial: false }, actual.indices.get('PRIMARY'))) fail('incompatible_schema');
    for (const column of expected.columns.filter((candidate) => candidate.unique)) {
      if (![...actual.indices.values()].some((entries) => compatibleIndex({ columns: [column.name], unique: true, fulltext: false, spatial: false }, entries))) fail('incompatible_schema');
    }
    for (const index of expected.indices) if (!compatibleIndex(index, actual.indices.get(index.name))) fail('incompatible_schema');
    // Existing columns and indexes unknown to the entities remain untouched.
  }
  return operations;
}
function columnDefinition(column) {
  const permitted = new Set(['varchar', 'int', 'datetime', 'text']);
  if (!permitted.has(column.type) || column.generated || column.enum || column.onUpdate !== null) fail('unsupported_ddl');
  let type = column.type;
  if (column.type === 'varchar') {
    if (!column.length || column.length > 16383) fail('unsupported_ddl');
    type += '(' + column.length + ')';
  }
  if (column.type === 'datetime' && column.precision !== null) {
    if (column.precision > 6) fail('unsupported_ddl');
    type += '(' + column.precision + ')';
  }
  if (column.unsigned) {
    if (!NUMERIC.has(column.type)) fail('unsupported_ddl');
    type += ' UNSIGNED';
  }
  let text = quote(column.name) + ' ' + type + (column.nullable ? ' NULL' : ' NOT NULL');
  if (column.default !== null) {
    if (!/^CURRENT_TIMESTAMP(?:\([0-6]?\))?$/i.test(column.default) || column.type !== 'datetime') fail('unsupported_ddl');
    text += ' DEFAULT ' + column.default.toUpperCase();
  }
  return text;
}
function compileCreate(table) {
  const definitions = table.columns.map(columnDefinition);
  const primary = table.columns.filter((column) => column.primary);
  if (!primary.length) fail('unsupported_ddl');
  definitions.push('PRIMARY KEY (' + primary.map((column) => quote(column.name)).join(', ') + ')');
  for (const index of table.indices) {
    if (index.fulltext || index.spatial) fail('unsupported_ddl');
    definitions.push((index.unique ? 'UNIQUE ' : '') + 'INDEX ' + quote(index.name) + ' (' + index.columns.map(quote).join(', ') + ')');
  }
  const sql = 'CREATE TABLE ' + quote(table.name) + ' (' + definitions.join(', ') + ') ENGINE=InnoDB';
  if (!isAdditiveAttachmentPlan(table.name, [sql])) fail('unsafe_plan');
  return sql;
}
function compileOperations(contract, operations) {
  if (!Array.isArray(operations) || operations.length > 2 || new Set(operations.map((operation) => operation.kind)).size !== operations.length) fail('unsafe_plan');
  return operations.map((operation) => {
    if (operation.kind === 'create_attachment') return { kind: operation.kind, sql: compileCreate(contract.attachment) };
    if (operation.kind === 'add_entitlements') {
      const column = contract.entitlement;
      if (!column.nullable || column.primary || column.default !== null || column.name !== 'entitlements') fail('unsafe_plan');
      return { kind: operation.kind, sql: 'ALTER TABLE ' + quote(contract.plan.name) + ' ADD COLUMN ' + columnDefinition(column) };
    }
    fail('unsafe_plan');
  });
}
function counts(operations) {
  return [operations.filter((operation) => operation.kind === 'create_attachment').length, operations.filter((operation) => operation.kind === 'add_entitlements').length];
}
function duplicateError(error) {
  return error && (error.code === 'ER_TABLE_EXISTS_ERROR' || error.code === 'ER_DUP_FIELDNAME' || error.errno === 1050 || error.errno === 1060);
}

/** Build a sealed, connection-bound plan. The fingerprint is SHA-256 of the
 * approved database name, supplied by the caller's controlled connection setup.
 * Both APIs require exclusive use of one mysql2/promise connection. Neither API
 * creates a connection, configures TypeORM synchronization, or returns SQL. */
async function planAdditiveMigration(connection, entityMetadatas, options = {}) {
  try {
    connectionCheck(connection, options.databaseFingerprint);
    const contract = approvedMetadata(entityMetadatas);
    await assertIdentity(connection, options.databaseFingerprint);
    const snapshot = await readSnapshot(connection);
    const operations = inspect(contract, snapshot);
    compileOperations(contract, operations);
    const [creates, adds] = counts(operations);
    const publicPlan = result(operations.length ? 'ready' : 'already_current', null, creates, adds);
    plans.set(publicPlan, { connection, fingerprint: options.databaseFingerprint, kinds: operations.map((operation) => operation.kind), snapshot, contract });
    return publicPlan;
  } catch (error) { return result('blocked', errorCode(error)); }
}

/** Execute only this module's sealed plan. DDL is not transactional in MySQL.
 * On any uncertain DDL/postflight outcome, preserve all objects and user data
 * and require manual review; this module deliberately has no DROP capability. */
async function executeAdditiveMigration(connection, entityMetadatas, publicPlan) {
  const approvedPlan = publicPlan && plans.get(publicPlan);
  if (!approvedPlan || approvedPlan.connection !== connection) return result('blocked', 'invalid_plan');
  let locked = false;
  let ddlAttempted = false;
  let outcome;
  let completed = [];
  const lockName = 'lens:additive:' + approvedPlan.fingerprint.slice(0, 40);
  try {
    connectionCheck(connection, approvedPlan.fingerprint);
    const contract = approvedMetadata(entityMetadatas);
    await assertIdentity(connection, approvedPlan.fingerprint);
    const lockRows = await queryRows(connection, 'SELECT GET_LOCK(?, 0) AS acquired', [lockName]);
    if (lockRows.length !== 1 || Number(lockRows[0].acquired) !== 1) fail('migration_busy');
    locked = true;
    await assertIdentity(connection, approvedPlan.fingerprint);
    const operations = inspect(contract, await readSnapshot(connection));
    if (operations.some((operation) => !approvedPlan.kinds.includes(operation.kind))) fail('schema_changed_after_plan');
    const compiled = compileOperations(contract, operations);
    for (const operation of compiled) {
      await assertIdentity(connection, approvedPlan.fingerprint);
      // Reinspect immediately before each DDL, including changes made by an
      // actor that does not use this module's advisory lock.
      const remaining = inspect(contract, await readSnapshot(connection));
      if (!remaining.some((candidate) => candidate.kind === operation.kind)) continue;
      ddlAttempted = true;
      try {
        await connection.query(operation.sql, []);
        completed.push(operation);
      } catch (error) {
        if (!duplicateError(error)) throw error;
        const raced = inspect(contract, await readSnapshot(connection));
        if (raced.some((candidate) => candidate.kind === operation.kind)) fail('concurrent_schema_incompatible');
      }
      const after = inspect(contract, await readSnapshot(connection));
      if (after.some((candidate) => candidate.kind === operation.kind)) fail('postflight_failed');
    }
    await assertIdentity(connection, approvedPlan.fingerprint);
    if (inspect(contract, await readSnapshot(connection)).length) fail('postflight_failed');
    const [creates, adds] = counts(completed);
    outcome = result(completed.length ? 'applied' : 'already_current', null, creates, adds);
  } catch (error) {
    const [creates, adds] = counts(completed);
    outcome = result(ddlAttempted ? 'manual_review_required' : 'blocked', errorCode(error), creates, adds, ddlAttempted);
  } finally {
    if (locked) {
      try {
        const released = await queryRows(connection, 'SELECT RELEASE_LOCK(?) AS released', [lockName]);
        if (released.length !== 1 || Number(released[0].released) !== 1) throw new MigrationFault('lock_release_failed');
      } catch {
        const [creates, adds] = counts(completed);
        outcome = result('manual_review_required', 'lock_release_failed', creates, adds, true);
      }
    }
  }
  return outcome;
}

function sameStructure(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function orderedIndex(entries) { return [...entries].sort((a, b) => Number(a.sequence_number) - Number(b.sequence_number)); }
function stableSnapshot(snapshot) {
  return [...snapshot.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, table]) => ({
    name, structure: table.structure,
    columns: [...table.columns.entries()].sort(([left], [right]) => left.localeCompare(right)),
    indices: [...table.indices.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([index, entries]) => [index, orderedIndex(entries)]),
  }));
}
function compatibilityResult(status, error = null, baseline, additions = 0) {
  const verified = status === 'compatible';
  return Object.freeze({
    ok: verified, status, error,
    original_tables_verified: verified, original_columns_verified: verified, original_indexes_verified: verified,
    original_table_count: verified ? baseline.size : 0,
    original_column_count: verified ? [...baseline.values()].reduce((sum, table) => sum + table.columns.size, 0) : 0,
    original_index_count: verified ? [...baseline.values()].reduce((sum, table) => sum + table.indices.size, 0) : 0,
    allowed_additions: verified ? additions : 0, data_preserved: true,
    needs_manual_review: status === 'incompatible' || status === 'manual_review_required',
  });
}
function compareHistoricalSchema(approvedPlan, current) {
  const { snapshot: baseline, contract, kinds } = approvedPlan;
  let additions = 0;
  for (const [name, original] of baseline) {
    const live = current.get(name);
    if (!live || !sameStructure(original.structure, live.structure)) fail('historical_schema_changed');
    for (const [column, definition] of original.columns) {
      if (!live.columns.has(column) || !sameStructure(definition, live.columns.get(column))) fail('historical_schema_changed');
    }
    for (const [index, entries] of original.indices) {
      if (!live.indices.has(index) || !sameStructure(orderedIndex(entries), orderedIndex(live.indices.get(index)))) fail('historical_schema_changed');
    }
    for (const column of live.columns.keys()) {
      if (original.columns.has(column)) continue;
      if (name !== contract.plan.name || column !== 'entitlements' || !kinds.includes('add_entitlements') || !compatibleColumn(contract.entitlement, live.columns.get(column))) fail('historical_unapproved_addition');
      additions++;
    }
    if ([...live.indices.keys()].some((index) => !original.indices.has(index))) fail('historical_unapproved_addition');
  }
  for (const name of current.keys()) {
    if (baseline.has(name)) continue;
    if (name !== contract.attachment.name || !kinds.includes('create_attachment')) fail('historical_unapproved_addition');
    additions++;
  }
  // Validate any approved additions against the same frozen entity contract.
  // Missing approved additions remain compatible with the original schema.
  inspect(contract, current);
  return additions;
}

/** Verify the pre-migration schema using only the original sealed plan. The
 * private baseline includes every original table, column and index, including
 * objects outside the entity contract. No historical application metadata is
 * required, and this function never modifies a schema or returns raw fields. */
async function verifyHistoricalSchemaCompatibility(connection, publicPlan) {
  const approvedPlan = publicPlan && plans.get(publicPlan);
  if (!approvedPlan || approvedPlan.connection !== connection) return compatibilityResult('blocked', 'invalid_plan');
  let locked = false, outcome;
  const lockName = 'lens:additive:' + approvedPlan.fingerprint.slice(0, 40);
  try {
    connectionCheck(connection, approvedPlan.fingerprint);
    await assertIdentity(connection, approvedPlan.fingerprint);
    const lockRows = await queryRows(connection, 'SELECT GET_LOCK(?, 0) AS acquired', [lockName]);
    if (lockRows.length !== 1 || Number(lockRows[0].acquired) !== 1) fail('migration_busy');
    locked = true;
    await assertIdentity(connection, approvedPlan.fingerprint);
    const current = await readSnapshot(connection);
    const additions = compareHistoricalSchema(approvedPlan, current);
    const confirmation = await readSnapshot(connection);
    if (!sameStructure(stableSnapshot(current), stableSnapshot(confirmation))) fail('historical_schema_changed');
    await assertIdentity(connection, approvedPlan.fingerprint);
    outcome = compatibilityResult('compatible', null, approvedPlan.snapshot, additions);
  } catch (error) {
    const code = errorCode(error);
    const incompatible = ['historical_schema_changed', 'historical_unapproved_addition', 'incompatible_schema', 'unexpected_missing_table', 'unexpected_missing_column'].includes(code);
    outcome = compatibilityResult(incompatible ? 'incompatible' : 'blocked', code);
  } finally {
    if (locked) {
      try {
        const released = await queryRows(connection, 'SELECT RELEASE_LOCK(?) AS released', [lockName]);
        if (released.length !== 1 || Number(released[0].released) !== 1) fail('lock_release_failed');
      } catch { outcome = compatibilityResult('manual_review_required', 'lock_release_failed'); }
    }
  }
  return outcome;
}

module.exports = { planAdditiveMigration, executeAdditiveMigration, verifyHistoricalSchemaCompatibility };
