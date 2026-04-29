import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [WorkflowController],
  providers: [WorkflowService, PrismaService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
