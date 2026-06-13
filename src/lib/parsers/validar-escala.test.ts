import { describe, it, expect } from 'vitest'
import { validarEscala } from './validar-escala'
import type { LinhaEscala } from '@/lib/types/escala'

const linha = (o: Partial<LinhaEscala>): LinhaEscala => ({
  data: '2026-06-13', data_entrega: '2026-06-13', rede_id: 'ASSAI', loja_nome_raw: 'Assaí - X',
  loja_codigo_raw: null, placa_norm: 'ABC1234', placa_raw: 'ABC-1234', motorista_nome: 'JOÃO',
  motorista_codigo: null, tipo_carro: null, carro_ordem: 1, turno: 'MANHA', tipo_emissao: 'NORMAL',
  obs: null, restricao: null, peso_kg: null, paletes: null, raw_row_num: 1, ...o,
} as LinhaEscala)

const repete = (n: number, o: Partial<LinhaEscala>) => Array.from({ length: n }, () => linha(o))

describe('validarEscala', () => {
  it('escala vazia → ok:false (erro duro)', () => {
    const r = validarEscala([])
    expect(r.ok).toBe(false)
    expect(r.avisos.length).toBe(1)
  })

  it('escala boa → ok:true, sem avisos', () => {
    const r = validarEscala(repete(10, {}))
    expect(r.ok).toBe(true)
    expect(r.avisos).toEqual([])
  })

  it('maioria sem placa (coluna trocada) → avisa', () => {
    const r = validarEscala([...repete(6, { placa_norm: '' }), ...repete(4, {})])
    expect(r.ok).toBe(true) // não bloqueia, só avisa
    expect(r.avisos.some(a => a.includes('placa'))).toBe(true)
    expect(r.stats.semPlaca).toBe(6)
  })

  it('muitas redes desconhecidas → avisa', () => {
    const r = validarEscala([...repete(5, { rede_id: 'DESCONHECIDO' }), ...repete(5, {})])
    expect(r.avisos.some(a => a.includes('rede'))).toBe(true)
  })

  it('muitas linhas sem loja → avisa', () => {
    const r = validarEscala([...repete(4, { loja_nome_raw: '' }), ...repete(6, {})])
    expect(r.avisos.some(a => a.includes('loja'))).toBe(true)
  })

  it('poucas linhas problemáticas (abaixo do limiar) → sem aviso', () => {
    const r = validarEscala([...repete(1, { placa_norm: '' }), ...repete(9, {})])
    expect(r.avisos).toEqual([])
  })
})
