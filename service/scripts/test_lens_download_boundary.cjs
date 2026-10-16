'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { captureDownloadBoundary, verifyDownloadBoundary, selectPublicHosts, publicAddress } = require('./lens_download_boundary.cjs');

async function main() {
  let count = 0;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-boundary-synthetic-'));
  const config = 'http { server { listen 443 ssl ; server_name example.test ; location / { proxy_pass http://127.0.0.1:12345 ; } } }'.split(' ');
  const context = { serviceCwd: directory, smokePort: 12345, nginxTokens: config };
  const run = async (name, test) => { await test(); count++; };
  try {
    fs.mkdirSync(path.join(directory, 'public/file'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'public/file/synthetic document.txt'), 'synthetic fixture');
    const snapshot = captureDownloadBoundary(context);
    await run('opens_only_after_origin_denial', async () => {
      const events = [];
      const result = await verifyDownloadBoundary(context, {snapshot,
        beforePublic: async () => events.push('open'),
        transport: async url => { events.push(url.protocol === 'http:' ? 'origin' : 'public'); return {status: 403}; },
      });
      assert.equal(result.passed, true);
      assert.deepEqual(events, ['origin', 'open', 'public']);
    });
    await run('keeps_entry_closed_when_origin_is_public', async () => {
      let opened = false;
      const result = await verifyDownloadBoundary(context, {snapshot,
        beforePublic: async () => { opened = true; }, transport: async () => ({status: 200}),
      });
      assert.equal(result.error, 'boundary_origin_not_denied'); assert.equal(opened, false);
    });
    await run('failed_open_never_certifies_public_boundary', async () => {
      let calls = 0;
      const result = await verifyDownloadBoundary(context, {snapshot,
        beforePublic: async () => { throw new Error('synthetic_open_failure'); },
        transport: async () => { calls++; return {status: 403}; },
      });
      assert.equal(result.passed, false); assert.equal(result.originDenied, true);
      assert.equal(result.publicDenied, false); assert.equal(calls, 1);
    });
    await run('selection', () => assert.deepEqual(selectPublicHosts(config, 12345), ['example.test']));
    await run('opaque baseline', () => assert.equal(JSON.stringify(snapshot), '{"legacyFileCount":1}'));
    await run('denied and retained', async () => {
      let calls = 0;
      const result = await verifyDownloadBoundary(context, { snapshot, transport: async url => {
        assert.equal(url.pathname, '/file/synthetic%20document.txt'); calls++;
        return { status: 403, edgeObserved: calls === 2 };
      } });
      assert.equal(result.passed, true); assert.equal(calls, 2); assert.equal(result.edgeObserved, true);
    });
    await run('public exposure', async () => {
      const r = await verifyDownloadBoundary(context, { snapshot, transport: async url => ({ status: url.protocol === 'http:' ? 404 : 206 }) });
      assert.equal(r.error, 'boundary_public_not_denied');
    });
    await run('origin exposure', async () => assert.equal((await verifyDownloadBoundary(context, { snapshot, transport: async () => ({ status: 200 }) })).error, 'boundary_origin_not_denied'));
    await run('redirect does not pass', async () => assert.equal((await verifyDownloadBoundary(context, { snapshot, transport: async () => ({ status: 302 }) })).passed, false));
    await run('request failure', async () => assert.equal((await verifyDownloadBoundary(context, { snapshot, transport: async () => { throw new Error('synthetic private value'); } })).error, 'boundary_request_failed'));
    await run('unrecognized snapshot', async () => assert.equal((await verifyDownloadBoundary(context, { snapshot: {} })).error, 'boundary_snapshot_invalid'));
    await run('upstream selection', () => assert.deepEqual(selectPublicHosts('http { upstream lens { server 127.0.0.1:12345 ; } server { listen 443 ssl ; server_name example.test ; location / { proxy_pass http://lens ; } } }'.split(' '), 12345), ['example.test']));
    await run('other application excluded', () => assert.throws(() => selectPublicHosts(config, 23456), { code: 'boundary_public_unproven' }));
    await run('mixed upstream excluded', () => assert.throws(() => selectPublicHosts('http { upstream lens { server 127.0.0.1:12345 ; server 127.0.0.1:23456 ; } server { listen 443 ssl ; server_name example.test ; location / { proxy_pass http://lens ; } } }'.split(' '), 12345), { code: 'boundary_public_unproven' }));
    await run('wildcard excluded', () => assert.throws(() => selectPublicHosts(config.map(x => x === 'example.test' ? '*.example.test' : x), 12345), { code: 'boundary_public_unproven' }));
    await run('malformed config excluded', () => assert.throws(() => selectPublicHosts(config.slice(0, -1), 12345), { code: 'boundary_config_invalid' }));
    await run('actual HTTP exposure fails', async () => {
      let ordinaryRequest = false;
      const server = http.createServer((request, response) => {
        ordinaryRequest = request.method === 'GET' && !request.headers.range && !request.headers['cache-control'];
        response.end('synthetic fixture');
      });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      try {
        const port = server.address().port;
        const local = { ...context, smokePort: port, nginxTokens: config.map(value => value.replace(':12345', ':' + port)) };
        const result = await verifyDownloadBoundary(local, { snapshot });
        assert.equal(result.error, 'boundary_origin_not_denied');
        assert.equal(ordinaryRequest, true);
      } finally { await new Promise(resolve => server.close(resolve)); }
    });
    await run('public address routing', () => {
      for (const address of ['127.0.0.1', '10.1.2.3', '169.254.1.2', '100.64.0.1', '172.16.1.2', '192.168.1.2', '192.0.2.1', '198.51.100.1', '203.0.113.1', '::1', 'fc00::1', '2001:db8::1', '::ffff:127.0.0.1']) assert.equal(publicAddress(address), false);
      for (const address of ['1.1.1.1', '8.8.8.8', '2606:4700::1111']) assert.equal(publicAddress(address), true);
    });
    await run('mutation during requests fails', async () => {
      const result = await verifyDownloadBoundary(context, { snapshot, transport: async () => {
        fs.writeFileSync(path.join(directory, 'public/file/synthetic document.txt'), 'temporary change');
        return { status: 403 };
      } });
      assert.equal(result.error, 'boundary_files_changed'); assert.equal(result.filesPreserved, false);
      fs.writeFileSync(path.join(directory, 'public/file/synthetic document.txt'), 'synthetic fixture');
    });
    await run('files unchanged required', async () => {
      fs.writeFileSync(path.join(directory, 'public/file/synthetic document.txt'), 'changed fixture');
      assert.equal((await verifyDownloadBoundary(context, { snapshot })).error, 'boundary_files_changed');
    });
    await run('symlinks excluded', () => {
      fs.symlinkSync(path.join(directory, 'public/file/synthetic document.txt'), path.join(directory, 'public/file/link.txt'));
      assert.throws(() => captureDownloadBoundary(context), { code: 'boundary_snapshot_invalid' });
    });
    process.stdout.write(JSON.stringify({ passed: true, tests: count }) + '\n');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
main().catch(() => { process.stdout.write(JSON.stringify({ passed: false, error: 'synthetic_boundary_test_failed' }) + '\n'); process.exitCode = 1; });
