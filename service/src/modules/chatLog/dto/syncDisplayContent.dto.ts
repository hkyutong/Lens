import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional } from 'class-validator';

export class SyncDisplayContentDto {
  @ApiProperty({ example: 123, description: '聊天记录ID' })
  @IsNotEmpty({ message: '聊天记录ID不能为空' })
  chatId: number;

  @ApiProperty({ example: '修正后的展示内容', description: '前端最终展示内容' })
  @IsNotEmpty({ message: '展示内容不能为空' })
  content: string;

  @ApiProperty({ example: '推理内容', description: '前端最终展示推理内容', required: false })
  @IsOptional()
  reasoningText?: string;
}
