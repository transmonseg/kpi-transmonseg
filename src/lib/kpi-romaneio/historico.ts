import { createServiceClient } from '@/lib/supabase/service'

export async function salvarGeracao(params: {
  cliente: string
  dataReferencia: string
  geradoPor: string | null
  qtdCargas: number
  arquivoStoragePath: string | null
}): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('kpi_romaneio_geracoes').insert({
    cliente: params.cliente,
    data_referencia: params.dataReferencia,
    gerado_por: params.geradoPor,
    qtd_cargas: params.qtdCargas,
    arquivo_storage_path: params.arquivoStoragePath,
  })
  if (error) throw new Error(`Falha ao salvar geracao: ${error.message}`)
}
