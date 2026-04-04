import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import type { Request, Response } from 'express';
import { AcademicService } from './academic.service';

@ApiTags('academic')
@Controller('academic')
export class AcademicController {
  constructor(private readonly academicService: AcademicService) {}

  @Post('chat-process')
  @ApiOperation({ summary: 'Academic chat process' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  academicChatProcess(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    return this.academicService.academicChatProcess(body, req, res);
  }

  @Post('workflow-process')
  @ApiOperation({ summary: 'Academic workflow process' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  academicWorkflowProcess(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    return this.academicService.academicWorkflowProcess(body, req, res);
  }

  @Post('core-function-list')
  @ApiOperation({ summary: 'Academic core function list' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  coreFunctionList(@Req() req: Request) {
    return this.academicService.coreFunctionList(req);
  }

  @Post('plugin-list')
  @ApiOperation({ summary: 'Academic plugin list' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  pluginList(@Req() req: Request) {
    return this.academicService.pluginList(req);
  }

  @Get('file')
  @ApiOperation({ summary: 'Academic file proxy' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  academicFile(@Query('path') path: string, @Res() res: Response) {
    return this.academicService.proxyFile(path, res);
  }
}
