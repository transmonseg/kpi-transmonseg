import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseKpiManual } from '@/lib/kpi/parse-kpi-manual'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const form = await req.formData()
  const data = String(form.get('data') ?? '')
  const rede_id = String(form.get('rede_id') ?? '')
  const file = form.get('file')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida', { status: 400 })
  if (!rede_id) return new NextResponse('rede_id obrigatório', { status: 400 })
  if (!(file instanceof File)) return new NextResponse('Arquivo obrigatório', { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const entradas = await parseKpiManual(buf, rede_id, data)
  if (entradas.length === 0) {
    return new NextResponse('Nenhuma loja reconhecida na planilha (confira se a aba do dia existe)', { status: 422 })
  }

  const svc = createServiceClient()
  // sobrescreve entradas anteriores do mesmo dia+rede
  await svc.from('kpi_manual_entradas').delete().eq('data', data).eq('rede_id', rede_id)
  const { error } = await svc.from('kpi_manual_entradas').insert(entradas.map(e => ({ ...e, uploaded_by: user.id })))
  if (error) return new NextResponse(error.message, { status: 500 })

  await svc.storage.from('kpi-manual-raw').upload(`${data}/${rede_id}.xlsx`, buf, {
    upsert: true,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  return NextResponse.json({ ok: true, rede_id, data, inseridas: entradas.length })
}
