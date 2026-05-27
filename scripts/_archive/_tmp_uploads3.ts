import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

;(async () => {
  const { data } = await sb.from('escala_uploads').select('id, data_escala, tipo, nome_arquivo, qtd_linhas, status').order('data_escala')
  console.log(`Total uploads: ${data?.length}`)
  for (const u of data ?? []) {
    console.log(`  ${u.data_escala} | tipo=${u.tipo?.padEnd(8)} | linhas=${String(u.qtd_linhas).padStart(4)} | ${u.nome_arquivo?.slice(0,50)} | ${u.status}`)
  }
})()
