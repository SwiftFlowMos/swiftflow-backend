import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { WorkflowService } from '../workflow/workflow.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, WorkflowService, PrismaService],
})
export class PaymentsModule {}
