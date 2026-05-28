import { readFileSync } from 'fs'

const txt = readFileSync('scripts/analise/_pos_fix_d19.md', 'utf-8')
const sections = txt.split(/\n## /)
const results: { rede: string; total: number; preenchido: number; vazio: number }[] = []

for (let i = 1; i < sections.length; i++) {
  const lines = sections[i].split('\n')
  const rede = lines[0].split(' ')[0]
  let total = 0, preenchido = 0
  for (const l of lines.slice(2)) {
    if (!l.trim()) continue
    if (l.includes('Motorista')) continue
    if (!l.includes('|')) continue
    total++
    // Linha preenchida tem timestamps HH:MM em SaiCD/CHD/SaiLj (não só "-")
    const cols = l.split('|').map(c => c.trim())
    // últimas 3 colunas são SaiCD CHD SaiLj
    const last3 = cols.slice(-3)
    const algumTs = last3.some(c => /\d{2}:\d{2}/.test(c))
    if (algumTs) preenchido++
  }
  results.push({ rede, total, preenchido, vazio: total - preenchido })
}

let totT = 0, totP = 0
for (const r of results) {
  console.log(`${r.rede.padEnd(18)} ${r.preenchido}/${r.total}  vazias=${r.vazio}`)
  totT += r.total
  totP += r.preenchido
}
console.log(`\nTOTAL: ${totP}/${totT} = ${Math.round(100 * totP / totT)}% atribuído`)
