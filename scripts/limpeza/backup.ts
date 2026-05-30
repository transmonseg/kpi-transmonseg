/**
 * Backup das tabelas operacionais + arquivos dos buckets ANTES da limpeza total.
 * NÃO toca em cadastros (lojas, redes, canonical_loja, alias_loja, clientes_cozinha,
 * motoristas, veiculos). Roda: npx tsx scripts/limpeza/backup.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Faltam credenciais Supabase em .env.local'); process.exit(1) }
const svc = createClient(url, key, { auth: { persistSession: false } })

const TABELAS = [
  'kpi_manual_entradas', 'kpis', 'kpi_linhas', 'kpi_rotas', 'kpi_geracoes', 'kpi_simples',
  'anomalias', 'review_queue', 'escala_uploads', 'escala_linhas',
  'unitrac_uploads', 'unitrac_paradas', 'alteracoes',
]
const BUCKETS = ['kpi-manual-raw', 'escalas-raw', 'unitrac-raw']
const DIR = 'docs/backup/2026-05-29'

async function dumpTabela(t: string): Promise<number> {
  const PAGE = 1000
  const all: unknown[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await svc.from(t).select('*').range(from, from + PAGE - 1)
    if (error) { console.error(`  ERRO ${t}: ${error.message}`); break }
    all.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  mkdirSync(DIR, { recursive: true })
  writeFileSync(`${DIR}/${t}.json`, JSON.stringify(all))
  console.log(`  tabela ${t.padEnd(22)} → ${all.length} linhas`)
  return all.length
}

async function listarRecursivo(bucket: string, prefix: string): Promise<string[]> {
  const { data, error } = await svc.storage.from(bucket).list(prefix, { limit: 1000 })
  if (error) { console.error(`  ERRO list ${bucket}/${prefix}: ${error.message}`); return [] }
  const out: string[] = []
  for (const item of data ?? []) {
    const full = prefix ? `${prefix}/${item.name}` : item.name
    // pastas têm id null no supabase-storage
    if ((item as { id: string | null }).id === null) out.push(...await listarRecursivo(bucket, full))
    else out.push(full)
  }
  return out
}

async function dumpBucket(b: string): Promise<number> {
  const files = await listarRecursivo(b, '')
  for (const path of files) {
    const { data, error } = await svc.storage.from(b).download(path)
    if (error || !data) { console.error(`  download ${b}/${path}: ${error?.message}`); continue }
    const buf = Buffer.from(await data.arrayBuffer())
    const dest = `${DIR}/buckets/${b}/${path}`
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, buf)
  }
  console.log(`  bucket ${b.padEnd(16)} → ${files.length} arquivos baixados`)
  return files.length
}

async function main() {
  console.log(`BACKUP → ${DIR}`)
  console.log('Tabelas:')
  let totalLinhas = 0
  for (const t of TABELAS) totalLinhas += await dumpTabela(t)
  console.log('Buckets:')
  let totalArq = 0
  for (const b of BUCKETS) totalArq += await dumpBucket(b)
  console.log(`\nOK — ${totalLinhas} linhas e ${totalArq} arquivos salvos em ${DIR}`)
}

main().catch(e => { console.error('FALHA:', e); process.exit(1) })
