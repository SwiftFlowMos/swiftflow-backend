import { Module } from '@nestjs/common';
import { BankConfigController } from './bank-config.controller';
import { BankConfigService } from './bank-config.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [BankConfigController],
  providers: [BankConfigService, PrismaService],
})
export class BankConfigModule {}
