import { ApiProperty } from '@nestjs/swagger';
import { MaxLength } from 'class-validator';

export class AddBadWordDto {
  @ApiProperty({ example: 'test', description: '敏感词', required: true })
  @MaxLength(20, { message: '敏感词长度不能超过20个字符' })
  word: string;
}
