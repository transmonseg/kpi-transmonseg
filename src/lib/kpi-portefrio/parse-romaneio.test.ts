import { describe, it, expect } from 'vitest'
import { parseRomaneioPortefrioTexto, type ItemComPagina } from './parse-romaneio'

const ITENS_EXEMPLO: ItemComPagina[] = [
  // cabecalho (deve ser ignorado -- nenhum item tem placa valida em x<25)
  { str: 'Placa', x: 15, y: 822, page: 1 },
  { str: 'Ordem de', x: 546, y: 827, page: 1 },
  { str: 'atendimento', x: 542, y: 818, page: 1 },

  // registro 1: sem quebra de linha extra, tudo numa linha so
  { str: 'AAA1B23', x: 7, y: 700, page: 1 },
  { str: '111111', x: 44, y: 700, page: 1 },
  { str: '11111111', x: 71, y: 700, page: 1 },
  { str: 'EMPRESA TESTE LTDA', x: 106, y: 700, page: 1 },
  { str: 'LOJA TESTE', x: 191, y: 700, page: 1 },
  { str: 'RUA TESTE', x: 273, y: 700, page: 1 },
  { str: '10', x: 343, y: 700, page: 1 },
  { str: '20000000', x: 374, y: 700, page: 1 },
  { str: 'CENTRO', x: 410, y: 700, page: 1 },
  { str: 'CIDADE X', x: 481, y: 700, page: 1 },
  { str: 'RJ', x: 526, y: 700, page: 1 },
  { str: '1', x: 539, y: 700, page: 1 },

  // registro 2: razao social quebra em 2 linhas (acima E abaixo da ancora)
  { str: 'RAZAO SOCIAL', x: 106, y: 685, page: 1 }, // continuacao ACIMA
  { str: 'BBB4C56', x: 7, y: 680, page: 1 }, // ANCORA
  { str: '222222', x: 44, y: 680, page: 1 },
  { str: '22222222', x: 71, y: 680, page: 1 },
  { str: 'PARTE 1 DA', x: 106, y: 680, page: 1 },
  { str: 'LOJA DOIS', x: 191, y: 680, page: 1 },
  { str: 'AVENIDA TESTE', x: 273, y: 680, page: 1 },
  { str: '20', x: 343, y: 680, page: 1 },
  { str: '30000000', x: 374, y: 680, page: 1 },
  { str: 'JARDIM', x: 410, y: 680, page: 1 },
  { str: 'CIDADE Y', x: 481, y: 680, page: 1 },
  { str: 'RJ', x: 526, y: 680, page: 1 },
  { str: '2', x: 539, y: 680, page: 1 },
  { str: 'EXTENSA LTDA', x: 106, y: 675, page: 1 }, // continuacao ABAIXO
]

// Pagina 2: cabecalho COMPLETO (12/12 rotulos), com colunas deslocadas pra
// direita em relacao as FAIXAS_PADRAO (mesmo padrao observado no PDF real,
// onde a largura das colunas se auto-ajusta por pagina). Numero/CEP/
// Bairro/Cidade/UF ficam em posicoes que so caem no bucket certo se as
// faixas forem calculadas dinamicamente a partir DESTE cabecalho -- se o
// parser caisse no fallback (FAIXAS_PADRAO), cada um desses 5 campos
// classificaria errado (ex: Numero cairia no bucket de CEP).
const ITENS_CABECALHO_COMPLETO_DESLOCADO: ItemComPagina[] = [
  { str: 'Placa', x: 15, y: 830, page: 2 },
  { str: 'Código', x: 44, y: 830, page: 2 },
  { str: 'CNPJ', x: 78, y: 830, page: 2 },
  { str: 'Razão social', x: 130, y: 830, page: 2 },
  { str: 'Nome informal', x: 215, y: 830, page: 2 },
  { str: 'Endereço', x: 310, y: 830, page: 2 },
  { str: 'Número', x: 368, y: 830, page: 2 },
  { str: 'CEP', x: 408, y: 830, page: 2 },
  { str: 'Bairro', x: 452, y: 830, page: 2 },
  { str: 'Cidade', x: 498, y: 830, page: 2 },
  { str: 'UF', x: 528, y: 830, page: 2 },
  { str: 'Ordem de', x: 548, y: 835, page: 2 },
  { str: 'atendimento', x: 544, y: 826, page: 2 },
]

const ITENS_REGISTRO_PAGINA_DESLOCADA: ItemComPagina[] = [
  ...ITENS_CABECALHO_COMPLETO_DESLOCADO,
  { str: 'CCC7D89', x: 7, y: 700, page: 2 },
  { str: '333333', x: 44, y: 700, page: 2 },
  { str: '33333333', x: 78, y: 700, page: 2 },
  { str: 'EMPRESA DINAMICA LTDA', x: 106, y: 700, page: 2 },
  { str: 'LOJA DINAMICA', x: 180, y: 700, page: 2 },
  { str: 'RUA DINAMICA', x: 270, y: 700, page: 2 },
  // Numero (x=365): dentro da faixa dinamica [339,388), mas fora da faixa
  // PADRAO de numero [308,358) -- cairia no bucket de CEP se o parser nao
  // calculasse as faixas dinamicamente pra esta pagina.
  { str: '99', x: 365, y: 700, page: 2 },
  // CEP (x=405): dentro da dinamica [388,430), fora da PADRAO [358,392).
  { str: '30000000', x: 405, y: 700, page: 2 },
  // Bairro (x=450): dentro da dinamica [430,475), fora da PADRAO [392,445).
  { str: 'BAIRRO NOVO', x: 450, y: 700, page: 2 },
  // Cidade (x=505): dentro da dinamica [475,513), fora da PADRAO [445,503).
  { str: 'CIDADE DINAMICA', x: 505, y: 700, page: 2 },
  // UF (x=535): dentro da dinamica [513,538), fora da PADRAO [503,532).
  { str: 'RJ', x: 535, y: 700, page: 2 },
  { str: '1', x: 545, y: 700, page: 2 },
]

describe('parseRomaneioPortefrioTexto', () => {
  it('ignora o cabecalho (nenhuma linha-ancora antes do primeiro registro)', () => {
    const linhas = parseRomaneioPortefrioTexto(ITENS_EXEMPLO)
    expect(linhas).toHaveLength(2)
  })

  it('registro sem quebra de linha extrai todos os campos da ancora', () => {
    const linhas = parseRomaneioPortefrioTexto(ITENS_EXEMPLO)
    expect(linhas[0]).toEqual({
      placa: 'AAA1B23',
      codigoCliente: '111111',
      cnpj: '11111111',
      razaoSocial: 'EMPRESA TESTE LTDA',
      nomeInformal: 'LOJA TESTE',
      endereco: 'RUA TESTE',
      numero: '10',
      cep: '20000000',
      bairro: 'CENTRO',
      cidade: 'CIDADE X',
      uf: 'RJ',
      ordem: 1,
    })
  })

  it('registro com razao social quebrada em 2 linhas concatena na ordem de leitura (cima pra baixo)', () => {
    const linhas = parseRomaneioPortefrioTexto(ITENS_EXEMPLO)
    expect(linhas[1].razaoSocial).toBe('RAZAO SOCIAL PARTE 1 DA EXTENSA LTDA')
    expect(linhas[1].placa).toBe('BBB4C56')
    expect(linhas[1].ordem).toBe(2)
  })

  it('calcula as faixas de coluna dinamicamente a partir do cabecalho da pagina (colunas deslocadas)', () => {
    const linhas = parseRomaneioPortefrioTexto(ITENS_REGISTRO_PAGINA_DESLOCADA)
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toEqual({
      placa: 'CCC7D89',
      codigoCliente: '333333',
      cnpj: '33333333',
      razaoSocial: 'EMPRESA DINAMICA LTDA',
      nomeInformal: 'LOJA DINAMICA',
      endereco: 'RUA DINAMICA',
      numero: '99',
      cep: '30000000',
      bairro: 'BAIRRO NOVO',
      cidade: 'CIDADE DINAMICA',
      uf: 'RJ',
      ordem: 1,
    })
  })
})
