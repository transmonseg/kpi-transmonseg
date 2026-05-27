/**
 * Verifica se consolidarParadasMesmoCliente esta consolidando as 2 paradas duplicadas.
 */
import { readFileSync, readdirSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { variantesOcr } from '@/lib/kpi/matcher'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'

function fmtT(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}:${String(dt.getUTCSeconds()).padStart(2,'0')}`
}

;(async () => {
  const dia = '19'
  const pasta = `${BASE}/ESCALA DIA ${dia}`
  const PLACA = 'LQE5401'

  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
  let veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))
  if (pdfFile) veiculos.push(...await parseUnitracPdf(readFileSync(`${pasta}/${pdfFile}`), new Set()).catch(() => []))

  const paradas: any[] = []
  for (const v of veiculos) for (const p of v.paradas) paradas.push({ ...p, placa_norm: v.placa_norm, id: `${v.placa_norm}-${paradas.length}` })

  const variantes = new Set(variantesOcr(PLACA))
  const paradasPlaca = paradas.filter(p => variantes.has(p.placa_norm)).sort((a:any,b:any) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime())
  const lojas = paradasPlaca.filter((p:any) => p.classificacao === 'LOJA')

  console.log(`--- Paradas LOJA ORDENADAS por chegada ---`)
  for (const p of lojas) {
    console.log(`  chegada=${fmtT(p.chegada)} dur=${p.duracao_seg}s cod=${p.codigo_loja} nome="${p.nome_loja?.slice(0,40)}" id=${p.id}`)
  }

  // Simula consolidar inline
  console.log(`\n--- Simulando consolidarParadasMesmoCliente ---`)
  console.log(`  Iterando por ordem cronologica:`)
  let last: any = null
  for (const p of lojas) {
    if (last) {
      const lastSaida = last.saida ? new Date(last.saida).getTime() : new Date(last.chegada).getTime()
      const pChegada = new Date(p.chegada).getTime()
      const gap = (pChegada - lastSaida) / 1000
      const mesmoCod = last.codigo_loja && p.codigo_loja && last.codigo_loja === p.codigo_loja
      console.log(`  par: last=${fmtT(last.chegada)} cod=${last.codigo_loja}, p=${fmtT(p.chegada)} cod=${p.codigo_loja} gap=${gap}s mesmoCod=${mesmoCod}`)
    }
    last = p
  }
  process.exit(0)
})()
