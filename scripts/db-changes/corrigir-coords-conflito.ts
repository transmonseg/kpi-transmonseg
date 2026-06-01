/**
 * Corrige as lojas cuja coordenada cadastrada diverge >500m da coordenada do
 * registro de Pontos de Interesse do Unitrac (scripts/db-changes/data/pontos-interesse.json).
 * O registro é a FONTE DE VERDADE pro match geo (as paradas vêm do mesmo Unitrac),
 * então sobrescreve lat/lng/raio_metros com o valor do registro. Snapshot do estado
 * anterior em docs/db-changes/ pra rollback.
 *
 *   npx tsx scripts/db-changes/corrigir-coords-conflito.ts          # dry-run
 *   npx tsx scripts/db-changes/corrigir-coords-conflito.ts --apply  # grava
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { haversine } from '@/lib/utils/geo'

type Ponto = { codigo_unitrac: string; ponto: string; lat: number | null; lng: number | null; raio: number | null }
const APPLY = process.argv.includes('--apply')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const pontos: Ponto[] = JSON.parse(fs.readFileSync('scripts/db-changes/data/pontos-interesse.json', 'utf-8'))
  const lojas: Record<string, unknown>[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await sb.from('lojas').select('id, codigo_unitrac, nome, lat, lng, raio_metros').range(off, off + 999)
    if (error) throw error
    if (!data?.length) break
    lojas.push(...data); if (data.length < 1000) break
  }
  const byCod = new Map<string, Record<string, unknown>>()
  for (const l of lojas) { const c = (l.codigo_unitrac as string | null)?.trim().toUpperCase(); if (c) byCod.set(c, l) }

  const fixes: { id: string; nome: string; de: [number, number]; para: [number, number]; distM: number; raio: number | null }[] = []
  // Coordenada do registro tem que ser válida (RJ/Brasil). Vários pontos do export
  // vêm com [0,0] (lixo) — nesses o BANCO é a fonte boa, NÃO sobrescrever.
  const registroValido = (lat: number, lng: number) =>
    lat <= -19 && lat >= -25 && lng <= -40 && lng >= -45 // bounding box do estado do RJ
  for (const p of pontos) {
    if (p.lat == null || p.lng == null) continue
    if (!registroValido(p.lat, p.lng)) continue // pula registro [0,0]/fora do RJ
    const loja = byCod.get(p.codigo_unitrac.toUpperCase())
    if (!loja) continue
    const lat = loja.lat as number | null, lng = loja.lng as number | null
    if (lat == null || lng == null) continue
    const d = haversine(lat, lng, p.lat, p.lng)
    if (d > 500) fixes.push({ id: loja.id as string, nome: loja.nome as string, de: [lat, lng], para: [p.lat, p.lng], distM: Math.round(d), raio: p.raio })
  }
  fixes.sort((a, b) => b.distM - a.distM)
  console.log(`\n=== CORRIGIR COORDS (${APPLY ? 'APPLY' : 'DRY-RUN'}) — ${fixes.length} lojas ===`)
  for (const f of fixes) console.log(`  ${f.distM.toString().padStart(8)}m  ${f.nome.slice(0, 40).padEnd(40)} ${JSON.stringify(f.de)} -> ${JSON.stringify(f.para)}`)

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  fs.mkdirSync('docs/db-changes', { recursive: true })
  fs.writeFileSync(path.join('docs/db-changes', `${ts}-coords-fix-${APPLY ? 'applied' : 'preview'}.json`), JSON.stringify(fixes, null, 2))

  if (!APPLY) { console.log('\n(dry-run — nada gravado.)'); return }
  let ok = 0, err = 0
  for (const f of fixes) {
    const set: Record<string, unknown> = { lat: f.para[0], lng: f.para[1] }
    if (f.raio != null) set.raio_metros = f.raio
    const { error } = await sb.from('lojas').update(set).eq('id', f.id)
    if (error) { err++; console.error(`  ERRO ${f.nome}: ${error.message}`) } else ok++
  }
  console.log(`\nGRAVADO: ${ok} corrigidas, ${err} erros.`)
}
main().catch(e => { console.error(e); process.exit(1) })
