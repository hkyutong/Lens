declare const describe: any;
declare const it: any;
declare const expect: any;
declare const beforeAll: any;
declare const afterAll: any;
declare const afterEach: any;

import { spawn, spawnSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { createClient } from 'redis';
import { reserveUploadQuota } from './uploadQuota';

const describeRedis =
  spawnSync('redis-server', ['--version'], { stdio: 'ignore' }).status === 0
    ? describe
    : describe.skip;

describeRedis('upload quota atomic reservation', () => {
  let directory: string;
  let server: ReturnType<typeof spawn>;
  let redis: ReturnType<typeof createClient>;
  beforeAll(async () => {
    directory = mkdtempSync('/tmp/lens-upload-quota-test-');
    const socket = join(directory, 'redis.sock');
    server = spawn(
      'redis-server',
      ['--port', '0', '--unixsocket', socket, '--save', '', '--appendonly', 'no'],
      { stdio: 'ignore' },
    );
    for (let attempt = 0; !existsSync(socket) && attempt < 100; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    redis = createClient({ socket: { path: socket } });
    redis.on('error', () => undefined);
    await redis.connect();
  });
  afterEach(async () => {
    await redis.flushDb();
  });
  afterAll(async () => {
    if (redis?.isOpen) {
      await redis.quit();
    }
    if (server && server.exitCode === null) {
      server.kill('SIGTERM');
      await new Promise<void>(resolve => server.once('exit', () => resolve()));
    }
    rmSync(directory, { recursive: true, force: true });
  });

  it('does not allow concurrent requests beyond a daily allowance', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 12 }, () =>
        reserveUploadQuota(redis, [{ key: 'test:day', limit: 3, ttlSeconds: 86400 }]),
      ),
    );
    expect(attempts.filter(Boolean)).toHaveLength(3);
    expect(await redis.get('test:day')).toBe('3');
  });

  it('releases a failed reservation exactly once', async () => {
    const reservation = await reserveUploadQuota(redis, [
      { key: 'test:day', limit: 1, ttlSeconds: 86400 },
    ]);
    expect(reservation).not.toBeNull();
    await reservation!.release();
    await reservation!.release();
    expect(await redis.get('test:day')).toBe('0');
    expect(
      await reserveUploadQuota(redis, [{ key: 'test:day', limit: 1, ttlSeconds: 86400 }]),
    ).not.toBeNull();
  });

  it('keeps committed uploads counted and ignores a late duplicate release', async () => {
    const reservation = await reserveUploadQuota(redis, [
      { key: 'test:day', limit: 1, ttlSeconds: 86400 },
    ]);
    await reservation!.commit();
    await reservation!.commit();
    await reservation!.release();
    expect(await redis.get('test:day')).toBe('1');
    expect(
      await reserveUploadQuota(redis, [{ key: 'test:day', limit: 1, ttlSeconds: 86400 }]),
    ).toBeNull();
  });

  it('checks all windows atomically without incrementing an available window on rejection', async () => {
    await redis.set('test:minute', '2');
    const result = await reserveUploadQuota(redis, [
      { key: 'test:day', limit: 10, ttlSeconds: 86400 },
      { key: 'test:minute', limit: 2, ttlSeconds: 70 },
    ]);
    expect(result).toBeNull();
    expect(await redis.get('test:day')).toBeNull();
    expect(await redis.get('test:minute')).toBe('2');
  });

  it('returns all windows after asynchronous failure', async () => {
    const reservation = await reserveUploadQuota(redis, [
      { key: 'test:day', limit: 3, ttlSeconds: 86400 },
      { key: 'test:minute', limit: 20, ttlSeconds: 70 },
    ]);
    try {
      await Promise.reject(new Error('SYNTHETIC_FAILURE'));
    } catch {
      await reservation!.release();
    }
    expect(await redis.get('test:day')).toBe('0');
    expect(await redis.get('test:minute')).toBe('0');
  });

  it('returns daily allowance on failure while retaining short term attempts', async () => {
    const reservation = await reserveUploadQuota(redis, [
      { key: 'test:day', limit: 3, ttlSeconds: 86400 },
      { key: 'test:minute', limit: 20, ttlSeconds: 70, releaseOnFailure: false },
      { key: 'test:hour', limit: 100, ttlSeconds: 3700, releaseOnFailure: false },
    ]);
    await reservation!.release();
    await reservation!.release();
    expect(await redis.get('test:day')).toBe('0');
    expect(await redis.get('test:minute')).toBe('1');
    expect(await redis.get('test:hour')).toBe('1');
  });

  it('releases daily allowance if reservation response fails after atomic acquisition', async () => {
    let first = true;
    const unreliable = {
      eval: async (script: string, options: { keys: string[]; arguments: string[] }) => {
        const result = await redis.eval(script, options);
        if (first) {
          first = false;
          throw new Error('SYNTHETIC_ACK_FAILURE');
        }
        return result;
      },
    };
    await expect(
      reserveUploadQuota(unreliable, [
        { key: 'test:day', limit: 3, ttlSeconds: 86400 },
        { key: 'test:minute', limit: 20, ttlSeconds: 70, releaseOnFailure: false },
      ]),
    ).rejects.toThrow();
    expect(await redis.get('test:day')).toBe('0');
    expect(await redis.get('test:minute')).toBe('1');
  });

  it('keeps legacy JSON string counters and their remaining expiry', async () => {
    await redis.set('test:day', JSON.stringify('2'), { EX: 600 });
    const reservation = await reserveUploadQuota(redis, [
      { key: 'test:day', limit: 3, ttlSeconds: 86400 },
    ]);
    expect(reservation).not.toBeNull();
    expect(await redis.get('test:day')).toBe('3');
    const remaining = await redis.ttl('test:day');
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(600);
    expect(
      await reserveUploadQuota(redis, [{ key: 'test:day', limit: 3, ttlSeconds: 86400 }]),
    ).toBeNull();
  });
  it('fails closed for invalid persisted counters without changing available windows', async () => {
    await redis.set('test:day', JSON.stringify({ synthetic: true }));
    await expect(
      reserveUploadQuota(redis, [
        { key: 'test:minute', limit: 20, ttlSeconds: 70, releaseOnFailure: false },
        { key: 'test:day', limit: 3, ttlSeconds: 86400 },
      ]),
    ).rejects.toThrow();
    expect(await redis.get('test:minute')).toBeNull();
  });
});
