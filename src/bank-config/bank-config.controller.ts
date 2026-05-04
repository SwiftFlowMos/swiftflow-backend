import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BankConfigService } from './bank-config.service';

@ApiTags('Bank Config')
@Controller('bank-config')
export class BankConfigController {
  constructor(private bankConfigService: BankConfigService) {}

  @Get()
  get() {
    return this.bankConfigService.get();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Put()
  update(@Body() data: any) {
    return this.bankConfigService.update(data);
  }
}
