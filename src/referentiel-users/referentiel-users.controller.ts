import { Controller, Get, Post, Put, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReferentielUsersService } from './referentiel-users.service';

@ApiTags('Referentiel Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('referentiel-users')
export class ReferentielUsersController {
  constructor(private service: ReferentielUsersService) {}

  // ── RÔLES ──
  @Get('roles')
  getRoles() { return this.service.getRoles(); }

  @Post('roles')
  createRole(@Body() data: any) { return this.service.createRole(data); }

  @Patch('roles/:code')
  updateRole(@Param('code') code: string, @Body() data: any) {
    return this.service.updateRole(code, data);
  }

  // ── HABILITATIONS ──
  @Get('habilitations')
  getHabilitations(@Query('roleCode') roleCode?: string) {
    return this.service.getHabilitations(roleCode);
  }

  @Patch('habilitations/:id')
  updateHabilitation(@Param('id') id: string, @Body() data: any) {
    return this.service.updateHabilitation(id, data.autorise, data.montantMax);
  }

  // ── UTILISATEURS ──
  @Get('users')
  getUsers() { return this.service.getUsers(); }

  @Patch('users/:id')
  updateUser(@Param('id') id: string, @Body() data: any) {
    return this.service.updateUser(id, data);
  }

  // ── DÉLÉGATIONS ──
  @Get('delegations')
  getDelegations(@Query('userId') userId?: string) {
    return this.service.getDelegations(userId);
  }

  @Post('delegations')
  createDelegation(@Body() data: any) {
    return this.service.createDelegation(data);
  }

  @Patch('delegations/:id/revoquer')
  revokeDelegation(@Param('id') id: string) {
    return this.service.revokeDelegation(id);
  }

  // ── HABILITATIONS FORÇAGE ──
  @Get('force-habilitations')
  getForceHabilitations() { return this.service.getForceHabilitations(); }

  @Patch('force-habilitations/:id')
  updateForceHabilitation(@Param('id') id: string, @Body() data: any) {
    return this.service.updateForceHabilitation(id, data);
  }
}
