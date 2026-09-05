import { describe, it, expect } from 'vitest'
import { montarVisitasInclusivas } from './visitas'
import type { LinhaGeocodificada } from '@/lib/kpi-romaneio/types'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

// Achado real 05/09 (primeira geracao Rio Quality, 04/09): montarVisitas da
// Nutry Max casa cada PARADA com UMA entrega (a mais proxima). Na Rio Quality
// varias entregas da mesma placa caem na MESMA rua (mesma coordenada, sem
// numero) -- so' uma confirmava, o resto ficava pendente: 60% pendente com
// rastreador contra ~70% "entregue" na propria Unitrac.

function linha(nf: string, lat: number | null, lng: number | null): LinhaGeocodificada {
  return { carga: 'BAIXADA 2', destino: 'BAIXADA 2', placa: 'RJM5B51', motorista: '', ajudantes: [], nf, clienteCodigo: '', clienteNome: nf, endereco: nf, lat, lng }
}
function parada(id: string, lat: number, lng: number, chegada: string, fim: string, classificacao = 'FORA_BASE'): UnitracParadaRow {
  return { id, placa_norm: 'RJM5B51', chegada, saida: null, fim_real: fim, duracao_seg: null, local_parada: '', codigo_loja: null, nome_loja: null, lat, lng, classificacao, ordem: 0 }
}

const AUTOMOVEL = { lat: -22.7900, lng: -43.3050 }
const NOVE = { lat: -22.7920, lng: -43.3060 }      // ~250m da parada de Automovel Clube
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

  it('vizinhanca: entrega sem parada propria mas com irma confirmada a <= 800m herda a visita, marcada viaVizinhanca', () => {
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng), linha('N-1', NOVE.lat, NOVE.lng)]
    // parada ~330m ao NORTE de A-1 (confirma direto) e ~565m de N-1 (nao
    // confirma direto); N-1 esta' a ~245m de A-1 -> herda por vizinhanca
    const paradas = [parada('p1', AUTOMOVEL.lat + 0.003, AUTOMOVEL.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')]
    const v = montarVisitasInclusivas(linhas, paradas)
    expect(v.get('A-1')).toMatchObject({ viaVizinhanca: false })
    expect(v.get('N-1')).toMatchObject({ chegada: '2026-09-04T10:00:00Z', saida: '2026-09-04T10:20:00Z', viaVizinhanca: true })
  })

  it('vizinhanca NAO encadeia (irma confirmada por vizinhanca nao empresta pra terceira) e respeita o raio', () => {
    const viz = { lat: AUTOMOVEL.lat - 0.0055, lng: AUTOMOVEL.lng }  // ~610m de A-1: nao confirma direto (>500), herda (<=800)
    const meio = { lat: AUTOMOVEL.lat - 0.0110, lng: AUTOMOVEL.lng } // ~1220m de A-1 (>800) e ~610m de viz -- viz nao pode emprestar
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng), linha('N-1', viz.lat, viz.lng), linha('M-1', meio.lat, meio.lng), linha('L-1', LONGE.lat, LONGE.lng)]
    const paradas = [parada('p1', AUTOMOVEL.lat, AUTOMOVEL.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')]
    const v = montarVisitasInclusivas(linhas, paradas)
    expect(v.has('A-1')).toBe(true)
    expect(v.get('N-1')?.viaVizinhanca).toBe(true)   // ~610m de A-1
    expect(v.has('M-1')).toBe(false)                  // 1220m de A-1 (> 800) e N-1 (vizinhanca) nao empresta
    expect(v.has('L-1')).toBe(false)
  })

  it('ignora parada BASE e entrega sem coordenada', () => {
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng), linha('S-1', null, null)]
    const paradas = [parada('b', AUTOMOVEL.lat, AUTOMOVEL.lng, '2026-09-04T06:00:00Z', '2026-09-04T06:30:00Z', 'BASE')]
    expect(montarVisitasInclusivas(linhas, paradas).size).toBe(0)
  })
})
