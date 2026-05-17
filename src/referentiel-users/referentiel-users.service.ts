import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ReferentielUsersService {
  constructor(private prisma: PrismaService) {}

  // ── RÔLES ──
  async getRoles() {
    return this.prisma.$queryRaw`
      SELECT r.*, rs.nom as "roleSuperieurNom"
      FROM roles r
      LEFT JOIN roles rs ON rs.code = r."roleSuperieurCode"
      ORDER BY r.niveau ASC, r.nom ASC
    `;
  }

  async createRole(data: any) {
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO roles (
        code, nom, description, niveau, "roleSuperieurCode",
        "peutSaisir", "peutValider", "peutForcer", "peutDeleguer",
        "peutAdministrer", "montantMaxValidation", "montantMaxForcage"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `,
      data.code, data.nom, data.description || null,
      data.niveau || 1, data.roleSuperieurCode || null,
      data.peutSaisir || false, data.peutValider || false,
      data.peutForcer || false, data.peutDeleguer || false,
      data.peutAdministrer || false,
      data.montantMaxValidation || 0, data.montantMaxForcage || 0
    );
    const result = await this.prisma.$queryRaw`
      SELECT * FROM roles WHERE code = ${data.code}
    ` as any[];
    return result[0];
  }

  async updateRole(code: string, data: any) {
    const fields = [
      'nom', 'description', 'niveau', 'roleSuperieurCode',
      'peutSaisir', 'peutValider', 'peutForcer', 'peutDeleguer',
      'peutAdministrer', 'montantMaxValidation', 'montantMaxForcage', 'isActive'
    ];
    for (const key of fields) {
      if (data[key] === undefined) continue;
      await this.prisma.$executeRawUnsafe(
        `UPDATE roles SET "${key}" = $1, "updatedAt" = NOW() WHERE code = $2`,
        data[key] === null ? null : String(data[key]), code
      );
    }
    const result = await this.prisma.$queryRaw`
      SELECT * FROM roles WHERE code = ${code}
    ` as any[];
    return result[0];
  }

  // ── HABILITATIONS ──
  async getHabilitations(roleCode?: string) {
    if (roleCode) {
      return this.prisma.$queryRaw`
        SELECT * FROM habilitations WHERE "roleCode" = ${roleCode}
        ORDER BY module ASC, action ASC
      `;
    }
    return this.prisma.$queryRaw`
      SELECT * FROM habilitations ORDER BY "roleCode" ASC, module ASC, action ASC
    `;
  }

  async updateHabilitation(id: string, autorise: boolean, montantMax?: number) {
    await this.prisma.$executeRawUnsafe(
      `UPDATE habilitations SET autorise = $1, "montantMax" = $2 WHERE id = $3::uuid`,
      autorise, montantMax || 0, id
    );
    const result = await this.prisma.$queryRaw`
      SELECT * FROM habilitations WHERE id = ${id}::uuid
    ` as any[];
    return result[0];
  }

  // ── UTILISATEURS ──
  async getUsers() {
    return this.prisma.$queryRaw`
      SELECT u.id, u.login, u.nom, u.email, u.role, u."roleCode",
             u."agenceCode", u."isActive", u."createdAt", u."lastLogin",
             u.telephone, u."dateDebut", u."dateFin",
             r.nom as "roleNom", r.niveau as "roleNiveau"
      FROM users u
      LEFT JOIN roles r ON r.code = u."roleCode"
      ORDER BY u.nom ASC
    `;
  }

  async createUser(data: any) {
  const bcrypt = require('bcrypt');
  const passwordHash = await bcrypt.hash(data.password || 'SwiftFlow2026!', 10);
  
  await this.prisma.$executeRawUnsafe(`
    INSERT INTO users (login, email, nom, role, "roleCode", "agenceCode", "passwordHash", "isActive", telephone)
    VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)
  `,
    data.login,
    data.email,
    data.nom,
    data.roleCode || data.role,
    data.roleCode || data.role,
    data.agenceCode || null,
    passwordHash,
    data.telephone || null
  );

  const result = await this.prisma.$queryRaw`
    SELECT id, login, nom, email, role, "roleCode", "agenceCode", "isActive"
    FROM users WHERE login = ${data.login}
  ` as any[];
  return result[0];
}
  async updateUser(id: string, data: any) {
    const fields = [
      'nom', 'email', 'agenceCode', 'roleCode', 'role',
      'telephone', 'dateDebut', 'dateFin', 'isActive'
    ];
    for (const key of fields) {
      if (data[key] === undefined) continue;
      await this.prisma.$executeRawUnsafe(
        `UPDATE users SET "${key}" = $1, "updatedAt" = NOW() WHERE id = $2::uuid`,
        data[key] === null ? null : String(data[key]), id
      );
    }
    const result = await this.prisma.$queryRaw`
      SELECT id, login, nom, email, role, "roleCode", "agenceCode", "isActive"
      FROM users WHERE id = ${id}::uuid
    ` as any[];
    return result[0];
  }

  // ── DÉLÉGATIONS ──
  async getDelegations(userId?: string) {
    if (userId) {
      return this.prisma.$queryRaw`
        SELECT d.*,
               ud.nom as "delegateurNom", ud.login as "delegateurLogin",
               ude.nom as "delegataireNom", ude.login as "delegataireLogin"
        FROM delegations d
        LEFT JOIN users ud  ON ud.id  = d."delegateurId"
        LEFT JOIN users ude ON ude.id = d."delegataireId"
        WHERE d."delegateurId" = ${userId}::uuid
           OR d."delegataireId" = ${userId}::uuid
        ORDER BY d."createdAt" DESC
      `;
    }
    return this.prisma.$queryRaw`
      SELECT d.*,
             ud.nom as "delegateurNom", ud.login as "delegateurLogin",
             ude.nom as "delegataireNom", ude.login as "delegataireLogin"
      FROM delegations d
      LEFT JOIN users ud  ON ud.id  = d."delegateurId"
      LEFT JOIN users ude ON ude.id = d."delegataireId"
      ORDER BY d."createdAt" DESC
    `;
  }

  async createDelegation(data: any) {
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO delegations ("delegateurId", "delegataireId", "dateDebut", "dateFin", perimetre, motif, statut)
      VALUES ($1::uuid, $2::uuid, $3::timestamp, $4::timestamp, $5::jsonb, $6, 'ACTIVE')
    `,
      data.delegateurId, data.delegataireId,
      data.dateDebut, data.dateFin,
      JSON.stringify(data.perimetre || {}),
      data.motif || null
    );
    return { success: true };
  }

  async revokeDelegation(id: string) {
    await this.prisma.$executeRawUnsafe(
      `UPDATE delegations SET statut = 'REVOQUEE' WHERE id = $1::uuid`,
      id
    );
    return { success: true };
  }

  // ── HABILITATIONS FORÇAGE ──
  async getForceHabilitations() {
    return this.prisma.$queryRaw`
      SELECT fh.*, r.nom as "roleNom", sa.nom as "systemNom"
      FROM force_habilitations fh
      LEFT JOIN roles r ON r.code = fh."roleCode"
      LEFT JOIN system_adapters sa ON sa.code = fh."systemAdapterCode"
      ORDER BY fh."roleCode" ASC, fh."systemAdapterCode" ASC
    `;
  }

  async updateForceHabilitation(id: string, data: any) {
    const fields = ['montantMax', 'quotaJournalier', 'doubleValidation'];
    for (const key of fields) {
      if (data[key] === undefined) continue;
      await this.prisma.$executeRawUnsafe(
        `UPDATE force_habilitations SET "${key}" = $1 WHERE id = $2::uuid`,
        data[key], id
      );
    }
    const result = await this.prisma.$queryRaw`
      SELECT * FROM force_habilitations WHERE id = ${id}::uuid
    ` as any[];
    return result[0];
  }
}
