import { readFileSync } from 'fs'
import * as XLSX from 'xlsx'
import { lerKpi, normLoja } from './_lib/ler-kpi'

const MAN = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/KPI ZONA SUL-MANUAL.xlsx'
const GER = 'C:/Users/media/Downloads/KPI-ZONA_SUL-2026-05-19 (6).xlsx'

;(async () => {
  // Lista abas do manual
  const wb = XLSX.read(readFileSync(MAN), { type: 'buffer' })
  console.log('Abas manual ZONA SUL:', wb.SheetNames)
  console.log()

  // Tenta achar aba 19
  const abaCandidata = wb.SheetNames.find(n => /^19/.test(n) || n === '19' || n === '19.05')
  if (!abaCandidata) {
    console.log('Nenhuma aba "19" encontrada')
    return
  }
  console.log(`Usando aba: ${abaCandidata}\n`)

  const manual = await lerKpi(MAN, abaCandidata)
  const gerado = await lerKpi(GER)

  const mByLoja = new Map(manual.map(l => [normLoja(l.loja), l]))
  const gByLoja = new Map(gerado.map(l => [normLoja(l.loja), l]))

  let ok = 0, parcial = 0, errado = 0, soManual = 0, soGerado = 0
  console.log('═══ MANUAL vs GERADO ═══\n')
  for (const [k, m] of mByLoja) {
    const g = gByLoja.get(k)
    if (!g) { console.log(`  ❓ SÓ MANUAL: ${m.loja.slice(0, 45).padEnd(45)} man=${m.sc1}/${m.chd1}/${m.sl1}`); soManual++; continue }
    const sys = `${g.sc1}/${g.chd1}/${g.sl1}`
    const man = `${m.sc1}/${m.chd1}/${m.sl1}`
    const naoFoi = m.chd1 === '---' || m.chd1 === '' || /N[aã]o/i.test(m.chd1 ?? '') || /SEM/i.test(m.sc1 ?? '')
    const sysSem = g.chd1 === '---' || !g.chd1
    if (naoFoi) {
      if (sysSem) { ok++; console.log(`  ✅ ${m.loja.slice(0, 45).padEnd(45)} ambos sem entrega`) }
      else { errado++; console.log(`  ⚠️ ${m.loja.slice(0, 45).padEnd(45)} sys=${sys} (manual=NÃO_FOI) — sys diz FOI`) }
      continue
    }
    const chdMatch = g.chd1 === m.chd1
    const slMatch = g.sl1 === m.sl1
    if (chdMatch && slMatch) { ok++; console.log(`  ✅ ${m.loja.slice(0, 45).padEnd(45)} ${sys}`) }
    else if (sysSem) { errado++; console.log(`  ❌ ${m.loja.slice(0, 45).padEnd(45)} sys=---  man=${man}`) }
    else {
      const toMin = (t: string) => { const x = t?.match(/(\d+):(\d+)/); return x ? parseInt(x[1])*60+parseInt(x[2]) : null }
      const dChd = toMin(g.chd1) !== null && toMin(m.chd1) !== null ? Math.abs(toMin(g.chd1)! - toMin(m.chd1)!) : null
      const dSl = toMin(g.sl1) !== null && toMin(m.sl1) !== null ? Math.abs(toMin(g.sl1)! - toMin(m.sl1)!) : null
      if (dChd !== null && dSl !== null && dChd <= 5 && dSl <= 10) {
        parcial++; console.log(`  ⚠️ ${m.loja.slice(0, 45).padEnd(45)} sys=${sys}  man=${man}  (ΔCHD=${dChd}min ΔSL=${dSl}min)`)
      } else {
        errado++; console.log(`  ❌ ${m.loja.slice(0, 45).padEnd(45)} sys=${sys}  man=${man}`)
      }
    }
  }
  for (const [k, g] of gByLoja) if (!mByLoja.has(k)) { console.log(`  ❓ SÓ GERADO: ${g.loja.slice(0,45).padEnd(45)} sys=${g.sc1}/${g.chd1}/${g.sl1}`); soGerado++ }

  console.log(`\n═══ Resultado ═══`)
  console.log(`  ✅ ${ok} batendo`)
  console.log(`  ⚠️ ${parcial} próximo (≤5min CHD, ≤10min SL)`)
  console.log(`  ❌ ${errado} errado`)
  console.log(`  ❓ ${soManual} só manual + ${soGerado} só gerado`)
})()
