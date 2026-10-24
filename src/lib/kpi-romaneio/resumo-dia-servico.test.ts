import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ResultadoAoVivo } from './ao-vivo-servico'

// F3-R03: carregarResumoDia não trata como final um dia passado degradado,
// com fonte que não leu ou cujo último cálculo não é o fechamento das 00:30;
// e os dias anteriores degradados ficam fora da comparação.

const db = vi.hoisted(() => ({
  doDia: null as { resultado: unknown } | null,
  anteriores: [] as { data: string; resumo: unknown; placas: unknown; versaoRegras: string | null; degradado: string | null }[],
  hoje: '2026-10-24',
  estadoHoje: null as unknown,
}))

vi.mock('@/lib/data-br', () => ({ hojeBR: () => db.hoje }))
vi.mock('@/lib/kpi-rioquality/frota', () => ({ buscarFrotaRioQuality: async () => new Map() }))
vi.mock('./placas-sem-rastreador', () => ({ buscarPlacasSemRastreador: async () => [], placasProvisoriasNoDia: () => new Set() }))
vi.mock('./ao-vivo-historico', () => ({ lerDiaHistorico: async () => null }))
vi.mock('./ao-vivo-servico', () => ({
  lerEstadoAoVivo: async () => ({ resultado: db.estadoHoje }),
  NOME_CLIENTE_AO_VIVO: { nutrimax: 'Nutry Max', rioquality: 'Rio Quality' },
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => {
      let lt = false
      const q = {
        select: () => q, eq: () => q, gte: () => q, order: () => q, not: () => q,
        lt: () => { lt = true; return q },
        limit: async () => ({ data: lt ? db.anteriores : [], error: null }),
        maybeSingle: async () => ({ data: db.doDia, error: null }),
      }
      return q
    },
  }),
}))

import { carregarResumoDia } from './resumo-dia-servico'

const resumoOk = { taxa: 91.4, entregues: 2633, nfsNaConta: 2881, aguardando: 0, totalNfs: 2881, feitas: 2633, pct: 91 }
const resultado = (extra: Partial<ResultadoAoVivo> = {}): ResultadoAoVivo => ({ calculadoEm: '2026-10-23T03:30:00.000Z', resumo: resumoOk, placas: [], ...extra })
const DEGRADADO = 'ponte de coerência do monitoramento falhou em 37 rua(s)'
const AVISO_DEGRADADO = `Cálculo incompleto: ${DEGRADADO}. Entregas confirmadas pela rua podem estar faltando; o próximo cálculo tenta de novo.`
const AVISO_FONTE = 'Não consegui ler as resoluções da operação neste cálculo — o resultado pode estar incompleto. O próximo cálculo tenta de novo.'

beforeEach(() => {
  db.doDia = null; db.anteriores = []; db.hoje = '2026-10-24'; db.estadoHoje = null
})

describe('carregarResumoDia — dia passado (F3-R03)', () => {
  it('RQ 22/10 degradado: resumo marcado incompleto e o aviso vai à tela', async () => {
    db.doDia = { resultado: resultado({ degradado: DEGRADADO, avisos: [AVISO_DEGRADADO] }) }
    const c = (await carregarResumoDia('rioquality', '2026-10-22'))!
    expect(c.resumo.ressalvas).toEqual([AVISO_DEGRADADO])
    expect(c.avisos).toContain(AVISO_DEGRADADO)
    expect(c.texto.split('\n')[0]).toContain('(cálculo incompleto, não oficial)')
  })
  it('Nutry com fonte que não leu: incompleto', async () => {
    db.doDia = { resultado: resultado({ avisos: [AVISO_FONTE] }) }
    const c = (await carregarResumoDia('nutrimax', '2026-10-22'))!
    expect(c.resumo.ressalvas).toEqual([AVISO_FONTE])
    expect(c.avisos).toContain(AVISO_FONTE)
  })
  it('fechamento das 00:30 não rodou (último cálculo 22/10 21:00, nada aguardando): não oficial', async () => {
    db.doDia = { resultado: resultado({ calculadoEm: '2026-10-23T00:00:00.000Z' }) }
    const c = (await carregarResumoDia('nutrimax', '2026-10-22'))!
    expect(c.resumo.ressalvas).toHaveLength(1)
    expect(c.resumo.ressalvas[0]).toMatch(/não é o fechamento/i)
    expect(c.resumo.ressalvas[0]).toContain('22/10 às 21:00')
    expect(c.avisos).toContain(c.resumo.ressalvas[0])
    expect(c.texto.split('\n')[0]).toContain('não oficial')
  })
  it('fechamento completo (05:30 CEST): sem ressalva', async () => {
    db.doDia = { resultado: resultado() }
    const c = (await carregarResumoDia('nutrimax', '2026-10-22'))!
    expect(c.resumo.ressalvas).toEqual([])
    expect(c.texto.split('\n')[0]).toBe('Resumo do dia — Nutry Max — 22/10/2026')
  })
  it('aviso que não muda a taxa aparece na tela, sem marcar incompleto', async () => {
    const frota = 'Placa(s) do relatório fora do cadastro de rastreadores da Rio Quality: KZA2F01 (18 NFs).'
    db.doDia = { resultado: resultado({ avisos: [frota] }) }
    const c = (await carregarResumoDia('rioquality', '2026-10-22'))!
    expect(c.resumo.ressalvas).toEqual([])
    expect(c.avisos).toContain(frota)
  })
  it('dias anteriores degradados ficam fora de "Dia anterior" e da média', async () => {
    db.doDia = { resultado: resultado() }
    db.anteriores = [
      { data: '2026-10-21', resumo: { ...resumoOk, taxa: 60 }, placas: [], versaoRegras: null, degradado: DEGRADADO },
      { data: '2026-10-20', resumo: { ...resumoOk, taxa: 84.2 }, placas: [], versaoRegras: null, degradado: null },
    ]
    const c = (await carregarResumoDia('rioquality', '2026-10-22'))!
    expect(c.resumo.comparacao.ontem).toEqual({ data: '2026-10-20', taxa: 84.2 })
    expect(c.resumo.comparacao.semana).toEqual({ media: 84.2, dias: 1 })
  })
})

describe('carregarResumoDia — hoje', () => {
  it('cálculo de hoje degradado também leva a ressalva; não cobra fechamento', async () => {
    db.estadoHoje = resultado({ calculadoEm: '2026-10-24T15:00:00.000Z', degradado: DEGRADADO, avisos: [AVISO_DEGRADADO], resumo: { ...resumoOk, aguardando: 10 } })
    const c = (await carregarResumoDia('rioquality', '2026-10-24'))!
    expect(c.resumo.ressalvas).toEqual([AVISO_DEGRADADO])
  })
  it('hoje completo e em curso: só "(parcial)"', async () => {
    db.estadoHoje = resultado({ calculadoEm: '2026-10-24T15:00:00.000Z', resumo: { ...resumoOk, aguardando: 10 } })
    const c = (await carregarResumoDia('rioquality', '2026-10-24'))!
    expect(c.resumo.ressalvas).toEqual([])
    expect(c.texto.split('\n')[0]).toContain('(parcial)')
  })
})
