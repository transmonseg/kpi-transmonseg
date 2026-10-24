import { describe, it, expect, vi, beforeEach } from 'vitest'

const c = vi.hoisted(() => ({
  dia: null as Record<string, unknown> | null,
  travaLinhas: [] as unknown[],
  gerou: 0,
  updates: [] as Record<string, unknown>[],
  // F1-11: o que gerarKpiNutrimax devolve (null = lanca erro).
  resultadoNutry: null as null | Record<string, unknown>,
  // F1-03: o que a geração entrega ao aoMontarDetalhe (null = não chama).
  detalhe: null as null | Record<string, unknown>,
  trocas: [] as Record<string, unknown>[],
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
      if (tabela === 'kpi_ao_vivo_dia') return cadeia({ data: c.dia, error: null })
      if (tabela === 'kpi_troca_placa') return cadeia({ data: c.trocas, error: null })
      const o = cadeia({ data: null, error: null }) as Record<string, (...a: unknown[]) => unknown>
      o.update = (v: unknown) => {
        c.updates.push(v as Record<string, unknown>)
        return cadeia({ data: c.travaLinhas, error: null })
      }
      return o
    },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  }),
}))
vi.mock('./gerar-nutrimax', () => ({
  gerarKpiNutrimax: async (_e: unknown, op?: { aoMontarDetalhe?: (x: unknown) => void }) => {
    c.gerou++
    if (!c.resultadoNutry) throw new Error('nao deveria gerar')
    if (c.detalhe) op?.aoMontarDetalhe?.(c.detalhe)
    return c.resultadoNutry
  },
}))
// F2-13: a versao das regras vem do git; no teste, fixa.
vi.mock('./versao-regras', () => ({ versaoDasRegras: () => '0f495b4' }))
vi.mock('./resumo-dashboard', () => ({ extrairKpiCompleto: async () => ({ data: null, resumo: { cargas: [], taxa: 96.9, entregues: 0, nfsNaConta: 0 }, nfs: [] }) }))

import { calcularAoVivo } from './ao-vivo-servico'

beforeEach(() => {
  c.dia = { romaneio: [{ nf: '1' }], escala: [], pao: { linhas: [], escala: [] }, escala_enviada: false, pao_enviado: false }
  c.travaLinhas = []
  c.gerou = 0
  c.updates = []
  c.resultadoNutry = null
  c.detalhe = null
  c.trocas = []
})

describe('calcularAoVivo', () => {
  it('sem romaneio do dia: não calcula', async () => {
    c.dia = null
    expect(await calcularAoVivo('nutrimax', '2026-10-06')).toBe('sem_romaneio')
    expect(c.gerou).toBe(0)
  })
  it('outro cálculo rodando (trava não pega): não calcula', async () => {
    c.travaLinhas = []
    expect(await calcularAoVivo('nutrimax', '2026-10-06')).toBe('ocupado')
    expect(c.gerou).toBe(0)
  })
  it('erro no cálculo: grava o erro e solta a trava', async () => {
    c.travaLinhas = [{ cliente: 'nutrimax' }]
    expect(await calcularAoVivo('nutrimax', '2026-10-06')).toBe('erro')
    expect(c.gerou).toBe(1)
    expect(c.updates.at(-1)).toMatchObject({ ultimo_erro: 'nao deveria gerar', rodando_desde: null })
  })
})

// F1-11 (KN-08): fechamento de 22/10 sem a conferencia de territorio, calado.
// Agora o resultado sai (a taxa nao muda), com o aviso na tela e em ultimo_erro
// (marca que o tick usa para repetir as 05:30).
describe('calcularAoVivo: conferencia de endereco indisponivel (F1-11)', () => {
  it('publica o resultado com o aviso e grava ultimo_erro com o mesmo instante do calculo', async () => {
    const { AVISO_TERRITORIO_AO_VIVO } = await import('./ao-vivo')
    c.travaLinhas = [{ cliente: 'nutrimax' }]
    c.resultadoNutry = { xlsx: Buffer.from(''), qtdCargasNutry: 0, territorioIndisponivel: true }
    expect(await calcularAoVivo('nutrimax', '2026-10-22')).toBe('ok')
    const u = c.updates.find(x => 'resultado' in x) as { resultado: { avisos?: string[]; calculadoEm: string }; ultimo_erro?: string; ultimo_erro_em?: string }
    expect(u.resultado.avisos?.[0]).toContain('Conferência de endereço indisponível')
    expect(u.ultimo_erro?.startsWith(AVISO_TERRITORIO_AO_VIVO)).toBe(true)
    expect(u.ultimo_erro_em).toBe(u.resultado.calculadoEm)
  })
  it('F2-13: o resultado gravado carrega a versao das regras', async () => {
    c.travaLinhas = [{ cliente: 'nutrimax' }]
    c.resultadoNutry = { xlsx: Buffer.from(''), qtdCargasNutry: 0 }
    expect(await calcularAoVivo('nutrimax', '2026-10-22')).toBe('ok')
    const u = c.updates.find(x => 'resultado' in x) as { resultado: { versaoRegras?: string | null } }
    expect(u.resultado.versaoRegras).toBe('0f495b4')
  })
  it('conferencia ok: sem aviso e sem mexer em ultimo_erro', async () => {
    c.travaLinhas = [{ cliente: 'nutrimax' }]
    c.resultadoNutry = { xlsx: Buffer.from(''), qtdCargasNutry: 0 }
    expect(await calcularAoVivo('nutrimax', '2026-10-22')).toBe('ok')
    const u = c.updates.find(x => 'resultado' in x) as { resultado: { avisos?: string[] } }
    expect(u.resultado.avisos).toBeUndefined()
    expect('ultimo_erro' in u).toBe(false)
  })
})


// F1-03 (KN-01): o sugeridor só rodava com o dia de HOJE (some depois das
// 00:30) e pulava a carga sem placa. Agora roda também em dia fechado, e a
// "Placas do dia" lê as sugestões do resultado gravado.
describe('calcularAoVivo: sugestões de troca (F1-02/F1-03)', () => {
  const M = 1 / 111_195
  const ends = [0, 1, 2].map(i => ({ lat: -22.92 + i * 2000 * M, lng: -43.23 }))
  const parada = (lat: number, lng: number) => ({ id: `${lat}`, placa_norm: 'RQM4C16', classificacao: 'FORA_BASE', lat, lng, chegada: '2026-10-22T10:00:00Z', saida: '2026-10-22T10:05:00Z' })
  it('dia fechado com carga do pão sem placa: grava a sugestão (com histórico da mesma carga)', async () => {
    c.travaLinhas = [{ cliente: 'nutrimax' }]
    c.resultadoNutry = { xlsx: Buffer.from(''), qtdCargasNutry: 0 }
    c.trocas = [{ data: '2026-10-13', carga: 'PAO-6', placa_escala: 'TTI6E49', placa_real: 'RQM4C16' }]
    c.detalhe = {
      romaneioGeo: ends.map((e, i) => ({ carga: 'PAO-6', placa: '', endereco: `RUA ${i}`, nf: `${i}`, ...e })),
      detalhe: [], menorDistanciaTrajetoPorNf: new Map(), frota: ['RQM4C16'],
      paradasPorPlaca: new Map([['RQM4C16', ends.map(e => parada(e.lat, e.lng))]]),
    }
    expect(await calcularAoVivo('nutrimax', '2026-10-01')).toBe('ok')
    const u = c.updates.find(x => 'resultado' in x) as { resultado: { sugestoesTroca?: unknown[] } }
    expect(u.resultado.sugestoesTroca).toEqual([expect.objectContaining({ carga: 'PAO-6', placaEscala: '', placaSugerida: 'RQM4C16', motivo: 'sem_placa', confirmadaAntes: 1 })])
  })
})
