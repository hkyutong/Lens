import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import {
  Body,
  Controller,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { UploadService } from './upload.service';

@ApiTags('upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('file')
  @ApiOperation({ summary: '上传文件' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 30 * 1024 * 1024, // 30MB大小限制（高级用户文档上限）
      },
    }),
  )
  async uploadFile(@UploadedFile() file, @Req() req: Request, @Query('dir') dir?: string) {
    return this.uploadService.uploadFile(file, dir, req.user);
  }

  @Post('file/download')
  @ApiOperation({ summary: '下载已上传文件（代理）' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async downloadUploadedFile(
    @Body('source') source: string,
    @Body('name') name: string,
    @Res() res: Response,
  ) {
    return this.uploadService.proxyUploadedFile(source, name, res);
  }

  // @Post('fileFromUrl')
  // @ApiOperation({ summary: '从URL上传文件' })
  // async uploadFileFromUrl(@Body() { url, dir = 'ai' }): Promise<any> {
  //   return this.uploadService.uploadFileFromUrl({ url, dir });
  // }
}
