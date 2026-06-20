import { config } from 'dotenv'; config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const MES = process.env.MES || '2026-06'
const { data: lista } = await svc.storage.from('kpi-api-dash').list('', { limit: 1000 })
const resumos = (lista ?? []).filter(f => f.name.startsWith(MES) && f.name.endsWith('.resumo.json')).map(f => f.name).sort()
let totParadas = 0, totPontos = 0
for (const nome of resumos) {
  const { data: blob } = await svc.storage.from('kpi-api-dash').download(nome)
  if (!blob) continue
  const r = JSON.parse(await blob.text())
  totParadas += r.paradasIndevidas ?? 0
  totPontos += (r.pontosRisco ?? []).length
  console.log(`${nome.replace('.resumo.json','')}  paradas=${r.paradasIndevidas ?? 0}  pontos=${(r.pontosRisco ?? []).length}  top=${(r.topIndevidas ?? []).length}`)
}
console.log(`\nTOTAL ${MES}: ${resumos.length} dias · ${totParadas} paradas · ${totPontos} pontos no mapa`)
