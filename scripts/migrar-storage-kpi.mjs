// scripts/migrar-storage-kpi.mjs
// Migra todo arquivo dos 5 buckets ativos do Supabase Storage (origem) pro
// Storage-API self-hosted novo no Contabo, via API HTTP real dos dois lados
// (nunca lendo/escrevendo storage.objects direto). Idempotente: usa
// x-upsert=true, pode rodar de novo sem duplicar.

import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

const ORIGEM_URL = process.env.ORIGEM_SUPABASE_URL
const ORIGEM_SERVICE_KEY = process.env.ORIGEM_SERVICE_ROLE_KEY
const NOVO_BASE_URL = process.env.STORAGE_API_URL ?? 'http://127.0.0.1:5000'
const NOVO_SERVICE_KEY = process.env.STORAGE_API_SERVICE_KEY

if (!ORIGEM_URL || !ORIGEM_SERVICE_KEY || !NOVO_SERVICE_KEY) {
  console.error('Faltam env vars: ORIGEM_SUPABASE_URL, ORIGEM_SERVICE_ROLE_KEY, STORAGE_API_SERVICE_KEY')
  process.exit(1)
}

const BUCKETS_ATIVOS = ['escalas-raw', 'unitrac-raw', 'kpi-outputs', 'kpi-api-dash', 'nutrimax-outputs']

const origem = createClient(ORIGEM_URL, ORIGEM_SERVICE_KEY)

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

/** Lista todo arquivo de um bucket na origem, recursivamente (a listagem do
 *  Supabase Storage é por pasta, não plana). */
async function listarTudo(bucket, prefixo = '') {
  const { data, error } = await origem.storage.from(bucket).list(prefixo, { limit: 1000 })
  if (error) throw new Error(`list ${bucket}/${prefixo}: ${error.message}`)
  let arquivos = []
  for (const item of data) {
    const caminho = prefixo ? `${prefixo}/${item.name}` : item.name
    if (item.id === null) {
      // pasta (sem "id" = não é arquivo) — desce recursivamente
      arquivos = arquivos.concat(await listarTudo(bucket, caminho))
    } else {
      arquivos.push({ path: caminho, mimetype: item.metadata?.mimetype ?? 'application/octet-stream' })
    }
  }
  return arquivos
}

async function migrarArquivo(bucket, arquivo) {
  const { data: blob, error: dlErr } = await origem.storage.from(bucket).download(arquivo.path)
  if (dlErr) throw new Error(`download ${bucket}/${arquivo.path}: ${dlErr.message}`)
  const bytes = Buffer.from(await blob.arrayBuffer())
  const hashOrigem = sha256(bytes)

  const uploadUrl = `${NOVO_BASE_URL}/object/${bucket}/${arquivo.path}`
  const resUpload = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOVO_SERVICE_KEY}`,
      'Content-Type': arquivo.mimetype,
      'x-upsert': 'true',
    },
    body: bytes,
  })
  if (!resUpload.ok) {
    throw new Error(`upload ${bucket}/${arquivo.path}: HTTP ${resUpload.status} ${await resUpload.text()}`)
  }

  const resDownload = await fetch(`${NOVO_BASE_URL}/object/${bucket}/${arquivo.path}`, {
    headers: { Authorization: `Bearer ${NOVO_SERVICE_KEY}` },
  })
  if (!resDownload.ok) {
    throw new Error(`re-download ${bucket}/${arquivo.path}: HTTP ${resDownload.status}`)
  }
  const bytesNovo = Buffer.from(await resDownload.arrayBuffer())
  const hashNovo = sha256(bytesNovo)

  if (hashOrigem !== hashNovo) {
    throw new Error(`HASH MISMATCH ${bucket}/${arquivo.path}: origem=${hashOrigem} novo=${hashNovo}`)
  }
  return hashOrigem
}

async function main() {
  const resumo = []
  for (const bucket of BUCKETS_ATIVOS) {
    const arquivos = await listarTudo(bucket)
    let ok = 0
    let falhas = []
    for (const arquivo of arquivos) {
      try {
        await migrarArquivo(bucket, arquivo)
        ok++
        if (ok % 50 === 0) console.log(`  ${bucket}: ${ok}/${arquivos.length}...`)
      } catch (e) {
        falhas.push({ path: arquivo.path, erro: e.message })
      }
    }
    resumo.push({ bucket, total: arquivos.length, ok, falhas })
    console.log(`${bucket}: ${ok}/${arquivos.length} migrados e verificados por hash. Falhas: ${falhas.length}`)
    if (falhas.length) console.log(JSON.stringify(falhas, null, 2))
  }
  console.log('\n=== RESUMO FINAL ===')
  console.log(JSON.stringify(resumo.map(r => ({ bucket: r.bucket, total: r.total, ok: r.ok, falhas: r.falhas.length })), null, 2))
  const totalFalhas = resumo.reduce((acc, r) => acc + r.falhas.length, 0)
  if (totalFalhas > 0) {
    console.error(`\n${totalFalhas} arquivo(s) com falha — ver detalhes acima.`)
    process.exit(1)
  }
}

main()
