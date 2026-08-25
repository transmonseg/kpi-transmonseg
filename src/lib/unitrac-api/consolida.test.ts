import { describe, it, expect } from 'vitest'
import { clusteriza, consolidaParadasApi, type StopApiCru } from './consolida'
import type { MapaPontos } from './pontos'

const pontos: MapaPontos = {
  '3030113': { cod: '3030113', nome: 'SUPERPRIX LJ 13 - NITEROI', lat: -22.90327, lon: -43.11062, raio: 200 },
  '3030011': { cod: '3030011', nome: 'SUPERPRIX LJ 10 - ICARAÍ', lat: -22.907512, lon: -43.103701, raio: 300 },
}

describe('clusteriza', () => {
  it('agrupa eventos próximos no espaço e separa os distantes', () => {
    const ev: StopApiCru[] = [
      { _data: '2026-06-12T05:51:00Z', tempoparada: 60, latitude: -22.90316, longitude: -43.11053 },
      { _data: '2026-06-12T05:55:00Z', tempoparada: 60, latitude: -22.90320, longitude: -43.11050 }, // ~5m do 1º
      { _data: '2026-06-12T06:42:00Z', tempoparada: 60, latitude: -22.90721, longitude: -43.10379 }, // ~850m → outro cluster
    ]
    const cl = clusteriza(ev)
    expect(cl).toHaveLength(2)
    expect(cl[0].eventos).toHaveLength(2)
    expect(cl[1].eventos).toHaveLength(1)
  })
})

describe('consolidaParadasApi', () => {
  it('FUM-8748: 2 entregas, saída inferida do próximo cluster, geofence resolvida', () => {
    const ev: StopApiCru[] = [
      { _data: '2026-06-12T05:51:00Z', tempoparada: 60, latitude: -22.90316, longitude: -43.11053 }, // Niterói
      { _data: '2026-06-12T06:42:00Z', tempoparada: 60, latitude: -22.90721, longitude: -43.10379 }, // Icaraí
    ]
    const ps = consolidaParadasApi(ev, pontos, '2026-06-12', 'FUM8748')
    expect(ps).toHaveLength(2)
    expect(ps[0].codigo_loja).toBe('3030113')
    expect(ps[0].classificacao).toBe('LOJA')
    expect(ps[0].chegada).toBe('2026-06-12T05:51:00.000Z')
    expect(ps[0].saida).toBe('2026-06-12T06:42:00.000Z') // saída = chegada do próximo cluster
    expect(ps[1].codigo_loja).toBe('3030011')
  })

  it('fim_real não inclui o trajeto até o próximo cluster (diferente de saida)', () => {
    const ev: StopApiCru[] = [
      // permanência real de 1min no 1º ponto — o resto até 06:42 é trânsito
      { _data: '2026-06-12T05:51:00Z', tempoparada: 60, latitude: -22.90316, longitude: -43.11053 },
      { _data: '2026-06-12T06:42:00Z', tempoparada: 60, latitude: -22.90721, longitude: -43.10379 },
    ]
    const ps = consolidaParadasApi(ev, pontos, '2026-06-12', 'FUM8748')
    expect(ps[0].saida).toBe('2026-06-12T06:42:00.000Z') // inclui trânsito
    expect(ps[0].fim_real).toBe('2026-06-12T05:52:00.000Z') // só a permanência real (chegada + 60s)
    // último cluster do dia: fim_real == saida (não tem próximo pra emprestar chegada)
    expect(ps[1].fim_real).toBe(ps[1].saida)
  })

  it('classifica BASE quando o cluster está dentro do raio da base Benassi', () => {
    const ev: StopApiCru[] = [
      { _data: '2026-06-12T04:00:00Z', tempoparada: 600, latitude: -22.8291, longitude: -43.3421 },
    ]
    const ps = consolidaParadasApi(ev, pontos, '2026-06-12', 'FUM8748')
    expect(ps).toHaveLength(1)
    expect(ps[0].classificacao).toBe('BASE')
    expect(ps[0].codigo_loja).toBeNull()
  })

  it('filtra eventos de outro dia', () => {
    const ev: StopApiCru[] = [
      { _data: '2026-06-11T05:51:00Z', tempoparada: 600, latitude: -22.90316, longitude: -43.11053 },
    ]
    expect(consolidaParadasApi(ev, pontos, '2026-06-12', 'FUM8748')).toHaveLength(0)
  })

  it('descarta cluster curto DENTRO do raio da base (blip de trânsito perto da base), mantém o longo', () => {
    const ev: StopApiCru[] = [
      // blip perto da base: dwell inferido = próximo cluster (04:02) - 04:00 = 2min < 5min → descarta
      { _data: '2026-06-12T04:00:00Z', tempoparada: 30, latitude: -22.8291, longitude: -43.3421 },
      // último cluster: dwell = tempoparada = 600s ≥ 5min, longe da base → mantém FORA_BASE
      { _data: '2026-06-12T04:02:00Z', tempoparada: 600, latitude: -22.80, longitude: -43.50 },
    ]
    const ps = consolidaParadasApi(ev, pontos, '2026-06-12', 'FUM8748')
    expect(ps.map(p => p.classificacao)).toEqual(['FORA_BASE'])
  })

  it('descarta cluster curto SEM geofence (blip de trânsito), mantém o longo', () => {
    const ev: StopApiCru[] = [
      // blip: dwell inferido = próximo cluster (05:02) - 05:00 = 2min < 5min → descarta
      { _data: '2026-06-12T05:00:00Z', tempoparada: 30, latitude: -22.95, longitude: -43.20 },
      // último cluster: dwell = tempoparada = 600s ≥ 5min → mantém como FORA_BASE
      { _data: '2026-06-12T05:02:00Z', tempoparada: 600, latitude: -22.80, longitude: -43.50 },
    ]
    const ps = consolidaParadasApi(ev, pontos, '2026-06-12', 'FUM8748')
    expect(ps.map(p => p.classificacao)).toEqual(['FORA_BASE'])
  })

  it('aceita array de bases (contas com mais de uma garagem) — classifica BASE se bater QUALQUER uma', () => {
    // Caso real Nutrimax (2026-07-18): garagem de Campos, longe da de Penha.
    const penha = { lat: -22.816007, lng: -43.277827 }
    const campos = { lat: -21.6886, lng: -41.3113 }
    const ev: StopApiCru[] = [
      { _data: '2026-06-12T04:00:00Z', tempoparada: 600, latitude: campos.lat, longitude: campos.lng },
    ]
    const ps = consolidaParadasApi(ev, pontos, '2026-06-12', 'TUL1C38', [penha, campos])
    expect(ps[0].classificacao).toBe('BASE')
  })

  it('array de bases: cluster fora do raio de TODAS não vira BASE', () => {
    const penha = { lat: -22.816007, lng: -43.277827 }
    const campos = { lat: -21.6886, lng: -41.3113 }
    const ev: StopApiCru[] = [
      { _data: '2026-06-12T04:00:00Z', tempoparada: 600, latitude: -22.80, longitude: -43.50 },
    ]
    const ps = consolidaParadasApi(ev, pontos, '2026-06-12', 'TUL1C38', [penha, campos])
    expect(ps[0].classificacao).toBe('FORA_BASE')
  })
})
