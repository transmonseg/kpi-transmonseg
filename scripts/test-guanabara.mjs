import pdfParse from '../node_modules/pdf-parse/index.js'
import { readFileSync } from 'fs'

const PLACA_INLINE_RE = String.raw`[A-Z]{3}[\s-]?\d[A-Z0-9]\d{2}|[A-Z]{3}[\s-]?\d{4}`
const TIPO_INLINE_RE = String.raw`TRUCK|TOCO\s*REFRIGERADO|TOCO|VUC|3\/4|KIA|CARRETA`

// ANTES do fix (sem \s?)
const PLACA_TIPO_ANTES = new RegExp(`(${PLACA_INLINE_RE})(${TIPO_INLINE_RE})\b`, 'g')
// DEPOIS do fix (com \s?)
const PLACA_TIPO_DEPOIS = new RegExp(`(${PLACA_INLINE_RE})\s?(${TIPO_INLINE_RE})\b`, 'g')

const testes = [
  '12RONALDO35KSG 5412TRUCKJOSE NILDON (DOCA) 753KVG 7A00TRUCK',
  '22P.CESAR210LFK-2C56TRUCKP.CESAR210LFK-2C56TRUCK',
  '31RAFAEL184497KNI-8988TRUCK',
  '71MOISES294GBC 6E12TRUCKANDERSON244KST-0246TRUCK',
]

console.log('=== ANTES ===')
for (const t of testes) {
  PLACA_TIPO_ANTES.lastIndex = 0
  const hits = []
  let m
  while ((m = PLACA_TIPO_ANTES.exec(t)) !== null) hits.push(m[1] + ' | ' + m[2])
  console.log(t.substring(0,60), '->', hits)
}

console.log('\n=== DEPOIS ===')
for (const t of testes) {
  PLACA_TIPO_DEPOIS.lastIndex = 0
  const hits = []
  let m
  while ((m = PLACA_TIPO_DEPOIS.exec(t)) !== null) hits.push(m[1] + ' | ' + m[2])
  console.log(t.substring(0,60), '->', hits)
}
