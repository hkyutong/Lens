import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';

declare const describe: any, beforeEach: any, afterEach: any, it: any, expect: any;

describe('private attachment boundary', () => {
  let service: any;
  let root: string;
  let records: Map<string, any>;
  let failSave: boolean;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(await fs.realpath(tmpdir()), 'lens-attachment-spec-'));
    records = new Map();
    failSave = false;
    const repository = {
      create: (value: any) => value,
      save: async (value: any) => {
        if (failSave) throw new Error('synthetic metadata failure');
        records.set(value.id, { ...value });
        return value;
      },
      findOne: async ({ where }: any) => {
        const row = records.get(where.id);
        return row && row.ownerId === where.ownerId ? { ...row } : null;
      },
    };
    const { AttachmentService } = require('./attachment.service');
    service = new AttachmentService(repository, root);
  });

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it('returns an opaque reference and reads bytes only for its owner', async () => {
    const ref = await service.storePrivateAttachment(
      Buffer.from('synthetic research text'),
      { filename: 'study.tex', contentType: 'text/plain' },
      101,
    );
    expect(ref).toMatch(/^attachment:[0-9a-f-]{36}$/);
    expect(ref).not.toContain('study');
    const result = await service.readOwnedAttachment(ref, 101);
    expect(result.buffer.toString()).toBe('synthetic research text');
    expect(result.filename).toBe('study.tex');
    expect(result.contentType).toBe('text/plain');
    await expect(service.readOwnedAttachment(ref, 202)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    '',
    '/file/synthetic.txt',
    '../synthetic.txt',
    'https://example.invalid/synthetic.txt',
    `attachment:${randomUUID()}/../other`,
    `attachment:${randomUUID()}?owner=101`,
    randomUUID(),
  ])('rejects malformed references with the same missing-resource result', async (ref) => {
    await expect(service.readOwnedAttachment(ref, 101)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects missing references and missing authenticated owners', async () => {
    await expect(service.readOwnedAttachment(`attachment:${randomUUID()}`, 101)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.storePrivateAttachment(Buffer.from('x'), { filename: 'a.txt' }, 0)).rejects.toBeInstanceOf(NotFoundException);
    expect(records.size).toBe(0);
    expect(await fs.readdir(root)).toEqual([]);
  });

  it('removes the newly written file when metadata cannot be persisted', async () => {
    failSave = true;
    await expect(service.storePrivateAttachment(Buffer.from('x'), { filename: 'a.txt' }, 101)).rejects.toThrow();
    expect(records.size).toBe(0);
    expect(await fs.readdir(root)).toEqual([]);
  });

  it('does not interpret a persisted storage key as a path', async () => {
    const id = randomUUID();
    records.set(id, { id, ownerId: 101, storageKey: '../outside.txt', filename: 'a.txt', contentType: 'text/plain' });
    await expect(service.readOwnedAttachment(`attachment:${id}`, 101)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a file replaced by an outside symlink', async () => {
    const ref = await service.storePrivateAttachment(Buffer.from('private'), { filename: 'a.txt' }, 101);
    const stored = records.get(ref.slice('attachment:'.length));
    const outside = path.join(root, 'outside-synthetic.txt');
    await fs.writeFile(outside, 'outside');
    const storedPath = path.join(root, stored.storageKey);
    await fs.unlink(storedPath);
    await fs.symlink(outside, storedPath);
    await expect(service.readOwnedAttachment(ref, 101)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a stored file truncated after its metadata was committed', async () => {
    const ref = await service.storePrivateAttachment(Buffer.from('complete synthetic text'), { filename: 'a.txt' }, 101);
    const stored = records.get(ref.slice('attachment:'.length));
    await fs.writeFile(path.join(root, stored.storageKey), 'partial');
    await expect(service.readOwnedAttachment(ref, 101)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('normalizes display metadata without allowing it to choose storage', async () => {
    const ref = await service.storePrivateAttachment(Buffer.from('x'), { filename: '../../a\n.tex', contentType: 'bad\r\nheader' }, 101);
    const result = await service.readOwnedAttachment(ref, 101);
    expect(result.filename).toBe('a.tex');
    expect(result.contentType).toBe('application/octet-stream');
    expect((await fs.readdir(root)).length).toBe(1);
  });
});
