import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { AttachmentService } from '../attachment/attachment.service';
import { UploadService } from './upload.service';

declare const describe: any, beforeEach: any, afterEach: any, it: any, expect: any;

describe('owner protected download boundary', () => {
  let service: UploadService;
  let attachmentService: AttachmentService;
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(await fs.realpath(tmpdir()), 'lens-download-spec-'));
    const records = new Map();
    const repo = { create: (row: any) => row, save: async (row: any) => { records.set(row.id, row); return row; }, findOne: async ({ where }: any) => {
      const row = records.get(where.id); return row?.ownerId === where.ownerId ? row : null;
    } };
    attachmentService = new AttachmentService(repo as any, root);
    service = Object.assign(Object.create(UploadService.prototype), { attachmentService });
  });
  afterEach(async () => { if (root) await fs.rm(root, { recursive: true, force: true }); });

  const response = () => {
    const headers = new Map();
    const result: { body: Buffer | null; headers: Map<string, unknown> } = { body: null, headers };
    return { result, res: { setHeader: (key: string, value: unknown) => headers.set(key.toLowerCase(), value), end: (body: Buffer) => { result.body = body; } } };
  };

  it('downloads only owner bytes with private response headers', async () => {
    const ref = await attachmentService.storePrivateAttachment(Buffer.from('synthetic owner text'), { filename: 'study.txt', contentType: 'text/plain' }, 101);
    const { result, res } = response();
    await service.proxyUploadedFile(ref, '', res as any, 101);
    expect(result.body?.toString()).toBe('synthetic owner text');
    expect(result.headers.get('cache-control')).toBe('private, no-store');
    expect(result.headers.get('x-content-type-options')).toBe('nosniff');
    expect(result.headers.get('content-disposition')).toContain('attachment');
  });

  it('does not send a body to another owner', async () => {
    const ref = await attachmentService.storePrivateAttachment(Buffer.from('private'), { filename: 'study.txt' }, 101);
    const { result, res } = response();
    await expect(service.proxyUploadedFile(ref, '', res as any, 202)).rejects.toBeInstanceOf(NotFoundException);
    expect(result.body).toBeNull();
    expect(result.headers.size).toBe(0);
  });

  it.each([
    '/file/synthetic.txt', '/api/file/synthetic.txt', '/static/file/synthetic.txt',
    '../synthetic.txt', 'file:///synthetic.txt',
    'http://127.0.0.1/synthetic.txt', 'http://169.254.169.254/synthetic.txt',
    'https://example.invalid/synthetic.txt', 'https://user:synthetic@example.invalid/synthetic.txt',
    `attachment:${randomUUID()}/../outside`, '', randomUUID(),
  ])('uniformly rejects URL, path and malformed reference inputs', async (ref) => {
    const { result, res } = response();
    await expect(service.proxyUploadedFile(ref, '', res as any, 101)).rejects.toBeInstanceOf(NotFoundException);
    expect(result.body).toBeNull();
  });
});
