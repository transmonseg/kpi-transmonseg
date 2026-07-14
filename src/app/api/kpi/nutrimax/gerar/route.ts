import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseRomaneioNutrimax } from '@/lib/kpi-nutrimax/parse-romaneio'
import { cruzaRomaneioAlvosNutrimax } from '@/lib/kpi-nutrimax/matcher'
import { gerarKpiNutrimax } from '@/lib/kpi-nutrimax/gerador'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const form = await req.formData()
  const data = String(form.get('data') ?? '')
  const file = form.get('file')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida (YYYY-MM-DD)', { status: 400 })
  if (!(file instanceof File)) return new NextResponse('Romaneio (PDF) obrigatório', { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const linhas = await parseRomaneioNutrimax(buf)
  if (linhas.length === 0) {
    return new NextResponse('Nenhum cliente reconhecido no romaneio — confira se o PDF é o "Romaneio de Entrega".', { status: 422 })
  }

  const entradas = await cruzaRomaneioAlvosNutrimax(linhas, data)
  const xlsxBuf = await gerarKpiNutrimax(entradas)

  return new NextResponse(xlsxBuf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="KPI-Nutrimax-${data}.xlsx"`,
    },
  })
}
