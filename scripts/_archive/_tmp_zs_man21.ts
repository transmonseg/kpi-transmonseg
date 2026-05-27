import { lerKpi } from './_lib/ler-kpi'

;(async () => {
  const linhas = await lerKpi('C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/KPI ZONA SUL-MANUAL.xlsx', '21')
  console.log(`Linhas manual ZS dia 21: ${linhas.length}`)
  for (const l of linhas) {
    console.log(`  loja="${l.loja}" sc1="${l.sc1}" chd1="${l.chd1}" sl1="${l.sl1}"`)
  }
})()
