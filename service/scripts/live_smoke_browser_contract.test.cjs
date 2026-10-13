const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

test('answer verification survives browser callback serialization without Node closures', () => {
  const filename = path.join(__dirname, 'verify-lens-live-smoke.cjs');
  const source = fs.readFileSync(filename, 'utf8');
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const callbacks = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'evaluate' && ts.isArrowFunction(node.arguments[0])
      && node.arguments[0].getText(ast).includes('expectedAnswer')) callbacks.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(callbacks.length, 2);
  for (const call of callbacks) {
    assert.equal(call.arguments.length, 2);
    assert.equal(call.arguments[0].parameters.length, 2);
    const isolated = vm.runInNewContext(`(${call.arguments[0].getText(ast)})`);
    assert.equal(isolated({ textContent: 'Research result\n476' }, '476'), true);
    assert.equal(isolated({ textContent: 'calculate 231 + 245' }, '476'), false);
  }
});
