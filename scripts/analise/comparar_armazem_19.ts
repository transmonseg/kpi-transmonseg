import { lerKpi, normLoja } from './_lib/ler-kpi'

const MAN = 'C:/Users/media/Downloads/KPI ARMAZEM DO GRAO.xlsx'

async function comparar(genPath: string, label: string) {
  console.log(`\n═══ ${label}  vs  manual aba 19 ═══`)
  const manual = await lerKpi(MAN, '19')
  const gerado = await lerKpi(genPath)
  const mByLoja = new Map(manual.map(l => [normLoja(l.loja), l]))
  const gByLoja = new Map(gerado.map(l => [normLoja(l.loja), l]))
  let okN = 0, diffN = 0
  for (const [k, m] of mByLoja) {
    const g = gByLoja.get(k)
    if (!g) { console.log(`  ❓ SÓ MANUAL: ${m.loja}`); continue }
    const same = m.sc1 === g.sc1 && m.chd1 === g.chd1 && m.sl1 === g.sl1
    if (same) { okN++; console.log(`  ✅ ${m.loja.slice(0, 38).padEnd(38)} ${m.sc1}/${m.chd1}/${m.sl1}`) }
    else { diffN++; console.log(`  ❌ ${m.loja.slice(0, 38).padEnd(38)} man=${m.sc1}/${m.chd1}/${m.sl1}  ger=${g.sc1}/${g.chd1}/${g.sl1}`) }
  }
  for (const [k, g] of gByLoja) if (!mByLoja.has(k)) console.log(`  ❓ SÓ GERADO: ${g.loja}`)
  console.log(`\n  total: ${okN} ✅  |  ${diffN} ❌`)
}

;(async () => {
  await comparar('C:/Users/media/Downloads/KPI-ARMAZEM_GRAO-2026-05-19 (5).xlsx', 'GERADO (5) — antes fix T18')
  // (6) ainda não existe — só gera após user regenerar
  try {
    await comparar('C:/Users/media/Downloads/KPI-ARMAZEM_GRAO-2026-05-19 (6).xlsx', 'GERADO (6) — após fix T18')
  } catch (e: any) {
    console.log(`\n(6).xlsx ainda não existe — aguardando regeração`)
  }
})()
