/**
 * Valida que os 3 PDFs do dia 22 são reconhecidos pelos parsers do sistema:
 * - Escala Guanabara PDF
 * - Unitrac PDF (relatório)
 * - Alteração de escala PDF
 */
import '@/lib/polyfills/pdf-parse-polyfill'
import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 22'

async function testGuanabaraPdf() {
  process.stdout.write(`\n=== 1. ESCALA GUANABARA PDF (ESCALA 23.05.pdf) ===\n`)
  try {
    const { parseEscalaGuanabaraPdf } = await import('@/lib/parsers/escala-guanabara-pdf')
    const buf = readFileSync(`${BASE}/ESCALA 23.05.pdf`)
    const linhas = await parseEscalaGuanabaraPdf(buf, '2026-05-23')
    process.stdout.write(`  ✓ Parser OK — ${linhas.length} linhas extraídas\n`)
    if (linhas.length > 0) {
      const ex = linhas[0]
      process.stdout.write(`  Exemplo: rede=${ex.rede_id} placa=${ex.placa_norm} loja=${ex.loja_nome_raw}\n`)
      const porRede = new Map<string, number>()
      for (const l of linhas) porRede.set(l.rede_id, (porRede.get(l.rede_id) ?? 0) + 1)
      process.stdout.write(`  Por rede: ${[...porRede.entries()].map(([r, c]) => `${r}=${c}`).join(' ')}\n`)
    }
  } catch (e: any) {
    process.stdout.write(`  ✗ FALHOU: ${e.message}\n`)
  }
}

async function testUnitracPdf() {
  process.stdout.write(`\n=== 2. UNITRAC PDF (relatorio_9589 (1).pdf) ===\n`)
  try {
    const { parseUnitracPdf } = await import('@/lib/parsers/unitrac-pdf')
    const buf = readFileSync(`${BASE}/relatorio_9589 (1).pdf`)
    const veiculos = await parseUnitracPdf(Buffer.from(buf), null)
    const totalParadas = veiculos.reduce((s, v) => s + v.paradas.length, 0)
    process.stdout.write(`  ✓ Parser OK — ${veiculos.length} veículos, ${totalParadas} paradas\n`)
    if (veiculos.length > 0) {
      const v = veiculos[0]
      process.stdout.write(`  Exemplo: placa=${v.placa_norm} paradas=${v.paradas.length}\n`)
    }
  } catch (e: any) {
    process.stdout.write(`  ✗ FALHOU: ${e.message}\n`)
  }
}

async function testAlteracaoPdf() {
  process.stdout.write(`\n=== 3. ALTERAÇÃO ESCALA PDF (ALTERACAO DE ESCALA GERAL 22.05.pdf) ===\n`)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
    const buf = readFileSync(`${BASE}/alteracoes/ALTERACAO DE ESCALA GERAL 22.05.pdf`)
    const { text } = await pdfParse(buf)
    process.stdout.write(`  ✓ pdf-parse OK — ${text.length} caracteres extraídos\n`)
    const preview = text.substring(0, 300).replace(/\s+/g, ' ').trim()
    process.stdout.write(`  Preview: "${preview}..."\n`)

    // Replica o splitAlteracoes do endpoint real (analisar-alt)
    const linhas = text.split(/\r?\n/)
    const blocos: string[] = []
    let buffer: string[] = []
    let redeCtx = ''
    const isInicioBloco = (l: string) =>
      /(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]*)?altera[çc][aã]o/iu.test(l) ||
      /^\s*filial\s+\d+\s*$/i.test(l.trim())
    const isRedeHeader = (l: string) =>
      /(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]*)?altera[çc][aã]o/iu.test(l) &&
      !/^\s*filial\s+\d+\s*$/i.test(l.trim())
    for (const linha of linhas) {
      const trim = linha.trim()
      if (!trim && buffer.length === 0) continue
      if (isInicioBloco(trim)) {
        if (buffer.length > 0) { blocos.push(buffer.join('\n').trim()); buffer = [] }
        if (isRedeHeader(trim)) { redeCtx = trim; buffer.push(linha) }
        else { if (redeCtx) buffer.push(redeCtx); buffer.push(linha) }
      } else buffer.push(linha)
    }
    if (buffer.length > 0) blocos.push(buffer.join('\n').trim())

    const { parseAlteracaoText } = await import('@/lib/parsers/alteracao-text')
    process.stdout.write(`  Blocos detectados: ${blocos.length}\n`)
    const parseados = blocos.map(b => parseAlteracaoText(b))
    const reconhecidos = parseados.filter(p => p.tipo !== 'desconhecido')
    process.stdout.write(`  Reconhecidos: ${reconhecidos.length}/${parseados.length}\n`)
    for (const p of parseados.slice(0, 5)) {
      process.stdout.write(`    - tipo=${p.tipo} rede=${p.rede_id ?? '?'} loja="${(p.loja_nome_raw ?? '?').slice(0, 40)}" conf=${p.confianca}\n`)
    }
    if (parseados.length > 5) process.stdout.write(`    ... +${parseados.length - 5} mais\n`)
  } catch (e: any) {
    process.stdout.write(`  ✗ FALHOU: ${e.message}\n`)
  }
}

async function main() {
  process.stdout.write(`=== VALIDAÇÃO DOS PDFs DO DIA 22 ===\n`)
  await testGuanabaraPdf()
  await testUnitracPdf()
  await testAlteracaoPdf()
  process.stdout.write(`\n=== FIM ===\n`)
}

main().catch(e => { console.error(e); process.exit(1) })
