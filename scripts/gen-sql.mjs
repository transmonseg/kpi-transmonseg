/**
 * Generates SQL INSERT statements for manual MCP execution.
 * Reads parsed JSON from /tmp/geral-linhas.json and /tmp/unitrac-veiculos.json.
 */
import { readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'

const linhas = JSON.parse(readFileSync('/tmp/geral-linhas.json', 'utf8'))
const veiculos = JSON.parse(readFileSync('/tmp/unitrac-veiculos.json', 'utf8'))

const DATA = '2026-05-11'
const escalaUploadId = randomUUID()
const unitracUploadId = randomUUID()

console.log('escala_upload_id:', escalaUploadId)
console.log('unitrac_upload_id:', unitracUploadId)

// ── escala_uploads ─────────────────────────────────────────────────────────
const escalaUploadSQL = `
INSERT INTO escala_uploads (id, data_escala, tipo, arquivo_path, nome_arquivo, qtd_linhas, status)
VALUES (
  '${escalaUploadId}',
  '${DATA}',
  'GERAL',
  '${DATA}/geral.xlsx',
  'geral.xlsx',
  ${linhas.length},
  'processado'
);`

writeFileSync('/tmp/sql-escala-upload.sql', escalaUploadSQL)
console.log('Wrote /tmp/sql-escala-upload.sql')

// ── escala_linhas in batches of 50 ────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return 'NULL'
  if (typeof s === 'number') return String(s)
  // Escape single quotes
  return "'" + String(s).replace(/'/g, "''") + "'"
}
function escJson(o) {
  if (o === null || o === undefined) return 'NULL'
  return "'" + JSON.stringify(o).replace(/'/g, "''") + "'"
}

const BATCH = 50
const batches = []
for (let i = 0; i < linhas.length; i += BATCH) {
  const batch = linhas.slice(i, i + BATCH)
  const values = batch.map(l => `(
    '${randomUUID()}',
    '${escalaUploadId}',
    ${esc(l.rede_id)},
    NULL,
    ${esc(l.loja_nome_raw)},
    ${esc(l.loja_codigo_raw)},
    ${esc(l.placa_norm)},
    ${esc(l.placa_raw)},
    ${esc(l.motorista_nome)},
    ${esc(l.motorista_codigo)},
    ${esc(l.tipo_carro)},
    ${esc(l.turno)},
    ${l.carro_ordem ?? 'NULL'},
    ${esc(l.obs)},
    ${esc(l.restricao)},
    ${l.peso_kg ?? 'NULL'},
    ${l.paletes ?? 'NULL'},
    ${esc(l.data_entrega)},
    ${l.raw_row_num ?? 'NULL'}
  )`).join(',\n')

  batches.push(`INSERT INTO escala_linhas
    (id, escala_upload_id, rede_id, loja_id, loja_nome_raw, loja_codigo_raw,
     placa_norm, placa_raw, motorista_nome, motorista_codigo, tipo_carro, turno,
     carro_ordem, obs, restricao, peso_kg, paletes, data_entrega, raw_row_num)
  VALUES ${values};`)
}

for (let i = 0; i < batches.length; i++) {
  writeFileSync(`/tmp/sql-escala-linhas-${i + 1}.sql`, batches[i])
}
console.log(`Wrote ${batches.length} escala_linhas batch SQL files`)

// ── unitrac_uploads ────────────────────────────────────────────────────────
const totalParadas = veiculos.reduce((s, v) => s + v.paradas.length, 0)
const unitracUploadSQL = `
INSERT INTO unitrac_uploads (id, data_relatorio, arquivo_path, qtd_abas, qtd_paradas, status)
VALUES (
  '${unitracUploadId}',
  '${DATA}',
  '${DATA}/unitrac.xlsx',
  ${veiculos.length},
  ${totalParadas},
  'processado'
);`

writeFileSync('/tmp/sql-unitrac-upload.sql', unitracUploadSQL)
console.log('Wrote /tmp/sql-unitrac-upload.sql')

// ── unitrac_paradas in batches of 50 ─────────────────────────────────────
const paradasBatches = []
const allParadas = []
for (const v of veiculos) {
  for (const p of v.paradas) {
    allParadas.push({ ...p, placa_norm_veiculo: v.placa_norm })
  }
}

for (let i = 0; i < allParadas.length; i += BATCH) {
  const batch = allParadas.slice(i, i + BATCH)
  const values = batch.map(p => `(
    '${randomUUID()}',
    '${unitracUploadId}',
    ${esc(p.placa_norm)},
    ${p.chegada ? esc(p.chegada) : 'NULL'},
    ${p.saida ? esc(p.saida) : 'NULL'},
    ${p.duracao_seg ?? 'NULL'},
    ${p.distancia_km ?? 'NULL'},
    ${esc(p.endereco)},
    ${p.lat ?? 'NULL'},
    ${p.lng ?? 'NULL'},
    ${esc(p.local_parada)},
    ${esc(p.codigo_loja)},
    ${esc(p.nome_loja)},
    ${esc(p.classificacao)},
    NULL,
    ${p.ordem ?? 'NULL'}
  )`).join(',\n')

  paradasBatches.push(`INSERT INTO unitrac_paradas
    (id, unitrac_upload_id, placa_norm, chegada, saida, duracao_seg, distancia_km,
     endereco, lat, lng, local_parada, codigo_loja, nome_loja, classificacao,
     loja_id, ordem)
  VALUES ${values};`)
}

for (let i = 0; i < paradasBatches.length; i++) {
  writeFileSync(`/tmp/sql-unitrac-paradas-${i + 1}.sql`, paradasBatches[i])
}
console.log(`Wrote ${paradasBatches.length} unitrac_paradas batch SQL files`)

// Summary
console.log('\n=== Summary ===')
console.log(`escala_upload_id: ${escalaUploadId}`)
console.log(`unitrac_upload_id: ${unitracUploadId}`)
console.log(`Escala linhas: ${linhas.length} in ${batches.length} batches`)
console.log(`Unitrac paradas: ${totalParadas} in ${paradasBatches.length} batches`)
