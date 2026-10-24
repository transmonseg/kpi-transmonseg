import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import * as XLSX from 'xlsx'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { LinhaGeocodificada } from '@/lib/kpi-romaneio/types'

// F2-02 (GEO-21, plano mestre 23/10): o ponto que o monitoramento resolveu
// sem cidade (parser lia "RESENDE" como numero) era copiado para a NF da RQ
// sem coordenada com geoConfiavel=true e liberava o corredor da rua. Caso
// real: 23/10 LUI1G55 NF 6079976 "AVENIDA SERGIPE, RESENDE - RJ" -> o mapa
// tinha -11.0045812/-37.1030405 (Sergipe).
vi.useFakeTimers({ toFake: ['Date'] })
vi.setSystemTime(new Date('2026-10-23T18:00:00-03:00'))
afterAll(() => { vi.useRealTimers() })

vi.mock('./geocode-coerencia', () => ({ geocodificarPorCoerencia: vi.fn(async () => new Map()) }))
vi.mock('@/lib/kpi-romaneio/geocode', () => ({
  geocodificarEnderecosComInfo: vi.fn(async (e: string[]) => ({
    resultados: e.map(x => (x.startsWith('AVENIDA SERGIPE') ? null : { lat: -22.47, lng: -44.45, confiavel: true, fonte: 'cnefe' })),
    parciais: 0,
  })),
}))
vi.mock('@/lib/kpi-romaneio/geocode-ancoras', () => ({ reposicionarPorAncoras: vi.fn(async () => new Map()) }))
vi.mock('@/lib/unitrac-api/posicoes', () => ({ buscarPosicoesPorCv: vi.fn(async () => new Map()) }))
vi.mock('./cache-corredor', () => ({ lerCorredorDoCache: vi.fn(async () => new Map()), gravarCorredorNoCache: vi.fn(async () => 0) }))
vi.mock('./enviar-monitoramento-rq', () => ({
  buscarCoordenadasMonitoramentoRQ: vi.fn(async () => new Map([['LUI1G55|6079976', { lat: -11.0045812, lng: -37.1030405 }]])),
}))

import { geocodificarPorCoerencia } from './geocode-coerencia'
import { gerarKpiRioQuality } from './pipeline'

const DATA = '2026-10-23'
function planilha(aoa: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'R')
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}
function parada(placa: string, lat: number, lng: number): UnitracParadaRow {
  return {
    id: `${placa}-1`, placa_norm: placa, chegada: `${DATA}T13:00:00.000Z`, saida: `${DATA}T13:20:00.000Z`, fim_real: `${DATA}T13:20:00.000Z`, duracao_seg: 1200,
    local_parada: '', codigo_loja: null, nome_loja: null, lat, lng, classificacao: 'FORA_BASE', ordem: 0,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('gerarKpiRioQuality -- ponto do monitoramento como fallback (F2-02)', () => {
  it('entra com geoConfiavel=false e precisao "rua" e nao libera o corredor da rua', async () => {
    let geo: LinhaGeocodificada[] = []
    await gerarKpiRioQuality({
      completaBuf: planilha([
        ['Razão Social', 'Cidade', 'UF', 'Destino', 'Motorista', 'Placa', 'Endereço', 'Bairro', 'Nota Fiscal'],
        ['ELIZABETH DE ABREU LEITE ALMEIDA', 'RESENDE', 'RJ', 'SUL FLU', 'JOAO', 'LUI1G55', 'AVENIDA SERGIPE', '', '6079976'],
        ['MERCADO B', 'RESENDE', 'RJ', 'SUL FLU', 'JOAO', 'LUI1G55', 'RUA DOIS', 'CENTRO', '6079977'],
      ]),
      data: DATA, hoje: DATA,
      cvPorPlaca: new Map([['LUI1G55', '1']]),
      buscarParadas: async placa => [parada(String(placa), -22.0, -44.0)], // longe dos dois pontos
      medirRastro: async () => ({ km: 40, pontosNoDia: 900 }),
      aoMontarDetalhe: x => { geo = x.romaneioGeo },
    })
    const sergipe = geo.find(l => l.nf === '6079976')!
    expect(sergipe).toMatchObject({ lat: -11.0045812, lng: -37.1030405, geoConfiavel: false, geoPrecisao: 'rua' })
    expect(geo.find(l => l.nf === '6079977')!.geoConfiavel).toBe(true)
    const ruasPedidas = vi.mocked(geocodificarPorCoerencia).mock.calls.flatMap(([gs]) => gs.flatMap(g => g.ruas))
    expect(ruasPedidas).not.toContain('AVENIDA SERGIPE')
    expect(ruasPedidas).toContain('RUA DOIS')
  })
})
