// Valida o fix: parseia a escala (com a correção) + agrupa + checa a ordem.
// Uso: npx tsx scripts/dev/valida-fix.ts
import { readFileSync } from 'node:fs'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { agruparPorLoja } from '@/lib/kpi/agrupar-por-loja'
import type { LinhaParaKpi } from '@/lib/kpi/gerador-kpi'

const ESCALA = 'C:/Users/media/Downloads/ESCALA-HOJE-auto_1780231342372.xlsx'
const DATA = '2026-05-31'

async function main() {
  const linhas = (await parseEscalaZonaSul(readFileSync(ESCALA), DATA)).filter(l => l.rede_id === 'ZONA_SUL')
  const paraKpi = linhas.map(l => ({
    loja_nome: l.loja_nome_raw,
    carro_ordem: l.carro_ordem,
    placa: l.placa_norm,
    motorista: l.motorista_nome,
  })) as unknown as LinhaParaKpi[]

  const ag = agruparPorLoja(paraKpi)
  let inv = 0, ok = 0, com2 = 0
  for (const a of [...ag].sort((x, y) => x.loja_nome.localeCompare(y.loja_nome))) {
    if (!a.carro2) continue
    com2++
    const o1 = a.carro1?.carro_ordem ?? 9
    const o2 = a.carro2?.carro_ordem ?? 9
    const inverted = o1 > o2
    if (inverted) inv++; else ok++
    const desc = a.descartadas.length ? `  [${a.descartadas.length} descartada(s)]` : ''
    console.log(`${a.loja_nome}: 1º ${a.carro1?.placa}(ord${o1}) | 2º ${a.carro2?.placa}(ord${o2}) ${inverted ? '⚠️ INVERTIDA' : 'ok'}${desc}`)
  }
  console.log(`\nLojas com 2 carros: ${com2} | invertidas: ${inv} | ok: ${ok}`)
}
main().catch(e => { console.error(e); process.exit(1) })
