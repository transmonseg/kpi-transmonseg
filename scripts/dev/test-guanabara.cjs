const PLACA_INLINE_RE = String.raw`[A-Z]{3}[\s-]?\d[A-Z0-9]\d{2}|[A-Z]{3}[\s-]?\d{4}`
const TIPO_INLINE_RE = String.raw`TRUCK|TOCO\s*REFRIGERADO|TOCO|VUC|3\/4|KIA|CARRETA`

const DEPOIS = new RegExp(`(${PLACA_INLINE_RE})\s?(${TIPO_INLINE_RE})\b`, 'g')
console.log('Regex:', DEPOIS.source)
console.log()

// Teste manual passo a passo
const t = '31RAFAEL184497KNI-8988TRUCK'
console.log('Texto:', t)

// Regex simples só pra placa
const rPlaca = new RegExp(PLACA_INLINE_RE, 'g')
console.log('Só placa matches:')
let m
while ((m = rPlaca.exec(t)) !== null) console.log(' idx', m.index, '->', m[0])

// Regex simples só pra tipo
const rTipo = new RegExp(TIPO_INLINE_RE, 'g')
console.log('Só tipo matches:')
rTipo.lastIndex = 0
while ((m = rTipo.exec(t)) !== null) console.log(' idx', m.index, '->', m[0])

// Manual: KNI-8988 + TRUCK
const simples = /([A-Z]{3}[\s-]?\d[A-Z0-9]\d{2})(TRUCK)/g
simples.lastIndex = 0
console.log('\nSimples KNI-8988TRUCK:')
while ((m = simples.exec(t)) !== null) console.log(' ->', m[0])

// Com alternativa
const alt = /([A-Z]{3}[\s-]?\d[A-Z0-9]\d{2}|[A-Z]{3}[\s-]?\d{4})(TRUCK|TOCO)/g
alt.lastIndex = 0
console.log('\nCom alternativa:')
while ((m = alt.exec(t)) !== null) console.log(' ->', m[0])
