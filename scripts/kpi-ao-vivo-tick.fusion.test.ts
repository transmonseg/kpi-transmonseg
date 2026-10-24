import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/lib/kpi-rioquality/fonte-fusion', () => ({ buscarDiaRioQualityFusion: vi.fn() }))
const guardar = vi.fn(async () => {})
const fonteDoDia = vi.fn(async (): Promise<string | null> => null)
const diaGuardadoRQ = vi.fn(async (): Promise<unknown[] | null> => null)
vi.mock('../src/lib/kpi-romaneio/ao-vivo-servico', () => ({
  guardarDiaAoVivo: (...a: unknown[]) => (guardar as (...x: unknown[]) => unknown)(...a),
  fonteDoDiaAoVivo: (...a: unknown[]) => (fonteDoDia as (...x: unknown[]) => unknown)(...a),
  entradaRioQualityDoDia: (...a: unknown[]) => (diaGuardadoRQ as (...x: unknown[]) => unknown)(...a),
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

const enviarRQ = vi.fn(async (..._a: unknown[]) => ({ ok: true }))
vi.mock('../src/lib/kpi-rioquality/enviar-monitoramento-rq', () => ({
  linhasComCoordenadasRQ: async (e: { nf: string }[]) => e.map(x => ({ nf: x.nf, lat: -22.8 })),
  enviarRioQualityAoMonitoramento: (...a: unknown[]) => enviarRQ(...a),
  linhasParaMonitoramentoRQ: vi.fn(() => []),
  contarRioQualityNoMonitoramento: vi.fn(async () => null),
  resumoEnvioRQ: () => null,
}))

import { buscarDiaRioQualityFusion } from '../src/lib/kpi-rioquality/fonte-fusion'
import { rmSync } from 'node:fs'
import { arquivoEstadoEncolhimentoFusion } from '../src/lib/kpi-rioquality/encolhimento-fusion'

describe('sincronizarFusionRioQuality', () => {
  beforeEach(() => { guardar.mockClear(); enviarRQ.mockClear() })

  // F2-04: a Fusion tambem substitui o dia no monitoramento (a volta da
  // planilha manual para a Fusion nao deixa as duas versoes no mapa), com a
  // coordenada que o KPI ja' resolveu.
  it('dia da Fusion: guarda e envia ao monitoramento como cron-fusion, com a coordenada do KPI', async () => {
    vi.mocked(buscarDiaRioQualityFusion).mockResolvedValue([{ nf: '6079976', placaNorm: 'LUI1G55' }] as never)
    fonteDoDia.mockResolvedValueOnce('fusion')
    const { sincronizarFusionRioQuality } = await import('./kpi-ao-vivo-tick')
    expect(await sincronizarFusionRioQuality('2026-10-23')).toBe('ok')
    expect(enviarRQ).toHaveBeenCalledWith('2026-10-23', [{ nf: '6079976', lat: -22.8 }], { enviadoPor: 'cron-fusion' })
  })

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

// Revisao Fase 2 (F2-REV-02): 20/10 (fonte fusion, 2.450 NFs). O romaneio
// 1167566 (RKQ4E88, 40 NFs) volta sem rows: o dia novo tem 2.410 (98%), passa
// pela trava de 50% do monitoramento e o "substituir" apagava os 40 pontos com
// a presenca. Agora o tick recusa (dia guardado e mapa ficam) ate' a mesma
// leitura se repetir 3 vezes seguidas (cancelamento de verdade).
describe('F2-REV-02: dia da Fusion que encolhe nao substitui o mapa', () => {
  const linha = (romaneio: string, placaNorm: string, nf: string) => ({ romaneio, placaNorm, nf })
  const outros = Array.from({ length: 2410 }, (_, i) => linha(String(1167000 + (i % 87)), 'LMV8B05', String(6000000 + i)))
  const guardado = [...Array.from({ length: 40 }, (_, i) => linha('1167566', 'RKQ4E88', String(6072000 + i))), ...outros]
  beforeEach(() => {
    guardar.mockClear(); enviarRQ.mockClear(); registrar.mockClear()
    fonteDoDia.mockReset(); fonteDoDia.mockResolvedValue('fusion')
    diaGuardadoRQ.mockReset(); diaGuardadoRQ.mockResolvedValue(guardado)
    rmSync(arquivoEstadoEncolhimentoFusion('2026-10-20'), { force: true })
  })

  it('romaneio 1167566 sumiu: nao guarda, nao envia, grava erro com o romaneio', async () => {
    vi.mocked(buscarDiaRioQualityFusion).mockResolvedValue(outros as never)
    const { sincronizarFusionRioQuality } = await import('./kpi-ao-vivo-tick')
    expect(await sincronizarFusionRioQuality('2026-10-20')).toBe('erro')
    expect(guardar).not.toHaveBeenCalled()
    expect(enviarRQ).not.toHaveBeenCalled()
    expect(registrar).toHaveBeenCalledWith('2026-10-20', expect.objectContaining({ situacao: 'erro', erro: expect.stringContaining('1167566 (RKQ4E88) 40 -> 0') }))
  })

  it('3a leitura seguida igual: aceita, guarda e substitui (romaneio cancelado de verdade)', async () => {
    vi.mocked(buscarDiaRioQualityFusion).mockResolvedValue(outros as never)
    const { sincronizarFusionRioQuality } = await import('./kpi-ao-vivo-tick')
    expect(await sincronizarFusionRioQuality('2026-10-20')).toBe('erro')
    expect(await sincronizarFusionRioQuality('2026-10-20')).toBe('erro')
    expect(await sincronizarFusionRioQuality('2026-10-20')).toBe('ok')
    expect(guardar).toHaveBeenCalledTimes(1)
    expect(enviarRQ).toHaveBeenCalledTimes(1)
  })

  it('dia que so cresce segue como antes', async () => {
    vi.mocked(buscarDiaRioQualityFusion).mockResolvedValue([...guardado, linha('1169999', 'NOV1A11', '7000000')] as never)
    const { sincronizarFusionRioQuality } = await import('./kpi-ao-vivo-tick')
    expect(await sincronizarFusionRioQuality('2026-10-20')).toBe('ok')
    expect(guardar).toHaveBeenCalledTimes(1)
    expect(enviarRQ).toHaveBeenCalledTimes(1)
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
