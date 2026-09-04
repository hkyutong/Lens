import assert from 'node:assert/strict';
import { runAcademicRealGate } from './academic_real_gate.mjs';

const ok = data =>
  new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const calls = [];
const fetchMock = async (url, options = {}) => {
  const parsed = new URL(url);
  calls.push({
    path: `${parsed.pathname}${parsed.search}`,
    method: options.method || 'GET',
    authorized: options.headers?.Authorization === 'Bearer short-lived-test-token',
    redirect: options.redirect,
  });

  const responses = new Map([
    ['/api/auth/getInfo', { userInfo: { id: 7 } }],
    ['/api/config/queryFront', { siteName: 'Lens' }],
    ['/api/group/query', [{ id: 11, title: '研究会话' }]],
    ['/api/chatlog/chatList?groupId=11&size=1', { rows: [{ id: 12 }] }],
    ['/api/balance/query', { packageId: 1, sumModel3Count: 20 }],
    ['/api/models/list', { modelMaps: { academic: [] } }],
    ['/api/crami/queryAllPackage?status=1&type=1&size=1', { rows: [{ id: 1 }] }],
    ['/api/academic/core-function-list', { rows: [{ name: '中文润色' }] }],
    ['/api/academic/plugin-list', { rows: [{ name: '论文速读' }] }],
    ['/api/share/Abc12345', { htmlContent: '<article>研究结果</article>' }],
  ]);

  if (!responses.has(`${parsed.pathname}${parsed.search}`)) {
    return new Response(JSON.stringify({ success: false }), { status: 404 });
  }
  return ok(responses.get(`${parsed.pathname}${parsed.search}`));
};

const env = {
  LENS_ACADEMIC_BASE_URL: 'http://127.0.0.1:9520/api',
  LENS_ACADEMIC_E2E_TOKEN: 'short-lived-test-token',
  LENS_ACADEMIC_SHARE_CODE: 'Abc12345',
  LENS_ACADEMIC_TIMEOUT_MS: '2000',
};

const success = await runAcademicRealGate({ env, fetchImpl: fetchMock });
assert.equal(success.exitCode, 0);
assert.equal(success.result?.passed, true);
assert.equal(success.result?.steps.length, 10);
assert.equal(
  success.result?.steps.every(step => step.passed),
  true,
);
assert.equal(
  calls.every(call => call.authorized && call.redirect === 'error'),
  true,
);
assert.deepEqual(
  calls.filter(call => call.method !== 'GET').map(call => call.path),
  ['/api/academic/core-function-list', '/api/academic/plugin-list'],
);
for (const forbiddenPath of [
  '/api/academic/chat-process',
  '/api/academic/workflow-process',
  '/api/upload/file',
  '/api/group/create',
  '/api/order/buy',
  '/api/share/create',
]) {
  assert.equal(
    calls.some(call => call.path.startsWith(forbiddenPath)),
    false,
  );
}

let rejectedFetchCalls = 0;
const rejectedFetch = async () => {
  rejectedFetchCalls += 1;
  return ok({});
};
const insecureRemote = await runAcademicRealGate({
  env: {
    ...env,
    LENS_ACADEMIC_BASE_URL: 'http://example.com/api',
    LENS_ACADEMIC_ALLOW_REMOTE: 'true',
  },
  fetchImpl: rejectedFetch,
});
assert.equal(insecureRemote.exitCode, 2);

const mismatchedRemote = await runAcademicRealGate({
  env: {
    ...env,
    LENS_ACADEMIC_BASE_URL: 'https://lens.example.com/api',
    LENS_ACADEMIC_ALLOW_REMOTE: 'true',
    LENS_ACADEMIC_REMOTE_HOST: 'another.example.com',
  },
  fetchImpl: rejectedFetch,
});
assert.equal(mismatchedRemote.exitCode, 2);

const invalidShare = await runAcademicRealGate({
  env: { ...env, LENS_ACADEMIC_SHARE_CODE: 'invalid' },
  fetchImpl: rejectedFetch,
});
assert.equal(invalidShare.exitCode, 2);
assert.equal(rejectedFetchCalls, 0);

console.log(
  JSON.stringify(
    {
      passed: true,
      readSteps: success.result.steps.length,
      writeCalls: 0,
      insecureRemoteRejected: true,
      mismatchedRemoteRejected: true,
      invalidShareRejected: true,
      tokenExposed: false,
    },
    null,
    2,
  ),
);
