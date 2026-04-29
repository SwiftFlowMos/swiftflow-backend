import { Module } from '@nestjs/common';
import { ReferentielsController } from './referentiels.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [ReferentielsController],
  providers: [PrismaService],
})
export class ReferentielsModule {}
