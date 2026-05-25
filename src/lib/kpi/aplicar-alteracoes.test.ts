import { describe, it, expect } from 'vitest'
import { aplicarAlteracoes, parsedToConfirmada, type AltConfirmada } from './aplicar-alteracoes'
import type { LinhaEscala } from '@/lib/types/escala'

function mkLinha(over: Partial<LinhaEscala>): LinhaEscala {
  return {
    data: '2026-05-22',
    rede_id: 'PREZUNIC',
    loja_nome_raw: 'Loja X',
    loja_codigo_raw: null,
    motorista_nome: 'Joao',
    motorista_codigo: '100',
    placa_raw: 'AAA1234',
    placa_norm: 'AAA1234',
    carro_ordem: 1,
    data_entrega: '2026-05-22',
    sub_rede: null,
    ...over,
  } as LinhaEscala
}

describe('aplicarAlteracoes', () => {
  it('retorna lista intacta quando sem alterações', () => {
    const linhas = [mkLinha({})]
    const out = aplicarAlteracoes(linhas, [])
    expect(out).toEqual(linhas)
  })

  it('SUBSTITUICAO troca placa+motorista quando match por placa de saída', () => {
    const linhas = [mkLinha({ placa_norm: 'OLD0000', motorista_nome: 'Antigo' })]
    const alts: AltConfirmada[] = [{
      tipo: 'SUBSTITUICAO',
      rede_id: 'PREZUNIC',
      loja_raw: null,
      entra: { motorista_nome: 'Novo', motorista_codigo: 999, placa_raw: 'NEW9999', placa_norm: 'NEW9999' },
      sai: { motorista_nome: null, placa_norm: 'OLD0000' },
    }]
    const out = aplicarAlteracoes(linhas, alts)
    expect(out[0].placa_norm).toBe('NEW9999')
    expect(out[0].motorista_nome).toBe('Novo')
    expect(out[0].motorista_codigo).toBe('999')
  })

  it('SUBSTITUICAO match por motorista (primeiro nome) — case insensitive', () => {
    const linhas = [mkLinha({ motorista_nome: 'José Roberto Silva' })]
    const alts: AltConfirmada[] = [{
      tipo: 'SUBSTITUICAO',
      rede_id: 'PREZUNIC',
      loja_raw: null,
      entra: { motorista_nome: 'Carlos', motorista_codigo: null, placa_raw: null, placa_norm: 'NEW9999' },
      sai: { motorista_nome: 'José', placa_norm: null },
    }]
    const out = aplicarAlteracoes(linhas, alts)
    expect(out[0].placa_norm).toBe('NEW9999')
    expect(out[0].motorista_nome).toBe('Carlos')
  })

  it('cross-rede: alteração PREZUNIC não afeta linha VIANENSE com mesma placa', () => {
    const linhas = [
      mkLinha({ rede_id: 'VIANENSE', placa_norm: 'AAA1234' }),
    ]
    const alts: AltConfirmada[] = [{
      tipo: 'SUBSTITUICAO',
      rede_id: 'PREZUNIC',
      loja_raw: null,
      entra: { motorista_nome: 'Novo', motorista_codigo: null, placa_raw: null, placa_norm: 'NEW9999' },
      sai: { motorista_nome: null, placa_norm: 'AAA1234' },
    }]
    const out = aplicarAlteracoes(linhas, alts)
    expect(out[0].placa_norm).toBe('AAA1234')  // não alterado
  })

  it('snapshot anti-cascata: SWAP mútuo', () => {
    // Filial 23 LQA5883↔LTE0A64 + Filial 43 LTE0A64↔LQA5883
    // Sem snapshot, a 2ª alt encontraria a placa já substituída pela 1ª e ficaria errado
    const linhas = [
      mkLinha({ loja_codigo_raw: '23', placa_norm: 'LQA5883', motorista_nome: 'A' }),
      mkLinha({ loja_codigo_raw: '43', placa_norm: 'LTE0A64', motorista_nome: 'B' }),
    ]
    const alts: AltConfirmada[] = [
      {
        tipo: 'SWAP',
        rede_id: 'PREZUNIC',
        loja_raw: 'Filial 23',
        entra: { motorista_nome: null, motorista_codigo: null, placa_raw: 'LTE0A64', placa_norm: 'LTE0A64' },
        sai: { motorista_nome: null, placa_norm: 'LQA5883' },
      },
      {
        tipo: 'SWAP',
        rede_id: 'PREZUNIC',
        loja_raw: 'Filial 43',
        entra: { motorista_nome: null, motorista_codigo: null, placa_raw: 'LQA5883', placa_norm: 'LQA5883' },
        sai: { motorista_nome: null, placa_norm: 'LTE0A64' },
      },
    ]
    const out = aplicarAlteracoes(linhas, alts)
    expect(out[0].placa_norm).toBe('LTE0A64')
    expect(out[1].placa_norm).toBe('LQA5883')
    // Motoristas devem ficar intactos (SWAP só troca placa)
    expect(out[0].motorista_nome).toBe('A')
    expect(out[1].motorista_nome).toBe('B')
  })

  it('match por loja_raw quando não tem placa nem motorista em sai', () => {
    const linhas = [mkLinha({ loja_codigo_raw: '23', placa_norm: 'OLD0000' })]
    const alts: AltConfirmada[] = [{
      tipo: 'SUBSTITUICAO',
      rede_id: 'PREZUNIC',
      loja_raw: 'Filial 23',
      entra: { motorista_nome: 'Novo', motorista_codigo: null, placa_raw: null, placa_norm: 'NEW9999' },
      sai: null,
    }]
    const out = aplicarAlteracoes(linhas, alts)
    expect(out[0].placa_norm).toBe('NEW9999')
  })

  it('SUBSTITUICAO afeta MÚLTIPLAS linhas com mesma placa (uma placa serve múltiplas lojas)', () => {
    const linhas = [
      mkLinha({ loja_nome_raw: 'Loja A', placa_norm: 'OLD0000' }),
      mkLinha({ loja_nome_raw: 'Loja B', placa_norm: 'OLD0000' }),
    ]
    const alts: AltConfirmada[] = [{
      tipo: 'SUBSTITUICAO',
      rede_id: 'PREZUNIC',
      loja_raw: null,
      entra: { motorista_nome: 'Novo', motorista_codigo: null, placa_raw: null, placa_norm: 'NEW9999' },
      sai: { motorista_nome: null, placa_norm: 'OLD0000' },
    }]
    const out = aplicarAlteracoes(linhas, alts)
    expect(out[0].placa_norm).toBe('NEW9999')
    expect(out[1].placa_norm).toBe('NEW9999')
  })

  it('SWAP afeta APENAS UMA linha (a primeira que casa)', () => {
    const linhas = [
      mkLinha({ loja_nome_raw: 'Loja A', placa_norm: 'OLD0000' }),
      mkLinha({ loja_nome_raw: 'Loja B', placa_norm: 'OLD0000' }),
    ]
    const alts: AltConfirmada[] = [{
      tipo: 'SWAP',
      rede_id: 'PREZUNIC',
      loja_raw: null,
      entra: { motorista_nome: null, motorista_codigo: null, placa_raw: 'NEW9999', placa_norm: 'NEW9999' },
      sai: { motorista_nome: null, placa_norm: 'OLD0000' },
    }]
    const out = aplicarAlteracoes(linhas, alts)
    expect(out[0].placa_norm).toBe('NEW9999')
    expect(out[1].placa_norm).toBe('OLD0000')
  })

  it('tipo COMUNICADO/INFORMATIVO é ignorado', () => {
    const linhas = [mkLinha({ placa_norm: 'AAA1234' })]
    const alts: AltConfirmada[] = [{
      tipo: 'COMUNICADO',
      rede_id: 'PREZUNIC',
      loja_raw: null,
      entra: { motorista_nome: 'Novo', motorista_codigo: null, placa_raw: null, placa_norm: 'NEW9999' },
      sai: { motorista_nome: null, placa_norm: 'AAA1234' },
    }]
    const out = aplicarAlteracoes(linhas, alts)
    expect(out[0].placa_norm).toBe('AAA1234')  // não alterado
  })

  it('parsedToConfirmada converte AlteracaoParsed corretamente', () => {
    const parsed = {
      tipo: 'SUBSTITUICAO',
      rede_id: 'PREZUNIC',
      loja_nome_raw: 'Loja X',
      entra: { motorista_nome: 'Novo', motorista_codigo: 999, placa_raw: 'NEW9999', placa_norm: 'NEW9999' },
      sai: { motorista_nome: 'Antigo', placa_norm: 'OLD0000' },
    }
    const out = parsedToConfirmada(parsed)
    expect(out.loja_raw).toBe('Loja X')
    expect(out.tipo).toBe('SUBSTITUICAO')
    expect(out.entra?.placa_norm).toBe('NEW9999')
    expect(out.sai?.placa_norm).toBe('OLD0000')
  })
})
