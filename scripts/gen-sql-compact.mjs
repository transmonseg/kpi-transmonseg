/**
 * Generates compact SQL for MCP execution (one row per line, no whitespace bloat).
 */
import { readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'

const linhas = JSON.parse(readFileSync('/tmp/geral-linhas.json', 'utf8'))
const veiculos = JSON.parse(readFileSync('/tmp/unitrac-veiculos.json', 'utf8'))

const DATA = '2026-05-11'
const escalaUploadId = '935d2c27-fa08-406b-a143-2160f2b3d8bb'
const unitracUploadId = '91c11da7-16ea-48e5-a3e3-0ed0e470515e'

function q(s) {
  if (s === null || s === undefined) return 'NULL'
  if (typeof s === 'number') return isNaN(s) ? 'NULL' : String(s)
  return "'" + String(s).replace(/'/g, "''") + "'"
}

// ── escala_linhas ─────────────────────────────────────────────────────────
const BATCH = 80
const batches = []
for (let i = 0; i < linhas.length; i += BATCH) {
  const rows = linhas.slice(i, i + BATCH).map(l =>
    `('${randomUUID()}','${escalaUploadId}',${q(l.rede_id)},NULL,${q(l.loja_nome_raw)},${q(l.loja_codigo_raw)},${q(l.placa_norm)},${q(l.placa_raw)},${q(l.motorista_nome)},${q(l.motorista_codigo)},${q(l.tipo_carro)},${q(l.turno)},${l.carro_ordem??'NULL'},${q(l.obs)},${q(l.restricao)},${l.peso_kg??'NULL'},${l.paletes??'NULL'},${q(l.data_entrega)},${l.raw_row_num??'NULL'})`
  ).join(',')
  batches.push(`INSERT INTO escala_linhas(id,escala_upload_id,rede_id,loja_id,loja_nome_raw,loja_codigo_raw,placa_norm,placa_raw,motorista_nome,motorista_codigo,tipo_carro,turno,carro_ordem,obs,restricao,peso_kg,paletes,data_entrega,raw_row_num) VALUES ${rows};`)
}
for (let i = 0; i < batches.length; i++) {
  writeFileSync(`C:/tmp/compact-escala-${i+1}.sql`, batches[i])
}
console.log(`${linhas.length} linhas in ${batches.length} batches`)
batches.forEach((b, i) => console.log(`  batch ${i+1}: ${b.length} chars`))

// ── unitrac_paradas ───────────────────────────────────────────────────────
const allParadas = []
for (const v of veiculos) for (const p of v.paradas) allParadas.push(p)

const pbatches = []
for (let i = 0; i < allParadas.length; i += BATCH) {
  const rows = allParadas.slice(i, i + BATCH).map(p =>
    `('${randomUUID()}','${unitracUploadId}',${q(p.placa_norm)},${q(p.chegada)},${q(p.saida)},${p.duracao_seg??'NULL'},${p.distancia_km??'NULL'},${q(p.endereco)},${p.lat??'NULL'},${p.lng??'NULL'},${q(p.local_parada)},${q(p.codigo_loja)},${q(p.nome_loja)},${q(p.classificacao)},NULL,${p.ordem??'NULL'})`
  ).join(',')
  pbatches.push(`INSERT INTO unitrac_paradas(id,unitrac_upload_id,placa_norm,chegada,saida,duracao_seg,distancia_km,endereco,lat,lng,local_parada,codigo_loja,nome_loja,classificacao,loja_id,ordem) VALUES ${rows};`)
}
for (let i = 0; i < pbatches.length; i++) {
  writeFileSync(`C:/tmp/compact-paradas-${i+1}.sql`, pbatches[i])
}
console.log(`${allParadas.length} paradas in ${pbatches.length} batches`)
pbatches.forEach((b, i) => console.log(`  batch ${i+1}: ${b.length} chars`))
