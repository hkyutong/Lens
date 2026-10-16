import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { constants, promises as fs } from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { AttachmentEntity } from './attachment.entity';

export const ATTACHMENT_STORAGE_ROOT = Symbol('ATTACHMENT_STORAGE_ROOT');
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const ATTACHMENT_REF = new RegExp(`^attachment:(${UUID_PATTERN})$`, 'i');
const STORAGE_KEY = new RegExp(`^${UUID_PATTERN}\\.bin$`, 'i');

export interface PrivateAttachmentMetadata {
  filename?: string;
  contentType?: string;
}

export interface OwnedAttachment {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

@Injectable()
export class AttachmentService {
  constructor(
    @InjectRepository(AttachmentEntity)
    private readonly attachmentRepository: Repository<AttachmentEntity>,
    @Inject(ATTACHMENT_STORAGE_ROOT)
    private readonly storageRoot: string,
  ) {}

  async storePrivateAttachment(
    buffer: Buffer,
    metadata: PrivateAttachmentMetadata,
    ownerId: number,
  ): Promise<string> {
    this.assertOwner(ownerId);
    if (!Buffer.isBuffer(buffer)) throw new NotFoundException();
    const id = randomUUID();
    const storageKey = `${id}.bin`;
    let filePath: string;
    let created = false;
    try {
      const root = await this.prepareRoot();
      filePath = path.join(root, storageKey);
      const handle = await fs.open(filePath, 'wx', 0o600);
      created = true;
      try {
        await handle.writeFile(buffer);
      } finally {
        await handle.close();
      }
      await this.attachmentRepository.save(this.attachmentRepository.create({
        id,
        ownerId,
        storageKey,
        filename: this.normalizeFilename(metadata?.filename),
        contentType: this.normalizeContentType(metadata?.contentType),
        byteSize: buffer.length,
      }));
      return `attachment:${id}`;
    } catch {
      if (created) {
        try {
          await fs.unlink(filePath);
        } catch {
          throw new HttpException('Unable to save attachment', HttpStatus.INTERNAL_SERVER_ERROR);
        }
      }
      throw new HttpException('Unable to save attachment', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async readOwnedAttachment(ref: string, ownerId: number): Promise<OwnedAttachment> {
    this.assertOwner(ownerId);
    const match = typeof ref === 'string' ? ATTACHMENT_REF.exec(ref) : null;
    if (!match) throw new NotFoundException();
    try {
      const record = await this.attachmentRepository.findOne({ where: { id: match[1].toLowerCase(), ownerId } });
      if (!record || record.ownerId !== ownerId || record.id !== match[1].toLowerCase()
        || !STORAGE_KEY.test(record.storageKey) || record.storageKey !== `${record.id}.bin`) {
        throw new NotFoundException();
      }
      const root = await this.prepareRoot();
      const filePath = path.join(root, record.storageKey);
      const resolved = await fs.realpath(filePath);
      if (path.dirname(resolved) !== root || resolved !== filePath) throw new NotFoundException();
      const handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.nlink !== 1 || stat.size !== record.byteSize) throw new NotFoundException();
        const buffer = await handle.readFile();
        if (buffer.length !== record.byteSize) throw new NotFoundException();
        return {
          buffer,
          filename: this.normalizeFilename(record.filename),
          contentType: this.normalizeContentType(record.contentType),
        };
      } finally {
        await handle.close();
      }
    } catch {
      throw new NotFoundException();
    }
  }

  private assertOwner(ownerId: number): void {
    if (!Number.isSafeInteger(ownerId) || ownerId <= 0) throw new NotFoundException();
  }

  private async prepareRoot(): Promise<string> {
    const root = path.resolve(this.storageRoot);
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    if ((await fs.lstat(root)).isSymbolicLink() || await fs.realpath(root) !== root) {
      throw new NotFoundException();
    }
    return root;
  }

  private normalizeFilename(value?: string): string {
    const name = String(value || 'attachment').split(/[\\/]/).pop()
      ?.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 180);
    return name && name !== '.' && name !== '..' ? name : 'attachment';
  }

  private normalizeContentType(value?: string): string {
    const normalized = String(value || '').toLowerCase();
    return normalized.length <= 100 && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(normalized)
      ? normalized : 'application/octet-stream';
  }
}
