/**
 * Roda a comparação XLSX vs PDF em vários dias e agrupa as diferenças.
 */
import { readFileSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'

const DIAS: Array<{ dia: string; xlsx: string; pdf: string }> = [
  { dia: '18', xlsx: `${BASE}/ESCALA DIA 18/relatorio_9402.xlsx`, pdf: `${BASE}/ESCALA DIA 18/relatorio_9401.pdf` },
  { dia: '19', xlsx: `${BASE}/ESCALA DIA 19/relatorio_9391.xlsx`, pdf: `${BASE}/ESCALA DIA 19/relatorio_9572.pdf` },
  { dia: '20', xlsx: `${BASE}/ESCALA DIA 20/relatorio_9573.xlsx`, pdf: `${BASE}/ESCALA DIA 20/relatorio_9522.pdf` },
  { dia: '21', xlsx: `${BASE}/ESCALA DIA 21/relatorio_9552.xlsx`, pdf: `${BASE}/ESCALA DIA 21/relatorio_9553.pdf` },
  { dia: '22', xlsx: `${BASE}/ESCALA DIA 22/relatorio_9588.xlsx`, pdf: `${BASE}/ESCALA DIA 22/relatorio_9589 (1).pdf` },
]

function fmtHHMM(d: Date | null | undefined): string {
  if (!d) return '---'
  return String(d.getUTCHours()).padStart(2,'0') + ':' + String(d.getUTCMinutes()).padStart(2,'0')
}

;(async () => {
  // Padrões agregados de classes diferentes
  const classDifGlobal: Array<{dia:string, placa:string, hora:string, xc:string, pc:string, localXc?:string, localPc?:string}> = []
  const codDifGlobal: Array<{dia:string, placa:string, hora:string, xc:string|null, pc:string|null}> = []
  const lojaPerdidaPdf: Array<{dia:string, placa:string, hora:string, codX:string|null, nomeX:string|null}> = []

  for (const {dia, xlsx, pdf} of DIAS) {
    console.log(`\n═══ DIA ${dia} ═══`)
    let vxlsx, vpdf
    try {
      vxlsx = await parseUnitrac(readFileSync(xlsx))
      vpdf = await parseUnitracPdf(readFileSync(pdf), new Set())
    } catch (e: any) {
      console.log(`  ERRO: ${e.message}`)
      continue
    }
    console.log(`  XLSX: ${vxlsx.length} veículos | PDF: ${vpdf.length} veículos`)

    const byPlaca = new Map<string, {x?:any, p?:any}>()
    for (const v of vxlsx) byPlaca.set(v.placa_norm, { x: v })
    for (const v of vpdf) {
      const c = byPlaca.get(v.placa_norm) ?? {}
      c.p = v
      byPlaca.set(v.placa_norm, c)
    }

    let placasComLojaDif = 0
    let placasComClassDif = 0
    let totalLojasPerdidasPdf = 0
    let totalLojasPdfClassErrada = 0

    for (const [placa, {x, p}] of byPlaca) {
      if (!x || !p) continue

      const xMap = new Map<string, any>(x.paradas.map((par: any) => [`${fmtHHMM(par.chegada)}`, par]))
      const pMap = new Map<string, any>(p.paradas.map((par: any) => [`${fmtHHMM(par.chegada)}`, par]))

      let placaTemLojaDif = false
      let placaTemClassDif = false

      for (const [k, xpar] of xMap) {
        const ppar = pMap.get(k)
        if (!ppar) continue

        if (xpar.classificacao !== ppar.classificacao) {
          placaTemClassDif = true
          classDifGlobal.push({dia, placa, hora:k, xc:xpar.classificacao, pc:ppar.classificacao, localXc:xpar.local_parada?.slice(0,40), localPc:ppar.local_parada?.slice(0,40)})
          if (xpar.classificacao === 'LOJA' && ppar.classificacao !== 'LOJA') {
            totalLojasPdfClassErrada++  // PDF perdeu uma LOJA
          }
        }

        if ((xpar.codigo_loja ?? null) !== (ppar.codigo_loja ?? null)) {
          placaTemLojaDif = true
          codDifGlobal.push({dia, placa, hora:k, xc:xpar.codigo_loja, pc:ppar.codigo_loja})
          if (xpar.codigo_loja && !ppar.codigo_loja) {
            lojaPerdidaPdf.push({dia, placa, hora:k, codX:xpar.codigo_loja, nomeX:xpar.nome_loja})
            totalLojasPerdidasPdf++
          }
        }
      }
      if (placaTemLojaDif) placasComLojaDif++
      if (placaTemClassDif) placasComClassDif++
    }

    console.log(`  Placas com classificação diferente: ${placasComClassDif}`)
    console.log(`  Placas com código de loja diferente: ${placasComLojaDif}`)
    console.log(`  LOJAS que XLSX achou e PDF perdeu/classificou errado: ${totalLojasPerdidasPdf}+${totalLojasPdfClassErrada}`)
  }

  // Sumário global
  console.log(`\n═══════════════════════════════════════════`)
  console.log(`SUMÁRIO GLOBAL (5 dias)`)
  console.log(`═══════════════════════════════════════════`)
  console.log(`Total classificações diferentes: ${classDifGlobal.length}`)
  console.log(`Total códigos diferentes: ${codDifGlobal.length}`)
  console.log(`Total LOJAS perdidas no PDF (XLSX tem cod, PDF=null): ${lojaPerdidaPdf.length}`)

  // Padrões mais comuns
  const padroes = new Map<string, number>()
  for (const c of classDifGlobal) {
    const k = `${c.xc} → ${c.pc}`
    padroes.set(k, (padroes.get(k) ?? 0) + 1)
  }
  console.log(`\nPadrões de classificação diferente (top 10):`)
  ;[...padroes.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([k,v]) => console.log(`  ${k}: ${v} casos`))

  // Lojas perdidas: agrupar por nome
  const lojasGroupedByCod = new Map<string, number>()
  for (const l of lojaPerdidaPdf) {
    const k = `${l.codX} ${l.nomeX ?? ''}`
    lojasGroupedByCod.set(k, (lojasGroupedByCod.get(k) ?? 0) + 1)
  }
  console.log(`\nLOJAS mais perdidas no PDF (top 20):`)
  ;[...lojasGroupedByCod.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([k,v]) => console.log(`  ${v}x  ${k}`))

  // Mostrar exemplos de class diff com locais
  // Focar nos casos REAIS (excluir dia 20 onde XLSX e PDF têm timing muito diferente)
  console.log(`\nExemplos XLSX=BASE → PDF=LOJA — só dias 18,19,21,22 (top 10):`)
  classDifGlobal.filter(c => c.xc === 'BASE' && c.pc === 'LOJA' && c.dia !== '20').filter(c => c.dia !== '20').slice(0, 10).forEach(c => {
    console.log(`  dia${c.dia} ${c.placa} ${c.hora}: XLSX="${c.localXc}" PDF="${c.localPc}"`)
  })

  console.log(`\nExemplos XLSX=FORA_BASE → PDF=LOJA (top 10):`)
  classDifGlobal.filter(c => c.xc === 'FORA_BASE' && c.pc === 'LOJA').filter(c => c.dia !== '20').slice(0, 10).forEach(c => {
    console.log(`  dia${c.dia} ${c.placa} ${c.hora}: XLSX="${c.localXc}" PDF="${c.localPc}"`)
  })

  console.log(`\nExemplos XLSX=LOJA → PDF=BASE (top 10):`)
  classDifGlobal.filter(c => c.xc === 'LOJA' && c.pc === 'BASE').filter(c => c.dia !== '20').slice(0, 10).forEach(c => {
    console.log(`  dia${c.dia} ${c.placa} ${c.hora}: XLSX="${c.localXc}" PDF="${c.localPc}"`)
  })

  console.log(`\nExemplos XLSX=LOJA → PDF=FORA_BASE (top 10):`)
  classDifGlobal.filter(c => c.xc === 'LOJA' && c.pc === 'FORA_BASE').filter(c => c.dia !== '20').slice(0, 10).forEach(c => {
    console.log(`  dia${c.dia} ${c.placa} ${c.hora}: XLSX="${c.localXc}" PDF="${c.localPc}"`)
  })
})().catch(e => { console.error(e); process.exit(1) })
