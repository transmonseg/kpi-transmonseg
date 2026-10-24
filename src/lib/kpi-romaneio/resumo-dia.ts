// F3-02 (ACH-03, AC-06): "Resumo do dia" montado
// POR REGRA, sem LLM, a partir do resultado do KPI já gravado (o mesmo do Ao
// vivo e da planilha). Nada daqui é enviado a ninguém: a página só oferece
// "Copiar texto" e "Baixar PDF". Sem imports de servidor (a tela do Ao vivo usa
// linhaMeta e os chips).
import { nfsForaDaConta, type PlacaAoVivo } from './ao-vivo'
import type { ResultadoAoVivo } from './ao-vivo-servico'
import type { CategoriaInvestigacao } from './investigacao'
import { CATEGORIAS_INVESTIGACAO, ROTULO_INVESTIGACAO, fraseInvestigacao } from './investigacao-rotulos'
import { faltamParaMeta } from '@/lib/kpi/metas'

type ResumoKpi = ResultadoAoVivo['resumo']

const fmtInt = (n: number) => n.toLocaleString('pt-BR')
const fmtPct = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: n % 1 === 0 && n === 100 ? 0 : 1, maximumFractionDigits: 1 })
const umaCasa = (n: number) => Math.round(n * 10) / 10
const semPlaca = (p: PlacaAoVivo) => !p.placa || p.placa === 'SEM PLACA'
const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`

// ---------------------------------------------------------------- Ao vivo

export type LinhaMeta = { taxa: number | null; meta: number; faltam: number; foraDaConta: number; aguardando: number; texto: string }

/** Linha de topo do Ao vivo: "96,9% no KPI · meta 97% · faltam 3 · 19 fora da conta".
 *  Dia em andamento: as aguardando entram na conta do "faltam" (vão entrar
 *  na taxa quando a rota acabar) -- RQ 24/10 13:11: ceil(0,93 × 506) − 178 = 293. */
export function linhaMeta(resumo: ResumoKpi, meta: number): LinhaMeta {
  const aguardando = resumo.aguardando ?? 0
  const naConta = (resumo.nfsNaConta ?? 0) + aguardando
  const entregues = resumo.entregues ?? 0
  const foraDaConta = Math.max(0, (resumo.totalNfs ?? 0) - (resumo.nfsNaConta ?? 0) - aguardando)
  const faltam = faltamParaMeta(meta, naConta, entregues)
  const partes: string[] = []
  partes.push(resumo.taxa != null ? `${fmtPct(resumo.taxa)}% no KPI${aguardando > 0 ? ' até agora' : ''}` : 'sem taxa ainda')
  partes.push(faltam === 0 && aguardando === 0 ? `meta ${meta}% batida` : `meta ${meta}%`)
  if (!(faltam === 0 && aguardando === 0)) partes.push(`faltam ${fmtInt(faltam)}${aguardando > 0 ? ` (${fmtInt(aguardando)} aguardando)` : ''}`)
  partes.push(`${fmtInt(foraDaConta)} fora da conta`)
  return { taxa: resumo.taxa, meta, faltam, foraDaConta, aguardando, texto: partes.join(' · ') }
}

type ContaPlaca = { naConta: number; corretas: number; pendentes: number; resolvidas: number; medivel: boolean }

/** Conta da placa como a taxa faz: fora da conta não entra; sem rastreador
 *  conta como correta; "medível" = tem NF julgada pelo GPS. */
export function contaDaPlaca(p: PlacaAoVivo): ContaPlaca {
  const fora = foraDaConta(p)
  let naConta = 0, corretas = 0, pendentes = 0, gps = 0
  for (const n of p.nfs) {
    if (fora.has(chave(n))) continue
    naConta++
    if (n.situacao === 'entregue' || n.situacao === 'sem_rastreador') corretas++
    if (n.situacao === 'pendente') pendentes++
    if (n.situacao !== 'sem_rastreador') gps++
  }
  return { naConta, corretas, pendentes, resolvidas: naConta - pendentes, medivel: !semPlaca(p) && gps > 0 }
}

const chave = (n: { carga: string; nf: string }) => `${n.carga}::${n.nf}`
/** Fora da taxa pela situação (cálculo novo) ou pelo STATUS (resultado antigo,
 *  gravado antes do F1-10, em que o pão sem placa ficava "revisar"). */
function foraDaConta(p: PlacaAoVivo): Set<string> {
  const s = nfsForaDaConta(p.nfs)
  for (const n of p.nfs) if (n.situacao === 'fora_da_conta') s.add(chave(n))
  return s
}

/** Chip "Abaixo da meta": placa com NF já julgada pelo GPS e taxa (corretas ÷
 *  resolvidas) abaixo da meta. SEM PLACA e placa só sem rastreador ficam fora. */
export function placaAbaixoDaMeta(p: PlacaAoVivo, meta: number): boolean {
  const c = contaDaPlaca(p)
  return c.medivel && c.resolvidas > 0 && (100 * c.corretas) / c.resolvidas < meta
}

/** Qual horário da base falta: saída sem registro depois de alguma entrega;
 *  chegada sem registro só com a rota encerrada (nenhuma NF aguardando).
 *  SEM PLACA e placa só sem rastreador (sem GPS) ficam fora. */
export function faltaHorarioBase(p: PlacaAoVivo): 'saída' | 'chegada' | 'saída e chegada' | null {
  if (!contaDaPlaca(p).medivel) return null
  const encerrada = !p.nfs.some(n => n.situacao === 'pendente')
  const semSaida = !p.saidaBase && (encerrada || p.nfs.some(n => n.situacao === 'entregue'))
  const semChegada = encerrada && !p.chegadaBase
  return semSaida && semChegada ? 'saída e chegada' : semSaida ? 'saída' : semChegada ? 'chegada' : null
}
export const placaSemHorarioBase = (p: PlacaAoVivo) => faltaHorarioBase(p) != null

/** "Piores primeiro": menor taxa da placa (corretas ÷ resolvidas), depois mais
 *  faltas; placa ainda sem NF julgada depois; SEM PLACA e placa só sem
 *  rastreador no fim. */
export function ordenarPioresPrimeiro(placas: PlacaAoVivo[]): PlacaAoVivo[] {
  const info = new Map(placas.map(p => [p, contaDaPlaca(p)]))
  const grupo = (c: ContaPlaca) => (!c.medivel ? 2 : c.resolvidas === 0 ? 1 : 0)
  return [...placas].sort((a, b) => {
    const ca = info.get(a)!, cb = info.get(b)!
    const g = grupo(ca) - grupo(cb)
    if (g !== 0) return g
    if (grupo(ca) === 0) {
      const pa = ca.corretas / ca.resolvidas, pb = cb.corretas / cb.resolvidas
      if (pa !== pb) return pa - pb
      const fa = ca.resolvidas - ca.corretas, fb = cb.resolvidas - cb.corretas
      if (fa !== fb) return fb - fa
    }
    return a.placa.localeCompare(b.placa)
  })
}

// ---------------------------------------------------------------- Resumo

export type DiaAnterior = { data: string; resumo: ResumoKpi; placas: PlacaAoVivo[]; versaoRegras?: string | null }

export type EntradaResumoDia = {
  cliente: string
  data: string
  resultado: ResultadoAoVivo
  meta: number
  /** Até 6 dias de operação anteriores, do mais novo ao mais velho. */
  anteriores: DiaAnterior[]
}

export type ItemForaDaConta = { motivo: string; acao: string; nfs: number; cargas: string[] }
export type CargaResumoDia = { carga: string; placa: string; rota: string; motorista: string; corretas: number; naConta: number; pct: number; faltas: number }
export type ItemConferir = { nf: string; carga: string; placa: string; cliente: string; categoria: CategoriaInvestigacao; titulo: string; frase: string }

export type ResumoDia = {
  cliente: string
  data: string
  calculadoEm: string
  parcial: boolean
  resultado: {
    taxa: number | null; entregues: number; naConta: number; gpsComprovadas: number; totalNfs: number; pctGps: number | null
    meta: number; faltam: number; foraDaConta: number; aguardando: number; semRastreadorContadas: number
  }
  foraDaConta: ItemForaDaConta[]
  pioresCargas: CargaResumoDia[]
  cargas100: { em100: number; total: number }
  conferirPrimeiro: ItemConferir[]
  qualidade: {
    semHorarioBase: { placa: string; falta: 'saída' | 'chegada' | 'saída e chegada' }[]
    clientesCronicos: { cliente: string; dias: number; janela: number }[]
  }
  comparacao: { ontem: { data: string; taxa: number } | null; semana: { media: number; dias: number } | null; outraVersaoRegras: boolean }
}

/** Motivo do fora da conta pelo STATUS, com a ação de quem resolve. */
const MOTIVOS_FORA: { prefixo: string; motivo: string; acao: string }[] = [
  { prefixo: 'CARGA SEM PLACA', motivo: 'Carga sem placa', acao: 'informe a placa da carga em Placas do dia (Ao vivo › Trocar placa)' },
  { prefixo: 'PLACA PROVISÓRIA', motivo: 'Placa provisória', acao: 'informe o carro real (troca de placa no Ao vivo)' },
  { prefixo: 'PLACA FICTÍCIA', motivo: 'Placa fictícia', acao: 'informe o carro real (troca de placa no Ao vivo)' },
  { prefixo: 'VEÍCULO NÃO SAIU DA BASE', motivo: 'Veículo não saiu da base', acao: 'confirme com a operação se a carga saiu e em qual carro' },
  { prefixo: 'CONSULTA AO RASTREADOR', motivo: 'Consulta ao rastreador falhou', acao: 'gere o KPI de novo (Gerar KPI agora)' },
  { prefixo: 'PLACA DA ESCALA NÃO PASSOU', motivo: 'Placa da escala não passou nos clientes', acao: 'confirme qual carro fez a carga (Carro trocado? no Ao vivo)' },
]
function motivoFora(status: string) {
  return MOTIVOS_FORA.find(m => status.startsWith(m.prefixo)) ?? { motivo: 'Outro motivo', acao: 'conferir na planilha do dia' }
}

const CATEGORIAS_CONFERIR: CategoriaInvestigacao[] = ['parou_no_cliente', 'parou_perto', 'sem_sinal_no_trecho', 'ponto_impreciso', 'passou_sem_parar']
const SITUACOES_FALHA = new Set(['nao_confirmada', 'nao_foi', 'revisar'])
const ordemNatural = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true })

export function montarResumoDia(e: EntradaResumoDia): ResumoDia {
  const r = e.resultado
  const placas = r.placas
  const linha = linhaMeta(r.resumo, e.meta)
  const semRastreadorContadas = placas.reduce((s, p) => {
    const fora = foraDaConta(p)
    return s + p.nfs.filter(n => n.situacao === 'sem_rastreador' && !fora.has(chave(n))).length
  }, 0)
  const entregues = r.resumo.entregues ?? 0
  const gpsComprovadas = Math.max(0, entregues - semRastreadorContadas)
  const totalNfs = r.resumo.totalNfs ?? 0

  // Fora da conta, agrupado pelo motivo, com a ação.
  const grupos = new Map<string, ItemForaDaConta>()
  for (const p of placas) {
    const fora = foraDaConta(p)
    for (const n of p.nfs) {
      if (!fora.has(chave(n))) continue
      const m = motivoFora(n.status)
      const g = grupos.get(m.motivo) ?? { motivo: m.motivo, acao: m.acao, nfs: 0, cargas: [] }
      g.nfs++
      if (!g.cargas.includes(n.carga)) g.cargas.push(n.carga)
      grupos.set(m.motivo, g)
    }
  }
  const foraLista = [...grupos.values()].map(g => ({ ...g, cargas: g.cargas.sort(ordemNatural) })).sort((a, b) => b.nfs - a.nfs || a.motivo.localeCompare(b.motivo))

  // Cargas: na conta, corretas e faltas (julgadas e não confirmadas).
  const cargas = new Map<string, CargaResumoDia & { pendentes: number }>()
  for (const p of placas) {
    if (semPlaca(p)) continue
    const fora = foraDaConta(p)
    for (const n of p.nfs) {
      if (fora.has(chave(n))) continue
      const k = `${p.placa}::${n.carga}`
      const c = cargas.get(k) ?? { carga: n.carga, placa: p.placa, rota: p.destino, motorista: p.motorista, corretas: 0, naConta: 0, pct: 0, faltas: 0, pendentes: 0 }
      c.naConta++
      if (n.situacao === 'entregue' || n.situacao === 'sem_rastreador') c.corretas++
      else if (n.situacao === 'pendente') c.pendentes++
      else c.faltas++
      cargas.set(k, c)
    }
  }
  const listaCargas = [...cargas.values()].map(({ pendentes: _p, ...c }) => ({ ...c, pct: c.naConta ? umaCasa((100 * c.corretas) / c.naConta) : 0 }))
  const pioresCargas = listaCargas.filter(c => c.faltas > 0).sort((a, b) => b.faltas - a.faltas || a.pct - b.pct || a.placa.localeCompare(b.placa)).slice(0, 5)
  const cargas100 = { em100: listaCargas.filter(c => c.corretas === c.naConta).length, total: listaCargas.length }

  // Conferir primeiro: o carro esteve no cliente ou perto (só sobe com comprovante, F3-03).
  const conferir: (ItemConferir & { ordem: number; dist: number })[] = []
  for (const p of placas) {
    const fora = foraDaConta(p)
    for (const n of p.nfs) {
      const cat = n.investigacao?.categoria
      if (!cat || fora.has(chave(n)) || !SITUACOES_FALHA.has(n.situacao) || !CATEGORIAS_CONFERIR.includes(cat)) continue
      conferir.push({ nf: n.nf, carga: n.carga, placa: p.placa, cliente: n.cliente, categoria: cat, titulo: ROTULO_INVESTIGACAO[cat].titulo, frase: fraseInvestigacao(n.investigacao!), ordem: CATEGORIAS_INVESTIGACAO.indexOf(cat), dist: n.investigacao!.distM ?? Infinity })
    }
  }
  const conferirPrimeiro = conferir.sort((a, b) => a.ordem - b.ordem || a.dist - b.dist || a.placa.localeCompare(b.placa)).slice(0, 10)
    .map(({ ordem: _o, dist: _d, ...x }) => x)

  // Qualidade do dado: horário da base e clientes que falham sempre.
  const semHorarioBase = placas.map(p => ({ placa: p.placa, falta: faltaHorarioBase(p) }))
    .filter((x): x is { placa: string; falta: 'saída' | 'chegada' | 'saída e chegada' } => x.falta != null)
    .sort((a, b) => a.placa.localeCompare(b.placa))
  const clientesQueFalharam = (ps: PlacaAoVivo[]) => {
    const s = new Set<string>()
    for (const p of ps) {
      const fora = foraDaConta(p)
      for (const n of p.nfs) if (SITUACOES_FALHA.has(n.situacao) && !fora.has(chave(n)) && n.cliente.trim()) s.add(n.cliente.trim().toUpperCase())
    }
    return s
  }
  const falhasHoje = clientesQueFalharam(placas)
  const falhasAntes = e.anteriores.map(a => clientesQueFalharam(a.placas))
  const janelaClientes = 1 + e.anteriores.length
  const clientesCronicos = [...falhasHoje].map(c => ({ cliente: c, dias: 1 + falhasAntes.filter(s => s.has(c)).length, janela: janelaClientes }))
    .filter(c => c.dias >= 3).sort((a, b) => b.dias - a.dias || a.cliente.localeCompare(b.cliente)).slice(0, 8)

  // Comparação: dia de operação anterior e média dos 5 anteriores.
  const comTaxa = e.anteriores.filter(a => a.resumo.taxa != null)
  const ontem = comTaxa[0] ? { data: comTaxa[0].data, taxa: comTaxa[0].resumo.taxa as number } : null
  const cinco = comTaxa.slice(0, 5)
  const semana = cinco.length ? { media: umaCasa(cinco.reduce((s, a) => s + (a.resumo.taxa as number), 0) / cinco.length), dias: cinco.length } : null
  const outraVersaoRegras = !!r.versaoRegras && e.anteriores.slice(0, 5).some(a => !!a.versaoRegras && a.versaoRegras !== r.versaoRegras)

  return {
    cliente: e.cliente,
    data: e.data,
    calculadoEm: r.calculadoEm,
    parcial: linha.aguardando > 0,
    resultado: {
      taxa: r.resumo.taxa, entregues, naConta: r.resumo.nfsNaConta ?? 0, gpsComprovadas, totalNfs,
      pctGps: totalNfs ? umaCasa((100 * gpsComprovadas) / totalNfs) : null,
      meta: e.meta, faltam: linha.faltam, foraDaConta: linha.foraDaConta, aguardando: linha.aguardando, semRastreadorContadas,
    },
    foraDaConta: foraLista,
    pioresCargas,
    cargas100,
    conferirPrimeiro,
    qualidade: { semHorarioBase, clientesCronicos },
    comparacao: { ontem, semana, outraVersaoRegras },
  }
}

const notas = (n: number) => `${fmtInt(n)} ${n === 1 ? 'nota' : 'notas'}`
const contadas = (n: number) => (n === 1 ? 'contada como correta' : 'contadas como corretas')

/** Seções do resumo em texto (a página, o "Copiar texto" e o PDF usam as mesmas). */
export function secoesResumoDia(r: ResumoDia): { titulo: string; linhas: string[] }[] {
  const x = r.resultado
  const s: { titulo: string; linhas: string[] }[] = []
  const res: string[] = []
  if (x.taxa != null) res.push(`${fmtPct(x.taxa)}% no KPI (${fmtInt(x.entregues)} de ${fmtInt(x.naConta)})${r.parcial ? `, até agora — ${notas(x.aguardando)} aguardando o fim da rota` : ''}.`)
  if (x.pctGps != null) res.push(`Comprovadas pelo GPS: ${fmtPct(x.pctGps)}% (${fmtInt(x.gpsComprovadas)} de ${fmtInt(x.totalNfs)}).`)
  res.push(x.faltam === 0 && !r.parcial ? `Meta ${x.meta}%: batida.` : `Meta ${x.meta}%: faltam ${fmtInt(x.faltam)}.`)
  s.push({ titulo: 'Resultado', linhas: res })

  const fora = r.foraDaConta.map(f => `${notas(f.nfs)} — ${f.motivo} (${f.cargas.join(', ')}): ${f.acao}.`)
  if (x.semRastreadorContadas > 0) fora.push(`${notas(x.semRastreadorContadas)} sem rastreador ${contadas(x.semRastreadorContadas)}.`)
  s.push({ titulo: 'Fora da conta', linhas: fora.length ? fora : ['Nenhuma nota fora da conta.'] })

  s.push({ titulo: 'Piores cargas', linhas: r.pioresCargas.length
    ? r.pioresCargas.map(c => `${c.placa} · ${c.rota || `carga ${c.carga}`} · ${c.motorista || 'motorista não informado'}: ${fmtInt(c.corretas)} de ${fmtInt(c.naConta)} (${fmtPct(c.pct)}%), ${c.faltas} sem confirmação.`)
    : ['Nenhuma carga com nota sem confirmação.'] })
  s.push({ titulo: 'Destaques', linhas: [`${fmtInt(r.cargas100.em100)} de ${fmtInt(r.cargas100.total)} cargas em 100%.`] })

  s.push({ titulo: 'Conferir primeiro', linhas: r.conferirPrimeiro.length
    ? [`Cada nota confirmada com comprovante reduz 1 do "faltam".`, ...r.conferirPrimeiro.map(c => `${c.placa} · NF ${c.nf} · ${c.cliente || 'cliente sem nome'}: ${c.titulo}. ${c.frase}`)]
    : ['Nenhuma nota com o carro no cliente ou perto dele.'] })

  const q: string[] = []
  q.push(r.qualidade.semHorarioBase.length
    ? `Sem horário da base: ${r.qualidade.semHorarioBase.map(b => `${b.placa} (${b.falta})`).join(', ')}.`
    : 'Todas as placas com saída e chegada da base.')
  if (r.qualidade.clientesCronicos.length) q.push(`Clientes que falham sempre: ${r.qualidade.clientesCronicos.map(c => `${c.cliente} (${c.dias} de ${c.janela} dias)`).join(', ')}.`)
  s.push({ titulo: 'Qualidade do dado', linhas: q })

  const c: string[] = []
  if (r.comparacao.ontem) c.push(`Dia anterior (${dataBR(r.comparacao.ontem.data).slice(0, 5)}): ${fmtPct(r.comparacao.ontem.taxa)}%.`)
  if (r.comparacao.semana) c.push(`Média dos ${r.comparacao.semana.dias} dias anteriores: ${fmtPct(r.comparacao.semana.media)}%.`)
  if (r.comparacao.outraVersaoRegras) c.push('Atenção: algum desses dias foi calculado com outra versão das regras.')
  s.push({ titulo: 'Comparação', linhas: c.length ? c : ['Sem dias anteriores para comparar.'] })
  return s
}

/** Texto do "Copiar texto": só números, placas, rotas e motoristas. */
export function textoResumoDia(r: ResumoDia, nomeCliente: string): string {
  const cab = `Resumo do dia — ${nomeCliente} — ${dataBR(r.data)}${r.parcial ? ' (parcial)' : ''}`
  return [cab, ...secoesResumoDia(r).filter(s => s.titulo !== 'Conferir primeiro').map(s => `\n${s.titulo}\n${s.linhas.map(l => (l.startsWith('  ') ? l : `- ${l}`)).join('\n')}`)].join('\n')
}
