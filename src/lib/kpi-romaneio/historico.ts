import { createServiceClient } from '@/lib/supabase/service'
import type { ResumoGeracao } from './resumo-dashboard'

export async function salvarGeracao(params: {
  cliente: string
  dataReferencia: string
  geradoPor: string | null
  qtdCargas: number
  arquivoStoragePath: string | null
  // Pedido do usuario 01/09: guarda os PDFs originais (Escala + Romaneio)
  // pra poder REGENERAR de verdade depois (rodar a mesma pipeline de novo,
  // se beneficiando de qualquer fix aplicado desde entao) -- nao so'
  // re-baixar o mesmo xlsx antigo. null pra geracoes antigas (antes desta
  // mudanca) e' esperado -- so' nao oferece "regenerar" nesse caso.
  escalaStoragePath: string | null
  romaneioStoragePath: string | null
  // PDF do Romaneio do Pao (opcional; null quando nao veio ou geracao antiga).
  paoStoragePath?: string | null
  // Dashboard (04/10/2026): numeros da planilha entregue (ver resumo-dashboard.ts).
  resumo?: ResumoGeracao | null
}): Promise<string> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('kpi_romaneio_geracoes')
    .insert({
      cliente: params.cliente,
      data_referencia: params.dataReferencia,
      gerado_por: params.geradoPor,
      qtd_cargas: params.qtdCargas,
      arquivo_storage_path: params.arquivoStoragePath,
      escala_storage_path: params.escalaStoragePath,
      romaneio_storage_path: params.romaneioStoragePath,
      pao_storage_path: params.paoStoragePath ?? null,
      ...(params.resumo ? { resumo: params.resumo } : {}),
    })
    .select('id')
    .single()
  if (error) throw new Error(`Falha ao salvar geracao: ${error.message}`)
  return data.id as string
}

export type GeracaoParaRegenerar = {
  id: string
  dataReferencia: string
  escalaStoragePath: string | null
  romaneioStoragePath: string | null
  paoStoragePath: string | null
}

/** Busca os dados minimos pra regenerar uma geracao passada -- so' o que
 *  o chamador precisa pra baixar os PDFs originais do Storage e rodar a
 *  pipeline de novo. null quando o id nao existe ou (geracao antiga, sem
 *  os PDFs guardados) escala/romaneio nunca foram salvos. */
export async function buscarGeracaoParaRegenerar(id: string): Promise<GeracaoParaRegenerar | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('kpi_romaneio_geracoes')
    .select('id, data_referencia, escala_storage_path, romaneio_storage_path, pao_storage_path')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return {
    id: data.id,
    dataReferencia: data.data_referencia,
    escalaStoragePath: data.escala_storage_path,
    romaneioStoragePath: data.romaneio_storage_path,
    paoStoragePath: data.pao_storage_path ?? null,
  }
}
