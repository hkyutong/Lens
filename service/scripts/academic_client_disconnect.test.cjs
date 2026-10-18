'use strict';

const assert = require('node:assert/strict');
const { once, EventEmitter } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

// Exercise the actual lifecycle callbacks and registrations without loading model,
// database, account, or payment dependencies.
function loadLifecycle(methodName) {
  const filename = path.join(__dirname, '../src/modules/academic/academic.service.ts');
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  let method;
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(source) === methodName) method = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(method, 'production entry point must exist');
  const names = new Set(['handleReqAborted', 'handleReqClose', 'cleanupConnectionListeners']);
  const statements = method.body.statements.filter(statement => {
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.some(declaration => names.has(declaration.name.getText(source)));
    }
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) return false;
    const call = statement.expression;
    if (!['req.on', 'res.on'].includes(call.expression.getText(source))) return false;
    return call.arguments.length === 2 && ts.isStringLiteralLike(call.arguments[0]) &&
      ['aborted', 'close', 'finish'].includes(call.arguments[0].text);
  });
  const printer = ts.createPrinter();
  const body = statements.map(statement => printer.printNode(ts.EmitHint.Unspecified, statement, source)).join('\n');
  const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function('req', 'res', `
    let responseCompleted = false;
    const controller = new AbortController();
    const abortUpstream = () => controller.abort();
    const clearForceCloseTimer = () => {};
    ${compiled}
    return { signal: controller.signal, cleanup: cleanupConnectionListeners };
  `);
}

async function withServer(listener, exercise) {
  const server = http.createServer(listener);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await exercise(server.address().port);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

for (const methodName of ['academicChatProcess', 'academicWorkflowProcess']) {
  const bind = loadLifecycle(methodName);

  test(`${methodName}: a completed POST body does not cancel the pending report`, { timeout: 5000 }, async () => {
    let lifecycle;
    let requestWasComplete = false;
    let requestWasDestroyed = false;
    await withServer((req, res) => {
      req.resume();
      req.once('end', () => {
        lifecycle = bind(req, res);
        req.once('close', () => {
          requestWasComplete = req.complete;
          requestWasDestroyed = req.destroyed;
        });
        setTimeout(() => res.end('synthetic-report'), 20);
      });
    }, port => new Promise((resolve, reject) => {
      const request = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/' }, response => {
        let result = '';
        response.on('data', chunk => result += chunk);
        response.on('end', () => {
          try {
            assert.equal(result, 'synthetic-report');
            assert.equal(requestWasComplete, true);
            assert.equal(requestWasDestroyed, true);
            assert.equal(lifecycle.signal.aborted, false, 'normal request completion must preserve research generation');
            resolve();
          } catch (error) { reject(error); }
        });
      });
      request.on('error', reject);
      request.end('{}');
    }));
  });

  test(`${methodName}: disconnecting during the response cancels generation`, { timeout: 5000 }, async () => {
    let lifecycle;
    let resolveClosed;
    const closed = new Promise(resolve => { resolveClosed = resolve; });
    await withServer((req, res) => {
      req.resume();
      req.once('end', () => setImmediate(() => {
        lifecycle = bind(req, res);
        res.once('close', resolveClosed);
        res.write('synthetic-progress');
      }));
    }, async port => {
      await new Promise((resolve, reject) => {
        const request = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/' }, response => {
          response.once('data', () => {
            response.destroy();
            resolve();
          });
        });
        request.on('error', reject);
        request.end('{}');
      });
      await closed;
      assert.equal(lifecycle.signal.aborted, true, 'a closed response must release upstream work');
      lifecycle.cleanup();
    });
  });

  test(`${methodName}: an interrupted request still cancels generation`, () => {
    const req = Object.assign(new EventEmitter(), { complete: false, destroyed: true, aborted: true });
    const res = Object.assign(new EventEmitter(), { writableEnded: false, writableFinished: false, destroyed: false });
    const lifecycle = bind(req, res);
    req.emit('aborted');
    assert.equal(lifecycle.signal.aborted, true);
    lifecycle.cleanup();
  });

  test(`${methodName}: completion detaches disconnect listeners`, () => {
    const req = Object.assign(new EventEmitter(), { complete: true, destroyed: true, aborted: false });
    const res = Object.assign(new EventEmitter(), { writableEnded: false, writableFinished: false, destroyed: false });
    const lifecycle = bind(req, res);
    res.emit('finish');
    res.destroyed = true;
    res.emit('close');
    req.emit('aborted');
    assert.equal(lifecycle.signal.aborted, false);
    assert.equal(req.listenerCount('close'), 0);
    assert.equal(req.listenerCount('aborted'), 0);
    assert.equal(res.listenerCount('close'), 0);
    lifecycle.cleanup();
  });

  test(`${methodName}: cleanup leaves an independent request active`, () => {
    const make = () => {
      const req = Object.assign(new EventEmitter(), { complete: true, destroyed: true, aborted: false });
      const res = Object.assign(new EventEmitter(), { writableEnded: false, writableFinished: false, destroyed: false });
      return { req, res, lifecycle: bind(req, res) };
    };
    const first = make();
    const second = make();
    first.lifecycle.cleanup();
    first.res.destroyed = true;
    first.res.emit('close');
    assert.equal(first.lifecycle.signal.aborted, false);
    second.req.aborted = true;
    second.req.emit('aborted');
    assert.equal(second.lifecycle.signal.aborted, true);
    second.lifecycle.cleanup();
  });
}
