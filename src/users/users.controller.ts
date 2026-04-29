import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @Get('me')
  me(@Request() req) { return req.user; }

  @Get()
  findAll() {
    return this.prisma.user.findMany({
      select: { id:true, login:true, nom:true, role:true, email:true, isActive:true },
      where: { isActive: true },
    });
  }
}
