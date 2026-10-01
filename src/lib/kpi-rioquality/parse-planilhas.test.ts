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
    const { linhas, enderecoBrutoPorNf, ruaPorNf } = montarLinhasRomaneioCompleto(parseEntregasCompletas(COMPLETA))
    expect(linhas[0]).toMatchObject({
      carga: 'CHICO BENTO - BOTAFOGO 05/09', destino: 'CHICO BENTO - BOTAFOGO 05/09',
      placa: 'LRT6H89', nf: 'LRT6H89-1', motorista: 'DANIEL SILVA', clienteNome: '2F CAFE 2G LTDA',
      endereco: 'AVENIDA MARACANA - MARACANA, RIO DE JANEIRO',
    })
    expect(linhas[1].nf).toBe('LRT6H89-2')
    expect(enderecoBrutoPorNf.get('LRT6H89-1')).toBe('AVENIDA MARACANA, - MARACANA, RIO DE JANEIRO - RJ')
    expect(ruaPorNf.get('LRT6H89-1')).toBe('AVENIDA MARACANA')
  })
})

// Task 2 (plano 2026-09-30, estudo item 5c): linha de Entregas SEM placa era
// descartada (`continue`) e a entrega sumia calada do relatorio. Agora fica
// com placa '' -> CARGA SEM PLACA (fora da taxa) no pipeline.
describe('linha sem placa (CARGA SEM PLACA)', () => {
  it('formato antigo: entrega sem placa e mantida com placaNorm vazia', () => {
    const e = parseEntregas(planilha([['Relatório de Entregas', null], ['Placa', 'Endereço'], ['RJM5B51', 'RUA NOVE'], [null, 'RUA SEM DONO']]))
    expect(e).toEqual([{ placaNorm: 'RJM5B51', rua: 'RUA NOVE' }, { placaNorm: '', rua: 'RUA SEM DONO' }])
  })
  it('formato novo: entrega sem placa e mantida com placaNorm vazia', () => {
    const e = parseEntregasCompletas(planilha([
      ['Razão Social', 'Cidade', 'UF', 'Destino', 'Motorista', 'Placa', 'Endereço', 'Bairro'],
      ['MERCADO X', 'NITEROI', 'RJ', 'NIT 1', 'JOAO', '', 'RUA A', 'CENTRO'],
    ]))
    expect(e).toHaveLength(1)
    expect(e[0].placaNorm).toBe('')
  })
  it('linha totalmente vazia continua ignorada', () => {
    expect(parseEntregas(planilha([['Relatório de Entregas', null], ['Placa', 'Endereço'], [null, null]]))).toEqual([])
  })
})

// TERCEIRO formato (achado real 30/09, "Relatório de Entregas (14)"): 55
// colunas com NF real, codigo do cliente, romaneio, rota, check-in/out e
// status da entrega. Detectado pelo cabecalho; sai nas MESMAS linhas do
// formato novo, mas com NF real e gabarito (check-in/status) opcional.
import { CABECALHO_55, LINHAS_55, colunaIdx } from './entregas-55col.fixture'

const ARQ_55 = planilha([['Relatório de Entregas'], CABECALHO_55, ...LINHAS_55])

describe('formato 55 colunas (NF real + check-in)', () => {
  it('detecta pelo cabeçalho e lê NF real, código do cliente, romaneio, rota e gabarito', () => {
    const e = parseEntregasCompletas(ARQ_55)
    expect(e).toHaveLength(4)
    expect(e[0]).toMatchObject({
      placaNorm: 'LAT9F36', clienteNome: 'BUCANEIROS RECREIO LTDA', cidade: 'RIO DE JANEIRO', uf: 'RJ',
      destino: 'TROVAO -  RECREIO - 30/09', motorista: 'LUIZ EDUARDO RIBEIRO',
      rua: 'AVENIDA DAS AMERICAS', bairro: 'BARRA DA TIJUCA',
      nf: '5512949', clienteCodigo: '99419', romaneio: '1158583', rota: 'SUDOESTE 1',
      gabarito: {
        status: 'Entregue', checkIn: true, checkOut: true,
        dataCheckIn: '30/09/2026 10:30:43', dataCheckOut: '30/09/2026 10:31:06', motivoDevolucao: null,
      },
    })
    expect(e[1].gabarito).toMatchObject({ status: 'Faturado', checkIn: false, checkOut: false, dataCheckIn: null })
    expect(e[2].gabarito).toMatchObject({ status: 'Devolvido', checkIn: true, motivoDevolucao: 'PEDIDO EM DESACORDO' })
  })
  it('apara espaços de cidade/bairro/cliente (o arquivo real tem padding)', () => {
    const linha = [...LINHAS_55[0]]
    linha[colunaIdx('Cidade')] = 'RIO DE JANEIRO      '
    linha[colunaIdx('Bairro')] = 'RECREIO DOS BANDEIRANTES  '
    const e = parseEntregasCompletas(planilha([['Relatório de Entregas'], CABECALHO_55, linha]))
    expect(e[0].cidade).toBe('RIO DE JANEIRO')
    expect(e[0].bairro).toBe('RECREIO DOS BANDEIRANTES')
  })
  it('vira LinhaRomaneio com NF REAL, carga = romaneio, destino = rota, código do cliente, endereço bruto com cidade/UF', () => {
    const { linhas, enderecoBrutoPorNf, ruaPorNf } = montarLinhasRomaneioCompleto(parseEntregasCompletas(ARQ_55))
    expect(linhas[0]).toMatchObject({
      carga: '1158583', destino: 'SUDOESTE 1', placa: 'LAT9F36', nf: '5512949',
      clienteCodigo: '99419', clienteNome: 'BUCANEIROS RECREIO LTDA', motorista: 'LUIZ EDUARDO RIBEIRO',
      endereco: 'AVENIDA DAS AMERICAS - BARRA DA TIJUCA, RIO DE JANEIRO',
    })
    expect(linhas.map(l => l.nf)).toEqual(['5512949', '5512934', '5511706', '5512088'])
    expect(enderecoBrutoPorNf.get('5512088')).toBe('10 R EZER TEIXEIRA DE MELLO, - PRAIA DOS ANJOS, ARRAIAL DO CABO - RJ')
    expect(ruaPorNf.get('5511706')).toBe('RUA CUSTODIO NUNES')
  })
  it('linha sem placa fica com placa vazia (CARGA SEM PLACA no pipeline)', () => {
    const linha = [...LINHAS_55[0]]
    linha[colunaIdx('Placa')] = null
    const { linhas } = montarLinhasRomaneioCompleto(parseEntregasCompletas(planilha([['Relatório de Entregas'], CABECALHO_55, linha])))
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ placa: '', nf: '5512949' })
  })
  it('NF repetida no arquivo não colide (sufixo), para não fundir visitas', () => {
    const { linhas } = montarLinhasRomaneioCompleto(parseEntregasCompletas(planilha([['Relatório de Entregas'], CABECALHO_55, LINHAS_55[0], LINHAS_55[0]])))
    expect(linhas.map(l => l.nf)).toEqual(['5512949', '5512949-2'])
  })
  it('formato novo de 8 colunas continua sem NF real nem gabarito', () => {
    const e = parseEntregasCompletas(COMPLETA)
    expect(e[0].nf).toBeUndefined()
    expect(e[0].gabarito).toBeUndefined()
  })
})
