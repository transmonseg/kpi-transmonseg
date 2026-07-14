import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseKpiNutrimaxXlsx } from '@/lib/kpi-nutrimax/parse-xlsx'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const form = await req.formData()
  const data = String(form.get('data') ?? '')
  const file = form.get('file')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida (YYYY-MM-DD)', { status: 400 })
  if (!(file instanceof File)) return new NextResponse('Arquivo obrigatório', { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const entradas = await parseKpiNutrimaxXlsx(buf, data)
  if (entradas.length === 0) {
    return new NextResponse('Nenhum cliente reconhecido na planilha (confira se é o XLSX gerado em "Gerar KPI").', { status: 422 })
  }

  const svc = createServiceClient()
  // Upload é por dia único — apaga e reinsere só esse dia (sem risco de perder outros
  // dias, diferente do upload mensal do Benassi).
  const { error: delError } = await svc.from('kpi_nutrimax_entradas').delete().eq('data', data)
  if (delError) return new NextResponse(delError.message, { status: 500 })

  const { error } = await svc
    .from('kpi_nutrimax_entradas')
    .insert(entradas.map(e => ({ ...e, uploaded_by: user.id })))
  if (error) return new NextResponse(error.message, { status: 500 })

  return NextResponse.json({ ok: true, data, inseridas: entradas.length })
}
