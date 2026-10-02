import { describe, it, expect } from 'vitest'
import {
  expandirCidadeTruncada,
  limparLixoInicio,
  expandirTipoLogradouro,
  normalizarEndereco,
} from './normalizar-endereco'

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

  it('expande TRAJANO DE MORA → TRAJANO DE MORAIS', () => {
    expect(expandirCidadeTruncada('TRAJANO DE MORA')).toBe('TRAJANO DE MORAIS')
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