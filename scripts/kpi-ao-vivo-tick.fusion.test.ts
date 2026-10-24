import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/lib/kpi-rioquality/fonte-fusion', () => ({ buscarDiaRioQualityFusion: vi.fn() }))
const guardar = vi.fn(async () => {})
const fonteDoDia = vi.fn(async (): Promise<string | null> => null)
vi.mock('../src/lib/kpi-romaneio/ao-vivo-servico', () => ({
  guardarDiaAoVivo: (...a: unknown[]) => (guardar as (...x: unknown[]) => unknown)(...a),
  fonteDoDiaAoVivo: (...a: unknown[]) => (fonteDoDia as (...x: unknown[]) => unknown)(...a),
  calcularAoVivo: vi.fn(),
  limparXlsxAoVivo: vi.fn(),
  CLIENTES_AO_VIVO: [],
}))

const registrar = vi.fn(async (..._a: unknown[]) => null)
vi.mock('../src/lib/kpi-rioquality/status-fusion-banco', () => ({
  registrarSyncFusion: (...a: unknown[]) => registrar(...a),
  lerStatusFusion: vi.fn(async () => null),
  gravarStatusFusion: vi.fn(async () => true),
}))

import { buscarDiaRioQualityFusion } from '../src/lib/kpi-rioquality/fonte-fusion'

describe('sincronizarFusionRioQuality', () => {
  beforeEach(() => guardar.mockClear())

  it('erro na Fusion não derruba o tick', async () => {
    vi.mocked(buscarDiaRioQualityFusion).mockRejectedValue(new Error('timeout'))
    const { sincronizarFusionRioQuality } = await import('./kpi-ao-vivo-tick')
    await expect(sincronizarFusionRioQuality('2026-10-10')).resolves.toBe('erro')
  })

  it('sem dados -> sem_dados e não grava', async () => {
    vi.mocked(buscarDiaRioQualityFusion).mockResolvedValue([])
    const { sincronizarFusionRioQuality } = await import('./kpi-ao-vivo-tick')
    expect(await sincronizarFusionRioQuality('2026-10-10')).toBe('sem_dados')
    expect(guardar).not.toHaveBeenCalled()
  })

  // Auditoria 20/10 (RQ-10): a planilha subida a mao (com bairro e NF real) e'
  // o unico contorno do endereco sem bairro da Fusion -- o tick nao pode
  // trocar ela pela versao da Fusion 10 min depois.
  it('dia com romaneio subido a mao (fonte manual): nao sobrescreve', async () => {
    vi.mocked(buscarDiaRioQualityFusion).mockResolvedValue([{ nf: '1' }] as never)
    fonteDoDia.mockResolvedValueOnce('manual')
    const { sincronizarFusionRioQuality } = await import('./kpi-ao-vivo-tick')
    expect(await sincronizarFusionRioQuality('2026-10-10')).toBe('manual')
    expect(guardar).not.toHaveBeenCalled()
  })
})

// F2-05 (KRQ-05): o status da sincronizacao fica gravado (antes so' o log).
describe('F2-05: status da sincronizacao com a Fusion', () => {
  beforeEach(() => { registrar.mockClear(); fonteDoDia.mockReset(); fonteDoDia.mockResolvedValue(null) })

  it('21/10: "TypeError: fetch failed" grava situacao erro com a mensagem', async () => {
    vi.mocked(buscarDiaRioQualityFusion).mockRejectedValue(new TypeError('fetch failed'))
    const { sincronizarFusionRioQuality } = await import('./kpi-ao-vivo-tick')
    expect(await sincronizarFusionRioQuality('2026-10-21')).toBe('erro')
    expect(registrar).toHaveBeenCalledWith('2026-10-21', expect.objectContaining({ situacao: 'erro', erro: 'TypeError: fetch failed' }))
  })

  it('23/10: dia manual grava "manual" (antes: 0 tentativas e nenhum registro)', async () => {
    fonteDoDia.mockResolvedValueOnce('manual')
    const { sincronizarFusionRioQuality } = await import('./kpi-ao-vivo-tick')
    expect(await sincronizarFusionRioQuality('2026-10-23')).toBe('manual')
    expect(registrar).toHaveBeenCalledWith('2026-10-23', expect.objectContaining({ situacao: 'manual' }))
  })

  it('sem dados grava sem_dados', async () => {
    vi.mocked(buscarDiaRioQualityFusion).mockResolvedValue([])
    const { sincronizarFusionRioQuality } = await import('./kpi-ao-vivo-tick')
    await sincronizarFusionRioQuality('2026-10-21')
    expect(registrar).toHaveBeenCalledWith('2026-10-21', expect.objectContaining({ situacao: 'sem_dados' }))
  })
})

describe('F2-05: alerta interno da Fusion parada (preparado, desligado por padrao)', () => {
  const caindo = {
    situacao: 'erro' as const, ultimaTentativa: '2026-10-21T09:00:00.000Z', ultimoSucesso: null,
    ultimoErro: 'TypeError: fetch failed', ultimoErroEm: '2026-10-21T09:00:00.000Z',
    falhandoDesde: '2026-10-21T08:00:00.000Z', fonteDoDia: null, alertaEm: null,
  }
  const agoraMs = Date.parse('2026-10-21T09:00:00.000Z') // 06:00 BRT

  it('desligado (padrao): nao manda nada, so loga e marca a queda como avisada', async () => {
    const { alertarFusionSeParada } = await import('./kpi-ao-vivo-tick')
    const enviar = vi.fn(async () => {})
    const gravar = vi.fn(async () => true)
    const logs: string[] = []
    const r = await alertarFusionSeParada('2026-10-21', { ler: async () => caindo, gravar, enviar, agoraMs, ligado: false, log: m => logs.push(m) })
    expect(r).toBe('desligado')
    expect(enviar).not.toHaveBeenCalled()
    expect(logs.join('\n')).toContain('desligado')
    expect(gravar).toHaveBeenCalledWith('2026-10-21', expect.objectContaining({ alertaEm: new Date(agoraMs).toISOString() }))
  })

  it('ligado (KPI_ALERTA_FUSION_DM=1): manda o texto ao dono pela chave fusion-rq', async () => {
    const { alertarFusionSeParada } = await import('./kpi-ao-vivo-tick')
    const enviar = vi.fn(async (_c: string, _t: string) => {})
    const r = await alertarFusionSeParada('2026-10-21', { ler: async () => caindo, gravar: async () => true, enviar, agoraMs, ligado: true, log: () => {} })
    expect(r).toBe('enviado')
    expect(enviar).toHaveBeenCalledWith('fusion-rq', expect.stringContaining('desde 05:00'))
  })

  it('padrao le a env: sem KPI_ALERTA_FUSION_DM fica desligado', async () => {
    const { alertaFusionLigado } = await import('./kpi-ao-vivo-tick')
    expect(alertaFusionLigado({})).toBe(false)
    expect(alertaFusionLigado({ KPI_ALERTA_FUSION_DM: '1' })).toBe(true)
  })

  it('menos de 60 min: nada', async () => {
    const { alertarFusionSeParada } = await import('./kpi-ao-vivo-tick')
    const enviar = vi.fn(async () => {})
    const r = await alertarFusionSeParada('2026-10-21', { ler: async () => caindo, gravar: async () => true, enviar, agoraMs: Date.parse('2026-10-21T08:50:00.000Z'), ligado: true, log: () => {} })
    expect(r).toBe('nada')
    expect(enviar).not.toHaveBeenCalled()
  })
})
