const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const ts = require(require.resolve('typescript', { paths: [path.join(root, 'chat')] }));
const { BadRequestException } = require('@nestjs/common');

function multipartHandler() {
  const listed = spawnSync('rg', ['--files', 'service/src'], { cwd: root, encoding: 'utf8' });
  assert.equal(listed.status, 0);
  const files = listed.stdout.trim().split('\n').filter(file => /upload\.controller\.ts$/.test(file));
  assert.equal(files.length, 1);
  const source = fs.readFileSync(path.join(root, files[0]), 'utf8');
  const ast = ts.createSourceFile('controller.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const handlers = [];
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.parameters.some(parameter => (ts.getDecorators(parameter) || []).some(decorator => /UploadedFile/.test(decorator.expression.getText(ast))))) handlers.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(handlers.length, 1);
  const handler = handlers[0];
  const roles = handler.parameters.map(parameter => {
    const decorators = (ts.getDecorators(parameter) || []).map(decorator => decorator.expression.getText(ast)).join(' ');
    if (/UploadedFile/.test(decorators)) return 'file';
    if (/\bReq\(/.test(decorators)) return 'request';
    if (/\bQuery\(/.test(decorators)) return 'scope';
    return 'unknown';
  });
  assert.equal(roles.includes('unknown'), false);
  const delegates = [];
  function findDelegate(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isPropertyAccessExpression(node.expression.expression) && node.expression.expression.expression.kind === ts.SyntaxKind.ThisKeyword) delegates.push([node.expression.expression.name.text, node.expression.name.text]);
    ts.forEachChild(node, findDelegate);
  }
  findDelegate(handler.body);
  assert.equal(delegates.length, 1);
  const asyncPrefix = handler.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword) ? 'async ' : '';
  const functionSource = `(${asyncPrefix}function(${handler.parameters.map(parameter => parameter.name.getText(ast)).join(',')})${handler.body.getText(ast)})`;
  const compiled = ts.transpileModule(functionSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const invoke = vm.runInNewContext(compiled, { BadRequestException, Buffer }, { timeout: 1000 });
  return { invoke, roles, service: delegates[0][0], method: delegates[0][1] };
}

const handler = multipartHandler();
function fixture() {
  const calls = [];
  const actor = { id: 101 };
  const request = { user: actor, userInfo: actor };
  const result = { synthetic: true };
  const context = { [handler.service]: { [handler.method]: (...args) => { calls.push(args); return result; } } };
  return { calls, actor, result, invoke: file => handler.invoke.apply(context, handler.roles.map(role => role === 'file' ? file : role === 'request' ? request : 'synthetic_scope')) };
}

test('missing multipart file returns a client error before calling storage', async () => {
  const instance = fixture();
  await assert.rejects(instance.invoke(undefined), error => error.getStatus?.() === 400);
  assert.equal(instance.calls.length, 0);
});

test('null multipart file does not reach the upload service', async () => {
  const instance = fixture();
  await assert.rejects(instance.invoke(null), error => error.getStatus?.() === 400);
  assert.equal(instance.calls.length, 0);
});

test('present file preserves scope, actor, payload and service result', async () => {
  const instance = fixture();
  const file = { buffer: Buffer.from('synthetic upload'), originalname: 'synthetic.txt', mimetype: 'text/plain' };
  try {
    assert.equal(await instance.invoke(file), instance.result);
    assert.equal(instance.calls.length, 1);
    assert.equal(instance.calls[0][0], file);
    assert.equal(instance.calls[0][1], 'synthetic_scope');
    assert.equal(instance.calls[0][2], instance.actor);
  } finally {
    file.buffer.fill(0);
  }
});
