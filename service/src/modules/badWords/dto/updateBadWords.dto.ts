import { IsOptional } from 'class-validator';
import { MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateBadWordsDto {
  @ApiProperty({ example: 1, description: '敏感词id', required: true })
  @IsOptional()
  id: number;

  @ApiProperty({ example: 'test', description: '敏感词内容', required: false })
  @IsOptional()
  @MaxLength(20, { message: '敏感词长度不能超过20个字符' })
  word: string;

  @ApiProperty({ example: 1, description: '关键词状态', required: false })
  @IsOptional()
  status: number;
}
