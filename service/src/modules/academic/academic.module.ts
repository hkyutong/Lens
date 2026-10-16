import { AttachmentModule } from '../attachment/attachment.module';
import { Module } from '@nestjs/common';
import { GlobalConfigModule } from '../globalConfig/globalConfig.module';
import { AcademicController } from './academic.controller';
import { AcademicService } from './academic.service';

@Module({
  imports: [AttachmentModule, GlobalConfigModule],
  controllers: [AcademicController],
  providers: [AcademicService],
})
export class AcademicModule {}
