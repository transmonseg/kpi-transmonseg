import { describe, it, expect } from 'vitest'
import { aplicarConferenciasAoVivo, marcaDoResultado } from './ao-vivo-conferencia'
import { vigentesPorNf, type ResolucaoNfRow } from './resolucoes'
import { taxaAposConferencia } from './fila-conferir'
import type { NfAoVivo, PlacaAoVivo } from './ao-vivo'

const nf = (n: string, situacao: NfAoVivo['situacao']): NfAoVivo => ({ nf: n, carga: '1', cliente: `C${n}`, endereco: '', status: '', situacao, chegada: null, saida: null, tempoMin: null, lat: null, lng: null })
const placa = (nfs: NfAoVivo[]): PlacaAoVivo => ({ placa: 'RQP5I85', motorista: '', destino: '', cargas: ['1'], saidaBase: null, chegadaBase: null, km: null, total: nfs.length, feitas: nfs.filter(n => n.situacao === 'entregue').length, pct: 0, nfs })
const base = () => ({
  calculadoEm: '2026-11-09T20:00:00Z',
  // 3 na conta (1 entregue, 1 revisar, 1 nao_foi) + 1 aguardando + 1 fora
  resumo: { taxa: 33.3, entregues: 1, nfsNaConta: 3, aguardando: 1, totalNfs: 5, feitas: 1, pct: 20 },
  placas: [placa([nf('1', 'entregue'), nf('2', 'revisar'), nf('3', 'nao_foi'), nf('4', 'pendente'), nf('5', 'fora_da_conta')])],
})
const conf = (n: string, resolucao: ResolucaoNfRow['resolucao'], criadoEm = '2026-11-09T21:00:00Z') => ({ nf: n, resolucao, responsavel: 'erica', criadoEm })

describe('conferência da operação vale na hora no Ao vivo', () => {
  it('confirmada vira entregue e a taxa sobe', () => {
    const r = aplicarConferenciasAoVivo(base(), [conf('2', 'confirmada_operacao')])
    const n2 = r.placas[0].nfs[1]
    expect(n2.situacao).toBe('entregue')
    expect(n2.conferencia?.situacaoAutomatica).toBe('revisar')
    expect(n2.conferencia?.responsavel).toBe('erica')
    expect(r.resumo).toMatchObject({ entregues: 2, nfsNaConta: 3, taxa: 66.7, feitas: 2, pct: 40 })
    expect(r.placas[0].feitas).toBe(2)
  })
  it('aguardando e fora da conta confirmadas entram na conta', () => {
    const r = aplicarConferenciasAoVivo(base(), [conf('4', 'confirmada_operacao'), conf('5', 'entregue')])
    expect(r.resumo).toMatchObject({ entregues: 3, nfsNaConta: 5, aguardando: 0, taxa: 60 })
  })
  it('não esteve derruba entregue; ponto errado sai da conta', () => {
    const r = aplicarConferenciasAoVivo(base(), [conf('1', 'nao_esteve_no_local'), conf('3', 'desatualizado')])
    expect(r.placas[0].nfs[0].situacao).toBe('nao_foi')
    expect(r.placas[0].nfs[2].situacao).toBe('fora_da_conta')
    expect(r.resumo).toMatchObject({ entregues: 0, nfsNaConta: 2, taxa: 0 })
  })
  it('sem conferência não mexe e não muta o original', () => {
    const b = base()
    const r = aplicarConferenciasAoVivo(b, [])
    expect(r.placas).toBe(b.placas)
    expect(r.marca).toBe(b.calculadoEm)
    aplicarConferenciasAoVivo(b, [conf('2', 'confirmada_operacao')])
    expect(b.placas[0].nfs[1].situacao).toBe('revisar')
  })
  it('marca muda com conferência nova', () => {
    expect(marcaDoResultado('x', [conf('2', 'confirmada_operacao')])).not.toBe(marcaDoResultado('x', [conf('2', 'confirmada_operacao'), conf('3', 'confirmada_operacao', '2026-11-09T22:00:00Z')]))
  })
  it('desfeita volta ao automático', () => {
    const linha = (id: number, resolucao: ResolucaoNfRow['resolucao'], criado_em: string): ResolucaoNfRow => ({ id, empresa: 'NUTRY MAX', data: '2026-11-09', nf: '2', resolucao, placa_executora: null, observacao: null, responsavel: 'erica', documento: null, criado_em })
    const v = vigentesPorNf([linha(1, 'confirmada_operacao', '2026-11-09T21:00:00Z'), linha(2, 'desfeita', '2026-11-09T21:05:00Z')])
    expect(v.size).toBe(0)
    const v2 = vigentesPorNf([linha(1, 'desfeita', '2026-11-09T21:00:00Z'), linha(2, 'confirmada_operacao', '2026-11-09T21:05:00Z')])
    expect(v2.get('2')?.resolucao).toBe('confirmada_operacao')
  })
  it('fila: conferida conta como confirmada após conferência', () => {
    const t = taxaAposConferencia(base().placas, [{ id: 1, nf: '2', resolucao: 'confirmada_operacao', responsavel: 'e', criadoEm: '2026-11-09T21:00:00Z', observacao: null, placaExecutora: null, temComprovante: false }])
    expect(t.confirmadas).toBe(2)
  })
})
