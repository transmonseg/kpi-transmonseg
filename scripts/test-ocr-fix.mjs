/**
 * Script de validacao do fix OCR do parser PDF Unitrac.
 * Verifica se as 4 placas conhecidas sao encontradas corretamente no relatorio_9553.pdf.
 *
 * Uso: node --experimental-vm-modules scripts/test-ocr-fix.mjs
 * Ou via tsx: npx tsx scripts/test-ocr-fix.mjs
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

// tsx/ts-node handles TS imports, but this is plain mjs — use dynamic import via tsx:
// Run with: npx tsx scripts/test-ocr-fix.mjs

const PDF_PATH = resolve(
  'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 20/relatorio_9553.pdf'
)

const PLACAS_ESPERADAS = new Set(['LCO0978', 'LQE5401', 'LJS2172', 'EFU5704'])

async function main() {
  // Dynamic import works with tsx (which transpiles the TS source)
  const { parseUnitracPdf } = await import('../src/lib/parsers/unitrac-pdf.ts')

  const buf = await readFile(PDF_PATH)
  const veiculos = await parseUnitracPdf(buf, PLACAS_ESPERADAS)

  const placasEncontradas = new Set(veiculos.map(v => v.placa_norm))

  const resultado = {}
  for (const placa of PLACAS_ESPERADAS) {
    resultado[placa] = placasEncontradas.has(placa) ? 'encontrada' : 'nao_encontrada'
  }

  console.log(JSON.stringify({
    total_veiculos: veiculos.length,
    placas_encontradas: [...placasEncontradas].sort(),
    resultado_por_placa: resultado,
  }, null, 2))
}

main().catch(e => {
  console.error('ERRO:', e.message)
  process.exit(1)
})
