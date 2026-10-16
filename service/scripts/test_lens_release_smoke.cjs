const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, 'lens_production_release_worker.cjs'), 'utf8');
const tree = ts.createSourceFile('worker.cjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const functions = tree.statements.filter(node => ts.isFunctionDeclaration(node) && ['__smoke', '__smokeOnce'].includes(node.name?.text));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const body = Buffer.from('<!doctype html><title>Fixture</title>');

function smokeClient(transport) {
  return vm.runInNewContext(functions.map(node => node.getText(tree)).join('\n') + '\n__smoke;', {
    __http: transport, __hash: hash, __fail: code => { const error = new Error('synthetic_validation_failure'); error.lensCode = code; throw error; },
    Buffer, Number, Promise, Date, setTimeout,
  });
}

async function withServer(run) {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const context = { smokePort: server.address().port, staticRoutes: { admin: '/admin' } };
    const digest = hash(body);
    const hashes = new Proxy({}, { get: () => digest });
    await run(context, hashes);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('serves and verifies both mounted application pages', async () => {
  await withServer(async (context, hashes) => {
    await assert.doesNotReject(() => smokeClient(http)(context, hashes));
  });
});

test('waits for the application when the first connection is refused', async () => {
  await withServer(async (context, hashes) => {
    let first = true;
    const transport = {
      get(...args) {
        if (!first) return http.get(...args);
        first = false;
        const request = new EventEmitter();
        request.destroy = () => request;
        queueMicrotask(() => request.emit('error', Object.assign(new Error('synthetic_unavailable'), { code: 'ECONNREFUSED' })));
        return request;
      },
    };
    await assert.doesNotReject(() => smokeClient(transport)(context, hashes));
  });
});

test('rejects page content that differs from the approved snapshot', async () => {
  await withServer(async (context) => {
    const wrong = new Proxy({}, { get: () => hash(Buffer.from('different synthetic page')) });
    await assert.rejects(() => smokeClient(http)(context, wrong));
  });
});
