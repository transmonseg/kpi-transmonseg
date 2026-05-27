import { readFileSync, readdirSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

function fmtT(d: Date | string | null): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}`
}

;(async () => {
  const pasta21 = `${BASE}/ESCALA DIA 21`
  const files = readdirSync(pasta21)
  const armFile = files.find(f => /ARMAZ.M.*GR.O/i.test(f) && f.endsWith('.xlsx'))!

  const escala = await parseEscalaArmazemGrao(readFileSync(`${pasta21}/${armFile}`), '2026-05-21')
  console.log(`Escala ARMAZEM dia 21: ${escala.length} linhas`)
  for (const l of escala) {
    console.log(`  ${(l.loja_nome_raw || '').padEnd(35)}  placa=${(l.placa_norm || '').padEnd(10)}  data=${l.data_entrega}`)
  }

  console.log('\n═══ 16 DE MARÇO ═══')
  const lin16 = escala.find(l => /16.*MAR/i.test(l.loja_nome_raw || ''))
  console.log(`Escala line: placa=${lin16?.placa_norm}  data_entrega=${lin16?.data_entrega}`)

  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
  let veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta21}/${xlsxFile}`)))
  if (pdfFile) veiculos.push(...await parseUnitracPdf(readFileSync(`${pasta21}/${pdfFile}`), new Set()).catch(() => []))

  const v = veiculos.find(v => v.placa_norm === lin16?.placa_norm)
  if (v) {
    console.log(`\nGPS ${v.placa_norm} dia 21 — todas paradas LOJA/FORA:`)
    for (const p of v.paradas) {
      if (p.classificacao === 'BASE' || p.classificacao === 'FAKE_EXIT') continue
      console.log(`  ${fmtT(p.chegada)} → ${fmtT(p.saida)}  ${p.classificacao.padEnd(10)}  local=${p.local_parada?.slice(0,60)}`)
    }
  } else {
    console.log(`\nPlaca ${lin16?.placa_norm} não encontrada no GPS dia 21!`)
  }

  // Pesquisa também por placas que GPS-day-21 mostra parando em 16 DE MARÇO
  console.log('\n═══ Quem foi em 16 DE MARÇO no GPS dia 21? ═══')
  for (const v of veiculos) {
    const stops16 = v.paradas.filter((p: any) => /16.*MAR/i.test(p.local_parada || '') || /16.*MAR/i.test(p.nome_loja || ''))
    if (stops16.length) {
      console.log(`  ${v.placa_norm}:`)
      for (const p of stops16) console.log(`    ${fmtT(p.chegada)} → ${fmtT(p.saida)}  local=${p.local_parada?.slice(0,50)}`)
    }
  }

  // E no dia 20?
  console.log('\n═══ Quem foi em 16 DE MARÇO no GPS dia 20? ═══')
  const pasta20 = `${BASE}/ESCALA DIA 20`
  const files20 = readdirSync(pasta20)
  const xlsxFile20 = files20.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile20 = files20.find(f => /relatorio.*\.pdf$/i.test(f))
  let veic20: any[] = []
  if (xlsxFile20) veic20.push(...await parseUnitrac(readFileSync(`${pasta20}/${xlsxFile20}`)))
  if (pdfFile20) veic20.push(...await parseUnitracPdf(readFileSync(`${pasta20}/${pdfFile20}`), new Set()).catch(() => []))
  for (const v of veic20) {
    const stops16 = v.paradas.filter((p: any) => /16.*MAR/i.test(p.local_parada || '') || /16.*MAR/i.test(p.nome_loja || ''))
    if (stops16.length) {
      console.log(`  ${v.placa_norm}:`)
      for (const p of stops16) console.log(`    ${fmtT(p.chegada)} → ${fmtT(p.saida)}  local=${p.local_parada?.slice(0,50)}`)
    }
  }
})()
