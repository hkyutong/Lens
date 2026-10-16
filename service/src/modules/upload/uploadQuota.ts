import { randomUUID } from 'crypto';

export interface UploadQuotaWindow {
  key: string;
  limit: number;
  ttlSeconds: number;
  releaseOnFailure?: boolean;
}

export interface UploadQuotaRedis {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
}

export interface UploadQuotaReservation {
  commit(): Promise<void>;
  release(): Promise<void>;
}

const RESERVE = `
local count = #KEYS - 1
local values = {}
local rawValues = {}
for i = 1, count do
  local raw = redis.call('GET', KEYS[i])
  local used = 0
  if raw then used = tonumber(raw) end
  if raw and not used then
    local valid, decoded = pcall(cjson.decode, raw)
    if valid and (type(decoded) == 'number' or type(decoded) == 'string') then used = tonumber(decoded) end
  end
  if not used or used < 0 or used % 1 ~= 0 then return -1 end
  if used >= tonumber(ARGV[(i - 1) * 2 + 1]) then return 0 end
  values[i] = used
  rawValues[i] = raw
end
for i = 1, count do
  if rawValues[i] and not tonumber(rawValues[i]) then
    local ttl = redis.call('TTL', KEYS[i])
    redis.call('SET', KEYS[i], tostring(values[i]))
    if ttl > 0 then redis.call('EXPIRE', KEYS[i], ttl) end
  end
  local used = redis.call('INCR', KEYS[i])
  if used == 1 then redis.call('EXPIRE', KEYS[i], ARGV[(i - 1) * 2 + 2]) end
end
redis.call('SET', KEYS[#KEYS], 'reserved', 'EX', ARGV[#ARGV])
return 1
`;

const COMMIT = `
if redis.call('GET', KEYS[1]) ~= 'reserved' then return 0 end
local ttl = redis.call('TTL', KEYS[1])
redis.call('SET', KEYS[1], 'committed', 'EX', math.max(ttl, 1))
return 1
`;

const RELEASE = `
if redis.call('GET', KEYS[#KEYS]) ~= 'reserved' then return 0 end
for i = 1, #KEYS - 1 do
  local used = tonumber(redis.call('GET', KEYS[i]) or '0')
  if used > 0 then redis.call('DECR', KEYS[i]) end
end
redis.call('DEL', KEYS[#KEYS])
return 1
`;

/** Each successful upload consumes once; release is idempotent for this reservation. */
export async function reserveUploadQuota(
  redis: UploadQuotaRedis,
  windows: readonly UploadQuotaWindow[],
): Promise<UploadQuotaReservation | null> {
  if (!windows.length) return { commit: async () => undefined, release: async () => undefined };
  if (
    windows.some(
      window =>
        !Number.isSafeInteger(window.limit) ||
        window.limit < 1 ||
        !Number.isSafeInteger(window.ttlSeconds) ||
        window.ttlSeconds < 1,
    )
  ) {
    throw new Error('INVALID_UPLOAD_QUOTA');
  }
  const reservationKey = `lens:upload:reservation:${randomUUID()}`;
  const keys = [...windows.map(window => window.key), reservationKey];
  const arguments_ = windows.flatMap(window => [window.limit, window.ttlSeconds]);
  const ttl = Math.max(...windows.map(window => window.ttlSeconds)) + 3600;
  const releaseKeys = [
    ...windows.filter(window => window.releaseOnFailure !== false).map(window => window.key),
    reservationKey,
  ];
  let acquired: unknown;
  try {
    acquired = await redis.eval(RESERVE, { keys, arguments: [...arguments_, ttl].map(String) });
  } catch (error) {
    await redis.eval(RELEASE, { keys: releaseKeys, arguments: [] });
    throw error;
  }
  if (Number(acquired) === -1) throw new Error('INVALID_UPLOAD_QUOTA_STATE');
  if (Number(acquired) !== 1) return null;
  return {
    commit: async () => {
      await redis.eval(COMMIT, { keys: [reservationKey], arguments: [] });
    },
    release: async () => {
      await redis.eval(RELEASE, { keys: releaseKeys, arguments: [] });
    },
  };
}
