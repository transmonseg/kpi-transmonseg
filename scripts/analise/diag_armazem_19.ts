import ExcelJS from 'exceljs'
import { lerKpi, normLoja } from './_lib/ler-kpi'

const MAN = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/KPI-ARMAZEM_GRAO-MANUAL.xlsx'
const GER = 'C:/Users/media/Downloads/KPI-ARMAZEM_GRAO-2026-05-19 (3).xlsx'

;(async () => {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(MAN)
  console.log('Abas manual:', wb.worksheets.map(w => w.name).join(', '))

  // Tenta achar aba "19"
  const aba = wb.worksheets.find(w => w.name === '19' || w.name === '19.05' || w.name.startsWith('19'))
  if (!aba) { console.log('Aba 19 não achada'); return }
  console.log(`Aba escolhida: ${aba.name}`)

  const manual = await lerKpi(MAN, aba.name)
  const gerado = await lerKpi(GER)

  console.log(`\nManual: ${manual.length} linhas | Gerado: ${gerado.length} linhas\n`)

  console.log('═══ MANUAL ═══')
  manual.forEach((l, i) => console.log(`  ${i+1}. ${l.loja.slice(0, 45).padEnd(45)} placa=${l.placa1.padEnd(10)} SC=${l.sc1} CHD=${l.chd1} SL=${l.sl1}`))

  console.log('\n═══ GERADO ═══')
  gerado.forEach((l, i) => console.log(`  ${i+1}. ${l.loja.slice(0, 45).padEnd(45)} placa=${l.placa1.padEnd(10)} SC=${l.sc1} CHD=${l.chd1} SL=${l.sl1}`))

  console.log('\n═══ COMPARAÇÃO POR LOJA ═══')
  const mByLoja = new Map(manual.map(l => [normLoja(l.loja), l]))
  const gByLoja = new Map(gerado.map(l => [normLoja(l.loja), l]))
  for (const [k, m] of mByLoja) {
    const g = gByLoja.get(k)
    if (!g) {
      console.log(`  [SÓ MANUAL] ${m.loja} — ${m.sc1}/${m.chd1}/${m.sl1}`)
      continue
    }
    const same = m.sc1 === g.sc1 && m.chd1 === g.chd1 && m.sl1 === g.sl1
    if (same) console.log(`  ✅ ${m.loja.slice(0, 40).padEnd(40)} ${m.sc1}/${m.chd1}/${m.sl1}`)
    else console.log(`  ❌ ${m.loja.slice(0, 40).padEnd(40)} man=${m.sc1}/${m.chd1}/${m.sl1}  ger=${g.sc1}/${g.chd1}/${g.sl1}  placa man=${m.placa1} ger=${g.placa1}`)
  }
  for (const [k, g] of gByLoja) {
    if (!mByLoja.has(k)) console.log(`  [SÓ GERADO] ${g.loja}`)
  }
})()
