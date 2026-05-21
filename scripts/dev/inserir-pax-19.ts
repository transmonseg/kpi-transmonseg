// Insere as linhas PAX do dia 19 usando o parser corrigido (que não
// depende do nome da aba como dia — lê a data do cabeçalho da seção).
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'

async function main() {
  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const DATA = '2026-05-19'
  const FILE = 'C:/Users/media/Downloads/dia 19/ESCALA - PAX , FEIRA NOVA , EMANUEL.xlsx'

  const buf = await readFile(FILE)
  const linhas = await parseEscalaPax(buf.buffer, DATA)
  console.log(`Parseou ${linhas.length} linhas PAX para ${DATA}`)

  if (linhas.length === 0) {
    console.error('Nenhuma linha encontrada — abortando.')
    process.exit(1)
  }

  const { data: up, error: upErr } = await svc.from('escala_uploads').insert({
    data_escala: DATA,
    tipo: 'PAX',
    arquivo_path: FILE,
    nome_arquivo: 'ESCALA - PAX , FEIRA NOVA , EMANUEL.xlsx',
    qtd_linhas: linhas.length,
    status: 'processado',
  }).select('id').single()

  if (upErr) { console.error('Erro ao criar upload:', upErr.message); process.exit(1) }
  console.log('Upload criado:', up!.id)

  const rows = linhas.map(({ data: _data, tipo_emissao: _te, ...l }) => ({
    ...l,
    escala_upload_id: up!.id,
  }))
  const BATCH = 200
  let total = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await svc.from('escala_linhas').insert(rows.slice(i, i + BATCH))
    if (error) { console.error('Erro batch:', error.message); process.exit(1) }
    total += Math.min(BATCH, rows.length - i)
  }
  console.log(`✓ ${total} linhas inseridas (SUPER_PAX + FEIRA_NOVA + EMANUEL)`)
}

main().catch(e => { console.error(e); process.exit(1) })
