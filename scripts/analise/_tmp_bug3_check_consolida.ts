/**
 * Vou simular EXATAMENTE o que o matcher recebe — usa cruzaEscalaUnitrac
 * com mock minimal e olha as paradas pos-consolidacao via debugging interno.
 *
 * Estrategia: instrumenta o matcher trocando o filtrarParadaNocturnaSolitaria
 * pra logar.
 */
import { readFileSync, readdirSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { variantesOcr } from '@/lib/kpi/matcher'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

function fmtT(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}:${String(dt.getUTCSeconds()).padStart(2,'0')}`
}

;(async () => {
  const dia = '19'
  const pasta = `${BASE}/ESCALA DIA ${dia}`
  const PLACA = 'LQE5401'

  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
  let veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))
  if (pdfFile) veiculos.push(...await parseUnitracPdf(readFileSync(`${pasta}/${pdfFile}`), new Set()).catch(() => []))

  const paradas: any[] = []
  for (const v of veiculos) for (const p of v.paradas) paradas.push({ ...p, placa_norm: v.placa_norm, id: `${v.placa_norm}-${paradas.length}` })

  const variantes = new Set(variantesOcr(PLACA))
  const paradasPlaca = paradas.filter(p => variantes.has(p.placa_norm))
  console.log(`Total paradas placa: ${paradasPlaca.length} (LOJA: ${paradasPlaca.filter((p:any) => p.classificacao === 'LOJA').length})`)

  // Inspeciona dados crus
  console.log(`\n--- Dados crus LOJA (antes do matcher) ---`)
  for (const p of paradasPlaca.filter((p:any) => p.classificacao === 'LOJA')) {
    console.log(`  chegada=${p.chegada} (${typeof p.chegada}) saida=${p.saida} cod=${p.codigo_loja}`)
  }
  process.exit(0)
})()
