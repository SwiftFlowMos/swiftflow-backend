import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async login(login: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { login } });
    if (!user || !user.isActive) throw new UnauthorizedException('Identifiant ou mot de passe incorrect');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Identifiant ou mot de passe incorrect');

    const payload = { sub: user.id, login: user.login, role: user.role, nom: user.nom };
    const token = this.jwt.sign(payload);

    return {
      token,
      user: { id:user.id, login:user.login, nom:user.nom, role:user.role, email:user.email },
    };
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }
}
