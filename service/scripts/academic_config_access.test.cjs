const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyRouteAccess, inspectAcademicConfigAccess } = require('./academic_config_access.cjs');
const success = body => body?.code === 200;

test('HTTP authentication denial overrides a successful envelope', () => {
  for (const status of [401, 403]) assert.deepEqual(classifyRouteAccess(status, { code: 200 }, success), { denied: true, granted: false });
});

test('application-level authentication denial cannot be treated as access', () => {
  for (const body of [{ code: 401 }, { statusCode: 403 }]) assert.deepEqual(classifyRouteAccess(200, body, success), { denied: true, granted: false });
});

test('only a recognized successful envelope proves access', () => {
  assert.deepEqual(classifyRouteAccess(200, { code: 200 }, success), { denied: false, granted: true });
  for (const body of [null, { data: {} }, { code: 500 }]) assert.deepEqual(classifyRouteAccess(200, body, success), { denied: false, granted: false });
});

test('route access projection contains no configuration values', () => {
  const result = classifyRouteAccess(200, { code: 200, data: { syntheticCredential: 'synthetic-private-value' } }, success);
  assert.deepEqual(Object.keys(result).sort(), ['denied', 'granted']);
  assert.equal(JSON.stringify(result).includes('synthetic-private-value'), false);
});

test('read-only audit rejects non-local bases before any request', async () => {
  let called = false;
  await assert.rejects(inspectAcademicConfigAccess({ base: 'https://example.invalid/api', repoRoot: '/synthetic', fetchImpl() { called = true; } }), /local_base_required/);
  assert.equal(called, false);
});
