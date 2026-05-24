import { readFileSync } from 'fs'

interface Proposta {
  loja_id: string
  loja_nome: string
  rede_id: string
  campo: string
  valor_proposto: string
  confianca: number
  evidencia: { detalhes: string }
}

const data = JSON.parse(readFileSync('docs/db-changes/2026-05-24-propostas-unitrac.json', 'utf8'))
const propostas: Proposta[] = data.propostas

console.log('Total propostas:', data.totalPropostas)
console.log('\nPor rede:')
const porRede = new Map<string, number>()
for (const p of propostas) porRede.set(p.rede_id, (porRede.get(p.rede_id) ?? 0) + 1)
for (const [r, c] of [...porRede.entries()].sort((a, b) => b[1] - a[1])) {
  console.log('  ' + r.padEnd(20) + c)
}

console.log('\n=== Amostra: propostas codigo_unitrac (primeiras 15) ===')
const cods = propostas.filter(p => p.campo === 'codigo_unitrac').slice(0, 15)
for (const p of cods) {
  console.log(`  ${p.rede_id.padEnd(15)} | ${p.loja_nome.slice(0, 50).padEnd(50)} → ${p.valor_proposto} (${(p.confianca * 100).toFixed(0)}%)`)
}

console.log('\n=== Amostra: propostas nome_unitrac (primeiras 15) ===')
const nomes = propostas.filter(p => p.campo === 'nome_unitrac').slice(0, 15)
for (const p of nomes) {
  console.log(`  ${p.rede_id.padEnd(15)} | ${p.loja_nome.slice(0, 40).padEnd(40)} → "${p.valor_proposto.slice(0, 45)}"`)
}

console.log('\n=== Lojas sem proposta (amostra) ===')
const sem = JSON.parse(readFileSync('docs/db-changes/2026-05-24-lojas-sem-proposta.json', 'utf8'))
console.log('Total:', sem.total)
const porRedeSemProp = new Map<string, number>()
for (const l of sem.lojas) porRedeSemProp.set(l.rede_id, (porRedeSemProp.get(l.rede_id) ?? 0) + 1)
console.log('\nPor rede:')
for (const [r, c] of [...porRedeSemProp.entries()].sort((a, b) => b[1] - a[1])) {
  console.log('  ' + r.padEnd(20) + c)
}
console.log('\nAmostra (primeiras 10):')
for (const l of sem.lojas.slice(0, 10)) {
  console.log(`  ${l.rede_id.padEnd(15)} | ${l.nome} (cod=${l.tem_codigo_unitrac} nome=${l.tem_nome_unitrac})`)
}
