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

  // Récupérer le circuitId depuis l'événement si moduleCode/typeCode/eventCode fournis
  let circuitId: string | null = (dto as any).circuitId || null;
if (!circuitId && dto.moduleCode && dto.typeCode && dto.eventCode) {
    console.log('Recherche circuit pour:', dto.moduleCode, dto.typeCode, dto.eventCode);
    const events = await this.prisma.$queryRawUnsafe(`
      SELECT "circuitId" FROM evenements
      WHERE "moduleCode" = $1
        AND "typeCode"   = $2
        AND code         = $3
      LIMIT 1
    `, dto.moduleCode, dto.typeCode, dto.eventCode) as any[];
    console.log('Events trouvés:', events.length, events[0]);
    if (events.length > 0 && events[0].circuitId) {
      circuitId = events[0].circuitId;
      console.log('CircuitId trouvé:', circuitId);
    }
  }

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
         circuitId: circuitId,
    
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
  // Charger les étapes du circuit lié à l'ordre
const steps = payment.circuitId
  ? await this.workflow.getStepsByCircuit(payment.circuitId, payment.amount)
  : await this.workflow.getActiveSteps(payment.amount);
  
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
    data: { 
      status: 'BLOCKED', 
      currentStep, 
      amlStatus: result.result, 
      amlMessage: result.message 
    },
  });
  await this.addAuditLog(
    paymentId, userId, user.nom,
    'BLOCKED', 'NEGATIF', 'DRAFT', 'BLOCKED',
    result.message
  );
  return this.findOne(paymentId);
}

if (action === 'PREVIOUS') {
  // Si étape 1 ou pas d'étape précédente → retour au saisisseur
  const prevStep = steps.find(s => s.ordre === step.ordre - 1);
  if (!prevStep || step.ordre === 1) {
    // Retour au saisisseur
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { 
        status: 'RETURNED', 
        currentStep: 0,
        amlStatus: result.result,
        amlMessage: result.message,
      },
    });
    await this.addAuditLog(
      paymentId, 'SYSTEM', `Systeme ${adapterCode}`,
      'RETURNED', 'NEGATIF', 'DRAFT', 'RETURNED',
      `Retour automatique au saisisseur : ${result.message}`
    );
    return this.findOne(paymentId);
  } else {
    // Retour à l'étape précédente
    const prevRole = prevStep.role?.toUpperCase().replace(/ /g, '_') || 'VALIDATION';
    currentStatus = `PENDING_${prevRole}`;
    currentStep = prevStep.ordre;
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: currentStatus, currentStep },
    });
    await this.addAuditLog(
      paymentId, 'SYSTEM', `Systeme ${adapterCode}`,
      'RETURNED_TO_PREVIOUS', 'NEGATIF', 'DRAFT', currentStatus,
      `Retour automatique a l etape precedente : ${result.message}`
    );
    return this.findOne(paymentId);
  }
}
if (action === 'ESCALADE') {
  // Récupérer le rôle supérieur
  const roleCode = step.role?.toUpperCase().replace(/ /g, '_') || 'VALIDATION';
  const roles = await this.prisma.$queryRawUnsafe(`
    SELECT "roleSuperieurCode" FROM roles WHERE code = $1
  `, roleCode) as any[];
  
  const roleSuperieur = roles.length > 0 && roles[0].roleSuperieurCode
    ? roles[0].roleSuperieurCode
    : roleCode;

  currentStatus = `PENDING_${roleSuperieur}`;
  currentStep = step.ordre;

  await this.prisma.payment.update({
    where: { id: paymentId },
    data: { status: currentStatus, currentStep },
  });

  await this.addAuditLog(
    paymentId, 'SYSTEM', `Systeme ${adapterCode}`,
    'ESCALATED', 'ALERTE', 'DRAFT', currentStatus,
    `Escalade automatique vers ${roleSuperieur} : ${result.message}`
  );
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

  async force(paymentId: string, userId: string, motif: string, confirmationCode?: string) {
  // 1. Vérifier que l'ordre est bien BLOCKED
  const payment = await this.findOne(paymentId);
  if (payment.status !== 'BLOCKED') {
    throw new ForbiddenException('Seul un ordre BLOCKED peut être forcé');
  }

  // 2. Récupérer l'utilisateur et son rôle
  const user = await this.prisma.user.findUnique({ where: { id: userId } });
  const roleCode = user.role;

  // 3. Récupérer le système qui a bloqué depuis audit_logs
  const blockLogs = await this.prisma.$queryRawUnsafe(`
    SELECT comment FROM audit_logs
    WHERE "paymentId" = $1::uuid
    AND action LIKE 'AUTO_STEP_%_NEGATIF'
    ORDER BY "createdAt" DESC
    LIMIT 1
  `, paymentId) as any[];

  // Extraire le code système depuis le commentaire de l'audit
  let systemCode = 'PROVISION'; // défaut
  if (blockLogs.length > 0) {
    const match = blockLogs[0].comment?.match(/Systeme (\w+)/);
    if (match) systemCode = match[1];
  }

  // 4. Vérifier l'habilitation de forçage
  const forceHab = await this.prisma.$queryRawUnsafe(`
    SELECT * FROM force_habilitations
    WHERE "roleCode" = $1
    AND "systemAdapterCode" = $2
    LIMIT 1
  `, roleCode, systemCode) as any[];

  if (forceHab.length === 0) {
    throw new ForbiddenException(`Le rôle ${roleCode} n'est pas habilité à forcer les blocages ${systemCode}`);
  }

  const hab = forceHab[0];

  // 5. Vérifier le montant maximum
  if (hab.montantMax > 0 && payment.amount > hab.montantMax) {
    throw new ForbiddenException(`Montant ${payment.amount} dépasse la limite de forçage autorisée (${hab.montantMax})`);
  }

  // 6. Vérifier le quota journalier
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const forcesToday = await this.prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as count FROM audit_logs
    WHERE "actorId" = $1::uuid
    AND action = 'FORCED_OVERRIDE'
    AND "createdAt" >= $2
  `, userId, today) as any[];

  const forceCount = parseInt(forcesToday[0].count) || 0;
  if (forceCount >= hab.quotaJournalier) {
    throw new ForbiddenException(`Quota journalier de forçage atteint (${hab.quotaJournalier}/jour)`);
  }

  // 7. Vérifier double validation si requise
  if (hab.doubleValidation && !confirmationCode) {
    throw new ForbiddenException('Double validation requise — veuillez fournir un code de confirmation');
  }

  // 8. Déterminer l'étape suivante dans le circuit
  const steps = payment.circuitId
    ? await this.workflow.getStepsByCircuit(payment.circuitId, payment.amount)
    : await this.workflow.getActiveSteps(payment.amount);

  const nextStep = steps.find(s => s.isActive);
  let newStatus = 'PENDING_CONFORMITE'; // défaut

  if (nextStep) {
    if (nextStep.type === 'MANUEL' && nextStep.role) {
      const roleKey = nextStep.role.toUpperCase().replace(/ /g, '_');
      newStatus = `PENDING_${roleKey}`;
    } else if (nextStep.type === 'AUTO') {
      // Si l'étape suivante est AUTO, on la saute et on prend la première MANUEL
      const manuelStep = steps.find(s => s.type === 'MANUEL' && s.isActive);
      if (manuelStep) {
        const roleKey = manuelStep.role.toUpperCase().replace(/ /g, '_');
        newStatus = `PENDING_${roleKey}`;
      } else {
        newStatus = 'APPROVED';
      }
    }
  }

  // 9. Mettre à jour le statut
  await this.prisma.payment.update({
    where: { id: paymentId },
    data: { status: newStatus, currentStep: nextStep?.ordre || 1 },
  });

  // 10. Enregistrer dans la piste d'audit
  await this.addAuditLog(
    paymentId, userId, user.nom,
    'FORCED_OVERRIDE', 'POSITIF',
    'BLOCKED', newStatus,
    `Forçage autorisé par ${user.nom} (${roleCode}) — Système: ${systemCode} — Motif: ${motif}`
  );

  return this.findOne(paymentId);
}
}
