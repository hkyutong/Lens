import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ChatListDto {
  @ApiProperty({ example: 1, description: '对话分组ID', required: false })
  @IsOptional()
  @Type(() => Number)
  groupId: number;

  @ApiProperty({ example: 80, description: '每次加载的聊天记录条数', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  size?: number;

  @ApiProperty({ example: 1024, description: '加载此 chatId 之前的更早历史', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  beforeChatId?: number;
}
