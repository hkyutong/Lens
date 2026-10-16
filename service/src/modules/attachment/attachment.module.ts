import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as path from 'path';
import { AttachmentEntity } from './attachment.entity';
import { AttachmentService, ATTACHMENT_STORAGE_ROOT } from './attachment.service';
import { PublicAssetService, PUBLIC_ASSET_STORAGE_ROOT } from './publicAsset.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AttachmentEntity])],
  providers: [
    AttachmentService,
    PublicAssetService,
    { provide: ATTACHMENT_STORAGE_ROOT, useFactory: () => path.resolve(process.cwd(), 'private', 'attachments') },
    { provide: PUBLIC_ASSET_STORAGE_ROOT, useFactory: () => path.resolve(process.cwd(), 'public', 'public-assets') },
  ],
  exports: [AttachmentService, PublicAssetService],
})
export class AttachmentModule {}
