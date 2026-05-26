/**
 * Compara XLSX vs PDF de TODAS as placas — agrupa as diferenças por padrão
 * pra identificar mais bugs do parser PDF.
 */
import { readFileSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'

function fmtHHMM(d: Date | null | undefined): string {
  if (!d) return '---'
  return String(d.getUTCHours()).padStart(2,'0') + ':' + String(d.getUTCMinutes()).padStart(2,'0')
}

function chave(p: any): string {
  return `${fmtHHMM(p.chegada)}-${fmtHHMM(p.saida)}`
}

;(async () => {
  console.log('Carregando XLSX...')
  const xlsx = await parseUnitrac(readFileSync(BASE + '/relatorio_9391.xlsx'))
  console.log('Carregando PDF...')
  const pdf = await parseUnitracPdf(readFileSync(BASE + '/relatorio_9572.pdf'), new Set())

  // Combinar
  const byPlaca = new Map<string, { x?: any; p?: any }>()
  for (const v of xlsx) byPlaca.set(v.placa_norm, { x: v })
  for (const v of pdf) {
    const cur = byPlaca.get(v.placa_norm) ?? {}
    cur.p = v
    byPlaca.set(v.placa_norm, cur)
  }

  // Padrões de diferenças
  const padroes = {
    so_xlsx: [] as string[],          // Placa só no XLSX
    so_pdf: [] as string[],           // Placa só no PDF
    diff_count: [] as Array<{placa:string, xc:number, pc:number}>, // diferença de paradas total
    parada_perdida_pdf: [] as Array<{placa:string, xlsx_extra:string[]}>, // parada no XLSX mas não no PDF
    parada_perdida_xlsx: [] as Array<{placa:string, pdf_extra:string[]}>, // parada no PDF mas não no XLSX (provavelmente XLSX exportado mais cedo)
    classificacao_dif: [] as Array<{placa:string, diffs:Array<{hora:string, xc:string, pc:string}>}>, // mesma hora, classificação diferente
    codigo_dif: [] as Array<{placa:string, diffs:Array<{hora:string, xc:string|null, pc:string|null}>}>, // mesma hora, código loja diferente
  }

  for (const [placa, {x, p}] of byPlaca) {
    if (!x) { padroes.so_pdf.push(placa); continue }
    if (!p) { padroes.so_xlsx.push(placa); continue }

    if (x.paradas.length !== p.paradas.length) {
      padroes.diff_count.push({placa, xc:x.paradas.length, pc:p.paradas.length})
    }

    // Mapear paradas por chave de hora
    const xMap = new Map<string, any>()
    for (const par of x.paradas) xMap.set(chave(par), par)
    const pMap = new Map<string, any>()
    for (const par of p.paradas) pMap.set(chave(par), par)

    const xExtra: string[] = []
    const pExtra: string[] = []
    const classDif: Array<{hora:string, xc:string, pc:string}> = []
    const codDif: Array<{hora:string, xc:string|null, pc:string|null}> = []

    for (const [k, xpar] of xMap) {
      if (!pMap.has(k)) { xExtra.push(k); continue }
      const ppar = pMap.get(k)
      if (xpar.classificacao !== ppar.classificacao) {
        classDif.push({hora: k, xc: xpar.classificacao, pc: ppar.classificacao})
      }
      if ((xpar.codigo_loja ?? null) !== (ppar.codigo_loja ?? null)) {
        codDif.push({hora: k, xc: xpar.codigo_loja, pc: ppar.codigo_loja})
      }
    }
    for (const [k] of pMap) {
      if (!xMap.has(k)) pExtra.push(k)
    }

    if (xExtra.length > 0) padroes.parada_perdida_pdf.push({placa, xlsx_extra: xExtra})
    if (pExtra.length > 0) padroes.parada_perdida_xlsx.push({placa, pdf_extra: pExtra})
    if (classDif.length > 0) padroes.classificacao_dif.push({placa, diffs: classDif})
    if (codDif.length > 0) padroes.codigo_dif.push({placa, diffs: codDif})
  }

  console.log(`\n═══ RESUMO ═══`)
  console.log(`Só no XLSX: ${padroes.so_xlsx.length} (${padroes.so_xlsx.slice(0,5).join(', ')})`)
  console.log(`Só no PDF: ${padroes.so_pdf.length} (${padroes.so_pdf.slice(0,5).join(', ')})`)
  console.log(`Diferença de nº de paradas: ${padroes.diff_count.length} placas`)
  console.log(`Paradas presentes só no XLSX (PDF perdeu): ${padroes.parada_perdida_pdf.length} placas`)
  console.log(`Paradas presentes só no PDF (XLSX exportado mais cedo): ${padroes.parada_perdida_xlsx.length} placas`)
  console.log(`Mesma parada, classificação diferente: ${padroes.classificacao_dif.length} placas`)
  console.log(`Mesma parada, código de loja diferente: ${padroes.codigo_dif.length} placas`)

  console.log(`\n═══ TOP 10 PARADAS PERDIDAS NO PDF (XLSX tem, PDF não) ═══`)
  padroes.parada_perdida_pdf.slice(0, 10).forEach(({placa, xlsx_extra}) => {
    console.log(`  ${placa}: faltam ${xlsx_extra.length} paradas no PDF (${xlsx_extra.slice(0,3).join(', ')})`)
  })

  console.log(`\n═══ TOP 10 CLASSIFICAÇÃO DIFERENTE ═══`)
  padroes.classificacao_dif.slice(0, 10).forEach(({placa, diffs}) => {
    console.log(`  ${placa}: ${diffs.length} diffs`)
    diffs.slice(0, 3).forEach(d => console.log(`     ${d.hora}: XLSX=${d.xc} vs PDF=${d.pc}`))
  })

  console.log(`\n═══ TOP 10 CÓDIGO LOJA DIFERENTE ═══`)
  padroes.codigo_dif.slice(0, 10).forEach(({placa, diffs}) => {
    console.log(`  ${placa}: ${diffs.length} diffs`)
    diffs.slice(0, 3).forEach(d => console.log(`     ${d.hora}: XLSX=${d.xc} vs PDF=${d.pc}`))
  })
})()
