// 12/11: ordem planejada da roteirização guardada por dia (kpi_rota_ordem).
import { createServiceClient } from '@/lib/supabase/service'
import type { OrdemRotaLinha } from '@/lib/kpi-rioquality/parse-ordem-rota'
import { aplicarOrdemRota, type OrdemPlanejada } from './ordem-rota'

const LOTE = 500

/** Substitui a ordem do dia pela do relatório enviado. */
export async function guardarOrdemRota(cliente: string, data: string, linhas: OrdemRotaLinha[], enviadoPor: string | null): Promise<void> {
  const svc = createServiceClient()
  const { error: erroApagar } = await svc.from('kpi_rota_ordem').delete().eq('cliente', cliente).eq('data', data)
  if (erroApagar) throw new Error(erroApagar.message)
  // NF repetida no relatório: fica a primeira (menor ordem vem antes).
  const vistas = new Set<string>()
  const rows = linhas.filter(l => (vistas.has(l.nf) ? false : (vistas.add(l.nf), true))).map(l => ({
    cliente, data, nf: l.nf, romaneio: l.romaneio, placa: l.placa, ordem: l.ordem,
    previsao_inicio: l.previsaoInicio, previsao_fim: l.previsaoFim, enviado_por: enviadoPor,
  }))
  for (let i = 0; i < rows.length; i += LOTE) {
    const { error } = await svc.from('kpi_rota_ordem').insert(rows.slice(i, i + LOTE))
    if (error) throw new Error(error.message)
  }
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
