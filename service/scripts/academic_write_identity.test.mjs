import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveControlledWriteActor } from './academic_write_identity.mjs';
import { runAcademicControlledWriteGate } from './academic_controlled_write_gate.mjs';

test('legacy numeric identities retain their own actor', () => {
  assert.equal(resolveControlledWriteActor({ id: 42 }, 42), 42);
  assert.equal(resolveControlledWriteActor({ id: '42' }, 42), 42);
  assert.equal(resolveControlledWriteActor({ id: 43 }, 42), 43);
});

test('opaque identity requires both explicit matching bindings', () => {
  const info = { id: 'synthetic-public-actor', username: 'synthetic-test-user' };
  const bindings = { publicIdentity: info.id, username: info.username };
  assert.equal(resolveControlledWriteActor(info, 42, bindings), 42);
  assert.equal(resolveControlledWriteActor(info, 42), 0);
  assert.equal(resolveControlledWriteActor(info, 42, { publicIdentity: info.id }), 0);
  assert.equal(resolveControlledWriteActor(info, 42, { username: info.username }), 0);
});

test('mismatched public identity or account never resolves an actor', () => {
  const info = { id: 'synthetic-public-actor', username: 'synthetic-test-user' };
  assert.equal(resolveControlledWriteActor(info, 42, {
    publicIdentity: 'synthetic-other-actor', username: info.username,
  }), 0);
  assert.equal(resolveControlledWriteActor(info, 42, {
    publicIdentity: info.id, username: 'synthetic-other-user',
  }), 0);
});

test('malformed identities and unsafe actors fail closed', () => {
  const bindings = { publicIdentity: 'synthetic-actor', username: 'synthetic-user' };
  for (const actor of [0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(resolveControlledWriteActor({ id: bindings.publicIdentity, username: bindings.username }, actor, bindings), 0);
  }
  for (const id of [null, true, false, {}, [], '', 'invalid id', '../synthetic', 'a'.repeat(129)]) {
    assert.equal(resolveControlledWriteActor({ id, username: bindings.username }, 42, bindings), 0);
  }
});

test('identity values are never coerced through object hooks', () => {
  let hookCalled = false;
  const id = { valueOf() { hookCalled = true; return 42; } };
  assert.equal(resolveControlledWriteActor({ id }, 42), 0);
  assert.equal(resolveControlledWriteActor({ id: 'synthetic-actor', username: 'synthetic-user' }, id, {
    publicIdentity: 'synthetic-actor', username: 'synthetic-user',
  }), 0);
  assert.equal(hookCalled, false);
  assert.equal(resolveControlledWriteActor({ id: '1e2' }, 100), 0);
});

test('invalid numeric identity cannot be remapped as an opaque actor', () => {
  for (const id of ['0', '000', '9'.repeat(128)]) {
    assert.equal(resolveControlledWriteActor({ id, username: 'synthetic-user' }, 42, {
      publicIdentity: id, username: 'synthetic-user',
    }), 0);
  }
});

function syntheticToken(actor) {
  return [{ alg: 'HS256', typ: 'JWT' }, { sub: actor }]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .concat(Buffer.alloc(32, 7).toString('base64url')).join('.');
}

async function runIdentityFixture(overrides = {}, info = {
  id: 'synthetic-public-actor', username: 'synthetic-test-user',
}) {
  const routes = [];
  const result = await runAcademicControlledWriteGate({
    env: {
      LENS_ACADEMIC_BASE_URL: 'http://127.0.0.1:9999/api',
      LENS_ACADEMIC_E2E_TOKEN: syntheticToken(42),
      LENS_ACADEMIC_EXPECTED_USER_ID: '42',
      LENS_ACADEMIC_EXPECTED_PUBLIC_USER_ID: 'synthetic-public-actor',
      LENS_ACADEMIC_EXPECTED_USERNAME: 'synthetic-test-user',
      LENS_ACADEMIC_E2E_MODEL: 'synthetic-academic-model',
      LENS_ACADEMIC_EXPECT_DEDUCTION: 'free',
      LENS_ACADEMIC_WRITE_CONFIRM: 'CONFIRM_LENS_ACADEMIC_TEST_WRITES',
      ...overrides,
    },
    fetchImpl: async url => {
      const route = new URL(String(url)).pathname.replace(/^\/api/, '');
      routes.push(route);
      let data = {};
      if (route === '/auth/getInfo') data = { userInfo: info };
      if (route === '/group/create') data = { id: 43 };
      if (route === '/academic/chat-process') {
        // Deliberately fail generation so the gate must still clean its record.
        return new Response('synthetic-invalid-stream', {
          headers: { 'content-type': 'application/x-ndjson' },
        });
      }
      return new Response(JSON.stringify({ status: 'Success', data }), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  return { result, routes };
}

test('bound opaque actor reaches generation and cleans up on failure', async () => {
  const { result, routes } = await runIdentityFixture();
  assert.notEqual(result.exitCode, 0);
  assert.ok(routes.includes('/group/create'));
  assert.ok(routes.includes('/academic/chat-process'));
  assert.ok(routes.includes('/group/del'));
});

test('unbound or wrong opaque identity is rejected before any write', async () => {
  for (const overrides of [
    { LENS_ACADEMIC_EXPECTED_PUBLIC_USER_ID: '' },
    { LENS_ACADEMIC_EXPECTED_USERNAME: '' },
    { LENS_ACADEMIC_EXPECTED_PUBLIC_USER_ID: 'synthetic-other-actor' },
  ]) {
    const { result, routes } = await runIdentityFixture(overrides);
    assert.notEqual(result.exitCode, 0);
    assert.ok(!routes.includes('/group/create'));
    assert.ok(!routes.includes('/academic/chat-process'));
  }
});

test('different authenticated username is rejected before any write', async () => {
  const { result, routes } = await runIdentityFixture({}, {
    id: 'synthetic-public-actor', username: 'synthetic-other-user',
  });
  assert.notEqual(result.exitCode, 0);
  assert.ok(!routes.includes('/group/create'));
});

test('wrong JWT actor remains rejected before requests', async () => {
  const { result, routes } = await runIdentityFixture({
    LENS_ACADEMIC_EXPECTED_USER_ID: '44',
  });
  assert.notEqual(result.exitCode, 0);
  assert.equal(routes.length, 0);
});

test('legacy numeric gate still reaches writes without opaque bindings', async () => {
  const { routes } = await runIdentityFixture({
    LENS_ACADEMIC_EXPECTED_PUBLIC_USER_ID: '',
    LENS_ACADEMIC_EXPECTED_USERNAME: '',
  }, { id: 42, username: 'synthetic-test-user' });
  assert.ok(routes.includes('/group/create'));
  assert.ok(routes.includes('/group/del'));
});

test('different legacy numeric account is still rejected before writes', async () => {
  const { result, routes } = await runIdentityFixture({
    LENS_ACADEMIC_EXPECTED_PUBLIC_USER_ID: '',
    LENS_ACADEMIC_EXPECTED_USERNAME: '',
  }, { id: 44, username: 'synthetic-test-user' });
  assert.notEqual(result.exitCode, 0);
  assert.ok(!routes.includes('/group/create'));
});
