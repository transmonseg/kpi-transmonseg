// Usage:
//   npx tsx scripts/seed-canonical.ts --dry-run   (preview only, writes seed-preview.json)
//   npx tsx scripts/seed-canonical.ts             (actual upsert)
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// .env.local may live in the worktree root or in the parent repo root (git worktrees share node_modules)
const cwd = process.cwd()
const envPaths = [
  path.resolve(cwd, '.env.local'),
  path.resolve(cwd, '..', '..', '.env.local'), // worktree → repo root
]
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p })
    console.log(`Loaded env from: ${p}`)
    break
  }
}

const DRY_RUN = process.argv.includes('--dry-run')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }

  // 1. Fetch existing lojas (use nome_normalizado from DB if available, else normalize nome)
  const { data: lojas, error: fetchErr } = await supabase
    .from('lojas')
    .select('id, nome, nome_normalizado, lat, lng, raio_metros, rede_id')

  if (fetchErr || !lojas) {
    console.error('Error fetching lojas:', fetchErr)
    process.exit(1)
  }
  console.log(`Found ${lojas.length} existing lojas`)

  // 2. Build canonical entries, deduplicating on nome_norm (UNIQUE constraint exists)
  //    Keep the first occurrence when multiple lojas share the same normalised name.
  const seenNorms = new Map<string, typeof lojas[number]>()
  const duplicates: string[] = []

  for (const l of lojas) {
    // nome_normalizado in the DB is stored uppercase; canonical_loja.nome_norm must be
    // lowercase (no accents) so that trgm RPCs — which apply lower() on the input side
    // before similarity() — get correct scores.
    const rawNorm = (l.nome_normalizado as string | null) ?? normalizeName(l.nome as string)
    const nome_norm = rawNorm.toLowerCase().trim()
    if (seenNorms.has(nome_norm)) {
      duplicates.push(`"${l.nome}" (norm="${nome_norm}") — duplicate of "${seenNorms.get(nome_norm)!.nome}"`)
    } else {
      seenNorms.set(nome_norm, l)
    }
  }

  if (duplicates.length > 0) {
    console.warn(`\nWARNING: ${duplicates.length} duplicate nome_norm detected (kept first occurrence):`)
    duplicates.forEach(d => console.warn('  •', d))
    console.warn('')
  }

  const canonicals = Array.from(seenNorms.entries()).map(([nome_norm, l]) => ({
    name: l.nome as string,
    nome_norm,
    lat: (l.lat as number | null) ?? null,
    lng: (l.lng as number | null) ?? null,
    raio_metros: (l.raio_metros as number | null) ?? 300,
    rede_id: (l.rede_id as string | null) ?? null,
  }))

  if (DRY_RUN) {
    console.log('DRY RUN — first 5 entries:')
    console.table(canonicals.slice(0, 5))
    const previewPath = path.resolve(cwd, 'scripts/seed-preview.json')
    fs.writeFileSync(previewPath, JSON.stringify(canonicals, null, 2))
    console.log(`Full preview saved to scripts/seed-preview.json (${canonicals.length} entries)`)
    return
  }

  // 3. Upsert canonical_loja (conflict on 'name')
  const { error: upsertErr } = await supabase
    .from('canonical_loja')
    .upsert(canonicals, { onConflict: 'name' })

  if (upsertErr) {
    console.error('Error upserting canonical_loja:', upsertErr)
    process.exit(1)
  }
  console.log(`Upserted ${canonicals.length} canonical lojas`)

  // 4. Fetch inserted IDs to create seed aliases
  const { data: inserted, error: fetchErr2 } = await supabase
    .from('canonical_loja')
    .select('id, name, nome_norm')

  if (fetchErr2 || !inserted) {
    console.error('Error fetching canonical_loja after upsert:', fetchErr2)
    process.exit(1)
  }

  // 5. Seed alias = the name itself, confidence=1.0, confirmacoes=5, auto_approve=true
  const aliases = inserted.map((c) => ({
    alias: c.name as string,
    alias_norm: c.nome_norm as string,
    canonical_loja_id: c.id as string,
    confidence: 1.0,
    source: 'seed',
    confirmacoes: 5,
    auto_approve: true,
  }))

  const { error: aliasErr } = await supabase
    .from('alias_loja')
    .upsert(aliases, { onConflict: 'alias_norm,canonical_loja_id' })

  if (aliasErr) {
    console.error('Error upserting alias_loja:', aliasErr)
    process.exit(1)
  }

  console.log(`Upserted ${aliases.length} seed aliases`)
  console.log('Seed complete!')
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
