import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private prisma: PrismaService) {}

  // Vérifie toutes les 15 minutes les ordres en timeout
  @Cron(CronExpression.EVERY_10_MINUTES)
  async checkTimeouts() {
    this.logger.log('Vérification des timeouts workflow...');

    try {
      // Récupérer les étapes MANUEL actives avec timeout configuré
      const steps = await this.prisma.$queryRawUnsafe(`
        SELECT * FROM workflow_steps 
        WHERE type = 'MANUEL' 
        AND "isActive" = true 
        AND "timeoutHeures" IS NOT NULL
        AND "timeoutHeures" > 0
      `) as any[];

      for (const step of steps) {
        // Statut attendu pour cette étape
        const roleCode = step.role?.toUpperCase().replace(/ /g, '_') || 'VALIDATION';
        const pendingStatus = `PENDING_${roleCode}`;

        // Trouver les ordres en attente depuis trop longtemps
        const timeoutDate = new Date();
        timeoutDate.setHours(timeoutDate.getHours() - step.timeoutHeures);

        const orders = await this.prisma.$queryRawUnsafe(`
          SELECT p.id, p.status, p."updatedAt"
          FROM payments p
          WHERE p.status = $1
          AND p."updatedAt" < $2
        `, pendingStatus, timeoutDate) as any[];

        for (const order of orders) {
          await this.handleTimeout(order.id, step);
        }
      }
    } catch(e) {
      this.logger.error('Erreur vérification timeouts:', e.message);
    }
  }

  private async handleTimeout(paymentId: string, step: any) {
    const action = step.timeoutAction || 'ESCALADE';
    this.logger.log(`Timeout sur ordre ${paymentId} → action ${action}`);

    try {
      if (action === 'ESCALADE') {
        // Récupérer le rôle supérieur
        const roleCode = step.role?.toUpperCase().replace(/ /g, '_') || 'VALIDATION';
        const roles = await this.prisma.$queryRawUnsafe(`
          SELECT "roleSuperieurCode" FROM roles WHERE code = $1
        `, roleCode) as any[];

        const roleSuperieur = roles.length > 0 && roles[0].roleSuperieurCode
          ? roles[0].roleSuperieurCode
          : roleCode;

        const newStatus = `PENDING_${roleSuperieur}`;

        await this.prisma.$executeRawUnsafe(`
          UPDATE payments SET status = $1, "updatedAt" = NOW() WHERE id = $2::uuid
        `, newStatus, paymentId);

        await this.prisma.$executeRawUnsafe(`
          INSERT INTO audit_logs ("paymentId", "actorId", "actorName", action, result, comment, "previousStatus", "newStatus", "createdAt")
          VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, NOW())
        `,
          paymentId,
          '00000000-0000-0000-0000-000000000000',
          'Systeme Scheduler',
          'TIMEOUT_ESCALADE',
          'ALERTE',
          `Timeout de ${step.timeoutHeures}h dépassé — escalade automatique vers ${roleSuperieur}`,
          `PENDING_${roleCode}`,
          newStatus
        );

        this.logger.log(`Ordre ${paymentId} escaladé vers ${roleSuperieur}`);

      } else if (action === 'BLOCK') {
        await this.prisma.$executeRawUnsafe(`
          UPDATE payments SET status = 'BLOCKED', "updatedAt" = NOW() WHERE id = $1::uuid
        `, paymentId);

        this.logger.log(`Ordre ${paymentId} bloqué suite timeout`);

      } else if (action === 'ALERTE') {
        // Juste logger l'alerte sans changer le statut
        await this.prisma.$executeRawUnsafe(`
          INSERT INTO audit_logs ("paymentId", "actorId", "actorName", action, result, comment, "previousStatus", "newStatus", "createdAt")
          VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, NOW())
        `,
          paymentId,
          '00000000-0000-0000-0000-000000000000',
          'Systeme Scheduler',
          'TIMEOUT_ALERTE',
          'ALERTE',
          `Timeout de ${step.timeoutHeures}h dépassé — alerte générée`,
          `PENDING_${step.role}`,
          `PENDING_${step.role}`
        );
      }
    } catch(e) {
      this.logger.error(`Erreur traitement timeout ordre ${paymentId}:`, e.message);
    }
  }
}
