import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
export class DecisionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}
