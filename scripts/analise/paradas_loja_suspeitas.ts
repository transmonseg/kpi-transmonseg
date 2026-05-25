/**
 * Identifica paradas classificadas como LOJA com local_parada suspeito
 * (sem código de loja real ou com texto que parece header/lixo).
 */
import { readFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const DIAS = [
  { dia: '18', pdf: `${BASE}/ESCALA DIA 18/relatorio_9401.pdf` },
  { dia: '19', pdf: `${BASE}/ESCALA DIA 19/relatorio_9572.pdf` },
  { dia: '20', pdf: `${BASE}/ESCALA DIA 20/relatorio_9522.pdf` },
  { dia: '21', pdf: `${BASE}/ESCALA DIA 21/relatorio_9553.pdf` },
  { dia: '22', pdf: `${BASE}/ESCALA DIA 22/relatorio_9589 (1).pdf` },
]

;(async () => {
  const suspeitas: Array<{dia: string, placa: string, local: string, cod: string | null}> = []
  for (const { dia, pdf } of DIAS) {
    const veiculos = await parseUnitracPdf(readFileSync(pdf), new Set())
    for (const v of veiculos) {
      for (const p of v.paradas) {
        if (p.classificacao !== 'LOJA') continue
        const local = p.local_parada ?? ''
        const cod = p.codigo_loja
        // Suspeitas:
        // - LOJA sem codigo_loja
        // - local muito curto (< 10 chars)
        // - local começa com palavra-cabeçalho
        const isSuspeito = !cod ||
          local.length < 10 ||
          /^(Local|REDES|FILIAIS|MOTORISTA|PLACA|TOTAL|Condutor)/i.test(local) ||
          local.trim() === 'RJ'
        if (isSuspeito) {
          suspeitas.push({ dia, placa: v.placa_norm, local: local.slice(0, 60), cod })
        }
      }
    }
  }
  console.log(`Total LOJAs suspeitas: ${suspeitas.length}`)
  // Agrupar por padrão de local
  const padroes = new Map<string, number>()
  for (const s of suspeitas) {
    const chave = s.local.replace(/\d/g, '#').slice(0, 40)
    padroes.set(chave, (padroes.get(chave) ?? 0) + 1)
  }
  console.log(`\nPadrões (top 20):`)
  ;[...padroes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => {
    console.log(`  ${v}x  "${k}"`)
  })
  console.log(`\nExemplos (top 10):`)
  suspeitas.slice(0, 10).forEach(s => {
    console.log(`  dia${s.dia} ${s.placa}: cod=${s.cod ?? 'null'} local="${s.local}"`)
  })
})()
