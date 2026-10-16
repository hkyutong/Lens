import { NotFoundException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { AttachmentService } from '../attachment/attachment.service';
import { PublicAssetService } from '../attachment/publicAsset.service';
import { UploadService } from './upload.service';

declare const describe: any, beforeEach: any, afterEach: any, it: any, expect: any;

describe('upload privacy integration', () => {
  let service: any;
  let root: string;
  let attachments: AttachmentService;
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTzsAAAAASUVORK5CYII=', 'base64');
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(await fs.realpath(tmpdir()), 'lens-upload-private-spec-'));
    const rows = new Map();
    const repo = { create: (row: any) => row, save: async (row: any) => { rows.set(row.id, row); return row; }, findOne: async ({ where }: any) => {
      const row = rows.get(where.id); return row?.ownerId === where.ownerId ? row : null;
    } };
    attachments = new AttachmentService(repo as any, path.join(root, 'private'));
    service = Object.assign(Object.create(UploadService.prototype), {
      attachmentService: attachments,
      publicAssetService: new PublicAssetService(path.join(root, 'public')),
      globalConfigService: { getConfigs: async () => ({}) },
      resolveUploadUserPolicy: async (user: any) => {
        if (!user) throw new UnauthorizedException();
        return { id: user.id, exempt: true, legacyMember: true };
      },
      getUploadType: async () => ({ localStorageStatus: true }),
      uploadFileToLocal: async () => '/file/synthetic-public.txt',
    });
  });
  afterEach(async () => { if (root) await fs.rm(root, { recursive: true, force: true }); });
  const document = () => ({ buffer: Buffer.from('synthetic text'), size: 14, originalname: 'study.txt', mimetype: 'text/plain' });

  it('keeps generic uploads private even when the client requests an asset directory', async () => {
    const ref = await service.uploadFile(document(), 'logo', { id: 101, role: 'user' });
    expect(ref).toMatch(/^attachment:[0-9a-f-]{36}$/);
    expect((await attachments.readOwnedAttachment(ref, 101)).buffer.toString()).toBe('synthetic text');
    expect(await fs.readdir(root)).toEqual(['private']);
  });
  it('rejects upload calls without an authenticated owner before writing', async () => {
    await expect(service.uploadFile(document(), 'audio')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(await fs.readdir(root)).toEqual([]);
  });
  it('requires a trusted administrator for explicit public assets', async () => {
    await expect(service.uploadPublicAsset({ buffer: image }, 'logo', { id: 101, role: 'user' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(await fs.readdir(root)).toEqual([]);
    expect(await service.uploadPublicAsset({ buffer: image }, 'logo', { id: 303, role: 'admin' })).toMatch(/^\/public-assets\/logo\//);
  });
  it('allows an authenticated avatar only through the fixed avatar purpose', async () => {
    expect(await service.uploadAvatar({ buffer: image }, { id: 101, role: 'user' })).toMatch(/^\/public-assets\/avatar\//);
  });
  it('does not allow an attacker to download another owner attachment', async () => {
    const ref = await attachments.storePrivateAttachment(Buffer.from('private'), { filename: 'study.txt' }, 101);
    const response = { setHeader: () => {}, end: () => { throw new Error('unexpected response body'); } };
    await expect(service.proxyUploadedFile(ref, '', response, 202)).rejects.toBeInstanceOf(NotFoundException);
  });
});
