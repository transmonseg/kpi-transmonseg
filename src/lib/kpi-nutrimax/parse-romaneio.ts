import type { LinhaRomaneioNutrimax } from './types'

const HEADER_RE = /^PLACA\/MOTORISTA:(.+?)\s*\/\s*(.+?)CARGA\/DESTINO:(\d+)\s*\/\s*(.+)$/
const AJUDANTE_RE = /^AJUDANTE\(S\):(.*)$/
const NF_CLIENTE_RE = /^(\d+)\s*\/\s*(\d+)\s*-\s*(.+)$/
const FIM_CLIENTE_RE = /^NF\s*\/\s*CLIENTE:\s*$/
const TOTAL_RE = /^Total de \d+ clientes?$/i

type Contexto = { carga: string; destino: string; placa: string; motorista: string; ajudantes: string[] }

/**
 * Parser puro — recebe o texto já extraído (ex: por pdf-parse) e devolve as linhas.
 * Separado do I/O de PDF pra ser testável sem precisar de um binário de PDF real.
 */
export function parseRomaneioTexto(texto: string): LinhaRomaneioNutrimax[] {
  const linhas: LinhaRomaneioNutrimax[] = []
  let ctx: Contexto | null = null
  let pendente: { nf: string; codigo: string; nome: string } | null = null

  for (const raw of texto.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    const h = line.match(HEADER_RE)
    if (h) {
      ctx = { placa: h[1].trim(), motorista: h[2].trim(), carga: h[3], destino: h[4].trim(), ajudantes: [] }
      pendente = null
      continue
    }
    if (!ctx) continue

    const aj = line.match(AJUDANTE_RE)
    if (aj) {
      ctx.ajudantes = aj[1].split(',').map(s => s.trim()).filter(Boolean)
      continue
    }
    if (TOTAL_RE.test(line) || FIM_CLIENTE_RE.test(line)) {
      pendente = null
      continue
    }

    const nfM = line.match(NF_CLIENTE_RE)
    if (nfM && !pendente) {
      pendente = { nf: nfM[1], codigo: nfM[2], nome: nfM[3].trim() }
      continue
    }
    if (pendente) {
      linhas.push({
        carga: ctx.carga,
        destino: ctx.destino,
        placa: ctx.placa,
        motorista: ctx.motorista,
        ajudantes: ctx.ajudantes,
        nf: pendente.nf,
        clienteCodigo: pendente.codigo,
        clienteNome: pendente.nome,
        endereco: line,
      })
      pendente = null
    }
  }
  return linhas
}

export async function parseRomaneioNutrimax(buffer: Buffer): Promise<LinhaRomaneioNutrimax[]> {
  // pdf-parse v1.1.1 — default export é função (buf) => Promise<{text}>. Mesmo padrão
  // usado em src/lib/parsers/escala-guanabara-pdf.ts.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
  const { text } = await pdfParse(buffer)
  return parseRomaneioTexto(text)
}
