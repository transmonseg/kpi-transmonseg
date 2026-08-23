import { describe, it, expect } from 'vitest'
import { linhaParaEscala } from './parse-escala'

function item(str: string, x: number) { return { str, x } }

describe('linhaParaEscala', () => {
  it('extrai uma linha completa', () => {
    const items = [
      item('93758', 10),
      item('TTL7D40', 40),
      item('CAMPOS', 90),
      item('1.200', 190),
      item('8', 220),
      item('12 LUAN VIANA AREAS RIBEIRO', 240),
      item('LEANDRO DA HORA BATISTA', 400),
    ]
    const linha = linhaParaEscala(items)
    expect(linha).toEqual({
      carga: '93758',
      placaRaw: 'TTL7D40',
      placaNorm: 'TTL7D40',
      destino: 'CAMPOS',
      motorista: 'LUAN VIANA AREAS RIBEIRO',
      ajudante1: 'LEANDRO DA HORA BATISTA',
      ajudante2: null,
      pesoKg: 1200,
      entPlanejado: 8,
      nfPlanejado: 12,
    })
  })

  it('linha sem carga valida (cabecalho/titulo) volta null', () => {
    expect(linhaParaEscala([item('CARGA', 10), item('PLACA', 40)])).toBeNull()
  })

  it('linha sem placa reconhecivel volta null', () => {
    expect(linhaParaEscala([item('93758', 10), item('texto qualquer', 40)])).toBeNull()
  })
})
