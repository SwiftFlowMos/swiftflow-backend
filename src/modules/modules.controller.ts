import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModulesService } from './modules.service';

@ApiTags('Modules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('modules')
export class ModulesController {
  constructor(private modulesService: ModulesService) {}

  @Get()
  getModules() {
    return this.modulesService.getModules();
  }

  @Get('accessibles')
  getAccessibles(@Query('roleCode') roleCode: string) {
    return this.modulesService.getModulesAccessibles(roleCode);
  }

  @Get(':moduleCode/types')
  getTypes(@Param('moduleCode') moduleCode: string) {
    return this.modulesService.getTypesByModule(moduleCode);
  }

  @Get('evenements')
  getEvenements(
    @Query('moduleCode') moduleCode?: string,
    @Query('typeCode') typeCode?: string,
  ) {
    return this.modulesService.getEvenements(moduleCode, typeCode);
  }

  @Get('circuits')
  getCircuits(@Query('moduleCode') moduleCode?: string) {
    return this.modulesService.getCircuits(moduleCode);
  }

  @Post('circuits')
  createCircuit(@Body() data: any) {
    return this.modulesService.createCircuit(data);
  }

  @Patch('evenements/:id/circuit')
  linkCircuit(@Param('id') id: string, @Body() data: any) {
    return this.modulesService.linkCircuitToEvenement(id, data.circuitId);
  }

  @Get('habilitations')
  getHabilitations(
    @Query('roleCode') roleCode?: string,
    @Query('moduleCode') moduleCode?: string,
  ) {
    return this.modulesService.getHabilitationsEvenements(roleCode, moduleCode);
  }

  @Post('habilitations')
  createHabilitation(@Body() data: any) {
    return this.modulesService.createHabilitationEvenement(data);
  }

  @Patch('habilitations/:id')
  updateHabilitation(@Param('id') id: string, @Body() data: any) {
    return this.modulesService.updateHabilitationEvenement(id, data);
  }
}
