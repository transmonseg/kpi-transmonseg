import { describe, it, expect } from 'vitest'
import { normalizaNomeMotorista, normalizaTexto, segmentaBlocos, extraiTokens } from './alteracoes-v2'

describe('normalizaNomeMotorista', () => {
  it('upper + remove acentos + colapsa espaços', () => {
    expect(normalizaNomeMotorista('José  Roberto')).toBe('JOSE ROBERTO')
    expect(normalizaNomeMotorista('Antônio')).toBe('ANTONIO')
    expect(normalizaNomeMotorista('  felipe   silva  ')).toBe('FELIPE SILVA')
  })

  it('retorna string vazia para entrada vazia', () => {
    expect(normalizaNomeMotorista('')).toBe('')
    expect(normalizaNomeMotorista(null as unknown as string)).toBe('')
  })
})

describe('normalizaTexto', () => {
  it('remove emojis', () => {
    expect(normalizaTexto('🚨ALTERAÇÃO 🚨')).toBe('ALTERAÇÃO')
  })

  it('padroniza quebras de linha', () => {
    expect(normalizaTexto('linha1\r\nlinha2\rlinha3')).toBe('linha1\nlinha2\nlinha3')
  })

  it('insere quebra antes de "Filial N"', () => {
    expect(normalizaTexto('Filial 43 Sai: X Filial 23 Entra: Y')).toBe(
      'Filial 43 Sai: X\nFilial 23 Entra: Y',
    )
  })

  it('colapsa espaços múltiplos preservando quebras', () => {
    expect(normalizaTexto('a   b\n   c    d')).toBe('a b\nc d')
  })
})

describe('segmentaBlocos', () => {
  it('retorna 1 bloco quando há 1 alteração simples', () => {
    const texto = `ALTERAÇÃO
Prezunic Caxias
Entra: Sidnei 674 LQE5401
Sai: Anderson 811 LCE4337`
    const blocos = segmentaBlocos(texto)
    expect(blocos).toHaveLength(1)
    expect(blocos[0]).toContain('Sidnei')
    expect(blocos[0]).toContain('Anderson')
  })

  it('separa 2 blocos quando há 2 "Filial N"', () => {
    const texto = `Zona Sul
Filial 43
Sai: Douglas LTE0A64
Entra: Eduardo LQA5883
Filial 23
Sai: Eduardo LQA5883
Entra: Douglas LTE0A64`
    const blocos = segmentaBlocos(texto)
    expect(blocos).toHaveLength(2)
    expect(blocos[0]).toContain('Filial 43')
    expect(blocos[1]).toContain('Filial 23')
  })

  it('separa blocos em linha em branco quando não há marcador explícito', () => {
    const texto = `Princesa Catete
Entra: A 100 AAA1B23

Princesa Leme
Entra: B 200 BBB2C34`
    const blocos = segmentaBlocos(texto)
    expect(blocos).toHaveLength(2)
  })

  it('expande "Filial 45/47" em 2 blocos com mesmo conteúdo', () => {
    const texto = `Zona Sul
Filial 45/47
Sai: Francisco RJL7D33
Entra: Eduardo KRK3D12`
    const blocos = segmentaBlocos(texto)
    expect(blocos).toHaveLength(2)
    expect(blocos[0]).toContain('Filial 45')
    expect(blocos[1]).toContain('Filial 47')
  })
})

describe('extraiTokens', () => {
  it('extrai placa formato antigo e Mercosul', () => {
    expect(extraiTokens('Sidnei 674 LQE5401').placas).toEqual(['LQE5401'])
    expect(extraiTokens('Anderson LCE4337').placas).toEqual(['LCE4337'])
    expect(extraiTokens('placa KQR2J11').placas).toEqual(['KQR2J11'])
    expect(extraiTokens('eyl 8b91').placas).toEqual(['EYL8B91'])
  })

  it('extrai códigos sem confundir com placas', () => {
    const r = extraiTokens('Sidnei 674 LQE5401')
    expect(r.codigos).toEqual([674])
  })

  it('ignora códigos de 1-2 dígitos', () => {
    expect(extraiTokens('cod 5').codigos).toEqual([])
  })

  it('extrai placa quando vem com hífen ou espaço', () => {
    expect(extraiTokens('UBO 5E05').placas).toEqual(['UBO5E05'])
    expect(extraiTokens('UBO-5E05').placas).toEqual(['UBO5E05'])
  })
})
