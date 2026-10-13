const assert = require('node:assert/strict');
const { inspect } = require('node:util');
const { test } = require('node:test');
const { localTestCredentials } = require('./local_test_credentials.cjs');

const synthetic = { username: 'synthetic-local-user', password: 'synthetic-local-secret' };

test('explicit process credentials do not invoke Keychain or serialize', () => {
  let invoked = false;
  const result = localTestCredentials({
    env: { LENS_TEST_USERNAME: synthetic.username, LENS_TEST_PASSWORD: synthetic.password },
    keychainReader: () => { invoked = true; throw new Error('not_expected'); },
  });
  assert.ok(result.username === synthetic.username && result.password === synthetic.password);
  assert.equal(invoked, false);
  assert.equal(JSON.stringify(result), '{}');
  assert.equal(Object.keys(result).length, 0);
  assert.equal(inspect(result).includes(synthetic.password), false);
  assert.equal(inspect(result, { showHidden: true }).includes(synthetic.password), false);
  assert.equal(JSON.stringify({ ...result }), '{}');
});

test('Keychain result is projected to opaque fields and its transport buffer is wiped', () => {
  const buffer = Buffer.from(JSON.stringify({ ...synthetic, ignored: 'synthetic-extra' }));
  const result = localTestCredentials({ env: {}, keychainReader: () => buffer });
  assert.ok(result.username === synthetic.username && result.password === synthetic.password);
  assert.equal(JSON.stringify(result), '{}');
  assert.equal(buffer.every(byte => byte === 0), true);
  assert.equal(result.ignored, undefined);
});

test('partial environment never mixes credentials from different sources', () => {
  const buffer = Buffer.from(JSON.stringify(synthetic));
  const result = localTestCredentials({
    env: { LENS_TEST_USERNAME: 'synthetic-unrelated-user' },
    keychainReader: () => buffer,
  });
  assert.ok(result.username === synthetic.username && result.password === synthetic.password);
  assert.equal(buffer.every(byte => byte === 0), true);
});

test('malformed or incomplete credential schemas fail closed and wipe the buffer', () => {
  for (const value of [JSON.stringify({ username: synthetic.username }), synthetic.password, 'null']) {
    const buffer = Buffer.from(value);
    assert.throws(() => localTestCredentials({ env: {}, keychainReader: () => buffer }),
      error => error.message === 'local_test_credentials_unavailable'
        && !inspect(error).includes(synthetic.password));
    assert.equal(buffer.every(byte => byte === 0), true);
  }
});

test('child-process failures cannot expose stdout, stderr or original exception details', () => {
  const stdout = Buffer.from(synthetic.password);
  const stderr = Buffer.from(synthetic.password);
  const original = Object.assign(new Error(synthetic.password), { stdout, stderr });
  assert.throws(() => localTestCredentials({ env: {}, keychainReader: () => { throw original; } }),
    error => error.message === 'local_test_credentials_unavailable'
      && !inspect(error).includes(synthetic.password));
  assert.equal(stdout.every(byte => byte === 0), true);
  assert.equal(stderr.every(byte => byte === 0), true);
});
