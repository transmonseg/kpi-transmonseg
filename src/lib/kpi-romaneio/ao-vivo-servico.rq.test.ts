import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// RQ-08 (auditoria 20/10): a ponte de coerencia do monitoramento respondendo
// 500 derrubava 80-100 entregues entre um calculo e outro do Ao vivo da RQ.
const c = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
  resultadoAnterior: null as unknown,
  coerenciaFalhou: 0,
  frotaErro: null as Error | null,
  pipelineChamado: 0,
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
      if (tabela === 'kpi_ao_vivo_dia') return cadeia({ data: { romaneio: [{ placaNorm: 'AAA1A11', rua: 'RUA A' }] }, error: null })
      const o = cadeia({ data: c.resultadoAnterior ? { resultado: c.resultadoAnterior, calculado_em: '2026-10-20T12:00:00Z' } : null, error: null }) as Record<string, (...a: unknown[]) => unknown>
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
  gerarKpiRioQuality: async () => (c.pipelineChamado++, { xlsx: Buffer.from(''), linhasKpi: [], detalhe: [], avisos: [], coerenciaFalhou: c.coerenciaFalhou }),
}))
vi.mock('@/lib/kpi-rioquality/frota', () => ({
  buscarFrotaRioQuality: async () => { if (c.frotaErro) throw c.frotaErro; return new Map([['AAA1A11', '1']]) },
}))
vi.mock('./resumo-dashboard', () => ({ extrairKpiCompleto: async () => ({ data: null, resumo: { cargas: [] }, nfs: [] }) }))

import { calcularAoVivo } from './ao-vivo-servico'

// Data fixa: '2026-10-20' fora das 48h fazia o calculo ir pelo snapshot
// (foraDoAlcanceApi) e o teste quebrou sozinho em 23/10.
beforeEach(() => { c.updates = []; c.resultadoAnterior = null; c.coerenciaFalhou = 0; c.frotaErro = null; c.pipelineChamado = 0; vi.setSystemTime(new Date('2026-10-20T15:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

describe('RQ-08: ponte de coerencia fora nao publica resultado degradado', () => {
  it('com resultado anterior do dia: mantem o anterior e grava o erro', async () => {
    c.resultadoAnterior = { placas: [] }
    c.coerenciaFalhou = 12
    expect(await calcularAoVivo('rioquality', '2026-10-20')).toBe('erro')
    expect(c.updates.some(u => 'resultado' in u)).toBe(false)
    expect(String(c.updates.at(-1)?.ultimo_erro)).toContain('coerência')
  })

  // F2-14 (RQ-08, revisao Fases 3-4): a trava mantinha QUALQUER anterior --
  // um anterior que ja' tinha saido degradado (primeiro tick do dia com a
  // ponte fora) ficava preso no lugar de um calculo mais novo e igualmente
  // degradado. Agora so' o ultimo BOM segura.
  it('anterior tambem degradado: publica o novo (mais recente), marcado e com o erro', async () => {
    c.resultadoAnterior = { placas: [], degradado: 'ponte de coerência do monitoramento falhou em 200 rua(s)' }
    c.coerenciaFalhou = 200
    expect(await calcularAoVivo('rioquality', '2026-10-20')).toBe('ok')
    const gravado = c.updates.find(u => 'resultado' in u)!
    expect((gravado.resultado as { degradado?: string }).degradado).toContain('200 rua(s)')
    expect(String(gravado.ultimo_erro)).toContain('coerência')
  })

  // F2-14 (RQ-08): degradado sem anterior saia sem ultimo_erro e sem aviso --
  // a tela mostrava a taxa baixa como se estivesse completa.
  it('sem anterior: publica marcado como degradado, com aviso na tela e ultimo_erro no mesmo instante', async () => {
    c.coerenciaFalhou = 200
    expect(await calcularAoVivo('rioquality', '2026-10-20')).toBe('ok')
    const gravado = c.updates.find(u => 'resultado' in u)!
    const resultado = gravado.resultado as { degradado?: string; avisos?: string[]; calculadoEm: string }
    expect(resultado.degradado).toContain('coerência')
    expect(resultado.avisos?.some(a => a.includes('coerência'))).toBe(true)
    expect(String(gravado.ultimo_erro)).toContain('coerência')
    expect(gravado.ultimo_erro_em).toBe(resultado.calculadoEm)
  })

  it('calculo bom nao leva marca de degradado', async () => {
    c.resultadoAnterior = { placas: [], degradado: 'x' }
    expect(await calcularAoVivo('rioquality', '2026-10-20')).toBe('ok')
    const gravado = c.updates.find(u => 'resultado' in u)!
    expect((gravado.resultado as { degradado?: string }).degradado).toBeUndefined()
  })
})

// F1-12 (KRQ-09): frota da RQ ilegivel nao pode virar "todas sem rastreador"
// (contadas como corretas, taxa ~100%). O calculo falha, o resultado anterior
// fica e o motivo vai para ultimo_erro.
describe('F1-12: falha ao ler a frota da RQ', () => {
  it('buscarFrotaRioQuality lancando: calcularAoVivo devolve erro, nao grava taxa e grava ultimo_erro', async () => {
    c.resultadoAnterior = { placas: [] }
    c.frotaErro = new Error('frota da Rio Quality indisponivel: statement timeout')
    expect(await calcularAoVivo('rioquality', '2026-10-20')).toBe('erro')
    expect(c.pipelineChamado).toBe(0)
    expect(c.updates.some(u => 'resultado' in u)).toBe(false)
    expect(String(c.updates.at(-1)?.ultimo_erro)).toContain('frota da Rio Quality')
  })
})
