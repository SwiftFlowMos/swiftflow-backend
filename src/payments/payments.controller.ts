import { Controller, Get, Post, Patch, Param, Body, Request, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { DecisionDto } from './dto/decision.dto';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un ordre de paiement' })
  create(@Body() dto: CreatePaymentDto, @Request() req) {
    return this.paymentsService.create(dto, req.user.id);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Soumettre un ordre au workflow de validation' })
  submit(@Param('id') id: string, @Request() req) {
    return this.paymentsService.submit(id, req.user.id);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approuver l\'étape courante' })
  approve(@Param('id') id: string, @Body() dto: DecisionDto, @Request() req) {
    return this.paymentsService.decide(id, 'APPROVE', dto.comment, req.user);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Rejeter l\'ordre' })
  reject(@Param('id') id: string, @Body() dto: DecisionDto, @Request() req) {
    return this.paymentsService.decide(id, 'REJECT', dto.comment, req.user);
  }

  @Post(':id/return')
  @ApiOperation({ summary: 'Retourner l\'ordre au saisisseur' })
  return(@Param('id') id: string, @Body() dto: DecisionDto, @Request() req) {
    return this.paymentsService.decide(id, 'RETURN', dto.comment, req.user);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les ordres (filtrés par rôle)' })
  findAll(@Request() req, @Query('status') status?: string) {
    return this.paymentsService.findAll(req.user, status);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Ordres en attente pour le valideur connecté' })
  pending(@Request() req) {
    return this.paymentsService.findPending(req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'un ordre avec historique' })
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  @Get(':id/audit')
  @ApiOperation({ summary: 'Piste d\'audit complète' })
  audit(@Param('id') id: string) {
    return this.paymentsService.getAuditLog(id);
  }
}
