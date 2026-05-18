import '@/lib/polyfills/pdf-parse-polyfill'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseEscalaUniversal } from '@/lib/parsers/escala-universal'
import type { LinhaEscala } from '@/lib/types/escala'

export const runtime = 'nodejs'
export const maxDuration = 60

type TipoEscala = 'GERAL' | 'ZONA_SUL' | 'PAX' | 'ARMAZEM_GRAO' | 'GUANABARA' | 'AUTO' | 'DESCONHECIDO'
type Formato = 'xlsx' | 'pdf'

const TIPOS_VALIDOS: TipoEscala[] = ['GERAL', 'ZONA_SUL', 'PAX', 'ARMAZEM_GRAO', 'GUANABARA', 'AUTO']
const MIN_LINHAS_DETECCAO = 3

const FORMATO_ESPERADO: Record<Exclude<TipoEscala, 'AUTO' | 'DESCONHECIDO'>, Formato> = {
  GERAL: 'xlsx',
  ZONA_SUL: 'xlsx',
  PAX: 'xlsx',
  ARMAZEM_GRAO: 'xlsx',
  GUANABARA: 'pdf',
}

function detectaFormato(filename: string): Formato | null {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.xlsx')) return 'xlsx'
  return null
}

type LinhaProblematica = {
  linha: number
  motivo: string
  conteudo: string
}

function validaLinha(l: LinhaEscala): string | null {
  if (!l.loja_nome_raw || l.loja_nome_raw.trim() === '') return 'loja_nome_raw ausente'
  if (!l.placa_norm && !l.placa_raw) return 'placa ausente'
  if (!l.rede_id || l.rede_id === 'DESCONHECIDO') return `rede não identificada (${l.rede_id})`
  if (!l.data_entrega) return 'data_entrega ausente'
  return null
}

function descricaoLinha(l: LinhaEscala): string {
  const partes: string[] = []
  if (l.loja_nome_raw) partes.push(l.loja_nome_raw)
  if (l.placa_raw) partes.push(`placa=${l.placa_raw}`)
  if (l.motorista_nome) partes.push(`motorista=${l.motorista_nome}`)
  return partes.join(' | ') || `row=${l.raw_row_num ?? '?'}`
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { storagePath, tipo: tipoRaw, data } = await req.json()

  if (!storagePath || typeof storagePath !== 'string')
    return new NextResponse('Campo "storagePath" obrigatório.', { status: 400 })

  const tipo = ((tipoRaw as string | undefined) ?? 'AUTO').toUpperCase() as TipoEscala

  if (!TIPOS_VALIDOS.includes(tipo))
    return new NextResponse(
      `Tipo inválido. Use ${TIPOS_VALIDOS.join(', ')}.`,
      { status: 400 },
    )

  const formato = detectaFormato(storagePath)
  if (!formato)
    return new NextResponse(
      'Extensão não suportada. Envie .xlsx ou .pdf.',
      { status: 400 },
    )

  if (tipo !== 'AUTO' && tipo !== 'DESCONHECIDO') {
    const formatoEsperado = FORMATO_ESPERADO[tipo]
    if (formato !== formatoEsperado)
      return new NextResponse(
        `Formato ${formato} não suportado para tipo ${tipo}. Envie em ${formatoEsperado}.`,
        { status: 501 },
      )
  }

  const svc = createServiceClient()
  const { data: fileBlob, error: downloadErr } = await svc.storage
    .from('escalas-raw')
    .download(storagePath)

  if (downloadErr || !fileBlob)
    return new NextResponse(
      `Erro ao baixar arquivo: ${downloadErr?.message ?? 'não encontrado'}`,
      { status: 500 },
    )

  const arrayBuffer = await fileBlob.arrayBuffer()
  let linhas: LinhaEscala[] = []
  let tipoDetectado: TipoEscala = tipo
  let aviso: string | undefined

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
          fn: () => parseEscalaGuanabaraPdf(Buffer.from(arrayBuffer), data ?? ''),
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

      if (linhas.length === 0) {
        try {
          const resultado = await parseEscalaUniversal(arrayBuffer, data, formato)
          if (resultado.length > 0) {
            linhas = resultado
            tipoDetectado = 'DESCONHECIDO'
            aviso =
              'Formato não reconhecido. Dados extraídos por heurística — verifique se as informações estão corretas antes de processar o KPI.'
          }
        } catch {
          // fallback também falhou
        }
      }

      if (linhas.length === 0)
        return new NextResponse(
          'Não foi possível detectar o tipo da escala.',
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
      linhas = await parseEscalaGuanabaraPdf(Buffer.from(arrayBuffer), data ?? '')
    } else {
      return new NextResponse(
        `Formato ${formato} não suportado para tipo ${tipo}.`,
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

  const linhasValidas: LinhaEscala[] = []
  const linhasProblematicas: LinhaProblematica[] = []

  for (const l of linhas) {
    const motivo = validaLinha(l)
    if (motivo) {
      linhasProblematicas.push({
        linha: l.raw_row_num ?? 0,
        motivo,
        conteudo: descricaoLinha(l),
      })
    } else {
      linhasValidas.push(l)
    }
  }

  return NextResponse.json({
    tipo_detectado: tipoDetectado,
    total_linhas: linhas.length,
    linhas_validas: linhasValidas,
    linhas_problematicas: linhasProblematicas,
    ...(aviso ? { aviso } : {}),
  })
}
