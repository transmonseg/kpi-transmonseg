import { describe, it, expect } from 'vitest'
import { gpsCongelado, semComunicarDesde, OBS_GPS_CONGELADO, obsSemComunicarDesde } from './rastreador-status'
import { BASE_COORD_RIOQUALITY } from './constants'

// Relatorio rq-mesmo-lugar-e-sem-rastreador.md (01/10), PARTE B.
describe('gpsCongelado', () => {
  it('LNH8A80: coordenada unica o dia todo, a ~17 km da base -> congelado', () => {
    expect(gpsCongelado({ km: 0, pontosNoDia: 590, coordenadaUnicaNoDia: { lat: -22.6758, lng: -43.271062 } })).toBe(true)
  })
  it('caminhao parado NA BASE o dia todo (pontos identicos na base) -> nao e congelado (segue NAO SAIU DA BASE)', () => {
    expect(gpsCongelado({ km: 0, pontosNoDia: 300, coordenadaUnicaNoDia: { lat: -22.814171, lng: -43.344751 } })).toBe(false)
    expect(gpsCongelado({ km: 0, pontosNoDia: 300, coordenadaUnicaNoDia: { ...BASE_COORD_RIOQUALITY } })).toBe(false)
  })
  it('sem coordenada unica (rodou) ou rastro desconhecido -> nao', () => {
    expect(gpsCongelado({ km: 80, pontosNoDia: 900 })).toBe(false)
    expect(gpsCongelado({ km: null, pontosNoDia: null })).toBe(false)
  })
})

describe('semComunicarDesde', () => {
  it('RJM5B51: ultimo GPS 20/08 11:54 e dia 30/09 -> "20/08"', () => {
    expect(semComunicarDesde('20/08/2026 11:54:21', '2026-09-30')).toBe('20/08')
  })
  it('comunicou durante o dia (ou depois) -> null', () => {
    expect(semComunicarDesde('30/09/2026 08:10:00', '2026-09-30')).toBeNull()
    expect(semComunicarDesde('01/10/2026 19:36:54', '2026-09-30')).toBeNull()
  })
  it('ultimo GPS 23:59 da vespera -> sem comunicar desde a vespera', () => {
    expect(semComunicarDesde('29/09/2026 23:59:00', '2026-09-30')).toBe('29/09')
  })
  it('data invalida/ausente -> null (nao conclui)', () => {
    expect(semComunicarDesde(null, '2026-09-30')).toBeNull()
    expect(semComunicarDesde('lixo', '2026-09-30')).toBeNull()
  })
})

describe('rotulos', () => {
  it('textos exatos (prefixo SEM RASTREADOR, nunca NAO SAIU DA BASE)', () => {
    expect(OBS_GPS_CONGELADO).toBe('SEM RASTREADOR - GPS CONGELADO')
    expect(obsSemComunicarDesde('20/08')).toBe('SEM RASTREADOR - SEM COMUNICAR DESDE 20/08')
  })
})
