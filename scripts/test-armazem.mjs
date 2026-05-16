import fs from 'fs'
import { parseEscalaArmazemGrao } from '../src/lib/parsers/escala-armazem-grao.ts'

const path = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/escalas/ESCALA DO ARMAZÉM DO GRÃO MAIO.xlsx'

const buf = fs.readFileSync(path)
const linhas = await parseEscalaArmazemGrao(buf)

console.log(`Extraídas ${linhas.length} linhas:\n`)
for (const l of linhas) {
  console.log(
    `  [${l.data_entrega}] ${l.rede_id} | ${l.loja_nome_raw.padEnd(40)} | ${l.tipo_carro} | ${l.motorista_nome} (${l.motorista_codigo}) | ${l.placa_raw} → ${l.placa_norm} | ${l.turno}`,
  )
}

console.log('\nResumo por motorista:')
const por = new Map()
for (const l of linhas) {
  const k = `${l.motorista_nome} (${l.motorista_codigo})`
  por.set(k, (por.get(k) || 0) + 1)
}
for (const [k, n] of por) console.log(`  ${k}: ${n} lojas`)

console.log('\nDatas distintas:', [...new Set(linhas.map((l) => l.data_entrega))])
