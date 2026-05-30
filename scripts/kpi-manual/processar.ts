/**
 * Processa os 10 XLSX de KPI manual (um por rede), auto-detecta as abas-dia e
 * insere TODOS os dias em kpi_manual_entradas. Idempotente por rede+mês.
 * Roda: npx tsx scripts/kpi-manual/processar.ts [YYYY-MM]
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { parseKpiManualTodasAbas } from '../../src/lib/kpi/parse-kpi-manual'

const DIR = 'C:/Users/media/Downloads/KPI SMANUAIS'
const MES = process.argv[2] ?? '2026-05'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Faltam credenciais Supabase em .env.local'); process.exit(1) }
const svc = createClient(url, key, { auth: { persistSession: false } })

// nome do arquivo (sem "KPI ", sufixo "(N)" e ".xlsx") → rede_id do sistema
const MAP: Record<string, string> = {
  'ARMAZEM DO GRAO': 'ARMAZEM_GRAO',
  'ASSAI': 'ASSAI',
  'ATACADAO': 'ATACADAO',
  'CARREFOUR': 'CARREFOUR',
  'GUANABARA': 'GUANABARA',
  'PREZUNIC': 'PREZUNIC',
  'PRINCESA': 'PRINCESA',
  'SUPERPAX': 'SUPER_PAX',
  'SUPERPRIX': 'SUPERPRIX',
  'ZONA SUL': 'ZONA_SUL',
}

function redeDoArquivo(nome: string): string | null {
  const chave = nome.replace(/^KPI\s+/i, '').replace(/\s*\(\d+\)/, '').replace(/\.xlsx$/i, '').trim().toUpperCase()
  return MAP[chave] ?? null
}

async function main() {
  const arquivos = readdirSync(DIR).filter(f => f.toLowerCase().endsWith('.xlsx'))
  console.log(`Mês: ${MES} · ${arquivos.length} arquivos\n`)
  let totalEnt = 0

  for (const nome of arquivos) {
    const rede_id = redeDoArquivo(nome)
    if (!rede_id) { console.log(`  ⚠ ${nome} → rede não mapeada, pulando`); continue }

    const buf = readFileSync(join(DIR, nome))
    const { entradas, dias } = await parseKpiManualTodasAbas(buf, rede_id, MES)

    // idempotência: limpa o mês desta rede antes de inserir
    await svc.from('kpi_manual_entradas').delete().eq('rede_id', rede_id).gte('data', `${MES}-01`).lte('data', `${MES}-31`)

    // insere em lotes de 500
    const rows = entradas.map(e => ({ ...e, uploaded_by: null }))
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await svc.from('kpi_manual_entradas').insert(rows.slice(i, i + 500))
      if (error) { console.error(`  ERRO insert ${rede_id}: ${error.message}`); break }
    }
    totalEnt += entradas.length
    console.log(`  ${rede_id.padEnd(14)} → ${String(entradas.length).padStart(4)} entradas · ${dias.length} dias (${dias[0]?.slice(8)}..${dias.at(-1)?.slice(8)})`)
  }

  console.log(`\nOK — ${totalEnt} entradas inseridas no total (mês ${MES})`)
}

main().catch(e => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1) })
