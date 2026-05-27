/**
 * Verifica se as 2 paradas LOJA 04:47 cod=9039030 sao duplicatas exatas (uma do XLSX, outra do PDF)
 * e se passam pelo consolidador/dedup.
 */
import { readFileSync, readdirSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { variantesOcr } from '@/lib/kpi/matcher'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'

;(async () => {
  const dia = '19'
  const pasta = `${BASE}/ESCALA DIA ${dia}`
  const PLACA = 'LQE5401'

  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))

  console.log('--- VEICULOS XLSX ---')
  if (xlsxFile) {
    const vXlsx = await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`))
    const v = vXlsx.find(v => variantesOcr(PLACA).includes(v.placa_norm))
    if (v) {
      const lojas = v.paradas.filter(p => p.classificacao === 'LOJA')
      console.log(`  ${lojas.length} paradas LOJA da placa ${PLACA}:`)
      for (const p of lojas) {
        console.log(`    chegada=${p.chegada} saida=${p.saida} dur=${p.duracao_seg}s cod=${p.codigo_loja} "${p.nome_loja}"`)
      }
    }
  }

  console.log('\n--- VEICULOS PDF ---')
  if (pdfFile) {
    const vPdf = await parseUnitracPdf(readFileSync(`${pasta}/${pdfFile}`), new Set()).catch(() => [])
    const v = vPdf.find(v => variantesOcr(PLACA).includes(v.placa_norm))
    if (v) {
      const lojas = v.paradas.filter(p => p.classificacao === 'LOJA')
      console.log(`  ${lojas.length} paradas LOJA da placa ${PLACA}:`)
      for (const p of lojas) {
        console.log(`    chegada=${p.chegada} saida=${p.saida} dur=${p.duracao_seg}s cod=${p.codigo_loja} "${p.nome_loja}"`)
      }
    }
  }

  process.exit(0)
})()
