import { gerarKpi, type LinhaParaKpi } from './gerador-kpi'
import type { KpiLinha } from '@/lib/types/kpi'

/**
 * Shim para compatibilidade com chamadores antigos.
 * @deprecated Use gerarKpi() de ./gerador-kpi diretamente, passando `LinhaParaKpi[]` com `anomalias_codigos` e `motorista_codigo`.
 */
export async function gerarKpiXlsx(params: {
  rede_id: string
  rede_nome: string
  data: string
  linhas: KpiLinha[]
}): Promise<Buffer> {
  const linhas: LinhaParaKpi[] = params.linhas.map((l) => ({ ...l }))
  return gerarKpi({ rede_id: params.rede_id, data: params.data, linhas })
}
