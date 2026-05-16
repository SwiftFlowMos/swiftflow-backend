import { Module } from '@nestjs/common';
import { ModulesController } from './modules.controller';
import { ModulesService } from './modules.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [ModulesController],
  providers: [ModulesService, PrismaService],
  exports: [ModulesService],
})
export class ModulesModule {}
