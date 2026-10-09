// Entrada do dia a partir dos PDFs guardados da ultima geracao (fluxo "Gerar KPI").
// 09/10: o dia foi gerado so' por esse fluxo (11:07) e o Ao vivo ficou `sem_romaneio`;
// as ferramentas de auditoria/aprendizado precisam das duas fontes.
import { createServiceClient } from '@/lib/supabase/service'
import { parseEscala } from './parse-escala'
import { parseRomaneio } from './parse-romaneio'
import { parsePao } from './parse-pao'
import type { EntradaKpiNutrimax } from './gerar-nutrimax'

const BUCKET = 'kpi-romaneio-inputs'

export async function entradaDaGeracao(data: string, empresa = 'nutrimax'): Promise<EntradaKpiNutrimax | null> {
  const svc = createServiceClient()
  const { data: g } = await svc.from('kpi_romaneio_geracoes').select('escala_storage_path, romaneio_storage_path, pao_storage_path')
    .eq('cliente', empresa).eq('data_referencia', data).not('romaneio_storage_path', 'is', null)
    .order('gerado_em', { ascending: false }).limit(1).maybeSingle()
  if (!g) return null
  const baixar = async (p: string | null) => {
    if (!p) return null
    const { data: arq, error } = await svc.storage.from(BUCKET).download(p)
    if (error || !arq) throw new Error(`download ${p}: ${error?.message}`)
    return Buffer.from(await arq.arrayBuffer())
  }
  const [e, r, pa] = await Promise.all([baixar(g.escala_storage_path), baixar(g.romaneio_storage_path), baixar(g.pao_storage_path)])
  return {
    data, escala: e ? await parseEscala(e) : [], romaneio: await parseRomaneio(r!),
    pao: pa ? await parsePao(pa, data) : { linhas: [], escala: [] }, escalaEnviada: !!e, paoEnviado: !!pa,
  }
}
