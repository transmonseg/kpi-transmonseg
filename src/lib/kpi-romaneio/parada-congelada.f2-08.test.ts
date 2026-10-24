import { describe, it, expect } from 'vitest'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { LinhaDetalheEntrega, LinhaGeocodificada } from './types'
import { candidatosParadaForaDoEndereco } from './parada-fora-do-endereco'
import { paradaDaChegada } from './ao-vivo'
import { paradasSeguidasDeSaltoImpossivel } from './buraco-sinal'

// F2-08 (KN-07, plano mestre 23/10). Caso real RQV9B26 22/10 (paradas do
// kpi_paradas_snapshot): api-1 08:38-09:22 em Penha e' o GPS congelado; a
// api-2 comeca 13,5 km ao norte 2 min depois. CHURRASCO DO RICARDO (4 NFs,
// ponto aprendido com 7 confirmacoes) saiu ENTREGUE 09:20-09:22 com "LOCAL DA
// ENTREGA FORA DO ENDEREÇO (13,4 km, OUTRO MUNICÍPIO) - CORRIGIR CADASTRO":
// o local veio da api-1. O cadastro esta' certo.
const rqv = (id: string, c: string, f: string, lat: number, lng: number, classificacao = 'FORA_BASE'): UnitracParadaRow => ({
  id: `RQV9B26-${id}`, placa_norm: 'RQV9B26', chegada: `2026-10-22T${c}.000Z`, fim_real: `2026-10-22T${f}.000Z`, saida: `2026-10-22T${f}.000Z`,
  duracao_seg: 0, local_parada: '', codigo_loja: null, nome_loja: null, lat, lng, classificacao, ordem: 0,
})
const PARADAS = [
  rqv('api-1', '08:38:24', '09:22:24', -22.8239216, -43.2779583),
  rqv('api-2', '09:24:39', '09:32:39', -22.7027633, -43.280775),
  rqv('api-3', '09:41:32', '09:50:32', -22.6609383, -43.2841283),
  rqv('api-14', '15:17:05', '19:58:31', -22.8157633, -43.27791, 'BASE'),
]
const CHURRASCO = { lat: -22.703473, lng: -43.276858 }
const linha: LinhaGeocodificada = {
  carga: '100678', destino: 'DUQUE DE CAXIAS 2', placa: 'RQV9B26', motorista: 'M', ajudantes: [], nf: '2438539', clienteCodigo: 'C1',
  clienteNome: 'CHURRASCO DO RICARDO', endereco: 'RUA X, DUQUE DE CAXIAS', lat: CHURRASCO.lat, lng: CHURRASCO.lng,
}
const detalhe = {
  carga: '100678', placa: 'RQV9B26', motorista: 'M', clienteCodigo: 'C1', nf: '2438539', clienteNome: 'CHURRASCO DO RICARDO',
  endereco: 'RUA X, DUQUE DE CAXIAS', saidaCd: null, chegadaCd: null, tempoOperacaoMin: null,
  chegada: '2026-10-22T09:20:15.000Z', saida: '2026-10-22T09:22:37.000Z', tempoParadaMin: 2, status: 'confirmado_gps',
  temRastreador: true, observacao: null, evidencia: 'gps', distParadaM: null, motivo: '', confianca: 'CONFIRMADO',
} as unknown as LinhaDetalheEntrega

describe('F2-08: parada seguida de salto impossivel nao da local nem "corrigir cadastro"', () => {
  it('a api-1 (13,5 km em 2 min ate a api-2) e' + "' a unica suspeita", () => {
    const s = paradasSeguidasDeSaltoImpossivel(PARADAS)
    expect([...s].map(p => p.id)).toEqual(['RQV9B26-api-1'])
  })

  it('Churrasco do Ricardo 22/10: sem candidato a "LOCAL DA ENTREGA FORA DO ENDEREÇO"', () => {
    const ctx = { linhaPorNf: new Map([[linha.nf, linha]]), alvoPorNf: new Map(), paradasPorPlaca: new Map([['RQV9B26', PARADAS]]), paradasCruasPorPlaca: new Map(), data: '2026-10-22' }
    expect(candidatosParadaForaDoEndereco([detalhe], ctx)).toEqual([])
  })

  it('parada congelada perto do endereco continua provando que o carro parou la (a seco 20/10, RQP5I85)', () => {
    // A congelada a 100 m do cliente: o comeco dela e' real; sem aviso.
    // api-0 a ~100 m do cliente seguida de salto de 13 km em 30 s; a parada da
    // janela da NF (api-1) e' longe -- sem a api-0, viraria candidato.
    const perto = [
      rqv('api-0', '07:00:00', '07:30:00', CHURRASCO.lat + 0.0009, CHURRASCO.lng),
      rqv('api-1', '07:30:30', '09:23:00', -22.8239216, -43.2779583),
      rqv('api-2', '09:30:00', '09:40:00', -22.8249216, -43.2779583),
    ]
    const ctx = { linhaPorNf: new Map([[linha.nf, linha]]), alvoPorNf: new Map(), paradasPorPlaca: new Map([['RQV9B26', perto]]), paradasCruasPorPlaca: new Map(), data: '2026-10-22' }
    expect(candidatosParadaForaDoEndereco([detalhe], ctx)).toEqual([])
  })

  it('o ponto da parada no Ao vivo nao e' + "' o congelado de Penha (vale a api-2, 4 min depois)", () => {
    expect(paradaDaChegada(PARADAS, '2026-10-22T09:20:15.000Z')).toEqual({ lat: -22.7027633, lng: -43.280775 })
  })
})
