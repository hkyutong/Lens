// Test-only wire contract. Private inputs and outputs stay in controlled memory.
export const decodeJwtSubject = token => {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return Number(payload.id || payload.sub || 0);
  } catch (_error) {
    return 0;
  }
};

export const successEnvelope = body =>
  body?.success === true || body?.code === 200 || body?.status === 200;

export const responseData = body => body?.data;

export const parseNdjson = text => {
  const events = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim().replace(/^data:\s*/i, '');
    if (!trimmed || trimmed === '[DONE]') continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch (_error) {
      events.push({ content: trimmed });
    }
  }
  return events;
};
