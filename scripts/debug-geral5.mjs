import { readFileSync } from 'fs'
const linhas = JSON.parse(readFileSync('/tmp/geral-linhas.json', 'utf8'))

const byRede = {}
for (const l of linhas) {
  byRede[l.rede_id] = (byRede[l.rede_id] ?? 0) + 1
}
console.log('=== Por rede_id ===')
for (const [rede, count] of Object.entries(byRede).sort((a,b) => b[1]-a[1])) {
  console.log(`  ${rede}: ${count}`)
}

const comPlaca = linhas.filter(l => l.placa_norm).length
const semPlaca = linhas.filter(l => !l.placa_norm).length
console.log(`\nTotal: ${linhas.length} | com placa: ${comPlaca} | sem placa: ${semPlaca}`)

// Check BENASSI lines
const benassi = linhas.filter(l => l.tipo_emissao === 'BENASSI')
console.log(`\nBENASSI: ${benassi.length}`)
benassi.slice(0,3).forEach(l => console.log(`  ${l.rede_id} | ${l.loja_nome_raw} | placa=${l.placa_norm}`))

// Check FORA_ESCALA
const foraEscala = linhas.filter(l => l.tipo_emissao === 'FORA_ESCALA')
console.log(`\nFORA_ESCALA: ${foraEscala.length}`)
foraEscala.slice(0,3).forEach(l => console.log(`  ${l.rede_id} | ${l.loja_nome_raw} | placa=${l.placa_norm}`))
