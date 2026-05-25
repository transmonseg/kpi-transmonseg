import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function main() {
  for (const codigo of ['560054', '560028']) {
    const { data, error } = await supabase
      .from('lojas')
      .select('id, rede_id, nome, codigo_unitrac, nome_unitrac, lat, lng, ativo')
      .eq('codigo_unitrac', codigo)
    if (error) { console.error(error); continue }
    console.log(`\n=== codigo_unitrac=${codigo} ===`)
    for (const r of data ?? []) console.log(`  [${r.ativo ? 'ATIVA' : 'INATIVA'}] ${r.rede_id} | ${r.nome} (id ${r.id})`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
