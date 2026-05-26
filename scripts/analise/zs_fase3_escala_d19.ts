// Lê escala ZS dia 19 completa e lista todas linhas
import { readFileSync, readdirSync } from 'fs'

import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'

const BASE_19 = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'

;(async () => {
  const files = readdirSync(BASE_19)
  const escZs = files.find(f => /ZONA.*SUL/i.test(f) && f.endsWith('.xlsx'))!
  console.log(`Lendo: ${escZs}`)
  const escala = await parseEscalaZonaSul(readFileSync(BASE_19 + '/' + escZs), '2026-05-19')
  console.log(`\nLinhas dia 19 ZS: ${escala.length}\n`)
  for (const l of escala) {
    console.log(`  ${(l.loja_codigo_raw ?? '?').padStart(5)} | ${(l.placa_norm ?? '?').padEnd(10)} | ${(l.motorista_nome ?? '?').padEnd(25)} | ${(l.loja_nome_raw ?? '').slice(0, 30)}`)
  }

  // Há Loja 33?
  const l33 = escala.filter(l => /\b33\b/.test(l.loja_codigo_raw ?? '') || /\b33\b/.test(l.loja_nome_raw))
  console.log(`\nLojas '33' encontradas: ${l33.length}`)
  for (const l of l33) console.log(`  ${JSON.stringify(l)}`)
})()
