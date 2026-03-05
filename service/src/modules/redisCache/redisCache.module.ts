import { Global, Logger, Module } from '@nestjs/common';
import { createClient } from 'redis';
import { RedisCacheService } from './redisCache.service';

type ExpireValue = {
  value: string;
  expireAt: number | null;
};

function createMemoryRedisClient() {
  const kvStore = new Map<string, ExpireValue>();
  const zsetStore = new Map<string, Map<string, number>>();

  const cleanupExpired = (key: string) => {
    const item = kvStore.get(key);
    if (!item) return;
    if (item.expireAt !== null && item.expireAt <= Date.now()) {
      kvStore.delete(key);
    }
  };

  const globToRegExp = (pattern: string) => {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
  };

  return {
    on: () => undefined,
    connect: async () => undefined,
    quit: async () => undefined,
    get: async (key: string) => {
      cleanupExpired(key);
      return kvStore.get(key)?.value ?? null;
    },
    set: async (key: string, value: string, options?: { EX?: number }) => {
      const ttl = Number(options?.EX || 0);
      const expireAt = ttl > 0 ? Date.now() + ttl * 1000 : null;
      kvStore.set(key, { value: String(value), expireAt });
      return 'OK';
    },
    ttl: async (key: string) => {
      cleanupExpired(key);
      const item = kvStore.get(key);
      if (!item) return -2;
      if (item.expireAt === null) return -1;
      return Math.max(0, Math.ceil((item.expireAt - Date.now()) / 1000));
    },
    del: async (...keys: string[]) => {
      let count = 0;
      for (const key of keys) {
        if (kvStore.delete(key)) count += 1;
        if (zsetStore.delete(key)) count += 1;
      }
      return count;
    },
    zAdd: async (key: string, items: { score: number; value: string }[]) => {
      const zset = zsetStore.get(key) ?? new Map<string, number>();
      for (const item of items) {
        zset.set(item.value, Number(item.score));
      }
      zsetStore.set(key, zset);
      return items.length;
    },
    zRange: async (key: string, start: number, stop: number) => {
      const zset = zsetStore.get(key);
      if (!zset) return [];
      const sorted = [...zset.entries()].sort((a, b) => a[1] - b[1]).map(item => item[0]);
      const from = Math.max(0, start);
      const to = stop < 0 ? sorted.length : Math.min(sorted.length, stop + 1);
      return sorted.slice(from, to);
    },
    zRem: async (key: string, member: string) => {
      const zset = zsetStore.get(key);
      if (!zset) return 0;
      return zset.delete(member) ? 1 : 0;
    },
    keys: async (pattern: string) => {
      const reg = globToRegExp(pattern || '*');
      const allKeys = [...new Set([...kvStore.keys(), ...zsetStore.keys()])];
      return allKeys.filter(key => reg.test(key));
    },
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Redis connect timeout after ${ms}ms`)), ms);
    promise
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

@Global()
@Module({
  imports: [],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async () => {
        const fallbackClient = createMemoryRedisClient();
        const redisUrl = process.env.REDIS_URL;
        const host = process.env.REDIS_HOST;
        const port = parseInt(process.env.REDIS_PORT, 10);
        const password = process.env.REDIS_PASSWORD;
        const username = process.env.REDIS_USER || undefined;
        const database = parseInt(process.env.REDIS_DB, 10) || 0;
        const connectTimeoutMs = Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 3000);

        if (!redisUrl && (!host || !port)) {
          Logger.warn(
            `Redis config missing, use in-memory fallback cache in dev mode | 未配置 Redis，将降级为内存缓存`,
            'RedisCacheModule',
          );
          return fallbackClient;
        }

        const commonSocket: any = {
          connectTimeout: connectTimeoutMs,
          reconnectStrategy: (retries: number) => {
            if (retries > 30) return new Error('Redis reconnect retry limit reached');
            return Math.min(200 + retries * 150, 5000);
          },
        };
        const useTls = Boolean(redisUrl?.startsWith('rediss://'));
        if (useTls) {
          commonSocket.tls = true;
          commonSocket.rejectUnauthorized = false;
        }

        const client = redisUrl
          ? createClient({
              url: redisUrl,
              socket: commonSocket,
              database,
            })
          : createClient({
              socket: {
                host,
                port,
                ...commonSocket,
              },
              username,
              password,
              database,
            });

        client.on('ready', () => {
          Logger.log(`Redis connection successful`, 'RedisCacheModule');
        });

        client.on('error', err => {
          Logger.error(`Redis connection failed: ${err}`, 'RedisCacheModule');
        });

        try {
          await withTimeout(client.connect(), connectTimeoutMs);
          return client;
        } catch (error) {
          Logger.warn(
            `Redis unavailable, fallback to memory cache: ${error?.message || error}`,
            'RedisCacheModule',
          );
          try {
            await client.quit();
          } catch (_e) {}
          return fallbackClient;
        }
      },
    },
    RedisCacheService,
  ],
  exports: ['REDIS_CLIENT', RedisCacheService],
})
export class RedisCacheModule {}
