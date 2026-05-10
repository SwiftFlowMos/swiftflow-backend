import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SystemAdaptersService } from './system-adapters.service';

@ApiTags('System Adapters')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('system-adapters')
export class SystemAdaptersController {
  constructor(private systemAdaptersService: SystemAdaptersService) {}

  @Get()
  findAll() {
    return this.systemAdaptersService.findAll();
  }

  @Get(':code')
  findOne(@Param('code') code: string) {
    return this.systemAdaptersService.findOne(code);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.systemAdaptersService.update(id, data);
  }
}
