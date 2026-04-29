import { IsString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePaymentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() agenceCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clientRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clientNom?: string;
  @ApiPropertyOptional() @IsOptional() clientAdresse?: any;
  @ApiPropertyOptional() @IsOptional() @IsString() compteNum?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() compteDevise?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() plafond?: number;

  @ApiProperty() @IsNumber() amount: number;
  @ApiProperty() @IsString() currency: string;
  @ApiPropertyOptional() @IsOptional() @IsString() valueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() typeCours?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() coursChange?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() motif?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() codeMotif?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() categorie?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() typeTransfert?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() domRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() domBanque?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() domDate?: string;

  @ApiProperty() @IsString() beneName: string;
  @ApiPropertyOptional() @IsOptional() beneAdresse?: any;
  @ApiPropertyOptional() @IsOptional() @IsString() beneCountry?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() beneIBAN?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() beneBIC?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() beneBankName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() correspondentBIC?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() incoterm?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceClient?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() charges?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() details?: string;
}
