// Lista duplicatas no cadastro ZS (mesmo número de loja, múltiplas entradas)
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

;(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: lojas } = await sb
    .from('lojas')
    .select('id, nome, codigo_escala, codigo_unitrac, lat, lng, raio_metros, ativo')
    .eq('rede_id', 'ZONA_SUL')
    .eq('ativo', true)
    .order('nome')

  // Agrupa por número
  const porNum = new Map<string, any[]>()
  for (const l of lojas ?? []) {
    const m = l.nome.match(/\b(\d+)\b/)
    if (!m) continue
    const num = m[1].padStart(2, '0')
    const arr = porNum.get(num) ?? []
    arr.push(l)
    porNum.set(num, arr)
  }

  console.log('Duplicatas (mesmo número, ≥2 entradas):\n')
  for (const [num, arr] of porNum) {
    if (arr.length < 2) continue
    console.log(`Loja ${num}:`)
    for (const l of arr) {
      console.log(`  id=${l.id.slice(0,8)} | ${l.nome.padEnd(38)} cod-esc=${l.codigo_escala ?? '-'} cod-uni=${l.codigo_unitrac ?? '-'} lat=${l.lat ?? '?'} lng=${l.lng ?? '?'} raio=${l.raio_metros}`)
    }
    console.log()
  }

  // Total
  const totalDup = [...porNum.entries()].filter(([_, arr]) => arr.length >= 2).length
  console.log(`Total lojas duplicadas: ${totalDup}`)
})()
