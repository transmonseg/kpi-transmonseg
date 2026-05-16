import fs from 'fs'
import { parseEscalaGuanabaraPdf } from '../src/lib/parsers/escala-guanabara-pdf.ts'

const paths = [
  'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/escalas/escala 15.005.pdf',
  'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/escalas/ESCALA 14.05.pdf',
]

for (const p of paths) {
  console.log('\n====================')
  console.log('FILE:', p)
  console.log('====================')

  const buf = fs.readFileSync(p)
  const linhas = await parseEscalaGuanabaraPdf(buf)

  console.log(`\nExtraídas ${linhas.length} linhas:\n`)
  for (const l of linhas) {
    console.log(
      `  [${l.data_entrega}] Rota ${(l.loja_codigo_raw ?? '?').padStart(2, '0')} (c${l.carro_ordem}) | ${(l.motorista_nome ?? '').padEnd(28)} | cod ${(l.motorista_codigo ?? '').padEnd(6)} | ${(l.placa_raw ?? '').padEnd(12)} → ${l.placa_norm} | ${l.tipo_carro} | ${l.turno}`,
    )
  }

  const rotas = new Set(linhas.map((l) => l.loja_codigo_raw))
  console.log(`\nRotas distintas: ${rotas.size} → [${[...rotas].sort((a, b) => Number(a) - Number(b)).join(', ')}]`)
}
