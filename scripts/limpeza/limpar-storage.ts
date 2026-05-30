/**
 * Remove TODOS os arquivos dos buckets de upload/relatório (após o backup).
 * NÃO remove buckets nem cadastros. Roda: npx tsx scripts/limpeza/limpar-storage.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Faltam credenciais'); process.exit(1) }
const svc = createClient(url, key, { auth: { persistSession: false } })

const BUCKETS = ['kpi-manual-raw', 'escalas-raw', 'unitrac-raw']

async function listarRecursivo(bucket: string, prefix: string): Promise<string[]> {
  const { data, error } = await svc.storage.from(bucket).list(prefix, { limit: 1000 })
  if (error) { console.error(`  ERRO list ${bucket}/${prefix}: ${error.message}`); return [] }
  const out: string[] = []
  for (const item of data ?? []) {
    const full = prefix ? `${prefix}/${item.name}` : item.name
    if ((item as { id: string | null }).id === null) out.push(...await listarRecursivo(bucket, full))
    else out.push(full)
  }
  return out
}

async function limpar(b: string) {
  const files = await listarRecursivo(b, '')
  if (files.length === 0) { console.log(`  bucket ${b.padEnd(16)} → já vazio`); return }
  let removidos = 0
  for (let i = 0; i < files.length; i += 100) {
    const lote = files.slice(i, i + 100)
    const { error } = await svc.storage.from(b).remove(lote)
    if (error) console.error(`  remove ${b}: ${error.message}`)
    else removidos += lote.length
  }
  const restantes = await listarRecursivo(b, '')
  console.log(`  bucket ${b.padEnd(16)} → ${removidos} removidos (restam ${restantes.length})`)
}

async function main() {
  console.log('LIMPANDO STORAGE')
  for (const b of BUCKETS) await limpar(b)
  console.log('OK')
}

main().catch(e => { console.error('FALHA:', e); process.exit(1) })
