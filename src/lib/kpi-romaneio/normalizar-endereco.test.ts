import { describe, it, expect } from 'vitest'
import {
  expandirCidadeTruncada,
  limparLixoInicio,
  expandirTipoLogradouro,
  normalizarEndereco,
  expandirSegmentoCidade,
} from './normalizar-endereco'
import { chaveCacheEndereco } from './endereco-cep'
import fixture from './normalizar-endereco.fixture-nfs-2026-10.json'

describe('expandirCidadeTruncada', () => {
  // Casos reais das auditorias terco1/2/3
  it('expande SAO FRANCISCO D → SÃO FRANCISCO DE ITABAPOANA', () => {
    expect(expandirCidadeTruncada('SAO FRANCISCO D')).toBe('SÃO FRANCISCO DE ITABAPOANA')
  })

  it('expande CACHOEIRAS DE M → CACHOEIRAS DE MACACU', () => {
    expect(expandirCidadeTruncada('CACHOEIRAS DE M')).toBe('CACHOEIRAS DE MACACU')
  })

  it('expande COMENDADOR LEVY → COMENDADOR LEVY GASPARIAN', () => {
    expect(expandirCidadeTruncada('COMENDADOR LEVY')).toBe('COMENDADOR LEVY GASPARIAN')
  })

  it('expande SANTO ANTONIO D → SANTO ANTONIO DE PÁDUA', () => {
    expect(expandirCidadeTruncada('SANTO ANTONIO D')).toBe('SANTO ANTONIO DE PÁDUA')
  })

  it('expande CAMPOS DOS GOYT → CAMPOS DOS GOYTACAZES', () => {
    expect(expandirCidadeTruncada('CAMPOS DOS GOYT')).toBe('CAMPOS DOS GOYTACAZES')
  })

  it('expande DUQUE DE CAXI → DUQUE DE CAXIAS', () => {
    expect(expandirCidadeTruncada('DUQUE DE CAXI')).toBe('DUQUE DE CAXIAS')
  })

  it('expande SAO JOAO DE MER → SÃO JOÃO DE MERITI', () => {
    expect(expandirCidadeTruncada('SAO JOAO DE MER')).toBe('SÃO JOÃO DE MERITI')
  })

  it('expande ENGENHEIRO PAUL → ENGENHEIRO PAULO DE FRONTIN', () => {
    expect(expandirCidadeTruncada('ENGENHEIRO PAUL')).toBe('ENGENHEIRO PAULO DE FRONTIN')
  })

  it('expande CASIMIRO DE ABRE → CASIMIRO DE ABREU', () => {
    expect(expandirCidadeTruncada('CASIMIRO DE ABRE')).toBe('CASIMIRO DE ABREU')
  })

  it('expande CONCEICAO DE MA → CONCEIÇÃO DE MACABU', () => {
    expect(expandirCidadeTruncada('CONCEICAO DE MA')).toBe('CONCEIÇÃO DE MACABU')
  })

  it('expande BOM JESUS DO IT → BOM JESUS DO ITABAPOANA', () => {
    expect(expandirCidadeTruncada('BOM JESUS DO IT')).toBe('BOM JESUS DO ITABAPOANA')
  })

  it('expande SAO SEBASTIAO D → SÃO SEBASTIÃO DO ALTO', () => {
    expect(expandirCidadeTruncada('SAO SEBASTIAO D')).toBe('SÃO SEBASTIÃO DO ALTO')
  })

  it('expande SANTA MARIA MAD → SANTA MARIA MADALENA', () => {
    expect(expandirCidadeTruncada('SANTA MARIA MAD')).toBe('SANTA MARIA MADALENA')
  })

  it('expande TRAJANO DE MORA → TRAJANO DE MORAES (F1-14: grafia do IBGE)', () => {
    expect(expandirCidadeTruncada('TRAJANO DE MORA')).toBe('TRAJANO DE MORAES')
  })

  it('devolve original quando cidade não está truncada', () => {
    expect(expandirCidadeTruncada('RIO DE JANEIRO')).toBe('RIO DE JANEIRO')
    expect(expandirCidadeTruncada('NITERÓI')).toBe('NITERÓI')
  })

  it('devolve original quando prefixo não é reconhecido', () => {
    expect(expandirCidadeTruncada('XYZ DESCONHECID')).toBe('XYZ DESCONHECID')
  })

  it('é case-insensitive e ignora acentos na busca', () => {
    expect(expandirCidadeTruncada('são francisco d')).toBe('SÃO FRANCISCO DE ITABAPOANA')
    expect(expandirCidadeTruncada('São Gonçalo')).toBe('SÃO GONÇALO')
  })

  it('devolve string vazia para entrada vazia', () => {
    expect(expandirCidadeTruncada('')).toBe('')
  })
})

describe('limparLixoInicio', () => {
  it('remove número antes do tipo de logradouro', () => {
    expect(limparLixoInicio('10 RUA DAS FLORES')).toBe('RUA DAS FLORES')
  })

  it('remove número com hífen antes do logradouro', () => {
    expect(limparLixoInicio('5-AVENIDA BRASIL')).toBe('AVENIDA BRASIL')
  })

  it('remove múltiplos dígitos', () => {
    expect(limparLixoInicio('123 ESTRADA DO CAMPO')).toBe('ESTRADA DO CAMPO')
  })

  it('não remove quando não há lixo no início', () => {
    expect(limparLixoInicio('RUA DAS FLORES')).toBe('RUA DAS FLORES')
  })

  it('devolve original para string vazia', () => {
    expect(limparLixoInicio('')).toBe('')
  })
})

describe('expandirTipoLogradouro', () => {
  it('expande R → RUA', () => {
    expect(expandirTipoLogradouro('R DAS FLORES')).toBe('RUA DAS FLORES')
  })

  it('expande AV → AVENIDA', () => {
    expect(expandirTipoLogradouro('AV BRASIL')).toBe('AVENIDA BRASIL')
  })

  it('expande EST → ESTRADA', () => {
    expect(expandirTipoLogradouro('EST DO CAMPO')).toBe('ESTRADA DO CAMPO')
  })

  it('expande TRAV → TRAVESSA', () => {
    expect(expandirTipoLogradouro('TRAV DA PAZ')).toBe('TRAVESSA DA PAZ')
  })

  it('expande PC → PRAÇA', () => {
    expect(expandirTipoLogradouro('PC DA REPUBLICA')).toBe('PRAÇA DA REPUBLICA')
  })

  it('expande ROD → RODOVIA', () => {
    expect(expandirTipoLogradouro('ROD WASHINGTON LUIZ')).toBe('RODOVIA WASHINGTON LUIZ')
  })

  it('expande AL → ALAMEDA', () => {
    expect(expandirTipoLogradouro('AL DAS PALMEIRAS')).toBe('ALAMEDA DAS PALMEIRAS')
  })

  it('não altera quando já está expandido', () => {
    expect(expandirTipoLogradouro('RUA DAS FLORES')).toBe('RUA DAS FLORES')
    expect(expandirTipoLogradouro('AVENIDA BRASIL')).toBe('AVENIDA BRASIL')
  })

  it('devolve original para string vazia', () => {
    expect(expandirTipoLogradouro('')).toBe('')
  })
})

describe('normalizarEndereco', () => {
  it('normaliza endereço com cidade truncada no formato NM (separador " - ")', () => {
    const bruto = 'RUA DAS FLORES, 10 - CENTRO - SAO FRANCISCO D'
    const resultado = normalizarEndereco(bruto)
    expect(resultado).toContain('SÃO FRANCISCO DE ITABAPOANA')
  })

  it('normaliza endereço com lixo + tipo abreviado + cidade truncada', () => {
    const bruto = '10 R DAS FLORES - CENTRO - CACHOEIRAS DE M'
    const resultado = normalizarEndereco(bruto)
    expect(resultado).toContain('RUA DAS FLORES')
    expect(resultado).toContain('CACHOEIRAS DE MACACU')
    expect(resultado).not.toMatch(/^\d/)
  })

  it('normaliza endereço RQ com vírgula e cidade truncada', () => {
    const bruto = 'RUA PRINCIPAL, - CENTRO, CAMPOS DOS GOYT - RJ'
    const resultado = normalizarEndereco(bruto)
    expect(resultado).toContain('CAMPOS DOS GOYTACAZES')
  })

  it('preserva endereço já normalizado', () => {
    const bruto = 'RUA DAS FLORES, 10 - CENTRO - RIO DE JANEIRO'
    expect(normalizarEndereco(bruto)).toBe(bruto)
  })

  it('devolve original para string vazia', () => {
    expect(normalizarEndereco('')).toBe('')
  })
})
// F1-14 (GEO-25, auditoria 23/10): bairro com nome de municipio trocava a
// cidade real -- "SAO FRANCISCO DE ASSIS, BARRA MANSA" virava Sao Francisco de
// Itabapoana. 148 NFs em 9 dias, chaves de cidades diferentes colidindo.
describe('normalizarEndereco / chaveCacheEndereco: cidade real (F1-14, GEO-25)', () => {
  it('casos reais: o bairro com nome de cidade nao troca a cidade', () => {
    expect(chaveCacheEndereco('RUA SAO JOSE, 211 - SAO FRANCISCO DE ASSIS, BARRA MANSA - * - 27323790')).toBe('RUA SAO JOSE, 211 - SAO FRANCISCO DE ASSIS, BARRA MANSA')
    expect(chaveCacheEndereco('ROD WASHINGTON LUIZ - DE 19002/19003 AO, S/N - SANTO ANTONIO DA SERRA, DUQUE DE CAXIAS - * - 25251745')).toBe('RODOVIA WASHINGTON LUIZ - DE 19002/19003 AO, S/N - SANTO ANTONIO DA SERRA, DUQUE DE CAXIAS')
    expect(chaveCacheEndereco('ESTRADA CALIFORNIA, S/N - CANTAGALO, RIO DAS OSTRAS - KM 7,5 - 28890001')).toBe('ESTRADA CALIFORNIA, S/N - CANTAGALO, RIO DAS OSTRAS - KM 7,5')
    expect(chaveCacheEndereco('RUA JOAO GOMES RIBEIRO, S/N - CANTAGALO, ANGRA DOS REIS - * - 23919-520')).toBe('RUA JOAO GOMES RIBEIRO, S/N - CANTAGALO, ANGRA DOS REIS')
    expect(chaveCacheEndereco('AV ARTHUR SEBASTIAO DE TOLEDO RIBAS, 365 - CANTAGALO, TRES RIOS - * - 25803060')).toBe('AVENIDA ARTHUR SEBASTIAO DE TOLEDO RIBAS, 365 - CANTAGALO, TRÊS RIOS')
  })
  it('Sao Francisco de Assis, bairro de Cachoeiras de Macacu (truncada): vira Cachoeiras, nao Sao Francisco de Itabapoana', () => {
    expect(chaveCacheEndereco('10A RUA JOAO CARLOS FARIA, 1 - SAO FRANCISCO DE ASSIS, CACHOEIRAS DE M - LOJA 1 - 28680-000')).toBe('A RUA JOAO CARLOS FARIA, 1 - SAO FRANCISCO DE ASSIS, CACHOEIRAS DE MACACU')
  })
  it('MAGEMIRIM, MAGE: a cidade fica Mage e o bairro nao some', () => {
    expect(chaveCacheEndereco('AVENIDA SIMAO DA MOTA, 42 - MAGEMIRIM, MAGE - LOJA 2 3 4 - 25901-028')).toBe('AVENIDA SIMAO DA MOTA, 42 - MAGEMIRIM, MAGÉ')
  })
  it('TRAJANO DE MORA vira TRAJANO DE MORAES (grafia do IBGE, a que o monitoramento reconhece)', () => {
    expect(expandirCidadeTruncada('TRAJANO DE MORA')).toBe('TRAJANO DE MORAES')
    expect(chaveCacheEndereco('AVENIDA CASTELO BRANCO, 49 - CENTRO, TRAJANO DE MORA - * - 28750-000')).toBe('AVENIDA CASTELO BRANCO, 49 - CENTRO, TRAJANO DE MORAES')
  })
  it('chave que ja estava certa nao muda (o cache continua valendo)', () => {
    // bairro com o nome da propria cidade: a chave antiga (so' a cidade) fica
    expect(chaveCacheEndereco('RODOVIA PRESIDENTE JOAO GOULART, S/N - APERIBÉ, APERIBE - ANEXO - 28495521')).toBe('RODOVIA PRESIDENTE JOAO GOULART, S/N - APERIBÉ')
    expect(chaveCacheEndereco('AVENIDA ATLANTICA, 2534 - CAVALEIROS, MACAE - * - 27920390')).toBe('AVENIDA ATLANTICA, 2534 - CAVALEIROS, MACAÉ')
    expect(normalizarEndereco('RUA DAS FLORES, 10 - CENTRO - SAO FRANCISCO D - *')).toBe('RUA DAS FLORES, 10 - CENTRO - SÃO FRANCISCO DE ITABAPOANA - *')
  })
  it('rua com nome de cidade antes do "bairro, cidade" nao vira cidade', () => {
    expect(normalizarEndereco('ESTRADA RIO - TERESOPOLIS - SERRA DE TERESOPOLIS, GUAPIMIRIM')).toBe('ESTRADA RIO - TERESOPOLIS - SERRA DE TERESOPOLIS, GUAPIMIRIM')
  })
  it('expandirSegmentoCidade: so segmento inteiro (nome ou truncagem), nunca prefixo de texto maior', () => {
    expect(expandirSegmentoCidade('SAO FRANCISCO D')).toBe('SÃO FRANCISCO DE ITABAPOANA')
    expect(expandirSegmentoCidade('SAO FRANCISCO DE')).toBe('SÃO FRANCISCO DE ITABAPOANA')
    expect(expandirSegmentoCidade('SAO FRANCISCO DE ASSIS')).toBeNull()
    expect(expandirSegmentoCidade('MAGEMIRIM')).toBeNull()
    expect(expandirSegmentoCidade('CANTAGALO, RIO DAS OSTRAS')).toBeNull()
    expect(expandirSegmentoCidade('Petropolis')).toBe('PETRÓPOLIS')
  })
})

// Propriedade sobre as NFs reais de 13-23/10 (Nutry + RQ): em todo endereco
// cuja chave mudou, a chave nova traz a cidade do romaneio; nos demais
// (amostra, incluindo todo "CIDADE, CIDADE"), a chave e' identica a antiga.
describe('propriedade municipio(raw) == municipio(chave) nas NFs de 13-23/10 (F1-14)', () => {
  const semAcento = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  it('chave que mudou traz a cidade real', () => {
    expect(fixture.mudam.length).toBeGreaterThan(70)
    const erradas = fixture.mudam.filter(m => !semAcento(chaveCacheEndereco(m.endereco)).endsWith(m.municipio) && !semAcento(chaveCacheEndereco(m.endereco)).includes(`, ${m.municipio}`))
    expect(erradas).toEqual([])
  })
  it('chave que estava certa continua igual', () => {
    const mudaram = fixture.estaveis.filter(e => chaveCacheEndereco(e.endereco) !== e.chave)
    expect(mudaram).toEqual([])
  })
})
