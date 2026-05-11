import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { WorkflowService } from '../workflow/workflow.service';
import { SystemAdaptersService } from '../system-adapters/system-adapters.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

function genRef(prefix = 'TRF'): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${year}-${rand}`;
}

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private workflow: WorkflowService,
    private systemAdapters: SystemAdaptersService,
  ) {}

  // ── CRÉER UN ORDRE ──
  async create(dto: CreatePaymentDto, userId: string) {
    const reference = genRef(dto.categorie === 'COMMERCIAL' ? 'TRF' : 'TRF');

    const payment = await this.prisma.payment.create({
      data: {
        reference,
        status: 'DRAFT',
        // Donneur d'ordre
        agenceCode: dto.agenceCode,
        clientRef: dto.clientRef,
        clientNom: dto.clientNom,
        clientAdresse: dto.clientAdresse,
        compteNum: dto.compteNum,
        compteDevise: dto.compteDevise,
        plafond: dto.plafond,
        // Montant
        amount: dto.amount,
        currency: dto.currency,
        valueDate: dto.valueDate ? new Date(dto.valueDate) : null,
        typeCours: dto.typeCours,
        coursChange: dto.coursChange,
        motif: dto.motif,
        codeMotif: dto.codeMotif,
        // Nature
        categorie: dto.categorie,
        typeTransfert: dto.typeTransfert,
        domRef: dto.domRef,
        domBanque: dto.domBanque,
        domDate: dto.domDate ? new Date(dto.domDate) : null,
        // Bénéficiaire
        beneName: dto.beneName,
        beneAdresse: dto.beneAdresse,
        beneCountry: dto.beneCountry,
        beneIBAN: dto.beneIBAN,
        beneBIC: dto.beneBIC,
        beneBankName: dto.beneBankName,
        // Autres
        correspondentBIC: dto.correspondentBIC,
        incoterm: dto.incoterm,
        referenceClient: dto.referenceClient,
        charges: dto.charges || 'SHA',
        details: dto.details,
        createdById: userId,
        currentStep: 0,
      },
    });

    // Journaliser la création
    await this.addAuditLog(payment.id, userId, 'Saisisseur', 'CREATED', null, 'DRAFT', 'DRAFT', 'Ordre de paiement cree');
    return payment;
  }

  // ── SOUMETTRE AU WORKFLOW ──
async submit(paymentId: string, userId: string) {
  const payment = await this.findOne(paymentId);
  if (payment.status !== 'DRAFT') {
    throw new ForbiddenException('Seul un ordre en statut DRAFT peut etre soumis');
  }

  const user = await this.prisma.user.findUnique({ where: { id: userId } });

  // Récupérer les étapes actives du workflow
  const steps = await this.workflow.getActiveSteps(payment.amount);
  
  let currentStatus = 'DRAFT';
  let currentStep = 0;

  // Exécuter les étapes AUTO en séquence
  for (const step of steps) {
    if (step.type !== 'AUTO') {
      // Première étape MANUEL — on s'arrête ici
      const role = step.role?.toUpperCase().replace(/ /g, '_') || 'VALIDATION';
      currentStatus = `PENDING_${role}`;
      currentStep = step.ordre;
      break;
    }

    // Appel de l'adaptateur pour l'étape AUTO
    currentStep = step.ordre;
    const adapterCode = step.systemeTiers || step.nom.toUpperCase().replace(/ /g, '_');
    
    await this.addAuditLog(
      paymentId, 'SYSTEM', 'Systeme',
      `AUTO_STEP_${step.ordre}_START`, null,
      currentStatus, currentStatus,
      `Debut execution etape AUTO: ${step.nom}`
    );

    const result = await this.systemAdapters.execute(adapterCode, payment);

    await this.addAuditLog(
      paymentId, 'SYSTEM', `Systeme ${adapterCode}`,
      `AUTO_STEP_${step.ordre}_${result.result}`, result.result,
      currentStatus, currentStatus,
      result.message
    );

    // Appliquer le routage selon le résultat
    const routing = result.result === 'POSITIF' 
      ? step.routingPositif 
      : result.result === 'NEGATIF' 
      ? step.routingNegatif 
      : step.routingAlerte;

    const action = (routing as any)?.action || 'NEXT';

    if (action === 'BLOCK') {
      currentStatus = 'BLOCKED';
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'BLOCKED', currentStep, amlStatus: result.result, amlMessage: result.message },
      });
      await this.addAuditLog(paymentId, userId, user.nom, 'BLOCKED', 'NEGATIF', 'DRAFT', 'BLOCKED', result.message);
      return this.findOne(paymentId);
    }

    if (action === 'NEXT') {
      currentStatus = 'PENDING_NEXT';
      continue;
    }
  }

  // Si toutes les étapes AUTO sont passées et aucune étape MANUEL
  if (currentStatus === 'PENDING_NEXT' || currentStatus === 'DRAFT') {
    currentStatus = 'APPROVED';
  }

  await this.prisma.payment.update({
    where: { id: paymentId },
    data: { status: currentStatus, currentStep, amlStatus: 'OK', amlMessage: 'Controles automatiques passes' },
  });

  await this.addAuditLog(
    paymentId, userId, user.nom,
    'SUBMITTED', null, 'DRAFT', currentStatus,
    'Ordre soumis au circuit de validation'
  );

  return this.findOne(paymentId);
}
  // ── DÉCISION VALIDEUR ──
  async decide(paymentId: string, action: 'APPROVE'|'REJECT'|'RETURN', comment: string, user: any) {
    const payment = await this.findOne(paymentId);

    let newStatus: string;
    let auditAction: string;

    if (action === 'APPROVE') {
      // Passer à l'étape suivante ou APPROVED
      const steps = await this.workflow.getActiveSteps(payment.amount);
      const currentStep = payment.currentStep || 1;
      const nextStep = steps.find(s => s.ordre === currentStep + 1);

      if (nextStep) {
        newStatus = `PENDING_${nextStep.role?.toUpperCase().replace(/ /g,'_') || 'VALIDATION'}`;
        auditAction = `APPROVED_STEP_${currentStep}`;
        await this.prisma.payment.update({ where:{id:paymentId}, data:{ status:newStatus, currentStep:currentStep+1 } });
      } else {
        newStatus = 'APPROVED';
        auditAction = 'APPROVED_FINAL';
        await this.prisma.payment.update({ where:{id:paymentId}, data:{ status:'APPROVED', currentStep:currentStep+1 } });
      }
    } else if (action === 'REJECT') {
      newStatus = 'REJECTED';
      auditAction = 'REJECTED';
      await this.prisma.payment.update({ where:{id:paymentId}, data:{ status:'REJECTED' } });
    } else {
      newStatus = 'RETURNED';
      auditAction = 'RETURNED';
      await this.prisma.payment.update({ where:{id:paymentId}, data:{ status:'RETURNED', currentStep:0 } });
    }

    await this.addAuditLog(paymentId, user.id, user.nom, auditAction, null, payment.status, newStatus, comment);
    return this.findOne(paymentId);
  }

  // ── LISTER LES ORDRES ──
  async findAll(user: any, status?: string) {
    const where: any = {};
    if (status) where.status = status;

    // Le saisisseur voit uniquement ses propres ordres
    if (user.role === 'SAISISSEUR') where.createdById = user.id;

    return this.prisma.payment.findMany({
      where,
      include: { createdBy: { select:{ nom:true, role:true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── ORDRES EN ATTENTE POUR LE VALIDEUR ──
  async findPending(user: any) {
    const roleToStatus: Record<string, string[]> = {
      VALIDEUR_N1:   ['PENDING_VALIDEUR_N1', 'PENDING_VALIDATION'],
      VALIDEUR_N2:   ['PENDING_VALIDEUR_N2'],
      CONFORMITE:    ['PENDING_CONFORMITE', 'PENDING_COMPLIANCE_OFFICER'],
      REGLEMENTAIRE: ['PENDING_REGLEMENTAIRE', 'PENDING_RESPONSABLE_REGLEMENTAIRE'],
      DIRECTION:     ['PENDING_DIRECTION', 'PENDING_DIRECTEUR_OPERATIONS'],
    };

    const statuses = roleToStatus[user.role] || [];
    if (statuses.length === 0) return [];

    return this.prisma.payment.findMany({
      where: { status: { in: statuses } },
      include: { createdBy: { select:{ nom:true, role:true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── MES ORDRES ──
async findMine(userId: string, status?: string) {
  const where: any = { createdById: userId };
  if (status) {
    where.status = { in: status.split(',') };
  }
  return this.prisma.payment.findMany({
    where,
    include: {
      createdBy: { select: { nom: true, role: true } },
      auditLogs: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  });
}
  // ── DÉTAIL D'UN ORDRE ──
  async findOne(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        createdBy: { select:{ nom:true, role:true } },
        auditLogs: { orderBy:{ createdAt:'asc' } },
      },
    });
    if (!payment) throw new NotFoundException(`Ordre ${id} non trouvé`);
    return payment;
  }

  // ── PISTE D'AUDIT ──
  async getAuditLog(paymentId: string) {
    return this.prisma.auditLog.findMany({
      where: { paymentId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ── HELPERS PRIVÉS ──
  private async addAuditLog(
    paymentId: string, actorId: string, actorName: string,
    action: string, result: string|null, previousStatus: string, newStatus: string, comment: string,
  ) {
    await this.prisma.auditLog.create({
      data: { paymentId, actorId: actorId === 'SYSTEM' ? null : actorId, actorName, action, result, previousStatus, newStatus, comment },
    });
  }


  // ── MODIFIER UN ORDRE DRAFT OU RETURNED ──
async update(paymentId: string, dto: any, userId: string) {
  const payment = await this.findOne(paymentId);
  if (!['DRAFT', 'RETURNED'].includes(payment.status)) {
    throw new Error('Seul un ordre en statut DRAFT ou RETURNED peut etre modifie');
  }

  const user = await this.prisma.user.findUnique({ where: { id: userId } });

  const updated = await this.prisma.payment.update({
    where: { id: paymentId },
    data: {
      agenceCode:       dto.agenceCode,
      clientRef:        dto.clientRef,
      clientNom:        dto.clientNom,
      clientAdresse:    dto.clientAdresse,
      compteNum:        dto.compteNum,
      compteDevise:     dto.compteDevise,
      plafond:          dto.plafond,
      amount:           dto.amount,
      currency:         dto.currency,
      valueDate:        dto.valueDate ? new Date(dto.valueDate) : null,
      typeCours:        dto.typeCours,
      coursChange:      dto.coursChange,
      motif:            dto.motif,
      codeMotif:        dto.codeMotif,
      categorie:        dto.categorie,
      typeTransfert:    dto.typeTransfert,
      domRef:           dto.domRef,
      domBanque:        dto.domBanque,
      domDate:          dto.domDate ? new Date(dto.domDate) : null,
      beneName:         dto.beneName,
      beneAdresse:      dto.beneAdresse,
      beneCountry:      dto.beneCountry,
      beneIBAN:         dto.beneIBAN,
      beneBIC:          dto.beneBIC,
      beneBankName:     dto.beneBankName,
      correspondentBIC: dto.correspondentBIC,
      incoterm:         dto.incoterm,
      referenceClient:  dto.referenceClient,
      charges:          dto.charges,
      details:          dto.details,
      status:           'DRAFT',
      updatedAt:        new Date(),
    },
  });

  await this.addAuditLog(
    paymentId, userId, user.nom,
    'UPDATED', null, payment.status, 'DRAFT', 'Ordre modifie par le saisisseur'
  );

  return updated;
}

// ── SUPPRIMER UN BROUILLON ──
async remove(paymentId: string, userId: string) {
  const payment = await this.findOne(paymentId);
  if (payment.status !== 'DRAFT') {
    throw new Error('Seul un ordre en statut DRAFT peut etre supprime');
  }

  await this.prisma.auditLog.deleteMany({ where: { paymentId } });
  await this.prisma.payment.delete({ where: { id: paymentId } });

  return { success: true, message: 'Ordre supprime avec succes' };
}
}
