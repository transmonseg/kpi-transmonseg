import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

// F2-03 (GEO-22, KRQ-04, ACH-05): o callback que enche ponto e parada so' era
// passado pra Nutry. Desde 20/10, 0 de 11.382 NFs da RQ com lat e 3.404
// investigacoes com GPS "sem_coordenada" ("Cliente sem coordenada -- Endereco
// nao localizado no mapa"), embora o log do mesmo calculo dissesse
// sem_candidato 0. Caso real: TTU9G22 em 23/10.
const c = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
  detalheRq: null as null | Record<string, unknown>,
  nfs: [] as Record<string, unknown>[],
}))

function cadeia(resultado: unknown) {
  const o: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'or', 'update', 'upsert']) o[m] = () => o
  o.maybeSingle = async () => resultado
  o.then = (res: (v: unknown) => void) => res(resultado)
  return o
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (tabela: string) => {
      if (tabela === 'kpi_ao_vivo_dia') return cadeia({ data: { romaneio: [{ placaNorm: 'TTU9G22', rua: 'RUA RODRIGUES ALVES' }] }, error: null })
      const o = cadeia({ data: null, error: null }) as Record<string, (...a: unknown[]) => unknown>
      o.update = (v: unknown) => {
        c.updates.push(v as Record<string, unknown>)
        return cadeia({ data: [{ cliente: 'rioquality' }], error: null })
      }
      return o
    },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  }),
}))
vi.mock('@/lib/kpi-rioquality/pipeline', () => ({
  gerarKpiRioQuality: async (params: { aoMontarDetalhe?: (x: unknown) => void }) => {
    if (c.detalheRq) params.aoMontarDetalhe?.(c.detalheRq)
    return { xlsx: Buffer.from(''), linhasKpi: [], detalhe: [], avisos: [], coerenciaFalhou: 0 }
  },
}))
vi.mock('@/lib/kpi-rioquality/frota', () => ({ buscarFrotaRioQuality: async () => new Map([['TTU9G22', '9']]) }))
vi.mock('./versao-regras', () => ({ versaoDasRegras: () => 'teste' }))
vi.mock('./resumo-dashboard', () => ({ extrairKpiCompleto: async () => ({ data: null, resumo: { cargas: [{ carga: '9001', placa: 'TTU9G22', motorista: 'M', destino: 'SERRA', saida: '06:24', chegada: '17:38', km: 320 }], taxa: 96.9, entregues: 1, nfsNaConta: 2 }, nfs: c.nfs }) }))

import { calcularAoVivo } from './ao-vivo-servico'

const parada = (id: string, chegada: string, fim: string, lat: number, lng: number, classificacao = 'FORA_BASE'): UnitracParadaRow => ({
  id: `TTU9G22-${id}`, placa_norm: 'TTU9G22', chegada: `2026-10-23T${chegada}.000Z`, saida: `2026-10-23T${fim}.000Z`, fim_real: `2026-10-23T${fim}.000Z`,
  duracao_seg: 0, local_parada: '', codigo_loja: null, nome_loja: null, lat, lng, classificacao, ordem: 0,
})
const PARADAS = [
  parada('api-1', '06:21:40', '06:24:40', -22.81593, -43.342, 'BASE'),
  parada('api-13', '12:48:52', '13:17:09', -22.314925, -42.3321549),
  parada('api-18', '14:26:06', '14:30:06', -22.3514766, -42.39112),
  parada('api-22', '17:38:07', '23:53:07', -22.8143116, -43.3439166, 'BASE'),
]
const NFS = [
  { placa: 'TTU9G22', carga: '9001', nf: '5558903', cliente: 'ANTONIO ROGERIO FERREIRA DA SILVA', endereco: 'RUA RODRIGUES ALVES - SAO PEDRO DA SERRA, NOVA FRIBURGO', chegada: '12:48', saida: '13:17', tempoMin: 28, status: 'ENTREGUE', categoria: null },
  { placa: 'TTU9G22', carga: '9001', nf: '5558931', cliente: 'GRILICO COMERCIAL DE FRIBURGO LTDA', endereco: 'ESTRADA MURY MACAE DE CIMA - QUINTO DISTRITO, NOVA FRIBURGO', chegada: null, saida: null, tempoMin: null, status: 'SEM CONFIRMAÇÃO', categoria: 'Sem confirmação' },
]
const geo = (lat5558931: number | null) => [
  { nf: '5558903', carga: '9001', placa: 'TTU9G22', endereco: '', lat: -22.314978, lng: -42.332158 },
  { nf: '5558931', carga: '9001', placa: 'TTU9G22', endereco: '', lat: lat5558931, lng: lat5558931 == null ? null : -42.4815298 },
]
const DETALHE = [
  { nf: '5558903', placa: 'TTU9G22', chegada: '2026-10-23T12:48:52.000Z', status: 'confirmado_gps' },
  { nf: '5558931', placa: 'TTU9G22', chegada: null, status: 'pendente' },
]

type Gravado = { resultado: { calculadoEm: string; avisos?: string[]; placas: { nfs: { nf: string; lat: number | null; parada?: { lat: number; lng: number } | null; investigacao?: { categoria: string } }[] }[] }; ultimo_erro?: string; ultimo_erro_em?: string }

beforeEach(() => {
  c.updates = []; c.nfs = NFS; c.detalheRq = null
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-24T10:00:00-03:00'))
})
afterEach(() => { vi.useRealTimers() })

describe('F2-03: Ao vivo da RQ com ponto, parada e investigação', () => {
  it('TTU9G22 23/10: NF com lat e parada da entrega; não entregue investigada pelo ponto, não "sem_coordenada"', async () => {
    c.detalheRq = { romaneioGeo: geo(-22.3842593), detalhe: DETALHE, paradasPorPlaca: new Map([['TTU9G22', PARADAS]]), menorDistanciaTrajetoPorNf: new Map() }
    expect(await calcularAoVivo('rioquality', '2026-10-23')).toBe('ok')
    const g = c.updates.find(u => 'resultado' in u) as unknown as Gravado
    const nfs = g.resultado.placas[0].nfs
    const entregue = nfs.find(n => n.nf === '5558903')!
    expect(entregue.lat).toBe(-22.314978)
    expect(entregue.parada).toEqual({ lat: -22.314925, lng: -42.3321549 })
    const pendente = nfs.find(n => n.nf === '5558931')!
    expect(pendente.lat).toBe(-22.3842593)
    expect(pendente.investigacao?.categoria).toBe('nao_chegou_perto')
    expect(g.ultimo_erro).toBeUndefined()
    expect(g.resultado.avisos ?? []).toEqual([])
  })

  it('alarme de falha silenciosa: cliente que termina com 100% das NFs sem coordenada registra erro e aviso', async () => {
    // O que acontecia em produção: nenhum ponto chega ao Ao vivo.
    c.detalheRq = { romaneioGeo: [], detalhe: DETALHE, paradasPorPlaca: new Map([['TTU9G22', PARADAS]]), menorDistanciaTrajetoPorNf: new Map() }
    expect(await calcularAoVivo('rioquality', '2026-10-23')).toBe('ok')
    const g = c.updates.find(u => 'resultado' in u) as unknown as Gravado
    expect(g.resultado.placas[0].nfs.every(n => n.lat == null)).toBe(true)
    expect(g.resultado.avisos?.some(a => /sem coordenada/i.test(a))).toBe(true)
    expect(String(g.ultimo_erro)).toMatch(/sem coordenada/i)
    // Mesmo instante do cálculo: a tela não mostra "o cálculo falhou".
    expect(g.ultimo_erro_em).toBe(g.resultado.calculadoEm)
  })

  it('uma NF sem coordenada entre outras com ponto não dispara o alarme', async () => {
    c.detalheRq = { romaneioGeo: geo(null), detalhe: DETALHE, paradasPorPlaca: new Map([['TTU9G22', PARADAS]]), menorDistanciaTrajetoPorNf: new Map() }
    expect(await calcularAoVivo('rioquality', '2026-10-23')).toBe('ok')
    const g = c.updates.find(u => 'resultado' in u) as unknown as Gravado
    expect(g.resultado.placas[0].nfs.find(n => n.nf === '5558931')!.investigacao?.categoria).toBe('sem_coordenada')
    expect(g.ultimo_erro).toBeUndefined()
  })
})

// F2-REV-04 (revisao independente da Fase 2): o ponto do fallback do
// monitoramento (pipeline.ts: geoConfiavel=false, precisao 'rua' -- nao
// sustenta NAO FOI no KPI) chegava ao Ao vivo como qualquer outro. A
// investigacao afirmava "Nao chegou perto (mais de 2 km) -- O carro nao passou
// no cliente" sobre esse ponto, e o alarme contava o dia como "com coordenada".
// Caso: a mesma NF 5558931 (TTU9G22 23/10) com o ponto vindo do fallback.
describe('F2-REV-04: ponto não confiável no Ao vivo da RQ', () => {
  const geoImpreciso = (todas: boolean) => geo(-22.3842593).map(l => (todas || l.nf === '5558931' ? { ...l, geoConfiavel: false, geoPrecisao: 'rua' } : l))
  it('5558931 com ponto do fallback (geoConfiavel=false): não afirma "não chegou perto"', async () => {
    c.detalheRq = { romaneioGeo: geoImpreciso(false), detalhe: DETALHE, paradasPorPlaca: new Map([['TTU9G22', PARADAS]]), menorDistanciaTrajetoPorNf: new Map() }
    expect(await calcularAoVivo('rioquality', '2026-10-23')).toBe('ok')
    const g = c.updates.find(u => 'resultado' in u) as unknown as Gravado
    const pendente = g.resultado.placas[0].nfs.find(n => n.nf === '5558931')!
    expect(pendente.investigacao?.categoria).not.toBe('nao_chegou_perto')
    expect(pendente.investigacao?.categoria).toBe('ponto_impreciso')
    expect(g.ultimo_erro).toBeUndefined()
  })
  it('todas as NFs só com ponto não confiável: o alarme dispara (ponto não confiável não conta como "com coordenada")', async () => {
    c.detalheRq = { romaneioGeo: geoImpreciso(true), detalhe: DETALHE, paradasPorPlaca: new Map([['TTU9G22', PARADAS]]), menorDistanciaTrajetoPorNf: new Map() }
    expect(await calcularAoVivo('rioquality', '2026-10-23')).toBe('ok')
    const g = c.updates.find(u => 'resultado' in u) as unknown as Gravado
    expect(g.resultado.avisos?.some(a => /ponto confiável/i.test(a))).toBe(true)
    expect(String(g.ultimo_erro)).toMatch(/ponto confiável/i)
  })
})
