/**
 * Parses GERAL and UNITRAC files and writes results to JSON files in /tmp.
 * Run: npx tsx scripts/parse-to-json.ts
 */
import { readFile, writeFile } from 'fs/promises'
import { parseEscalaGeral } from '../src/lib/parsers/escala-geral'
import { parseUnitrac } from '../src/lib/parsers/unitrac'

const BASE = 'C:\\Users\\media\\OneDrive\\EMPRESA TRIFORCE AUTO\\clientes\\tia-erica\\CONVERSAS COM ERICA\\'
const DATA = '2026-05-11'

async function main() {
  // ── GERAL ──────────────────────────────────────────────────────────────────
  console.log('Parsing GERAL...')
  const geralBuf = await readFile(BASE + 'escalas\\ESCALA GERAL DE MAIO 1.xlsx')
  const linhas = await parseEscalaGeral(geralBuf, DATA)
  console.log(`  ${linhas.length} linhas para data ${DATA}`)
  const comPlaca = linhas.filter(l => l.placa_norm).length
  const semPlaca = linhas.filter(l => !l.placa_norm).length
  console.log(`  com placa: ${comPlaca}, sem placa (órfas): ${semPlaca}`)

  // Sample first 3
  linhas.slice(0, 3).forEach((l, i) => {
    console.log(`  [${i}] ${l.rede_id} | ${l.loja_nome_raw} | placa=${l.placa_norm} | turno=${l.turno} | data=${l.data_entrega}`)
  })

  await writeFile('/tmp/geral-linhas.json', JSON.stringify(linhas, null, 2))
  console.log('  Saved to /tmp/geral-linhas.json')

  // ── UNITRAC ────────────────────────────────────────────────────────────────
  console.log('\nParsing UNITRAC...')
  const unitracBuf = await readFile(BASE + 'relatorios-unitrac\\relatorio_unitrac_9086.xlsx')
  const veiculos = await parseUnitrac(unitracBuf)
  console.log(`  ${veiculos.length} veículos`)
  const totalParadas = veiculos.reduce((s, v) => s + v.paradas.length, 0)
  console.log(`  ${totalParadas} paradas totais`)

  // Summarize by classificacao
  const byClass: Record<string, number> = {}
  for (const v of veiculos) {
    for (const p of v.paradas) {
      byClass[p.classificacao] = (byClass[p.classificacao] ?? 0) + 1
    }
  }
  console.log('  Por classificação:', byClass)

  // Sample first vehicle
  const v0 = veiculos[0]
  console.log(`  [0] ${v0.placa_raw} → ${v0.paradas.length} paradas, saida_cd=${v0.saida_cd?.toISOString() ?? 'null'}`)

  await writeFile('/tmp/unitrac-veiculos.json', JSON.stringify(veiculos, null, 2))
  console.log('  Saved to /tmp/unitrac-veiculos.json')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
