// Histórico na tela Ao vivo (pedido 05/10): dia passado abre no mesmo
// formato, a partir do que foi guardado -- o último cálculo do ao vivo
// daquele dia ou a última geração do KPI (xlsx guardado desde 01/10), o que
// for mais novo. Nada é recalculado.
import { createServiceClient } from '@/lib/supabase/service'
import { BUCKET_KPI_ROMANEIO } from './xlsx-gerado'
import { extrairKpiCompleto } from './resumo-dashboard'
import { montarResultadoAoVivo, type ResultadoAoVivo, type ClienteAoVivo } from './ao-vivo-servico'

type FonteAoVivo = { calculadoEm: string }
type FonteGeracao = { id: string; geradoEm: string; arquivo: string }

export function escolherFonteDoDia(aoVivo: FonteAoVivo | null, geracao: FonteGeracao | null): 'ao_vivo' | 'geracao' | null {
  if (aoVivo && geracao) return Date.parse(geracao.geradoEm) > Date.parse(aoVivo.calculadoEm) ? 'geracao' : 'ao_vivo'
  return aoVivo ? 'ao_vivo' : geracao ? 'geracao' : null
}

export function diasComHistorico(diasAoVivo: string[], diasGeracao: string[], hoje: string): string[] {
  return [...new Set([...diasAoVivo, ...diasGeracao])].filter(d => d !== hoje).sort().reverse()
}

export type DiaHistorico = { resultado: ResultadoAoVivo; fonte: 'ao_vivo' | 'geracao'; geracaoId: string | null }

/** Planilha guardada lida uma vez por geração (o arquivo nunca muda). */
const cacheGeracao = new Map<string, ResultadoAoVivo>()

export async function listarDiasHistorico(cliente: ClienteAoVivo, hoje: string, limite = 60): Promise<string[]> {
  const svc = createServiceClient()
  const [a, g] = await Promise.all([
    svc.from('kpi_ao_vivo_calculo').select('data').eq('cliente', cliente).not('resultado', 'is', null).order('data', { ascending: false }).limit(limite),
    svc.from('kpi_romaneio_geracoes').select('data_referencia').eq('cliente', cliente).not('arquivo_storage_path', 'is', null).order('data_referencia', { ascending: false }).limit(limite * 4),
  ])
  if (a.error) throw new Error(a.error.message)
  if (g.error) throw new Error(g.error.message)
  return diasComHistorico((a.data ?? []).map(r => r.data as string), (g.data ?? []).map(r => r.data_referencia as string), hoje).slice(0, limite)
}

export async function lerDiaHistorico(cliente: ClienteAoVivo, data: string): Promise<DiaHistorico | null> {
  const svc = createServiceClient()
  const [a, g] = await Promise.all([
    svc.from('kpi_ao_vivo_calculo').select('resultado, calculado_em').eq('cliente', cliente).eq('data', data).maybeSingle(),
    svc.from('kpi_romaneio_geracoes').select('id, gerado_em, arquivo_storage_path').eq('cliente', cliente).eq('data_referencia', data)
      .not('arquivo_storage_path', 'is', null).order('gerado_em', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (a.error) throw new Error(a.error.message)
  if (g.error) throw new Error(g.error.message)
  const aoVivo = a.data?.resultado ? { calculadoEm: a.data.calculado_em as string } : null
  const geracao = g.data ? { id: g.data.id as string, geradoEm: g.data.gerado_em as string, arquivo: g.data.arquivo_storage_path as string } : null
  const fonte = escolherFonteDoDia(aoVivo, geracao)
  if (fonte === 'ao_vivo') return { resultado: a.data!.resultado as ResultadoAoVivo, fonte, geracaoId: geracao?.id ?? null }
  if (fonte !== 'geracao' || !geracao) return null
  let resultado = cacheGeracao.get(geracao.id)
  if (!resultado) {
    const { data: arq, error } = await svc.storage.from(BUCKET_KPI_ROMANEIO).download(geracao.arquivo)
    if (error || !arq) throw new Error(`planilha guardada de ${data}: ${error?.message ?? 'não encontrada'}`)
    const lido = await extrairKpiCompleto(Buffer.from(await arq.arrayBuffer()))
    resultado = montarResultadoAoVivo(data, lido, new Map(), new Date(geracao.geradoEm).toISOString())
    if (cacheGeracao.size >= 30) cacheGeracao.delete(cacheGeracao.keys().next().value!)
    cacheGeracao.set(geracao.id, resultado)
  }
  return { resultado, fonte, geracaoId: geracao.id }
}
