import { createHash, createHmac, randomUUID } from 'crypto';
import { ServiceUnavailableException } from '@nestjs/common';

export interface AcademicRequestIdentity {
  ownerId: number;
  requestId: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function academicScopeUserName(identity: AcademicRequestIdentity): string {
  if (!Number.isSafeInteger(identity?.ownerId) || identity.ownerId <= 0 || !uuidPattern.test(identity.requestId)) {
    throw new ServiceUnavailableException('Academic service unavailable');
  }
  return `${identity.ownerId}-${identity.requestId.toLowerCase()}`;
}

export function parseAcademicScopeUserName(value: unknown): AcademicRequestIdentity | undefined {
  const match = /^([1-9][0-9]*)-([0-9a-f-]+)$/i.exec(String(value || ''));
  if (!match) return undefined;
  const identity = { ownerId: Number(match[1]), requestId: match[2].toLowerCase() };
  academicScopeUserName(identity);
  return identity;
}

export function signAcademicRequest(
  method: string,
  resource: string,
  body: string,
  identity: AcademicRequestIdentity,
  secret = process.env.LENS_ACADEMIC_INTERNAL_SECRET || '',
  timestamp = String(Math.floor(Date.now() / 1000)),
  nonce = randomUUID(),
): Record<string, string> {
  academicScopeUserName(identity);
  if (secret.length < 32 || !uuidPattern.test(nonce)) {
    throw new ServiceUnavailableException('Academic service unavailable');
  }
  const digest = createHash('sha256').update(body, 'utf8').digest('hex');
  const message = [method.toUpperCase(), resource, digest, timestamp, nonce, String(identity.ownerId), identity.requestId].join('\n');
  return {
    'X-Lens-Academic-Timestamp': timestamp,
    'X-Lens-Academic-Nonce': nonce,
    'X-Lens-Academic-Owner': String(identity.ownerId),
    'X-Lens-Academic-Request': identity.requestId,
    'X-Lens-Academic-Signature': createHmac('sha256', secret).update(message, 'utf8').digest('hex'),
  };
}
