/**
 * Reativa as duas lojas inativas que tinham codigo_unitrac conflitante na Sprint A1.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const ATUALIZACOES = [
  { codigo: '560054', lat: -22.75452, lng: -43.46393, raio: 150 },
  { codigo: '560028', lat: -22.87817, lng: -43.46485, raio: 150 },
]

async function main() {
  for (const a of ATUALIZACOES) {
    const { data, error } = await supabase
      .from('lojas')
      .select('id, rede_id, nome, codigo_unitrac, ativo, lat, lng')
      .eq('codigo_unitrac', a.codigo)
      .single()
    if (error) { console.error(`erro buscando ${a.codigo}:`, error.message); continue }
    console.log(`Antes: [${data.ativo ? 'ATIVA' : 'INATIVA'}] ${data.rede_id} | ${data.nome}`)
    if (!APPLY) continue
    const { error: errU } = await supabase
      .from('lojas')
      .update({ ativo: true, lat: a.lat, lng: a.lng, raio_metros: a.raio })
      .eq('id', data.id)
    if (errU) { console.error(`erro update ${a.codigo}:`, errU.message); continue }
    console.log(`  → REATIVADA, lat=${a.lat}, lng=${a.lng}, raio=${a.raio}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
