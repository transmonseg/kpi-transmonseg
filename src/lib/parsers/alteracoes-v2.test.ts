import { describe, it, expect } from 'vitest'
import { normalizaNomeMotorista, normalizaTexto, segmentaBlocos, extraiTokens, detectaSentido, detectaContexto, parseAlteracoesV2 } from './alteracoes-v2'
import type { ParseContext } from './alteracoes-v2.types'

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

describe('detectaSentido', () => {
  it('detecta âncoras explícitas Sai:/Entra:', () => {
    const bloco = `Sai: Anderson LCE4337
Entra: Sidnei LQE5401`
    const r = detectaSentido(bloco)
    expect(r.sai).toContain('Anderson')
    expect(r.entra).toContain('Sidnei')
  })

  it('detecta âncoras com espaço extra: "Sai :" / "Entra :"', () => {
    const bloco = `Sai : A LCE4337
Entra : B LQE5401`
    const r = detectaSentido(bloco)
    expect(r.sai).toContain('LCE4337')
    expect(r.entra).toContain('LQE5401')
  })

  it('detecta inline "sai X placa P entra Y placa Q"', () => {
    const bloco = 'sai kanu placa kqr2j11 entra Rafael placa eyl8b91'
    const r = detectaSentido(bloco)
    expect(r.sai).toContain('kanu')
    expect(r.entra).toContain('Rafael')
  })

  it('retorna null quando nenhuma âncora é encontrada', () => {
    const r = detectaSentido('Só placa LQE5401 sem contexto')
    expect(r.sai).toBeNull()
    expect(r.entra).toBeNull()
  })
})

const lojasCtx = [
  { rede_id: 'ZONA_SUL', nome: 'Zona Sul Loja 43', nome_norm: 'ZONA SUL LOJA 43', codigo_escala: '43' },
  { rede_id: 'ASSAI', nome: 'ASSAI - CAXIAS I - LOJA 131', nome_norm: 'ASSAI CAXIAS I LOJA 131', codigo_escala: '131' },
]

describe('detectaContexto', () => {
  it('detecta rede por substring', () => {
    const r = detectaContexto('Assai Caxias troca de carro', lojasCtx)
    expect(r.rede_id).toBe('ASSAI')
  })

  it('detecta filial por número', () => {
    const r = detectaContexto('Zona Sul\nFilial 43\nSai: X', lojasCtx)
    expect(r.filial).toBe(43)
    expect(r.rede_id).toBe('ZONA_SUL')
  })

  it('detecta loja por match com cadastro', () => {
    const r = detectaContexto('Assai - Caxias I - Loja 131\nSai: X', lojasCtx)
    expect(r.rede_id).toBe('ASSAI')
    expect(r.loja_nome_raw).toContain('Caxias')
  })

  it('extrai motivo de linha "Motivo:"', () => {
    const r = detectaContexto('Assai\nMotivo: pneu furou', lojasCtx)
    expect(r.motivo).toBe('pneu furou')
  })

  it('extrai motivo de linha "Obs:"', () => {
    const r = detectaContexto('Assai\nObs: troca de carro', lojasCtx)
    expect(r.motivo).toBe('troca de carro')
  })

  it('extrai motivo no fim da mensagem (sem label)', () => {
    const r = detectaContexto('Assai sai X entra Y carro quebrou', lojasCtx)
    expect(r.motivo).toContain('carro quebrou')
  })
})

const ctxReal: ParseContext = {
  associacoes: [
    { motorista_nome: 'Fabrício', motorista_nome_norm: 'FABRICIO', motorista_codigo: null, placa_norm: 'QSW3B65', placa_raw: 'QSW-3B65', data_entrega: '2026-05-18', rede_id: 'ZONA_SUL' },
    { motorista_nome: 'Jairo', motorista_nome_norm: 'JAIRO', motorista_codigo: null, placa_norm: 'TJQ6J26', placa_raw: 'TJQ-6J26', data_entrega: '2026-05-17', rede_id: 'ZONA_SUL' },
    { motorista_nome: 'Allan', motorista_nome_norm: 'ALLAN', motorista_codigo: null, placa_norm: 'EZU9J51', placa_raw: 'EZU-9J51', data_entrega: '2026-05-18', rede_id: 'ASSAI' },
    { motorista_nome: 'Jairo', motorista_nome_norm: 'JAIRO', motorista_codigo: null, placa_norm: 'UBO5E05', placa_raw: 'UBO-5E05', data_entrega: '2026-05-18', rede_id: 'ARMAZEM_GRAO' },
    { motorista_nome: 'Agenor', motorista_nome_norm: 'AGENOR', motorista_codigo: 61, placa_norm: 'KPN4F36', placa_raw: 'KPN-4F36', data_entrega: '2026-05-18', rede_id: 'CARREFOUR' },
    { motorista_nome: 'Vanor', motorista_nome_norm: 'VANOR', motorista_codigo: 61, placa_norm: 'KZJ0E14', placa_raw: 'KZJ-0E14', data_entrega: '2026-05-17', rede_id: 'CARREFOUR' },
    { motorista_nome: 'Kanu', motorista_nome_norm: 'KANU', motorista_codigo: 738, placa_norm: 'KQR2J11', placa_raw: 'KQR-2J11', data_entrega: '2026-05-18', rede_id: 'PRINCESA' },
    { motorista_nome: 'Rafael', motorista_nome_norm: 'RAFAEL', motorista_codigo: 184502, placa_norm: 'EYL8B91', placa_raw: 'EYL-8B91', data_entrega: '2026-05-17', rede_id: 'PRINCESA' },
    { motorista_nome: 'Douglas', motorista_nome_norm: 'DOUGLAS', motorista_codigo: null, placa_norm: 'LTE0A64', placa_raw: 'LTE-0A64', data_entrega: '2026-05-18', rede_id: 'ZONA_SUL' },
    { motorista_nome: 'Eduardo', motorista_nome_norm: 'EDUARDO', motorista_codigo: null, placa_norm: 'LQA5883', placa_raw: 'LQA-5883', data_entrega: '2026-05-18', rede_id: 'ZONA_SUL' },
  ],
  lojas: [],
}

describe('parseAlteracoesV2 - alterações reais do dia 18', () => {
  it('1. ZS Mega Box', () => {
    const texto = `Alteração zona sul
Mega box
Sai: Fabrício qsw3b65
Entra: Jairo tjq6j26`
    const blocos = parseAlteracoesV2(texto, ctxReal)
    expect(blocos).toHaveLength(1)
    expect(blocos[0].rede_id).toBe('ZONA_SUL')
    expect(blocos[0].sai?.placa_norm).toBe('QSW3B65')
    expect(blocos[0].entra?.placa_norm).toBe('TJQ6J26')
  })

  it('2. Assai Caxias troca de carro', () => {
    const texto = `🚨Alteração 🚨
Assai caxias
Troca de carro
Entra : UBO 5E05
Sai : EZU 9J51
Carro com bateria ruim.
Motorista continua o mesmo.`
    const blocos = parseAlteracoesV2(texto, ctxReal)
    expect(blocos).toHaveLength(1)
    expect(blocos[0].rede_id).toBe('ASSAI')
    expect(blocos[0].sai?.placa_norm).toBe('EZU9J51')
    expect(blocos[0].entra?.placa_norm).toBe('UBO5E05')
    expect(blocos[0].motivo).toMatch(/bateria|troca de carro/i)
  })

  it('3. Carrefour Campos/Macaé com códigos', () => {
    const texto = `🚨ALTERAÇÃO 🚨
Carrefour Campos, é Macaé
Entra: vanor 61 KZJ0E14
Sai : AGENOR     61    KPN-4F36
Motivo: caminhão quebrou`
    const blocos = parseAlteracoesV2(texto, ctxReal)
    expect(blocos).toHaveLength(1)
    expect(blocos[0].rede_id).toBe('CARREFOUR')
    expect(blocos[0].sai?.placa_norm).toBe('KPN4F36')
    expect(blocos[0].entra?.placa_norm).toBe('KZJ0E14')
    expect(blocos[0].motivo).toMatch(/quebrou/i)
  })

  it('4. Princesa Flamengo inline', () => {
    const texto = 'alteração princesa flamengo sai kanu placa kqr2j11 cod 738 entra Rafael placa eyl 8b91 cod 184502 motivo carro quebrou'
    const blocos = parseAlteracoesV2(texto, ctxReal)
    expect(blocos).toHaveLength(1)
    expect(blocos[0].rede_id).toBe('PRINCESA')
    expect(blocos[0].sai?.placa_norm).toBe('KQR2J11')
    expect(blocos[0].entra?.placa_norm).toBe('EYL8B91')
  })

  it('5. ZS Filial 43 + 23 (2 blocos)', () => {
    const texto = `Alteração zona sul
Filial 43
Obs:. Troca de carro
Sai: Douglas lte0a64
Entra: Eduardo lqa5883

Filial 23
Sai: Eduardo lqa5883
Entra: Douglas lte0a64`
    const blocos = parseAlteracoesV2(texto, ctxReal)
    expect(blocos).toHaveLength(2)
    expect(blocos[0].filial).toBe(43)
    expect(blocos[0].sai?.placa_norm).toBe('LTE0A64')
    expect(blocos[0].entra?.placa_norm).toBe('LQA5883')
    expect(blocos[1].filial).toBe(23)
    expect(blocos[1].sai?.placa_norm).toBe('LQA5883')
    expect(blocos[1].entra?.placa_norm).toBe('LTE0A64')
  })

  it('6. ZS Filial 45/47 (range vira 2 blocos)', () => {
    const texto = `Alteração zona sul
Filial 45/47
Sai: Francisco Rjl7d33
Entra: Eduardo krk3d12`
    const blocos = parseAlteracoesV2(texto, ctxReal)
    expect(blocos).toHaveLength(2)
    expect(blocos[0].filial).toBe(45)
    expect(blocos[1].filial).toBe(47)
    expect(blocos[0].sai?.placa_norm).toBe('RJL7D33')
    expect(blocos[1].sai?.placa_norm).toBe('RJL7D33')
  })
})
