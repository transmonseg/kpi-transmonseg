import { lerKpi, normLoja } from './_lib/ler-kpi'

;(async () => {
  const linhas = await lerKpi('C:/Users/media/Downloads/KPI-GUANABARA-2026-05-19 (6).xlsx')
  console.log(`Linhas lidas do KPI gerado: ${linhas.length}`)
  for (const l of linhas) {
    console.log(`  loja="${l.loja.slice(0, 40)}"  placa=${l.placa1}  SC=${l.sc1} CHD=${l.chd1} SL=${l.sl1}`)
  }
  console.log(`\nNormalizado primeiro nome: "${normLoja(linhas[0].loja)}"`)
})()
