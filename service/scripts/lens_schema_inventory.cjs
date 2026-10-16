'use strict';

const fs = require('fs');
const path = require('path');

function probeToolCapabilities(spawn) {
  function version(command) {
    try {
      const result = spawn(command, ['--version'], {
        encoding: 'utf8', timeout: 8000, maxBuffer: 65536,
        stdio: ['ignore', 'pipe', 'pipe'], shell: false,
        env: {
          PATH: process.env.PATH, HOME: process.env.HOME,
          COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
          npm_config_manage_package_manager_versions: 'false',
        },
      });
      return result.status === 0 && typeof result.stdout === 'string' ? result.stdout : '';
    } catch { return ''; }
  }
  const pnpm = version('pnpm');
  return {
    runtimePnpmCompatible: /^11\./.test(pnpm.trim()),
    runtimeNpmPresent: /^\d+\./.test(version('npm').trim()),
    runtimeArchiveToolPresent: version('tar').length > 0,
    runtimeDumpToolPresent: version('mysqldump').length > 0,
  };
}

// This comparison never returns table names, column names or database values.
function compareSchema(expected, actual) {
  const result = {
    schemaInventoryChecked: false,
    schemaOnlyKnownAdditions: false,
    schemaMissingTableCount: 0,
    schemaMissingColumnCount: 0,
    schemaIncompatibleColumnCount: 0,
    schemaUnexpectedAdditionCount: 0,
  };
  if (!Array.isArray(expected) || !expected.length || !Array.isArray(actual)) {
    return result;
  }
  const existing = new Map();
  for (const row of actual) {
    if (
      !row || typeof row.TABLE_NAME !== 'string' ||
      typeof row.COLUMN_NAME !== 'string' || typeof row.DATA_TYPE !== 'string' ||
      !['YES', 'NO'].includes(row.IS_NULLABLE)
    ) return result;
    const key = `${row.TABLE_NAME}\0${row.COLUMN_NAME}`;
    if (existing.has(key)) return result;
    existing.set(key, row);
  }
  const tables = new Set(actual.map(row => row.TABLE_NAME));
  const seen = new Set();
  let attachmentTables = 0;
  for (const table of expected) {
    if (
      !table || typeof table.name !== 'string' || !table.name ||
      typeof table.attachment !== 'boolean' || !Array.isArray(table.columns) ||
      !table.columns.length || seen.has(table.name)
    ) return result;
    seen.add(table.name);
    if (table.attachment) attachmentTables++;
    const columns = new Set();
    for (const column of table.columns) {
      if (
        !column || typeof column.name !== 'string' || !column.name ||
        typeof column.type !== 'string' || !column.type ||
        typeof column.nullable !== 'boolean' ||
        typeof column.allowedAddition !== 'boolean' || columns.has(column.name)
      ) return result;
      columns.add(column.name);
    }
    if (!tables.has(table.name)) {
      result.schemaMissingTableCount++;
      if (!table.attachment) result.schemaUnexpectedAdditionCount++;
      continue;
    }
    for (const column of table.columns) {
      const row = existing.get(`${table.name}\0${column.name}`);
      if (!row) {
        result.schemaMissingColumnCount++;
        if (!(column.allowedAddition && column.nullable)) {
          result.schemaUnexpectedAdditionCount++;
        }
        continue;
      }
      const normalize = value => value === 'integer' ? 'int' : value;
      if (
        normalize(column.type) !== normalize(row.DATA_TYPE) ||
        column.nullable !== (row.IS_NULLABLE === 'YES') ||
        (column.length && Number(row.CHARACTER_MAXIMUM_LENGTH) !== Number(column.length))
      ) result.schemaIncompatibleColumnCount++;
    }
  }
  if (attachmentTables !== 1) return result;
  result.schemaInventoryChecked = true;
  result.schemaOnlyKnownAdditions = result.schemaUnexpectedAdditionCount === 0 &&
    result.schemaIncompatibleColumnCount === 0;
  return result;
}

async function loadTargetSchema(serviceRoot) {
  require(path.join(serviceRoot, 'node_modules/reflect-metadata'));
  const { DataSource } = require(path.join(serviceRoot, 'node_modules/typeorm'));
  const files = [];
  function visit(directory, suffix) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('schema_source_invalid');
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file, suffix);
      else if (entry.isFile() && entry.name.endsWith(suffix)) files.push(file);
    }
  }
  const compiled = path.join(serviceRoot, 'dist');
  if (fs.existsSync(compiled)) visit(compiled, '.entity.js');
  if (!files.length) {
    require(path.join(serviceRoot, 'node_modules/ts-node')).register({
      project: path.join(serviceRoot, 'tsconfig.json'), transpileOnly: true,
    });
    visit(path.join(serviceRoot, 'src'), '.entity.ts');
  }
  // The source uses a single src/ alias. Scope its resolver to entity loading;
  // neither a network install nor an application bootstrap is needed.
  const Module = require('module');
  const originalResolve = Module._resolveFilename;
  let entities;
  try {
    Module._resolveFilename = function(request, ...rest) {
      const resolved = request.startsWith('src/') ? path.join(serviceRoot, request) : request;
      return originalResolve.call(this, resolved, ...rest);
    };
    entities = files.flatMap(file => Object.values(require(file)))
      .filter(value => typeof value === 'function');
  } finally {
    Module._resolveFilename = originalResolve;
  }
  const source = new DataSource({
    type: 'mysql', database: 'synthetic', entities, logging: false, synchronize: false,
  });
  await source.buildMetadatas();
  const tables = source.entityMetadatas.map(table => ({
    name: table.tableName,
    attachment: /attachment/i.test(table.targetName),
    columns: table.columns.map(column => ({
      name: column.databaseName,
      type: source.driver.normalizeType(column),
      nullable: column.isNullable,
      length: column.length || '',
      allowedAddition: /package/i.test(table.targetName) &&
        column.propertyName === 'entitlements' && column.isNullable,
    })),
  }));
  if (!tables.length || tables.filter(table => table.attachment).length !== 1) {
    throw new Error('schema_source_invalid');
  }
  return tables;
}

function extendReadinessProgram(program, expected, ts) {
  const tree = ts.createSourceFile('readiness.js', program, ts.ScriptTarget.Latest, true);
  const connections = [];
  const outputs = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (node.expression.name.text === 'createConnection') connections.push(node);
      if (node.expression.getText(tree) === 'JSON.stringify') outputs.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (connections.length !== 1 || outputs.length !== 1 || outputs[0].arguments.length !== 1) {
    throw new Error('readiness_contract_changed');
  }
  let node = connections[0];
  let connection;
  while (node && !ts.isStatement(node)) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) connection = node.name.text;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left)) connection = node.left.text;
    node = node.parent;
  }
  if (!connection || !node || !ts.isStatement(node)) {
    throw new Error('readiness_contract_changed');
  }
  const query = 'SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE,IS_NULLABLE,' +
    'CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()';
  const addition = `\nconst [__lensColumns] = await ${connection}.query(${JSON.stringify(query)});\n` +
    `Object.assign(__lensSchemaResult, (${compareSchema.toString()})(${JSON.stringify(expected)}, __lensColumns));\n` +
    `Object.assign(__lensSchemaResult, (${probeToolCapabilities.toString()})(require('child_process').spawnSync));\n`;
  const argument = outputs[0].arguments[0];
  const edits = [
    { start: node.end, end: node.end, value: addition },
    { start: argument.getStart(tree), end: argument.end,
      value: `Object.assign(${argument.getText(tree)}, __lensSchemaResult)` },
  ].sort((a, b) => b.start - a.start);
  let output = program;
  for (const edit of edits) output = output.slice(0, edit.start) + edit.value + output.slice(edit.end);
  return 'const __lensSchemaResult = {};\n' + output;
}

module.exports = { compareSchema, loadTargetSchema, extendReadinessProgram, probeToolCapabilities };

if (require.main === module) {
  (async () => {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    if (!input || input.mode !== 'extend' || typeof input.serviceRoot !== 'string' ||
        typeof input.program !== 'string') throw new Error('invalid_input');
    const expected = await loadTargetSchema(input.serviceRoot);
    const ts = require(path.join(input.serviceRoot, 'node_modules/typescript'));
    process.stdout.write(JSON.stringify({ program: extendReadinessProgram(input.program, expected, ts),
      tableCount: expected.length, columnCount: expected.reduce((sum, table) => sum + table.columns.length, 0) }));
  })().catch(() => { process.stdout.write('{"error":"schema_inventory_unavailable"}'); process.exitCode = 1; });
}
