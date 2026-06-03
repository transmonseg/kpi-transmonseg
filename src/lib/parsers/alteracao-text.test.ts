import { describe, it, expect } from 'vitest'
import { parseAlteracaoText } from './alteracao-text'

describe('parseAlteracaoText', () => {
  describe('parse com labels Sai/Entra explícitos', () => {
    it('extrai motorista e placa do slot Entra', () => {
      const r = parseAlteracaoText('Sai: Pedro LKV5067\nEntra: Rafael CYB3B90')
      expect(r.entra?.motorista_nome).toMatch(/Rafael/i)
      expect(r.entra?.placa_norm).toBe('CYB3B90')
    })

    it('extrai motorista e placa do slot Sai', () => {
      const r = parseAlteracaoText('Sai: Pedro LKV5067\nEntra: Rafael CYB3B90')
      expect(r.sai?.motorista_nome).toMatch(/Pedro/i)
      expect(r.sai?.placa_norm).toBe('LKV5067')
    })

    it('placa é normalizada para uppercase sem espaços', () => {
      const r = parseAlteracaoText('Entra: Carlos abc 1234')
      expect(r.entra?.placa_norm).toBe('ABC1234')
    })
  })

  describe('parse de formato raw sem labels adicionais', () => {
    it('Sai: Everton cyb3b90 / Entra: Rafael lkv5067', () => {
      const r = parseAlteracaoText('Sai: Everton cyb3b90\nEntra: Rafael lkv5067')
      expect(r.sai?.placa_norm).toBe('CYB3B90')
      expect(r.entra?.placa_norm).toBe('LKV5067')
      expect(r.sai?.motorista_nome).toMatch(/Everton/i)
      expect(r.entra?.motorista_nome).toMatch(/Rafael/i)
    })

    it('preserva texto_original intacto', () => {
      const texto = 'Sai: Everton cyb3b90\nEntra: Rafael lkv5067'
      const r = parseAlteracaoText(texto)
      expect(r.texto_original).toBe(texto)
    })
  })

  describe('detecção de rede', () => {
    it('detecta ZONA_SUL via "zona sul"', () => {
      const r = parseAlteracaoText('Loja: Zona Sul Barra\nEntra: Carlos ABC1234')
      expect(r.rede_id).toBe('ZONA_SUL')
    })

    it('detecta ASSAI via "assaí" (com acento)', () => {
      const r = parseAlteracaoText('Loja: Assaí Jacarepaguá\nEntra: Carlos ABC1234')
      expect(r.rede_id).toBe('ASSAI')
    })

    it('detecta ASSAI via "assa" (sem acento)', () => {
      const r = parseAlteracaoText('Loja: Assai Centro\nEntra: Carlos ABC1234')
      expect(r.rede_id).toBe('ASSAI')
    })

    it('detecta GUANABARA via "guanabara"', () => {
      const r = parseAlteracaoText('Loja: Guanabara Tijuca\nEntra: Carlos ABC1234')
      expect(r.rede_id).toBe('GUANABARA')
    })

    it('detecta ARMAZEM_GRAO via "armaz"', () => {
      const r = parseAlteracaoText('Loja: Armazem Grao Botafogo\nEntra: Carlos ABC1234')
      expect(r.rede_id).toBe('ARMAZEM_GRAO')
    })

    it('retorna null quando rede não identificada', () => {
      const r = parseAlteracaoText('Sai: Pedro LKV5067\nEntra: Rafael CYB3B90')
      expect(r.rede_id).toBeNull()
    })

    it('detecta ZONA_SUL via filial quando sem nome de rede', () => {
      const r = parseAlteracaoText('Filial 12\nEntra: Carlos ABC1234')
      expect(r.rede_id).toBe('ZONA_SUL')
    })
  })

  describe('detecção de tipo', () => {
    it('SUBSTITUICAO: entra e sai presentes sem troca de carro', () => {
      const r = parseAlteracaoText('Sai: Pedro LKV5067\nEntra: Rafael CYB3B90')
      expect(r.tipo).toBe('SUBSTITUICAO')
    })

    it('INCLUSAO: só Entra presente, sem Sai', () => {
      const r = parseAlteracaoText('Entra: Rafael CYB3B90')
      expect(r.tipo).toBe('INCLUSAO')
    })

    it('SWAP: troca de carro com motorista que permanece', () => {
      const r = parseAlteracaoText('Sai: ABC1234\nEntra: XYZ5678\nMotorista continua')
      expect(r.tipo).toBe('SWAP')
    })

    it('COMUNICADO: linha começa com "Comunicado"', () => {
      const r = parseAlteracaoText('Comunicado: Não haverá entrega amanhã.')
      expect(r.tipo).toBe('COMUNICADO')
    })

    it('INFORMATIVO: segunda viagem mencionada', () => {
      const r = parseAlteracaoText('segunda viagem ABC1234')
      expect(r.tipo).toBe('INFORMATIVO')
    })

    it('COMUNICADO fallback: nenhum slot encontrado', () => {
      const r = parseAlteracaoText('Apenas um aviso genérico sem motoristas.')
      expect(r.tipo).toBe('COMUNICADO')
    })
  })

  describe('normalização de placa', () => {
    it('placa com espaço é normalizada para sem espaço', () => {
      const r = parseAlteracaoText('Entra: Carlos ABC 1234')
      expect(r.entra?.placa_norm).toBe('ABC1234')
    })

    it('placa com hífen é normalizada', () => {
      const r = parseAlteracaoText('Entra: Carlos ABC-1234')
      expect(r.entra?.placa_norm).toBe('ABC1234')
    })

    it('placa Mercosul é normalizada', () => {
      const r = parseAlteracaoText('Entra: Carlos CYB3B90')
      expect(r.entra?.placa_norm).toBe('CYB3B90')
    })
  })

  describe('caso só Entra existe → INCLUSAO', () => {
    it('tipo é INCLUSAO', () => {
      const r = parseAlteracaoText('Entra: Rafael LKV5067')
      expect(r.tipo).toBe('INCLUSAO')
      expect(r.sai).toBeNull()
      expect(r.entra?.placa_norm).toBe('LKV5067')
    })

    it('motorista e placa são capturados', () => {
      const r = parseAlteracaoText('Entra: Rafael LKV5067')
      expect(r.entra?.motorista_nome).toMatch(/Rafael/i)
      expect(r.entra?.placa_norm).toBe('LKV5067')
    })
  })

  describe('troca só de carro sem mudança de motorista → SWAP', () => {
    it('tipo é SWAP quando ambas as placas existem e motorista permanece', () => {
      const r = parseAlteracaoText('Troca de carro\nSai: ABC1234\nEntra: XYZ5678')
      expect(r.tipo).toBe('SWAP')
    })

    it('tipo é SWAP com "motorista mesmo"', () => {
      const r = parseAlteracaoText('Motorista mesmo\nSai: ABC1234\nEntra: XYZ5678')
      expect(r.tipo).toBe('SWAP')
    })

    it('tipo não é SWAP quando placas estão presentes mas sem indicativo de troca de carro', () => {
      const r = parseAlteracaoText('Sai: Pedro ABC1234\nEntra: Rafael XYZ5678')
      expect(r.tipo).toBe('SUBSTITUICAO')
    })
  })

  describe('casos reais da cliente (varredura 02.06)', () => {
    it('Entra; com ponto-e-vírgula + "Placa : X" em linha própria (Princesa Arraial)', () => {
      const r = parseAlteracaoText('princesa Arraial 1 2 3\nEntra; Walter Regis\nPlaca : UBO 0B68\nSai: Antônio\nPlaca : MES 7F27\nCARRO QUEBROU')
      expect(r.tipo).toBe('SUBSTITUICAO')
      expect(r.rede_id).toBe('PRINCESA')
      expect(r.entra?.placa_norm).toBe('UBO0B68')   // substituto capturado (era perdido)
      expect(r.sai?.placa_norm).toBe('MES7F27')
    })

    it('header de loja SEM palavra-da-rede é identificado por fallback ("Caxias 1")', () => {
      const r = parseAlteracaoText('Caxias 1\nEntra: Victor 353 TJQ6J26')
      expect(r.loja_nome_raw).toBe('Caxias 1')      // antes vinha null
      expect(r.tipo).toBe('INCLUSAO')
      expect(r.entra?.placa_norm).toBe('TJQ6J26')
    })
  })
})
