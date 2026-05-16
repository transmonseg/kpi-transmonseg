import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseAlteracaoText } from '@/lib/parsers/alteracao-text'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const formData = await req.formData().catch(() => null)
  if (!formData) return new NextResponse('FormData inválido', { status: 400 })

  const file = formData.get('file') as File | null
  const data_escala = formData.get('data_escala') as string | null

  if (!file) return new NextResponse('Arquivo obrigatório', { status: 400 })
  if (!data_escala || !/^\d{4}-\d{2}-\d{2}$/.test(data_escala))
    return new NextResponse('data_escala obrigatória (YYYY-MM-DD)', { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  let textoExtraido: string

  try {
    if (ext === 'pdf') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await pdfParse(buffer as any)
      textoExtraido = result.text
    } else if (ext === 'xlsx' || ext === 'xls') {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await wb.xlsx.load(buffer as any)
      const ws = wb.worksheets[0]
      if (!ws) return new NextResponse('Planilha sem abas', { status: 400 })
      const linhas: string[] = []
      ws.eachRow((row) => {
        const vals = (row.values as unknown[])
          .slice(1)
          .map((v) => String(v ?? '').trim())
        if (vals.some((v) => v)) linhas.push(vals.join(' | '))
      })
      textoExtraido = linhas.join('\n')
    } else {
      return new NextResponse('Formato não suportado. Use PDF ou XLSX.', { status: 400 })
    }
  } catch (e) {
    return new NextResponse(
      `Erro ao extrair arquivo: ${e instanceof Error ? e.message : String(e)}`,
      { status: 500 },
    )
  }

  if (!textoExtraido.trim())
    return new NextResponse('Arquivo sem conteúdo legível', { status: 422 })

  try {
    const parsed = parseAlteracaoText(textoExtraido)
    return NextResponse.json({
      ...parsed,
      data_escala,
      tipo_arquivo: ext,
      texto_extraido: textoExtraido.slice(0, 500),
    })
  } catch (e) {
    return new NextResponse(
      e instanceof Error ? e.message : 'Erro ao parsear alteração.',
      { status: 500 },
    )
  }
}
