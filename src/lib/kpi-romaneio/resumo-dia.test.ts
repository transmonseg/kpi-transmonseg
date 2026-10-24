import { describe, it, expect } from 'vitest'
import { nfsDe2210 } from './ao-vivo.fixture-2026-10-22'
import horarios2210 from './__fixtures__/resumo-dia-nutry-2026-10-22-placas.json'
import rq from './__fixtures__/resumo-dia-rq-2026-10-14a22.json'
import { resumirPlacas, contarCorretas, type PlacaAoVivo, type SituacaoNf } from './ao-vivo'
import type { ResultadoAoVivo } from './ao-vivo-servico'
import {
  linhaMeta, placaAbaixoDaMeta, placaSemHorarioBase, ordenarPioresPrimeiro,
  montarResumoDia, textoResumoDia, type DiaAnterior,
} from './resumo-dia'

// F3-02 (ACH-03, AC-06): Resumo do dia por regra,
// sem LLM. Casos reais de kpi_ao_vivo_calculo (fechamento das 05:30 CEST).

function resultadoNutry2210(): ResultadoAoVivo {
  const { nfs, cargas } = nfsDe2210()
  const placas = resumirPlacas('2026-10-22', nfs, cargas, new Map())
  const h = new Map((horarios2210.placas as [string, string, string | null, string | null, string[]][]).map(x => [x[0], x]))
  for (const p of placas) {
    const x = h.get(p.placa)
    if (!x) continue
    p.motorista = x[1]; p.saidaBase = x[2]; p.chegadaBase = x[3]
  }
  return {
    calculadoEm: '2026-10-23T03:30:24.421Z',
    resumo: { taxa: 96.9, entregues: 2183, nfsNaConta: 2253, aguardando: 0, totalNfs: 2272, feitas: contarCorretas(placas), pct: 96 },
    placas,
  }
}

type DiaRq = (typeof rq.dias)[number]
function placasRq(d: DiaRq): PlacaAoVivo[] {
  return d.placas.map(p => ({
    placa: p.placa, motorista: p.motorista ?? '', destino: p.destino ?? '', cargas: [...new Set(p.nfs.map(n => n[0] as string))],
    saidaBase: p.saidaBase, chegadaBase: p.chegadaBase, km: null, total: p.nfs.length,
    feitas: 0, pct: 0,
    nfs: p.nfs.map(n => ({ carga: n[0] as string, nf: n[1] as string, situacao: n[2] as SituacaoNf, status: (n[3] as string) ?? 'ENTREGUE', cliente: '', endereco: '', chegada: null, saida: null, tempoMin: null, lat: null, lng: null })),
  }))
}
function resultadoRq(data: string): ResultadoAoVivo {
  const d = rq.dias.find(x => x.data === data)!
  return { calculadoEm: `${data}T23:00:00Z`, resumo: d.resumo, placas: placasRq(d) }
}
function anterioresRq(data: string): DiaAnterior[] {
  return rq.dias.filter(d => d.data < data).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 6)
    .map(d => ({ data: d.data, resumo: d.resumo, placas: placasRq(d) }))
}

const anterioresNutry: DiaAnterior[] = [
  ['2026-10-21', 95.7], ['2026-10-20', 95.5], ['2026-10-17', 95.1], ['2026-10-16', 94.5], ['2026-10-15', 94.3],
].map(([data, taxa]) => ({ data: data as string, resumo: { taxa: taxa as number, entregues: null, nfsNaConta: null, aguardando: 0, totalNfs: 0, feitas: 0, pct: 0 }, placas: [] }))

describe('linhaMeta (Ao vivo: "X% · meta Y% · faltam N · K fora da conta")', () => {
  it('Nutry 22/10: 96,9% · meta 97% · faltam 3 · 19 fora da conta', () => {
    const l = linhaMeta(resultadoNutry2210().resumo, 97)
    expect(l).toMatchObject({ taxa: 96.9, meta: 97, faltam: 3, foraDaConta: 19, aguardando: 0 })
    expect(l.texto).toBe('96,9% no KPI · meta 97% · faltam 3 · 19 fora da conta')
  })
  it('RQ 22/10: 91,4% · meta 93% · faltam 47', () => {
    const l = linhaMeta(rq.dias.find(d => d.data === '2026-10-22')!.resumo, 93)
    expect(l.faltam).toBe(47)
    expect(l.texto).toBe('91,4% no KPI · meta 93% · faltam 47 · 0 fora da conta')
  })
  it('dia em andamento conta as aguardando na conta (RQ 24/10 13:11: 178 de 506, 328 aguardando)', () => {
    const l = linhaMeta({ taxa: 100, entregues: 178, nfsNaConta: 178, aguardando: 328, totalNfs: 506, feitas: 178, pct: 35 }, 93)
    // ceil(0,93 × 506) = 471; 471 − 178 = 293.
    expect(l.faltam).toBe(293)
    expect(l.texto).toBe('100% no KPI até agora · meta 93% · faltam 293 (328 aguardando) · 0 fora da conta')
  })
  it('meta batida', () => {
    expect(linhaMeta({ taxa: 97.4, entregues: 1844, nfsNaConta: 1893, aguardando: 0, totalNfs: 1893, feitas: 1843, pct: 97 }, 97).texto)
      .toBe('97,4% no KPI · meta 97% batida · 0 fora da conta')
  })
})

describe('chips do Ao vivo', () => {
  const r = resultadoNutry2210()
  it('"Sem horário da base": RQV9B26 e RQU8D91; LLD4202 (sem rastreador) e SEM PLACA ficam fora', () => {
    expect(r.placas.filter(p => placaSemHorarioBase(p)).map(p => p.placa).sort()).toEqual(['RQU8D91', 'RQV9B26'])
  })
  it('"Abaixo da meta": RQU2G47 28/38 entra; placa 100% e SEM PLACA não', () => {
    const abaixo = new Set(r.placas.filter(p => placaAbaixoDaMeta(p, 97)).map(p => p.placa))
    expect(abaixo.has('RQU2G47')).toBe(true)
    expect(abaixo.has('SEM PLACA')).toBe(false)
    expect(abaixo.has('LLD4202')).toBe(false)
  })
  it('placa em rota sem chegada não entra no chip; sem saída só depois de alguma entrega', () => {
    const base = r.placas.find(p => p.placa === 'RQU2G47')!
    const emRota = { ...base, chegadaBase: null, nfs: base.nfs.map((n, i) => (i === 0 ? { ...n, situacao: 'pendente' as const } : n)) }
    expect(placaSemHorarioBase(emRota)).toBe(false)
    const naoSaiu = { ...base, saidaBase: null, chegadaBase: null, nfs: base.nfs.map(n => ({ ...n, situacao: 'pendente' as const })) }
    expect(placaSemHorarioBase(naoSaiu)).toBe(false)
  })
  it('piores primeiro: RQU2G47 no topo; SEM PLACA e só sem rastreador no fim', () => {
    const ord = ordenarPioresPrimeiro(r.placas)
    expect(ord[0].placa).toBe('RQU2G47')
    expect(ord.slice(-2).map(p => p.placa).sort()).toEqual(['LLD4202', 'SEM PLACA'])
  })
})

describe('montarResumoDia — Nutry 22/10', () => {
  const resumo = montarResumoDia({
    cliente: 'nutrimax', data: '2026-10-22', resultado: resultadoNutry2210(), meta: 97,
    anteriores: anterioresNutry,
  })
  it('resultado: KPI 2.183/2.253 = 96,9%, GPS 2.182/2.272 = 96,0%, meta 97, faltam 3', () => {
    expect(resumo.resultado).toMatchObject({ taxa: 96.9, entregues: 2183, naConta: 2253, gpsComprovadas: 2182, totalNfs: 2272, pctGps: 96, meta: 97, faltam: 3, foraDaConta: 19, semRastreadorContadas: 1 })
  })
  it('fora da conta com a ação: 19 notas do pão sem placa (PAO-1, 6, 10, 11, 13)', () => {
    expect(resumo.foraDaConta).toHaveLength(1)
    expect(resumo.foraDaConta[0]).toMatchObject({ motivo: 'Carga sem placa', nfs: 19, cargas: ['PAO-1', 'PAO-6', 'PAO-10', 'PAO-11', 'PAO-13'] })
    expect(resumo.foraDaConta[0].acao).toMatch(/Placas do dia/)
  })
  it('piores cargas: RQU2G47 (Itaperuna 2) primeiro, 28/38; destaques 52 de 92 cargas em 100%', () => {
    expect(resumo.pioresCargas[0]).toMatchObject({ placa: 'RQU2G47', carga: '100596', rota: 'ITAPERUNA 2', corretas: 28, naConta: 38, faltas: 10 })
    expect(resumo.pioresCargas.length).toBeLessThanOrEqual(5)
    expect(resumo.cargas100).toEqual({ em100: 52, total: 92 })
  })
  it('qualidade do dado: sem horário da base RQU8D91 (chegada) e RQV9B26 (saída e chegada)', () => {
    expect(resumo.qualidade.semHorarioBase).toEqual([
      { placa: 'RQU8D91', falta: 'chegada' },
      { placa: 'RQV9B26', falta: 'saída e chegada' },
    ])
  })
  it('comparação: ontem 21/10 95,7%; média dos 5 dias anteriores 95,0%', () => {
    expect(resumo.comparacao.ontem).toEqual({ data: '2026-10-21', taxa: 95.7 })
    expect(resumo.comparacao.semana).toEqual({ media: 95, dias: 5 })
  })
  it('texto para copiar: conta pronta, sem nome de cliente nem NF', () => {
    const t = textoResumoDia(resumo, 'Nutry Max')
    expect(t).toContain('Resumo do dia — Nutry Max — 22/10/2026')
    expect(t).toContain('96,9% no KPI (2.183 de 2.253)')
    expect(t).toContain('Comprovadas pelo GPS: 96,0% (2.182 de 2.272)')
    expect(t).toContain('Meta 97%: faltam 3')
    expect(t).toContain('RQU2G47')
    expect(t).toContain('52 de 92 cargas em 100%')
    expect(t).not.toMatch(/CLIENTE \d/)
  })
})



describe('RQ 22/10 — comprovadas pelo GPS', () => {
  it('101 NFs sem rastreador contadas como corretas; GPS 2.532/2.881 = 87,9%', () => {
    const r = montarResumoDia({ cliente: 'rioquality', data: '2026-10-22', resultado: resultadoRq('2026-10-22'), meta: 93, anteriores: anterioresRq('2026-10-22') })
    expect(r.resultado.semRastreadorContadas).toBe(101)
    expect(r.resultado.gpsComprovadas).toBe(2532)
    expect(r.resultado.pctGps).toBe(87.9)
  })
})

describe('clientes crônicos', () => {
  const nf = (cliente: string, situacao: SituacaoNf) => ({ carga: 'C1', nf: `${cliente}-${situacao}`, situacao, status: situacao === 'entregue' ? 'ENTREGUE' : 'NÃO FOI AO CLIENTE', cliente, endereco: '', chegada: null, saida: null, tempoMin: null, lat: null, lng: null })
  const placa = (nfs: ReturnType<typeof nf>[]): PlacaAoVivo => ({ placa: 'AAA1A11', motorista: '', destino: '', cargas: ['C1'], saidaBase: 'x', chegadaBase: 'y', km: null, total: nfs.length, feitas: 0, pct: 0, nfs })
  const res = (nfs: ReturnType<typeof nf>[]) => ({ taxa: 50, entregues: 1, nfsNaConta: 2, aguardando: 0, totalNfs: 2, feitas: 1, pct: 50 })
  it('cliente que falhou hoje e em 2+ dos dias anteriores', () => {
    const hoje = [nf('MERCADO BOM', 'nao_foi'), nf('PADARIA', 'nao_foi')]
    const ant: DiaAnterior[] = [
      { data: '2026-10-21', resumo: res([]), placas: [placa([nf('MERCADO BOM', 'nao_confirmada'), nf('PADARIA', 'entregue')])] },
      { data: '2026-10-20', resumo: res([]), placas: [placa([nf(' mercado bom ', 'revisar')])] },
      { data: '2026-10-17', resumo: res([]), placas: [placa([nf('PADARIA', 'nao_foi')])] },
    ]
    const r = montarResumoDia({ cliente: 'nutrimax', data: '2026-10-22', resultado: { calculadoEm: 'x', resumo: res(hoje), placas: [placa(hoje)] }, meta: 97, anteriores: ant })
    expect(r.qualidade.clientesCronicos).toEqual([{ cliente: 'MERCADO BOM', dias: 3, janela: 4 }])
  })
})

describe('conferir primeiro (topo da fila do F3-03)', () => {
  // 22/10 Nutry (fechamento): as 5 não entregues com parada a até 500 m.
  const inv = (categoria: 'parou_no_cliente' | 'parou_perto' | 'nao_chegou_perto', distM: number, hora: string) => ({ categoria, distM, hora, minutos: 4 })
  const nf = (nf: string, situacao: SituacaoNf, investigacao?: ReturnType<typeof inv>) => ({ carga: 'C', nf, situacao, status: situacao === 'entregue' ? 'ENTREGUE' : 'PARADA DE OUTRO CLIENTE - NÃO CONFIRMA', cliente: `CLIENTE ${nf}`, endereco: '', chegada: null, saida: null, tempoMin: null, lat: null, lng: null, investigacao })
  const placa = (p: string, nfs: ReturnType<typeof nf>[]): PlacaAoVivo => ({ placa: p, motorista: '', destino: '', cargas: ['C'], saidaBase: 'x', chegadaBase: 'y', km: null, total: nfs.length, feitas: 0, pct: 0, nfs })
  const r = montarResumoDia({
    cliente: 'nutrimax', data: '2026-10-22', meta: 97, anteriores: [],
    resultado: { calculadoEm: 'x', resumo: { taxa: 50, entregues: 1, nfsNaConta: 7, aguardando: 0, totalNfs: 7, feitas: 1, pct: 14 }, placas: [
      placa('RQU8D91', [nf('1', 'revisar', inv('parou_perto', 305, '16:58')), nf('2', 'entregue')]),
      placa('RQV5F64', [nf('3', 'revisar', inv('parou_no_cliente', 72, '09:16')), nf('4', 'revisar', inv('parou_no_cliente', 14, '09:16'))]),
      placa('RBJ2H28', [nf('5', 'revisar', inv('parou_no_cliente', 48, '09:21')), nf('6', 'nao_foi', inv('nao_chegou_perto', 9000, '10:00'))]),
      placa('RQV9E37', [nf('7', 'revisar', inv('parou_perto', 312, '09:13'))]),
    ] },
  })
  it('parou no cliente primeiro (mais perto antes), depois parou perto; "não chegou perto" fica fora', () => {
    expect(r.conferirPrimeiro.map(c => `${c.placa} ${c.nf}`)).toEqual(['RQV5F64 4', 'RBJ2H28 5', 'RQV5F64 3', 'RQU8D91 1', 'RQV9E37 7'])
    expect(r.conferirPrimeiro[0].frase).toBe('Parada mais perto: 14 m do cliente às 09:16 (4 min).')
  })
  it('a lista (com nome de cliente e NF) não vai no texto copiado', () => {
    expect(textoResumoDia(r, 'Nutry Max')).not.toContain('CLIENTE 4')
  })
})
