'use strict';

// Local acceptance only. This tool cannot target a remote database or alter an
// existing table. Release rollback preserves additive schema and private data.
const fs = require('node:fs');
const path = require('node:path');
const { isAdditiveAttachmentPlan } = require('./attachment_schema_plan.cjs');

async function main(argv = process.argv.slice(2)) {
  const result = {
    ok: false, localTargetConfirmed: false, tableExisted: false,
    tableCreated: false, schemaVerified: false, errorClass: 'none',
  };
  let source;
  try {
    if (argv.length > 1 || (argv.length === 1 && argv[0] !== '--apply')) {
      result.errorClass = 'operation_not_allowed';
      return result;
    }
    const root = path.resolve(__dirname, '..');
    const parsed = require('dotenv').parse(fs.readFileSync(path.join(root, '.env')));
    const env = Object.fromEntries(['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASS', 'DB_DATABASE']
      .map(key => [key, process.env[key] ?? parsed[key]]));
    for (const key of Object.keys(parsed)) delete parsed[key];
    if (!['127.0.0.1', 'localhost', '::1'].includes(env.DB_HOST)) {
      result.errorClass = 'nonlocal_target_rejected';
      return result;
    }
    result.localTargetConfirmed = true;
    require('reflect-metadata');
    require('ts-node/register/transpile-only');
    const { DataSource } = require('typeorm');
    const { AttachmentEntity } = require('../src/modules/attachment/attachment.entity');
    source = new DataSource({
      type: 'mysql', host: env.DB_HOST === 'localhost' ? '127.0.0.1' : env.DB_HOST, port: Number(env.DB_PORT || 3306),
      username: env.DB_USER, password: env.DB_PASS, database: env.DB_DATABASE,
      entities: [AttachmentEntity], synchronize: false, logging: false,
      extra: { connectionLimit: 1, connectTimeout: 3000 },
    });
    await source.initialize();
    const metadata = source.getMetadata(AttachmentEntity);
    let runner = source.createQueryRunner();
    try {
      result.tableExisted = await runner.hasTable(metadata.tableName);
      if (!result.tableExisted) {
        await runner.release();
        runner = null;
        const plan = await source.driver.createSchemaBuilder().log();
        if (!isAdditiveAttachmentPlan(metadata.tableName, plan.upQueries.map(query => query.query))) {
          result.errorClass = 'nonadditive_schema_rejected';
          return result;
        }
        if (!argv.includes('--apply')) {
          result.errorClass = 'schema_missing';
          return result;
        }
        await source.query(plan.upQueries[0].query);
        result.tableCreated = true;
      }
      if (!runner) runner = source.createQueryRunner();
      const actual = await runner.getTable(metadata.tableName);
      result.schemaVerified = Boolean(actual) && metadata.columns.every(column => {
        const existing = actual.columns.find(item => item.name === column.databaseName);
        return existing && existing.type === source.driver.normalizeType(column) &&
          existing.isNullable === column.isNullable && existing.isPrimary === column.isPrimary &&
          existing.isGenerated === column.isGenerated && Boolean(existing.unsigned) === Boolean(column.unsigned);
      }) && metadata.indices.every(index => actual.indices.some(existing =>
        existing.isUnique === index.isUnique &&
        existing.columnNames.join('|') === index.columns.map(column => column.databaseName).join('|')));
      result.ok = result.schemaVerified;
      if (!result.ok) result.errorClass = 'schema_mismatch';
      return result;
    } finally {
      if (runner) await runner.release();
    }
  } catch (_error) {
    result.errorClass = 'local_schema_operation_failed';
    return result;
  } finally {
    if (source && source.isInitialized) {
      try { await source.destroy(); } catch (_error) { /* Do not emit connection data. */ }
    }
  }
}

if (require.main === module) {
  main().then(result => {
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exitCode = result.ok ? 0 : 1;
  });
}

module.exports = { main };
