import { describe, it, expect } from 'vitest'
import { montarVisitas } from './visitas'
import { haversine } from '@/lib/utils/geo'
import { RAIO_ENTREGA_METROS } from './constants'
import type { LinhaGeocodificada } from './types'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

function linha(nf: string, lat: number | null, lng: number | null): LinhaGeocodificada {
  return {
    carga: 'C1',
    destino: 'DEST',
    placa: 'ABC1234',
    motorista: 'MOTORISTA',
    ajudantes: [],
    nf,
    clienteCodigo: 'CLI1',
    clienteNome: 'CLIENTE',
    endereco: 'ENDERECO',
    lat,
    lng,
  }
}

function parada(overrides: Partial<UnitracParadaRow> = {}): UnitracParadaRow {
  return {
    id: 'p1',
    placa_norm: 'ABC1234',
    chegada: '2026-08-20T10:00:00.000Z',
    saida: '2026-08-20T10:10:00.000Z',
    fim_real: '2026-08-20T10:10:00.000Z',
    duracao_seg: 600,
    local_parada: 'FORA DE BASE',
    codigo_loja: null,
    nome_loja: null,
    lat: -22.9,
    lng: -43.2,
    endereco: null,
    classificacao: 'FORA_BASE',
    ordem: 1,
    ...overrides,
  }
}

describe('montarVisitas', () => {
  it('parada GPS dentro do raio vira visita confirmada, com a distância correta', () => {
    const l1 = linha('NF1', -22.9, -43.2)
    const p1 = parada({ lat: -22.9001, lng: -43.2001, chegada: '2026-08-20T10:00:00.000Z', fim_real: '2026-08-20T10:10:00.000Z' })
    const distEsperada = haversine(p1.lat as number, p1.lng as number, l1.lat as number, l1.lng as number)
    expect(distEsperada).toBeLessThan(RAIO_ENTREGA_METROS)

    const visitas = montarVisitas([l1], [p1])

    expect(visitas.get('NF1')).toEqual({
      nf: 'NF1',
      chegada: '2026-08-20T10:00:00.000Z',
      saida: '2026-08-20T10:10:00.000Z',
      distanciaMetrosDoPonto: distEsperada,
    })
  })

  it('ponto sem nenhuma parada por perto não gera visita', () => {
    const l2 = linha('NF2', -23.0, -44.0)
    const pLonge = parada({ lat: -22.9, lng: -43.2 })

    const visitas = montarVisitas([l2], [pLonge])

    expect(visitas.has('NF2')).toBe(false)
  })

  // Achado real 06/09 (placa RQV5F67/ENCONTRO PINHEIRO RESTAURANTE): parada
  // real de 27min a 501m do ponto -- 1m fora do raio normal, ficava
  // "NÃO FOI AO CLIENTE" mesmo com o caminhão genuinamente ali do lado.
  it('parada entre 500m e 800m confirma MARCADA (achado real 06/09, placa RQV5F67)', () => {
    const l1 = linha('NF1', -22.9, -43.2)
    // ~510m de l1 (0.0046 graus de latitude ~ 510m)
    const p1 = parada({ lat: -22.9046, lng: -43.2, chegada: '2026-08-20T10:00:00.000Z', fim_real: '2026-08-20T10:27:00.000Z' })
    const dist = haversine(p1.lat as number, p1.lng as number, l1.lat as number, l1.lng as number)
    expect(dist).toBeGreaterThan(RAIO_ENTREGA_METROS)
    expect(dist).toBeLessThan(800)

    const visitas = montarVisitas([l1], [p1])

    expect(visitas.get('NF1')).toMatchObject({ nf: 'NF1', viaRaioAmpliado: true })
  })

  it('parada dentro do raio normal ganha da ampliada, mesmo com duração menor', () => {
    const l1 = linha('NF1', -22.9, -43.2)
    const pAmpliada = parada({ id: 'ampliada', lat: -22.9046, lng: -43.2, chegada: '2026-08-20T09:00:00.000Z', fim_real: '2026-08-20T09:30:00.000Z' })
    const pNormal = parada({ id: 'normal', lat: -22.9001, lng: -43.2001, chegada: '2026-08-20T11:00:00.000Z', fim_real: '2026-08-20T11:05:00.000Z' })

    const visitas = montarVisitas([l1], [pAmpliada, pNormal])

    expect(visitas.get('NF1')?.chegada).toBe('2026-08-20T11:00:00.000Z')
    expect(visitas.get('NF1')?.viaRaioAmpliado).toBeUndefined()
  })

  it('parada a mais de 800m não confirma (fora do raio ampliado)', () => {
    const l1 = linha('NF1', -22.9, -43.2)
    const pLonge = parada({ lat: -22.91, lng: -43.2 }) // ~1.1km

    const visitas = montarVisitas([l1], [pLonge])

    expect(visitas.has('NF1')).toBe(false)
  })

  it('duas paradas perto do mesmo ponto: fica a de MAIOR duração, independente da ordem', () => {
    const l3 = linha('NF3', -22.95, -43.25)
    const pCurta = parada({ id: 'curta', lat: -22.9501, lng: -43.2501, chegada: '2026-08-20T09:00:00.000Z', fim_real: '2026-08-20T09:05:00.000Z' })
    const pLonga = parada({ id: 'longa', lat: -22.9502, lng: -43.2502, chegada: '2026-08-20T11:00:00.000Z', fim_real: '2026-08-20T11:30:00.000Z' })

    const visitasOrdem1 = montarVisitas([l3], [pCurta, pLonga])
    const visitasOrdem2 = montarVisitas([l3], [pLonga, pCurta])

    expect(visitasOrdem1.get('NF3')?.chegada).toBe('2026-08-20T11:00:00.000Z')
    expect(visitasOrdem1.get('NF3')?.saida).toBe('2026-08-20T11:30:00.000Z')
    expect(visitasOrdem2.get('NF3')?.chegada).toBe('2026-08-20T11:00:00.000Z')
  })

  it('dois pontos geocodificados próximos: parada única vai pro ponto mais próximo, não pro primeiro da lista', () => {
    const lB = linha('NF-B', -22.96, -43.26)
    const lC = linha('NF-C', -22.9611, -43.26)
    const p = parada({ lat: -22.9609, lng: -43.26 })

    const distB = haversine(p.lat as number, p.lng as number, lB.lat as number, lB.lng as number)
    const distC = haversine(p.lat as number, p.lng as number, lC.lat as number, lC.lng as number)
    // Fixture sanity: parada mais perto de C que de B, e ambas dentro do raio
    // (senão o teste não provaria nada sobre "mais próximo" vs "primeiro").
    expect(distC).toBeLessThan(distB)
    expect(distB).toBeLessThan(RAIO_ENTREGA_METROS)

    // lB listado primeiro -- se o bug "primeiro que bate" existisse, a visita
    // cairia em NF-B em vez de NF-C.
    const visitas = montarVisitas([lB, lC], [p])

    expect(visitas.has('NF-C')).toBe(true)
    expect(visitas.has('NF-B')).toBe(false)
  })

  it('parada classificada BASE é ignorada mesmo perto de um ponto de entrega', () => {
    const l5 = linha('NF5', -22.97, -43.27)
    const pBase = parada({ lat: -22.9701, lng: -43.2701, classificacao: 'BASE' })

    const visitas = montarVisitas([l5], [pBase])

    expect(visitas.has('NF5')).toBe(false)
  })

  describe('visitasPorNfBridge (achado real 25/08: posicao continua real via monitoramento)', () => {
    it('ponte presente com chegada/saida: SUBSTITUI a visita do algoritmo antigo (mesmo quando o antigo achou outra coisa)', () => {
      const l1 = linha('NF1', -22.9, -43.2)
      const p1 = parada({ lat: -22.9001, lng: -43.2001, chegada: '2026-08-20T10:00:00.000Z', fim_real: '2026-08-20T10:10:00.000Z' })
      const bridge = new Map([['NF1', { chegada: '2026-08-20T10:17:00.000Z', saida: '2026-08-20T10:28:00.000Z' }]])

      const visitas = montarVisitas([l1], [p1], bridge)

      expect(visitas.get('NF1')).toEqual({
        nf: 'NF1',
        chegada: '2026-08-20T10:17:00.000Z',
        saida: '2026-08-20T10:28:00.000Z',
        distanciaMetrosDoPonto: 0,
        viaVizinhanca: false,
      })
    })

    it('achado real 30/08: bridge com viaVizinhanca=true repassa a marcacao pra Visita', () => {
      const l1 = linha('NF1', -22.9, -43.2)
      const bridge = new Map([['NF1', { chegada: '2026-08-30T10:00:00.000Z', saida: '2026-08-30T10:15:00.000Z', viaVizinhanca: true }]])

      const visitas = montarVisitas([l1], [], bridge)

      expect(visitas.get('NF1')?.viaVizinhanca).toBe(true)
    })

    // Achado real 06/09: mesmo raciocinio do viaVizinhanca acima, mas pro
    // raio ampliado da PROPRIA ponte (ver RAIO_AMPLIADO_M no monitoramento).
    it('achado real 06/09: bridge com viaRaioAmpliado=true repassa a marcacao pra Visita', () => {
      const l1 = linha('NF1', -22.9, -43.2)
      const bridge = new Map([['NF1', { chegada: '2026-09-06T10:00:00.000Z', saida: '2026-09-06T10:27:00.000Z', viaRaioAmpliado: true }]])

      const visitas = montarVisitas([l1], [], bridge)

      expect(visitas.get('NF1')?.viaRaioAmpliado).toBe(true)
    })

    it('ponte presente mas com chegada/saida null: REMOVE a visita do algoritmo antigo (confia que nunca foi visitado)', () => {
      const l1 = linha('NF1', -22.9, -43.2)
      const p1 = parada({ lat: -22.9001, lng: -43.2001 }) // algoritmo antigo acharia visita aqui
      const bridge = new Map([['NF1', { chegada: null, saida: null }]])

      const visitas = montarVisitas([l1], [p1], bridge)

      expect(visitas.has('NF1')).toBe(false)
    })

    it('NF ausente do mapa da ponte (ponte nao respondeu por ela): mantem o resultado do algoritmo antigo', () => {
      const l1 = linha('NF1', -22.9, -43.2)
      const p1 = parada({ lat: -22.9001, lng: -43.2001, chegada: '2026-08-20T10:00:00.000Z', fim_real: '2026-08-20T10:10:00.000Z' })
      const bridge = new Map<string, { chegada: string | null; saida: string | null }>() // vazio -- NF1 nao esta aqui

      const visitas = montarVisitas([l1], [p1], bridge)

      expect(visitas.get('NF1')).toEqual({
        nf: 'NF1',
        chegada: '2026-08-20T10:00:00.000Z',
        saida: '2026-08-20T10:10:00.000Z',
        distanciaMetrosDoPonto: expect.any(Number),
      })
    })

    it('sem ponte nenhuma (undefined): comportamento identico a antes desta extensao', () => {
      const l1 = linha('NF1', -22.9, -43.2)
      const p1 = parada({ lat: -22.9001, lng: -43.2001 })

      const visitas = montarVisitas([l1], [p1], undefined)

      expect(visitas.has('NF1')).toBe(true)
    })
  })
})
