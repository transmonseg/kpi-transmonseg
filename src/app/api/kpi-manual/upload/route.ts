import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseKpiManual, parseKpiManualTodasAbas } from '@/lib/kpi/parse-kpi-manual'

export const runtime = 'nodejs'
export const maxDuration = 120

const XLSX_CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const form = await req.formData()
  const mes = String(form.get('mes') ?? '')    // 'YYYY-MM' → modo MÊS INTEIRO (auto-detecta abas-dia)
  const data = String(form.get('data') ?? '')  // 'YYYY-MM-DD' → modo aba única (legado)
  const rede_id = String(form.get('rede_id') ?? '')
  const file = form.get('file')
  if (!rede_id) return new NextResponse('rede_id obrigatório', { status: 400 })
  if (!(file instanceof File)) return new NextResponse('Arquivo obrigatório', { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const svc = createServiceClient()

  // ── Modo MÊS INTEIRO: lê todas as abas-dia da planilha e importa o mês todo ──
  if (mes) {
    if (!/^\d{4}-\d{2}$/.test(mes)) return new NextResponse('Mês inválido (use YYYY-MM)', { status: 400 })
    const { entradas, dias } = await parseKpiManualTodasAbas(buf, rede_id, mes)
    if (entradas.length === 0) {
      return new NextResponse('Nenhuma aba-dia reconhecida na planilha (abas devem ser o número do dia, ex "19")', { status: 422 })
    }
    // sobrescreve o mês inteiro desta rede
    await svc.from('kpi_manual_entradas').delete().eq('rede_id', rede_id).gte('data', `${mes}-01`).lte('data', `${mes}-31`)
    const rows = entradas.map(e => ({ ...e, uploaded_by: user.id }))
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await svc.from('kpi_manual_entradas').insert(rows.slice(i, i + 500))
      if (error) return new NextResponse(error.message, { status: 500 })
    }
    // sobe o XLSX cru por dia detectado (best-effort; alimenta o export mensal)
    await Promise.all(dias.map(d =>
      svc.storage.from('kpi-manual-raw').upload(`${d}/${rede_id}.xlsx`, buf, { upsert: true, contentType: XLSX_CT }),
    ))
    return NextResponse.json({ ok: true, rede_id, mes, dias: dias.length, inseridas: entradas.length })
  }

  // ── Modo aba única (legado): uma data específica ──
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Informe "mes" (YYYY-MM) ou "data" (YYYY-MM-DD)', { status: 400 })
  const entradas = await parseKpiManual(buf, rede_id, data)
  if (entradas.length === 0) {
    return new NextResponse('Nenhuma loja reconhecida na planilha (confira se a aba do dia existe)', { status: 422 })
  }
  await svc.from('kpi_manual_entradas').delete().eq('data', data).eq('rede_id', rede_id)
  const { error } = await svc.from('kpi_manual_entradas').insert(entradas.map(e => ({ ...e, uploaded_by: user.id })))
  if (error) return new NextResponse(error.message, { status: 500 })
  await svc.storage.from('kpi-manual-raw').upload(`${data}/${rede_id}.xlsx`, buf, { upsert: true, contentType: XLSX_CT })
  return NextResponse.json({ ok: true, rede_id, data, inseridas: entradas.length })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const u = new URL(req.url)
  const data = u.searchParams.get('data') ?? ''
  const rede_id = u.searchParams.get('rede_id') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !rede_id) return new NextResponse('data e rede_id obrigatórios', { status: 400 })

  const svc = createServiceClient()
  await svc.from('kpi_manual_entradas').delete().eq('data', data).eq('rede_id', rede_id)
  await svc.storage.from('kpi-manual-raw').remove([`${data}/${rede_id}.xlsx`])
  return NextResponse.json({ ok: true })
}
