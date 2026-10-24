import { describe, it, expect, vi } from 'vitest'
import { avisarRomaneioAusente, avisoRomaneioLigado, registrarChegadasDoDia, frotaEmRotaNoMonitoramento, lerManha, type DepsAvisoRomaneio } from './manha-servico'
import type { EstadoAvisoRomaneio } from './manha'

// F3-07: o "dia de teste sem romaneio gera o aviso às 06:30" do plano.
const AS_0631 = Date.parse('2026-10-21T09:31:00Z')

function deps(over: Partial<DepsAvisoRomaneio> = {}): DepsAvisoRomaneio & { gravados: EstadoAvisoRomaneio[]; enviados: [string, string][]; logs: string[] } {
  const gravados: EstadoAvisoRomaneio[] = []
  const enviados: [string, string][] = []
  const logs: string[] = []
  return {
    gravados, enviados, logs,
    lerEstado: async () => null,
    gravarEstado: async (_d, e) => { gravados.push(e); return true },
    faltando: async () => ['nutrimax', 'rioquality'],
    frota: async c => (c === 'nutrimax' ? 42 : 30),
    enviar: async (c, t) => { enviados.push([c, t]) },
    agoraMs: AS_0631,
    ligado: false,
    log: m => logs.push(m),
    ...over,
  }
}

describe('avisarRomaneioAusente (tick)', () => {
  it('21/10 06:31, sem romaneio da Nutry nem da RQ, frota rodando: aviso preparado, DM DESLIGADA por padrão, estado gravado para o banner', async () => {
    const d = deps()
    expect(await avisarRomaneioAusente('2026-10-21', d)).toBe('desligado')
    expect(d.enviados).toEqual([])
    expect(d.logs.join('\n')).toMatch(/KPI_AVISO_ROMANEIO_DM.*Nutry Max sem romaneio de hoje com 42 carros rodando/)
    expect(d.gravados).toEqual([{ marcos: { '06:30': { em: '2026-10-21T09:31:00.000Z', faltando: [{ cliente: 'nutrimax', emRota: 42 }, { cliente: 'rioquality', emRota: 30 }], dm: 'desligado' } } }])
  })

  it('ligado (KPI_AVISO_ROMANEIO_DM=1): DM ao dono com chave por dia e marco', async () => {
    const d = deps({ ligado: true })
    expect(await avisarRomaneioAusente('2026-10-21', d)).toBe('enviado')
    expect(d.enviados).toHaveLength(1)
    expect(d.enviados[0][0]).toBe('romaneio-ausente-2026-10-21-0630')
    expect(d.enviados[0][1]).toMatch(/^KPI 06:30: Nutry Max sem romaneio/)
  })

  it('marco já feito: o tick seguinte não repete', async () => {
    const d = deps({ lerEstado: async () => ({ marcos: { '06:30': { em: 'x', faltando: [], dm: null } } }), ligado: true })
    expect(await avisarRomaneioAusente('2026-10-21', d)).toBe('nada')
    expect(d.enviados).toEqual([])
    expect(d.gravados).toEqual([])
  })

  it('romaneio já chegou: grava o marco sem aviso; nem pergunta a frota', async () => {
    const frota = vi.fn(async () => 42)
    const d = deps({ faltando: async () => [], frota, ligado: true })
    expect(await avisarRomaneioAusente('2026-10-21', d)).toBe('nada')
    expect(frota).not.toHaveBeenCalled()
    expect(d.gravados[0].marcos['06:30']).toMatchObject({ faltando: [], dm: null })
  })

  it('domingo com a frota parada: sem aviso (S-06)', async () => {
    const d = deps({ faltando: async () => ['nutrimax'], frota: async () => 1, ligado: true })
    expect(await avisarRomaneioAusente('2026-10-19', d)).toBe('nada')
    expect(d.enviados).toEqual([])
  })

  it('antes das 06:30: nada', async () => {
    const d = deps({ agoraMs: Date.parse('2026-10-21T09:20:00Z') })
    expect(await avisarRomaneioAusente('2026-10-21', d)).toBe('nada')
    expect(d.gravados).toEqual([])
  })

  it('padrão lê a env: sem KPI_AVISO_ROMANEIO_DM fica desligado', () => {
    expect(avisoRomaneioLigado({})).toBe(false)
    expect(avisoRomaneioLigado({ KPI_AVISO_ROMANEIO_DM: '1' })).toBe(true)
  })
})

describe('ponte frota-em-rota', () => {
  it('pergunta com o cod do cliente e a chave; erro ou resposta estranha => null (desconhecida)', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ emRota: 42, semRomaneio: 42 })))
    expect(await frotaEmRotaNoMonitoramento('nutrimax', '2026-10-21', { fetch: fetchMock as never, env: { MOTOR_SECRET: 's', MONITORAMENTO_URL: 'http://mon' } })).toBe(42)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://mon/api/romaneio/frota-em-rota?data=2026-10-21&cod=4096')
    expect((init.headers as Record<string, string>)['x-motor-key']).toBe('s')
    const rq = vi.fn(async () => new Response('x', { status: 500 }))
    expect(await frotaEmRotaNoMonitoramento('rioquality', '2026-10-21', { fetch: rq as never, env: { MOTOR_SECRET: 's' } })).toBeNull()
    expect((rq.mock.calls[0] as unknown as [string])[0]).toContain('cod=598')
    expect(await frotaEmRotaNoMonitoramento('nutrimax', '2026-10-21', { fetch: fetchMock as never, env: {} })).toBeNull()
  })
})

// Cliente do banco falso: kpi_cache_dia e kpi_ao_vivo_dia em memória.
function banco(inicial: Record<string, unknown> = {}, dias: Record<string, unknown>[] = []) {
  const cache = new Map<string, unknown>(Object.entries(inicial))
  const upserts: Record<string, unknown>[] = []
  return {
    cache, upserts,
    from(tabela: string) {
      const filtros: Record<string, unknown> = {}
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => { filtros[c] = v; return b },
        in: (c: string, v: unknown[]) => { filtros[c] = v; return b },
        maybeSingle: async () => ({ data: cache.has(filtros.chave as string) ? { valor: cache.get(filtros.chave as string) } : null, error: null }),
        upsert: async (linha: Record<string, unknown>) => { upserts.push(linha); cache.set(linha.chave as string, linha.valor); return { error: null } },
        then: (res: (v: unknown) => unknown) => Promise.resolve({
          data: tabela === 'kpi_ao_vivo_dia' ? dias.filter(d => d.data === filtros.data && (filtros.cliente as string[]).includes(d.cliente as string)) : [],
          error: null,
        }).then(res),
      }
      return b
    },
  }
}

describe('registrarChegadasDoDia', () => {
  it('grava só quando chega parte nova', async () => {
    const db = banco()
    await registrarChegadasDoDia('nutrimax', '2026-10-22', { romaneio: [{}], pao: { linhas: [] }, escala_enviada: false, pao_enviado: false }, '2026-10-22T12:25:00Z', { cliente: () => db as never })
    expect(db.cache.get('chegadas-dia:nutrimax:2026-10-22')).toEqual({ romaneio: '2026-10-22T12:25:00Z' })
    await registrarChegadasDoDia('nutrimax', '2026-10-22', { romaneio: [{}], pao: { linhas: [] }, escala_enviada: false, pao_enviado: false }, '2026-10-22T13:00:00Z', { cliente: () => db as never })
    expect(db.upserts).toHaveLength(1)
  })
  it('falha do banco não lança (nunca derruba o envio do romaneio)', async () => {
    const quebrado = { from: () => { throw new Error('rede') } }
    await expect(registrarChegadasDoDia('nutrimax', '2026-10-22', { romaneio: [{}], pao: null, escala_enviada: false, pao_enviado: false }, 'x', { cliente: () => quebrado as never })).resolves.toBeUndefined()
  })
})

describe('lerManha (tela)', () => {
  it('checklist + banner do aviso enquanto o romaneio da Nutry não chega', async () => {
    const db = banco({
      'chegadas-dia:rioquality:2026-10-21': { romaneio: '2026-10-21T08:01:00Z' },
      'aviso-romaneio:2026-10-21': { marcos: { '06:30': { em: 'x', faltando: [{ cliente: 'nutrimax', emRota: 42 }], dm: 'desligado' } } },
    }, [{ cliente: 'rioquality', data: '2026-10-21', romaneio: [{}], pao: null, escala_enviada: false, pao_enviado: false, enviado_em: '2026-10-21T08:01:00Z' }])
    const m = await lerManha(['nutrimax', 'rioquality'], '2026-10-21', { cliente: () => db as never })
    expect(m.itens.map(i => [i.chave, i.ok, i.hora])).toEqual([['romaneio', false, null], ['pao', false, null], ['escala', false, null], ['rq', true, '05:01']])
    expect(m.banners).toEqual([{ cliente: 'nutrimax', texto: 'Motor de desvio sem romaneio da Nutry Max hoje: 42 carros rodando às 06:30.' }])
  })
})
