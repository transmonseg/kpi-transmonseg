import { describe, it, expect } from 'vitest'
import { inferirSaiDaEscalaLista, type EscalaLinha } from './inferir-sai'
import type { AlteracaoParsed } from './alteracao-text'

const escalaTitulares: EscalaLinha[] = [
  // Dia 24 — JOÃO está em Assaí Caxias I Loja 131 com placa antiga LSL-9670
  {
    rede_id: 'ASSAI', loja_nome_raw: 'Assai Caxias I', loja_codigo_raw: '131',
    motorista_nome: 'JOAO', motorista_codigo: 999, placa_norm: 'LSL9670', placa_raw: 'LSL-9670',
    carro_ordem: 1, data_entrega: '2026-05-24',
  },
  // Dia 23 — MARIA está em Assaí Nova Iguaçu 2 Loja 291
  {
    rede_id: 'ASSAI', loja_nome_raw: 'Assai Nova Iguacu 2', loja_codigo_raw: '291',
    motorista_nome: 'MARIA', motorista_codigo: 888, placa_norm: 'PQR1234', placa_raw: 'PQR-1234',
    carro_ordem: 1, data_entrega: '2026-05-23',
  },
]

function mkParsed(loja: string, rede_id: string | null, entraNome?: string, entraPlaca?: string): AlteracaoParsed {
  return {
    tipo: 'INCLUSAO',
    rede_id,
    loja_nome_raw: loja,
    entra: entraNome || entraPlaca ? {
      motorista_nome: entraNome ?? null,
      motorista_codigo: null,
      placa_norm: entraPlaca ?? null,
      placa_raw: entraPlaca ?? null,
    } : null,
    sai: null,
    motivo: null,
    texto_original: '',
    confianca: 'media',
  }
}

describe('U5 — inferirSaiDaEscalaLista (fallback dias anteriores)', () => {
  it('preenche sai com titular dia 24 quando alteração eh do dia 25 (caso PDF tia Erica)', () => {
    const alt = mkParsed('Assaí - Caxias I - Loja 131', 'ASSAI', 'ALLAN', 'UBO5E05')
    const [r] = inferirSaiDaEscalaLista([alt], escalaTitulares)
    expect(r.sai?.motorista_nome).toBe('JOAO')
    expect(r.sai?.placa_norm).toBe('LSL9670')
    expect(r.sai?.motorista_codigo).toBe(999)
  })

  it('match por filial 291 -> MARIA (Nova Iguaçu 2)', () => {
    const alt = mkParsed('Assaí - Nova Iguaçu 2 - Loja 291', 'ASSAI', 'EDSON', 'CPI4C81')
    const [r] = inferirSaiDaEscalaLista([alt], escalaTitulares)
    expect(r.sai?.motorista_nome).toBe('MARIA')
    expect(r.sai?.placa_norm).toBe('PQR1234')
  })

  it('NAO preenche sai se entra eh redundante (mesmo motorista E mesma placa)', () => {
    const alt = mkParsed('Assaí - Caxias I - Loja 131', 'ASSAI', 'JOAO', 'LSL9670')
    const [r] = inferirSaiDaEscalaLista([alt], escalaTitulares)
    expect(r.sai).toBe(null)
  })

  it('PREENCHE sai quando mesmo motorista trocou de carro (ASSAI Loja 133 dia 19)', () => {
    // Caso real: FELIPE DIEGO (placa UGA-1D55 antiga) trocou pra UBO-5E01.
    // Antes (U5 grosseiro): bloqueava. Agora preenche sai = motorista anterior + placa antiga.
    const alt = mkParsed('Assaí - Caxias I - Loja 131', 'ASSAI', 'JOAO', 'OUTRA9999')
    const [r] = inferirSaiDaEscalaLista([alt], escalaTitulares)
    expect(r.sai?.motorista_nome).toBe('JOAO')
    expect(r.sai?.placa_norm).toBe('LSL9670')
  })

  it('PREENCHE sai quando motorista diferente usa mesma placa (carro continua)', () => {
    const alt = mkParsed('Assaí - Caxias I - Loja 131', 'ASSAI', 'NOVO', 'LSL9670')
    const [r] = inferirSaiDaEscalaLista([alt], escalaTitulares)
    // Caso: NOVO assumiu o carro que era do JOAO. Sai = JOAO/LSL9670 (titular anterior).
    expect(r.sai?.motorista_nome).toBe('JOAO')
    expect(r.sai?.placa_norm).toBe('LSL9670')
  })

  it('preserva sai quando ja tem motorista/placa preenchido', () => {
    const alt: AlteracaoParsed = {
      ...mkParsed('Loja 131', 'ASSAI', 'ALLAN', 'UBO5E05'),
      sai: { motorista_nome: 'BRUNO', motorista_codigo: 111, placa_norm: 'AAA1111', placa_raw: 'AAA-1111' },
    }
    const [r] = inferirSaiDaEscalaLista([alt], escalaTitulares)
    expect(r.sai?.motorista_nome).toBe('BRUNO')
  })

  it('match por tokens fortes (sem filial numerica)', () => {
    const alt = mkParsed('Assaí Caxias I', 'ASSAI', 'ALLAN', 'UBO5E05')
    const [r] = inferirSaiDaEscalaLista([alt], escalaTitulares)
    expect(r.sai?.motorista_nome).toBe('JOAO')
  })

  it('filtra por rede_id quando informado (nao bate rede errada)', () => {
    const alt = mkParsed('Loja 131', 'PREZUNIC', 'ALLAN', 'UBO5E05')
    const [r] = inferirSaiDaEscalaLista([alt], escalaTitulares)
    expect(r.sai).toBe(null)
  })

  it('escala vazia: retorna parsed inalterado', () => {
    const alt = mkParsed('Loja 131', 'ASSAI')
    const [r] = inferirSaiDaEscalaLista([alt], [])
    expect(r.sai).toBe(null)
  })

  it('parsed sem loja_nome_raw: nao tenta inferir', () => {
    const alt: AlteracaoParsed = { ...mkParsed('Loja 131', 'ASSAI'), loja_nome_raw: null }
    const [r] = inferirSaiDaEscalaLista([alt], escalaTitulares)
    expect(r.sai).toBe(null)
  })
})

describe('carro_ordem — 2º carro pega o SAI do 2º carro (não do 1º)', () => {
  const escala: EscalaLinha[] = [
    { rede_id: 'ASSAI', loja_nome_raw: 'Assai Camil 211', loja_codigo_raw: '211',
      motorista_nome: 'LUIS', motorista_codigo: 141, placa_norm: 'LOT2962', placa_raw: 'LOT-2962',
      carro_ordem: 1, data_entrega: '2026-06-06' },
    { rede_id: 'ASSAI', loja_nome_raw: 'Assai Camil 211', loja_codigo_raw: '211',
      motorista_nome: 'PEDRO', motorista_codigo: 200, placa_norm: 'ABC1D23', placa_raw: 'ABC-1D23',
      carro_ordem: 2, data_entrega: '2026-06-06' },
  ]
  function alt(carroMotivo: string, entraPlaca: string): AlteracaoParsed {
    return { tipo: 'INCLUSAO', rede_id: 'ASSAI', loja_nome_raw: 'Assaí - Camil - Loja 211',
      entra: { motorista_nome: 'X', motorista_codigo: null, placa_norm: entraPlaca, placa_raw: entraPlaca },
      sai: null, motivo: carroMotivo, texto_original: '', confianca: 'media' }
  }
  it('2º CARRO → SAI = PEDRO (carro 2)', () => {
    const [r] = inferirSaiDaEscalaLista([alt('2º CARRO', 'KXR7F27')], escala)
    expect(r.sai?.motorista_nome).toBe('PEDRO')
    expect(r.sai?.placa_norm).toBe('ABC1D23')
  })
  it('1º CARRO → SAI = LUIS (carro 1)', () => {
    const [r] = inferirSaiDaEscalaLista([alt('1º CARRO', 'KMZ7057')], escala)
    expect(r.sai?.motorista_nome).toBe('LUIS')
  })
})
