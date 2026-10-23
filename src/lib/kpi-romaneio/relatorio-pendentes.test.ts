import { describe, it, expect } from 'vitest'
import { linhasPendentes, linhasPendentesPorAba, COLUNAS_PENDENTES } from './relatorio-pendentes'
import { resumirPlacas } from './ao-vivo'
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

// F1-10 (ACH-06): o arquivo levava toda NF nao entregue (22/10: 90 linhas
// contra 70 pendencias na conta) e a Erica tirava a mao as 19 de carga sem
// placa e o 1 sem rastreador. Tres abas, com rota, motivo e o que fazer.
describe('F1-10: linhasPendentesPorAba', () => {
  it('22/10 real: 70 afetam a taxa, 19 fora da conta, 1 sem rastreador', async () => {
    const { nfsDe2210 } = await import('./ao-vivo.fixture-2026-10-22')
    const { nfs, cargas } = nfsDe2210()
    const abas = linhasPendentesPorAba(resumirPlacas('2026-10-22', nfs, cargas, new Map()))
    expect(abas.afetam).toHaveLength(70)
    expect(abas.fora).toHaveLength(19)
    expect(abas.semRastreador).toHaveLength(1)
    expect(abas.semRastreador[0].placa).toBe('LLD4202')
    expect(abas.fora.every(l => l.motivo.startsWith('CARGA SEM PLACA'))).toBe(true)
    expect(abas.fora[0].oQueFazer).toMatch(/placa/i)
  })

  it('situação antiga gravada (carga sem placa como "revisar") também sai em Fora da conta', () => {
    const abas = linhasPendentesPorAba([
      placa('SEM PLACA', [nf({ nf: '1', carga: 'PAO-1', situacao: 'revisar', status: 'CARGA SEM PLACA NO ROMANEIO - CONFERIR COM A OPERAÇÃO' })]),
      placa('AAA1A11', [nf({ nf: '2', situacao: 'revisar', status: 'CADASTRO DO CLIENTE NA UNITRAC DIVERGE DO ROMANEIO (3,4 km) - CONFERIR' })]),
    ])
    expect(abas.fora.map(l => l.nf)).toEqual(['1'])
    expect(abas.afetam.map(l => l.nf)).toEqual(['2'])
  })

  it('rota em andamento vai para Fora da conta (ainda não pesa na taxa)', () => {
    const abas = linhasPendentesPorAba([placa('AAA1A11', [nf({ nf: '1', situacao: 'pendente', status: 'AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO' })])])
    expect(abas.afetam).toEqual([])
    expect(abas.fora[0].oQueFazer).toMatch(/aguardar/i)
  })

  it('linha traz rota, motivo (status do KPI), o que fazer e o link do mapa', () => {
    const p = { ...placa('AAA1A11', [nf({ nf: '2397193', carga: '100700', situacao: 'revisar', status: 'CADASTRO DO CLIENTE NA UNITRAC DIVERGE DO ROMANEIO (3,4 km) - CONFERIR' })]), destino: 'NOVA FRIBURGO' }
    const [l] = linhasPendentesPorAba([p], { origem: 'https://kpi.exemplo', data: '2026-10-22', cliente: 'nutrimax' }).afetam
    expect(l.rota).toBe('NOVA FRIBURGO')
    expect(l.motivo).toBe('CADASTRO DO CLIENTE NA UNITRAC DIVERGE DO ROMANEIO (3,4 km) - CONFERIR')
    expect(l.oQueFazer).toMatch(/cadastro/i)
    expect(l.mapa).toBe('https://kpi.exemplo/painel/ao-vivo?placa=AAA1A11&nf=2397193&data=2026-10-22&cliente=nutrimax')
    for (const c of COLUNAS_PENDENTES) expect(l).toHaveProperty(c.chave)
    expect(COLUNAS_PENDENTES.map(c => c.titulo)).toEqual(expect.arrayContaining(['Rota', 'Motivo', 'O que fazer', 'Ver no mapa']))
  })
})
