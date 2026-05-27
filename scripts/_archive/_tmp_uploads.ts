import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

;(async () => {
  // Listar escala_uploads recentes
  const { data: uploads, error } = await sb.from('escala_uploads').select('*').gte('created_at', '2026-05-01').order('created_at', { ascending: false }).limit(20)
  if (error) { console.error(error.message); return }
  console.log(`Escala uploads: ${uploads?.length}`)
  for (const u of uploads ?? []) {
    console.log(`  ${u.created_at?.slice(0,10)} | rede=${u.rede_id?.padEnd(10)} | data=${u.data_upload} | id=${u.id?.slice(0,8)}...`)
  }

  // Unitrac uploads
  const { data: uu, error: ue } = await sb.from('unitrac_uploads').select('id, data_relatorio, created_at').gte('created_at', '2026-05-01').order('created_at', { ascending: false }).limit(20)
  if (ue) { console.error(ue.message); return }
  console.log(`\nUnitrac uploads: ${uu?.length}`)
  for (const u of uu ?? []) {
    console.log(`  ${u.created_at?.slice(0,10)} | data_relatorio=${u.data_relatorio} | id=${u.id?.slice(0,8)}...`)
  }
})()
