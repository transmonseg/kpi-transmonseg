import { config } from 'dotenv'; config({ path: '.env.local' })
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const req = createRequire(import.meta.url)
const XLSX = req('xlsx')
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const DL = 'C:/Users/media/Downloads'

async function main() {
  // 1) Documento: GB Campo Grande (Guanabara 71xxx)
  const rows = XLSX.utils.sheet_to_json(XLSX.readFile(`${DL}/unitrac_pontointeresse_consulta (6) (2).xls`).Sheets['Consulta'], { defval: null })
  console.log('=== Documento: Guanabara / Campo Grande ===')
  for (const r of rows.filter((r: any) => /GUANABARA|GB |CAMPO GRANDE/i.test(String(r.PONTO)) && /^71/.test(String(r.IDENTIFICADOR)))) console.log(`   ${r.IDENTIFICADOR}  ${r.PONTO}  | ${r.LATITUDE},${r.LONGITUDE}`)
  const c11 = rows.find((r: any) => String(r.IDENTIFICADOR) === '71011')
  console.log('   → 71011 (nosso cadastro):', c11 ? `${c11.PONTO} ${c11.LATITUDE},${c11.LONGITUDE}` : 'NÃO existe no documento!')

  // 2) Relatório: placas + janela de tempo + procurar LCO/KNI
  const vs = await parseUnitracPdf(readFileSync(`${DL}/relatorio_10122.pdf`), new Set())
  const placas = vs.map(v => v.placa_norm).sort()
  let min = '99', max = '00'
  for (const v of vs) for (const p of v.paradas) { const h = p.chegada.toISOString().slice(11, 16); if (h < min) min = h; if (h > max) max = h }
  console.log(`\n=== Relatório relatorio_10122 ===`)
  console.log(`Placas: ${placas.length} | janela de horários: ${min} → ${max}`)
  console.log('Placas tipo LCO / LC / KNI:', placas.filter(p => /^L[CO]|^KN/.test(p)).join(', ') || '(nenhuma)')
  // paradas LOJA com Leblon/Zona Sul ou Campo Grande no nome
  console.log('\nParadas com "LEBLON" / "CAMPO GRANDE" no relatório:')
  for (const v of vs) for (const p of v.paradas) if (/LEBLON|CAMPO GRANDE/i.test(String(p.nome_loja))) console.log(`   placa ${v.placa_norm} [${p.classificacao}] cod=${p.codigo_loja} "${p.nome_loja}" ${p.chegada.toISOString().slice(11,16)}`)
}
main().catch(e => { console.error(e); process.exit(1) })
