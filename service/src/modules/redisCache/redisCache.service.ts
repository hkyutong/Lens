import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { RedisClientType } from 'redis';
import { randomBytes } from 'crypto';

@Injectable()
export class RedisCacheService {
  private readonly logger = new Logger(RedisCacheService.name);
  private jwtSecretCache = '';

  constructor(@Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType) {}

  private async safeCall<T>(op: string, executor: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await executor();
    } catch (error) {
      const message = (error as Error)?.message || String(error || 'unknown redis error');
      this.logger.warn(`Redis ${op} failed, fallback applied: ${message}`);
      return fallback;
    }
  }

  private async safeGet(key: string) {
    return this.safeCall<string | null>('get', async () => await this.redisClient.get(key), null);
  }

  private async safeSet(key: string, value: string, timeout?: number) {
    if (timeout && timeout > 0) {
      return this.safeCall<string>(
        'set(EX)',
        async () => await this.redisClient.set(key, value, { EX: timeout }),
        '',
      );
    }
    return this.safeCall<string>('set', async () => await this.redisClient.set(key, value), '');
  }

  private async safeDel(...keys: string[]) {
    if (!keys.length) return 0;
    if (keys.length === 1) {
      return this.safeCall<number>('del', async () => await this.redisClient.del(keys[0]), 0);
    }
    return this.safeCall<number>('del', async () => await this.redisClient.del(keys as any), 0);
  }

  private async safeZRange(key: string, start: number, stop: number) {
    return this.safeCall<string[]>(
      'zRange',
      async () => await this.redisClient.zRange(key, start, stop),
      [],
    );
  }

  private async safeZRem(key: string, member: string) {
    return this.safeCall<number>('zRem', async () => await this.redisClient.zRem(key, member), 0);
  }

  private async safeZAdd(key: string, score: number, value: string) {
    return this.safeCall<number>(
      'zAdd',
      async () => await this.redisClient.zAdd(key, [{ score, value }]),
      0,
    );
  }

  async get(body) {
    const { key } = body;
    return await this.safeGet(key);
  }

  async set(body, timeout = 3600) {
    const { key, val } = body;
    return await this.safeSet(key, val, timeout);
  }

  async getJwtSecret(): Promise<string> {
    if (this.jwtSecretCache) return this.jwtSecretCache;

    const fromCache = await this.safeGet('JWT_SECRET');
    if (fromCache) {
      this.jwtSecretCache = String(fromCache);
      process.env.JWT_SECRET = this.jwtSecretCache;
      return this.jwtSecretCache;
    }

    const envSecret = String(process.env.JWT_SECRET || '').trim();
    if (envSecret) {
      this.jwtSecretCache = envSecret;
      await this.safeSet('JWT_SECRET', envSecret);
      return this.jwtSecretCache;
    }

    const generated = randomBytes(32).toString('hex');
    this.jwtSecretCache = generated;
    process.env.JWT_SECRET = generated;
    await this.safeSet('JWT_SECRET', generated);
    return this.jwtSecretCache;
  }

  async ttl(key) {
    return await this.safeCall<number>('ttl', async () => await this.redisClient.ttl(key), -2);
  }

  async del(body) {
    const { key } = body;
    await this.safeDel(key);
    return;
  }

  async saveToken(userId, token) {
    const maxDevices = 2;
    let tokens = await this.safeZRange(`tokens:${userId}`, 0, -1);

    if (tokens.includes(token)) {
      await this.safeZRem(`tokens:${userId}`, token);
      tokens = await this.safeZRange(`tokens:${userId}`, 0, -1);
    }

    while (tokens.length >= maxDevices) {
      const oldestToken = await this.safeZRange(`tokens:${userId}`, 0, 0);
      if (!oldestToken.length) break;
      await this.safeZRem(`tokens:${userId}`, oldestToken[0]);
      tokens = await this.safeZRange(`tokens:${userId}`, 0, -1);
    }

    await this.safeZAdd(`tokens:${userId}`, Date.now(), token);
  }

  async invalidateTokens(userId, tokens) {
    for (const token of tokens || []) {
      await this.safeDel(`token:${userId}:${token}`);
      await this.safeZRem(`tokens:${userId}`, token);
      await this.safeSet(`token_blacklist:${userId}:${token}`, '1', 7 * 24 * 60 * 60);
    }
  }

  async checkTokenAuth(token, req) {
    const { id: userId, role } = req.user;
    const maxDevices = 2;
    const isRevoked = await this.safeGet(`token_blacklist:${userId}:${token}`);
    if (isRevoked) {
      throw new HttpException(
        '您的登录已失效（已退出登录），请重新登录！',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (role === 'visitor') return true;
    if (['super', 'admin'].includes(role)) return true;

    let tokens = await this.safeZRange(`tokens:${userId}`, 0, -1);

    // Redis短暂不可用或重启后无记录时，允许当前请求并回填当前token，避免全站鉴权雪崩。
    if (!tokens.length) {
      await this.saveToken(userId, token);
      return true;
    }

    if (!tokens.includes(token)) {
      throw new HttpException(
        '您的登录已失效（可能由于其他设备登录），请重新登录！',
        HttpStatus.UNAUTHORIZED,
      );
    }

    while (tokens.length > maxDevices) {
      const oldestToken = await this.safeZRange(`tokens:${userId}`, 0, 0);
      if (!oldestToken.length || oldestToken[0] === token) break;
      await this.safeZRem(`tokens:${userId}`, oldestToken[0]);
      tokens = await this.safeZRange(`tokens:${userId}`, 0, -1);
    }

    return true;
  }

  async keys(pattern) {
    return await this.safeCall<string[]>(
      'keys',
      async () => {
        const keys = await this.redisClient.keys(pattern);
        return Array.isArray(keys) ? keys : [];
      },
      [],
    );
  }
}
