import { lerKpi } from './_lib/ler-kpi'

;(async () => {
  const path = 'C:/Users/media/Downloads/teste dia 21/KPI-ARMAZEM_GRAO-2026-05-21 (3).xlsx'
  const linhas = await lerKpi(path)
  console.log(`Linhas: ${linhas.length}`)
  for (const l of linhas) {
    console.log(`  ${l.loja.slice(0,35).padEnd(35)}  sc=${l.sc1}  chd=${l.chd1}  sl=${l.sl1}`)
  }
})()
