/**
 * Varredura: pra cada PDF de cada dia, compara o número de paradas declarado
 * no header (qtd_paradas do Unitrac) vs o que o parser realmente extraiu.
 * Identifica padrões de perda.
 */
import { readFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const DIAS: Array<{ dia: string; pdf: string }> = [
  { dia: '18', pdf: `${BASE}/ESCALA DIA 18/relatorio_9401.pdf` },
  { dia: '19', pdf: `${BASE}/ESCALA DIA 19/relatorio_9572.pdf` },
  { dia: '20', pdf: `${BASE}/ESCALA DIA 20/relatorio_9522.pdf` },
  { dia: '21', pdf: `${BASE}/ESCALA DIA 21/relatorio_9553.pdf` },
  { dia: '22', pdf: `${BASE}/ESCALA DIA 22/relatorio_9589 (1).pdf` },
]

;(async () => {
  let totalPlacas = 0
  let totalCorretas = 0
  let totalPerdidas = 0
  const placasPerdidas: Array<{dia: string, placa: string, declarado: number, extraido: number}> = []

  for (const { dia, pdf } of DIAS) {
    try {
      const veiculos = await parseUnitracPdf(readFileSync(pdf), new Set())
      let perdidas = 0
      let extraNoParser = 0
      let corretas = 0
      for (const v of veiculos) {
        totalPlacas++
        const diff = v.qtd_paradas - v.paradas.length
        if (diff === 0) { corretas++; totalCorretas++ }
        else if (diff > 0) {
          perdidas++
          totalPerdidas++
          placasPerdidas.push({ dia, placa: v.placa_norm, declarado: v.qtd_paradas, extraido: v.paradas.length })
        } else extraNoParser++  // parser tem mais que o header (improvável)
      }
      console.log(`Dia ${dia}: ${veiculos.length} placas | OK ${corretas} | perdidas ${perdidas} | extra ${extraNoParser}`)
    } catch (e: any) {
      console.log(`Dia ${dia}: ERRO ${e.message}`)
    }
  }

  console.log(`\n═══ TOTAL ═══`)
  console.log(`  Placas: ${totalPlacas} | OK: ${totalCorretas} | Perdidas: ${totalPerdidas}`)
  console.log(`\n═══ TOP 30 placas com mais paradas perdidas ═══`)
  placasPerdidas
    .sort((a, b) => (b.declarado - b.extraido) - (a.declarado - a.extraido))
    .slice(0, 30)
    .forEach(p => console.log(`  dia${p.dia} ${p.placa}: declarado=${p.declarado} extraído=${p.extraido} (perdeu ${p.declarado - p.extraido})`))
})()
