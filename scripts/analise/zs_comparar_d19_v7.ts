import { lerKpi, normLoja } from './_lib/ler-kpi'

const MAN = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/KPI ZONA SUL-MANUAL.xlsx'
const GER = 'C:/Users/media/Downloads/KPI-ZONA_SUL-2026-05-19 (7).xlsx'

;(async () => {
  const manual = await lerKpi(MAN, '19')
  const gerado = await lerKpi(GER)
  const mByLoja = new Map(manual.map(l => [normLoja(l.loja), l]))
  const gByLoja = new Map(gerado.map(l => [normLoja(l.loja), l]))
  let ok = 0, parcial = 0, errado = 0, soM = 0, soG = 0
  for (const [k, m] of mByLoja) {
    const g = gByLoja.get(k)
    if (!g) { console.log(`  ❓ SÓ MAN: ${m.loja.slice(0,42).padEnd(42)} man=${m.sc1}/${m.chd1}/${m.sl1}`); soM++; continue }
    const sys = `${g.sc1}/${g.chd1}/${g.sl1}`
    const man = `${m.sc1}/${m.chd1}/${m.sl1}`
    const naoFoi = m.chd1 === '---' || /N[aã]o|FOI /i.test(m.chd1 ?? '') || /SEM/i.test(m.sc1 ?? '')
    const sysSem = g.chd1 === '---' || !g.chd1 || /SEM/i.test(g.sc1 ?? '')
    if (naoFoi) {
      if (sysSem) { ok++; console.log(`  ✅ ${m.loja.slice(0,42).padEnd(42)} ambos sem entrega`) }
      else { errado++; console.log(`  ⚠️ ${m.loja.slice(0,42).padEnd(42)} sys=${sys} (manual=NÃO_FOI) — conflito GPS`) }
      continue
    }
    const chdMatch = g.chd1 === m.chd1
    const slMatch = g.sl1 === m.sl1
    if (chdMatch && slMatch) { ok++; console.log(`  ✅ ${m.loja.slice(0,42).padEnd(42)} ${sys}`) }
    else if (sysSem) { errado++; console.log(`  ❌ ${m.loja.slice(0,42).padEnd(42)} sys=---  man=${man}`) }
    else {
      const toMin = (t: string) => { const x = t?.match(/(\d+):(\d+)/); return x ? parseInt(x[1])*60+parseInt(x[2]) : null }
      const dChd = toMin(g.chd1) !== null && toMin(m.chd1) !== null ? Math.abs(toMin(g.chd1)! - toMin(m.chd1)!) : null
      const dSl = toMin(g.sl1) !== null && toMin(m.sl1) !== null ? Math.abs(toMin(g.sl1)! - toMin(m.sl1)!) : null
      if (dChd !== null && dSl !== null && dChd <= 5 && dSl <= 10) {
        parcial++; console.log(`  ⚠️ ${m.loja.slice(0,42).padEnd(42)} sys=${sys}  man=${man}  (ΔCHD=${dChd}min ΔSL=${dSl}min)`)
      } else {
        errado++; console.log(`  ❌ ${m.loja.slice(0,42).padEnd(42)} sys=${sys}  man=${man}`)
      }
    }
  }
  for (const [k, g] of gByLoja) if (!mByLoja.has(k)) { soG++; console.log(`  ❓ SÓ GER: ${g.loja.slice(0,42).padEnd(42)} sys=${g.sc1}/${g.chd1}/${g.sl1}`) }
  console.log(`\n  ✅ ${ok}  ⚠️ ${parcial}  ❌ ${errado}  só_man=${soM}  só_ger=${soG}`)
})()
