import { execFileSync } from 'child_process';
import * as path from 'path';
import { academicScopeUserName, parseAcademicScopeUserName, signAcademicRequest } from './academicInternalAuth';

declare const describe: any;
declare const it: any;
declare const expect: any;

const secret = 'synthetic-internal-test-key-only-'.repeat(3);
const identity = { ownerId: 31, requestId: '00000000-0000-4000-8000-000000000031' };
const nonce = '00000000-0000-4000-8000-000000000041';

describe('Academic internal request identity', () => {
  it('uses one owner and request label without relying on client cookies', () => {
    expect(parseAcademicScopeUserName(academicScopeUserName(identity))).toEqual(identity);
  });

  it.each([0, -1, Number.MAX_SAFE_INTEGER + 1, NaN])('rejects invalid owners', (ownerId) => {
    expect(() => academicScopeUserName({ ...identity, ownerId })).toThrow();
  });

  it.each(['', 'synthetic-request', '../synthetic', '00000000-0000-1000-8000-000000000031'])(
    'rejects invalid request identifiers', (requestId) => {
      expect(() => academicScopeUserName({ ...identity, requestId })).toThrow();
    },
  );

  it('keeps historical numeric user labels distinct from a signed request identity', () => {
    expect(parseAcademicScopeUserName('31')).toBeUndefined();
  });

  it('requires a shared secret without using an unsigned fallback', () => {
    expect(() => signAcademicRequest('POST', '/academic/chat-process', '{}', identity, '')).toThrow();
  });

  it('mints a different nonce on each transport attempt', () => {
    const first = signAcademicRequest('POST', '/academic/chat-process', '{}', identity, secret);
    const second = signAcademicRequest('POST', '/academic/chat-process', '{}', identity, secret);
    expect(first['X-Lens-Academic-Nonce']).not.toBe(second['X-Lens-Academic-Nonce']);
    expect(first['X-Lens-Academic-Signature']).not.toBe(second['X-Lens-Academic-Signature']);
  });

  it('matches Python over the same UTF-8 body, query, owner and request', () => {
    const body = JSON.stringify({ prompt: '合成研究文本', user_name: academicScopeUserName(identity) });
    const resource = '/academic/file?path=synthetic%3Areport';
    const signature = signAcademicRequest('POST', resource, body, identity, secret, '1800000000', nonce);
    const python = execFileSync('python3', ['-c',
      'import json,sys; from shared_utils.lens_request_security import sign_request; p=json.load(sys.stdin); print(sign_request(p["secret"],"POST",p["resource"],p["body"].encode(),"1800000000",p["nonce"],"31",p["request"]))',
    ], {
      cwd: path.resolve(__dirname, '../../../..', 'academic-4.0'),
      input: JSON.stringify({ secret, resource, body, nonce, request: identity.requestId }), encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    expect(signature['X-Lens-Academic-Signature']).toBe(python);
  });

  it.each([
    ['GET', '/academic/chat-process', '{}', identity],
    ['POST', '/academic/file?path=synthetic', '{}', identity],
    ['POST', '/academic/chat-process', '{"synthetic":true}', identity],
    ['POST', '/academic/chat-process', '{}', { ...identity, ownerId: 32 }],
    ['POST', '/academic/chat-process', '{}', { ...identity, requestId: '00000000-0000-4000-8000-000000000032' }],
  ])('binds all request components into the authentication proof', (method, resource, body, alternateIdentity) => {
    const original = signAcademicRequest('POST', '/academic/chat-process', '{}', identity, secret, '1800000000', nonce);
    const alternate = signAcademicRequest(method, resource, body, alternateIdentity, secret, '1800000000', nonce);
    expect(original['X-Lens-Academic-Signature']).not.toBe(alternate['X-Lens-Academic-Signature']);
  });
});
