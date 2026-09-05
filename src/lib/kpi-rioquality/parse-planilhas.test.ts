import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseCustos, parseEntregas, rotaParaZona, montarLinhasRomaneio } from './parse-planilhas'

// Reproduz o layout REAL das planilhas que a Rio Quality exporta (achado
// 05/09, arquivos "Relatório de Custos (3).xlsx" / "Relatório de Entregas
// (2).xlsx"): linha 1 = título, linha 2 = cabeçalho, às vezes uma linha em
// branco antes dos dados. Só 2 colunas em cada.
function planilha(aoa: unknown[][], nome = 'Relatrio'): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, nome)
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

const CUSTOS = planilha([
  ['Relatório de Custos', null],
  ['Veículo', 'Rota'],
  [null, null],
  ['PUT3E37', 'NORTE 4'],
  ['SRL9A58', 'SUDOESTE 2'],
  ['RJM5B51', 'BAIXADA 2'],
  ['LNH-8A79', 'C. VERDE 1'], // placa com hífen: normaliza igual
])

const ENTREGAS = planilha([
  ['Relatório de Entregas', null],
  ['Placa', 'Endereço'],
  ['RJM5B51', 'AV. AUTOMOVEL CLUBE'],
  ['RJM5B51', 'RUA NOVE'],
  ['RJM5B51', 'RUA SAO JOAO'],
  ['SRL9A58', 'AVENIDA DAS AMERICAS'],
  ['SRL9A58', ''], // linha vazia no meio: ignora
  ['ZZZ0Z00', 'RUA SEM ROTA'], // placa que não está no Custos
])

describe('parseCustos', () => {
  it('acha o cabeçalho depois da linha de título e devolve placa normalizada -> rota', () => {
    const m = parseCustos(CUSTOS)
    expect(m.get('PUT3E37')).toBe('NORTE 4')
    expect(m.get('RJM5B51')).toBe('BAIXADA 2')
    expect(m.get('LNH8A79')).toBe('C. VERDE 1')
    expect(m.size).toBe(4)
  })
  it('planilha sem o cabeçalho esperado => vazio, não lança', () => {
    expect(parseCustos(planilha([['qualquer', 'coisa'], ['a', 'b']])).size).toBe(0)
  })
  // Achado real 06/09: a Rio Quality manda "--" na coluna Rota quando o
  // veículo não tem rota atribuída (PUT3E37 em 04/09) -- sem isso o
  // relatório saía com "CARGA: --", parecendo bug nosso.
  it('rota "--" (sem rota atribuída pela Rio Quality) vira sem-rota, não literal "--"', () => {
    const m = parseCustos(planilha([['Relatório de Custos', null], ['Veículo', 'Rota'], ['PUT3E37', '--'], ['RJM5B51', 'BAIXADA 2']]))
    expect(m.has('PUT3E37')).toBe(false)
    expect(m.get('RJM5B51')).toBe('BAIXADA 2')
  })
})

describe('parseEntregas', () => {
  it('devolve as linhas na ordem do arquivo, ignorando rua vazia', () => {
    const l = parseEntregas(ENTREGAS)
    expect(l).toEqual([
      { placaNorm: 'RJM5B51', rua: 'AV. AUTOMOVEL CLUBE' },
      { placaNorm: 'RJM5B51', rua: 'RUA NOVE' },
      { placaNorm: 'RJM5B51', rua: 'RUA SAO JOAO' },
      { placaNorm: 'SRL9A58', rua: 'AVENIDA DAS AMERICAS' },
      { placaNorm: 'ZZZ0Z00', rua: 'RUA SEM ROTA' },
    ])
  })
})

describe('rotaParaZona', () => {
  it('traduz o nome da rota da Rio Quality pra zona genérica da ponte', () => {
    expect(rotaParaZona('SUL 1')).toBe('CAPITAL')
    expect(rotaParaZona('SUDOESTE 2')).toBe('CAPITAL')
    expect(rotaParaZona('NORTE 4')).toBe('CAPITAL')
    expect(rotaParaZona('OESTE 2')).toBe('CAPITAL')
    expect(rotaParaZona('CENTRO')).toBe('CAPITAL')
    expect(rotaParaZona('BAIXADA 2')).toBe('BAIXADA')
    expect(rotaParaZona('NIT 1')).toBe('LESTE')
    expect(rotaParaZona('SG 1')).toBe('LESTE')
    expect(rotaParaZona('LAGOS 4')).toBe('LAGOS')
    expect(rotaParaZona('R. SERRRANA 1')).toBe('SERRANA') // com o typo real do arquivo
    expect(rotaParaZona('R. SERRANA 2')).toBe('SERRANA')
    expect(rotaParaZona('SUL FLU 2')).toBe('SUL_FLUMINENSE')
    expect(rotaParaZona('NORTE FLU 1')).toBe('NORTE_FLUMINENSE')
    expect(rotaParaZona('C. VERDE 3')).toBe('COSTA_VERDE')
  })
  it('rota desconhecida ou vazia => null (sem prior de zona)', () => {
    expect(rotaParaZona('--')).toBeNull()
    expect(rotaParaZona(null)).toBeNull()
    expect(rotaParaZona('MARTE 1')).toBeNull()
  })
  it('"SUL FLU" não pode cair em "SUL" (prefixo mais longo primeiro)', () => {
    expect(rotaParaZona('SUL FLU 1')).toBe('SUL_FLUMINENSE')
    expect(rotaParaZona('NORTE FLU 2')).toBe('NORTE_FLUMINENSE')
  })
})

describe('montarLinhasRomaneio', () => {
  it('vira LinhaRomaneio do pipeline: carga/destino = rota, nf sintética por placa, endereço = rua', () => {
    const linhas = montarLinhasRomaneio(parseCustos(CUSTOS), parseEntregas(ENTREGAS))
    expect(linhas[0]).toMatchObject({
      carga: 'BAIXADA 2', destino: 'BAIXADA 2', placa: 'RJM5B51', nf: 'RJM5B51-1',
      endereco: 'AV. AUTOMOVEL CLUBE', clienteNome: 'AV. AUTOMOVEL CLUBE', clienteCodigo: '',
      motorista: '', ajudantes: [],
    })
    expect(linhas[1].nf).toBe('RJM5B51-2')
    expect(linhas[3]).toMatchObject({ placa: 'SRL9A58', nf: 'SRL9A58-1', carga: 'SUDOESTE 2' })
  })
  it('placa sem rota no Custos => carga "SEM ROTA" (não descarta a entrega)', () => {
    const linhas = montarLinhasRomaneio(parseCustos(CUSTOS), parseEntregas(ENTREGAS))
    expect(linhas.find(l => l.placa === 'ZZZ0Z00')).toMatchObject({ carga: 'SEM ROTA', destino: 'SEM ROTA' })
  })
})
