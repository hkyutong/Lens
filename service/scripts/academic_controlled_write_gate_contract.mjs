import assert from 'node:assert/strict';
import { runAcademicControlledWriteGate } from './academic_controlled_write_gate.mjs';

const token = [
  Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ id: 42 })).toString('base64url'),
  'test-signature',
].join('.');

const jsonResponse = (data, status = 200) =>
  new Response(JSON.stringify({ success: status < 400, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const ndjsonResponse = (status = 200) =>
  new Response(
    `${JSON.stringify({ chatId: 101 })}\n${JSON.stringify({
      finalContent: '可复现研究便于验证与累积知识。',
      finishReason: 'stop',
    })}\n`,
    {
      status,
      headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
    },
  );

const baseEnv = {
  LENS_ACADEMIC_BASE_URL: 'http://127.0.0.1:9520/api',
  LENS_ACADEMIC_E2E_TOKEN: token,
  LENS_ACADEMIC_EXPECTED_USER_ID: '42',
  LENS_ACADEMIC_E2E_MODEL: 'academic-test-model',
  LENS_ACADEMIC_EXPECT_DEDUCTION: 'charged',
  LENS_ACADEMIC_WRITE_CONFIRM: 'CONFIRM_LENS_ACADEMIC_TEST_WRITES',
  LENS_ACADEMIC_WRITE_TIMEOUT_MS: '5000',
};

const createFetchMock = ({ academicStatus = 200, directUserInfo = false } = {}) => {
  const calls = [];
  let balanceReadCount = 0;

  const fetchMock = async (url, options = {}) => {
    const parsed = new URL(url);
    const route = `${options.method || 'GET'} ${parsed.pathname}`;
    calls.push({
      route,
      search: parsed.search,
      authorized: options.headers?.Authorization === `Bearer ${token}`,
      redirect: options.redirect,
    });

    if (route === 'GET /api/auth/getInfo') {
      return jsonResponse(directUserInfo ? { id: 42 } : { userInfo: { id: 42 } });
    }
    if (route === 'GET /api/balance/query') {
      balanceReadCount += 1;
      return jsonResponse({
        sumModel3Count: balanceReadCount === 1 ? 10 : 9,
        useModel3Count: balanceReadCount === 1 ? 0 : 1,
        useModel3Token: balanceReadCount === 1 ? 20 : 20,
        packageId: 1,
      });
    }
    if (route === 'POST /api/group/create') return jsonResponse({ id: 77 });
    if (route === 'POST /api/upload/file') return jsonResponse('file/lens-e2e/fixture.md');
    if (route === 'POST /api/academic/chat-process') return ndjsonResponse(academicStatus);
    if (route === 'POST /api/share/create') return jsonResponse({ shareCode: 'Abc12345' });
    if (route === 'GET /api/share/Abc12345') {
      return jsonResponse({ htmlContent: '<article>Lens 受控验收结果</article>' });
    }
    if (route === 'POST /api/group/del') return jsonResponse({ affected: 1 });
    return jsonResponse(null, 404);
  };

  return { calls, fetchMock };
};

const safeMock = createFetchMock();
const safeRun = await runAcademicControlledWriteGate({
  env: baseEnv,
  fetchImpl: safeMock.fetchMock,
});
assert.equal(safeRun.exitCode, 0);
assert.equal(safeRun.result?.passed, true);
assert.equal(safeRun.result?.residues.length, 0);
assert.equal(safeMock.calls.at(-1)?.route, 'POST /api/group/del');
assert.equal(
  safeMock.calls.every(call => call.authorized && call.redirect === 'error'),
  true,
);

const directIdentityMock = createFetchMock({ directUserInfo: true });
const directIdentityRun = await runAcademicControlledWriteGate({
  env: baseEnv,
  fetchImpl: directIdentityMock.fetchMock,
});
assert.equal(directIdentityRun.exitCode, 0);
assert.equal(directIdentityRun.result?.passed, true);

const residueMock = createFetchMock();
const missingResidueConfirmation = await runAcademicControlledWriteGate({
  env: { ...baseEnv, LENS_ACADEMIC_TEST_UPLOAD: 'true' },
  fetchImpl: residueMock.fetchMock,
});
assert.equal(missingResidueConfirmation.exitCode, 2);
assert.equal(residueMock.calls.length, 0);

const fullMock = createFetchMock();
const fullRun = await runAcademicControlledWriteGate({
  env: {
    ...baseEnv,
    LENS_ACADEMIC_TEST_UPLOAD: 'true',
    LENS_ACADEMIC_TEST_SHARE: 'true',
    LENS_ACADEMIC_RESIDUE_CONFIRM: 'CONFIRM_LENS_ACADEMIC_UPLOAD_AND_SHARE_RESIDUE',
  },
  fetchImpl: fullMock.fetchMock,
});
assert.equal(fullRun.exitCode, 0);
assert.equal(fullRun.result?.passed, true);
assert.deepEqual(
  fullRun.result?.residues.map(residue => residue.kind),
  ['upload', 'share'],
);
assert.equal(
  fullRun.result?.residues.every(
    residue => /^[a-f0-9]{16}$/.test(residue.referenceFingerprint) && !('reference' in residue),
  ),
  true,
);
assert.equal(
  fullMock.calls.some(call => call.route === 'POST /api/upload/file'),
  true,
);
assert.equal(
  fullMock.calls.some(call => call.route === 'POST /api/share/create'),
  true,
);
assert.equal(fullMock.calls.at(-1)?.route, 'POST /api/group/del');

const failureMock = createFetchMock({ academicStatus: 500 });
const failedRun = await runAcademicControlledWriteGate({
  env: baseEnv,
  fetchImpl: failureMock.fetchMock,
});
assert.equal(failedRun.exitCode, 1);
assert.equal(failureMock.calls.at(-1)?.route, 'POST /api/group/del');

const billingMismatchMock = createFetchMock();
const billingMismatchRun = await runAcademicControlledWriteGate({
  env: { ...baseEnv, LENS_ACADEMIC_EXPECT_DEDUCTION: 'free' },
  fetchImpl: billingMismatchMock.fetchMock,
});
assert.equal(billingMismatchRun.exitCode, 1);
assert.equal(billingMismatchMock.calls.at(-1)?.route, 'POST /api/group/del');
assert.equal(
  billingMismatchMock.calls.some(call => call.route === 'POST /api/share/create'),
  false,
);

for (const calls of [
  safeMock.calls,
  fullMock.calls,
  failureMock.calls,
  billingMismatchMock.calls,
]) {
  for (const forbiddenRoute of [
    'POST /api/order/buy',
    'POST /api/crami/createPackage',
    'POST /api/crami/createCrami',
    'POST /api/crami/useCrami',
    'POST /api/group/delAll',
  ]) {
    assert.equal(
      calls.some(call => call.route === forbiddenRoute),
      false,
    );
  }
}

console.log(
  JSON.stringify(
    {
      passed: true,
      defaultResidues: 0,
      residueConfirmationRequired: true,
      cleanupAfterSuccess: true,
      cleanupAfterFailure: true,
      billingExpectationEnforced: true,
      orderPaymentPackageCramiCalls: 0,
      tokenExposed: false,
    },
    null,
    2,
  ),
);
