"use strict";

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const core = require('./lens_database_backup.cjs');
const DATABASE = 'synthetic_backup_database';
const FINGERPRINT = createHash('sha256').update(DATABASE).digest('hex');
const SECRET = 'synthetic-private-error-do-not-emit';
const tests = [];
const fixtures = [];
let nextConnectionId = 1;
function test(run) { tests.push(run); }
function bytes(value) { return value === null ? null : Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value); }
function template(name, populated = false) {
  const columns = populated ? [
    { name: 'id', type: 'bigint', charset: null }, { name: 'amount', type: 'decimal', charset: null },
    { name: 'body', type: 'text', charset: 'utf8mb4' }, { name: 'binary_data', type: 'blob', charset: null },
    { name: 'seen_at', type: 'datetime', charset: null, extra: 'DEFAULT_GENERATED' }, { name: 'document', type: 'json', charset: 'utf8mb4' },
  ] : [{ name: 'id', type: 'int', charset: null }];
  const create = populated ? 'CREATE TABLE `' + name + '` (`id` bigint NOT NULL, `amount` decimal(20,6) NOT NULL, `body` text, `binary_data` blob, `seen_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6), `document` json, PRIMARY KEY (`id`)) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4' : 'CREATE TABLE `' + name + '` (`id` int NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
  const data = populated ? [
    ['9007199254740993', '1234567890.123456', '合成文本😀', Buffer.from([0, 1, 255, 127]), '2026-01-02 03:04:05.123456', '{"a":1}'].map(bytes),
    ['9007199254740994', '-0.000001', '', null, '0000-00-00 00:00:00.000000', '{"nested":[true,null]}'].map(bytes),
  ] : [];
  return { name, columns, create, data, engine: 'InnoDB', tableType: 'BASE TABLE' };
}
class Adapter {
  constructor() {
    this.identifier = nextConnectionId++;
    this.database = DATABASE;
    this.databases = new Map([[DATABASE, new Map([['synthetic_documents', template('synthetic_documents', true)], ['synthetic_empty', template('synthetic_empty')]])]]);
    this.objects = { triggers: 0, routines: 0, events: 0, foreign_keys: 0 };
    this.session = { time_zone: 'SYSTEM', sql_mode: 'STRICT_TRANS_TABLES,NO_ZERO_DATE' };
    this.transaction = false;
    this.temporaryTables = new Map();
    this.queries = []; this.created = []; this.dropped = []; this.hook = null; this.visibility = true;
  }
  async query(query, parameters = []) {
    const sql = typeof query === 'string' ? query : query.sql;
    this.queries.push({ sql, parameters });
    if (this.hook) await this.hook(sql, parameters, this);
    if (sql === 'SELECT DATABASE() AS schema_name') return [[{ schema_name: this.database }], []];
    if (sql === 'SELECT CONNECTION_ID() AS connection_id') return [[{ connection_id: this.identifier }], []];
    if (sql === 'SELECT @@session.in_transaction AS in_transaction') {
      throw Object.assign(new Error(SECRET), { code: 'ER_UNKNOWN_SYSTEM_VARIABLE' });
    }
    if (sql === 'DO 0') return [{ serverStatus: this.transaction ? 3 : 2 }, []];
    if (sql === 'SHOW GRANTS FOR CURRENT_USER()') return [[{ grant: this.visibility ? 'GRANT ALL PRIVILEGES ON *.* TO synthetic' : 'GRANT SELECT ON `synthetic_backup_database`.* TO synthetic' }], []];
    if (sql === 'SELECT @@session.time_zone AS time_zone, @@session.sql_mode AS sql_mode') return [[{ ...this.session }], []];
    if (sql === 'SET SESSION time_zone = ?') { this.session.time_zone = parameters[0]; return [{}, []]; }
    if (sql === 'SET SESSION sql_mode = ?') { this.session.sql_mode = parameters[0]; return [{}, []]; }
    if (sql === 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ') return [{}, []];
    if (sql === 'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY') { this.transaction = true; return [{}, []]; }
    if (sql === 'COMMIT' || sql === 'ROLLBACK') { this.transaction = false; return [{}, []]; }
    if (sql.includes('INFORMATION_SCHEMA.TABLES')) return [[...this.databases.get(parameters[0]).values()].map((table) => ({ table_name: table.name, table_type: table.tableType, engine: table.engine })), []];
    if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) return [[...this.databases.get(parameters[0]).values()].flatMap((table) => table.columns.map((column, index) => ({ table_name: table.name, column_name: column.name, data_type: column.type, character_set_name: column.charset, extra: column.extra || '', generation_expression: column.generated || '', ordinal_position: index + 1 }))), []];
    if (sql.includes('INFORMATION_SCHEMA.TRIGGERS')) return [[{ object_count: this.objects.triggers }], []];
    if (sql.includes('INFORMATION_SCHEMA.ROUTINES')) return [[{ object_count: this.objects.routines }], []];
    if (sql.includes('INFORMATION_SCHEMA.EVENTS')) return [[{ object_count: this.objects.events }], []];
    if (sql.includes('INFORMATION_SCHEMA.KEY_COLUMN_USAGE')) return [[{ object_count: this.objects.foreign_keys }], []];
    let match;
    if ((match = sql.match(/^CREATE TEMPORARY TABLE `([A-Za-z0-9_]+)`\.`(lens_restore_[a-f0-9]{32})` (.+)$/s))) {
      assert.equal(match[1], DATABASE);
      if (this.temporaryTables.has(match[2])) throw Object.assign(new Error(SECRET), { code: 'ER_TABLE_EXISTS_ERROR' });
      const original = [...this.databases.get(DATABASE).values()].find(table => table.create.slice(table.create.indexOf(' (')) === ' ' + match[3]);
      assert(original);
      this.temporaryTables.set(match[2], { ...original, name: match[2], create: 'CREATE TEMPORARY TABLE `' + match[2] + '` ' + match[3], data: [] });
      this.created.push(match[2]); return [{}, []];
    }
    if ((match = sql.match(/^DROP TEMPORARY TABLE `([A-Za-z0-9_]+)`\.`(lens_restore_[a-f0-9]{32})`$/))) {
      assert.equal(match[1], DATABASE); assert(this.temporaryTables.has(match[2]));
      this.temporaryTables.delete(match[2]); this.dropped.push(match[2]); return [{}, []];
    }
    if ((match = sql.match(/^SHOW CREATE TABLE `([A-Za-z0-9_]+)`\.`(lens_restore_[a-f0-9]{32})`$/))) {
      return [[{ 'Create Table': this.temporaryTables.get(match[2]).create }], []];
    }
    if ((match = sql.match(/^INSERT INTO `([A-Za-z0-9_]+)`\.`(lens_restore_[a-f0-9]{32})` /))) {
      const table = this.temporaryTables.get(match[2]); assert.equal(match[1], DATABASE);
      assert(parameters.every(value => value === null || Buffer.isBuffer(value)));
      for (let index = 0; index < parameters.length; index += table.columns.length) table.data.push(parameters.slice(index, index + table.columns.length).map(bytes));
      return [{}, []];
    }
    if ((match = sql.match(/^SHOW CREATE TABLE `([A-Za-z0-9_]+)`\.`([A-Za-z0-9_]+)`$/))) return [[{ 'Create Table': this.databases.get(match[1]).get(match[2]).create }], []];
    if ((match = sql.match(/^SELECT HEX\(CAST\(.+ FROM `([A-Za-z0-9_]+)`\.`([A-Za-z0-9_]+)` LIMIT (\d+)$/))) {
      assert.equal(query.rowsAsArray, true);
      const table = this.temporaryTables.get(match[2]) || this.databases.get(match[1]).get(match[2]);
      return [table.data.slice(0, Number(match[3])).map((row) => row.map((value) => value === null ? null : value.toString('hex').toUpperCase())), []];
    }
    if ((match = sql.match(/^CREATE DATABASE `(lens_restore_[a-f0-9]{32})`$/))) {
      if (this.databases.has(match[1])) throw Object.assign(new Error(SECRET), { code: 'ER_DB_CREATE_EXISTS' });
      this.databases.set(match[1], new Map()); this.created.push(match[1]); return [{}, []];
    }
    if ((match = sql.match(/^CREATE TABLE `(lens_restore_[a-f0-9]{32})`\.`([A-Za-z0-9_]+)` (.+)$/s))) {
      const original = this.databases.get(DATABASE).get(match[2]);
      this.databases.get(match[1]).set(match[2], { ...original, columns: original.columns.map((column) => ({ ...column })), create: 'CREATE TABLE `' + match[2] + '` ' + match[3], data: [] });
      return [{}, []];
    }
    if ((match = sql.match(/^INSERT INTO `(lens_restore_[a-f0-9]{32})`\.`([A-Za-z0-9_]+)` /))) {
      const table = this.databases.get(match[1]).get(match[2]);
      assert(parameters.every((value) => value === null || Buffer.isBuffer(value)));
      for (let index = 0; index < parameters.length; index += table.columns.length) table.data.push(parameters.slice(index, index + table.columns.length).map(bytes));
      return [{}, []];
    }
    if ((match = sql.match(/^DROP DATABASE `(lens_restore_[a-f0-9]{32})`$/))) {
      assert.notEqual(match[1], DATABASE); this.databases.delete(match[1]); this.dropped.push(match[1]); return [{}, []];
    }
    throw new Error(SECRET);
  }
}
async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'synthetic-lens-backup-'));
  await fs.chmod(root, 0o700);
  const fixture = { db: new Adapter(), root, directory: path.join(root, 'bundle') };
  fixtures.push(fixture); return fixture;
}
function source(fixture) { return fixture.db.databases.get(DATABASE); }
function options(fixture, extra = {}) { return { databaseFingerprint: FINGERPRINT, bundleDirectory: fixture.directory, ...extra }; }
async function backup(fixture, extra) { return core.createDatabaseBackup(fixture.db, options(fixture, extra)); }
function safe(value) {
  assert.deepEqual(Object.keys(value).sort(), ['ok', 'status', 'error', 'backup_created', 'restore_verified', 'temporary_database_removed', 'table_count', 'row_count', 'source_unchanged', 'needs_manual_review'].sort());
  const text = JSON.stringify(value);
  for (const forbidden of [DATABASE, SECRET, FINGERPRINT, 'synthetic_documents', 'CREATE TABLE', '合成文本']) assert(!text.includes(forbidden));
}
function privateCodec() {
  const file = path.join(__dirname, 'lens_database_backup.cjs');
  const context = { require: createRequire(file), module: { exports: {} }, Buffer };
  vm.runInNewContext(fsSync.readFileSync(file, 'utf8') + '\nmodule.exports.codec={encodeValue,decodeValue,canonicalRow,rowHash};', context);
  return context.module.exports.codec;
}

test(async () => {
  const fixture = await setup(); const handle = await backup(fixture);
  assert.equal(handle.status, 'backup_ready'); assert.equal(handle.table_count, 2); assert.equal(handle.row_count, 2); assert.equal(core.isVerifiedDatabaseBackup(fixture.db, handle), false);
  assert.equal((await fs.stat(fixture.directory)).mode & 0o077, 0);
  for (const file of await fs.readdir(fixture.directory)) assert.equal((await fs.stat(path.join(fixture.directory, file))).mode & 0o077, 0);
  assert.equal(fixture.db.transaction, false); assert.deepEqual(fixture.db.session, { time_zone: 'SYSTEM', sql_mode: 'STRICT_TRANS_TABLES,NO_ZERO_DATE' }); safe(handle);
});
test(async () => {
  const fixture = await setup(); const handle = await backup(fixture); const outcome = await core.verifyDatabaseBackup(fixture.db, handle);
  assert.equal(outcome.status, 'verified'); assert.equal(outcome.restore_verified, true); assert.equal(outcome.temporary_database_removed, true); assert.equal(core.isVerifiedDatabaseBackup(fixture.db, outcome), true);
  assert.equal(fixture.db.created.length, 1); assert.deepEqual(fixture.db.created, fixture.db.dropped); assert.equal(fixture.db.databases.size, 1); assert.equal(source(fixture).get('synthetic_documents').data.length, 2); safe(outcome);
});
test(async () => {
  const codec = privateCodec(); const values = [null, Buffer.from([0, 255, 10]), 900719925474099312345n, new Date('2026-01-02T03:04:05.123Z'), '合成😀', 1.25, -0, true];
  for (const value of values) {
    const restored = codec.decodeValue(codec.encodeValue(value));
    if (Buffer.isBuffer(value)) assert(value.equals(restored)); else if (value instanceof Date) assert.equal(restored.toISOString(), value.toISOString()); else assert(Object.is(restored, value));
  }
  assert.notEqual(codec.canonicalRow([Buffer.from('1')]), codec.canonicalRow(['1'])); assert.notEqual(codec.canonicalRow([1n]), codec.canonicalRow(['1'])); assert.notEqual(codec.canonicalRow([null]), codec.canonicalRow([Buffer.alloc(0)]));
});
test(async () => {
  const codec = privateCodec(); assert.throws(() => codec.encodeValue(Number.MAX_SAFE_INTEGER + 1)); assert.throws(() => codec.encodeValue(new Date(NaN))); assert.throws(() => codec.encodeValue({}));
});
test(async () => {
  const codec = privateCodec(); const one = codec.canonicalRow([Buffer.from('a')]); const two = codec.canonicalRow([Buffer.from('b')]); assert.equal(codec.rowHash([one, two]), codec.rowHash([two, one])); assert.notEqual(codec.rowHash([one, two]), codec.rowHash([one, one, two]));
});
test(async () => {
  const fixture = await setup(); fixture.db.database = 'synthetic_other_database'; const outcome = await backup(fixture); assert.equal(outcome.error, 'database_identity_mismatch'); assert.equal(fixture.db.created.length, 0); safe(outcome);
});
test(async () => {
  const fixture = await setup(); fixture.db.transaction = true; const outcome = await backup(fixture); assert.equal(outcome.error, 'transaction_already_active'); assert.equal(fixture.db.transaction, true); assert.equal(fixture.db.created.length, 0);
});
test(async () => {
  const fixture = await setup(); const outcome = await backup(fixture);
  assert.equal(outcome.status, 'backup_ready');
  assert(fixture.db.queries.some(({ sql }) => sql === 'DO 0'));
  assert(!fixture.db.queries.some(({ sql }) => sql.includes('@@session.in_transaction')));
});
for (const status of [undefined, null, '2', -1, 65536, 1.5]) test(async () => {
  const fixture = await setup(); const original = fixture.db.query.bind(fixture.db);
  fixture.db.query = async (...args) => args[0] === 'DO 0' ? [{ serverStatus: status }, []] : original(...args);
  const outcome = await backup(fixture);
  assert.equal(outcome.error, 'invalid_adapter_response');
  assert.equal(fixture.db.transaction, false); assert.equal(fixture.db.created.length, 0); safe(outcome);
});
test(async () => {
  const fixture = await setup(); fixture.db.visibility = false; const outcome = await backup(fixture); assert.equal(outcome.status, 'unsupported'); assert.equal(outcome.error, 'catalog_visibility_unproven'); assert.equal(fixture.db.transaction, false);
});
for (const kind of ['triggers', 'routines', 'events', 'foreign_keys']) test(async () => {
  const fixture = await setup(); fixture.db.objects[kind] = 1; const outcome = await backup(fixture); assert.equal(outcome.status, 'unsupported'); assert.equal(outcome.error, 'unsupported_' + kind); assert.equal(fixture.db.transaction, false); safe(outcome);
});
test(async () => {
  const fixture = await setup(); source(fixture).get('synthetic_documents').tableType = 'VIEW'; const outcome = await backup(fixture); assert.equal(outcome.status, 'unsupported'); assert.equal(fixture.db.transaction, false);
});
test(async () => {
  const fixture = await setup(); source(fixture).get('synthetic_documents').engine = 'MyISAM'; assert.equal((await backup(fixture)).status, 'unsupported');
});
test(async () => {
  const fixture = await setup(); source(fixture).get('synthetic_documents').columns[1].type = 'float'; assert.equal((await backup(fixture)).status, 'unsupported');
});
test(async () => {
  const fixture = await setup(); source(fixture).get('synthetic_documents').columns[1].generated = 'synthetic_expression'; assert.equal((await backup(fixture)).status, 'unsupported');
});
test(async () => {
  const fixture = await setup(); source(fixture).get('synthetic_documents').columns[2].charset = 'synthetic_invalid_charset'; assert.equal((await backup(fixture)).status, 'unsupported');
});
test(async () => {
  const fixture = await setup(); const table = source(fixture).get('synthetic_documents'); table.create += '; DROP DATABASE synthetic_backup_database'; assert.equal((await backup(fixture)).error, 'unsupported_ddl'); assert.equal(fixture.db.created.length, 0);
});
test(async () => {
  const fixture = await setup(); assert.equal((await backup(fixture, { maxRows: 1 })).error, 'unsupported_backup_size'); assert.equal(fixture.db.transaction, false); assert.equal((await fs.readdir(fixture.root)).length, 0);
});
test(async () => {
  const fixture = await setup(); source(fixture).get('synthetic_documents').data[0][2] = Buffer.alloc(2000, 1); assert.equal((await backup(fixture, { maxBytes: 1024 })).error, 'unsupported_backup_size'); assert.equal((await fs.readdir(fixture.root)).length, 0);
});
test(async () => {
  const fixture = await setup(); assert.equal((await backup(fixture, { maxRows: -1 })).error, 'invalid_limits'); assert.equal(fixture.db.queries.length, 0);
});
test(async () => {
  const fixture = await setup(); await fs.mkdir(fixture.directory); await fs.writeFile(path.join(fixture.directory, 'synthetic_old_backup'), 'synthetic_old'); const outcome = await backup(fixture); assert.equal(outcome.status, 'blocked'); assert.equal(await fs.readFile(path.join(fixture.directory, 'synthetic_old_backup'), 'utf8'), 'synthetic_old');
});
test(async () => {
  const fixture = await setup(); let reads = 0; fixture.db.hook = (sql) => { if (sql.startsWith('SHOW CREATE TABLE') && ++reads === 3) source(fixture).get('synthetic_documents').create += ' COMMENT=\'synthetic_changed\''; };
  const outcome = await backup(fixture); assert.equal(outcome.error, 'schema_changed_during_backup'); assert.equal((await fs.readdir(fixture.root)).length, 0); assert.equal(fixture.db.transaction, false);
});
test(async () => {
  const fixture = await setup(); let reads = 0; fixture.db.hook = (sql) => { if (sql.startsWith('SHOW CREATE TABLE') && ++reads === 3) source(fixture).get('synthetic_documents').create = source(fixture).get('synthetic_documents').create.replace('AUTO_INCREMENT=10', 'AUTO_INCREMENT=20'); };
  assert.equal((await backup(fixture)).status, 'backup_ready');
});
test(async () => {
  const fixture = await setup(); fixture.db.hook = (sql) => { if (sql.startsWith('SELECT HEX')) throw new Error(SECRET); };
  const outcome = await backup(fixture); assert.equal(outcome.error, 'database_backup_failed'); assert.equal(fixture.db.transaction, false); assert.deepEqual(fixture.db.session, { time_zone: 'SYSTEM', sql_mode: 'STRICT_TRANS_TABLES,NO_ZERO_DATE' }); safe(outcome);
});
test(async () => {
  const fixture = await setup(); const handle = await backup(fixture); await fs.appendFile(path.join(fixture.directory, 'table-0.jsonl'), SECRET); const outcome = await core.verifyDatabaseBackup(fixture.db, handle); assert.equal(outcome.error, 'backup_integrity_failed'); assert.equal(fixture.db.created.length, 0); assert.equal(outcome.backup_created, true); safe(outcome);
});
test(async () => {
  const fixture = await setup(); const handle = await backup(fixture); await fs.chmod(path.join(fixture.directory, 'table-0.jsonl'), 0o644); assert.equal((await core.verifyDatabaseBackup(fixture.db, handle)).error, 'backup_integrity_failed'); assert.equal(fixture.db.created.length, 0);
});
test(async () => {
  const fixture = await setup(); const handle = await backup(fixture); const other = new Adapter(); assert.equal((await core.verifyDatabaseBackup(other, handle)).error, 'invalid_backup_handle'); assert.equal(other.queries.length, 0); assert.equal((await core.verifyDatabaseBackup(fixture.db, { ...handle })).error, 'invalid_backup_handle');
});
test(async () => {
  const fixture = await setup(); const handle = await backup(fixture); fixture.db.hook = (sql, parameters) => { if (sql.startsWith('INSERT INTO') && parameters.length) parameters[0] = Buffer.from('synthetic_corrupt'); };
  const outcome = await core.verifyDatabaseBackup(fixture.db, handle); assert.equal(outcome.error, 'restore_data_mismatch'); assert.equal(outcome.temporary_database_removed, true); assert.deepEqual(fixture.db.created, fixture.db.dropped); assert.equal(core.isVerifiedDatabaseBackup(fixture.db, outcome), false); assert.equal(source(fixture).get('synthetic_documents').data[0][0].toString(), '9007199254740993'); safe(outcome);
});
test(async () => {
  const fixture = await setup(); const handle = await backup(fixture); fixture.db.hook = (sql, _parameters, db) => { if (sql.startsWith('CREATE TABLE')) throw new Error(SECRET); };
  const outcome = await core.verifyDatabaseBackup(fixture.db, handle); assert.equal(outcome.status, 'blocked'); assert.equal(outcome.temporary_database_removed, true); assert.deepEqual(fixture.db.created, fixture.db.dropped); assert.equal((await fs.readdir(fixture.directory)).length, 3); safe(outcome);
});
test(async () => {
  const fixture = await setup(); const handle = await backup(fixture); fixture.db.hook = (sql) => { if (sql.startsWith('DROP DATABASE')) throw new Error(SECRET); };
  const outcome = await core.verifyDatabaseBackup(fixture.db, handle); assert.equal(outcome.status, 'manual_review_required'); assert.equal(outcome.temporary_database_removed, false); assert.equal(outcome.needs_manual_review, true); assert.equal(fixture.db.databases.size, 2); assert.equal(core.isVerifiedDatabaseBackup(fixture.db, outcome), false); safe(outcome);
});
test(async () => {
  const fixture = await setup(); const handle = await backup(fixture); fixture.db.hook = (sql, _parameters, db) => { if (sql.startsWith('CREATE DATABASE')) { const match = sql.match(/`([^`]+)`/); db.databases.set(match[1], new Map()); throw new Error(SECRET); } };
  const outcome = await core.verifyDatabaseBackup(fixture.db, handle); assert.equal(outcome.status, 'manual_review_required'); assert.equal(outcome.temporary_database_removed, false); assert.equal(fixture.db.dropped.length, 0); assert.equal(fixture.db.databases.size, 2); safe(outcome);
});
test(async () => {
  const fixture = await setup(); const handle = await backup(fixture); fixture.db.hook = (sql, _parameters, db) => { if (sql.startsWith('SELECT HEX') && sql.includes('lens_restore_')) for (const table of db.databases.values()) for (const value of table.values()) value.data.reverse(); };
  assert.equal((await core.verifyDatabaseBackup(fixture.db, handle)).status, 'verified');
});
test(async () => {
  const fixture = await setup(); const handle = await backup(fixture); fixture.db.database = 'synthetic_other_database'; const outcome = await core.verifyDatabaseBackup(fixture.db, handle); assert.equal(outcome.error, 'database_identity_mismatch'); assert.equal(fixture.db.created.length, 0); safe(outcome);
});
test(async () => {
  const fixture = await setup(); let committed = false; fixture.db.hook = (sql, parameters) => { if (sql === 'COMMIT') committed = true; if (committed && sql === 'SET SESSION sql_mode = ?' && parameters[0] === 'STRICT_TRANS_TABLES,NO_ZERO_DATE') throw new Error(SECRET); };
  const outcome = await backup(fixture); assert.equal(outcome.status, 'manual_review_required'); assert.equal(outcome.backup_created, true); assert.equal((await fs.readdir(fixture.directory)).length, 3); assert.equal(core.isVerifiedDatabaseBackup(fixture.db, outcome), false); safe(outcome);
});
test(async () => {
  const fixture = await setup(); const handle = await backup(fixture); fixture.db.hook = (sql, _parameters, db) => { if (sql.startsWith('SHOW CREATE TABLE') && sql.includes('lens_restore_')) for (const [name, tables] of db.databases) if (name !== DATABASE) for (const table of tables.values()) table.create += ' COMMENT=\'synthetic_restore_drift\''; };
  const outcome = await core.verifyDatabaseBackup(fixture.db, handle); assert.equal(outcome.error, 'restore_schema_mismatch'); assert.equal(outcome.temporary_database_removed, true); safe(outcome);
});

test(async () => {
  const fixture = await setup();
  const file = path.join(__dirname, 'lens_database_backup.cjs'); const localRequire = createRequire(file);
  let writes = 0;
  const controlledFs = { ...fs, writeFile: async (...arguments_) => { await fs.writeFile(...arguments_); if (++writes === 2) throw new Error(SECRET); } };
  const context = { module: { exports: {} }, Buffer, require: (name) => name === 'node:fs/promises' ? controlledFs : localRequire(name) };
  vm.runInNewContext(fsSync.readFileSync(file, 'utf8'), context);
  const outcome = await context.module.exports.createDatabaseBackup(fixture.db, options(fixture));
  assert.equal(outcome.status, 'blocked'); assert.equal(outcome.backup_created, false); assert.equal((await fs.readdir(fixture.root)).length, 0); safe(outcome);
});
test(async () => {
  const fixture = await setup(); fixture.db.hook = (sql) => { if (sql.startsWith('SELECT HEX') || sql === 'ROLLBACK') throw new Error(SECRET); };
  const outcome = await backup(fixture); assert.equal(outcome.status, 'manual_review_required'); assert.equal(outcome.needs_manual_review, true); assert.equal(outcome.backup_created, false); assert.equal((await fs.readdir(fixture.root)).length, 0); safe(outcome);
});
test(async () => {
  const fixture = await setup(); const handle = await backup(fixture);
  fixture.db.hook = (sql, _parameters, db) => { if (sql.startsWith('CREATE DATABASE')) { const match = sql.match(/`([^`]+)`/); db.databases.set(match[1], new Map()); throw Object.assign(new Error(SECRET), { code: 'ER_DB_CREATE_EXISTS' }); } };
  const outcome = await core.verifyDatabaseBackup(fixture.db, handle); assert.equal(outcome.status, 'manual_review_required'); assert.equal(outcome.temporary_database_removed, false); assert.equal(fixture.db.dropped.length, 0); assert.equal(fixture.db.databases.size, 2); safe(outcome);
});
test(async () => {
  const fixture = await setup(); const handle = await backup(fixture); const other = path.join(fixture.root, 'synthetic_external_file'); await fs.writeFile(other, SECRET, { mode: 0o600 });
  await fs.unlink(path.join(fixture.directory, 'table-0.jsonl')); await fs.symlink(other, path.join(fixture.directory, 'table-0.jsonl'));
  assert.equal((await core.verifyDatabaseBackup(fixture.db, handle)).error, 'backup_integrity_failed'); assert.equal(fixture.db.created.length, 0); assert.equal(await fs.readFile(other, 'utf8'), SECRET);
});
test(async () => {
  const fixture = await setup(); const handle = await backup(fixture); const first = await core.verifyDatabaseBackup(fixture.db, handle); assert.equal(core.isVerifiedDatabaseBackup(fixture.db, first), true);
  const second = await core.verifyDatabaseBackup(fixture.db, handle); assert.equal(second.status, 'verified'); assert.equal(fixture.db.created.length, 2); assert.equal(fixture.db.dropped.length, 2); assert.equal(core.isVerifiedDatabaseBackup(fixture.db, second), true);
});

test(async () => {
  const fixture = await setup(); const handle = await backup(fixture); fixture.db.hook = (sql) => { if (sql.startsWith('DROP DATABASE')) throw new Error(SECRET); };
  const first = await core.verifyDatabaseBackup(fixture.db, handle); const count = fixture.db.created.length;
  const record = JSON.parse(await fs.readFile(path.join(fixture.directory, 'restore-state.json'), 'utf8')); assert.equal(record.acknowledged, true); assert.equal(record.dataVerified, true); assert.equal((await fs.stat(path.join(fixture.directory, 'restore-state.json'))).mode & 0o077, 0);
  const second = await core.verifyDatabaseBackup(fixture.db, first); assert.equal(second.status, 'manual_review_required'); assert.equal((await core.verifyDatabaseBackup(fixture.db, second)).status, 'manual_review_required'); assert.equal(fixture.db.created.length, count); safe(second);
});
test(async () => {
  const fixture = await setup(); const handle = await backup(fixture); fixture.db.hook = (sql) => { if (sql.startsWith('CREATE DATABASE')) throw new Error(SECRET); };
  const first = await core.verifyDatabaseBackup(fixture.db, handle); const record = JSON.parse(await fs.readFile(path.join(fixture.directory, 'restore-state.json'), 'utf8')); assert.equal(record.acknowledged, false);
  const before = fixture.db.queries.length; assert.equal((await core.verifyDatabaseBackup(fixture.db, first)).status, 'manual_review_required'); assert.equal(fixture.db.queries.length, before); safe(first);
});
test(async () => {
  const fixture = await setup(); const handle = await backup(fixture); fixture.db.hook = (sql, parameters) => { if (sql === 'SET SESSION sql_mode = ?' && parameters[0] === 'STRICT_TRANS_TABLES,NO_ZERO_DATE') throw new Error(SECRET); };
  const outcome = await core.verifyDatabaseBackup(fixture.db, handle); assert.equal(outcome.status, 'manual_review_required'); assert.equal(outcome.error, 'session_cleanup_failed'); assert.equal(outcome.temporary_database_removed, true); assert.equal(core.isVerifiedDatabaseBackup(fixture.db, outcome), false); assert.equal((await fs.readdir(fixture.directory)).length, 3); safe(outcome);
});
test(async () => {
  const fixture = await setup();
  const file = path.join(__dirname, 'lens_database_backup.cjs'); const localRequire = createRequire(file);
  const controlledFs = { ...fs, open: async (...arguments_) => {
    const descriptor = await fs.open(...arguments_);
    if (String(arguments_[0]).endsWith('restore-state.json') && arguments_[1] === 'wx') return { writeFile: async (...values) => { await descriptor.writeFile(...values); throw new Error(SECRET); }, close: () => descriptor.close() };
    return descriptor;
  } };
  const context = { module: { exports: {} }, Buffer, require: (name) => name === 'node:fs/promises' ? controlledFs : localRequire(name) }; vm.runInNewContext(fsSync.readFileSync(file, 'utf8'), context);
  const alteredCore = context.module.exports; const handle = await alteredCore.createDatabaseBackup(fixture.db, options(fixture)); const outcome = await alteredCore.verifyDatabaseBackup(fixture.db, handle);
  assert.equal(outcome.status, 'blocked'); assert.equal(fixture.db.created.length, 0); assert.equal((await fs.readdir(fixture.directory)).length, 3); safe(outcome);
});

async function sessionFixture() {
  const fixture = await setup(); const handle = await backup(fixture); const target = new Adapter();
  target.databases = fixture.db.databases;
  return { fixture, handle, target };
}
test(async () => {
  const { fixture, handle, target } = await sessionFixture();
  const outcome = await core.verifyDatabaseBackupInSession(fixture.db, handle, target);
  assert.equal(outcome.status, 'verified'); assert.equal(core.isVerifiedDatabaseBackup(fixture.db, outcome), true);
  assert.equal(target.created.length, 2); assert.deepEqual([...target.created].sort(), [...target.dropped].sort());
  assert.equal(target.temporaryTables.size, 0); assert.equal(target.databases.size, 1);
  assert.equal(source(fixture).get('synthetic_documents').data.length, 2);
  assert(!target.queries.some(({ sql }) => /(?:CREATE|DROP) DATABASE/.test(sql)));
  assert(!fixture.db.queries.some(({ sql }) => /^(?:CREATE|INSERT|DROP) /.test(sql)));
  assert.deepEqual(target.session, { time_zone: 'SYSTEM', sql_mode: 'STRICT_TRANS_TABLES,NO_ZERO_DATE' }); safe(outcome);
});
for (const kind of ['same_object', 'same_id', 'other_database', 'active_transaction']) test(async () => {
  const { fixture, handle, target } = await sessionFixture();
  if (kind === 'same_id') target.identifier = fixture.db.identifier;
  if (kind === 'other_database') target.database = 'synthetic_other_database';
  if (kind === 'active_transaction') target.transaction = true;
  const outcome = await core.verifyDatabaseBackupInSession(fixture.db, handle, kind === 'same_object' ? fixture.db : target);
  assert.equal(outcome.ok, false); assert.equal(target.created.length, 0); assert.equal(core.isVerifiedDatabaseBackup(fixture.db, outcome), false); safe(outcome);
});
for (const kind of ['tampered_bundle', 'insert', 'schema', 'data', 'create', 'cleanup']) test(async () => {
  const { fixture, handle, target } = await sessionFixture();
  if (kind === 'tampered_bundle') await fs.appendFile(path.join(fixture.directory, 'table-0.jsonl'), SECRET);
  target.hook = (sql) => {
    if (kind === 'insert' && sql.startsWith('INSERT INTO')) throw new Error(SECRET);
    if (kind === 'schema' && sql.startsWith('SHOW CREATE TABLE')) for (const table of target.temporaryTables.values()) table.create += ' synthetic';
    if (kind === 'data' && sql.startsWith('SELECT HEX(CAST')) for (const table of target.temporaryTables.values()) table.data = [];
    if (kind === 'create' && sql.startsWith('CREATE TEMPORARY TABLE')) throw new Error(SECRET);
    if (kind === 'cleanup' && sql.startsWith('DROP TEMPORARY TABLE')) throw new Error(SECRET);
  };
  const outcome = await core.verifyDatabaseBackupInSession(fixture.db, handle, target);
  assert.equal(outcome.ok, false); assert.equal(core.isVerifiedDatabaseBackup(fixture.db, outcome), false);
  assert.equal(source(fixture).get('synthetic_documents').data.length, 2);
  if (kind !== 'cleanup') assert.equal(target.temporaryTables.size, 0);
  if (kind === 'cleanup' || kind === 'create') assert.equal(outcome.needs_manual_review, true);
  assert.equal(await fs.readFile(path.join(fixture.directory, 'manifest.json'), 'utf8').then(Boolean), true); safe(outcome);
});

// SHOW CREATE can omit column charsets inherited from the table default.
test(() => {
  const ModuleForSchemaTest = require('node:module');
  const schemaModulePath = require.resolve('./lens_database_backup.cjs');
  const schemaModule = new ModuleForSchemaTest(schemaModulePath, module);
  schemaModule.filename = schemaModulePath;
  schemaModule.paths = module.paths;
  schemaModule._compile(
    require('node:fs').readFileSync(schemaModulePath, 'utf8') +
      '\nmodule.exports.structuralSqlForTest = structuralSql;',
    schemaModulePath,
  );
  const canonical = schemaModule.exports.structuralSqlForTest;
  const base = 'CREATE TABLE `sample` (`label` varchar(80) DEFAULT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
  const explicit = 'CREATE TABLE `sample` (`label` varchar(80) CHARACTER SET utf8mb4 DEFAULT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
  assert.equal(canonical(explicit), canonical(base));
  assert.notEqual(canonical(explicit.replace('SET utf8mb4', 'SET latin1')), canonical(base));
  assert.notEqual(canonical(explicit.replace('CHARSET=utf8mb4', 'CHARSET=latin1')), canonical(base.replace('CHARSET=utf8mb4', 'CHARSET=latin1')));
  const quoted = base.replace('DEFAULT NULL', "DEFAULT ' CHARACTER SET utf8mb4'");
  assert.notEqual(canonical(quoted), canonical(base.replace('DEFAULT NULL', "DEFAULT ''")));
  const quotedIdentifier = base.replace('`label`', '`label CHARACTER SET utf8mb4`');
  assert.notEqual(canonical(quotedIdentifier), canonical(base));
  const collated = explicit.replace('DEFAULT NULL', 'COLLATE utf8mb4_bin DEFAULT NULL');
  assert.notEqual(canonical(collated), canonical(base));
  assert.equal(canonical(collated), canonical(base.replace('DEFAULT NULL', 'COLLATE utf8mb4_bin DEFAULT NULL')));
  const comment = base.replace('DEFAULT NULL', "DEFAULT NULL COMMENT ' CHARACTER SET utf8mb4'");
  assert.notEqual(canonical(comment), canonical(base.replace('DEFAULT NULL', "DEFAULT NULL COMMENT ''")));
  assert.equal(canonical(explicit.replace('DEFAULT CHARSET=', 'DEFAULT CHARACTER SET=')), canonical(base.replace('DEFAULT CHARSET=', 'DEFAULT CHARACTER SET=')));
  assert.notEqual(canonical(explicit.replace(' DEFAULT CHARSET=utf8mb4', '')), canonical(base.replace(' DEFAULT CHARSET=utf8mb4', '')));
  assert.equal(canonical(base + ' AUTO_INCREMENT=42'), canonical(base + ' AUTO_INCREMENT=100'));
});

(async () => {
  let passed = 0; const failedCases = [];
  for (let index = 0; index < tests.length; index++) { try { await tests[index](); passed++; } catch { failedCases.push(index + 1); } }
  let cleanup = true;
  for (const fixture of fixtures) { try { await fs.rm(fixture.root, { recursive: true, force: true }); } catch { cleanup = false; } }
  process.stdout.write(JSON.stringify({ ok: passed === tests.length && cleanup, tests: tests.length, passed, failed: failedCases.length, failed_cases: failedCases, synthetic_artifacts_removed: cleanup, output_schema_closed: true }) + '\n');
  process.exitCode = failedCases.length || !cleanup ? 1 : 0;
})().catch(() => { process.stdout.write(JSON.stringify({ ok: false, error: 'synthetic_test_setup_failed' }) + '\n'); process.exitCode = 1; });
