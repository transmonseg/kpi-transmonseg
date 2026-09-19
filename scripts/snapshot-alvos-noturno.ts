// Cron noturno: captura os alvos da Unitrac (Nutry Max) e grava o snapshot por dia
// em kpi_alvos_snapshot; depois apaga snapshots com mais de 90 dias.
//
// Uso: npx tsx --env-file=.env.local scripts/snapshot-alvos-noturno.ts [--dry]
// --dry: só imprime contagens (sem gravar nem apagar). Sai com código 1 se a API falhar.

import { buscarAlvos, buscarFrota } from '../src/lib/unitrac-api'
import { COD_USER_NUTRIMAX } from '../src/lib/kpi-romaneio/constants'
import { hojeBR } from '../src/lib/data-br'
import { agruparAlvosPorDia, salvarSnapshotAlvos } from '../src/lib/kpi-romaneio/alvos-snapshot'
import { createServiceClient } from '../src/lib/supabase/service'

const RETENCAO_DIAS = 90

async function main() {
  const dry = process.argv.includes('--dry')
  const frota = await buscarFrota(COD_USER_NUTRIMAX)
  // buscarFrota/buscarAlvos engolem erro de rede e devolvem vazio: frota vazia = API falhou.
  if (frota.length === 0) throw new Error('frota vazia (API Unitrac falhou ou sem credenciais)')
  const alvos = await buscarAlvos(frota.map(v => v.cv))
  const porDia = agruparAlvosPorDia(alvos)
  console.log(`frota=${frota.length} alvos=${alvos.length} dias=${porDia.size}`)
  if (alvos.length === 0) console.warn('API respondeu sem alvos (nada a gravar)')
  for (const [dia, lista] of [...porDia].sort()) {
    console.log(`  ${dia}: ${lista.length} alvos`)
    if (!dry) await salvarSnapshotAlvos('nutrimax', dia, lista)
  }
  const corte = new Date(`${hojeBR()}T12:00:00Z`)
  corte.setUTCDate(corte.getUTCDate() - RETENCAO_DIAS)
  const limite = corte.toISOString().slice(0, 10)
  if (dry) return console.log(`(dry) apagaria snapshots com data_referencia < ${limite}`)
  const { error, count } = await createServiceClient().from('kpi_alvos_snapshot')
    .delete({ count: 'exact' }).lt('data_referencia', limite)
  if (error) throw new Error(error.message)
  console.log(`snapshots antigos apagados (< ${limite}): ${count ?? 0}`)
}

main().catch(err => { console.error('snapshot-alvos-noturno falhou:', err instanceof Error ? err.message : err); process.exit(1) })
