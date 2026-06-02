/**
 * Corrige lat/lng de lojas ASSAÍ (sem codigo_unitrac próprio) cujas coordenadas
 * estão imprecisas. As ASSAÍ casam por código via alias Assaí↔Sendas, então o KPI
 * JÁ sai certo — esta correção só melhora o geo-fallback (rede de segurança).
 *
 * Fonte da coordenada correta: a loja SENDAS irmã (mesmo ponto físico, código
 * 560xxx) que está geolocalizada certa (validado vs GPS do relatório 02.06).
 * NÃO toca: código, raio, lojas SENDAS, nem o CD Duque (GPS espalhado).
 *
 *   npx tsx scripts/db-changes/corrigir-coords-assai.ts           # dry-run
 *   npx tsx scripts/db-changes/corrigir-coords-assai.ts --apply
 */
import { config } from 'dotenv'; config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
function hav(a: number, b: number, c: number, d: number) { const R = 6371000, t = Math.PI / 180; const u = (c - a) * t, v = (d - b) * t; const x = Math.sin(u / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(v / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)) }

// Coordenada correta (GPS-verificada via loja SENDAS irmã / relatório 02.06).
const ALVOS: { match: RegExp; lat: number; lng: number; label: string }[] = [
  { match: /maca[ée].*232|232.*maca/i, lat: -22.35962, lng: -41.802085, label: 'Macaé 232' },
  { match: /mendanha.*65|65.*mendanha|mendanha/i, lat: -22.86219, lng: -43.54981, label: 'Mendanha 65' },
  { match: /pilares.*128|128.*pilares|pilares/i, lat: -22.88320, lng: -43.289515, label: 'Pilares 128' },
]
const LIMIAR_M = 300 // só corrige se estiver a mais de 300m do ponto correto

async function main() {
  const { data, error } = await sb.from('lojas').select('id,rede_id,nome,codigo_unitrac,lat,lng,raio_metros,ativo').eq('rede_id', 'ASSAI').eq('ativo', true)
  if (error) throw error
  const lojas = data ?? []
  console.log(`\n=== CORRIGIR COORDS ASSAÍ (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===`)
  const updates: { id: string; nome: string; lat: number; lng: number }[] = []
  for (const a of ALVOS) {
    const cand = lojas.filter(l => a.match.test(l.nome) && !l.codigo_unitrac)
    for (const l of cand) {
      const dist = (l.lat != null && l.lng != null) ? hav(l.lat, l.lng, a.lat, a.lng) : Infinity
      const flag = dist > LIMIAR_M ? '→ CORRIGIR' : 'ok (mantém)'
      console.log(`  [${a.label}] "${l.nome}" lat=${l.lat},${l.lng} dist=${Number.isFinite(dist) ? Math.round(dist) + 'm' : 's/coord'} ${flag}`)
      if (dist > LIMIAR_M) updates.push({ id: l.id, nome: l.nome, lat: a.lat, lng: a.lng })
    }
  }
  console.log(`\n${updates.length} loja(s) a corrigir (só lat/lng).`)
  if (!APPLY) { console.log('\n(dry-run — nada gravado.)'); return }
  for (const u of updates) {
    const { error: e } = await sb.from('lojas').update({ lat: u.lat, lng: u.lng }).eq('id', u.id)
    if (e) { console.error(`ERRO ${u.nome}:`, e.message); process.exit(1) }
    console.log(`  gravado: ${u.nome} → ${u.lat},${u.lng}`)
  }
  console.log(`\nGRAVADO: ${updates.length} coords.`)
}
main().catch(e => { console.error(e); process.exit(1) })
