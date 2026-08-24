import { describe, it, expect } from 'vitest'
import { montarVisitas } from './visitas'
import type { EventoRavex } from './types'

const CLIENTE_A = { codigoCliente: 'C1', lat: -22.8, lng: -43.2 }
const CLIENTE_B = { codigoCliente: 'C2', lat: -22.9, lng: -43.3 }

function evento(dataHora: string, lat: number, lng: number, temperatura: number | null = null): EventoRavex {
  return { dataHora, lat, lng, temperatura }
}

describe('montarVisitas', () => {
  it('evento dentro do raio de um cliente vira visita', () => {
    const eventos = [evento('2026-08-24T10:00:00Z', -22.8, -43.2, -18)]
    const visitas = montarVisitas(eventos, [CLIENTE_A, CLIENTE_B])
    expect(visitas.has('C1')).toBe(true)
    expect(visitas.get('C1')?.chegada).toBe('2026-08-24T10:00:00Z')
    expect(visitas.get('C1')?.saida).toBe('2026-08-24T10:00:00Z')
    expect(visitas.get('C1')?.temperaturas).toEqual([-18])
  })

  it('eventos consecutivos do MESMO cliente agrupam numa unica visita (chegada=primeiro, saida=ultimo)', () => {
    const eventos = [
      evento('2026-08-24T10:00:00Z', -22.8, -43.2, -18),
      evento('2026-08-24T10:05:00Z', -22.8, -43.2, -17.5),
      evento('2026-08-24T10:10:00Z', -22.8, -43.2, -17),
    ]
    const visitas = montarVisitas(eventos, [CLIENTE_A])
    expect(visitas.size).toBe(1)
    const v = visitas.get('C1')!
    expect(v.chegada).toBe('2026-08-24T10:00:00Z')
    expect(v.saida).toBe('2026-08-24T10:10:00Z')
    expect(v.temperaturas).toEqual([-18, -17.5, -17])
  })

  it('evento fora do raio de qualquer cliente nao gera visita', () => {
    const eventos = [evento('2026-08-24T10:00:00Z', 0, 0)]
    const visitas = montarVisitas(eventos, [CLIENTE_A, CLIENTE_B])
    expect(visitas.size).toBe(0)
  })

  it('cliente sem coordenada (geocodificacao falhou) nunca gera visita', () => {
    const eventos = [evento('2026-08-24T10:00:00Z', -22.8, -43.2)]
    const clienteSemGeo = { codigoCliente: 'C3', lat: null, lng: null }
    const visitas = montarVisitas(eventos, [clienteSemGeo])
    expect(visitas.size).toBe(0)
  })

  it('visita a dois clientes diferentes em sequencia gera duas visitas separadas', () => {
    const eventos = [
      evento('2026-08-24T10:00:00Z', -22.8, -43.2),
      evento('2026-08-24T11:00:00Z', -22.9, -43.3),
    ]
    const visitas = montarVisitas(eventos, [CLIENTE_A, CLIENTE_B])
    expect(visitas.size).toBe(2)
    expect(visitas.has('C1')).toBe(true)
    expect(visitas.has('C2')).toBe(true)
  })

  it('evento com lat/lng NaN (miss upstream do filtro de coordenada) nao gera visita', () => {
    const eventos = [evento('2026-08-24T10:00:00Z', NaN, NaN)]
    const visitas = montarVisitas(eventos, [CLIENTE_A, CLIENTE_B])
    expect(visitas.size).toBe(0)
  })

  it('ping isolado de volta ao mesmo cliente (nao-consecutivo) nao estende a visita antiga -- fica a de maior duracao', () => {
    const eventos = [
      // Visita real a C1: dois eventos consecutivos, 08:00-08:10 (10min de duracao).
      evento('2026-08-24T08:00:00Z', -22.8, -43.2, -18),
      evento('2026-08-24T08:10:00Z', -22.8, -43.2, -17.5),
      // Visita real a C2, no meio.
      evento('2026-08-24T11:00:00Z', -22.9, -43.3),
      // Ping isolado de volta perto de C1 -- rota passando de novo pela rua, nao uma parada.
      evento('2026-08-24T16:00:00Z', -22.8, -43.2, -10),
    ]
    const visitas = montarVisitas(eventos, [CLIENTE_A, CLIENTE_B])
    expect(visitas.size).toBe(2)
    expect(visitas.has('C1')).toBe(true)
    expect(visitas.has('C2')).toBe(true)
    const c1 = visitas.get('C1')!
    // A visita real (maior duracao) vence -- o ping das 16:00 nao contamina saida/temperaturas.
    expect(c1.chegada).toBe('2026-08-24T08:00:00Z')
    expect(c1.saida).toBe('2026-08-24T08:10:00Z')
    expect(c1.temperaturas).toEqual([-18, -17.5])
  })
})
