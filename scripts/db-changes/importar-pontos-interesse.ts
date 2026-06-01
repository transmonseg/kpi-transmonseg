/**
 * Importa o registro de Pontos de Interesse do Unitrac (scripts/db-changes/data/pontos-interesse.json,
 * convertido de "unitrac_pontointeresse_consulta.xls") para a tabela `lojas`, casando por
 * codigo_unitrac = IDENTIFICADOR.
 *
 * - Preenche endereco/bairro/municipio/numero (sempre).
 * - Preenche lat/lng/raio_metros SÓ onde a loja está nula (não sobrescreve coordenada existente).
 * - Conflito de coordenada (>500m entre cadastro atual e registro) é só REPORTADO, nunca sobrescrito.
 * - NUNCA cria loja nova (regra: loja só entra após cruzar com a escala real).
 *
 * Uso:
 *   npx tsx scripts/db-changes/importar-pontos-interesse.ts            # dry-run (não grava)
 *   npx tsx scripts/db-changes/importar-pontos-interesse.ts --apply    # grava
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { haversine } from '@/lib/utils/geo'

type Ponto = {
  codigo_unitrac: string; ponto: string; endereco: string | null; bairro: string | null
  municipio: string | null; numero: string | null; raio: number | null; lat: number | null; lng: number | null
}

const APPLY = process.argv.includes('--apply')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const pontos: Ponto[] = JSON.parse(fs.readFileSync('scripts/db-changes/data/pontos-interesse.json', 'utf-8'))

  // Carrega todas as lojas (paginado pra não bater no teto de 1000)
  const lojas: Record<string, unknown>[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await sb.from('lojas')
      .select('id, codigo_unitrac, nome, lat, lng, raio_metros, endereco, bairro, municipio, numero')
      .range(off, off + 999)
    if (error) throw error
    if (!data?.length) break
    lojas.push(...data)
    if (data.length < 1000) break
  }
  const byCod = new Map<string, Record<string, unknown>>()
  for (const l of lojas) {
    const c = (l.codigo_unitrac as string | null)?.trim().toUpperCase()
    if (c) byCod.set(c, l)
  }

  const updates: { id: string; nome: string; set: Record<string, unknown> }[] = []
  const semLoja: string[] = []
  const conflitos: { codigo: string; nome: string; distM: number }[] = []

  for (const p of pontos) {
    const loja = byCod.get(p.codigo_unitrac.toUpperCase())
    if (!loja) { semLoja.push(`${p.codigo_unitrac} ${p.ponto}`); continue }
    const set: Record<string, unknown> = {
      endereco: p.endereco, bairro: p.bairro, municipio: p.municipio, numero: p.numero,
    }
    // lat/lng/raio: só preenche onde está nulo
    const lat = loja.lat as number | null, lng = loja.lng as number | null
    if (lat == null || lng == null) {
      if (p.lat != null) set.lat = p.lat
      if (p.lng != null) set.lng = p.lng
    } else if (p.lat != null && p.lng != null) {
      const d = haversine(lat, lng, p.lat, p.lng)
      if (d > 500) conflitos.push({ codigo: p.codigo_unitrac, nome: p.ponto, distM: Math.round(d) })
    }
    if ((loja.raio_metros == null) && p.raio != null) set.raio_metros = p.raio
    updates.push({ id: loja.id as string, nome: loja.nome as string, set })
  }

  console.log(`\n=== IMPORT PONTOS DE INTERESSE (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===`)
  console.log(`pontos no arquivo: ${pontos.length}`)
  console.log(`lojas no banco: ${lojas.length}`)
  console.log(`lojas que serão enriquecidas (casaram por codigo_unitrac): ${updates.length}`)
  console.log(`pontos SEM loja cadastrada (NÃO serão criados): ${semLoja.length}`)
  console.log(`conflitos de coordenada >500m (reportados, NÃO sobrescritos): ${conflitos.length}`)
  if (conflitos.length) conflitos.slice(0, 20).forEach(c => console.log(`   ⚠ ${c.codigo} ${c.nome} — ${c.distM}m de diferença`))

  // snapshot/preview
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const previewPath = path.join('docs/db-changes', `${ts}-pontos-import-${APPLY ? 'applied' : 'preview'}.json`)
  fs.mkdirSync('docs/db-changes', { recursive: true })
  fs.writeFileSync(previewPath, JSON.stringify({ updates, semLoja, conflitos }, null, 2))
  console.log(`\nsnapshot: ${previewPath}`)

  if (!APPLY) { console.log('\n(dry-run — nada gravado. rode com --apply pra gravar.)'); return }

  let ok = 0, err = 0
  for (const u of updates) {
    const { error } = await sb.from('lojas').update(u.set).eq('id', u.id)
    if (error) { err++; console.error(`  ERRO ${u.nome}: ${error.message}`) } else ok++
  }
  console.log(`\nGRAVADO: ${ok} lojas atualizadas, ${err} erros.`)
}

main().catch(e => { console.error(e); process.exit(1) })
