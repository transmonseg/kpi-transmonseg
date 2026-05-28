import { config } from 'dotenv'; config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
;(async () => {
  const { data } = await sb.from('lojas').select('rede_id, codigo_unitrac')
  const m: Record<string, { t: number; n: number }> = {}
  for (const l of data ?? []) {
    m[l.rede_id as string] = m[l.rede_id as string] || { t: 0, n: 0 }
    m[l.rede_id as string].t++
    if (!l.codigo_unitrac) m[l.rede_id as string].n++
  }
  for (const [r, v] of Object.entries(m).sort()) console.log(r.padEnd(16), v.n + '/' + v.t, 'sem cod')
})()
