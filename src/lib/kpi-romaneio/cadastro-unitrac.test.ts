import { describe, it, expect } from 'vitest'
import { sugerirCadastroUnitrac, RAIO_CADASTRO_CONFIRMADO_M, LIMITE_NOSSA_COORD_LONGE_M } from './cadastro-unitrac'
import type { EntregaParaCorrigir } from './correcao-por-alvo'
import type { AlvoApi } from '@/lib/unitrac-api'
import type { ParadaBridge } from './base-horarios'

const alvo = (o: Partial<AlvoApi> = {}): AlvoApi => ({
  placaNorm: 'AAA1A11', codigoUnitrac: '900', nome: 'LOJA', situacao: 1,
  feitoISO: '2026-09-22T10:20:00', documento: '100', inicioISO: '2026-09-22T06:00:00',
  ordem: 1, rota: 'R1', pontoLat: -22.0000, pontoLng: -43.0000, ...o,
})
// paradas na convencao MASCARADA (digitos BRT + Z falso), igual ao feitoISO
const parada = (o: Partial<ParadaBridge> = {}): ParadaBridge => ({
  chegada: '2026-09-22T10:10:00.000Z', saida: '2026-09-22T10:30:00.000Z', duracaoSeg: 1200,
  lat: -22.0009, lng: -43.0, classificacao: 'FORA_BASE', ...o,
})
const entrega = (o: Partial<EntregaParaCorrigir> = {}): EntregaParaCorrigir => ({
  nf: '100', placaNorm: 'AAA1A11', endereco: 'RUA X, 1 - CENTRO, CABO FRIO',
  latAtual: -22.5, lngAtual: -43.5, confiavelAtual: true, fonteAtual: 'nominatim', ...o,
})
const paradas = (p: ParadaBridge[] = [parada()]) => new Map([['AAA1A11', p]])

describe('sugerirCadastroUnitrac', () => {
  it('constantes: 300 m confirmam o cadastro, nossa coord precisa estar a >500 m', () => {
    expect(RAIO_CADASTRO_CONFIRMADO_M).toBe(300)
    expect(LIMITE_NOSSA_COORD_LONGE_M).toBe(500)
  })

  it('cadastro a <=300m de parada que contem o feito e coord nossa longe -> grava o CADASTRO', () => {
    const r = sugerirCadastroUnitrac([entrega()], [alvo()], paradas())
    expect(r.sugestoes).toHaveLength(1)
    expect(r.sugestoes[0]).toMatchObject({ endereco: 'RUA X, 1 - CENTRO, CABO FRIO', latNova: -22.0, lngNova: -43.0, nfs: ['100'] })
  })

  it('feito com tolerancia de 10 min fora da janela da parada ainda confirma', () => {
    const p = parada({ chegada: '2026-09-22T10:00:00.000Z', saida: '2026-09-22T10:10:00.000Z' })
    expect(sugerirCadastroUnitrac([entrega()], [alvo({ feitoISO: '2026-09-22T10:18:00' })], paradas([p])).sugestoes).toHaveLength(1)
    expect(sugerirCadastroUnitrac([entrega()], [alvo({ feitoISO: '2026-09-22T10:40:00' })], paradas([p])).sugestoes).toHaveLength(0)
  })

  it('fuso: feito 3h deslocado NAO casa (convencao mascarada)', () => {
    expect(sugerirCadastroUnitrac([entrega()], [alvo({ feitoISO: '2026-09-22T13:20:00' })], paradas()).sugestoes).toHaveLength(0)
  })

  it('cadastro longe da parada (>300m): nao grava', () => {
    const r = sugerirCadastroUnitrac([entrega()], [alvo({ pontoLat: -22.01 })], paradas())
    expect(r.sugestoes).toHaveLength(0)
    expect(r.rejeicoes[0].motivo).toBe('cadastro_nao_confirmado')
  })

  it('nossa coordenada perto do cadastro (<=500m): nao mexe', () => {
    const r = sugerirCadastroUnitrac([entrega({ latAtual: -22.002, lngAtual: -43.0 })], [alvo()], paradas())
    expect(r.sugestoes).toHaveLength(0)
    expect(r.rejeicoes[0].motivo).toBe('coordenada_atual_ok')
  })

  it('sem coordenada nossa (K1): grava o cadastro', () => {
    const r = sugerirCadastroUnitrac([entrega({ latAtual: null, lngAtual: null, confiavelAtual: false, fonteAtual: null })], [alvo()], paradas())
    expect(r.sugestoes).toHaveLength(1)
  })

  it('fonte manual nunca e sobrescrita', () => {
    const r = sugerirCadastroUnitrac([entrega({ fonteAtual: 'manual' })], [alvo()], paradas())
    expect(r.sugestoes).toHaveLength(0)
    expect(r.rejeicoes[0].motivo).toBe('correcao_manual')
  })

  it('parada BASE ou longa demais (>120min) nao confirma', () => {
    expect(sugerirCadastroUnitrac([entrega()], [alvo()], paradas([parada({ classificacao: 'BASE' })])).sugestoes).toHaveLength(0)
    expect(sugerirCadastroUnitrac([entrega()], [alvo()], paradas([parada({ duracaoSeg: 3 * 3600 })])).sugestoes).toHaveLength(0)
  })

  it('cadastro invalido (null/0) ou alvo nao feito: rejeita', () => {
    expect(sugerirCadastroUnitrac([entrega()], [alvo({ pontoLat: null })], paradas()).sugestoes).toHaveLength(0)
    expect(sugerirCadastroUnitrac([entrega()], [alvo({ pontoLat: 0, pontoLng: 0 })], paradas()).sugestoes).toHaveLength(0)
    expect(sugerirCadastroUnitrac([entrega()], [alvo({ situacao: 0, feitoISO: null })], paradas()).sugestoes).toHaveLength(0)
  })

  it('mesmo endereco com cadastros divergentes (>300m) entre NFs: nao grava', () => {
    const e = [entrega({ nf: '100' }), entrega({ nf: '101' })]
    const a = [alvo({ documento: '100' }), alvo({ documento: '101', pontoLat: -22.0009, pontoLng: -43.0, codigoUnitrac: '901' })]
    // cadastro 100 = -22.0000 ; cadastro 101 = -22.0009 (~100m) -> compativel, grava
    expect(sugerirCadastroUnitrac(e, a, paradas()).sugestoes).toHaveLength(1)
    const a2 = [alvo({ documento: '100' }), alvo({ documento: '101', pontoLat: -22.004, codigoUnitrac: '901' })]
    const r = sugerirCadastroUnitrac(e, a2, new Map([['AAA1A11', [parada(), parada({ chegada: '2026-09-22T10:10:00.000Z', lat: -22.0041 })]]]))
    expect(r.sugestoes).toHaveLength(0)
  })

  it('endereco nao identificado: rejeita', () => {
    const r = sugerirCadastroUnitrac([entrega({ endereco: '(endereço não identificado)' })], [alvo()], paradas())
    expect(r.sugestoes).toHaveLength(0)
  })
})
