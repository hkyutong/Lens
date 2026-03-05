import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, MaxLength, MinLength, Matches } from 'class-validator';

export class UpdateUserDto {
  @ApiProperty({
    example: 'user1',
    nullable: true,
    description: '用户ID',
    required: false,
  })
  @MinLength(2, { message: 'ID最低需要大于2位数！' })
  @MaxLength(12, { message: 'ID不得超过12位！' })
  @Matches(/^[a-z0-9]+$/, { message: 'ID只能由小写字母或数字组成！' })
  @IsNotEmpty({ message: 'ID不能为空！' })
  @IsOptional()
  username?: string;

  @ApiProperty({ example: '', description: '用户头像', required: false })
  @IsNotEmpty({ message: '用户头像不能为空！' })
  @IsOptional()
  avatar?: string;
}
