import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { data, error } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)
  if (error) throw error
  const lojas = (data ?? []) as Array<Record<string, unknown>>

  console.log('Total lojas ativas:', lojas.length)

  const porRede = new Map<string, number>()
  for (const l of lojas) porRede.set(l.rede_id as string, (porRede.get(l.rede_id as string) ?? 0) + 1)
  console.log('\nPor rede:')
  for (const [r, c] of [...porRede.entries()].sort((a, b) => b[1] - a[1])) {
    console.log('  ' + r.padEnd(18) + c)
  }

  const n = lojas.length
  const semCodigoUnitrac = lojas.filter(l => !l.codigo_unitrac).length
  const semNomeUnitrac = lojas.filter(l => !l.nome_unitrac).length
  const semLat = lojas.filter(l => !l.lat).length
  const semLng = lojas.filter(l => !l.lng).length
  const semRaio = lojas.filter(l => !l.raio_metros).length

  console.log('\nCompletude global:')
  console.log('  sem codigo_unitrac:', semCodigoUnitrac, '/', n, `(${((semCodigoUnitrac / n) * 100).toFixed(0)}%)`)
  console.log('  sem nome_unitrac:  ', semNomeUnitrac, '/', n, `(${((semNomeUnitrac / n) * 100).toFixed(0)}%)`)
  console.log('  sem lat:           ', semLat, '/', n, `(${((semLat / n) * 100).toFixed(0)}%)`)
  console.log('  sem lng:           ', semLng, '/', n, `(${((semLng / n) * 100).toFixed(0)}%)`)
  console.log('  sem raio:          ', semRaio, '/', n, `(${((semRaio / n) * 100).toFixed(0)}%)`)

  console.log('\nCompletude por rede:')
  const redes = [...porRede.keys()].sort()
  console.log('  Rede                 Total  semCod%  semNome%  semGeo%')
  for (const r of redes) {
    const rl = lojas.filter(l => l.rede_id === r)
    const total = rl.length
    const sCod = rl.filter(l => !l.codigo_unitrac).length
    const sNome = rl.filter(l => !l.nome_unitrac).length
    const sGeo = rl.filter(l => !l.lat || !l.lng).length
    console.log(
      '  ' + r.padEnd(20) +
      total.toString().padStart(5) +
      '  ' + `${((sCod / total) * 100).toFixed(0)}%`.padStart(6) +
      '  ' + `${((sNome / total) * 100).toFixed(0)}%`.padStart(7) +
      '  ' + `${((sGeo / total) * 100).toFixed(0)}%`.padStart(6)
    )
  }
}

main().catch(e => { console.error(e); process.exit(1) })
