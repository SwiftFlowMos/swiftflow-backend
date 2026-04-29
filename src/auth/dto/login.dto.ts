import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class LoginDto {
  @ApiProperty({ example: 'k.benali' })
  @IsString() login: string;
  @ApiProperty({ example: 'Test@1234' })
  @IsString() password: string;
}
