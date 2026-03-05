import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisCacheModule } from '../redisCache/redisCache.module';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Global()
@Module({
  imports: [RedisCacheModule, TypeOrmModule.forFeature([UserBalanceEntity])],
  providers: [UploadService],
  controllers: [UploadController],
  exports: [UploadService],
})
export class UploadModule {}
