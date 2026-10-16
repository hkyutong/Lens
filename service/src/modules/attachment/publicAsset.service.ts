import { BadRequestException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

export const PUBLIC_ASSET_STORAGE_ROOT = Symbol('PUBLIC_ASSET_STORAGE_ROOT');
export const PUBLIC_ASSET_PURPOSES = [
  'logo', 'favicon', 'robot-avatar', 'default-avatar', 'model-avatar',
  'app-cover', 'app-background', 'package-cover', 'notice-image',
  'agreement-image', 'classification-image',
] as const;
export type PublicAssetPurpose = typeof PUBLIC_ASSET_PURPOSES[number];

@Injectable()
export class PublicAssetService {
  constructor(@Inject(PUBLIC_ASSET_STORAGE_ROOT) private readonly storageRoot: string) {}

  async storePublicAsset(buffer: Buffer, purpose: PublicAssetPurpose | 'avatar'): Promise<string> {
    if (![...PUBLIC_ASSET_PURPOSES, 'avatar'].includes(purpose)) throw new BadRequestException('Unsupported image upload');
    const extension = this.getRasterExtension(buffer);
    const root = path.resolve(this.storageRoot);
    const directory = path.join(root, purpose);
    let filePath: string;
    let created = false;
    try {
      await fs.mkdir(directory, { recursive: true, mode: 0o755 });
      if (await fs.realpath(root) !== root || await fs.realpath(directory) !== directory
        || (await fs.lstat(directory)).isSymbolicLink()) throw new Error();
      const filename = `${randomUUID()}.${extension}`;
      filePath = path.join(directory, filename);
      const handle = await fs.open(filePath, 'wx', 0o644);
      created = true;
      try {
        await handle.writeFile(buffer);
      } finally {
        await handle.close();
      }
      return `/public-assets/${purpose}/${filename}`;
    } catch {
      if (created) {
        try {
          await fs.unlink(filePath);
        } catch {
          throw new HttpException('Unable to save image', HttpStatus.INTERNAL_SERVER_ERROR);
        }
      }
      throw new HttpException('Unable to save image', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private getRasterExtension(buffer: Buffer): 'png' | 'jpg' | 'gif' | 'webp' {
    if (!Buffer.isBuffer(buffer)) throw new BadRequestException('Invalid image');
    if (buffer.length >= 33 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      && buffer.toString('ascii', 12, 16) === 'IHDR'
      && buffer.readUInt32BE(16) > 0 && buffer.readUInt32BE(20) > 0) return 'png';
    if (buffer.length >= 6 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
      && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9) return 'jpg';
    if (buffer.length >= 14 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))
      && buffer.readUInt16LE(6) > 0 && buffer.readUInt16LE(8) > 0 && buffer[buffer.length - 1] === 0x3b) return 'gif';
    if (buffer.length >= 20 && buffer.toString('ascii', 0, 4) === 'RIFF'
      && buffer.readUInt32LE(4) === buffer.length - 8 && buffer.toString('ascii', 8, 12) === 'WEBP'
      && ['VP8 ', 'VP8L', 'VP8X'].includes(buffer.toString('ascii', 12, 16))) return 'webp';
    throw new BadRequestException('Invalid image');
  }
}
