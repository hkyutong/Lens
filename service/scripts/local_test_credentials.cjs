const { execFileSync } = require('node:child_process');
const path = require('node:path');

function unavailable() {
  return new Error('local_test_credentials_unavailable');
}

function clearChildBuffers(error) {
  for (const key of ['stdout', 'stderr']) {
    if (Buffer.isBuffer(error?.[key])) error[key].fill(0);
  }
}

function readKeychain() {
  try {
    return execFileSync('python3', [path.join(__dirname, 'local_test_credentials.py')], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
      maxBuffer: 4096,
    });
  } catch (error) {
    clearChildBuffers(error);
    throw unavailable();
  }
}

function opaqueCredentials(username, password) {
  if (typeof username !== 'string' || !username || typeof password !== 'string' || !password) {
    throw unavailable();
  }
  return Object.defineProperties({}, {
    username: { get: () => username },
    password: { get: () => password },
    [Symbol.for('nodejs.util.inspect.custom')]: { value: () => '[LocalTestCredentials]' },
  });
}

function localTestCredentials({ env = process.env, keychainReader = readKeychain } = {}) {
  if (env.LENS_TEST_USERNAME && env.LENS_TEST_PASSWORD) {
    return opaqueCredentials(env.LENS_TEST_USERNAME, env.LENS_TEST_PASSWORD);
  }
  let buffer;
  try {
    buffer = keychainReader();
    if (!Buffer.isBuffer(buffer) || buffer.length > 4096) throw unavailable();
    const payload = JSON.parse(buffer.toString('utf8'));
    return opaqueCredentials(payload.username, payload.password);
  } catch (error) {
    clearChildBuffers(error);
    throw unavailable();
  } finally {
    if (Buffer.isBuffer(buffer)) buffer.fill(0);
  }
}

module.exports = { localTestCredentials };
