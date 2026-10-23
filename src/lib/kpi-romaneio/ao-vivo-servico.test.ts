import { describe, it, expect, vi, beforeEach } from 'vitest'

const c = vi.hoisted(() => ({
  dia: null as Record<string, unknown> | null,
  travaLinhas: [] as unknown[],
  gerou: 0,
  updates: [] as Record<string, unknown>[],
  // F1-11: o que gerarKpiNutrimax devolve (null = lanca erro).
  resultadoNutry: null as null | Record<string, unknown>,
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
      if (tabela === 'kpi_ao_vivo_dia') return cadeia({ data: c.dia, error: null })
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
  gerarKpiNutrimax: async () => { c.gerou++; if (!c.resultadoNutry) throw new Error('nao deveria gerar'); return c.resultadoNutry },
}))
vi.mock('./resumo-dashboard', () => ({ extrairKpiCompleto: async () => ({ data: null, resumo: { cargas: [], taxa: 96.9, entregues: 0, nfsNaConta: 0 }, nfs: [] }) }))

import { calcularAoVivo } from './ao-vivo-servico'

beforeEach(() => {
  c.dia = { romaneio: [{ nf: '1' }], escala: [], pao: { linhas: [], escala: [] }, escala_enviada: false, pao_enviado: false }
  c.travaLinhas = []
  c.gerou = 0
  c.updates = []
  c.resultadoNutry = null
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
  it('conferencia ok: sem aviso e sem mexer em ultimo_erro', async () => {
    c.travaLinhas = [{ cliente: 'nutrimax' }]
    c.resultadoNutry = { xlsx: Buffer.from(''), qtdCargasNutry: 0 }
    expect(await calcularAoVivo('nutrimax', '2026-10-22')).toBe('ok')
    const u = c.updates.find(x => 'resultado' in x) as { resultado: { avisos?: string[] } }
    expect(u.resultado.avisos).toBeUndefined()
    expect('ultimo_erro' in u).toBe(false)
  })
})

