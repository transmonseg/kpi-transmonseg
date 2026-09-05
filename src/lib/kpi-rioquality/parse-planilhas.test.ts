import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseCustos, parseEntregas, rotaParaZona, montarLinhasRomaneio, parseEntregasCompletas, montarLinhasRomaneioCompleto, montarEnderecoBrutoCompleto } from './parse-planilhas'

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

// Formato NOVO (achado real 06/09): um único arquivo com Razão Social,
// Cidade, UF, Destino, Motorista, Placa, Endereço, Bairro -- substitui as
// duas planilhas de cima.
const COMPLETA = planilha([
  ['Relatório de Entregas', null, null, null, null, null, null, null],
  ['Razão Social', 'Cidade', 'UF', 'Destino', 'Motorista', 'Placa', 'Endereço', 'Bairro'],
  ['2F CAFE 2G LTDA', 'RIO DE JANEIRO', 'RJ', 'CHICO BENTO - BOTAFOGO 05/09', 'DANIEL SILVA', 'LRT6H89', 'AVENIDA MARACANA', 'MARACANA'],
  ['TAP CREP LTDA', 'NITEROI', 'RJ', 'PINGUIM - ICARAI 05/09', 'JOAO PEREIRA', 'lrt-6h89', 'RUA SAO DONATO', 'ICARAI'],
  ['SEM ENDERECO LTDA', 'RIO DE JANEIRO', 'RJ', 'CHICO BENTO - BOTAFOGO 05/09', 'DANIEL SILVA', 'LRT6H89', '', 'MARACANA'], // sem endereco: ignora
])

describe('parseEntregasCompletas', () => {
  it('acha o cabeçalho e devolve uma linha por entrega, placa normalizada', () => {
    const e = parseEntregasCompletas(COMPLETA)
    expect(e).toHaveLength(2)
    expect(e[0]).toEqual({
      placaNorm: 'LRT6H89', clienteNome: '2F CAFE 2G LTDA', cidade: 'RIO DE JANEIRO', uf: 'RJ',
      destino: 'CHICO BENTO - BOTAFOGO 05/09', motorista: 'DANIEL SILVA', rua: 'AVENIDA MARACANA', bairro: 'MARACANA',
    })
    expect(e[1].placaNorm).toBe('LRT6H89') // placa com hífen normaliza igual
  })
  it('planilha sem o cabeçalho esperado => vazio, não lança', () => {
    expect(parseEntregasCompletas(planilha([['qualquer', 'coisa'], ['a', 'b']])).length).toBe(0)
  })
})

describe('montarEnderecoBrutoCompleto', () => {
  it('monta no formato que a cascata de geocodificacao consegue extrair cidade/bairro (sem numero)', () => {
    expect(montarEnderecoBrutoCompleto('RUA X', 'CENTRO', 'CAMBUCI', 'RJ')).toBe('RUA X, - CENTRO, CAMBUCI - RJ')
  })
})

describe('montarLinhasRomaneioCompleto', () => {
  it('carga/destino = Destino da linha, cliente e motorista de verdade, nf sintética por placa', () => {
    const { linhas, enderecoBrutoPorNf } = montarLinhasRomaneioCompleto(parseEntregasCompletas(COMPLETA))
    expect(linhas[0]).toMatchObject({
      carga: 'CHICO BENTO - BOTAFOGO 05/09', destino: 'CHICO BENTO - BOTAFOGO 05/09',
      placa: 'LRT6H89', nf: 'LRT6H89-1', motorista: 'DANIEL SILVA', clienteNome: '2F CAFE 2G LTDA',
      endereco: 'AVENIDA MARACANA - MARACANA, RIO DE JANEIRO',
    })
    expect(linhas[1].nf).toBe('LRT6H89-2')
    expect(enderecoBrutoPorNf.get('LRT6H89-1')).toBe('AVENIDA MARACANA, - MARACANA, RIO DE JANEIRO - RJ')
  })
})
