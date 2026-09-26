import { describe, it, expect, vi } from 'vitest'
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

  // Achado Important 5 da revisao FINAL de branch (15/09): CARRO_RE nao casa
  // quando a coluna de placa vem EM BRANCO no documento, e a leitura do
  // motorista estava condicionada a `ctx.placaRaw` -- a carga perdia a placa
  // E o motorista, mesmo com o motorista presente no PDF.
  //
  // LIMITACAO CONHECIDA: nenhum dos PDFs reais (14/09 e 15/09) esta neste
  // repo, e nenhuma das amostras de texto ja' salvas nos testes acima tem um
  // bloco CARRO sem placa -- o fixture abaixo e' SINTETICO, montado a partir
  // do padrao real de um bloco valido (ROMANEIO/CARRO/motorista/ORDEM/
  // entrega) com a placa removida. Trocar pelo texto real quando um PDF com
  // CARRO em branco aparecer.
  describe('bloco CARRO sem placa (fixture SINTETICO -- ver comentario)', () => {
    const ENTREGA = '215602HORTIFRUTI PASSAGEM                                                   RUA DA PASSAGEM ,133135                                                         BOTAFOGO                                38277,42662.741,04R$'

    it('placa em branco em linha propria: motorista da linha seguinte NAO se perde', () => {
      const texto = `
DATA15/09/2026
ROMANEIO1MOTORISTAAJUDANTE
CARRO36
Luis Paulo-
ORDEMNOTA FISCALCLIENTEENDEREÇOBAIRROQTD CAIXASPESO BRUTO PESO LÍQUIDOVALOR BRUTO
5
${ENTREGA}
`
      const { linhas, escala } = parsePaoTexto(texto, '2026-09-15')
      expect(linhas).toHaveLength(1)
      expect(linhas[0].placa).toBe('')
      expect(linhas[0].motorista).toBe('Luis Paulo')
      expect(linhas[0].nf).toBe('215602')
      expect(escala[0].placaNorm).toBe('')
      expect(escala[0].motorista).toBe('Luis Paulo')
    })

    it('motorista colado na propria linha do CARRO: lido como motorista, nunca gravado como placa', () => {
      const texto = `
DATA15/09/2026
ROMANEIO1MOTORISTAAJUDANTE
CARRO36Luis Paulo-
ORDEMNOTA FISCALCLIENTEENDEREÇOBAIRROQTD CAIXASPESO BRUTO PESO LÍQUIDOVALOR BRUTO
5
${ENTREGA}
`
      const { linhas } = parsePaoTexto(texto, '2026-09-15')
      expect(linhas).toHaveLength(1)
      expect(linhas[0].placa).toBe('')
      expect(linhas[0].motorista).toBe('Luis Paulo')
    })

    it('placa normal continua sendo lida como placa (nao regride o caminho feliz)', () => {
      const { linhas } = parsePaoTexto(ROMANEIO_1, '2026-09-15')
      expect(linhas[0].placa).toBe('TTI-9B98')
      expect(linhas[0].motorista).toBe('Luis Paulo')
    })
  })

  // Achado Important 4 da revisao FINAL de branch (15/09): linha de entrega
  // descartada (NF fora do padrao de 6 digitos, ou split inesperado) sumia em
  // silencio. Linha de total/cabecalho continua sem gerar ruido.
  describe('descarte de linha nao e mais silencioso', () => {
    it('loga a linha crua quando a NF nao tem 6 digitos', () => {
      const avisos: string[] = []
      const spy = vi.spyOn(console, 'warn').mockImplementation(msg => { avisos.push(String(msg)) })
      const texto = `
DATA15/09/2026
ROMANEIO1MOTORISTAAJUDANTE
CARRO36TTI-9B98
Luis Paulo-
ORDEMNOTA FISCALCLIENTEENDEREÇOBAIRROQTD CAIXASPESO BRUTO PESO LÍQUIDOVALOR BRUTO
5
2156021HORTIFRUTI PASSAGEM                                                  RUA DA PASSAGEM ,133135                                                         BOTAFOGO                                38277,42662.741,04R$
3002162,92073 R$ 20.241,71
`
      const { linhas } = parsePaoTexto(texto, '2026-09-15')
      spy.mockRestore()
      expect(linhas).toEqual([])
      expect(avisos.some(a => a.includes('PAO-1') && a.includes('2156021HORTIFRUTI PASSAGEM'))).toBe(true)
      // Linha de total nao vira ruido.
      expect(avisos.some(a => a.includes('20.241,71'))).toBe(false)
    })

    it('romaneio normal nao gera nenhum aviso (linha de total/cabecalho fica muda)', () => {
      const avisos: string[] = []
      const spy = vi.spyOn(console, 'warn').mockImplementation(msg => { avisos.push(String(msg)) })
      parsePaoTexto(ROMANEIO_1, '2026-09-15')
      spy.mockRestore()
      expect(avisos).toEqual([])
    })
  })

  // Verificacao manual 24/09 (analise-pao-24-09.md): BAIRROS_NITEROI so'
  // tinha BADU/PENDOTIBA/PIRATININGA/ITAIPU -- bairros reais de
  // Niteroi/Sao Goncalo/Itaborai/Marica saiam como "RIO DE JANEIRO" e
  // geocodificavam errado. Linhas abaixo sao texto real extraido via
  // pdf-parse do PDF "PROGRAMAÇÃO JAC (CONGELADO) 24-09.pdf" (grupo KPI).
  describe('mapa bairro->municipio ampliado (verificacao manual 24/09)', () => {
    const romaneioComBairro = (bairroLine: string) => `
DATA24/09/2026
ROMANEIO1MOTORISTAAJUDANTE
CARRO36RBI-1J86
Luis Paulo-
ORDEMNOTA FISCALCLIENTEENDEREÇOBAIRROQTD CAIXASPESO BRUTO PESO LÍQUIDOVALOR BRUTO
1
${bairroLine}
`

    it.each([
      ['216023SUPERPRIX ICARAI II                                                   AVENIDA SETE DE SETEMBRO,62                                                     ICARAI                                  66487,84683.837,77R$                  ', 'AVENIDA SETE DE SETEMBRO,62 - ICARAI, NITEROI - *'],
      ['216049PEROLA SUPERMERCADOS                                                  RUA TIRADENTES,71                                                               INGA                                    751,1491.379,70R$                  ', 'RUA TIRADENTES,71 - INGA, NITEROI - *'],
      ['216041HORTIFRUTI SANTA ROSA                                                 RUA NORONHA TERREZAO,43                                                         SANTA ROSA                              74525,8503,65.755,39R$                  ', 'RUA NORONHA TERREZAO,43 - SANTA ROSA, NITEROI - *'],
      ['216061CASAFRUTI                                                             AVN RUI BARBOSA,87                                                              SAO FRANCISCO                           29210,72022.650,40R$                  ', 'AVN RUI BARBOSA,87 - SAO FRANCISCO, NITEROI - *'],
      ['216012MISTER TRIGO CAMBOINHAS                                               AV PROFESSOR CARLOS NELSON FERREIRA DOS SANTOS, 125                             CAMBOINHAS                              536,535948,90R$                     ', 'AV PROFESSOR CARLOS NELSON FERREIRA DOS SANTOS, 125 - CAMBOINHAS, NITEROI - *'],
      ['216063MERCADO MOURA BADU                                                    ESTRADA CAETANO MONTEIRO, 831                                                   PENDOTIBA                               50374,4359,42.837,05R$                  ', 'ESTRADA CAETANO MONTEIRO, 831 - PENDOTIBA, NITEROI - *'],
      ['216071ACHEI LOJA DE CONVENIENCIAS                                           EST FRANCISCO DA CRUZ NUNES,10397                                               PIRATININGA                             861,4591.017,59R$                  ', 'EST FRANCISCO DA CRUZ NUNES,10397 - PIRATININGA, NITEROI - *'],
      ['216033HORTIFRUTI ITAIPU                                                     ESTRADA FRANCISCO DA CRUZ NUNES,8758                                            ITAIPU                                  34219,6209,42.521,49R$                  ', 'ESTRADA FRANCISCO DA CRUZ NUNES,8758 - ITAIPU, NITEROI - *'],
      ['216064BELLA FLOR PANIFICACAO LTDA                                           RUA VICENTE DE LIMA CLETO 744                                                   NOVA CIDADE                             302192101.595,40R$                  ', 'RUA VICENTE DE LIMA CLETO 744 - NOVA CIDADE, SAO GONCALO - *'],
      ['216059MERCADO ACOUGUE LATICINIOS MOURA DO MUTONDO                           RUA GUILHERME SANTOS ANDRADE 1315                                               MUTONDO                                 45323,53102.653,29R$                  ', 'RUA GUILHERME SANTOS ANDRADE 1315 - MUTONDO, SAO GONCALO - *'],
      ['216062REDE MOURA SUPERMERCADOS                                              RUA DUQUE DE CAXIAS,86                                                          OUTEIRO DAS PEDRAS                      87629,16034.917,62R$                  ', 'RUA DUQUE DE CAXIAS,86 - OUTEIRO DAS PEDRAS, ITABORAI - *'],
      ['216053BOM DE PRECO INOA                                                     AVENIDA CARLOS MARIGHELLA 1580                                                  INOA (INOA)                             88655,2628,85.278,51R$                  ', 'AVENIDA CARLOS MARIGHELLA 1580 - INOA (INOA), MARICA - *'],
      ['216054BOM DE PRECO BARROCO                                                  RUA DAS ORQUIDEAS,878                                                           BARROCO (ITAIPUACU)                     124907869,87.480,42R$                  ', 'RUA DAS ORQUIDEAS,878 - BARROCO (ITAIPUACU), MARICA - *'],
      ['216008PREZUNIC MARICA                                                       R ABREU SODRE,27                                                                CENTRO                                  705114903.430,00R$                  ', 'R ABREU SODRE,27 - CENTRO, MARICA - *'],
    ])('%s -> endereco com municipio certo', (linhaEntrega, enderecoEsperado) => {
      const { linhas } = parsePaoTexto(romaneioComBairro(linhaEntrega), '2026-09-24')
      expect(linhas).toHaveLength(1)
      expect(linhas[0].endereco).toBe(enderecoEsperado)
    })

    it('bairro desconhecido (ex. TIJUCA) mantem o comportamento atual: RIO DE JANEIRO', () => {
      const linha = '216028HORTIFRUTI CONDE 99                                                   RUA CONDE DE BONFIM,99                                                          TIJUCA                                  28214,42061.747,53R$                  '
      const { linhas } = parsePaoTexto(romaneioComBairro(linha), '2026-09-24')
      expect(linhas[0].endereco).toBe('RUA CONDE DE BONFIM,99 - TIJUCA, RIO DE JANEIRO - *')
    })

    // Fix round 1 (pos-revisao): bairro acentuado tem que casar igual ao
    // sem acento (NFD + remover diacriticos + caixa alta + espacos
    // colapsados) -- antes so' "ICARAI" (sem acento) casava.
    it.each([
      ['216023SUPERPRIX ICARAI II                                                   AVENIDA SETE DE SETEMBRO,62                                                     ICARAÍ                                  66487,84683.837,77R$                  ', 'AVENIDA SETE DE SETEMBRO,62 - ICARAÍ, NITEROI - *'],
      ['216049PEROLA SUPERMERCADOS                                                  RUA TIRADENTES,71                                                               INGÁ                                    751,1491.379,70R$                  ', 'RUA TIRADENTES,71 - INGÁ, NITEROI - *'],
      ['216053BOM DE PRECO INOA                                                     AVENIDA CARLOS MARIGHELLA 1580                                                  INOÃ (INOÃ)                             88655,2628,85.278,51R$                  ', 'AVENIDA CARLOS MARIGHELLA 1580 - INOÃ (INOÃ), MARICA - *'],
    ])('bairro acentuado %s -> casa igual a versao sem acento', (linhaEntrega, enderecoEsperado) => {
      const { linhas } = parsePaoTexto(romaneioComBairro(linhaEntrega), '2026-09-24')
      expect(linhas).toHaveLength(1)
      expect(linhas[0].endereco).toBe(enderecoEsperado)
    })

    it('"CENTRO" sem cliente de Marica no nome continua Rio de Janeiro (bairro ambiguo, so vira Marica com o nome do cliente)', () => {
      const linha = '216099MERCADINHO CENTRO RJ                                                  RUA QUALQUER,1                                                                  CENTRO                                  1,001,00R$                            '
      const { linhas } = parsePaoTexto(romaneioComBairro(linha), '2026-09-24')
      expect(linhas[0].endereco).toBe('RUA QUALQUER,1 - CENTRO, RIO DE JANEIRO - *')
    })
  })

  // Verificacao manual 24/09: linha longa com colunas coladas/quebradas --
  // o split por 2+ espacos nao rendia as 4 colunas esperadas (CLIENTE,
  // ENDERECO, BAIRRO, numeros), e o codigo antigo pegava cegamente os 3
  // primeiros pedacos como [cliente, endereco, bairro].
  describe('linha longa com colunas coladas/quebradas (verificacao manual 24/09)', () => {
    const romaneioComEntrega = (linhaEntrega: string) => `
DATA24/09/2026
ROMANEIO4MOTORISTAAJUDANTE
CARRO23RQU-5J45
-Eduardo Justino
ORDEMNOTA FISCALCLIENTEENDEREÇOBAIRROQTD CAIXASPESO BRUTO PESO LÍQUIDOVALOR BRUTO
11
${linhaEntrega}
`

    it('nome do cliente colado direto no endereco, sem nenhum separador (NF 216057): endereco recuperado, bairro certo', () => {
      const linha = '216057PAO DO DIA CPRJRUA SENADOR ALENCAR, 33                                                         SAO CRISTOVAO                           107370265,40R$                     '
      const { linhas } = parsePaoTexto(romaneioComEntrega(linha), '2026-09-24')
      expect(linhas).toHaveLength(1)
      expect(linhas[0].nf).toBe('216057')
      expect(linhas[0].clienteNome).toBe('PAO DO DIA CPRJ')
      expect(linhas[0].endereco).toBe('RUA SENADOR ALENCAR, 33 - SAO CRISTOVAO, RIO DE JANEIRO - *')
    })

    it('nome do cliente colado no endereco com 1 espaco so (NF 216051): endereco e bairro (Icarai/Niteroi) certos', () => {
      const linha = '216051PAO DO ATLETA INDUSTRIA DE PANIFICACAO RUA LOPES TROVAO,109                                                            ICARAI                                  858,4561.518,24R$                  '
      const { linhas } = parsePaoTexto(romaneioComEntrega(linha), '2026-09-24')
      expect(linhas).toHaveLength(1)
      expect(linhas[0].nf).toBe('216051')
      expect(linhas[0].clienteNome).toBe('PAO DO ATLETA INDUSTRIA DE PANIFICACAO')
      expect(linhas[0].endereco).toBe('RUA LOPES TROVAO,109 - ICARAI, NITEROI - *')
    })

    it('espaco duplo acidental no nome do cliente antes do endereco (NF 216009): endereco e bairro certos, nao quebra em coluna fantasma', () => {
      const linha = '216009PREZUNIC MEIER  LJ 729                                                RUA DIAS DA CRUZ,579                                                            MEIER                                   524,5823,08897,94R$                     '
      const { linhas } = parsePaoTexto(romaneioComEntrega(linha), '2026-09-24')
      expect(linhas).toHaveLength(1)
      expect(linhas[0].nf).toBe('216009')
      expect(linhas[0].clienteNome).toBe('PREZUNIC MEIER LJ 729')
      expect(linhas[0].endereco).toBe('RUA DIAS DA CRUZ,579 - MEIER, RIO DE JANEIRO - *')
    })

    it('espaco duplo acidental no nome do cliente (NF 216024): endereco e bairro (Tijuca) certos', () => {
      const linha = '216024SUPERPRIX TIJUCA  USINA                                               RUA CONDE DE BONFIM ,812                                                        TIJUCA                                  102744,4713,86.490,78R$                  '
      const { linhas } = parsePaoTexto(romaneioComEntrega(linha), '2026-09-24')
      expect(linhas).toHaveLength(1)
      expect(linhas[0].nf).toBe('216024')
      expect(linhas[0].clienteNome).toBe('SUPERPRIX TIJUCA USINA')
      expect(linhas[0].endereco).toBe('RUA CONDE DE BONFIM ,812 - TIJUCA, RIO DE JANEIRO - *')
    })
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
