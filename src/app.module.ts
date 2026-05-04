import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { PaymentsModule } from './payments/payments.module';
import { UsersModule } from './users/users.module';
import { WorkflowModule } from './workflow/workflow.module';
import { ReferentielsModule } from './referentiels/referentiels.module';
import { BankConfigModule } from './bank-config/bank-config.module';
import { PrismaService } from './prisma.service';
import { HealthController } from './health.controller';

@Module({
  imports: [
    AuthModule,
    PaymentsModule,
    UsersModule,
    WorkflowModule,
    ReferentielsModule,
    BankConfigModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
