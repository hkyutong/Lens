import { Get, Param, BadRequestException, Body, Controller, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { AdminAuthGuard } from '@/common/auth/adminAuth.guard';
import { PublicAssetPurpose } from '../attachment/publicAsset.service';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';

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
    if (!file) {
      throw new BadRequestException('File is required');
    }

    return this.uploadService.uploadFile(file, dir, req.user);
  }

  @Post('file/download')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async downloadUploadedFile(
    @Body('source') source: string,
    @Body('name') name: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.uploadService.proxyUploadedFile(source, name, res, Number(req.user.id));
  }

  // @Post('fileFromUrl')
  // @ApiOperation({ summary: '从URL上传文件' })
  // async uploadFileFromUrl(@Body() { url, dir = 'ai' }): Promise<any> {
  //   return this.uploadService.uploadFileFromUrl({ url, dir });
  // }

  @Get('attachment/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async downloadAttachment(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    return this.uploadService.proxyUploadedFile('attachment:' + id, '', res, Number(req.user.id));
  }

  @Post('public-asset')
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadPublicAsset(@UploadedFile() file: any, @Query('purpose') purpose: PublicAssetPurpose, @Req() req: Request) {
    return this.uploadService.uploadPublicAsset(file, purpose, req.user);
  }

  @Post('avatar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadAvatar(@UploadedFile() file: any, @Req() req: Request) {
    return this.uploadService.uploadAvatar(file, req.user);
  }
}
