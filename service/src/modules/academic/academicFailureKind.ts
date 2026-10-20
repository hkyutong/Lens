export type AcademicFailureKind =
  | 'stream_terminated'
  | 'connection'
  | 'timeout'
  | 'aborted'
  | 'syntax_error'
  | 'type_error'
  | 'error'
  | 'unknown';

const codeKinds = new Map<string, AcademicFailureKind>([
  ['UND_ERR_SOCKET', 'stream_terminated'],
  ['ECONNRESET', 'stream_terminated'],
  ['ECONNREFUSED', 'connection'],
  ['ENOTFOUND', 'connection'],
  ['EAI_AGAIN', 'connection'],
  ['ETIMEDOUT', 'timeout'],
  ['UND_ERR_CONNECT_TIMEOUT', 'timeout'],
  ['UND_ERR_HEADERS_TIMEOUT', 'timeout'],
  ['UND_ERR_BODY_TIMEOUT', 'timeout'],
  ['ABORT_ERR', 'aborted'],
]);

function dataProperty(value: unknown, key: 'name' | 'code' | 'cause'): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

export function classifyAcademicFailure(error: unknown): AcademicFailureKind {
  try {
    const cause = dataProperty(error, 'cause');
    for (const code of [dataProperty(error, 'code'), dataProperty(cause, 'code')]) {
      if (typeof code !== 'string') continue;
      const kind = codeKinds.get(code);
      if (kind) return kind;
    }

    const name = dataProperty(error, 'name');
    if (name === 'AbortError') return 'aborted';
    if (name === 'TimeoutError') return 'timeout';
    if (name === 'SyntaxError' || error instanceof SyntaxError) return 'syntax_error';
    if (name === 'TypeError' || error instanceof TypeError) return 'type_error';
    if (error instanceof Error) return 'error';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
