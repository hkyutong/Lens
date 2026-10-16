import { AttachmentModule } from '../attachment/attachment.module';
import { UserBalanceModule } from '../userBalance/userBalance.module';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisCacheModule } from '../redisCache/redisCache.module';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Global()
@Module({
  imports: [RedisCacheModule, TypeOrmModule.forFeature([UserBalanceEntity]), UserBalanceModule, AttachmentModule],
  providers: [UploadService],
  controllers: [UploadController],
  exports: [UploadService],
})
export class UploadModule {}
