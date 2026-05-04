import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const DEFAULT_ID = '00000000-0000-0000-0000-000000000001';

@Injectable()
export class BankConfigService {
  constructor(private prisma: PrismaService) {}

  async get() {
    let config = await this.prisma.bankConfig.findUnique({
      where: { id: DEFAULT_ID },
    });
    if (!config) {
      config = await this.prisma.bankConfig.create({
        data: {
          id: DEFAULT_ID,
          nom: 'Ma Banque',
          bic: 'XXXXXXXX',
          deviseRef: 'MAD',
          couleurs: {
            primaire: '#0891b2',
            secondaire: '#0e7490',
            accent: '#06b6d4',
            fond: '#050C1A',
            texte: '#E2EAF2',
          },
        },
      });
    }
    return config;
  }

  async update(data: any) {
    return this.prisma.bankConfig.upsert({
      where: { id: DEFAULT_ID },
      update: {
        nom:       data.nom,
        bic:       data.bic,
        codeBanque:data.codeBanque,
        deviseRef: data.deviseRef,
        logo:      data.logo,
        couleurs:  data.couleurs,
        updatedAt: new Date(),
      },
      create: {
        id:        DEFAULT_ID,
        nom:       data.nom || 'Ma Banque',
        bic:       data.bic || 'XXXXXXXX',
        codeBanque:data.codeBanque,
        deviseRef: data.deviseRef || 'MAD',
        logo:      data.logo,
        couleurs:  data.couleurs,
      },
    });
  }
}
