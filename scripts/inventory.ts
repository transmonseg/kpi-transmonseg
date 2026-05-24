/**
 * Inventário de cobertura de dados pra correção KPI rede-por-rede.
 * Escaneia:
 *   - C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA XX
 *   - C:/Users/media/Downloads/KPI-*-2026-MM-DD.xlsx
 *
 * Saída: docs/inventory/2026-05-24-data-coverage.md
 *
 * Uso: npx tsx scripts/inventory.ts
 */
import { readdirSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const ESCALA_BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const DOWNLOADS = 'C:/Users/media/Downloads'

interface Coverage {
  dia: string
  escalaFolder: string | null
  escalaFiles: string[]
  unitracFiles: string[]
  kpiManual: string[]
}

function safeReaddir(path: string): string[] {
  try { return readdirSync(path) } catch { return [] }
}

function inventoryEscala(): Map<string, Coverage> {
  const map = new Map<string, Coverage>()
  for (const entry of safeReaddir(ESCALA_BASE)) {
    const m = entry.match(/^ESCALA DIA (\d+)$/)
    if (!m) continue
    const dia = m[1].padStart(2, '0')
    const folder = join(ESCALA_BASE, entry)
    const files = safeReaddir(folder)
    map.set(dia, {
      dia,
      escalaFolder: folder,
      escalaFiles: files.filter(f => f.toUpperCase().startsWith('ESCALA') && (f.endsWith('.xlsx') || f.endsWith('.pdf'))),
      unitracFiles: files.filter(f => f.toLowerCase().startsWith('relatorio_') && (f.endsWith('.xlsx') || f.endsWith('.pdf'))),
      kpiManual: [],
    })
  }
  return map
}

function inventoryKpiManuais(map: Map<string, Coverage>) {
  for (const f of safeReaddir(DOWNLOADS)) {
    const m = f.match(/^KPI-([A-Z_]+)-2026-05-(\d{2})(?:\s\(\d+\))?\.xlsx$/)
    if (!m) continue
    if (f.startsWith('~$')) continue
    const rede = m[1]
    const dia = m[2]
    if (!map.has(dia)) {
      map.set(dia, { dia, escalaFolder: null, escalaFiles: [], unitracFiles: [], kpiManual: [] })
    }
    const cov = map.get(dia)!
    if (!cov.kpiManual.includes(rede)) cov.kpiManual.push(rede)
  }
}

function generateMd(map: Map<string, Coverage>): string {
  const dias = [...map.keys()].sort()
  let md = `# Inventário de dados — gerado ${new Date().toISOString()}\n\n`
  md += `Cobertura de pastas (escala+Unitrac) e arquivos de KPI manual disponíveis.\n\n`
  md += `## Tabela resumo\n\n`
  md += `| Dia | Pasta ESCALA | Arquivos escala | Arquivos Unitrac | KPI manuais (redes) |\n`
  md += `|-----|--------------|-----------------|------------------|---------------------|\n`
  for (const dia of dias) {
    const c = map.get(dia)!
    const folder = c.escalaFolder ? 'sim' : 'nao'
    const escalas = c.escalaFiles.length
    const unitracs = c.unitracFiles.length
    const kpis = c.kpiManual.length === 0 ? '-' : c.kpiManual.sort().join(', ')
    md += `| ${dia} | ${folder} | ${escalas} | ${unitracs} | ${kpis} |\n`
  }
  md += `\n## Detalhe por dia\n\n`
  for (const dia of dias) {
    const c = map.get(dia)!
    md += `### Dia ${dia}\n`
    md += `- Pasta: ${c.escalaFolder ?? '(sem pasta)'}\n`
    md += `- Escalas: ${c.escalaFiles.length === 0 ? '-' : c.escalaFiles.join(', ')}\n`
    md += `- Unitracs: ${c.unitracFiles.length === 0 ? '-' : c.unitracFiles.join(', ')}\n`
    md += `- KPI manuais (${c.kpiManual.length}): ${c.kpiManual.length === 0 ? '-' : c.kpiManual.sort().join(', ')}\n\n`
  }
  return md
}

function main() {
  const map = inventoryEscala()
  inventoryKpiManuais(map)
  const md = generateMd(map)
  mkdirSync('docs/inventory', { recursive: true })
  const fname = 'docs/inventory/2026-05-24-data-coverage.md'
  writeFileSync(fname, md)
  process.stdout.write(`Inventory saved: ${fname}\n`)
  process.stdout.write(`Dias mapeados: ${map.size}\n`)
  for (const [dia, c] of map) {
    process.stdout.write(`  ${dia}: ${c.escalaFiles.length} escalas, ${c.unitracFiles.length} unitracs, ${c.kpiManual.length} KPI manuais\n`)
  }
}

main()
