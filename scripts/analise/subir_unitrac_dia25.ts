/**
 * Sobe o PDF Unitrac do dia 25 pro banco (unitrac_uploads + unitrac_paradas).
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const CONTROL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]', 'g')
const san = (s: string | null | undefined) => s == null ? null : s.replace(CONTROL, '')
const FAKE_USER_ID = 'c76b6f16-a988-480b-84e9-3c2e9038559a'

;(async () => {
  const data = '2026-05-25'
  const pdfPath = 'docs/conversas-tia-erica/dia-25/unitrac/relatorio_9652.pdf'

  // Limpar upload anterior do dia 25
  const { data: existente } = await sb.from('unitrac_uploads').select('id').eq('data_relatorio', data)
  if (existente?.length) {
    const ids = existente.map(u => u.id as string)
    await sb.from('unitrac_paradas').delete().in('unitrac_upload_id', ids)
    await sb.from('unitrac_uploads').delete().in('id', ids)
    console.log(`Limpou ${existente.length} uploads antigos`)
  }

  const buf = readFileSync(pdfPath)
  const veiculos = await parseUnitracPdf(buf, null)
  const comParadas = veiculos.filter(v => v.paradas.length > 0)
  const paradas = comParadas.flatMap(v => v.paradas.map(p => ({
    placa_norm: san(p.placa_norm),
    chegada: p.chegada.toISOString(),
    saida: p.saida?.toISOString() ?? null,
    duracao_seg: p.duracao_seg,
    distancia_km: p.distancia_km,
    endereco: san(p.endereco),
    lat: p.lat,
    lng: p.lng,
    local_parada: san(p.local_parada),
    codigo_loja: san(p.codigo_loja),
    nome_loja: san(p.nome_loja),
    classificacao: p.classificacao,
    ordem: p.ordem,
  })))

  console.log(`Veículos: ${veiculos.length} / com paradas: ${comParadas.length} / paradas: ${paradas.length}`)

  const { data: upload, error: upErr } = await sb.from('unitrac_uploads').insert({
    data_relatorio: data,
    arquivo_path: pdfPath,
    qtd_abas: comParadas.length,
    qtd_paradas: paradas.length,
    status: 'processado',
    uploaded_by: FAKE_USER_ID,
    processado_em: new Date().toISOString(),
  }).select('id').single()

  if (upErr || !upload) { console.error('Upload err:', upErr); process.exit(1) }

  const paradaRows = paradas.map(p => ({ ...p, unitrac_upload_id: upload.id }))
  const BATCH = 500
  for (let i = 0; i < paradaRows.length; i += BATCH) {
    const { error } = await sb.from('unitrac_paradas').insert(paradaRows.slice(i, i + BATCH))
    if (error) { console.error(`Batch ${i}:`, error.message); process.exit(1) }
  }
  console.log(`✓ ${paradas.length} paradas inseridas`)
})().catch(e => { console.error(e); process.exit(1) })
