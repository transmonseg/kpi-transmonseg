/**
 * Compara o XLSX e o PDF do Unitrac do MESMO DIA 19.
 * Pra ver se um tem informação que o outro não tem.
 * E se o parser está perdendo dados.
 */
import { readFileSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'

;(async () => {
  console.log('═══ XLSX (relatorio_9391) ═══')
  const xlsx = await parseUnitrac(readFileSync(BASE + '/relatorio_9391.xlsx'))
  console.log(`Veículos: ${xlsx.length}`)
  const placasXlsx = new Set(xlsx.map(v => v.placa_norm))
  console.log(`Placas únicas: ${placasXlsx.size}`)

  console.log('\n═══ PDF (relatorio_9572) ═══')
  const pdf = await parseUnitracPdf(readFileSync(BASE + '/relatorio_9572.pdf'), new Set())
  console.log(`Veículos: ${pdf.length}`)
  const placasPdf = new Set(pdf.map(v => v.placa_norm))
  console.log(`Placas únicas: ${placasPdf.size}`)

  console.log('\n═══ DIFERENÇAS DE PLACAS ═══')
  const soXlsx = [...placasXlsx].filter(p => !placasPdf.has(p))
  const soPdf = [...placasPdf].filter(p => !placasXlsx.has(p))
  console.log(`Só no XLSX (não estão no PDF): ${soXlsx.length}`)
  if (soXlsx.length > 0) console.log('  ' + soXlsx.join(', '))
  console.log(`Só no PDF (não estão no XLSX): ${soPdf.length}`)
  if (soPdf.length > 0) console.log('  ' + soPdf.join(', '))

  console.log('\n═══ DIFERENÇAS DE PARADAS POR PLACA ═══')
  // Pra cada placa em ambos, comparar número de paradas
  let diffParadas = 0
  for (const placa of placasXlsx) {
    if (!placasPdf.has(placa)) continue
    const vx = xlsx.find(v => v.placa_norm === placa)!
    const vp = pdf.find(v => v.placa_norm === placa)!
    if (vx.paradas.length !== vp.paradas.length) {
      diffParadas++
      if (diffParadas <= 10) {
        console.log(`  ${placa}: XLSX=${vx.paradas.length}p, PDF=${vp.paradas.length}p`)
      }
    }
  }
  console.log(`Total de placas com nº de paradas diferentes: ${diffParadas}`)

  console.log('\n═══ AMOSTRA: comparação detalhada de 1 placa ═══')
  // Pegar uma placa com diferença
  const placaAmostra = 'LQU5546' // INACIO ARAUJO - a placa que vimos antes
  const vx = xlsx.find(v => v.placa_norm === placaAmostra)
  const vp = pdf.find(v => v.placa_norm === placaAmostra)
  function fmt(d: Date | null | undefined): string {
    if (!d) return '---'
    return String(d.getUTCHours()).padStart(2,'0') + ':' + String(d.getUTCMinutes()).padStart(2,'0')
  }
  if (vx && vp) {
    console.log(`\n--- ${placaAmostra} XLSX (${vx.paradas.length}p) ---`)
    for (const p of [...vx.paradas].sort((a, b) => +new Date(a.chegada) - +new Date(b.chegada))) {
      console.log(`  [${p.classificacao.padEnd(10)}] ${fmt(p.chegada)}-${fmt(p.saida)} cod=${p.codigo_loja ?? '-'} | ${(p.nome_loja ?? p.local_parada ?? '').slice(0,60)}`)
    }
    console.log(`\n--- ${placaAmostra} PDF (${vp.paradas.length}p) ---`)
    for (const p of [...vp.paradas].sort((a, b) => +new Date(a.chegada) - +new Date(b.chegada))) {
      console.log(`  [${p.classificacao.padEnd(10)}] ${fmt(p.chegada)}-${fmt(p.saida)} cod=${p.codigo_loja ?? '-'} | ${(p.nome_loja ?? p.local_parada ?? '').slice(0,60)}`)
    }
  }
})()
