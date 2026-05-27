/**
 * Corrige cadastros de lojas no Supabase identificados durante análise dia 19.
 * Operações idempotentes.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

async function main() {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const ops = [
    // PETIT/EMPORIO: DESCONHECIDO → SENDAS (são lojas da rede Sendas)
    { match: { codigo_unitrac: '22144000' }, set: { rede_id: 'SENDAS' }, label: 'PETIT MARCHE BARRAMARES → SENDAS' },
    { match: { codigo_unitrac: '22144002' }, set: { rede_id: 'SENDAS' }, label: 'PETIT ATLANTICO SUL → SENDAS' },
    { match: { codigo_unitrac: '22980000' }, set: { rede_id: 'SENDAS' }, label: 'EMPORIO BARRA TOWER → SENDAS' },
  ]
  for (const op of ops) {
    const { data: before } = await svc.from('lojas').select('id, nome, rede_id, codigo_unitrac').match(op.match).limit(1).maybeSingle()
    if (!before) { console.log(`SKIP ${op.label} — não achou`); continue }
    if (before.rede_id === op.set.rede_id) { console.log(`OK ${op.label} — já está ${op.set.rede_id}`); continue }
    const { error } = await svc.from('lojas').update(op.set).match(op.match)
    if (error) console.error(`ERRO ${op.label}:`, error.message)
    else console.log(`APLICADO ${op.label} — ${before.rede_id} → ${op.set.rede_id}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
