import { describe, it, expect } from 'vitest'
import { nfsDe2210 } from './ao-vivo.fixture-2026-10-22'
import fila2210 from './__fixtures__/fila-conferir-nutry-2026-10-22.json'
import { resumirPlacas, type PlacaAoVivo } from './ao-vivo'
import type { Investigacao } from './investigacao'
import {
  nfSemNumeroReal,
  montarFilaConferir, taxaAposConferencia, ACOES_CONFERENCIA, acaoConferencia, empresaDaResolucao,
  paraTela, rotuloResolucao, motivoLegivel, type ResolucaoTela,
} from './fila-conferir'

// F3-03 (ACH-02, KN-11, KRQ-10): fila "Conferir" do Ao vivo. Caso real:
// Nutry Max 22/10 (fechamento das 05:30 CEST de 23/10) -- 2.183/2.253 = 96,9%,
// 70 NFs na conta não entregues; as 5 com parada a até 500 m foram recusadas
// de propósito ("parada de outro cliente") e só sobem com comprovante.

function placas2210(): PlacaAoVivo[] {
  const { nfs, cargas } = nfsDe2210()
  const placas = resumirPlacas('2026-10-22', nfs, cargas, new Map())
  const inv = new Map((fila2210.nfs as [string, string, string, string, string, Investigacao | null][]).map(x => [x[2], x[5]]))
  for (const p of placas) for (const n of p.nfs) {
    const i = inv.get(n.nf)
    if (i && n.situacao !== 'entregue') n.investigacao = i
  }
  return placas
}

let id = 0
const res = (nf: string, resolucao: ResolucaoTela['resolucao'], extra: Partial<ResolucaoTela> = {}): ResolucaoTela => ({
  id: ++id, nf, resolucao, responsavel: 'erica@transmonseg', criadoEm: '2026-10-23T12:00:00.000Z', observacao: null, placaExecutora: null, temComprovante: resolucao.startsWith('entregue'), ...extra,
})

describe('montarFilaConferir (22/10 Nutry)', () => {
  const placas = placas2210()
  const f = montarFilaConferir(placas, [])

  it('70 notas pesam na taxa e não foram entregues (fora da conta e sem rastreador ficam fora)', () => {
    expect(f.pendentes).toHaveLength(70)
    expect(f.conferidas).toHaveLength(0)
    expect(f.pendentes.some(i => i.placa === 'LLD4202')).toBe(false)
    expect(f.pendentes.some(i => i.nf.status.startsWith('CARGA SEM PLACA'))).toBe(false)
  })

  it('as 5 NFs com parada a até 500 m no topo, mais perto antes, com o motivo do KPI', () => {
    expect(f.pendentes.slice(0, 5).map(i => `${i.placa} ${i.nf.nf}`)).toEqual([
      'RQV5F64 2437979', 'RBJ2H28 2438429', 'RQV5F64 2437974', 'RQU8D91 2438678', 'RQV9E37 2436658',
    ])
    expect(f.pendentes[0].nf.status).toBe('PARADA DE OUTRO CLIENTE - NÃO CONFIRMA ESTE CLIENTE - CONFERIR')
    expect(f.pendentes[0].motivo).toEqual({ motivo: 'Parada de outro cliente, não confirma este cliente', acao: 'Conferir' })
    expect(f.pendentes[0].frase).toBe('Parada mais perto: 14 m do cliente às 09:16 (4 min).')
    expect(f.pendentes[1].nf.status).toBe('PAROU NO ENDEREÇO JUNTO COM OUTRO CLIENTE DA MESMA PLACA (7 MIN) - CONFERIR')
    expect(f.pendentes[3].titulo).toBe('Parou perto (150 a 500 m)')
  })

  it('nota conferida sai da fila e vai para "Conferidas" com a resolução', () => {
    const g = montarFilaConferir(placas, [res('2437979', 'entregue')])
    expect(g.pendentes).toHaveLength(69)
    expect(g.conferidas.map(i => i.nf.nf)).toEqual(['2437979'])
    expect(g.conferidas[0].resolucao?.resolucao).toBe('entregue')
  })

  it('resolução de nota entregue pelo GPS também aparece em "Conferidas" (palavra da operação)', () => {
    const entregue = placas.flatMap(p => p.nfs).find(n => n.situacao === 'entregue')!
    const g = montarFilaConferir(placas, [res(entregue.nf, 'nao_esteve_no_local')])
    expect(g.pendentes).toHaveLength(70)
    expect(g.conferidas.map(i => i.nf.nf)).toEqual([entregue.nf])
  })
})

describe('taxaAposConferencia (D-06: separada da oficial)', () => {
  const placas = placas2210()

  it('sem conferência é igual à oficial: 2.183/2.253 = 96,9%', () => {
    expect(taxaAposConferencia(placas, [])).toEqual({ confirmadas: 2183, naConta: 2253, taxa: 96.9, conferidas: 0 })
  })

  it('3 comprovantes mudam exatamente 3 NFs (2.186/2.253 = 97,0%); a automática não muda', () => {
    const antes = JSON.stringify(placas)
    const t = taxaAposConferencia(placas, [res('2437979', 'entregue'), res('2438429', 'entregue'), res('2437974', 'entregue_outra_placa', { placaExecutora: 'RQV5F67' })])
    expect(t).toEqual({ confirmadas: 2186, naConta: 2253, taxa: 97, conferidas: 3 })
    expect(JSON.stringify(placas)).toBe(antes)
  })

  it('"Não esteve no local" numa nota que o GPS deu como entregue tira ela das corretas', () => {
    const entregue = placas.flatMap(p => p.nfs).find(n => n.situacao === 'entregue')!
    expect(taxaAposConferencia(placas, [res(entregue.nf, 'nao_esteve_no_local')])).toMatchObject({ confirmadas: 2182, naConta: 2253 })
  })

  it('"Ponto do cliente errado" (desatualizado) tira a nota da conta até o ponto ser corrigido', () => {
    expect(taxaAposConferencia(placas, [res('2438678', 'desatualizado')])).toMatchObject({ confirmadas: 2183, naConta: 2252 })
  })

  it('carga sem placa com comprovante entra na conta após conferência (mesma regra da planilha)', () => {
    const semPlaca = placas.flatMap(p => p.nfs).find(n => n.status.startsWith('CARGA SEM PLACA'))!
    expect(taxaAposConferencia(placas, [res(semPlaca.nf, 'entregue')])).toMatchObject({ confirmadas: 2184, naConta: 2254 })
  })
})

describe('ações da fila', () => {
  it('quatro ações, gravando o enum do importador', () => {
    expect(ACOES_CONFERENCIA.map(a => [a.acao, a.resolucao, a.rotulo])).toEqual([
      ['comprovante', 'entregue', 'Entregue — tenho comprovante'],
      ['nao_esteve', 'nao_esteve_no_local', 'Não esteve no local'],
      ['ponto_errado', 'desatualizado', 'Ponto do cliente errado'],
      ['outra_placa', 'entregue_outra_placa', 'Entregue por outra placa'],
    ])
  })
  it('entregue exige comprovante (D-07); outra placa exige a placa e o comprovante', () => {
    expect(acaoConferencia('comprovante')).toMatchObject({ exigeComprovante: true, exigePlaca: false })
    expect(acaoConferencia('outra_placa')).toMatchObject({ exigeComprovante: true, exigePlaca: true })
    expect(acaoConferencia('nao_esteve')).toMatchObject({ exigeComprovante: false })
    expect(acaoConferencia('xpto')).toBeNull()
  })
  it('chave da empresa em kpi_nf_resolucao', () => {
    expect(empresaDaResolucao('nutrimax')).toBe('NUTRY MAX')
    expect(empresaDaResolucao('rioquality')).toBe('RIO QUALITY')
  })
  it('linha do banco para a tela (sem expor o caminho do arquivo)', () => {
    const t = paraTela({ id: 7, empresa: 'NUTRY MAX', data: '2026-10-22', nf: '1', resolucao: 'entregue_outra_placa', placa_executora: 'RQV5F67', observacao: 'canhoto', responsavel: 'erica', documento: 'comprovantes/nutrimax/2026-10-22/1.jpg', criado_em: '2026-10-23T12:00:00Z' })
    expect(t).toEqual({ id: 7, nf: '1', resolucao: 'entregue_outra_placa', responsavel: 'erica', criadoEm: '2026-10-23T12:00:00Z', observacao: 'canhoto', placaExecutora: 'RQV5F67', temComprovante: true })
    expect(rotuloResolucao(t)).toBe('Entregue por outra placa (RQV5F67)')
  })
  it('motivoLegivel separa o motivo do "conferir"', () => {
    expect(motivoLegivel('PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA - CONFERIR')).toEqual({ motivo: 'Passou no endereço mas não registrou parada', acao: 'Conferir' })
  })
})

describe('nfSemNumeroReal (F3-R04)', () => {
  it('RQ sem NF: chave sintética "<placa>-<seq>" (ou "-<seq>" sem placa)', () => {
    expect(nfSemNumeroReal('rioquality', 'RQU2G47-5')).toBe(true)
    expect(nfSemNumeroReal('rioquality', 'LTZ7I72-12')).toBe(true)
    expect(nfSemNumeroReal('rioquality', '-3')).toBe(true)
  })
  it('NF real (55 colunas), pedido da Fusion e NF repetida com sufixo: não', () => {
    expect(nfSemNumeroReal('rioquality', '5555374')).toBe(false)
    expect(nfSemNumeroReal('rioquality', '5555374-2')).toBe(false)
    expect(nfSemNumeroReal('rioquality', '6083720')).toBe(false)
  })
  it('Nutry nunca', () => {
    expect(nfSemNumeroReal('nutrimax', 'RQU2G47-5')).toBe(false)
  })
})
