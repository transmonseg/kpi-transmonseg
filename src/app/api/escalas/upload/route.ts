import '@/lib/polyfills/pdf-parse-polyfill'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import type { LinhaEscala } from '@/lib/types/escala'

export const runtime = 'nodejs'
export const maxDuration = 120

type TipoEscala = 'GERAL' | 'ZONA_SUL' | 'PAX' | 'ARMAZEM_GRAO' | 'GUANABARA' | 'AUTO'
type Formato = 'xlsx' | 'pdf'

const TIPOS_VALIDOS: TipoEscala[] = ['GERAL', 'ZONA_SUL', 'PAX', 'ARMAZEM_GRAO', 'GUANABARA', 'AUTO']
const MIN_LINHAS_DETECCAO = 3

const FORMATO_ESPERADO: Record<Exclude<TipoEscala, 'AUTO'>, Formato> = {
  GERAL: 'xlsx',
  ZONA_SUL: 'xlsx',
  PAX: 'xlsx',
  ARMAZEM_GRAO: 'xlsx',
  GUANABARA: 'pdf',
}

function detectaFormato(path: string): Formato | null {
  const lower = path.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.xlsx')) return 'xlsx'
  return null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  let body: { storagePath: string; tipo?: string; data: string; nomeArquivo?: string }
  try {
    body = await req.json()
  } catch {
    return new NextResponse('Body deve ser JSON.', { status: 400 })
  }

  const { storagePath, tipo: tipoRaw = 'AUTO', data, nomeArquivo } = body

  if (!storagePath)
    return new NextResponse('Campo "storagePath" obrigatório.', { status: 400 })

  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data))
    return new NextResponse('Data inválida. Use YYYY-MM-DD.', { status: 400 })

  const tipo = (tipoRaw ?? 'AUTO').toUpperCase() as TipoEscala

  if (!TIPOS_VALIDOS.includes(tipo))
    return new NextResponse(
      `Tipo inválido. Use ${TIPOS_VALIDOS.join(', ')}.`,
      { status: 400 },
    )

  const formato = detectaFormato(storagePath)
  if (!formato)
    return new NextResponse(
      'Extensão do arquivo não suportada. Use .xlsx ou .pdf.',
      { status: 400 },
    )

  if (tipo !== 'AUTO') {
    const formatoEsperado = FORMATO_ESPERADO[tipo]
    if (formato !== formatoEsperado)
      return new NextResponse(
        `Formato ${formato} ainda não suportado para tipo ${tipo}. Envie em ${formatoEsperado}.`,
        { status: 501 },
      )
  }

  const svc = createServiceClient()

  const { data: fileBlob, error: downloadErr } = await svc.storage
    .from('escalas-raw')
    .download(storagePath)

  if (downloadErr || !fileBlob)
    return new NextResponse(
      `Erro ao baixar arquivo do storage: ${downloadErr?.message ?? 'arquivo não encontrado'}`,
      { status: 500 },
    )

  const arrayBuffer = await fileBlob.arrayBuffer()
  const fileName = nomeArquivo ?? storagePath.split('/').pop() ?? storagePath

  let linhas: LinhaEscala[] = []
  let tipoDetectado: TipoEscala = tipo

  try {
    if (tipo === 'AUTO') {
      const tentativas: Array<{ t: TipoEscala; fn: () => Promise<LinhaEscala[]> }> = [
        { t: 'ZONA_SUL',     fn: () => parseEscalaZonaSul(arrayBuffer, data) },
        { t: 'ARMAZEM_GRAO', fn: () => parseEscalaArmazemGrao(arrayBuffer, data) },
        { t: 'PAX',          fn: () => parseEscalaPax(arrayBuffer, data) },
        { t: 'GERAL',        fn: () => parseEscalaGeral(arrayBuffer, data) },
      ]
      if (formato === 'pdf') {
        const { parseEscalaGuanabaraPdf } = await import('@/lib/parsers/escala-guanabara-pdf')
        tentativas.push({
          t: 'GUANABARA',
          fn: () => parseEscalaGuanabaraPdf(Buffer.from(arrayBuffer), data),
        })
      }

      for (const { t, fn } of tentativas) {
        try {
          const resultado = await fn()
          if (resultado.length >= MIN_LINHAS_DETECCAO) {
            linhas = resultado
            tipoDetectado = t
            break
          }
        } catch {
          // Parser não reconheceu — tentar próximo
        }
      }

      if (linhas.length === 0)
        return new NextResponse(
          'Não foi possível detectar o tipo da escala. Verifique se o arquivo é uma das escalas suportadas (GERAL, ZONA SUL, PAX, ARMAZÉM DO GRÃO, GUANABARA).',
          { status: 400 },
        )
    } else if (tipo === 'GERAL' && formato === 'xlsx') {
      linhas = await parseEscalaGeral(arrayBuffer, data)
    } else if (tipo === 'ZONA_SUL' && formato === 'xlsx') {
      linhas = await parseEscalaZonaSul(arrayBuffer, data)
    } else if (tipo === 'PAX' && formato === 'xlsx') {
      linhas = await parseEscalaPax(arrayBuffer, data)
    } else if (tipo === 'ARMAZEM_GRAO' && formato === 'xlsx') {
      linhas = await parseEscalaArmazemGrao(arrayBuffer, data)
    } else if (tipo === 'GUANABARA' && formato === 'pdf') {
      const { parseEscalaGuanabaraPdf } = await import('@/lib/parsers/escala-guanabara-pdf')
      linhas = await parseEscalaGuanabaraPdf(Buffer.from(arrayBuffer), data)
    } else {
      return new NextResponse(
        `Formato ${formato} ainda não suportado para tipo ${tipo}.`,
        { status: 501 },
      )
    }
  } catch (e) {
    return new NextResponse(
      e instanceof Error ? e.message : 'Erro ao parsear arquivo.',
      { status: 400 },
    )
  }

  if (linhas.length === 0)
    return new NextResponse(
      'Nenhuma linha encontrada. Confirme que o arquivo e o tipo estão corretos.',
      { status: 400 },
    )

  // Sobrescreve upload anterior do mesmo dia/tipo
  const { data: existente } = await svc
    .from('escala_uploads')
    .select('id')
    .eq('data_escala', data)
    .eq('tipo', tipoDetectado)
    .maybeSingle()

  if (existente) {
    await svc.from('escala_uploads').delete().eq('id', existente.id)
  }

  const { data: upload, error: uploadErr } = await svc
    .from('escala_uploads')
    .insert({
      data_escala: data,
      tipo: tipoDetectado,
      arquivo_path: storagePath,
      nome_arquivo: fileName,
      qtd_linhas: linhas.length,
      status: 'processado',
      uploaded_by: user.id,
    })
    .select('id')
    .single()

  if (uploadErr || !upload)
    return new NextResponse(`Erro ao registrar upload: ${uploadErr?.message}`, { status: 500 })

  const CONTROL_CHARS_RE = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]', 'g')
  const clean = <T>(v: T): T => {
    if (typeof v === 'string') return v.replace(CONTROL_CHARS_RE, '') as T
    if (v == null) return v
    if (Array.isArray(v)) return v.map(clean) as T
    if (typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = clean(val)
      }
      return out as T
    }
    return v
  }

  const BATCH = 100
  let qtdOrfas = 0

  for (let i = 0; i < linhas.length; i += BATCH) {
    const batch = linhas.slice(i, i + BATCH)
    const rows = batch.map((l) => ({
      escala_upload_id: upload.id,
      rede_id: l.rede_id,
      loja_id: null,
      loja_nome_raw: clean(l.loja_nome_raw),
      loja_codigo_raw: clean(l.loja_codigo_raw),
      placa_norm: l.placa_norm || null,
      placa_raw: clean(l.placa_raw),
      motorista_nome: clean(l.motorista_nome),
      motorista_codigo: clean(l.motorista_codigo),
      tipo_carro: clean(l.tipo_carro),
      turno: l.turno,
      carro_ordem: l.carro_ordem,
      obs: clean(l.obs),
      restricao: clean(l.restricao),
      peso_kg: l.peso_kg,
      paletes: l.paletes,
      data_entrega: l.data_entrega,
      raw_row_num: l.raw_row_num,
      raw_json: clean(l),
    }))

    const { error: insertErr } = await svc.from('escala_linhas').insert(rows)
    if (insertErr)
      return new NextResponse(`Erro ao inserir linhas: ${insertErr.message}`, { status: 500 })

    qtdOrfas += batch.filter((l) => !l.placa_norm).length
  }

  return NextResponse.json({
    upload_id: upload.id,
    qtd_linhas: linhas.length,
    qtd_orfas: qtdOrfas,
    substituiu: !!existente,
    tipo_detectado: tipoDetectado,
  })
}
