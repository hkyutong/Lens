import express = require('express');
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { createServer, request as httpRequest, Server } from 'http';
import { AddressInfo } from 'net';

declare const describe: any, beforeEach: any, afterEach: any, it: any, expect: any;

describe('legacy upload static boundary', () => {
  let root: string;
  let app: ReturnType<typeof express>;
  let server: Server;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(await fs.realpath(tmpdir()), 'lens-static-spec-'));
    await fs.mkdir(path.join(root, 'file'), { recursive: true });
    await fs.mkdir(path.join(root, 'public-assets'), { recursive: true });
    await fs.writeFile(path.join(root, 'file', 'synthetic.txt'), 'private');
    await fs.writeFile(path.join(root, 'public-assets', 'synthetic.txt'), 'public');
    const { blockLegacyUploadStatic } = require('./legacyUploadStatic.middleware');
    app = express();
    app.use(blockLegacyUploadStatic);
    app.use(express.static(root));
    app.post('/upload/file/download', (_req, res) => res.status(200).send('protected controller'));
    server = createServer(app);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  });
  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (root) await fs.rm(root, { recursive: true, force: true });
  });
  const request = (method: string, url: string): Promise<{ status: number; text: string }> => new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: (server.address() as AddressInfo).port, path: url, method }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.once('error', reject);
      res.once('end', () => resolve({ status: res.statusCode!, text: Buffer.concat(chunks).toString() }));
    });
    req.once('error', reject);
    req.end();
  });
  it.each(['/file/synthetic.txt', '/%66ile/synthetic.txt', '/api/file/synthetic.txt', '/static/file/synthetic.txt', '/public-assets/../file/synthetic.txt', '/public-assets/%2e%2e/file/synthetic.txt'])('blocks legacy upload static reads', async (url) => {
    expect((await request('GET', url)).status).toBe(404);
    expect((await request('HEAD', url)).status).toBe(404);
  });
  it('preserves explicit public assets and protected POST controllers', async () => {
    expect((await request('GET', '/public-assets/synthetic.txt')).text).toBe('public');
    expect((await request('POST', '/upload/file/download')).status).toBe(200);
  });
});
