// Romaneio do dia já enviado (06/10, "como já enviei as coisas, guardar pra
// gerar mais rápido"): o que foi lido no Ao vivo (kpi_ao_vivo_dia) ou numa
// geração anterior (cache do dia, 7 dias). A tela Gerar KPI usa direto, sem
// subir os PDFs de novo nem ler de novo.
import { entradaDoDia } from './ao-vivo-servico'
import { lerCacheDia, gravarCacheDia } from './cache-dia'
import { hojeBR } from '@/lib/data-br'
import type { EntradaKpiNutrimax } from './gerar-nutrimax'
import { createServiceClient } from '@/lib/supabase/service'

const SETE_DIAS_MS = 7 * 24 * 3600_000
type Guardada = Omit<EntradaKpiNutrimax, 'data'> & { enviadoEm: string }

export async function guardarEntradaNutrimax(entrada: EntradaKpiNutrimax): Promise<void> {
  const { data, ...resto } = entrada
  await gravarCacheDia('entrada', data, new Map([['nutrimax', { ...resto, enviadoEm: new Date().toISOString() } satisfies Guardada]]))
}

export async function lerEntradaGuardadaNutrimax(data: string): Promise<{ entrada: EntradaKpiNutrimax; enviadoEm: string; origem: 'ao_vivo' | 'geracao' } | null> {
  const doAoVivo = await entradaDoDia('nutrimax', data)
  if (doAoVivo) {
    const { data: d } = await createServiceClient().from('kpi_ao_vivo_dia').select('enviado_em').eq('cliente', 'nutrimax').eq('data', data).maybeSingle()
    return { entrada: doAoVivo, enviadoEm: (d?.enviado_em as string) ?? '', origem: 'ao_vivo' }
  }
  const g = (await lerCacheDia<Guardada>('entrada', data, hojeBR(), SETE_DIAS_MS)).get('nutrimax')
  if (!g) return null
  const { enviadoEm, ...resto } = g
  return { entrada: { data, ...resto }, enviadoEm, origem: 'geracao' }
}
