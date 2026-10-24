// F3-04 (ACH-10, D-26): versao oficial do KPI do dia.
//
// 20/10 tinha 4 geracoes (100 -> 98,7 -> 96,5 -> 95,5) e 21/10 cinco, sem
// nenhuma marcada como a que vale; a geracao de 17/10 feita com o romaneio de
// 16/10 (59,3%) continuava no historico. Regra:
// - oficial = o fechamento das 00:30 (F3-01); sem fechamento (dias antes do
//   Ao vivo), o que esta' publicado no Dashboard;
// - a geracao com os mesmos numeros do oficial fica em cima, marcada; as
//   outras sao rascunho, recolhidas, com a diferenca de taxa;
// - geracao escondida (resumo.oculta) sai do historico sem ser apagada;
// - gerar de novo um dia ja' fechado exige motivo (gravado em resumo.motivoRegeracao).
import { createServiceClient } from '@/lib/supabase/service'
import { fechamentoUtil, mesmoNumero, listarFechamentosDasDatas, type FechamentoDia, type NumerosKpi } from './fechamento-dashboard'

export type ResumoVersao = NumerosKpi & {
  aguardando?: number
  motivoRegeracao?: string
  oculta?: { motivo: string; por: string; em: string }
}

export type GeracaoVersao = {
  id: string
  data_referencia: string
  gerado_em: string
  gerado_por: string | null
  resumo: ResumoVersao | null
}

export type OficialDia = NumerosKpi & {
  tipo: 'fechamento' | 'publicado'
  /** Geracao com os mesmos numeros do oficial (null = so' o fechamento tem). */
  geracaoId: string | null
  calculadoEm: string | null
}

export type GrupoVersoes<G extends GeracaoVersao> = {
  data: string
  oficial: OficialDia | null
  /** Linha de cima: a geracao oficial, ou a mais recente quando nao ha' oficial. */
  principal: G | null
  rascunhos: { g: G; diferenca: number | null }[]
  /** Versoes escondidas (D-26), contadas mas nao listadas. */
  escondidas: number
}

const completa = (r: ResumoVersao | null) => !!r && (r.aguardando ?? 0) === 0
const numeros = (r: ResumoVersao | null): NumerosKpi => ({ taxa: r?.taxa ?? null, entregues: r?.entregues ?? null, nfsNaConta: r?.nfsNaConta ?? null })
const diferenca = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? null : Math.round((a - b) * 10) / 10)

export function organizarVersoes<G extends GeracaoVersao>(
  geracoes: G[],
  fechamentos: Map<string, FechamentoDia>,
  publicados: Map<string, NumerosKpi>,
): GrupoVersoes<G>[] {
  const porData = new Map<string, G[]>()
  for (const g of geracoes) porData.set(g.data_referencia, [...(porData.get(g.data_referencia) ?? []), g])
  const grupos: GrupoVersoes<G>[] = []
  for (const [data, todas] of porData) {
    const visiveis = todas.filter(g => !g.resumo?.oculta).sort((a, b) => b.gerado_em.localeCompare(a.gerado_em))
    const f = fechamentos.get(data)
    const pub = publicados.get(data)
    let ref: (NumerosKpi & { tipo: OficialDia['tipo']; calculadoEm: string | null }) | null = null
    if (f && fechamentoUtil(f)) ref = { ...numeros(f.resumo), tipo: 'fechamento', calculadoEm: f.calculadoEm }
    else if (pub) ref = { ...pub, tipo: 'publicado', calculadoEm: null }
    const igual = ref ? visiveis.find(g => completa(g.resumo) && mesmoNumero(numeros(g.resumo), ref!)) ?? null : null
    // Publicado sem geracao igual (planilha conferida a mao) ainda e' o oficial.
    const oficial: OficialDia | null = ref ? { tipo: ref.tipo, taxa: ref.taxa, entregues: ref.entregues, nfsNaConta: ref.nfsNaConta, calculadoEm: ref.calculadoEm, geracaoId: igual?.id ?? null } : null
    const principal = oficial ? igual : visiveis[0] ?? null
    const base = oficial?.taxa ?? principal?.resumo?.taxa ?? null
    grupos.push({
      data, oficial, principal,
      rascunhos: visiveis.filter(g => g !== principal).map(g => ({ g, diferenca: diferenca(g.resumo?.taxa, base) })),
      escondidas: todas.length - visiveis.length,
    })
  }
  return grupos.sort((a, b) => b.data.localeCompare(a.data))
}

/** Dia fechado: ja' passou e tem fechamento, ou uma geracao completa visivel. */
export function exigeMotivoRegeracao(p: { data: string; hoje: string; fechamento: FechamentoDia | null; geracoes: Pick<GeracaoVersao, 'resumo'>[] }): boolean {
  if (p.data >= p.hoje) return false
  if (p.fechamento && fechamentoUtil(p.fechamento)) return true
  return p.geracoes.some(g => !g.resumo?.oculta && completa(g.resumo) && g.resumo?.taxa != null)
}

export const MOTIVO_MINIMO = 5
export function motivoValido(m: unknown): string | null {
  const t = typeof m === 'string' ? m.trim().replace(/\s+/g, ' ').slice(0, 500) : ''
  return t.length >= MOTIVO_MINIMO ? t : null
}

// ---------- I/O real ----------

/** Dados do dia para a trava do motivo (rota Gerar KPI). Falha de leitura =
 *  nao trava (a geracao continua; o historico ainda mostra o oficial). */
export async function diaJaFechado(cliente: 'nutrimax' | 'rioquality', data: string, hoje: string): Promise<{ fechado: boolean; fechamento: FechamentoDia | null }> {
  if (data >= hoje) return { fechado: false, fechamento: null }
  try {
    const svc = createServiceClient()
    const [fs, g] = await Promise.all([
      listarFechamentosDasDatas(cliente, [data]),
      svc.from('kpi_romaneio_geracoes').select('resumo').eq('cliente', cliente).eq('data_referencia', data),
    ])
    const fechamento = fs[0] ?? null
    const geracoes = ((g.data ?? []) as { resumo: ResumoVersao | null }[])
    return { fechado: exigeMotivoRegeracao({ data, hoje, fechamento, geracoes }), fechamento }
  } catch {
    return { fechado: false, fechamento: null }
  }
}

/** Historico de um cliente agrupado por dia, com a versao oficial. */
export async function historicoComVersaoOficial<G extends GeracaoVersao>(cliente: 'nutrimax' | 'rioquality', geracoes: G[]): Promise<GrupoVersoes<G>[]> {
  const datas = [...new Set(geracoes.map(g => g.data_referencia))]
  const fechamentos = new Map<string, FechamentoDia>()
  const publicados = new Map<string, NumerosKpi>()
  if (datas.length > 0) {
    // Leitura que falha so' tira o selo de oficial (o historico continua).
    const fs = await listarFechamentosDasDatas(cliente, datas).catch(() => [] as FechamentoDia[])
    for (const f of fs) fechamentos.set(f.data, f)
    const { data: pubs } = await createServiceClient().from('kpi_dashboard_kpis')
      .select('data, taxa:resumo->taxa, entregues:resumo->entregues, nfsNaConta:resumo->nfsNaConta, aguardando:resumo->aguardando')
      .eq('cliente', cliente).in('data', datas)
    for (const p of (pubs ?? []) as unknown as (NumerosKpi & { data: string; aguardando: number | null })[]) {
      if (!p.aguardando) publicados.set(p.data, { taxa: p.taxa, entregues: p.entregues, nfsNaConta: p.nfsNaConta })
    }
  }
  return organizarVersoes(geracoes, fechamentos, publicados)
}
