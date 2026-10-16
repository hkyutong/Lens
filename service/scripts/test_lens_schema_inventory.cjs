'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compareSchema, extendReadinessProgram, probeToolCapabilities } = require('./lens_schema_inventory.cjs');
const ts = require('typescript');

function expected() {
  return [
    { name: 'synthetic_record', attachment: false, columns: [
      { name: 'id', type: 'int', nullable: false, length: '', allowedAddition: false },
      { name: 'entitlements', type: 'json', nullable: true, length: '', allowedAddition: true },
    ] },
    { name: 'synthetic_attachment', attachment: true, columns: [
      { name: 'id', type: 'int', nullable: false, length: '', allowedAddition: false },
    ] },
  ];
}

function actual() {
  return [
    { TABLE_NAME: 'synthetic_record', COLUMN_NAME: 'id', DATA_TYPE: 'int', IS_NULLABLE: 'NO' },
  ];
}

test('recognizes only the explicitly allowed additive changes', () => {
  const result = compareSchema(expected(), actual());
  assert.equal(result.schemaInventoryChecked, true);
  assert.equal(result.schemaOnlyKnownAdditions, true);
  assert.equal(result.schemaMissingTableCount, 1);
  assert.equal(result.schemaMissingColumnCount, 1);
});

test('rejects a missing existing business table', () => {
  const result = compareSchema(expected(), []);
  assert.equal(result.schemaOnlyKnownAdditions, false);
  assert.equal(result.schemaUnexpectedAdditionCount, 1);
});

test('rejects unknown or non-nullable missing columns', () => {
  for (const change of [{ allowedAddition: false }, { nullable: false }]) {
    const target = expected();
    Object.assign(target[0].columns[1], change);
    assert.equal(compareSchema(target, actual()).schemaOnlyKnownAdditions, false);
  }
});

test('rejects incompatible existing types and nullability', () => {
  for (const change of [{ DATA_TYPE: 'varchar' }, { IS_NULLABLE: 'YES' }]) {
    const rows = actual();
    Object.assign(rows[0], change);
    assert.equal(compareSchema(expected(), rows).schemaIncompatibleColumnCount, 1);
  }
});

test('checks explicit string lengths', () => {
  const target = expected();
  Object.assign(target[0].columns[0], { type: 'varchar', length: '64' });
  const rows = actual();
  Object.assign(rows[0], { DATA_TYPE: 'varchar', CHARACTER_MAXIMUM_LENGTH: 32 });
  assert.equal(compareSchema(target, rows).schemaIncompatibleColumnCount, 1);
});

test('refuses ambiguous duplicate rows and targets', () => {
  const rows = actual();
  rows.push({ ...rows[0] });
  assert.equal(compareSchema(expected(), rows).schemaInventoryChecked, false);
  const target = expected();
  target.push({ ...target[0] });
  assert.equal(compareSchema(target, actual()).schemaInventoryChecked, false);
});

test('requires exactly one known attachment table', () => {
  for (const target of [expected().slice(0, 1), expected().map(row => ({ ...row, attachment: true }))]) {
    assert.equal(compareSchema(target, actual()).schemaInventoryChecked, false);
  }
});

test('validates columns even when their table has not been created', () => {
  const target = expected();
  target[1].columns.push({ ...target[1].columns[0] });
  assert.equal(compareSchema(target, actual()).schemaInventoryChecked, false);
});

test('never returns database values in its result', () => {
  const rows = actual();
  rows[0].unexpectedSecret = 'synthetic-sensitive-value';
  const serialized = JSON.stringify(compareSchema(expected(), rows));
  assert.equal(serialized.includes('synthetic-sensitive-value'), false);
  assert.equal(serialized.includes('synthetic_record'), false);
  assert.equal(serialized.includes('entitlements'), false);
});

test('extends both declaration and assignment connection forms', () => {
  for (const initialization of [
    'const connection = await mysql.createConnection({});',
    'let connection; connection = await require("synthetic-mysql").createConnection({});',
  ]) {
    const source = `(async()=>{${initialization} console.log(JSON.stringify({ok:true}));})()`;
    const extended = extendReadinessProgram(source, expected(), ts);
    assert.equal(extended.includes('information_schema.COLUMNS'), true);
    assert.equal(extended.includes('Object.assign(connection'), false);
    const diagnostics = ts.createSourceFile('probe.js', extended, ts.ScriptTarget.Latest, true).parseDiagnostics;
    assert.equal(diagnostics.length, 0);
    assert.equal(/\b(?:ALTER|CREATE|DROP|INSERT|UPDATE|DELETE)\s/i.test(extended), false);
  }
});

test('refuses changed or ambiguous probe structure', () => {
  assert.throws(() => extendReadinessProgram('console.log("synthetic")', expected(), ts),
    /readiness_contract_changed/);
});

test('capability checks are limited to fixed version commands', () => {
  const calls = [];
  const result = probeToolCapabilities((command, args, options) => {
    calls.push(command);
    assert.deepEqual(args, ['--version']);
    assert.equal(options.shell, false);
    assert.equal(options.stdio[0], 'ignore');
    assert.equal(options.timeout, 8000);
    assert.equal(options.env.COREPACK_ENABLE_NETWORK, '0');
    assert.deepEqual(Object.keys(options.env).sort(), [
      'COREPACK_ENABLE_DOWNLOAD_PROMPT', 'COREPACK_ENABLE_NETWORK', 'HOME', 'PATH',
      'npm_config_manage_package_manager_versions',
    ]);
    return { status: 0, stdout: command === 'pnpm' ? '11.25.0\n' : '1.0.0\n' };
  });
  assert.deepEqual(calls, ['pnpm', 'npm', 'tar', 'mysqldump']);
  assert.equal(Object.values(result).every(value => value === true), true);
});

test('missing, incompatible or failed tools never expose their output', () => {
  const result = probeToolCapabilities(command => {
    if (command === 'pnpm') return { status: 0, stdout: '10.0.0\n' };
    if (command === 'npm') throw new Error('synthetic-sensitive-value');
    return { status: 1, stdout: 'synthetic-sensitive-value' };
  });
  assert.equal(Object.values(result).every(value => value === false), true);
  assert.equal(JSON.stringify(result).includes('synthetic-sensitive-value'), false);
});
