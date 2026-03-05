import { AdminAuthGuard } from '@/common/auth/adminAuth.guard';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { QueryModelDto } from './dto/queryModel.dto';
import { QueryModelTypeDto } from './dto/queryModelType.dto';
import { SetModelDto } from './dto/setModel.dto';
import { SetModelTypeDto } from './dto/setModelType.dto';
import { ModelsService } from './models.service';

@ApiTags('models')
@Controller('models')
export class ModelsController {
  constructor(
    private readonly modelsService: ModelsService,
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  private applyNetworkSearchAvailability(data: any) {
    if (this.globalConfigService.isNetworkSearchEnabled()) return data;
    if (!data) return data;

    if (data?.modelInfo) {
      data.modelInfo.isNetworkSearch = false;
      return data;
    }

    if (data?.modelMaps) {
      Object.values(data.modelMaps).forEach((models: any) => {
        if (Array.isArray(models)) {
          models.forEach(model => {
            model.isNetworkSearch = false;
          });
        }
      });
    }

    return data;
  }

  @Post('setModel')
  @ApiOperation({ summary: '设置模型' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  setModel(@Body() params: SetModelDto) {
    return this.modelsService.setModel(params);
  }

  @Post('delModel')
  @ApiOperation({ summary: '删除模型' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  delModel(@Body() params: { id: number }) {
    return this.modelsService.delModel(params);
  }

  @Get('query')
  @ApiOperation({ summary: '管理端查询模型列表' })
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  queryModels(@Req() req: Request, @Query() params: QueryModelDto) {
    return this.modelsService.queryModels(req, params);
  }

  @Get('list')
  @ApiOperation({ summary: '客户端查询当前所有可以使用的模型' })
  async modelsList() {
    const data = await this.modelsService.modelsList();
    return this.applyNetworkSearchAvailability(data);
  }

  @Get('baseConfig')
  @ApiOperation({ summary: '客户端查询当前已经配置模型的基础配置' })
  async baseConfig() {
    const data = await this.modelsService.getBaseConfig();
    return this.applyNetworkSearchAvailability(data);
  }

  @Get('queryModelType')
  @ApiOperation({ summary: '查询模型类型' })
  queryModelType(@Query() params: QueryModelTypeDto) {
    return this.modelsService.queryModelType(params);
  }

  @Post('setModelType')
  @ApiOperation({ summary: '创建修改模型类型' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  setModelType(@Body() params: SetModelTypeDto) {
    return this.modelsService.setModelType(params);
  }

  @Post('delModelType')
  @ApiOperation({ summary: '删除模型类型' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  delModelType(@Body() params: { id: number }) {
    return this.modelsService.delModelType(params);
  }
}
