const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Exercise only fixture routing. No browser, network, account or storage access.
async function loadFixtureRoutes() {
  const source = fs.readFileSync(
    path.join(__dirname, '../playwright/academic_regression.spec.cjs'),
    'utf8',
  );
  const fixtureModule = { exports: {} };
  const registerTest = new Proxy(() => {}, { get: () => () => {} });
  const sandbox = {
    module: fixtureModule,
    process: { env: { CHAT_BASE_URL: 'https://lens-fixture.example' } },
    URL,
    require(name) {
      if (name === 'node:path') return path;
      if (name === './ui_audit.cjs') return { auditInterface: async () => {} };
      if (name === '@playwright/test') return { test: registerTest, expect: () => {} };
      throw new Error('unexpected_fixture_dependency');
    },
  };
  vm.runInNewContext(
    source + '\nmodule.exports = { mountAcceptanceFixture };',
    sandbox,
    { timeout: 1000 },
  );
  let contextHandler;
  let apiHandler;
  const page = {
    context: () => ({ route: async (_pattern, handler) => { contextHandler = handler; } }),
    route: async (_pattern, handler) => { apiHandler = handler; },
  };
  await fixtureModule.exports.mountAcceptanceFixture(page);
  return { contextHandler, apiHandler };
}

function fakeRoute(url) {
  const actions = [];
  return {
    actions,
    route: {
      request: () => ({ url: () => url }),
      abort: async () => { actions.push('abort'); },
      continue: async () => { actions.push('continue'); },
      fallback: async () => { actions.push('fallback'); },
      fulfill: async () => { actions.push('fulfill'); },
    },
  };
}

test('fixture context refuses API traffic when the page handler is absent', async () => {
  const { contextHandler } = await loadFixtureRoutes();
  for (const url of [
    'http://127.0.0.1/api/academic/health',
    'http://localhost/api/academic/health',
    'https://lens-fixture.example/api/academic/health',
    'https://external.example/api/academic/health',
  ]) {
    const { route, actions } = fakeRoute(url);
    await contextHandler(route);
    assert.deepEqual(actions, ['abort']);
  }
});

test('fixture context permits only same-origin frontend resources', async () => {
  const { contextHandler } = await loadFixtureRoutes();
  const asset = fakeRoute('https://lens-fixture.example/src/main.ts');
  await contextHandler(asset.route);
  assert.deepEqual(asset.actions, ['continue']);
  const external = fakeRoute('https://external.example/resource');
  await contextHandler(external.route);
  assert.deepEqual(external.actions, ['abort']);
});

test('page API route fulfills synthetic health without a network continuation', async () => {
  const { apiHandler } = await loadFixtureRoutes();
  const { route, actions } = fakeRoute('http://127.0.0.1/api/academic/health');
  await apiHandler(route);
  assert.deepEqual(actions, ['fulfill']);
});
