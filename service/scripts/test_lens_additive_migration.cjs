'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const { DataSource, EntitySchema, Table } = require('typeorm');

const DATABASE = 'synthetic_lens_migration_database';
const SECRET = 'synthetic-private-error-do-not-emit';
const fingerprint = createHash('sha256').update(DATABASE).digest('hex');
const targetFile = path.join(__dirname, 'lens_additive_migration.cjs');
const tests = [];
function test(run) { tests.push(run); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

async function metadata() {
  const attachment = new EntitySchema({
    name: 'SyntheticAttachment', tableName: 'synthetic_attachment',
    columns: {
      id: { type: String, length: 36, primary: true },
      owner_id: { type: Number },
      filename: { type: String, length: 255 },
      object_key: { type: String, length: 255 },
      content_type: { type: String, length: 127 },
      size_bytes: { type: Number, unsigned: true },
      created_at: { type: 'datetime', precision: 6, default: () => 'CURRENT_TIMESTAMP(6)' },
    },
    indices: [{ name: 'synthetic_attachment_owner', columns: ['owner_id'] }],
  });
  const plans = new EntitySchema({
    name: 'SyntheticPlan', tableName: 'synthetic_plans',
    columns: { id: { type: Number, primary: true }, label: { type: String, length: 64 }, entitlements: { type: 'text', nullable: true } },
  });
  const users = new EntitySchema({
    name: 'SyntheticUser', tableName: 'synthetic_users',
    columns: { id: { type: Number, primary: true }, label: { type: String, length: 64, unique: true } },
  });
  const dataSource = new DataSource({ type: 'mysql', database: DATABASE, entities: [attachment, plans, users], synchronize: false });
  await dataSource.buildMetadatas();
  return dataSource.entityMetadatas;
}

function loadCore(entityMetadatas) {
  const emitted = [];
  const source = fs.readFileSync(targetFile, 'utf8').replace(
    /\/\* BEGIN APPROVED SCHEMA \*\/[\s\S]*?\/\* END APPROVED SCHEMA \*\//,
    "let APPROVED;",
  );
  const context = { module: { exports: {} }, require: createRequire(targetFile), __syntheticMetadata: entityMetadatas, console: { log: (...items) => emitted.push(items), error: (...items) => emitted.push(items), warn: (...items) => emitted.push(items) } };
  vm.runInNewContext(source + "\nAPPROVED = Object.freeze({ metadataHash: schemaDigest(normalizeMetadata(__syntheticMetadata)), attachmentName: 'synthetic_attachment', planName: 'synthetic_plans' });", context, { filename: 'synthetic_migration_core.cjs' });
  return { ...context.module.exports, emitted };
}

function columnRow(tableName, column) {
  let value = column.default === undefined ? null : column.default;
  if (typeof value === 'string' && value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
  return {
    table_name: tableName, column_name: column.name, data_type: column.type,
    column_type: column.type + (column.unsigned ? ' unsigned' : ''),
    is_nullable: column.isNullable ? 'YES' : 'NO', column_default: value,
    extra: [column.isGenerated ? 'auto_increment' : '', column.onUpdate ? 'on update ' + column.onUpdate : ''].filter(Boolean).join(' '),
    character_length: column.length ? Number(column.length) : ['varchar', 'char', 'binary', 'varbinary'].includes(column.type) ? 255 : null,
    numeric_precision: column.precision || 10, numeric_scale: column.scale || 0,
    datetime_precision: column.precision || 0, column_key: column.isPrimary ? 'PRI' : '', generation_expression: '',
  };
}
function indexRows(tableName, name, columns, unique = false, type = 'BTREE') {
  return columns.map((column, index) => ({ table_name: tableName, index_name: name, non_unique: unique ? 0 : 1, sequence_number: index + 1, column_name: column, sub_part: null, index_type: type }));
}
function schemaFixture(entityMetadatas) {
  const schema = new Map();
  for (const entity of entityMetadatas) {
    const table = Table.create(entity, entity.connection.driver);
    const indices = table.indices.flatMap((index) => indexRows(table.name, index.name, index.columnNames, index.isUnique));
    for (const column of table.columns.filter((candidate) => candidate.isUnique)) indices.push(...indexRows(table.name, 'synthetic_unique_' + column.name, [column.name], true));
    indices.push(...indexRows(table.name, 'PRIMARY', table.columns.filter((column) => column.isPrimary).map((column) => column.name), true));
    schema.set(table.name, { row: { table_name: table.name, engine: 'InnoDB', table_type: 'BASE TABLE' }, columns: table.columns.map((column) => columnRow(table.name, column)), indices, dataRows: 0 });
  }
  return schema;
}
class Adapter {
  constructor(entityMetadatas, options = {}) {
    this.full = schemaFixture(entityMetadatas);
    this.state = options.state || { schema: new Map([...this.full].map(([name, table]) => [name, clone(table)])), lock: null };
    this.database = DATABASE;
    this.queries = [];
    this.ddl = [];
    this.hook = null;
    if (!options.state && options.missing !== false) {
      this.state.schema.delete('synthetic_attachment');
      this.state.schema.get('synthetic_plans').columns = this.state.schema.get('synthetic_plans').columns.filter((column) => column.column_name !== 'entitlements');
    }
  }
  async query(sql, parameters) {
    this.queries.push({ sql, parameters });
    if (this.hook) await this.hook(sql, parameters, this);
    if (sql === 'SELECT DATABASE() AS schema_name') return [[{ schema_name: this.database }], []];
    if (sql.startsWith('SELECT GET_LOCK')) {
      const acquired = this.state.lock === null || this.state.lock === this;
      if (acquired) this.state.lock = this;
      return [[{ acquired: acquired ? 1 : 0 }], []];
    }
    if (sql.startsWith('SELECT RELEASE_LOCK')) {
      const released = this.state.lock === this;
      if (released) this.state.lock = null;
      return [[{ released: released ? 1 : 0 }], []];
    }
    if (sql.includes('INFORMATION_SCHEMA.TABLES')) return [[...this.state.schema.values()].map((table) => clone(table.row)), []];
    if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) return [[...this.state.schema.values()].flatMap((table) => clone(table.columns)), []];
    if (sql.includes('INFORMATION_SCHEMA.STATISTICS')) return [[...this.state.schema.values()].flatMap((table) => clone(table.indices)), []];
    assert.equal(parameters.length, 0);
    assert(!/;|\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bMODIFY\b|\bCHANGE\b|\bRENAME\b|\bINSERT\b|\bUPDATE\b/i.test(sql));
    if (sql.startsWith('CREATE TABLE `synthetic_attachment` (') && sql.endsWith(') ENGINE=InnoDB')) {
      if (this.state.schema.has('synthetic_attachment')) throw Object.assign(new Error(SECRET), { code: 'ER_TABLE_EXISTS_ERROR' });
      this.ddl.push(sql); this.state.schema.set('synthetic_attachment', clone(this.full.get('synthetic_attachment')));
      return [{ affectedRows: 0 }, []];
    }
    if (sql === 'ALTER TABLE `synthetic_plans` ADD COLUMN `entitlements` text NULL') {
      const columns = this.state.schema.get('synthetic_plans').columns;
      if (columns.some((column) => column.column_name === 'entitlements')) throw Object.assign(new Error(SECRET), { code: 'ER_DUP_FIELDNAME' });
      this.ddl.push(sql); columns.push(clone(this.full.get('synthetic_plans').columns.find((column) => column.column_name === 'entitlements')));
      return [{ affectedRows: 0 }, []];
    }
    throw new Error(SECRET);
  }
}
async function setup(options) {
  const metas = await metadata();
  const core = loadCore(metas);
  const db = new Adapter(metas, options);
  return { metas, core, db };
}
async function plan(fixture) { return fixture.core.planAdditiveMigration(fixture.db, fixture.metas, { databaseFingerprint: fingerprint }); }
async function execute(fixture, approvedPlan) { return fixture.core.executeAdditiveMigration(fixture.db, fixture.metas, approvedPlan || await plan(fixture)); }
async function verifyHistorical(fixture, approvedPlan) { return fixture.core.verifyHistoricalSchemaCompatibility(fixture.db, approvedPlan); }
function safeHistoricalResult(value) {
  assert.deepEqual(Object.keys(value).sort(), ['ok', 'status', 'error', 'original_tables_verified', 'original_columns_verified', 'original_indexes_verified', 'original_table_count', 'original_column_count', 'original_index_count', 'allowed_additions', 'data_preserved', 'needs_manual_review'].sort());
  const text = JSON.stringify(value);
  for (const forbidden of [SECRET, DATABASE, fingerprint, 'synthetic_attachment', 'CREATE TABLE']) assert(!text.includes(forbidden));
}

function safeResult(value) {
  assert.deepEqual(Object.keys(value).sort(), ['ok', 'status', 'error', 'create_tables', 'add_columns', 'data_preserved', 'needs_manual_review'].sort());
  const text = JSON.stringify(value);
  assert(!text.includes(SECRET)); assert(!text.includes(DATABASE)); assert(!text.includes(fingerprint)); assert(!text.includes('synthetic_attachment')); assert(!text.includes('CREATE TABLE'));
}

test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture);
  assert.equal(approvedPlan.status, 'ready'); assert.equal(approvedPlan.create_tables, 1); assert.equal(approvedPlan.add_columns, 1); assert(Object.isFrozen(approvedPlan));
  assert.equal(fixture.db.ddl.length, 0); safeResult(approvedPlan);
});
test(async () => {
  const fixture = await setup(); const outcome = await execute(fixture);
  assert.equal(outcome.status, 'applied'); assert.equal(outcome.create_tables, 1); assert.equal(outcome.add_columns, 1); assert.equal(fixture.db.ddl.length, 2);
  const create = fixture.db.ddl.find((sql) => sql.startsWith('CREATE TABLE'));
  assert(create.includes('`size_bytes` int UNSIGNED NOT NULL')); assert(create.includes('PRIMARY KEY (`id`)')); assert(create.includes('INDEX `synthetic_attachment_owner` (`owner_id`)')); assert(create.includes('DEFAULT CURRENT_TIMESTAMP(6)'));
  assert.equal(fixture.db.state.lock, null); assert.equal(fixture.core.emitted.length, 0); safeResult(outcome);
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture);
  assert.equal((await execute(fixture, approvedPlan)).status, 'applied');
  assert.equal((await execute(fixture, approvedPlan)).status, 'already_current');
  assert.equal((await plan(fixture)).status, 'already_current'); assert.equal(fixture.db.ddl.length, 2);
});
test(async () => {
  const fixture = await setup({ missing: false }); assert.equal((await execute(fixture)).status, 'already_current'); assert.equal(fixture.db.ddl.length, 0);
});
test(async () => {
  const fixture = await setup(); fixture.db.state.schema.set('synthetic_attachment', clone(fixture.db.full.get('synthetic_attachment')));
  const outcome = await execute(fixture); assert.equal(outcome.create_tables, 0); assert.equal(outcome.add_columns, 1); assert.equal(fixture.db.ddl.length, 1);
});
test(async () => {
  const fixture = await setup(); fixture.db.state.schema.get('synthetic_plans').columns.push(clone(fixture.db.full.get('synthetic_plans').columns.find((column) => column.column_name === 'entitlements')));
  const outcome = await execute(fixture); assert.equal(outcome.create_tables, 1); assert.equal(outcome.add_columns, 0); assert.equal(fixture.db.ddl.length, 1);
});
test(async () => {
  const fixture = await setup(); fixture.db.database = 'synthetic_other_database';
  assert.equal((await plan(fixture)).error, 'database_identity_mismatch'); assert.equal(fixture.db.ddl.length, 0);
});
test(async () => {
  const fixture = await setup(); assert.equal((await fixture.core.planAdditiveMigration(fixture.db, fixture.metas, { databaseFingerprint: DATABASE })).error, 'invalid_request'); assert.equal(fixture.db.queries.length, 0);
});
test(async () => {
  const fixture = await setup(); fixture.db.state.schema.delete('synthetic_users');
  assert.equal((await plan(fixture)).error, 'unexpected_missing_table'); assert.equal(fixture.db.ddl.length, 0);
});
test(async () => {
  const fixture = await setup(); fixture.db.state.schema.get('synthetic_users').columns.pop();
  assert.equal((await plan(fixture)).error, 'unexpected_missing_column'); assert.equal(fixture.db.ddl.length, 0);
});
test(async () => {
  const fixture = await setup(); fixture.db.state.schema.get('synthetic_users').columns[1].data_type = 'text';
  assert.equal((await plan(fixture)).error, 'incompatible_schema'); assert.equal(fixture.db.ddl.length, 0);
});
test(async () => {
  const fixture = await setup({ missing: false }); const entitlement = fixture.db.state.schema.get('synthetic_plans').columns.find((column) => column.column_name === 'entitlements'); entitlement.is_nullable = 'NO';
  assert.equal((await plan(fixture)).error, 'incompatible_schema'); assert.equal(fixture.db.ddl.length, 0);
});
test(async () => {
  const fixture = await setup({ missing: false }); fixture.db.state.schema.get('synthetic_attachment').indices = [];
  assert.equal((await plan(fixture)).error, 'incompatible_schema'); assert.equal(fixture.db.ddl.length, 0);
});
test(async () => {
  const fixture = await setup(); fixture.metas[0].tableName = 'synthetic_bad`;DROP TABLE synthetic_users'; fixture.metas[0].tablePath = fixture.metas[0].tableName;
  assert.equal((await plan(fixture)).error, 'invalid_metadata'); assert.equal(fixture.db.queries.length, 0);
});
test(async () => {
  const fixture = await setup(); fixture.metas.find((entity) => entity.tableName === 'synthetic_plans').columns.find((column) => column.databaseName === 'entitlements').isNullable = false;
  assert.equal((await plan(fixture)).error, 'metadata_contract_mismatch'); assert.equal(fixture.db.queries.length, 0);
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture);
  assert.equal((await execute(fixture, { ...approvedPlan })).error, 'invalid_plan'); assert.equal(fixture.db.ddl.length, 0);
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture); const other = new Adapter(fixture.metas);
  assert.equal((await fixture.core.executeAdditiveMigration(other, fixture.metas, approvedPlan)).error, 'invalid_plan'); assert.equal(other.queries.length, 0);
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture); fixture.db.database = 'synthetic_changed_database';
  assert.equal((await execute(fixture, approvedPlan)).error, 'database_identity_mismatch'); assert.equal(fixture.db.ddl.length, 0);
});
test(async () => {
  const fixture = await setup({ missing: false }); const approvedPlan = await plan(fixture); fixture.db.state.schema.delete('synthetic_attachment');
  assert.equal((await execute(fixture, approvedPlan)).error, 'schema_changed_after_plan'); assert.equal(fixture.db.ddl.length, 0); assert.equal(fixture.db.state.lock, null);
});
test(async () => {
  const fixture = await setup(); fixture.db.state.lock = {}; const outcome = await execute(fixture);
  assert.equal(outcome.error, 'migration_busy'); assert.equal(outcome.needs_manual_review, false); assert.equal(fixture.db.ddl.length, 0);
});
test(async () => {
  const fixture = await setup(); const otherDb = new Adapter(fixture.metas, { state: fixture.db.state });
  const first = await plan(fixture); const second = await fixture.core.planAdditiveMigration(otherDb, fixture.metas, { databaseFingerprint: fingerprint });
  const outcomes = await Promise.all([execute(fixture, first), fixture.core.executeAdditiveMigration(otherDb, fixture.metas, second)]);
  assert(outcomes.some((outcome) => outcome.status === 'applied')); assert(outcomes.some((outcome) => outcome.error === 'migration_busy'));
  assert.equal((await fixture.core.executeAdditiveMigration(otherDb, fixture.metas, second)).status, 'already_current'); assert.equal(fixture.db.ddl.length + otherDb.ddl.length, 2);
});
test(async () => {
  const fixture = await setup(); fixture.db.hook = (sql, _parameters, db) => {
    if (sql.startsWith('CREATE TABLE')) { db.state.schema.set('synthetic_attachment', clone(db.full.get('synthetic_attachment'))); db.hook = null; throw Object.assign(new Error(SECRET), { errno: 1050 }); }
  };
  const outcome = await execute(fixture); assert.equal(outcome.status, 'applied'); assert.equal(outcome.create_tables, 0); assert.equal(outcome.add_columns, 1); assert.equal(fixture.db.ddl.length, 1); safeResult(outcome);
});
test(async () => {
  const fixture = await setup(); fixture.db.hook = (sql, _parameters, db) => {
    if (sql.startsWith('ALTER TABLE')) { db.state.schema.get('synthetic_plans').columns.push(clone(db.full.get('synthetic_plans').columns.find((column) => column.column_name === 'entitlements'))); db.hook = null; throw Object.assign(new Error(SECRET), { code: 'ER_DUP_FIELDNAME' }); }
  };
  const outcome = await execute(fixture); assert.equal(outcome.status, 'applied'); assert.equal(outcome.create_tables, 1); assert.equal(outcome.add_columns, 0); assert.equal(fixture.db.ddl.length, 1);
});
test(async () => {
  const fixture = await setup(); fixture.db.hook = (sql, _parameters, db) => {
    if (sql.startsWith('CREATE TABLE')) { const incompatible = clone(db.full.get('synthetic_attachment')); incompatible.columns[0].data_type = 'text'; incompatible.dataRows = 7; db.state.schema.set('synthetic_attachment', incompatible); throw Object.assign(new Error(SECRET), { code: 'ER_TABLE_EXISTS_ERROR' }); }
  };
  const outcome = await execute(fixture); assert.equal(outcome.status, 'manual_review_required'); assert.equal(outcome.needs_manual_review, true); assert.equal(fixture.db.state.schema.get('synthetic_attachment').dataRows, 7); assert.equal(fixture.db.ddl.length, 0); safeResult(outcome);
});
test(async () => {
  const fixture = await setup(); fixture.db.hook = (sql, _parameters, db) => {
    if (sql.startsWith('ALTER TABLE')) { db.state.schema.get('synthetic_attachment').dataRows = 11; throw new Error(SECRET); }
  };
  const outcome = await execute(fixture); assert.equal(outcome.status, 'manual_review_required'); assert.equal(outcome.error, 'database_operation_failed'); assert.equal(outcome.create_tables, 1); assert.equal(fixture.db.state.schema.get('synthetic_attachment').dataRows, 11); assert.equal(fixture.db.ddl.length, 1); assert.equal(fixture.db.state.lock, null); safeResult(outcome);
});
test(async () => {
  const fixture = await setup(); fixture.db.hook = (sql, _parameters, db) => {
    if (sql.startsWith('CREATE TABLE')) { db.state.schema.set('synthetic_attachment', clone(db.full.get('synthetic_attachment'))); db.state.schema.get('synthetic_attachment').dataRows = 13; throw new Error(SECRET); }
  };
  const outcome = await execute(fixture); assert.equal(outcome.status, 'manual_review_required'); assert.equal(fixture.db.state.schema.get('synthetic_attachment').dataRows, 13); assert.equal(fixture.db.ddl.length, 0); safeResult(outcome);
});
test(async () => {
  const fixture = await setup(); fixture.db.hook = (sql) => { if (sql.includes('INFORMATION_SCHEMA')) throw new Error(SECRET); };
  const outcome = await plan(fixture); assert.equal(outcome.error, 'database_operation_failed'); assert.equal(fixture.core.emitted.length, 0); safeResult(outcome);
});
test(async () => {
  const fixture = await setup(); fixture.db.hook = (sql) => { if (sql.startsWith('SELECT RELEASE_LOCK')) throw new Error(SECRET); };
  const outcome = await execute(fixture); assert.equal(outcome.status, 'manual_review_required'); assert.equal(outcome.error, 'lock_release_failed'); assert.equal(outcome.create_tables, 1); assert.equal(outcome.add_columns, 1); safeResult(outcome);
});
test(async () => {
  const fixture = await setup(); const originalQuery = fixture.db.query.bind(fixture.db); fixture.db.query = async (sql, parameters) => sql.includes('INFORMATION_SCHEMA.COLUMNS') ? [null, []] : originalQuery(sql, parameters);
  const outcome = await plan(fixture); assert.equal(outcome.error, 'invalid_adapter_response'); assert.equal(fixture.db.ddl.length, 0); safeResult(outcome);
});
test(async () => {
  const fixture = await setup({ missing: false }); const extra = columnRow('synthetic_users', { name: 'synthetic_legacy_field', type: 'text', isNullable: true, isPrimary: false }); fixture.db.state.schema.get('synthetic_users').columns.push(extra);
  assert.equal((await execute(fixture)).status, 'already_current'); assert(fixture.db.state.schema.get('synthetic_users').columns.some((column) => column.column_name === 'synthetic_legacy_field')); assert.equal(fixture.db.ddl.length, 0);
});

test(async () => {
  const fixture = await setup({ missing: false }); fixture.db.state.schema.get('synthetic_users').indices = fixture.db.state.schema.get('synthetic_users').indices.filter((index) => index.index_name !== 'PRIMARY');
  assert.equal((await plan(fixture)).error, 'incompatible_schema'); assert.equal(fixture.db.ddl.length, 0);
});
test(async () => {
  const fixture = await setup({ missing: false }); fixture.db.state.schema.get('synthetic_users').indices = fixture.db.state.schema.get('synthetic_users').indices.filter((index) => index.index_name === 'PRIMARY' || Number(index.non_unique) !== 0);
  assert.equal((await plan(fixture)).error, 'incompatible_schema'); assert.equal(fixture.db.ddl.length, 0);
});
test(async () => {
  const fixture = await setup(); fixture.metas.find((entity) => entity.tableName === 'synthetic_attachment').columns[0].type = 'varchar); DROP TABLE synthetic_users';
  assert.equal((await plan(fixture)).error, 'unsupported_metadata'); assert.equal(fixture.db.queries.length, 0);
});
test(async () => {
  const fixture = await setup({ missing: false }); fixture.db.state.schema.get('synthetic_users').columns[0].column_type = 'int zerofill';
  assert.equal((await plan(fixture)).error, 'incompatible_schema'); assert.equal(fixture.db.ddl.length, 0);
});

test(async () => {
  const fixture = await setup({ missing: false }); fixture.db.state.schema.get('synthetic_attachment').columns.push(columnRow('synthetic_attachment', { name: 'synthetic_unapproved_required', type: 'text', isNullable: false, isPrimary: false }));
  assert.equal((await plan(fixture)).error, 'incompatible_schema'); assert.equal(fixture.db.ddl.length, 0);
});
test(async () => {
  const fixture = await setup({ missing: false }); fixture.db.state.schema.get('synthetic_attachment').indices.push(...indexRows('synthetic_attachment', 'synthetic_unapproved_unique', ['filename'], true));
  assert.equal((await plan(fixture)).error, 'incompatible_schema'); assert.equal(fixture.db.ddl.length, 0);
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture);
  const before = await verifyHistorical(fixture, approvedPlan);
  assert.equal(before.status, 'compatible'); assert.equal(before.allowed_additions, 0); assert.equal(before.original_tables_verified, true); assert.equal(before.original_columns_verified, true); assert.equal(before.original_indexes_verified, true); safeHistoricalResult(before);
  await execute(fixture, approvedPlan);
  const after = await verifyHistorical(fixture, approvedPlan);
  assert.equal(after.status, 'compatible'); assert.equal(after.allowed_additions, 2); assert.equal(after.original_tables_verified, true); assert.equal(after.original_columns_verified, true); assert.equal(after.original_indexes_verified, true); safeHistoricalResult(after);
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture); await execute(fixture, approvedPlan);
  fixture.db.state.schema.get('synthetic_users').columns[0].data_type = 'text';
  const outcome = await verifyHistorical(fixture, approvedPlan);
  assert.equal(outcome.status, 'incompatible'); assert.equal(outcome.error, 'historical_schema_changed'); assert.equal(outcome.needs_manual_review, true); safeHistoricalResult(outcome);
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture); await execute(fixture, approvedPlan);
  fixture.db.state.schema.set('synthetic_unapproved', { row: { table_name: 'synthetic_unapproved', engine: 'InnoDB', table_type: 'BASE TABLE' }, columns: [], indices: [], dataRows: 0 });
  const outcome = await verifyHistorical(fixture, approvedPlan);
  assert.equal(outcome.status, 'incompatible'); assert.equal(outcome.error, 'historical_unapproved_addition'); assert.equal(outcome.needs_manual_review, true); safeHistoricalResult(outcome);
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture);
  const other = new Adapter(fixture.metas);
  assert.equal((await fixture.core.verifyHistoricalSchemaCompatibility(other, approvedPlan)).error, 'invalid_plan'); assert.equal(other.queries.length, 0);
  assert.equal((await verifyHistorical(fixture, { ...approvedPlan })).error, 'invalid_plan');
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture);
  fixture.db.state.schema.get('synthetic_users').columns[0].column_type = 'int unsigned';
  const outcome = await verifyHistorical(fixture, approvedPlan);
  assert.equal(outcome.status, 'incompatible'); assert.equal(outcome.error, 'historical_schema_changed'); safeHistoricalResult(outcome);
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture);
  const primary = fixture.db.state.schema.get('synthetic_users').indices.filter((index) => index.index_name === 'PRIMARY'); primary[0].column_name = 'label';
  const outcome = await verifyHistorical(fixture, approvedPlan);
  assert.equal(outcome.status, 'incompatible'); assert.equal(outcome.error, 'historical_schema_changed'); safeHistoricalResult(outcome);
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture); fixture.db.state.schema.delete('synthetic_users');
  const outcome = await verifyHistorical(fixture, approvedPlan);
  assert.equal(outcome.status, 'incompatible'); assert.equal(outcome.error, 'historical_schema_changed'); safeHistoricalResult(outcome);
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture); fixture.db.state.lock = {};
  const outcome = await verifyHistorical(fixture, approvedPlan);
  assert.equal(outcome.status, 'blocked'); assert.equal(outcome.error, 'migration_busy'); safeHistoricalResult(outcome);
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture); fixture.db.database = 'synthetic_other_database';
  const outcome = await verifyHistorical(fixture, approvedPlan);
  assert.equal(outcome.status, 'blocked'); assert.equal(outcome.error, 'database_identity_mismatch'); safeHistoricalResult(outcome);
});

test(async () => {
  const fixture = await setup(); fixture.db.state.schema.get('synthetic_users').row.table_collation = 'synthetic_initial_collation';
  const approvedPlan = await plan(fixture); fixture.db.state.schema.get('synthetic_users').row.table_collation = 'synthetic_changed_collation';
  assert.equal((await verifyHistorical(fixture, approvedPlan)).error, 'historical_schema_changed');
});
test(async () => {
  const fixture = await setup(); fixture.db.state.schema.get('synthetic_users').columns[0].column_comment = 'synthetic_initial_comment';
  const approvedPlan = await plan(fixture); fixture.db.state.schema.get('synthetic_users').columns[0].column_comment = 'synthetic_changed_comment';
  assert.equal((await verifyHistorical(fixture, approvedPlan)).error, 'historical_schema_changed');
});
test(async () => {
  const fixture = await setup(); fixture.db.state.schema.get('synthetic_users').columns[0].ordinal_position = 1;
  const approvedPlan = await plan(fixture); fixture.db.state.schema.get('synthetic_users').columns[0].ordinal_position = 2;
  assert.equal((await verifyHistorical(fixture, approvedPlan)).error, 'historical_schema_changed');
});
test(async () => {
  const fixture = await setup(); fixture.db.state.schema.get('synthetic_users').indices[0].is_visible = 'YES';
  const approvedPlan = await plan(fixture); fixture.db.state.schema.get('synthetic_users').indices[0].is_visible = 'NO';
  assert.equal((await verifyHistorical(fixture, approvedPlan)).error, 'historical_schema_changed');
});
test(async () => {
  const fixture = await setup(); fixture.db.state.schema.set('synthetic_legacy_table', { row: { table_name: 'synthetic_legacy_table', engine: 'InnoDB', table_type: 'BASE TABLE' }, columns: [], indices: [], dataRows: 0 });
  const approvedPlan = await plan(fixture); fixture.db.state.schema.delete('synthetic_legacy_table');
  assert.equal((await verifyHistorical(fixture, approvedPlan)).error, 'historical_schema_changed');
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture);
  fixture.db.state.schema.get('synthetic_users').columns.push(columnRow('synthetic_users', { name: 'synthetic_unapproved_column', type: 'text', isNullable: true, isPrimary: false }));
  assert.equal((await verifyHistorical(fixture, approvedPlan)).error, 'historical_unapproved_addition');
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture);
  fixture.db.state.schema.get('synthetic_users').indices.push(...indexRows('synthetic_users', 'synthetic_extra_index', ['label']));
  assert.equal((await verifyHistorical(fixture, approvedPlan)).error, 'historical_unapproved_addition');
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture);
  fixture.db.state.schema.get('synthetic_plans').columns.push(clone(fixture.db.full.get('synthetic_plans').columns.find((column) => column.column_name === 'entitlements')));
  const outcome = await verifyHistorical(fixture, approvedPlan); assert.equal(outcome.status, 'compatible'); assert.equal(outcome.allowed_additions, 1); safeHistoricalResult(outcome);
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture);
  fixture.db.state.schema.set('synthetic_attachment', clone(fixture.db.full.get('synthetic_attachment')));
  const outcome = await verifyHistorical(fixture, approvedPlan); assert.equal(outcome.status, 'compatible'); assert.equal(outcome.allowed_additions, 1); safeHistoricalResult(outcome);
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture);
  const entitlement = clone(fixture.db.full.get('synthetic_plans').columns.find((column) => column.column_name === 'entitlements')); entitlement.is_nullable = 'NO'; fixture.db.state.schema.get('synthetic_plans').columns.push(entitlement);
  assert.equal((await verifyHistorical(fixture, approvedPlan)).error, 'historical_unapproved_addition');
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture); let tableReads = 0;
  fixture.db.hook = (sql, _parameters, db) => { if (sql.includes('INFORMATION_SCHEMA.TABLES') && ++tableReads === 2) db.state.schema.get('synthetic_users').columns[0].column_default = 'synthetic_changed_default'; };
  const outcome = await verifyHistorical(fixture, approvedPlan); assert.equal(outcome.error, 'historical_schema_changed'); assert.equal(fixture.db.state.lock, null); safeHistoricalResult(outcome);
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture);
  fixture.db.hook = (sql) => { if (sql.includes('INFORMATION_SCHEMA')) throw new Error(SECRET); };
  const outcome = await verifyHistorical(fixture, approvedPlan); assert.equal(outcome.error, 'database_operation_failed'); assert.equal(outcome.status, 'blocked'); assert.equal(fixture.db.state.lock, null); assert.equal(fixture.core.emitted.length, 0); safeHistoricalResult(outcome);
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture);
  fixture.db.hook = (sql) => { if (sql.startsWith('SELECT RELEASE_LOCK')) throw new Error(SECRET); };
  const outcome = await verifyHistorical(fixture, approvedPlan); assert.equal(outcome.error, 'lock_release_failed'); assert.equal(outcome.status, 'manual_review_required'); assert.equal(outcome.needs_manual_review, true); safeHistoricalResult(outcome);
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture);
  fixture.db.state.schema.get('synthetic_users').row.table_rows = 1000; fixture.db.state.schema.get('synthetic_users').row.auto_increment = 2000; fixture.db.state.schema.get('synthetic_users').row.update_time = 'synthetic_runtime_metadata';
  for (const entry of fixture.db.state.schema.get('synthetic_users').indices) entry.cardinality = 3000;
  const outcome = await verifyHistorical(fixture, approvedPlan); assert.equal(outcome.status, 'compatible'); assert.equal(outcome.allowed_additions, 0); safeHistoricalResult(outcome);
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture);
  fixture.metas.find((entity) => entity.tableName === 'synthetic_plans').columns.find((column) => column.databaseName === 'entitlements').isNullable = false;
  const outcome = await verifyHistorical(fixture, approvedPlan); assert.equal(outcome.status, 'compatible'); safeHistoricalResult(outcome);
});
test(async () => {
  const fixture = await setup({ missing: false }); const approvedPlan = await plan(fixture);
  const outcome = await verifyHistorical(fixture, approvedPlan); assert.equal(outcome.status, 'compatible'); assert.equal(outcome.allowed_additions, 0); assert.equal(outcome.original_table_count, 3); assert(outcome.original_column_count > 0); assert(outcome.original_index_count > 0); safeHistoricalResult(outcome);
});
test(async () => {
  const fixture = await setup(); const approvedPlan = await plan(fixture); const outcome = await verifyHistorical(fixture, approvedPlan);
  assert(Object.isFrozen(outcome)); assert.equal((await verifyHistorical(fixture, outcome)).error, 'invalid_plan'); assert.equal(fixture.db.ddl.length, 0);
});
// Regression: release gates consume the real historical compatibility contract.
test(async () => {
  const fixture = await setup();
  const approvedPlan = await plan(fixture);
  assert.strictEqual(approvedPlan.ok, true);
  const migrated = await execute(fixture, approvedPlan);
  assert.strictEqual(migrated.ok, true);
  const compatibility = await verifyHistorical(fixture, approvedPlan);
  assert.strictEqual(compatibility.ok, true);
  assert.strictEqual(compatibility.data_preserved, true);
  const workerSource = fs.readFileSync(path.join(__dirname, 'lens_production_release_worker.cjs'), 'utf8');
  const gates = workerSource.match(/\boldCompatible\s*=\s*compatibility\.[^;]+;/g) || [];
  assert.strictEqual(gates.length, 2, 'cover release and recovery gates');
  for (const gate of gates) {
    const accepts = value => vm.runInNewContext('let oldCompatible = false; ' + gate + ' oldCompatible;', { compatibility: value });
    assert.strictEqual(accepts(compatibility), true, 'accept proven compatible historical schema');
    assert.strictEqual(accepts({ ...compatibility, ok: false }), false, 'reject unsuccessful compatibility');
    assert.strictEqual(accepts({ ...compatibility, data_preserved: false }), false, 'reject missing preservation proof');
    assert.strictEqual(accepts({ ok: true }), false, 'reject incomplete compatibility proof');
  }
});


(async () => {
  let passed = 0;
  const failedCases = [];
  for (let index = 0; index < tests.length; index++) {
    try { await tests[index](); passed++; } catch { failedCases.push(index + 1); }
  }
  process.stdout.write(JSON.stringify({ ok: passed === tests.length, tests: tests.length, passed, failed: failedCases.length, failed_cases: failedCases, output_schema_closed: true }) + '\n');
  process.exitCode = failedCases.length ? 1 : 0;
})().catch(() => { process.stdout.write(JSON.stringify({ ok: false, error: 'synthetic_test_setup_failed' }) + '\n'); process.exitCode = 1; });
