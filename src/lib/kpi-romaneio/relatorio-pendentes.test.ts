import { describe, it, expect } from 'vitest'
import { linhasPendentes, COLUNAS_PENDENTES } from './relatorio-pendentes'
import type { NfAoVivo, PlacaAoVivo, SituacaoNf } from './ao-vivo'

const nf = (o: Partial<NfAoVivo>): NfAoVivo => ({
  nf: '1', carga: '10', cliente: 'MERCADO A', endereco: 'RUA A, 1', status: 'X', situacao: 'pendente',
  chegada: null, saida: null, tempoMin: null, lat: null, lng: null, ...o,
})
const placa = (p: string, nfs: NfAoVivo[], motorista = 'JOSE'): PlacaAoVivo => ({
  placa: p, motorista, destino: '', cargas: [], saidaBase: null, chegadaBase: null, km: null, total: nfs.length, feitas: 0, pct: 0, nfs,
})

describe('linhasPendentes', () => {
  it('só entra o que não foi entregue', () => {
    const s: SituacaoNf[] = ['entregue', 'pendente', 'nao_confirmada', 'nao_foi', 'sem_rastreador', 'revisar']
    const linhas = linhasPendentes([placa('AAA1A11', s.map((situacao, i) => nf({ nf: String(i), situacao })))])
    expect(linhas.map(l => l.situacao)).toEqual(['Pendente', 'Não confirmada', 'Não foi ao cliente', 'Sem rastreador', 'A revisar'])
  })

  it('ordena por placa e depois por carga', () => {
    const linhas = linhasPendentes([
      placa('ZZZ9Z99', [nf({ nf: '1', carga: '2' })]),
      placa('AAA1A11', [nf({ nf: '2', carga: '9' }), nf({ nf: '3', carga: '1' })]),
    ])
    expect(linhas.map(l => l.nf)).toEqual(['3', '2', '1'])
  })

  it('traz o que o GPS mostra quando tem investigação', () => {
    const [l] = linhasPendentes([placa('AAA1A11', [nf({ situacao: 'nao_foi', investigacao: { categoria: 'parou_perto', distM: 300, hora: '14:32', minutos: 8 } })])])
    expect(l.gps).toContain('Parou perto')
    expect(l.gps).toContain('300 m')
  })

  it('sem investigação deixa o GPS vazio e sem horário mostra vazio', () => {
    const [l] = linhasPendentes([placa('AAA1A11', [nf({})])])
    expect(l.gps).toBe('')
    expect(l.chegada).toBe('')
    expect(l.tempoMin).toBe('')
  })

  it('lista vazia quando tudo foi entregue', () => {
    expect(linhasPendentes([placa('AAA1A11', [nf({ situacao: 'entregue' })])])).toEqual([])
  })

  it('colunas batem com as chaves da linha', () => {
    const [l] = linhasPendentes([placa('AAA1A11', [nf({})])])
    for (const c of COLUNAS_PENDENTES) expect(l).toHaveProperty(c.chave)
  })
})
