import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ModulesService {
  constructor(private prisma: PrismaService) {}

  // ── MODULES ──
async getModules() {
  return this.prisma.$queryRaw`
    SELECT * FROM modules ORDER BY ordre ASC
  `;
}

  // ── TYPES PAR MODULE ──
async getTypesByModule(moduleCode: string) {
  return this.prisma.$queryRaw`
    SELECT * FROM module_types
    WHERE "moduleCode" = ${moduleCode}
    ORDER BY ordre ASC
  `;
}

  // ── ÉVÉNEMENTS PAR MODULE ET TYPE ──
  async getEvenements(moduleCode?: string, typeCode?: string) {
    if (moduleCode && typeCode) {
      return this.prisma.$queryRaw`
        SELECT e.*, c.nom as "circuitNom"
        FROM evenements e
        LEFT JOIN circuits c ON c.id = e."circuitId"
        WHERE e."moduleCode" = ${moduleCode}
          AND e."typeCode" = ${typeCode}
          AND e."isActive" = true
        ORDER BY e.ordre ASC
      `;
    }
    if (moduleCode) {
      return this.prisma.$queryRaw`
        SELECT e.*, c.nom as "circuitNom"
        FROM evenements e
        LEFT JOIN circuits c ON c.id = e."circuitId"
        WHERE e."moduleCode" = ${moduleCode}
          AND e."isActive" = true
        ORDER BY e."typeCode" ASC, e.ordre ASC
      `;
    }
    return this.prisma.$queryRaw`
      SELECT e.*, c.nom as "circuitNom"
      FROM evenements e
      LEFT JOIN circuits c ON c.id = e."circuitId"
      WHERE e."isActive" = true
      ORDER BY e."moduleCode" ASC, e."typeCode" ASC, e.ordre ASC
    `;
  }

  // ── CIRCUITS ──
async getCircuits(moduleCode?: string) {
  if (moduleCode) {
    return this.prisma.$queryRawUnsafe(`
      SELECT c.id, c.code, c.nom, c."moduleCode", c."typeCode", c."evenementCode", 
             c.description, c."createdAt",
             CAST(COUNT(ws.id) AS INTEGER) as "nbEtapes"
      FROM circuits c
      LEFT JOIN workflow_steps ws ON ws."circuitId" = c.id
      WHERE c."moduleCode" = $1
      GROUP BY c.id
      ORDER BY c."moduleCode" ASC, c."typeCode" ASC
    `, moduleCode);
  }
  return this.prisma.$queryRawUnsafe(`
    SELECT c.id, c.code, c.nom, c."moduleCode", c."typeCode", c."evenementCode",
           c.description, c."createdAt",
           CAST(COUNT(ws.id) AS INTEGER) as "nbEtapes"
    FROM circuits c
    LEFT JOIN workflow_steps ws ON ws."circuitId" = c.id
    GROUP BY c.id
    ORDER BY c."moduleCode" ASC, c."typeCode" ASC
  `);
}

  async createCircuit(data: any) {
    const code = `${data.moduleCode}_${data.typeCode}_${data.evenementCode}`.toUpperCase();
    const nom  = `Circuit ${data.moduleCode} ${data.typeCode} ${data.evenementCode}`;
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO circuits (code, nom, "moduleCode", "typeCode", "evenementCode", description)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (code) DO NOTHING
    `, code, data.nom || nom, data.moduleCode, data.typeCode, data.evenementCode, data.description || null);

    const result = await this.prisma.$queryRaw`
      SELECT * FROM circuits WHERE code = ${code}
    ` as any[];
    return result[0];
  }

  async linkCircuitToEvenement(evenementId: string, circuitId: string) {
    await this.prisma.$executeRawUnsafe(
      `UPDATE evenements SET "circuitId" = $1::uuid WHERE id = $2::uuid`,
      circuitId, evenementId
    );
    return { success: true };
  }

  // ── MODULES ACCESSIBLES PAR RÔLE ──
  async getModulesAccessibles(roleCode: string) {
   const habilitations = await this.prisma.$queryRaw`
  SELECT he."roleCode", he."moduleCode", he."typeCode", he."evenementCode",
         he."peutInitier", he."peutValider", he."peutAnnuler", he."peutModifier",
         m.nom as "moduleNom", m.icone, m.couleur, m.ordre as "moduleOrdre",
         mt.nom as "typeNom", mt.ordre as "typeOrdre",
         e.nom as "evenementNom", e.id as "evenementId", e."circuitId", e.ordre as "evenementOrdre"
  FROM habilitations_evenements he
  JOIN modules m ON m.code = he."moduleCode"
  JOIN module_types mt ON mt."moduleCode" = he."moduleCode" AND mt.code = he."typeCode"
  JOIN evenements e ON e."moduleCode" = he."moduleCode"
                   AND e."typeCode" = he."typeCode"
                   AND e.code = he."evenementCode"
  WHERE he."roleCode" = ${roleCode}
    AND (he."peutInitier" = true OR he."peutValider" = true)
  ORDER BY m.ordre ASC, mt.ordre ASC, e.ordre ASC
` as any[];

    // Structurer en arbre Module → Type → Événements
    const tree: any = {};
    for (const h of habilitations) {
      if (!tree[h.moduleCode]) {
        tree[h.moduleCode] = {
          code:    h.moduleCode,
          nom:     h.moduleNom,
          icone:   h.icone,
          couleur: h.couleur,
          ordre:   h.moduleOrdre,
          types:   {},
        };
      }
      if (!tree[h.moduleCode].types[h.typeCode]) {
        tree[h.moduleCode].types[h.typeCode] = {
          code: h.typeCode,
          nom:  h.typeNom,
          evenements: [],
        };
      }
      tree[h.moduleCode].types[h.typeCode].evenements.push({
        code:          h.evenementCode,
        nom:           h.evenementNom,
        id:            h.evenementId,
        circuitId:     h.circuitId,
        peutInitier:   h.peutInitier,
        peutValider:   h.peutValider,
        peutAnnuler:   h.peutAnnuler,
        peutModifier:  h.peutModifier,
      });
    }

    return Object.values(tree).map((m: any) => ({
      ...m,
      types: Object.values(m.types),
    }));
  }

  // ── HABILITATIONS ÉVÉNEMENTS ──
  async getHabilitationsEvenements(roleCode?: string, moduleCode?: string) {
    if (roleCode && moduleCode) {
      return this.prisma.$queryRaw`
        SELECT he.*, e.nom as "evenementNom", mt.nom as "typeNom"
        FROM habilitations_evenements he
        JOIN evenements e ON e."moduleCode" = he."moduleCode"
                         AND e."typeCode" = he."typeCode"
                         AND e.code = he."evenementCode"
        JOIN module_types mt ON mt."moduleCode" = he."moduleCode"
                            AND mt.code = he."typeCode"
        WHERE he."roleCode" = ${roleCode}
          AND he."moduleCode" = ${moduleCode}
        ORDER BY he."typeCode" ASC, e.ordre ASC
      `;
    }
    return this.prisma.$queryRaw`
      SELECT he.*, e.nom as "evenementNom", mt.nom as "typeNom"
      FROM habilitations_evenements he
      JOIN evenements e ON e."moduleCode" = he."moduleCode"
                       AND e."typeCode" = he."typeCode"
                       AND e.code = he."evenementCode"
      JOIN module_types mt ON mt."moduleCode" = he."moduleCode"
                          AND mt.code = he."typeCode"
      ORDER BY he."roleCode" ASC, he."moduleCode" ASC, he."typeCode" ASC
    `;
  }

  async updateHabilitationEvenement(id: string, data: any) {
    const fields = ['peutInitier', 'peutValider', 'peutAnnuler', 'peutModifier', 'montantMax'];
    for (const key of fields) {
      if (data[key] === undefined) continue;
      await this.prisma.$executeRawUnsafe(
        `UPDATE habilitations_evenements SET "${key}" = $1 WHERE id = $2::uuid`,
        data[key], id
      );
    }
    const result = await this.prisma.$queryRaw`
      SELECT * FROM habilitations_evenements WHERE id = ${id}::uuid
    ` as any[];
    return result[0];
  }

  async createHabilitationEvenement(data: any) {
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO habilitations_evenements
        ("roleCode", "moduleCode", "typeCode", "evenementCode",
         "peutInitier", "peutValider", "peutAnnuler", "peutModifier", "montantMax")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT ("roleCode", "moduleCode", "typeCode", "evenementCode")
      DO UPDATE SET
        "peutInitier"  = $5,
        "peutValider"  = $6,
        "peutAnnuler"  = $7,
        "peutModifier" = $8,
        "montantMax"   = $9
    `,
      data.roleCode, data.moduleCode, data.typeCode, data.evenementCode,
      data.peutInitier || false, data.peutValider || false,
      data.peutAnnuler || false, data.peutModifier || false,
      data.montantMax || 0
    );
    return { success: true };
  }
}
