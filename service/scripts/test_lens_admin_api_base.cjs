'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const adminRoot = path.resolve(__dirname, '../../admin');
const ts = require(require.resolve('typescript', { paths: [adminRoot] }));
const axios = require(require.resolve('axios', { paths: [adminRoot] }));
const source = ts.createSourceFile(
  'index.ts',
  fs.readFileSync(path.join(adminRoot, 'src/api/index.ts'), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);

let expression;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'axios.create') {
    const options = node.arguments[0];
    const base = options.properties.find((property) => property.name?.getText(source) === 'baseURL');
    expression = base.initializer.getText(source).replaceAll('import.meta.env', 'testEnv');
  }
  ts.forEachChild(node, visit);
}
visit(source);

const cases = [
  { name: 'missing production configuration', env: {}, expected: '/api/auth/login' },
  { name: 'empty production configuration', env: { VITE_APP_API_BASEURL: '' }, expected: '/api/auth/login' },
  {
    name: 'explicit configuration remains authoritative',
    env: { VITE_APP_API_BASEURL: 'https://api.lens.invalid/custom' },
    expected: 'https://api.lens.invalid/custom/auth/login',
  },
  {
    name: 'development proxy remains authoritative',
    env: { DEV: true, VITE_OPEN_PROXY: 'true', VITE_APP_API_BASEURL: 'https://api.lens.invalid/custom' },
    expected: '/proxy/auth/login',
  },
];

let failed = 0;
for (const item of cases) {
  const baseURL = vm.runInNewContext(`(${expression})`, { testEnv: item.env });
  const actual = axios.create({ baseURL }).getUri({ url: '/auth/login' });
  const passed = actual === item.expected;
  if (!passed) failed += 1;
  console.log(JSON.stringify({ test: item.name, passed }));
}
process.exitCode = failed ? 1 : 0;
