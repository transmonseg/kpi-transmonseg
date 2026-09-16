import { describe, it, expect } from 'vitest'
import { parsePaoTexto } from './parse-pao'

// Texto real extraido via pdf-parse de "PROGRAMAÇÃO JAC (CONGELADO) 15-09.pdf"
// (grupo WhatsApp KPI AJUSTES, 15/09) -- ROMANEIO 1 completo.
const ROMANEIO_1 = `
DATA15/09/2026
ROMANEIO1MOTORISTAAJUDANTE
CARRO36TTI-9B98
Luis Paulo-
ORDEMNOTA FISCALCLIENTEENDEREÇOBAIRROQTD CAIXASPESO BRUTO PESO LÍQUIDOVALOR BRUTO
5
215602HORTIFRUTI PASSAGEM                                                   RUA DA PASSAGEM ,133135                                                         BOTAFOGO                                38277,42662.741,04R$
4
215609HORTIFRUTI VOLUNTARIOS DA PATRIA                                      RUA VOLUNTARIOS DA PATRIA,323                                                   BOTAFOGO                                52382,63674.436,98R$
3002162,92073 R$ 20.241,71
`

describe('parsePaoTexto', () => {
  it('extrai as duas entregas do ROMANEIO 1, com carga prefixada PAO- e endereco no formato da cascata de geocode', () => {
    const { linhas } = parsePaoTexto(ROMANEIO_1, '2026-09-15')
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toEqual({
      carga: 'PAO-1',
      destino: 'BOTAFOGO',
      placa: 'TTI-9B98',
      motorista: 'Luis Paulo',
      ajudantes: [],
      nf: '215602',
      clienteCodigo: '215602',
      clienteNome: 'HORTIFRUTI PASSAGEM',
      endereco: 'RUA DA PASSAGEM ,133135 - BOTAFOGO, RIO DE JANEIRO - *',
    })
    expect(linhas[1].nf).toBe('215609')
    expect(linhas[1].endereco).toBe('RUA VOLUNTARIOS DA PATRIA,323 - BOTAFOGO, RIO DE JANEIRO - *')
  })

  it('sintetiza uma LinhaEscala pro ROMANEIO, evitando falso aviso de "sem escala"', () => {
    const { escala } = parsePaoTexto(ROMANEIO_1, '2026-09-15')
    expect(escala).toHaveLength(1)
    expect(escala[0]).toEqual({
      carga: 'PAO-1',
      placaRaw: 'TTI-9B98',
      placaNorm: 'TTI9B98',
      destino: 'BOTAFOGO',
      motorista: 'Luis Paulo',
      ajudante1: null,
      ajudante2: null,
      pesoKg: null,
      entPlanejado: null,
      nfPlanejado: null,
    })
  })

  it('linha de motorista+ajudante ambos vazios ("--"): motorista e ajudante ficam vazios, nao quebra', () => {
    const texto = `
DATA15/09/2026
ROMANEIO3MOTORISTAAJUDANTE
CARRO74TTK-8A87
--
ORDEMNOTA FISCALCLIENTEENDEREÇOBAIRROQTD CAIXASPESO BRUTO PESO LÍQUIDOVALOR BRUTO
7
215585HORTIFRUTI ATAULFO DE PAIVA                                           AVENIDA ATAUFO DE PAIVA,80                                                      LEBLON                                  604394214.869,48R$
5063687,5353647.408,36R$
`
    const { linhas, escala } = parsePaoTexto(texto, '2026-09-15')
    expect(linhas[0].motorista).toBe('')
    expect(linhas[0].ajudantes).toEqual([])
    expect(escala[0].motorista).toBe('')
    expect(escala[0].ajudante1).toBeNull()
  })

  it('linha de motorista+ajudante ambos preenchidos e colados: separa na transicao minuscula->maiuscula (melhor esforco, nao afeta confirmacao de entrega)', () => {
    const texto = `
DATA15/09/2026
ROMANEIO5MOTORISTAAJUDANTE
CARRO43TTI-6E49
Ednilson RicaldoniLucas Rafael
ORDEMNOTA FISCALCLIENTEENDEREÇOBAIRROQTD CAIXASPESO BRUTO PESO LÍQUIDOVALOR BRUTO
7
215629MERCADO ADONAI DE VARGEM                                              RUA PECEGUEIRO DO AMARAL 01                                                     VARGEM PEQUENA                          133970,99317.799,61R$
133970,99317.799,61R$
`
    const { linhas, escala } = parsePaoTexto(texto, '2026-09-15')
    expect(linhas[0].motorista).toBe('Ednilson Ricaldoni')
    expect(linhas[0].ajudantes).toEqual(['Lucas Rafael'])
    expect(escala[0].ajudante1).toBe('Lucas Rafael')
  })

  it('bairro conhecido de Niteroi vira municipio Niteroi no endereco geocodificavel (nao assume sempre Rio de Janeiro)', () => {
    // Texto real extraido de "PROGRAMAÇÃO JAC (CONGELADO) 14-09.pdf"
    const texto = `
DATA14/09/2026
ROMANEIO1MOTORISTAAJUDANTE
CARRO36TTI-9B98
Luis Paulo-
ORDEMNOTA FISCALCLIENTEENDEREÇOBAIRROQTD CAIXASPESO BRUTO PESO LÍQUIDOVALOR BRUTO
6
215551PEROLA DE PENDOTIBA                                                   EST. CAETANO MONTEIRO,922                                                       BADU                                    643,8421.182,60R$
643,8421.182,60R$
`
    const { linhas } = parsePaoTexto(texto, '2026-09-14')
    expect(linhas[0].endereco).toBe('EST. CAETANO MONTEIRO,922 - BADU, NITEROI - *')
  })

  it('dois ROMANEIOs no mesmo arquivo nao vazam placa/motorista um pro outro', () => {
    const texto = `
DATA15/09/2026
ROMANEIO1MOTORISTAAJUDANTE
CARRO36TTI-9B98
Luis Paulo-
ORDEMNOTA FISCALCLIENTEENDEREÇOBAIRROQTD CAIXASPESO BRUTO PESO LÍQUIDOVALOR BRUTO
5
215602HORTIFRUTI PASSAGEM                                                   RUA DA PASSAGEM ,133                                                            BOTAFOGO                                38277,42662.741,04R$
38277,42662.741,04R$
ROMANEIO2MOTORISTAAJUDANTE
CARRO73TTL-5J17
Jorge Paiva-
ORDEMNOTA FISCALCLIENTEENDEREÇOBAIRROQTD CAIXASPESO BRUTO PESO LÍQUIDOVALOR BRUTO
4
215624PREZUNIC LARANJEIRAS                                                  R DAS LARANJEIRAS,139                                                           LARANJEIRAS                             40292280 1.960,00R$
40292280 1.960,00R$
`
    const { linhas } = parsePaoTexto(texto, '2026-09-15')
    expect(linhas).toHaveLength(2)
    expect(linhas[0].placa).toBe('TTI-9B98')
    expect(linhas[0].carga).toBe('PAO-1')
    expect(linhas[1].placa).toBe('TTL-5J17')
    expect(linhas[1].carga).toBe('PAO-2')
    expect(linhas[1].motorista).toBe('Jorge Paiva')
  })

  it('data do cabecalho do PDF diferente da data pedida: lanca erro claro', () => {
    expect(() => parsePaoTexto(ROMANEIO_1, '2026-09-16')).toThrow(/15\/09\/2026.*2026-09-16|dia 2026-09-15.*2026-09-16/)
  })

  it('sem cabecalho DATA nenhum: lanca erro claro (PDF errado)', () => {
    expect(() => parsePaoTexto('ROMANEIO1MOTORISTAAJUDANTE\nCARRO36TTI-9B98\n--\n', '2026-09-15')).toThrow(/DATA/)
  })

  it('romaneio sem nenhuma entrega valida (so cabecalho): nao gera linha nem escala, nao quebra', () => {
    const texto = `
DATA15/09/2026
ROMANEIO9MOTORISTAAJUDANTE
CARRO56RQO-1B27
--
ORDEMNOTA FISCALCLIENTEENDEREÇOBAIRROQTD CAIXASPESO BRUTO PESO LÍQUIDOVALOR BRUTO
`
    const { linhas, escala } = parsePaoTexto(texto, '2026-09-15')
    expect(linhas).toEqual([])
    expect(escala).toEqual([])
  })
})
