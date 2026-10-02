import { describe, it, expect } from 'vitest'
import { parseRomaneioTexto } from './parse-romaneio'
import { chaveCacheEndereco } from './endereco-cep'

const TEXTO_EXEMPLO = `
PLACA/MOTORISTA:  RQU6E83 / JOBERTO DA MATA REIS          CARGA/DESTINO:96149 / ITAPERUNA
AJUDANTE(S):  ,

NF / CLIENTE:
2331233 / 136063 - RESTAURANTE CAIÇARA
ROD BR 356, S/N - BOA FORTUNA, ITAPERUNA - KM 03
NF / CLIENTE:
2331234 / 136347 - MERCADO IDEAL
RUA OLIVIA FARIA, 29 - CENTRO, ITALVA - *
Total de 2 clientes
`

describe('parseRomaneioTexto', () => {
  it('extrai as linhas de um bloco de carga', () => {
    const linhas = parseRomaneioTexto(TEXTO_EXEMPLO)
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toEqual({
      carga: '96149',
      destino: 'ITAPERUNA',
      placa: 'RQU6E83',
      motorista: 'JOBERTO DA MATA REIS',
      ajudantes: [],
      nf: '2331233',
      clienteCodigo: '136063',
      clienteNome: 'RESTAURANTE CAIÇARA',
      endereco: 'ROD BR 356, S/N - BOA FORTUNA, ITAPERUNA - KM 03',
    })
  })

  it('duas cargas seguidas nao vazam contexto uma na outra', () => {
    const dupla = TEXTO_EXEMPLO + `
PLACA/MOTORISTA:  TTL5J17 / OUTRO MOTORISTA          CARGA/DESTINO:96150 / OUTRO DESTINO
AJUDANTE(S):  ,

NF / CLIENTE:
9999999 / 000000 - OUTRO CLIENTE
RUA X, 1 - BAIRRO, CIDADE - *
`
    const linhas = parseRomaneioTexto(dupla)
    expect(linhas).toHaveLength(3)
    expect(linhas[2].carga).toBe('96150')
    expect(linhas[2].placa).toBe('TTL5J17')
  })

  it('ajudantes preenchidos sao separados corretamente', () => {
    const comAjudantes = TEXTO_EXEMPLO.replace('AJUDANTE(S):  ,', 'AJUDANTE(S): FULANO DE TAL, CICLANO')
    const linhas = parseRomaneioTexto(comAjudantes)
    expect(linhas[0].ajudantes).toEqual(['FULANO DE TAL', 'CICLANO'])
  })

  it('duas linhas de NF/CLIENTE consecutivas sem endereco entre elas: a primeira nao e descartada', () => {
    const texto = `
PLACA/MOTORISTA:  RQU6E83 / JOBERTO DA MATA REIS          CARGA/DESTINO:96149 / ITAPERUNA
AJUDANTE(S):  ,

NF / CLIENTE:
2331233 / 136063 - RESTAURANTE CAIÇARA
2331234 / 136347 - MERCADO IDEAL
RUA OLIVIA FARIA, 29 - CENTRO, ITALVA - *
Total de 2 clientes
`
    const linhas = parseRomaneioTexto(texto)
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toEqual({
      carga: '96149',
      destino: 'ITAPERUNA',
      placa: 'RQU6E83',
      motorista: 'JOBERTO DA MATA REIS',
      ajudantes: [],
      nf: '2331233',
      clienteCodigo: '136063',
      clienteNome: 'RESTAURANTE CAIÇARA',
      endereco: '(endereço não identificado)',
    })
    expect(linhas[1]).toEqual({
      carga: '96149',
      destino: 'ITAPERUNA',
      placa: 'RQU6E83',
      motorista: 'JOBERTO DA MATA REIS',
      ajudantes: [],
      nf: '2331234',
      clienteCodigo: '136347',
      clienteNome: 'MERCADO IDEAL',
      endereco: 'RUA OLIVIA FARIA, 29 - CENTRO, ITALVA - *',
    })
  })

  // Formato do PDF a partir de 01/10/2026: CEP no fim do endereco (trecho
  // literal do Romaneio real nutrimax/2026-10-01/b51b33ae...). O parse mantem a
  // linha como veio (CEP disponivel na linha); quem tira o CEP pra montar a
  // chave do cache de geocode e' chaveCacheEndereco (geocode.ts).
  it('formato de 01/10: endereco vem com o sufixo de CEP e a chave do cache sai sem ele', () => {
    const texto = `
8012 - Romaneio de Entrega
01/10/2026 06:40
PLACA/MOTORISTA:TOS1H26 / ROGERIO BESSA COSTA JUNIOR(CAMPOS)CARGA/DESTINO:99087 / ITAPERUNA
AJUDANTE(S):,
2399979 / 5778 - VIVACE  EMPREENDIMENTOS
RUA ANTONIO CUNHA, 502 - FRIGORIFICO, ITAPERUNA - ** - 28300000
NF / CLIENTE:
2399963 / 136409 - MERCADINHO DO BIGODE
R JOSE MIRANDA, 101 - CATARINO, CARDOSO MOREIRA - LOJA C LOJA D - 28180-000
NF / CLIENTE:
`
    const linhas = parseRomaneioTexto(texto)
    expect(linhas.map(l => l.endereco)).toEqual([
      'RUA ANTONIO CUNHA, 502 - FRIGORIFICO, ITAPERUNA - ** - 28300000',
      'R JOSE MIRANDA, 101 - CATARINO, CARDOSO MOREIRA - LOJA C LOJA D - 28180-000',
    ])
    expect(linhas.map(l => chaveCacheEndereco(l.endereco))).toEqual([
      'RUA ANTONIO CUNHA, 502 - FRIGORIFICO, ITAPERUNA',
      'RUA JOSE MIRANDA, 101 - CATARINO, CARDOSO MOREIRA',
    ])
  })
})

