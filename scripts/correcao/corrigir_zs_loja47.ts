// Loja 47 ZS cadastro -22.8217,-43.3217 (~Belford Roxo norte, errado)
// Real é -22.92738,-43.17741 (Catete) — triangulado via GPS 2 dias
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.argv.includes('--apply') ? false : true

;(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: loja } = await sb
    .from('lojas')
    .select('id, nome, lat, lng, raio_metros')
    .eq('rede_id', 'ZONA_SUL')
    .ilike('nome', '%47%')
    .single()
  if (!loja) { console.log('Loja 47 não achada'); return }
  console.log(`Loja: ${loja.nome}`)
  console.log(`De: ${loja.lat},${loja.lng} raio=${loja.raio_metros}`)
  console.log(`Pra: -22.92738,-43.17741 raio=200 (Catete, triangulado GPS 2 dias)`)
  if (DRY_RUN) { console.log('\n[DRY-RUN] rode com --apply'); return }
  const { error } = await sb.from('lojas').update({ lat: -22.92738, lng: -43.17741, raio_metros: 200 }).eq('id', loja.id)
  console.log(error ? `ERRO: ${error.message}` : 'aplicado ✓')
})()
