import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ── UTILISATEURS ──
  const users = [
    { login:'admin',      email:'admin@swiftflow.ma',      nom:'Administrateur SwiftFlow', role:'ADMIN',         password:'Admin@2026' },
    { login:'k.benali',   email:'k.benali@swiftflow.ma',   nom:'Khalid Benali',            role:'SAISISSEUR',    password:'Test@1234' },
    { login:'h.moukrim',  email:'h.moukrim@swiftflow.ma',  nom:'Hassan Moukrim',           role:'VALIDEUR_N1',   password:'Test@1234' },
    { login:'s.ouazzani', email:'s.ouazzani@swiftflow.ma', nom:'Samira Ouazzani',          role:'VALIDEUR_N2',   password:'Test@1234' },
    { login:'l.bensouda', email:'l.bensouda@swiftflow.ma', nom:'Leila Bensouda',           role:'CONFORMITE',    password:'Test@1234' },
    { login:'m.alaoui',   email:'m.alaoui@swiftflow.ma',   nom:'Mehdi Alaoui',             role:'REGLEMENTAIRE', password:'Test@1234' },
    { login:'directeur',  email:'direction@swiftflow.ma',  nom:'Direction Generale',       role:'DIRECTION',     password:'Test@1234' },
  ];

  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { login: u.login },
      update: {},
      create: { login:u.login, email:u.email, nom:u.nom, role:u.role, passwordHash },
    });
  }
  console.log('✓ Users created');

  // ── CLIENTS ──
  const clients = [
    { ref:'CLI-001', nom:'MAROC TELECOM SA',   agence:'AG-CAS-01', type:'CORPORATE',  adresse:{rue:'Avenue Annakhil',cp:'10000',ville:'Rabat',pays:'MA'} },
    { ref:'CLI-002', nom:'OCP SA',             agence:'AG-CAS-01', type:'CORPORATE',  adresse:{rue:'2 Rue Al Abtal',cp:'20000',ville:'Casablanca',pays:'MA'} },
    { ref:'CLI-003', nom:'CIMENTS DU MAROC',   agence:'AG-RBA-01', type:'CORPORATE',  adresse:{rue:'Route de Bouskoura',cp:'20100',ville:'Casablanca',pays:'MA'} },
    { ref:'CLI-004', nom:'DELTA HOLDING SA',   agence:'AG-RBA-02', type:'CORPORATE',  adresse:{rue:'Bd Zerktouni',cp:'20050',ville:'Casablanca',pays:'MA'} },
    { ref:'CLI-005', nom:'SIEMENS MAROC SARL', agence:'AG-CAS-02', type:'SUBSIDIARY', adresse:{rue:'Rue Ibnou Majid',cp:'20000',ville:'Casablanca',pays:'MA'} },
    { ref:'CLI-006', nom:'TOTAL MAROC SA',     agence:'AG-MRK-01', type:'CORPORATE',  adresse:{rue:'Rue de Fes',cp:'40000',ville:'Marrakech',pays:'MA'} },
  ];
  for (const c of clients) {
    await prisma.refClient.upsert({ where:{ref:c.ref}, update:{}, create:c });
  }
  console.log('✓ Clients created');

  // ── COMPTES ──
  const comptes = [
    { num:'MA64011000010010001', clientRef:'CLI-001', agence:'AG-CAS-01', devise:'MAD', plafond:5000000  },
    { num:'MA64011000010010002', clientRef:'CLI-001', agence:'AG-CAS-01', devise:'EUR', plafond:500000   },
    { num:'MA64011000020020001', clientRef:'CLI-002', agence:'AG-CAS-01', devise:'MAD', plafond:10000000 },
    { num:'MA64011000020020002', clientRef:'CLI-002', agence:'AG-CAS-01', devise:'USD', plafond:2000000  },
    { num:'MA64011000030030001', clientRef:'CLI-003', agence:'AG-RBA-01', devise:'MAD', plafond:2000000  },
    { num:'MA64011000040040001', clientRef:'CLI-004', agence:'AG-RBA-02', devise:'MAD', plafond:3000000  },
    { num:'MA64011000050050001', clientRef:'CLI-005', agence:'AG-CAS-02', devise:'EUR', plafond:4000000  },
    { num:'MA64011000060060001', clientRef:'CLI-006', agence:'AG-MRK-01', devise:'MAD', plafond:6000000  },
  ];
  for (const c of comptes) {
    await prisma.refCompte.upsert({ where:{num:c.num}, update:{}, create:c });
  }
  console.log('✓ Comptes created');

  // ── WORKFLOW STEPS ──
  await prisma.workflowStep.deleteMany();
  const steps = [
    {
      ordre:1, nom:'Controle Provision', type:'AUTO', systemeTiers:'PROVISION',
      timeoutMs:8000, retryMax:2, timeoutAction:'ALERTE', fallbackAction:'MANUAL',
      condAlways:true,
      routingPositif:{action:'NEXT'}, routingNegatif:{action:'BLOCK'}, routingAlerte:{action:'MANUAL'},
    },
    {
      ordre:2, nom:'Validation Conformite', type:'MANUEL', role:'CONFORMITE',
      timeoutHeures:24, timeoutAction:'ESCALADE', fallbackAction:'ESCALADE',
      condAlways:true,
      routingPositif:{action:'NEXT'}, routingNegatif:{action:'PREVIOUS'}, routingAlerte:{action:'ESCALADE'},
    },
    {
      ordre:3, nom:'Validation Hierarchique', type:'MANUEL', role:'VALIDEUR_N1',
      timeoutHeures:4, timeoutAction:'ESCALADE', fallbackAction:'ESCALADE',
      condAlways:false, condAmountMin:500000,
      routingPositif:{action:'NEXT'}, routingNegatif:{action:'PREVIOUS'}, routingAlerte:{action:'ESCALADE'},
    },
  ];
  for (const s of steps) {
    await prisma.workflowStep.create({ data: s as any });
  }
  console.log('✓ Workflow steps created');

  // ── BANK CONFIG ──
  await prisma.bankConfig.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      nom: 'Banque Demo SwiftFlow',
      bic: 'BEXMMAMC',
      codeBanque: '007',
      deviseRef: 'MAD',
      couleurs: { primaire:'#0891b2', secondaire:'#0e7490', accent:'#06b6d4', fond:'#050C1A', texte:'#E2EAF2' },
    },
  });
  console.log('✓ Bank config created');

  console.log('\n✅ Database seeded successfully!');
  console.log('   Admin: admin / Admin@2026');
  console.log('   Users: k.benali, h.moukrim, s.ouazzani, l.bensouda, m.alaoui, directeur / Test@1234');
}

main().catch(console.error).finally(() => prisma.$disconnect());
