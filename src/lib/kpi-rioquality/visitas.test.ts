import { describe, it, expect } from 'vitest'
import { montarVisitasInclusivas } from './visitas'
import type { LinhaGeocodificada } from '@/lib/kpi-romaneio/types'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

// Achado real 05/09 (primeira geracao Rio Quality, 04/09): montarVisitas da
// Nutry Max casa cada PARADA com UMA entrega (a mais proxima). Na Rio Quality
// varias entregas da mesma placa caem na MESMA rua (mesma coordenada, sem
// numero) -- so' uma confirmava, o resto ficava pendente: 60% pendente com
// rastreador contra ~70% "entregue" na propria Unitrac.

function linha(nf: string, lat: number | null, lng: number | null, pontosAlternativos?: { lat: number; lng: number }[]): LinhaGeocodificada {
  return { carga: 'BAIXADA 2', destino: 'BAIXADA 2', placa: 'RJM5B51', motorista: '', ajudantes: [], nf, clienteCodigo: '', clienteNome: nf, endereco: nf, lat, lng, pontosAlternativos }
}
function parada(id: string, lat: number, lng: number, chegada: string, fim: string, classificacao = 'FORA_BASE'): UnitracParadaRow {
  return { id, placa_norm: 'RJM5B51', chegada, saida: null, fim_real: fim, duracao_seg: null, local_parada: '', codigo_loja: null, nome_loja: null, lat, lng, classificacao, ordem: 0 }
}

const AUTOMOVEL = { lat: -22.7900, lng: -43.3050 }
const LONGE = { lat: -22.9000, lng: -43.2000 }     // outra regiao

describe('montarVisitasInclusivas', () => {
  it('TODAS as entregas a <= 500m de uma parada confirmam (nao so a mais proxima) -- 3 entregas na mesma rua', () => {
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng), linha('A-2', AUTOMOVEL.lat, AUTOMOVEL.lng), linha('A-3', AUTOMOVEL.lat, AUTOMOVEL.lng)]
    const paradas = [parada('p1', AUTOMOVEL.lat + 0.0005, AUTOMOVEL.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')]
    const v = montarVisitasInclusivas(linhas, paradas)
    expect([...v.keys()].sort()).toEqual(['A-1', 'A-2', 'A-3'])
    for (const nf of ['A-1', 'A-2', 'A-3']) {
      expect(v.get(nf)).toMatchObject({ chegada: '2026-09-04T10:00:00Z', saida: '2026-09-04T10:20:00Z', viaVizinhanca: false })
      expect(v.get(nf)!.distanciaMetrosDoPonto).toBeLessThan(100)
    }
  })

  it('entrega com mais de uma parada no raio fica com a de MAIOR permanencia', () => {
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng)]
    const paradas = [
      parada('curta', AUTOMOVEL.lat, AUTOMOVEL.lng, '2026-09-04T09:00:00Z', '2026-09-04T09:03:00Z'),
      parada('longa', AUTOMOVEL.lat + 0.001, AUTOMOVEL.lng, '2026-09-04T11:00:00Z', '2026-09-04T11:25:00Z'),
    ]
    expect(montarVisitasInclusivas(linhas, paradas).get('A-1')!.chegada).toBe('2026-09-04T11:00:00Z')
  })

  // Geometria numa linha norte-sul (0.001 de lat ~ 111m): a parada fica ~700m
  // ao SUL de A-1 (confirma A-1 pela faixa ampliada) e N-1 fica ~700m ao
  // NORTE de A-1 -- ou seja ~1,4km da parada (longe demais pra confirmar
  // direto) mas dentro dos 800m de A-1, entao herda por vizinhanca.
  it('vizinhanca: entrega sem parada propria mas com irma confirmada a <= 800m herda a visita, marcada viaVizinhanca', () => {
    const norte = { lat: AUTOMOVEL.lat + 0.0063, lng: AUTOMOVEL.lng }
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng), linha('N-1', norte.lat, norte.lng)]
    const paradas = [parada('p1', AUTOMOVEL.lat - 0.0063, AUTOMOVEL.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')]
    const v = montarVisitasInclusivas(linhas, paradas)
    expect(v.get('A-1')).toMatchObject({ viaVizinhanca: false, viaRaioAmpliado: true })
    expect(v.get('N-1')).toMatchObject({ chegada: '2026-09-04T10:00:00Z', saida: '2026-09-04T10:20:00Z', viaVizinhanca: true })
  })

  it('vizinhanca NAO encadeia (irma confirmada por vizinhanca nao empresta pra terceira) e respeita o raio', () => {
    // parada 700m ao SUL de A-1; N-1 700m ao NORTE de A-1 (1,4km da parada ->
    // so' vizinhanca); M-1 1,6km ao norte de A-1 e ~900m de N-1 -> ninguem
    // pode confirmar (nem direto, nem por N-1, que so' tem vizinhanca)
    const viz = { lat: AUTOMOVEL.lat + 0.0063, lng: AUTOMOVEL.lng }
    const meio = { lat: AUTOMOVEL.lat + 0.0145, lng: AUTOMOVEL.lng }
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng), linha('N-1', viz.lat, viz.lng), linha('M-1', meio.lat, meio.lng), linha('L-1', LONGE.lat, LONGE.lng)]
    const paradas = [parada('p1', AUTOMOVEL.lat - 0.0063, AUTOMOVEL.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')]
    const v = montarVisitasInclusivas(linhas, paradas)
    expect(v.has('A-1')).toBe(true)
    expect(v.get('N-1')?.viaVizinhanca).toBe(true)
    expect(v.has('M-1')).toBe(false)
    expect(v.has('L-1')).toBe(false)
  })

  // Achado real 05/09 (conferencia manual de 20 entregas da Rio Quality): duas
  // pendentes tinham a coordenada CERTA (verificada por reverse geocode -- 85m
  // da Rua Raul Pompeia, e a Rua Beira Rio em Mage) e mesmo assim ficaram
  // pendentes porque a parada da propria placa estava a 607m e 547m -- fora do
  // raio de 500m por pouco. No romaneio da Rio Quality nao ha NUMERO, entao a
  // coordenada e' de trecho de rua (+-200m facil): 500m e' apertado demais.
  // Vira confirmada, mas MARCADA (raio ampliado), nunca como confirmacao
  // normal -- mesma filosofia da vizinhanca.
  it('parada entre 500m e 800m confirma, marcada como raio ampliado', () => {
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng)]
    const paradas = [parada('p1', AUTOMOVEL.lat - 0.0055, AUTOMOVEL.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')] // ~610m
    const v = montarVisitasInclusivas(linhas, paradas)
    expect(v.get('A-1')).toMatchObject({ viaRaioAmpliado: true, viaVizinhanca: false })
    expect(v.get('A-1')!.distanciaMetrosDoPonto).toBeGreaterThan(500)
  })

  it('parada dentro de 500m continua confirmacao normal (nao marca raio ampliado)', () => {
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng)]
    const paradas = [parada('p1', AUTOMOVEL.lat + 0.001, AUTOMOVEL.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')]
    expect(montarVisitasInclusivas(linhas, paradas).get('A-1')).toMatchObject({ viaRaioAmpliado: false, viaVizinhanca: false })
  })

  it('parada dentro de 500m tem prioridade sobre outra a 700m (nao rebaixa a toa)', () => {
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng)]
    const paradas = [
      parada('longe', AUTOMOVEL.lat - 0.0063, AUTOMOVEL.lng, '2026-09-04T09:00:00Z', '2026-09-04T09:40:00Z'), // ~700m, mais demorada
      parada('perto', AUTOMOVEL.lat + 0.001, AUTOMOVEL.lng, '2026-09-04T11:00:00Z', '2026-09-04T11:10:00Z'), // ~110m
    ]
    const v = montarVisitasInclusivas(linhas, paradas)
    expect(v.get('A-1')).toMatchObject({ viaRaioAmpliado: false })
    expect(v.get('A-1')!.chegada).toBe('2026-09-04T11:00:00Z')
  })

  it('acima de 800m nao confirma direto (so por vizinhanca, se houver irma)', () => {
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng)]
    const paradas = [parada('p1', AUTOMOVEL.lat - 0.0090, AUTOMOVEL.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')] // ~1km
    expect(montarVisitasInclusivas(linhas, paradas).size).toBe(0)
  })

  // Pedido do usuario 06/09: "se disser a rua, e o caminhao parou naquela
  // rua, conta como entrega" -- rua comprida, o CNEFE tem varios trechos e a
  // coerencia so' escolhe UM (o mais perto das ancoras). O caminhao pode
  // parar num trecho DIFERENTE da mesma rua, longe demais do escolhido pro
  // raio ampliado, e ainda assim ter entregue.
  it('confirma em OUTRO trecho da mesma rua quando o escolhido fica longe demais (>800m)', () => {
    const outroTrecho = { lat: AUTOMOVEL.lat + 0.02, lng: AUTOMOVEL.lng } // ~2,2km do escolhido
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng, [AUTOMOVEL, outroTrecho])]
    const paradas = [parada('p1', outroTrecho.lat, outroTrecho.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')]
    const v = montarVisitasInclusivas(linhas, paradas)
    expect(v.get('A-1')).toMatchObject({ chegada: '2026-09-04T10:00:00Z', viaVizinhanca: false, viaRaioAmpliado: false, viaOutroPontoDaRua: true })
  })

  it('sem pontos alternativos ou nenhum deles perto: continua sem confirmar', () => {
    const outroTrecho = { lat: AUTOMOVEL.lat + 0.02, lng: AUTOMOVEL.lng }
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng, [AUTOMOVEL, outroTrecho])]
    const paradas = [parada('p1', LONGE.lat, LONGE.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')]
    expect(montarVisitasInclusivas(linhas, paradas).size).toBe(0)
  })

  it('confirmacao direta no ponto escolhido tem prioridade sobre outro trecho da rua', () => {
    const outroTrecho = { lat: AUTOMOVEL.lat + 0.02, lng: AUTOMOVEL.lng }
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng, [AUTOMOVEL, outroTrecho])]
    const paradas = [parada('p1', AUTOMOVEL.lat + 0.001, AUTOMOVEL.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')]
    expect(montarVisitasInclusivas(linhas, paradas).get('A-1')?.viaOutroPontoDaRua).toBeFalsy()
  })

  it('ignora parada BASE e entrega sem coordenada', () => {
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng), linha('S-1', null, null)]
    const paradas = [parada('b', AUTOMOVEL.lat, AUTOMOVEL.lng, '2026-09-04T06:00:00Z', '2026-09-04T06:30:00Z', 'BASE')]
    expect(montarVisitasInclusivas(linhas, paradas).size).toBe(0)
  })
})
