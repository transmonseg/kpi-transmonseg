import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { gerarKpi } from '../../src/lib/kpi/gerador-kpi.ts'
import { getMatrizLojas } from '../../src/lib/lojas/catalogo-matriz.ts'
import { consolidaKpi } from '../../src/lib/kpi/consolidador.ts'

dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

// Verifica o catálogo atualizado
const lojasPrezunic = getMatrizLojas('PREZUNIC', [])
console.log(`Catálogo PREZUNIC: ${lojasPrezunic.length} lojas`)
console.log(lojasPrezunic.map((l, i) => `  ${i+1}. ${l}`).join('\n'))
console.log()

const data = '2026-05-19'
const out = 'C:/Users/media/Downloads/KPI-FIX-CICLO2-TSX'
await mkdir(out, { recursive: true })

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Busca o kpi_id para PREZUNIC no dia
const { data: kpiRow, error: kpiErr } = await svc
  .from('kpis')
  .select('id')
  .eq('data', data)
  .eq('rede_id', 'PREZUNIC')
  .single()

if (kpiErr || !kpiRow) {
  console.error('Sem kpi row para PREZUNIC em', data, kpiErr)
  process.exit(1)
}

console.log(`kpi_id: ${kpiRow.id}`)

// Consolida KPI diretamente de kpi_rotas (mesmo pipeline do gerarKpi real)
const linhas = await consolidaKpi({
  kpi_id: kpiRow.id,
  data,
  rede_id: 'PREZUNIC',
  svc,
})

console.log(`kpi_linhas consolidadas: ${linhas.length}`)
for (const l of linhas.slice(0, 5)) {
  console.log(`  ${l.loja_nome} | carro=${l.carro_ordem} | placa=${l.placa ?? '(null)'} | saida_cd=${l.saida_cd?.toISOString().slice(11,16) ?? '(null)'}`)
}

const buf = await gerarKpi({ rede_id: 'PREZUNIC', data, linhas })
await writeFile(`${out}/KPI PREZUNIC.xlsx`, buf)
console.log(`\nGerado: ${out}/KPI PREZUNIC.xlsx (${buf.length} bytes)`)
