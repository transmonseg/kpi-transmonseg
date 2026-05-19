import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const MANUAL = 'C:/Users/media/Downloads/KPI PREZUNIC (1).xlsx'
const AUTO   = 'C:/Users/media/Downloads/KPI-PREZUNIC-2026-05-18 (1).xlsx'

function serialParaHora(v) {
  if (typeof v === 'string') return v
  if (!v && v !== 0) return ''
  // Excel serial: fração de dia (ex: 0.2777 = 06:40)
  const totalMin = Math.round(v * 24 * 60)
  const h = Math.floor(totalMin / 60) % 24
  const m = totalMin % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}

function lerAba(path, abaName) {
  const wb = XLSX.readFile(path)
  const ws = wb.Sheets[abaName]
  if (!ws) return []
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 })
  return raw
}

function extraiLinhas(raw) {
  // Linha 0: título
  // Linha 1: "PREZUNIC 1º CARRO" / "PREZUNIC 2º CARRO"
  // Linha 2: cabeçalhos das colunas (REDES / FILIAIS, MOTORISTA, COD, PLACA, SAIDA CD, CHD LOJA, SAIDA LOJA, ...)
  // Linha 3+: dados
  const linhas = []
  for (let i = 3; i < raw.length; i++) {
    const row = raw[i]
    if (!row[0] || String(row[0]).trim() === '') continue
    if (String(row[0]).includes('REDES') || String(row[0]).includes('RELATÓRIO')) continue
    linhas.push({
      loja:       String(row[0]).trim(),
      motorista1: String(row[1] ?? '').trim(),
      cod1:       String(row[2] ?? '').trim(),
      placa1:     String(row[3] ?? '').trim(),
      saida_cd1:  serialParaHora(row[4]),
      chd1:       serialParaHora(row[5]),
      saida1:     serialParaHora(row[6]),
      motorista2: String(row[7] ?? '').trim(),
      cod2:       String(row[8] ?? '').trim(),
      placa2:     String(row[9] ?? '').trim(),
      saida_cd2:  serialParaHora(row[10]),
      chd2:       serialParaHora(row[11]),
      saida2:     serialParaHora(row[12]),
      tempo1:     serialParaHora(row[13] !== undefined ? row[13] : row[row.length - 2]),
      tempo2:     serialParaHora(row[14] !== undefined ? row[14] : row[row.length - 1]),
    })
  }
  return linhas
}

const rawManual = lerAba(MANUAL, '18')
const rawAuto   = lerAba(AUTO, '18')

const manual = extraiLinhas(rawManual)
const auto   = extraiLinhas(rawAuto)

console.log(`\nMANUAL: ${manual.length} lojas | AUTO: ${auto.length} lojas\n`)

// Build map by loja name (normalized)
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const mapManual = new Map(manual.map(r => [norm(r.loja), r]))
const mapAuto   = new Map(auto.map(r => [norm(r.loja), r]))

// Campos de horários para comparar
const CAMPOS = ['saida_cd1','chd1','saida1','saida_cd2','chd2','saida2']
const LABELS = ['Saída CD1','Chg Loja1','Saída Loja1','Saída CD2','Chg Loja2','Saída Loja2']

let matched = 0, somenteManual = 0, somenteAuto = 0, divergentes = 0

const todasLojas = new Set([...mapManual.keys(), ...mapAuto.keys()])

console.log('='.repeat(80))
for (const k of [...todasLojas].sort()) {
  const m = mapManual.get(k)
  const a = mapAuto.get(k)

  if (!m) { somenteAuto++; console.log(`[SÓ AUTO]  ${a.loja}`); continue }
  if (!a) { somenteManual++; console.log(`[SÓ MANUAL] ${m.loja}`); continue }

  // Checar divergências nos horários
  const diffs = []
  for (let i = 0; i < CAMPOS.length; i++) {
    const vm = m[CAMPOS[i]], va = a[CAMPOS[i]]
    if (!vm && !va) continue
    if (vm !== va) diffs.push(`${LABELS[i]}: manual=${vm || '-'} auto=${va || '-'}`)
  }

  if (diffs.length === 0) {
    matched++
    // Só mostra placa/motorista pra confirmar match
    console.log(`[OK]  ${m.loja}  →  placa:${m.placa1||'-'} mot:${m.motorista1||'-'}`)
  } else {
    divergentes++
    console.log(`[DIFF] ${m.loja}`)
    diffs.forEach(d => console.log(`       ↳ ${d}`))
    if (m.placa1 !== a.placa1 || m.motorista1 !== a.motorista1) {
      console.log(`       ↳ Motorista: manual="${m.motorista1}" auto="${a.motorista1}"`)
      console.log(`       ↳ Placa: manual="${m.placa1}" auto="${a.placa1}"`)
    }
  }
}

console.log('='.repeat(80))
const total = todasLojas.size
console.log(`\nRESUMO:`)
console.log(`  Total lojas:       ${total}`)
console.log(`  OK (match perfeito): ${matched}  (${Math.round(matched/total*100)}%)`)
console.log(`  Divergentes:       ${divergentes}  (${Math.round(divergentes/total*100)}%)`)
console.log(`  Só no manual:      ${somenteManual}`)
console.log(`  Só no auto:        ${somenteAuto}`)

// Mostra linhas auto com campo vazio onde manual tem valor (= não-match)
console.log(`\nAUTO sem horários (não-match no Unitrac):`)
for (const [k, a] of mapAuto) {
  const temAlgum = a.chd1 || a.saida1 || a.chd2 || a.saida2
  const flagSemRastr = a.saida_cd1 === 'SEM RASTREADOR'
  if (!temAlgum && !flagSemRastr) {
    console.log(`  - ${a.loja}  [placa:${a.placa1||'-'}]`)
  }
  if (flagSemRastr) {
    console.log(`  - ${a.loja}  [SEM RASTREADOR]`)
  }
}
