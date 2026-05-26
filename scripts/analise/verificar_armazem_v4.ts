import { lerKpi } from './_lib/ler-kpi'

;(async () => {
  const kpi = await lerKpi('C:/Users/media/Downloads/KPI-ARMAZEM_GRAO-2026-05-19 (4).xlsx')
  console.log(`KPI ARMAZEM dia 19 (4) — ${kpi.length} linhas:\n`)
  for (const l of kpi) {
    console.log(`  ${l.loja.padEnd(45)} placa=${l.placa1.padEnd(10)} SC=${l.sc1} CHD=${l.chd1} SL=${l.sl1}`)
  }
})()
