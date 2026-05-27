/**
 * Diagnose ASSAI Caxias II dia 19 — Manual 05:05/08:45 vs Sys 11:56/13:32
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
  return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}`
}

;(async () => {
  const dia = '19'
  const data = `2026-05-${dia}`
  const pasta = `${BASE}/ESCALA DIA ${dia}`

  // Buscar todas linhas ASSAI dia 19 pra Caxias II (cod 338) ou ASSAI Santa Cruz 2 (similar)
  const { data: linhas } = await sb
    .from('escala_linhas')
    .select('id, rede_id, placa_norm, loja_nome_raw, loja_codigo_raw, motorista_nome, carro_ordem, data_entrega, sub_rede')
    .eq('data_entrega', data)
    .eq('rede_id', 'ASSAI')
    .or('loja_codigo_raw.eq.338,loja_nome_raw.ilike.%CAXIAS II%,loja_nome_raw.ilike.%PARQUE FLUMINENSE%,loja_codigo_raw.eq.343,loja_nome_raw.ilike.%SANTA CRUZ%')

  console.log(`--- ESCALAS Caxias II / Santa Cruz 2 dia 19 ---`)
  for (const l of (linhas || [])) {
    console.log(`  placa=${l.placa_norm} ordem=${l.carro_ordem} cod=${l.loja_codigo_raw} loja="${l.loja_nome_raw}"`)
  }

  if (!linhas?.length) return

  // Pega placas envolvidas
  const placas = [...new Set(linhas.map(l => l.placa_norm).filter(Boolean) as string[])]
  console.log(`\n--- PLACAS envolvidas: ${placas.join(', ')} ---`)

  // GPS
  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
  let veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))
  if (pdfFile) veiculos.push(...await parseUnitracPdf(readFileSync(`${pasta}/${pdfFile}`), new Set()).catch(() => []))

  const paradas: any[] = []
  for (const v of veiculos) for (const p of v.paradas) paradas.push({ ...p, placa_norm: v.placa_norm, id: `${v.placa_norm}-${paradas.length}` })

  for (const pl of placas) {
    console.log(`\n--- PARADAS placa ${pl} ---`)
    const variantes = new Set(variantesOcr(pl))
    const pas = paradas.filter(p => variantes.has(p.placa_norm))
    for (const p of pas.sort((a:any,b:any) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime())) {
      const isCax = /CAXIAS|FLUMINENSE/i.test((p as any).local_parada || (p as any).nome_loja || '')
      console.log(`  ${fmtT(p.chegada)}-${fmtT(p.saida)} class=${p.classificacao.padEnd(10)} cod=${((p as any).codigo_loja||'-').padEnd(10)} ${isCax?'*':' '} "${((p as any).nome_loja || (p as any).local_parada || '').slice(0,60)}"`)
    }
    // Linhas ASSAI dessa placa
    const linhasAssai = await sb
      .from('escala_linhas')
      .select('id, loja_codigo_raw, loja_nome_raw, carro_ordem')
      .eq('data_entrega', data)
      .eq('rede_id', 'ASSAI')
      .eq('placa_norm', pl)
    console.log(`     ESCALA ASSAI desta placa:`)
    for (const l of (linhasAssai.data || [])) console.log(`       ordem=${l.carro_ordem} cod=${l.loja_codigo_raw} loja="${l.loja_nome_raw}"`)
  }

  process.exit(0)
})()
