import '@/lib/polyfills/pdf-parse-polyfill'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseUnitrac } from '@/lib/parsers/unitrac'
// parseUnitracPdf carrega pdf-parse (depende de DOMMatrix); import dinâmico
// dentro do handler pra não falhar no "collect page data" do build.

export const runtime = 'nodejs'
export const maxDuration = 120

type Formato = 'xlsx' | 'pdf'

function detectaFormato(path: string): Formato | null {
  const lower = path.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.xlsx')) return 'xlsx'
  return null
}

// PostgreSQL/JSON rejeitam null bytes (U+0000) e outros control chars em texto.
// pdf-parse v1 às vezes deixa esses bytes na extração — sanitizar antes do insert.
// Mantém TAB (U+0009), LF (U+000A) e CR (U+000D); remove o resto do range 0x00-0x1F.
const CONTROL_CHARS_RE = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]', 'g')
function sanitizeText(s: string | null | undefined): string | null {
  if (s == null) return null
  return s.replace(CONTROL_CHARS_RE, '')
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { data, storagePath } = await req.json()

  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data as string))
    return new NextResponse('Data inválida. Use YYYY-MM-DD.', { status: 400 })

  if (!storagePath || typeof storagePath !== 'string')
    return new NextResponse('storagePath ausente.', { status: 400 })

  const formato = detectaFormato(storagePath)
  if (!formato)
    return new NextResponse(
      'Extensão do arquivo não suportada. Use .xlsx ou .pdf.',
      { status: 400 }
    )

  const svc = createServiceClient()

  // Cenário A: sempre sobrescreve, sem perguntar
  const { data: existente } = await svc
    .from('unitrac_uploads')
    .select('id')
    .eq('data_relatorio', data)
    .maybeSingle()

  // Read file from Storage
  const { data: fileBlob, error: downloadErr } = await svc.storage
    .from('unitrac-raw')
    .download(storagePath)

  if (downloadErr || !fileBlob)
    return new NextResponse(
      `Erro ao ler arquivo do storage: ${downloadErr?.message ?? 'arquivo não encontrado'}`,
      { status: 500 }
    )

  const arrayBuffer = await fileBlob.arrayBuffer()
  let veiculos

  try {
    if (formato === 'pdf') {
      const { parseUnitracPdf } = await import('@/lib/parsers/unitrac-pdf')
      veiculos = await parseUnitracPdf(Buffer.from(arrayBuffer))
    } else {
      veiculos = await parseUnitrac(arrayBuffer)
    }
  } catch (e) {
    return new NextResponse(
      e instanceof Error ? e.message : 'Erro ao parsear relatório Unitrac.',
      { status: 400 }
    )
  }

  if (veiculos.length === 0)
    return new NextResponse('Nenhum veículo encontrado no arquivo.', { status: 400 })

  const qtdParadas = veiculos.reduce((acc, v) => acc + v.paradas.length, 0)

  if (existente) {
    await svc.from('unitrac_paradas').delete().eq('unitrac_upload_id', existente.id)
    const { error: deleteErr } = await svc.from('unitrac_uploads').delete().eq('id', existente.id)
    if (deleteErr) console.error('[unitrac/upload] delete existente error:', deleteErr.message)
  }

  const { data: upload, error: uploadErr } = await svc
    .from('unitrac_uploads')
    .insert({
      data_relatorio: data,
      arquivo_path: storagePath,
      qtd_abas: veiculos.length,
      qtd_paradas: qtdParadas,
      status: 'processado',
      uploaded_by: user.id,
    })
    .select('id')
    .single()

  if (uploadErr || !upload)
    return new NextResponse(`Erro ao registrar upload: ${uploadErr?.message}`, { status: 500 })

  const BATCH = 200
  const todasParadas = veiculos.flatMap((v) =>
    v.paradas.map((p) => ({
      unitrac_upload_id: upload.id,
      placa_norm: p.placa_norm,
      chegada: p.chegada.toISOString(),
      saida: p.saida.toISOString(),
      duracao_seg: p.duracao_seg,
      distancia_km: p.distancia_km,
      endereco: sanitizeText(p.endereco),
      lat: p.lat,
      lng: p.lng,
      local_parada: sanitizeText(p.local_parada),
      codigo_loja: sanitizeText(p.codigo_loja),
      nome_loja: sanitizeText(p.nome_loja),
      classificacao: p.classificacao,
      loja_id: null,
      ordem: p.ordem,
    }))
  )

  for (let i = 0; i < todasParadas.length; i += BATCH) {
    const { error: insertErr } = await svc
      .from('unitrac_paradas')
      .insert(todasParadas.slice(i, i + BATCH))

    if (insertErr)
      return new NextResponse(`Erro ao inserir paradas: ${insertErr.message}`, { status: 500 })
  }

  return NextResponse.json({
    upload_id: upload.id,
    qtd_abas: veiculos.length,
    qtd_paradas: qtdParadas,
    substituiu: !!existente,
  })
}
