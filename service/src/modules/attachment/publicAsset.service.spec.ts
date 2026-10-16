import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';

declare const describe: any, beforeEach: any, afterEach: any, it: any, expect: any;

const syntheticPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTzsAAAAASUVORK5CYII=', 'base64');

describe('explicit public raster assets', () => {
  let service: any;
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(await fs.realpath(tmpdir()), 'lens-public-spec-'));
    const { PublicAssetService } = require('./publicAsset.service');
    service = new PublicAssetService(root);
  });
  afterEach(async () => { if (root) await fs.rm(root, { recursive: true, force: true }); });

  it('uses verified raster bytes and a server-owned purpose for the public URL', async () => {
    const ref = await service.storePublicAsset(syntheticPng, 'logo');
    expect(ref).toMatch(/^\/public-assets\/logo\/[0-9a-f-]{36}\.png$/);
    expect(await fs.readFile(path.join(root, ref.slice('/public-assets/'.length)))).toEqual(syntheticPng);
  });

  it.each(['../file', 'chat', 'private', '', 'unknown'])('rejects an unapproved public purpose', async (purpose) => {
    await expect(service.storePublicAsset(syntheticPng, purpose)).rejects.toBeInstanceOf(BadRequestException);
    expect(await fs.readdir(root)).toEqual([]);
  });

  it.each([
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>synthetic</script></svg>'),
    Buffer.from('<html>synthetic</html>'),
    Buffer.from('not an image'),
    Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  ])('rejects active content and invalid raster bytes', async (buffer) => {
    await expect(service.storePublicAsset(buffer, 'logo')).rejects.toBeInstanceOf(BadRequestException);
    expect(await fs.readdir(root)).toEqual([]);
  });

  it('rejects a purpose directory replaced by a symlink', async () => {
    const outside = path.join(root, 'outside');
    await fs.mkdir(outside);
    await fs.symlink(outside, path.join(root, 'logo'));
    await expect(service.storePublicAsset(syntheticPng, 'logo')).rejects.toThrow();
    expect(await fs.readdir(outside)).toEqual([]);
  });
});
