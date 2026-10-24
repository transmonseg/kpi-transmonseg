import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// F2-12 (KRQ-06): a planilha do Ao vivo era a unica prova do fechamento dos
// dias da RQ puxados da Fusion e a limpeza de 7 dias apagava (RQ de 13 a
// 15/10 ja' sumiu; 16/10 sairia em 24/10). O calculo de dia encerrado (o
// fechamento das 00:30, a reconferencia das 05:30 e qualquer recalculo
// posterior) guarda a planilha final em fechados/<cliente>/AAAA-MM-DD.xlsx,
// fora da limpeza.
const c = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
  uploads: [] as { caminho: string; corpo: unknown }[],
  downloads: [] as string[],
  removidos: [] as string[][],
  listados: [] as string[],
  resultadoAnterior: null as unknown,
  coerenciaFalhou: 0,
  arquivosAoVivo: {} as Record<string, string[]>,
}))

function cadeia(resultado: unknown) {
  const o: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'or', 'update', 'upsert', 'lt', 'gte', 'order', 'limit']) o[m] = () => o
  o.maybeSingle = async () => resultado
  o.then = (res: (v: unknown) => void) => res(resultado)
  return o
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (tabela: string) => {
      if (tabela === 'kpi_ao_vivo_dia') return cadeia({ data: { romaneio: [{ placaNorm: 'AAA1A11', rua: 'RUA A' }] }, error: null })
      const o = cadeia({ data: c.resultadoAnterior ? { resultado: c.resultadoAnterior, calculado_em: '2026-10-23T23:50:00Z' } : null, error: null }) as Record<string, (...a: unknown[]) => unknown>
      o.update = (v: unknown) => {
        c.updates.push(v as Record<string, unknown>)
        return cadeia({ data: [{ cliente: 'rioquality' }], error: null })
      }
      return o
    },
    storage: {
      from: () => ({
        upload: async (caminho: string, corpo: unknown) => { c.uploads.push({ caminho, corpo }); return { error: null } },
        download: async (caminho: string) => {
          c.downloads.push(caminho)
          return { data: new Blob([Buffer.from('planilha-boa-anterior')]), error: null }
        },
        list: async (pasta: string) => {
          c.listados.push(pasta)
          return { data: (c.arquivosAoVivo[pasta] ?? []).map(name => ({ name })), error: null }
        },
        remove: async (caminhos: string[]) => { c.removidos.push(caminhos); return { error: null } },
      }),
    },
  }),
}))
vi.mock('@/lib/kpi-rioquality/pipeline', () => ({
  gerarKpiRioQuality: async () => ({ xlsx: Buffer.from('planilha-final'), linhasKpi: [], detalhe: [], avisos: [], coerenciaFalhou: c.coerenciaFalhou }),
}))
vi.mock('@/lib/kpi-rioquality/frota', () => ({ buscarFrotaRioQuality: async () => new Map([['AAA1A11', '1']]) }))
vi.mock('./paradas-snapshot', () => ({ lerSnapshotParadas: async () => new Map() }))
vi.mock('./versao-regras', () => ({ versaoDasRegras: () => '0f495b4' }))
vi.mock('./resumo-dashboard', () => ({ extrairKpiCompleto: async () => ({ data: null, resumo: { cargas: [] }, nfs: [] }) }))

import { calcularAoVivo, limparXlsxAoVivo, caminhoXlsxFechado } from './ao-vivo-servico'

beforeEach(() => {
  c.updates = []; c.uploads = []; c.downloads = []; c.removidos = []; c.listados = []
  c.resultadoAnterior = null; c.coerenciaFalhou = 0; c.arquivosAoVivo = {}
  // 24/10 00:30 BRT: fechamento do dia 23/10.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-24T03:30:00Z'))
})
afterEach(() => { vi.useRealTimers() })

describe('F2-12: KPI final guardado para sempre', () => {
  it('caminho fora da pasta do Ao vivo', () => {
    expect(caminhoXlsxFechado('rioquality', '2026-10-23')).toBe('fechados/rioquality/2026-10-23.xlsx')
    expect(caminhoXlsxFechado('nutrimax', '2026-10-23')).toBe('fechados/nutrimax/2026-10-23.xlsx')
  })

  it('calculo do dia encerrado (fechamento das 00:30) guarda a planilha final em fechados/', async () => {
    expect(await calcularAoVivo('rioquality', '2026-10-23')).toBe('ok')
    const caminhos = c.uploads.map(u => u.caminho)
    expect(caminhos).toContain('ao-vivo/rioquality/2026-10-23.xlsx')
    expect(caminhos).toContain('fechados/rioquality/2026-10-23.xlsx')
    const fechado = c.uploads.find(u => u.caminho === 'fechados/rioquality/2026-10-23.xlsx')!
    expect(String(fechado.corpo)).toBe('planilha-final')
  })

  it('calculo do dia corrente nao mexe em fechados/', async () => {
    expect(await calcularAoVivo('rioquality', '2026-10-24')).toBe('ok')
    expect(c.uploads.map(u => u.caminho)).toEqual(['ao-vivo/rioquality/2026-10-24.xlsx'])
  })

  it('fechamento degradado que mantem o resultado bom anterior: guarda a planilha desse resultado (a do Ao vivo)', async () => {
    c.resultadoAnterior = { placas: [] }
    c.coerenciaFalhou = 12
    expect(await calcularAoVivo('rioquality', '2026-10-23')).toBe('erro')
    expect(c.downloads).toEqual(['ao-vivo/rioquality/2026-10-23.xlsx'])
    const fechado = c.uploads.find(u => u.caminho === 'fechados/rioquality/2026-10-23.xlsx')!
    expect(Buffer.from(fechado.corpo as Buffer).toString()).toBe('planilha-boa-anterior')
    expect(c.uploads.some(u => u.caminho.startsWith('ao-vivo/'))).toBe(false)
  })

  it('a limpeza (suspensa no tick desde o F0-11) so lista e apaga dentro de ao-vivo/, nunca fechados/', async () => {
    c.arquivosAoVivo = {
      'ao-vivo/rioquality': ['2026-10-16.xlsx', '2026-10-17.xlsx', '2026-10-23.xlsx'],
      'ao-vivo/nutrimax': ['2026-10-16.xlsx'],
      'fechados/rioquality': ['2026-10-16.xlsx'],
    }
    await limparXlsxAoVivo('2026-10-24')
    expect(c.listados.every(p => p.startsWith('ao-vivo/'))).toBe(true)
    expect(c.removidos.flat().sort()).toEqual(['ao-vivo/nutrimax/2026-10-16.xlsx', 'ao-vivo/rioquality/2026-10-16.xlsx'])
    expect(c.removidos.flat().some(p => p.startsWith('fechados/'))).toBe(false)
  })
})
