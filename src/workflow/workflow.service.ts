import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class WorkflowService {
  constructor(private prisma: PrismaService) {}

  async getActiveSteps(amount?: number) {
    const steps = await this.prisma.workflowStep.findMany({
      where: { isActive: true },
      orderBy: { ordre: 'asc' },
    });

    if (!amount) return steps;

    return steps.filter(step => {
      if (step.condAlways) return true;
      if (step.condAmountMin > 0 && amount < step.condAmountMin) return false;
      if (step.condAmountMax > 0 && amount > step.condAmountMax) return false;
      return true;
    });
  }

  async getAllSteps() {
    return this.prisma.workflowStep.findMany({ orderBy: { ordre: 'asc' } });
  }

  async updateStep(id: string, data: any) {
    return this.prisma.workflowStep.update({ where: { id }, data });
  }
}
