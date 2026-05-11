import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SystemAdaptersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.$queryRaw`
      SELECT * FROM system_adapters ORDER BY code ASC
    `;
  }

  async findOne(code: string) {
    const results = await this.prisma.$queryRaw`
      SELECT * FROM system_adapters WHERE code = ${code} LIMIT 1
    ` as any[];
    return results[0] || null;
  }

async update(id: string, data: any) {
  const jsonbFields    = ['headers', 'mappingRequest', 'mappingResponse'];
  const integerFields  = ['timeoutMs', 'retryMax', 'bouchonDelaiMs'];
  const booleanFields  = ['modeBouchon', 'isActive'];
  
  const allowed = [
    'modeAppel', 'urlEndpoint', 'authType', 'authValue', 'headers',
    'formatRequest', 'formatResponse', 'mappingRequest', 'mappingResponse',
    'timeoutMs', 'retryMax', 'timeoutAction', 'queueType', 'queueUrl',
    'queueTopicSend', 'queueTopicReceive', 'modeBouchon', 'bouchonResultat',
    'bouchonDelaiMs', 'bouchonMessage', 'isActive',
  ];

  for (const key of allowed) {
    if (data[key] === undefined) continue;

    if (jsonbFields.includes(key)) {
      const value = typeof data[key] === 'object'
        ? JSON.stringify(data[key])
        : data[key];
      await this.prisma.$executeRawUnsafe(
        `UPDATE system_adapters SET "${key}" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2::uuid`,
        value, id
      );
    } else if (integerFields.includes(key)) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE system_adapters SET "${key}" = $1::integer, "updatedAt" = NOW() WHERE id = $2::uuid`,
        parseInt(data[key]) || 0, id
      );
    } else if (booleanFields.includes(key)) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE system_adapters SET "${key}" = $1::boolean, "updatedAt" = NOW() WHERE id = $2::uuid`,
        data[key] === true || data[key] === 'true', id
      );
    } else {
      await this.prisma.$executeRawUnsafe(
        `UPDATE system_adapters SET "${key}" = $1, "updatedAt" = NOW() WHERE id = $2::uuid`,
        String(data[key] ?? ''), id
      );
    }
  }

  const results = await this.prisma.$queryRaw`
    SELECT * FROM system_adapters WHERE id = ${id}::uuid LIMIT 1
  ` as any[];
  return results[0];
}

  // Exécuter un adaptateur (bouchon ou réel)
  async execute(code: string, payment: any): Promise<{
    result: 'POSITIF' | 'NEGATIF' | 'ALERTE';
    message: string;
    data?: any;
  }> {
    const adapter = await this.findOne(code);
    
    if (!adapter) {
      return { result: 'ALERTE', message: `Adaptateur ${code} non trouve` };
    }

    // Mode bouchon
    if (adapter.modeBouchon) {
      await new Promise(r => setTimeout(r, adapter.bouchonDelaiMs || 1000));
      return {
        result: adapter.bouchonResultat as 'POSITIF' | 'NEGATIF' | 'ALERTE',
        message: adapter.bouchonMessage || `Simulation ${code} — ${adapter.bouchonResultat}`,
      };
    }

    // Mode réel — selon modeAppel
    switch (adapter.modeAppel) {
      case 'REST':
        return this.executeRest(adapter, payment);
      case 'QUEUE':
        return this.executeQueue(adapter, payment);
      case 'FILE':
        return this.executeFile(adapter, payment);
      default:
        return { result: 'ALERTE', message: `Mode appel ${adapter.modeAppel} non supporte` };
    }
  }

  // Adaptateur REST
  private async executeRest(adapter: any, payment: any) {
    try {
      const headers: any = {
        'Content-Type': 'application/json',
        ...(adapter.headers || {}),
      };

      if (adapter.authType === 'BEARER' && adapter.authValue) {
        headers['Authorization'] = `Bearer ${adapter.authValue}`;
      } else if (adapter.authType === 'API_KEY' && adapter.authValue) {
        headers['X-API-Key'] = adapter.authValue;
      } else if (adapter.authType === 'BASIC' && adapter.authValue) {
        headers['Authorization'] = `Basic ${Buffer.from(adapter.authValue).toString('base64')}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), adapter.timeoutMs || 8000);

      const res = await fetch(adapter.urlEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          paymentId:  payment.id,
          reference:  payment.reference,
          amount:     payment.amount,
          currency:   payment.currency,
          beneName:   payment.beneName,
          beneCountry:payment.beneCountry,
          beneIBAN:   payment.beneIBAN,
          beneBIC:    payment.beneBIC,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await res.json();
      const mapping = adapter.mappingResponse || {};
      const resultField = mapping.resultField || 'status';
      const rawResult = data[resultField];

      let result: 'POSITIF' | 'NEGATIF' | 'ALERTE' = 'ALERTE';
      if (rawResult === (mapping.positifValue || 'OK'))    result = 'POSITIF';
      if (rawResult === (mapping.negatifValue || 'KO'))    result = 'NEGATIF';
      if (rawResult === (mapping.alerteValue  || 'ALERT')) result = 'ALERTE';

      return { result, message: data.message || data.description || rawResult, data };

    } catch (e: any) {
      if (e.name === 'AbortError') {
        return { result: 'ALERTE' as const, message: `Timeout apres ${adapter.timeoutMs}ms` };
      }
      return { result: 'ALERTE' as const, message: `Erreur REST: ${e.message}` };
    }
  }

  // Adaptateur Queue (placeholder — à implémenter selon le broker)
  private async executeQueue(adapter: any, payment: any) {
    return {
      result: 'ALERTE' as const,
      message: `Mode QUEUE non encore implemente pour ${adapter.code} — activer le bouchon`,
    };
  }

  // Adaptateur Fichier (placeholder — à implémenter selon le format)
  private async executeFile(adapter: any, payment: any) {
    return {
      result: 'ALERTE' as const,
      message: `Mode FILE non encore implemente pour ${adapter.code} — activer le bouchon`,
    };
  }
}
