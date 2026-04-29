import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma.service';

@ApiTags('Referentiels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('referentiels')
export class ReferentielsController {
  constructor(private prisma: PrismaService) {}

  @Get('clients')
  getClients(@Query('search') search?: string) {
    return this.prisma.refClient.findMany({
      where: {
        isActive: true,
        ...(search ? { nom: { contains: search, mode: 'insensitive' } } : {}),
      },
      include: { comptes: true },
    });
  }

  @Get('comptes')
  getComptes(@Query('clientRef') clientRef?: string, @Query('agence') agence?: string) {
    return this.prisma.refCompte.findMany({
      where: {
        isActive: true,
        ...(clientRef ? { clientRef } : {}),
        ...(agence ? { agence } : {}),
      },
    });
  }
}
