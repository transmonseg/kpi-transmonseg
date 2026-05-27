/**
 * Bug 4B ZS dia 19 DBB-8D19 (Loja 11 1ª + Loja 31 1ª)
 * Manual: Loja 11 1ª 14:35/17:05, Loja 31 1ª (?)
 */
import { readFileSync, readdirSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { cruzaEscalaUnitrac, variantesOcr } from '@/lib/kpi/matcher'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

function fmtT(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}`
}

;(async () => {
  const data = '2026-05-19'
  const PLACAS_ALVO = ['DBB8D19', 'LCO0978', 'KQR2J11', 'GAR0802', 'LNU7733', 'AKZ2594', 'EZU9325', 'GVH1397', 'KTR6724', 'KOP4978', 'LLJ9C64', 'LQE5401']

  const { data: escalaLinhas } = await sb.from('escala_linhas')
    .select('id, rede_id, placa_norm, loja_nome_raw, loja_codigo_raw, motorista_nome, carro_ordem, data_entrega')
    .eq('data_entrega', data)

  // Carrega GPS
  const pasta = `${BASE}/ESCALA DIA 19`
  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))

  for (const placa of PLACAS_ALVO) {
    const variantes = variantesOcr(placa)
    const linhas = (escalaLinhas || []).filter((l: any) => l.placa_norm === placa)
    console.log(`\n========== ${placa}  (variantes: ${variantes.join(', ')}) ==========`)
    console.log(`ESCALA (${linhas.length} linhas):`)
    for (const l of linhas) console.log(`  ${l.rede_id} ${l.loja_nome_raw}  cod=${l.loja_codigo_raw}  ordem=${l.carro_ordem}`)

    const paradas: any[] = []
    for (const v of veiculos) {
      if (!variantes.includes(v.placa_norm)) continue
      for (const p of v.paradas) paradas.push({ ...p, placa_norm: v.placa_norm })
    }
    console.log(`GPS (${paradas.length} paradas):`)
    for (const p of paradas) {
      console.log(`  [${p.placa_norm}] ${fmtT(p.chegada)}-${fmtT(p.saida)} cls=${p.classificacao.padEnd(10)} cod=${(p.codigo_loja||'---').padEnd(8)} nome=${(p.nome_loja||'').slice(0,30).padEnd(30)} local=${(p.local_parada||'').slice(0,25)}`)
    }
  }

  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
