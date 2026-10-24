import { describe, it, expect } from 'vitest'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { LinhaGeocodificada } from './types'
import { acharBuracosDeSinal, buracoCompativel, obsSemSinalNoTrecho } from './buraco-sinal'
import { montarDetalheEntregas } from './agregacao'
import { investigarNf } from './investigacao'
import { categoriaPendencia } from './resumo-dashboard'

// F2-07 (KN-05). Paradas reais do kpi_paradas_snapshot (nutrimax).
const parada = (placa: string, data: string, id: string, chegada: string, fim: string, saida: string, lat: number, lng: number, classificacao = 'FORA_BASE'): UnitracParadaRow => ({
  id: `${placa}-${id}`, placa_norm: placa, chegada: `${data}T${chegada}.000Z`, fim_real: `${data}T${fim}.000Z`, saida: `${data}T${saida}.000Z`,
  duracao_seg: 0, local_parada: '', codigo_loja: null, nome_loja: null, lat, lng, classificacao, ordem: 0,
})
const rqv = (id: string, c: string, f: string, s: string, lat: number, lng: number, cl?: string) => parada('RQV9B26', '2026-10-22', id, c, f, s, lat, lng, cl)
// RQV9B26 22/10: GPS congelado das 12:30 às 14:09 (api-9 de 112 min), salto
// de 9,5 km em 49 s até api-10; e api-1 -> api-2, 13,5 km em 2 min (KN-07).
const RQV9B26_22_10 = [
  rqv('api-1', '08:38:24', '09:22:24', '09:24:39', -22.8239216, -43.2779583),
  rqv('api-2', '09:24:39', '09:32:39', '09:41:32', -22.7027633, -43.280775),
  rqv('api-3', '09:41:32', '09:50:32', '09:51:54', -22.6609383, -43.2841283),
  rqv('api-4', '09:51:54', '10:01:54', '10:16:38', -22.6521366, -43.28344),
  rqv('api-5', '10:16:38', '10:55:33', '11:10:25', -22.5867049, -43.304675),
  rqv('api-6', '11:10:25', '11:32:25', '11:42:37', -22.5911933, -43.3165599),
  rqv('api-7', '11:42:37', '11:55:37', '11:57:14', -22.6002716, -43.3012633),
  rqv('api-8', '11:57:14', '12:06:14', '12:18:54', -22.6006033, -43.303175),
  rqv('api-9', '12:18:54', '14:10:54', '14:11:43', -22.6435966, -43.2902583),
  rqv('api-10', '14:11:43', '14:21:43', '14:22:15', -22.6180633, -43.201435),
  rqv('api-11', '14:22:15', '14:30:15', '14:33:09', -22.6196749, -43.2096233),
  rqv('api-12', '14:37:23', '14:41:23', '14:45:45', -22.6282766, -43.2090616),
  rqv('api-13', '14:45:45', '14:47:45', '15:17:05', -22.6417983, -43.219495),
  rqv('api-14', '15:17:05', '19:58:31', '19:58:31', -22.8157633, -43.27791, 'BASE'),
]
const rqs = (id: string, c: string, f: string, lat: number, lng: number, cl?: string) => parada('RQS7H76', '2026-10-14', id, c, f, f, lat, lng, cl)
// RQS7H76 14/10: cadeia contínua (3 "NÃO FOI" com ponto confirmado).
const RQS7H76_14_10 = [
  rqs('api-1', '06:47:42', '08:53:42', -22.8150166, -43.2778916, 'BASE'),
  rqs('api-2', '09:00:51', '09:17:51', -22.789845, -43.2845366),
  rqs('api-3', '09:23:31', '09:29:31', -22.7577533, -43.2904633),
  rqs('api-4', '09:45:15', '10:05:15', -22.71597, -43.2436433),
  rqs('api-5', '10:05:47', '10:25:47', -22.7145116, -43.244615),
  rqs('api-6', '10:36:31', '10:56:31', -22.7040966, -43.2805116),
  rqs('api-7', '10:57:07', '11:16:07', -22.7011783, -43.2755916),
  rqs('api-8', '11:27:04', '11:48:04', -22.677715, -43.2736883),
  rqs('api-9', '11:49:54', '11:51:54', -22.6779449, -43.2721183),
  rqs('api-10', '11:55:25', '12:13:25', -22.6779099, -43.2627083),
  rqs('api-11', '12:16:20', '12:25:20', -22.6752883, -43.2664816),
  rqs('api-12', '12:37:34', '13:09:34', -22.6770033, -43.2891966),
  rqs('api-13', '13:11:34', '13:14:34', -22.6696966, -43.2887933),
  rqs('api-14', '13:18:54', '13:22:54', -22.661255, -43.2841533),
  rqs('api-15', '13:28:50', '13:34:50', -22.6106249, -43.2838733),
  rqs('api-16', '13:39:47', '13:42:47', -22.6004683, -43.2942183),
  rqs('api-17', '13:45:18', '13:50:18', -22.5844966, -43.2857183),
  rqs('api-18', '13:56:24', '15:10:24', -22.5921416, -43.3028516),
  rqs('api-19', '15:14:00', '15:31:00', -22.5868283, -43.3047416),
  rqs('api-20', '15:36:34', '16:41:34', -22.5713733, -43.31119),
  rqs('api-21', '16:55:22', '17:12:07', -22.5870216, -43.3097583),
  rqs('api-22', '17:22:50', '17:39:50', -22.6002633, -43.3014083),
  rqs('api-23', '17:54:42', '18:03:42', -22.6435949, -43.2937616),
  rqs('api-24', '18:13:49', '18:20:49', -22.6401316, -43.2720066),
  rqs('api-25', '18:53:30', '23:49:34', -22.815845, -43.2779633, 'BASE'),
]

const SUPER_COMPRAS = { lat: -22.633078, lng: -43.260591 } // kpi_cliente_local, 4 confirmações
const linha = (placa: string, nf: string, ponto: { lat: number; lng: number }, cliente: string): LinhaGeocodificada => ({
  carga: '1', destino: 'CAXIAS', placa, motorista: 'M', ajudantes: [], nf, clienteCodigo: nf, clienteNome: cliente, endereco: cliente,
  lat: ponto.lat, lng: ponto.lng, pontoCorroborado: true,
})
const resumo = { motorista: '', saidaCd: null, chegadaCd: null, tempoOperacaoMin: null }

describe('F2-07: buraco de sinal na cadeia de paradas', () => {
  it('RQV9B26 22/10: acha os dois saltos impossíveis, com o buraco desde o começo da parada congelada', () => {
    const b = acharBuracosDeSinal(RQV9B26_22_10)
    expect(b.map(x => [x.inicio.slice(11, 16), x.fim.slice(11, 16)])).toEqual([['08:38', '09:24'], ['12:18', '14:11']])
    expect(b[1].saltoM).toBeGreaterThan(9_000)
  })

  it('RQS7H76 14/10: cadeia contínua, nenhum buraco', () => {
    expect(acharBuracosDeSinal(RQS7H76_14_10)).toEqual([])
  })

  it('SUPER COMPRAS cabe no buraco das 12:18–14:11; ponto a 40 km não cabe', () => {
    const buracos = acharBuracosDeSinal(RQV9B26_22_10)
    expect(obsSemSinalNoTrecho(buracoCompativel(SUPER_COMPRAS, buracos)!)).toBe('SEM SINAL NO TRECHO DO CLIENTE (12:18–14:11) - CONFERIR')
    expect(buracoCompativel({ lat: -22.95, lng: -43.65 }, buracos)).toBeNull()
  })
})

describe('F2-07: NÃO FOI dentro de buraco de sinal (montarDetalheEntregas)', () => {
  it('RQV9B26 22/10, NF 2438528 SUPER COMPRAS: não sai "NÃO FOI"; sai SEM SINAL NO TRECHO, ainda pendente', () => {
    const [d] = montarDetalheEntregas('1', 'RQV9B26', [linha('RQV9B26', '2438528', SUPER_COMPRAS, 'SUPER COMPRAS')], [], new Map(), resumo, true,
      new Map([['RQV9B26', RQV9B26_22_10]]))
    expect(d.status).toBe('pendente')
    expect(d.observacao).toBe('SEM SINAL NO TRECHO DO CLIENTE (12:18–14:11) - CONFERIR')
    expect(d.motivo).toMatch(/sem sinal entre 12:18 e 14:11/i)
    expect(d.confianca).toBe('REVISAR')
  })

  it('mesmo com o buraco só nas paradas cruas da Unitrac (a ponte venceu), não afirma NÃO FOI', () => {
    const semSalto = RQV9B26_22_10.filter(p => !p.id.endsWith('api-9') && !p.id.endsWith('api-1'))
    const [d] = montarDetalheEntregas('1', 'RQV9B26', [linha('RQV9B26', '2438528', SUPER_COMPRAS, 'SUPER COMPRAS')], [], new Map(), resumo, true,
      new Map([['RQV9B26', semSalto]]), null, false, false, false, new Map([['RQV9B26', RQV9B26_22_10]]))
    expect(d.observacao).toMatch(/^SEM SINAL NO TRECHO DO CLIENTE/)
  })

  it('RQS7H76 14/10: os 3 NÃO FOI com ponto confirmado e cadeia contínua continuam NÃO FOI', () => {
    const linhas = [
      linha('RQS7H76', '2423802', { lat: -22.640603, lng: -43.226921 }, 'TREVISO PRODUTOS'),
      linha('RQS7H76', '2423803', { lat: -22.629834, lng: -43.22235 }, 'RYAN GAMA'),
      linha('RQS7H76', '2423807', { lat: -22.633994, lng: -43.236339 }, 'LANCHEMOS HAMBURGUERIA'),
    ]
    const ds = montarDetalheEntregas('1', 'RQS7H76', linhas, [], new Map(), resumo, true, new Map([['RQS7H76', RQS7H76_14_10]]))
    expect(ds.map(d => d.observacao)).toEqual(Array(3).fill('NÃO FOI AO CLIENTE (caminhão não esteve na região)'))
  })
})

describe('F2-07: o resto do sistema lê o rótulo novo', () => {
  it('categoria própria no resumo (dentro da conta, não "Outros")', () => {
    expect(categoriaPendencia('SEM SINAL NO TRECHO DO CLIENTE (12:18–14:11) - CONFERIR')).toBe('Sem sinal no trecho')
  })
  it('investigação do Ao vivo não diz "não chegou perto" para a NF no buraco', () => {
    const inv = investigarNf({ nf: '2438528', carga: '1', cliente: 'SUPER COMPRAS', endereco: '', status: 'SEM SINAL NO TRECHO DO CLIENTE (12:18–14:11) - CONFERIR', situacao: 'revisar', chegada: null, saida: null, tempoMin: null, ...SUPER_COMPRAS }, RQV9B26_22_10)
    expect(inv.categoria).toBe('sem_sinal_no_trecho')
  })
})
