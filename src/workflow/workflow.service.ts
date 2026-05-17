import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class WorkflowService {
  constructor(private prisma: PrismaService) {}

  async getActiveSteps(amount?: number) {
    const steps = await this.prisma.$queryRaw`
      SELECT * FROM workflow_steps 
      WHERE "isActive" = true 
      ORDER BY ordre ASC
    ` as any[];

    if (!amount) return steps;

    return steps.filter(step => {
      if (step.condAlways) return true;
      if (step.condAmountMin > 0 && amount < step.condAmountMin) return false;
      if (step.condAmountMax > 0 && amount > step.condAmountMax) return false;
      return true;
    });
  }

async getStepsByCircuit(circuitId: string, amount?: number) {
  const steps = await this.prisma.$queryRawUnsafe(`
    SELECT * FROM workflow_steps 
    WHERE "circuitId" = $1::uuid
    ORDER BY ordre ASC
  `, circuitId) as any[];

  if (!amount) return steps;

  return steps.filter(step => {
    if (!step.isActive) return true; // Garder les étapes désactivées pour affichage
    if (step.condAlways) return true;
    if (step.condAmountMin > 0 && amount < step.condAmountMin) return false;
    if (step.condAmountMax > 0 && amount > step.condAmountMax) return false;
    return true;
  });
}

async getAllSteps() {
  return this.prisma.$queryRawUnsafe(`
    SELECT * FROM workflow_steps 
    WHERE "circuitId" IS NULL
    ORDER BY ordre ASC
  `);
}

async updateStep(id: string, data: any) {
  const updateData: any = {};
  
  if (data.nom !== undefined)            updateData.nom = data.nom;
  if (data.type !== undefined)           updateData.type = data.type;
  if (data.role !== undefined)           updateData.role = data.role || null;
  if (data.systemeTiers !== undefined)   updateData.systemeTiers = data.systemeTiers || null;
  if (data.timeoutHeures !== undefined)  updateData.timeoutHeures = data.timeoutHeures ? parseInt(data.timeoutHeures) : null;
  if (data.timeoutMs !== undefined)      updateData.timeoutMs = data.timeoutMs ? parseInt(data.timeoutMs) : 8000;
  if (data.retryMax !== undefined)       updateData.retryMax = data.retryMax ? parseInt(data.retryMax) : 1;
  if (data.timeoutAction !== undefined)  updateData.timeoutAction = data.timeoutAction || 'ALERTE';
  if (data.fallbackAction !== undefined) updateData.fallbackAction = data.fallbackAction || 'MANUAL';
  if (data.isActive !== undefined)       updateData.isActive = Boolean(data.isActive);
  if (data.condAlways !== undefined)     updateData.condAlways = Boolean(data.condAlways);
  if (data.condAmountMin !== undefined)  updateData.condAmountMin = parseFloat(data.condAmountMin) || 0;
  if (data.condAmountMax !== undefined)  updateData.condAmountMax = parseFloat(data.condAmountMax) || 0;
  if (data.condCurrencies !== undefined) updateData.condCurrencies = data.condCurrencies || [];
  if (data.routingPositif !== undefined) updateData.routingPositif = data.routingPositif;
  if (data.routingNegatif !== undefined) updateData.routingNegatif = data.routingNegatif;
  if (data.routingAlerte !== undefined)  updateData.routingAlerte = data.routingAlerte;
  if (data.ordre !== undefined)          updateData.ordre = parseInt(data.ordre) || 1;

  return this.prisma.workflowStep.update({
    where: { id },
    data: updateData,
  });
}
}
