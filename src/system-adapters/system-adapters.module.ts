import { Module } from '@nestjs/common';
import { SystemAdaptersController } from './system-adapters.controller';
import { SystemAdaptersService } from './system-adapters.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [SystemAdaptersController],
  providers: [SystemAdaptersService, PrismaService],
  exports: [SystemAdaptersService],
})
export class SystemAdaptersModule {}
