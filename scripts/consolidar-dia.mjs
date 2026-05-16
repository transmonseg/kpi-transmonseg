// Popula kpi_linhas pra o dia (pra UI /api/kpi/gerar funcionar)
import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { consolidaKpi } from '../src/lib/kpi/consolidador.ts'

dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

const data = '2026-05-15'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data: kpis } = await sb.from('kpis').select('id, rede_id').eq('data', data)
console.log(`Consolidando ${kpis.length} kpis...`)

for (const k of kpis) {
  try {
    const linhas = await consolidaKpi({ kpi_id: k.id, data, rede_id: k.rede_id, svc: sb })
    console.log(`  ✓ ${k.rede_id}: ${linhas.length} linhas em kpi_linhas`)
  } catch (e) {
    console.log(`  ✗ ${k.rede_id}: ${e.message}`)
  }
}
console.log('OK — kpi_linhas populado, UI /api/kpi/gerar pronta pra usar')
