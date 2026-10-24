// F3-01 (ACH-01, D-26): fechamento oficial no Dashboard.
//
// O Dashboard so' analisava a planilha que alguem inseria. 16/10 ficou em
// 99,2% (planilha das 11:50, 1.207 NFs aguardando) e 17/10 em 98,7%, enquanto
// o fechamento das 00:30 do Ao vivo deu 94,5% e 95,1%; a RQ so' tinha 02/10.
//
// Regra:
// - o fechamento (calculo do dia a partir das 00:30 BRT do dia seguinte)
//   grava no Dashboard quando o dia esta' ausente, parcial ou foi gravado por
//   um fechamento anterior;
// - dia completo inserido a mao e diferente: nao sobrescreve -- a tela mostra
//   "Fechamento disponível: X% — trocar" e a troca e' um clique humano;
// - planilha parcial inserida a mao continua aceita, com aviso e a oferta;
// - se existir login de cliente (gerente/visualizador) lendo o Dashboard da
//   empresa, nada grava sozinho: volta a exigir o clique.
// Nada e' enviado a ninguem: e' so' o Dashboard interno.
import { createServiceClient } from '@/lib/supabase/service'
import { BUCKET_KPI_ROMANEIO, TIPO_XLSX } from './xlsx-gerado'
import { extrairKpiCompleto, type NfResumo, type ResumoGeracao } from './resumo-dashboard'
import type { ClienteDash, DiaKpi, ResultadoInsercao } from './dashboard-kpis'
import type { ClienteAoVivo } from './ao-vivo-servico'

export const INSERIDO_POR_FECHAMENTO = 'Fechamento automático (00:30)'
const NOME_ARQUIVO: Record<ClienteAoVivo, string> = { nutrimax: 'Nutry-Max', rioquality: 'Rio-Quality' }
const CLIENTES_FECHAMENTO = ['nutrimax', 'rioquality'] as const
export const clienteComFechamento = (c: string): c is ClienteAoVivo => (CLIENTES_FECHAMENTO as readonly string[]).includes(c)

export type NumerosKpi = { taxa: number | null; entregues: number | null; nfsNaConta: number | null }
export type FechamentoDia = {
  data: string
  calculadoEm: string | null
  resumo: NumerosKpi & { aguardando?: number }
  degradado?: string | null
}

/** 00:30 BRT do dia seguinte a `data` (mesmo instante do precisaFecharDia). */
export function instanteFechamento(data: string): number {
  const [a, m, d] = data.split('-').map(Number)
  return Date.parse(`${new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10)}T00:30:00-03:00`)
}

/** O calculo gravado e' o fechamento do dia (feito com o dia encerrado). */
export function ehFechamento(calculadoEm: string | null | undefined, data: string): boolean {
  return !!calculadoEm && Date.parse(calculadoEm) >= instanteFechamento(data)
}

const umaCasa = (t: number | null) => (t == null ? null : Math.round(t * 10) / 10)
export function mesmoNumero(a: NumerosKpi, b: NumerosKpi): boolean {
  return umaCasa(a.taxa) === umaCasa(b.taxa) && (a.entregues ?? null) === (b.entregues ?? null) && (a.nfsNaConta ?? null) === (b.nfsNaConta ?? null)
}

export const fmtTaxa = (t: number | null) => (t == null ? '—' : `${t.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`)
const parcial = (r: { aguardando?: number }) => (r.aguardando ?? 0) > 0

export type DecisaoFechamento = {
  acao: 'gravar' | 'oferta' | 'igual'
  motivo: 'ausente' | 'parcial' | 'fechamento_anterior' | 'manual_diferente' | 'leitor_externo' | 'igual'
}

export function decidirFechamentoDashboard(existente: Pick<DiaKpi, 'resumo'> | null, fechamento: NumerosKpi & { aguardando?: number }, opts: { leitorExterno: boolean }): DecisaoFechamento {
  if (existente && !parcial(existente.resumo) && mesmoNumero(existente.resumo, fechamento)) return { acao: 'igual', motivo: 'igual' }
  if (opts.leitorExterno) return { acao: 'oferta', motivo: 'leitor_externo' }
  if (!existente) return { acao: 'gravar', motivo: 'ausente' }
  if (parcial(existente.resumo)) return { acao: 'gravar', motivo: 'parcial' }
  if (existente.resumo.origem === 'fechamento') return { acao: 'gravar', motivo: 'fechamento_anterior' }
  return { acao: 'oferta', motivo: 'manual_diferente' }
}

/** Fechamento que pode ir ao Dashboard: feito com o dia encerrado, completo
 *  (nenhuma NF aguardando), nao degradado e com taxa. */
export function fechamentoUtil(f: FechamentoDia): boolean {
  return ehFechamento(f.calculadoEm, f.data) && !f.degradado && !parcial(f.resumo) && f.resumo.taxa != null
}

export type OfertaFechamento = NumerosKpi & {
  data: string
  calculadoEm: string
  /** O que o Dashboard tem hoje no dia (null = dia ausente). */
  atual: { taxa: number | null; parcial: boolean; inseridoPor: string | null } | null
}

/** Dias em que o fechamento difere do Dashboard (ausente, parcial ou outro numero). */
export function ofertasFechamento(dias: DiaKpi[], fechamentos: FechamentoDia[]): OfertaFechamento[] {
  const porData = new Map(dias.map(d => [d.data, d]))
  const ofertas: OfertaFechamento[] = []
  for (const f of fechamentos) {
    if (!fechamentoUtil(f)) continue
    const atual = porData.get(f.data) ?? null
    if (atual && !parcial(atual.resumo) && mesmoNumero(atual.resumo, f.resumo)) continue
    ofertas.push({
      data: f.data, calculadoEm: f.calculadoEm!, taxa: f.resumo.taxa, entregues: f.resumo.entregues, nfsNaConta: f.resumo.nfsNaConta,
      atual: atual ? { taxa: atual.resumo.taxa, parcial: parcial(atual.resumo), inseridoPor: atual.inseridoPor } : null,
    })
  }
  return ofertas.sort((a, b) => a.data.localeCompare(b.data))
}

/** Planilha parcial inserida a mao: aceita, com aviso e a oferta do fechamento. */
export function avisoPlanilhaParcial(resumo: ResumoGeracao, fechamento: FechamentoDia | null): { aguardando: number; ofertaFechamento: NumerosKpi | null } | null {
  if (!parcial(resumo)) return null
  const f = fechamento && fechamentoUtil(fechamento) ? fechamento : null
  return {
    aguardando: resumo.aguardando ?? 0,
    ofertaFechamento: f ? { taxa: f.resumo.taxa, entregues: f.resumo.entregues, nfsNaConta: f.resumo.nfsNaConta } : null,
  }
}

type LinhaDashboard = {
  cliente: ClienteAoVivo
  data: string
  resumo: ResumoGeracao
  nfs: NfResumo[]
  xlsx: Buffer
  inseridoPor: string
}

export type DepsPublicar = {
  lerDia: (cliente: ClienteAoVivo, data: string) => Promise<DiaKpi | null>
  temLeitorExterno: (cliente: ClienteAoVivo) => Promise<boolean>
  gravar: (linha: LinhaDashboard) => Promise<void>
}

/** Chamado pelo calculo do Ao vivo de um dia encerrado. null = nao era
 *  fechamento utilizavel (dia aberto, NF aguardando, sem taxa). */
export async function publicarFechamentoNoDashboard(p: {
  cliente: ClienteAoVivo
  data: string
  xlsx: Buffer
  lido: { resumo: ResumoGeracao; nfs: NfResumo[] }
  calculadoEm: string
  log: (m: string) => void
}, deps: DepsPublicar = depsReaisPublicar): Promise<DecisaoFechamento | null> {
  const f: FechamentoDia = { data: p.data, calculadoEm: p.calculadoEm, resumo: p.lido.resumo }
  if (!fechamentoUtil(f)) {
    if (ehFechamento(p.calculadoEm, p.data)) p.log(`dashboard ${p.cliente} ${p.data}: fechamento não vai ao Dashboard (${parcial(p.lido.resumo) ? `${p.lido.resumo.aguardando} NFs aguardando` : 'sem taxa'})`)
    return null
  }
  const existente = await deps.lerDia(p.cliente, p.data)
  // Sem saber quem le o Dashboard, nao publica sozinho (regra 6 do dono).
  const leitorExterno = await deps.temLeitorExterno(p.cliente).catch(() => true)
  const decisao = decidirFechamentoDashboard(existente, p.lido.resumo, { leitorExterno })
  if (decisao.acao === 'gravar') {
    await deps.gravar({
      cliente: p.cliente, data: p.data, nfs: p.lido.nfs, xlsx: p.xlsx, inseridoPor: INSERIDO_POR_FECHAMENTO,
      resumo: { ...p.lido.resumo, origem: 'fechamento', fechamentoEm: p.calculadoEm },
    })
    p.log(`dashboard ${p.cliente} ${p.data}: fechamento ${fmtTaxa(p.lido.resumo.taxa)} gravado (${decisao.motivo}${existente ? `, antes ${fmtTaxa(existente.resumo.taxa)}` : ''})`)
  } else if (decisao.acao === 'oferta') {
    p.log(`dashboard ${p.cliente} ${p.data}: Fechamento disponível: ${fmtTaxa(p.lido.resumo.taxa)} — trocar (${decisao.motivo}; Dashboard ${existente ? fmtTaxa(existente.resumo.taxa) : 'sem o dia'})`)
  }
  return decisao
}

export type DepsTrocar = {
  lerFechamento: (cliente: ClienteAoVivo, data: string) => Promise<FechamentoDia | null>
  baixarXlsx: (cliente: ClienteAoVivo, data: string) => Promise<Buffer | null>
  ler: (xlsx: Buffer) => Promise<{ data: string | null; resumo: ResumoGeracao; nfs: NfResumo[] }>
  gravar: (linha: LinhaDashboard) => Promise<void>
}

/** Botao "Trocar pelo fechamento" (decisao humana). */
export async function trocarPeloFechamento(cliente: ClienteAoVivo, data: string, inseridoPor: string | null, deps: DepsTrocar = depsReaisTrocar): Promise<ResultadoInsercao> {
  const f = await deps.lerFechamento(cliente, data)
  if (!f || !fechamentoUtil(f)) return { ok: false, erro: 'Ainda não há fechamento deste dia (ele sai às 00:30 do dia seguinte).' }
  const xlsx = await deps.baixarXlsx(cliente, data)
  if (!xlsx) return { ok: false, erro: 'A planilha do fechamento não foi encontrada. Gere o KPI do dia e insira a planilha.' }
  const lido = await deps.ler(xlsx)
  if (!mesmoNumero(lido.resumo, f.resumo) || parcial(lido.resumo)) {
    return { ok: false, erro: `A planilha guardada (${fmtTaxa(lido.resumo.taxa)}) não bate com o fechamento (${fmtTaxa(f.resumo.taxa)}). Nada foi trocado.` }
  }
  await deps.gravar({
    cliente, data, nfs: lido.nfs, xlsx, inseridoPor: inseridoPor ?? INSERIDO_POR_FECHAMENTO,
    resumo: { ...lido.resumo, origem: 'fechamento', fechamentoEm: f.calculadoEm! },
  })
  return { ok: true, data, taxa: lido.resumo.taxa, nfs: lido.nfs.length, cargas: lido.resumo.cargas.length, substituiu: true }
}

// ---------- I/O real ----------

const BUCKET_AO_VIVO = 'kpi-romaneio-inputs'
// Mesmos caminhos de ao-vivo-servico.ts (caminhoXlsxFechado/caminhoXlsxAoVivo);
// repetidos aqui pra nao criar import circular com o calculo.
const caminhoFechado = (c: ClienteAoVivo, d: string) => `fechados/${c}/${d}.xlsx`
const caminhoAoVivo = (c: ClienteAoVivo, d: string) => `ao-vivo/${c}/${d}.xlsx`

type LinhaCalculo = { data: string; calculado_em: string | null; resumo: FechamentoDia['resumo'] | null; degradado: string | null }
const paraFechamento = (r: LinhaCalculo): FechamentoDia => ({
  data: r.data, calculadoEm: r.calculado_em, degradado: r.degradado,
  resumo: r.resumo ?? { taxa: null, entregues: null, nfsNaConta: null },
})

export async function lerFechamentoDoDia(cliente: ClienteAoVivo, data: string): Promise<FechamentoDia | null> {
  const { data: row, error } = await createServiceClient().from('kpi_ao_vivo_calculo')
    .select('data, calculado_em, resumo:resultado->resumo, degradado:resultado->>degradado')
    .eq('cliente', cliente).eq('data', data).maybeSingle()
  if (error) throw new Error(`fechamento ${cliente} ${data}: ${error.message}`)
  return row ? paraFechamento(row as unknown as LinhaCalculo) : null
}

export async function listarFechamentos(cliente: ClienteAoVivo, de: string, ate: string): Promise<FechamentoDia[]> {
  const { data, error } = await createServiceClient().from('kpi_ao_vivo_calculo')
    .select('data, calculado_em, resumo:resultado->resumo, degradado:resultado->>degradado')
    .eq('cliente', cliente).gte('data', de).lte('data', ate).order('data', { ascending: true })
  if (error) throw new Error(`fechamentos ${cliente}: ${error.message}`)
  return ((data ?? []) as unknown as LinhaCalculo[]).map(paraFechamento)
}

async function lerDiaDashboard(cliente: ClienteDash, data: string): Promise<DiaKpi | null> {
  const { data: r, error } = await createServiceClient().from('kpi_dashboard_kpis')
    .select('data, resumo, arquivo_nome, inserido_por, inserido_em').eq('cliente', cliente).eq('data', data).maybeSingle()
  if (error) throw new Error(`dashboard ${cliente} ${data}: ${error.message}`)
  return r ? { data: r.data, resumo: r.resumo as ResumoGeracao, arquivoNome: r.arquivo_nome, inseridoPor: r.inserido_por, inseridoEm: r.inserido_em } : null
}

/** Ha' login de cliente (gerente/visualizador) com a empresa liberada? Hoje
 *  so' a Erica (operador) e os admins veem o Dashboard da Nutry e da RQ. */
async function temLeitorExterno(cliente: ClienteAoVivo): Promise<boolean> {
  const { count, error } = await createServiceClient().from('perfis')
    .select('user_id', { count: 'exact', head: true })
    .in('papel', ['gerente', 'visualizador']).contains('empresas', [cliente])
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}

async function gravarDashboard(l: LinhaDashboard): Promise<void> {
  const svc = createServiceClient()
  const nome = `KPI-${NOME_ARQUIVO[l.cliente]}-${l.data}-fechamento.xlsx`
  const caminho = `dashboard/${l.cliente}/${l.data}-fechamento.xlsx`
  const up = await svc.storage.from(BUCKET_KPI_ROMANEIO).upload(caminho, l.xlsx, { contentType: TIPO_XLSX, upsert: true })
  const { error } = await svc.from('kpi_dashboard_kpis').upsert({
    cliente: l.cliente, data: l.data, resumo: l.resumo, nfs: l.nfs,
    arquivo_storage_path: up.error ? null : caminho, arquivo_nome: nome,
    inserido_por: l.inseridoPor, inserido_em: new Date().toISOString(),
  }, { onConflict: 'cliente,data' })
  if (error) throw new Error(`gravar fechamento no Dashboard: ${error.message}`)
}

async function baixarXlsxFechamento(cliente: ClienteAoVivo, data: string): Promise<Buffer | null> {
  const svc = createServiceClient()
  // F2-12 guarda em fechados/; dias de antes do F2-12 so' tem a do Ao vivo
  // (ultimo calculo = o fechamento; a limpeza esta' suspensa desde o F0-11).
  for (const caminho of [caminhoFechado(cliente, data), caminhoAoVivo(cliente, data)]) {
    const { data: arq, error } = await svc.storage.from(BUCKET_AO_VIVO).download(caminho)
    if (!error && arq) return Buffer.from(await arq.arrayBuffer())
  }
  return null
}

const depsReaisPublicar: DepsPublicar = { lerDia: lerDiaDashboard, temLeitorExterno, gravar: gravarDashboard }
export const depsReaisTrocar: DepsTrocar = { lerFechamento: lerFechamentoDoDia, baixarXlsx: baixarXlsxFechamento, ler: b => extrairKpiCompleto(b), gravar: gravarDashboard }

/** Dias com a planilha do fechamento guardada (fechados/ ou ao-vivo/). null =
 *  nao deu pra listar (a tela mostra a oferta e a troca explica se faltar). */
async function diasComPlanilha(cliente: ClienteAoVivo): Promise<Set<string> | null> {
  const svc = createServiceClient()
  const dias = new Set<string>()
  for (const pasta of [`fechados/${cliente}`, `ao-vivo/${cliente}`]) {
    const { data, error } = await svc.storage.from(BUCKET_AO_VIVO).list(pasta, { limit: 1000 })
    if (error) return null
    for (const a of data ?? []) if (/^\d{4}-\d{2}-\d{2}\.xlsx$/.test(a.name)) dias.add(a.name.slice(0, 10))
  }
  return dias
}

/** Ofertas do periodo para a tela (so' clientes com Ao vivo). Dia cuja
 *  planilha ja' nao existe (RQ 13-15/10, apagada antes do F0-11) nao vira
 *  oferta: o botao nao teria o que gravar. */
export async function ofertasDoPeriodo(cliente: ClienteDash, dias: DiaKpi[], de: string, ate: string): Promise<OfertaFechamento[]> {
  if (!clienteComFechamento(cliente)) return []
  const ofertas = ofertasFechamento(dias, await listarFechamentos(cliente, de, ate))
  if (ofertas.length === 0) return ofertas
  const comPlanilha = await diasComPlanilha(cliente).catch(() => null)
  return comPlanilha ? ofertas.filter(o => comPlanilha.has(o.data)) : ofertas
}
