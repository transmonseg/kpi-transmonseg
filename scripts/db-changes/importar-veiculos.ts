/**
 * Popula a tabela `veiculos` com a frota RASTREADA do Unitrac
 * (scripts/db-changes/data/veiculos-frota.json, do export "monitorarveiculo").
 * É a fonte autoritativa de "tem rastreador": a sinalização do KPI marca
 * "SEM RASTREADOR" só pra placa que NÃO está aqui.
 *
 *   npx tsx scripts/db-changes/importar-veiculos.ts          # dry-run
 *   npx tsx scripts/db-changes/importar-veiculos.ts --apply
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

type Veiculo = { placa_norm: string; placa_raw: string }

async function main() {
  const frota: Veiculo[] = JSON.parse(fs.readFileSync('scripts/db-changes/data/veiculos-frota.json', 'utf-8'))

  const existentes = new Set<string>()
  for (let off = 0; ; off += 1000) {
    const { data, error } = await sb.from('veiculos').select('placa_norm').range(off, off + 999)
    if (error) throw error
    if (!data?.length) break
    for (const v of data) existentes.add(v.placa_norm as string)
    if (data.length < 1000) break
  }
  const novos = frota.filter(v => !existentes.has(v.placa_norm))

  console.log(`\n=== IMPORTAR VEÍCULOS (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===`)
  console.log(`frota no arquivo: ${frota.length}`)
  console.log(`já em veiculos: ${existentes.size}`)
  console.log(`novos a inserir: ${novos.length}`)
  console.log('exemplos novos:', novos.slice(0, 8).map(v => v.placa_raw).join(', '))

  if (!APPLY) { console.log('\n(dry-run — nada gravado.)'); return }

  // upsert idempotente por placa_norm (unique)
  const rows = frota.map(v => ({ placa_norm: v.placa_norm, placa_raw: v.placa_raw, ativo: true }))
  const { error } = await sb.from('veiculos').upsert(rows, { onConflict: 'placa_norm' })
  if (error) { console.error('ERRO:', error.message); process.exit(1) }
  console.log(`\nGRAVADO: ${rows.length} placas (upsert).`)
}
main().catch(e => { console.error(e); process.exit(1) })
