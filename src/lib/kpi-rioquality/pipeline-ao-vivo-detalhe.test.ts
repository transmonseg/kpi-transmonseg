import { describe, it, expect, vi, afterAll } from 'vitest'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

// F2-03 (GEO-22, KRQ-04): o Ao vivo da RQ nao recebia ponto nem parada --
// desde 20/10, 0 de 11.382 NFs com lat e toda nao entregue "sem_coordenada".
// gerarKpiRioQuality passa a entregar romaneioGeo/detalhe/paradasPorPlaca/
// menorDistanciaTrajetoPorNf pelo mesmo callback da Nutry (aoMontarDetalhe).
// Caso real: TTU9G22 em 23/10 (paradas do kpi_paradas_snapshot, pontos do
// kpi_romaneio_geocode_cache).
vi.useFakeTimers({ toFake: ['Date'] })
vi.setSystemTime(new Date('2026-10-24T10:00:00-03:00'))
afterAll(() => { vi.useRealTimers() })

vi.mock('./geocode-coerencia', () => ({ geocodificarPorCoerencia: vi.fn(async () => new Map()) }))
vi.mock('@/lib/kpi-romaneio/geocode', () => ({
  geocodificarEnderecosComInfo: vi.fn(async (enderecos: string[]) => ({
    resultados: enderecos.map(e => e.startsWith('RUA RODRIGUES ALVES')
      ? { lat: -22.314978, lng: -42.332158, confiavel: true, fonte: 'cnefe' }
      : { lat: -22.3842593, lng: -42.4815298, confiavel: true, fonte: 'photon' }),
    parciais: 0,
  })),
}))
vi.mock('@/lib/kpi-romaneio/geocode-ancoras', () => ({ reposicionarPorAncoras: vi.fn(async () => new Map()) }))
vi.mock('./enviar-monitoramento-rq', () => ({ buscarCoordenadasMonitoramentoRQ: vi.fn(async () => new Map()) }))
vi.mock('./cache-corredor', () => ({ lerCorredorDoCache: vi.fn(async () => new Map()), gravarCorredorNoCache: vi.fn(async () => 0) }))

import { gerarKpiRioQuality } from './pipeline'

const p = (id: string, chegada: string, fim: string, lat: number, lng: number, classificacao = 'FORA_BASE'): UnitracParadaRow => ({
  id: `TTU9G22-${id}`, placa_norm: 'TTU9G22', chegada: `2026-10-23T${chegada}.000Z`, saida: `2026-10-23T${fim}.000Z`, fim_real: `2026-10-23T${fim}.000Z`,
  duracao_seg: 0, local_parada: '', codigo_loja: null, nome_loja: null, lat, lng, classificacao, ordem: 0,
})
const PARADAS: UnitracParadaRow[] = [
  p('api-1', '06:21:40', '06:24:40', -22.81593, -43.342, 'BASE'),
  p('api-12', '12:26:39', '12:47:39', -22.3173599, -42.330645),
  p('api-13', '12:48:52', '13:17:09', -22.314925, -42.3321549),
  p('api-14', '13:18:56', '13:31:56', -22.3186633, -42.3306416),
  p('api-18', '14:26:06', '14:30:06', -22.3514766, -42.39112),
  p('api-22', '17:38:07', '23:53:07', -22.8143116, -43.3439166, 'BASE'),
]
const entrega = (nf: string, rua: string, bairro: string, clienteNome: string) => ({
  placaNorm: 'TTU9G22', clienteNome, cidade: 'NOVA FRIBURGO', uf: 'RJ', destino: 'SERRA', motorista: 'M', rua, bairro, nf, clienteCodigo: nf, romaneio: '9001', rota: 'SERRA',
})

describe('F2-03: gerarKpiRioQuality entrega ponto, detalhe e paradas ao Ao vivo', () => {
  it('TTU9G22 23/10: aoMontarDetalhe recebe a NF com lat, o detalhe com a chegada da parada e as paradas da placa', async () => {
    const recebido: Parameters<NonNullable<Parameters<typeof gerarKpiRioQuality>[0]['aoMontarDetalhe']>>[0][] = []
    await gerarKpiRioQuality({
      entregasCompletas: [
        entrega('5558903', 'RUA RODRIGUES ALVES', 'SAO PEDRO DA SERRA', 'ANTONIO ROGERIO FERREIRA DA SILVA'),
        entrega('5558931', 'ESTRADA MURY MACAE DE CIMA', 'QUINTO DISTRITO', 'GRILICO COMERCIAL DE FRIBURGO LTDA'),
      ],
      data: '2026-10-23', hoje: '2026-10-24', cvPorPlaca: new Map([['TTU9G22', '9']]),
      buscarParadas: async () => PARADAS,
      medirRastro: async () => ({ km: 320, pontosNoDia: 1400 }),
      buscarUltimaComunicacao: async () => new Map(),
      aoMontarDetalhe: x => { recebido.push(x) },
    })
    expect(recebido).toHaveLength(1)
    const { romaneioGeo, detalhe, paradasPorPlaca, menorDistanciaTrajetoPorNf } = recebido[0]
    expect(romaneioGeo.find(l => l.nf === '5558903')).toMatchObject({ lat: -22.314978, lng: -42.332158 })
    expect(romaneioGeo.find(l => l.nf === '5558931')).toMatchObject({ lat: -22.3842593, lng: -42.4815298 })
    const entregue = detalhe.find(d => d.nf === '5558903')!
    expect(entregue.status).not.toBe('pendente')
    expect(entregue.chegada).toBe('2026-10-23T12:48:52.000Z')
    expect(detalhe.find(d => d.nf === '5558931')!.status).toBe('pendente')
    expect(paradasPorPlaca.get('TTU9G22')).toHaveLength(PARADAS.length)
    expect(menorDistanciaTrajetoPorNf).toBeInstanceOf(Map)
  })
})
