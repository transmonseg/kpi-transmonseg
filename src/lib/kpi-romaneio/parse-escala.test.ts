import { describe, it, expect } from 'vitest'
import { linhaParaEscala } from './parse-escala'
import { duplicadoDaEscala } from './escala-duplicado'

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
      duplicado: null,
    })
  })

  it('linha sem carga valida (cabecalho/titulo) volta null', () => {
    expect(linhaParaEscala([item('CARGA', 10), item('PLACA', 40)])).toBeNull()
  })

  it('linha sem placa reconhecivel volta null', () => {
    expect(linhaParaEscala([item('93758', 10), item('texto qualquer', 40)])).toBeNull()
  })
})

// F3-06 (ING-12): a coluna x 715-820 da 8081 tem o cabeçalho DUPLICADO (101 de
// 102 PDFs). Em 23/10: "MOT," em 5 cargas (100711 RBJ2J67, 100733, 100785,
// 100772, 100751 LLD4202); "SEM RASTRI" nunca apareceu em 14 dias.
describe('coluna DUPLICADO da Escala de Rota (F3-06)', () => {
  it('100751 LLD4202 de 23/10: "MOT," vai para duplicado', () => {
    const l = linhaParaEscala([item('100751', 10), item('LLD4202', 40), item('JOSE ROBERTO', 90), item('122', 200), item('1', 220), item('2 NELSON REIS MENDES SOARES', 240), item('MOT,', 760)])
    expect(l?.duplicado).toBe('MOT,')
    expect(l).not.toHaveProperty('statusRastreador')
  })
  it('escala guardada antes da troca de nome (statusRastreador) continua lida', () => {
    expect(duplicadoDaEscala({ statusRastreador: 'VEICULO' })).toBe('VEICULO')
    expect(duplicadoDaEscala({ duplicado: 'MOT,', statusRastreador: 'X' })).toBe('MOT,')
    expect(duplicadoDaEscala({})).toBeNull()
    expect(duplicadoDaEscala(undefined)).toBeNull()
  })
})
