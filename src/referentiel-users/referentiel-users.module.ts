import { Module } from '@nestjs/common';
import { ReferentielUsersController } from './referentiel-users.controller';
import { ReferentielUsersService } from './referentiel-users.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [ReferentielUsersController],
  providers: [ReferentielUsersService, PrismaService],
  exports: [ReferentielUsersService],
})
export class ReferentielUsersModule {}
