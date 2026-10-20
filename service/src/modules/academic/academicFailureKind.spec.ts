import { classifyAcademicFailure } from './academicFailureKind';

declare const describe: any;
declare const it: any;
declare const expect: any;

describe('academic failure diagnostic classification', () => {
  it('recognizes a terminated response body through its transport cause', () => {
    const error = new TypeError('synthetic stream failure');
    Object.defineProperty(error, 'cause', {
      value: { code: 'UND_ERR_SOCKET', message: 'SYNTHETIC_PRIVATE_VALUE' },
    });
    expect(classifyAcademicFailure(error)).toBe('stream_terminated');
  });

  it('distinguishes upstream timeouts from connection failures', () => {
    expect(classifyAcademicFailure({ code: 'UND_ERR_BODY_TIMEOUT' })).toBe('timeout');
    expect(classifyAcademicFailure({ code: 'ECONNREFUSED' })).toBe('connection');
  });

  it('recognizes aborts without exposing their message', () => {
    expect(classifyAcademicFailure({ name: 'AbortError', message: 'SYNTHETIC_PRIVATE_VALUE' })).toBe('aborted');
  });

  it('distinguishes malformed JSON from runtime type failures', () => {
    expect(classifyAcademicFailure(new SyntaxError('synthetic invalid JSON'))).toBe('syntax_error');
    expect(classifyAcademicFailure(new TypeError('synthetic invalid type'))).toBe('type_error');
  });

  it('keeps ordinary errors distinct from unknown thrown values', () => {
    expect(classifyAcademicFailure(new Error('SYNTHETIC_PRIVATE_VALUE'))).toBe('error');
    expect(classifyAcademicFailure('SYNTHETIC_PRIVATE_VALUE')).toBe('unknown');
    expect(classifyAcademicFailure(null)).toBe('unknown');
  });

  it('does not invoke arbitrary diagnostic getters', () => {
    let reads = 0;
    const error = Object.create(null);
    for (const key of ['name', 'code', 'cause']) {
      Object.defineProperty(error, key, {
        get() { reads += 1; throw new Error('SYNTHETIC_PRIVATE_VALUE'); },
      });
    }
    expect(classifyAcademicFailure(error)).toBe('unknown');
    expect(reads).toBe(0);
  });

  it('cannot turn a diagnostic failure into another request failure', () => {
    const error = new Proxy({}, {
      getOwnPropertyDescriptor() { throw new Error('synthetic reflection failure'); },
      getPrototypeOf() { throw new Error('synthetic reflection failure'); },
    });
    expect(classifyAcademicFailure(error)).toBe('unknown');
  });

  it('rejects unrecognized codes and does not serialize the error', () => {
    const error = {
      code: '__proto__', name: 'SYNTHETIC_PRIVATE_VALUE',
      message: 'SYNTHETIC_PRIVATE_VALUE',
      toJSON() { throw new Error('serialization must not run'); },
    };
    expect(classifyAcademicFailure(error)).toBe('unknown');
  });
});
