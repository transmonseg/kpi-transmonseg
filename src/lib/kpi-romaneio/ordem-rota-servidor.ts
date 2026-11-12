// 12/11: ordem planejada da roteirização guardada por dia (kpi_rota_ordem).
import { createServiceClient } from '@/lib/supabase/service'
import type { OrdemRotaLinha } from '@/lib/kpi-rioquality/parse-ordem-rota'
import { aplicarOrdemRota, type OrdemPlanejada } from './ordem-rota'
import { buscarOrdemRotaFusion } from '@/lib/kpi-rioquality/ordem-rota-fusion'

const LOTE = 500

/** Dia de cada linha: o do romaneio (viagem) -- a previsão mais comum entre as
 *  entregas dela; viagem sem previsão legível fica no dia do envio. Assim uma
 *  viagem que atravessa a meia-noite não se parte em dois dias. */
export function diasDasLinhas(linhas: OrdemRotaLinha[], diaDoEnvio: string, hoje: string): Map<OrdemRotaLinha, string> {
  const porRomaneio = new Map<string, Map<string, number>>()
  for (const l of linhas) {
    if (!l.data || l.data > hoje) continue
    const c = porRomaneio.get(l.romaneio) ?? new Map<string, number>()
    c.set(l.data, (c.get(l.data) ?? 0) + 1)
    porRomaneio.set(l.romaneio, c)
  }
  const diaDoRomaneio = new Map([...porRomaneio].map(([r, c]) => [r, [...c].sort((a, b) => b[1] - a[1])[0][0]]))
  return new Map(linhas.map(l => [l, diaDoRomaneio.get(l.romaneio) ?? diaDoEnvio]))
}

/** Grava a ordem do relatório: cada dia que aparece nele é substituído inteiro
 *  (reenvio corrige). Devolve os dias gravados. */
export async function guardarOrdemRota(cliente: string, diaDoEnvio: string, linhas: OrdemRotaLinha[], enviadoPor: string | null, hoje = diaDoEnvio, opcoes: { diaFixo?: boolean } = {}): Promise<string[]> {
  const svc = createServiceClient()
  // Busca da Fusion por dia (diaFixo): o relatório já veio filtrado por aquele
  // dia -- tudo fica nele (senão a busca de ontem apagaria a ordem de hoje).
  const dia = opcoes.diaFixo ? new Map(linhas.map(l => [l, diaDoEnvio])) : diasDasLinhas(linhas, diaDoEnvio, hoje)
  const dias = [...new Set(dia.values())].sort()
  for (const d of dias) {
    const { error: erroApagar } = await svc.from('kpi_rota_ordem').delete().eq('cliente', cliente).eq('data', d)
    if (erroApagar) throw new Error(erroApagar.message)
  }
  // NF repetida no mesmo dia: fica a primeira.
  const vistas = new Set<string>()
  const rows = linhas.filter(l => { const k = `${dia.get(l)}|${l.nf}`; return vistas.has(k) ? false : (vistas.add(k), true) }).map(l => ({
    cliente, data: dia.get(l)!, nf: l.nf, romaneio: l.romaneio, placa: l.placa, ordem: l.ordem,
    previsao_inicio: l.previsaoInicio, previsao_fim: l.previsaoFim, enviado_por: enviadoPor,
  }))
  for (let i = 0; i < rows.length; i += LOTE) {
    const { error } = await svc.from('kpi_rota_ordem').insert(rows.slice(i, i + LOTE))
    if (error) throw new Error(error.message)
  }
  return dias
}

export type EnvioOrdem = { data: string; nfs: number; placas: number; enviadoPor: string | null; enviadoEm: string }

/** O que já foi enviado de ordem em cada dia do intervalo. */
export async function enviosDeOrdem(cliente: string, de: string, ate: string): Promise<EnvioOrdem[]> {
  const { data, error } = await createServiceClient().rpc('kpi_rota_ordem_envios', { p_cliente: cliente, p_de: de, p_ate: ate })
  if (error) throw new Error(error.message)
  return ((data ?? []) as { data: string; nfs: number; placas: number; enviado_por: string | null; enviado_em: string }[])
    .map(r => ({ data: r.data, nfs: Number(r.nfs), placas: Number(r.placas), enviadoPor: r.enviado_por, enviadoEm: r.enviado_em }))
}

export async function lerOrdemRota(cliente: string, data: string): Promise<{ linhas: OrdemPlanejada[]; enviadoEm: string | null }> {
  const svc = createServiceClient()
  const linhas: OrdemPlanejada[] = []
  let enviadoEm: string | null = null
  for (let de = 0; ; de += 1000) {
    const { data: rs, error } = await svc.from('kpi_rota_ordem').select('nf, romaneio, ordem, previsao_inicio, enviado_em')
      .eq('cliente', cliente).eq('data', data).order('nf').range(de, de + 999)
    if (error) throw new Error(error.message)
    for (const r of rs ?? []) {
      linhas.push({ nf: r.nf, romaneio: r.romaneio, ordem: r.ordem, previsaoInicio: r.previsao_inicio })
      if (!enviadoEm || r.enviado_em > enviadoEm) enviadoEm = r.enviado_em
    }
    if (!rs || rs.length < 1000) break
  }
  return { linhas, enviadoEm }
}

/** Resultado com a ordem da rota aplicada. Falha de leitura não derruba a tela. */
export async function comOrdemRota<R extends Parameters<typeof aplicarOrdemRota>[0]>(cliente: string, data: string, r: R | null): Promise<R | null> {
  if (!r || cliente !== 'rioquality') return r
  try {
    const { linhas, enviadoEm } = await lerOrdemRota(cliente, data)
    return aplicarOrdemRota(r, linhas, enviadoEm)
  } catch (e) {
    console.error(`[ordem-rota] ${cliente} ${data}: leitura falhou, tela sem a ordem:`, e)
    return r
  }
}

export const ENVIADO_FUSION = 'Fusion (automático)'
export const INTERVALO_FUSION_MS = 30 * 60_000

/** 12/11: puxa a ordem do dia da Fusion e grava. No máximo a cada 30 min
 *  (o relatório tem ~1 MB e ~20 s), a não ser com `forcar` (fechamento do dia
 *  e o botão da tela). Nunca lança: devolve o que aconteceu. */
export async function sincronizarOrdemRotaFusion(data: string, opcoes: { forcar?: boolean; agoraMs?: number; hoje?: string } = {}): Promise<{ situacao: 'ok' | 'recente' | 'sem_dados' | 'erro'; nfs?: number; erro?: string }> {
  const cliente = 'rioquality'
  try {
    if (!opcoes.forcar) {
      const ultimo = (await enviosDeOrdem(cliente, data, data))[0]
      if (ultimo && (opcoes.agoraMs ?? Date.now()) - Date.parse(ultimo.enviadoEm) < INTERVALO_FUSION_MS) return { situacao: 'recente' }
    }
    const linhas = await buscarOrdemRotaFusion(data)
    if (linhas.length === 0) return { situacao: 'sem_dados' }
    await guardarOrdemRota(cliente, data, linhas, ENVIADO_FUSION, opcoes.hoje ?? data, { diaFixo: true })
    return { situacao: 'ok', nfs: linhas.length }
  } catch (e) {
    return { situacao: 'erro', erro: e instanceof Error ? e.message : String(e) }
  }
}
