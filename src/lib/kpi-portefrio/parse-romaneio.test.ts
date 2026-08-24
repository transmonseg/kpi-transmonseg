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
})
