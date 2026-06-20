import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseKpiManual, parseKpiManualTodasAbas } from '@/lib/kpi/parse-kpi-manual'
import { replaceEntradasManualMes, deleteEntradasManualMes, ultimoDiaDoMes } from '@/lib/kpi/manual-import'
import { puxarResumoDoPdfDoDia } from '@/lib/kpi/resumo-do-pdf'

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
    // sobrescreve o mês inteiro desta rede numa RPC transacional
    try {
      await replaceEntradasManualMes(svc, rede_id, mes, entradas, user.id)
    } catch (e) {
      return new NextResponse(e instanceof Error ? e.message : 'Erro ao importar KPI manual do mês', { status: 500 })
    }
    // sobe o XLSX cru por dia detectado (best-effort; alimenta o export mensal)
    await Promise.all(dias.map(d =>
      svc.storage.from('kpi-manual-raw').upload(`${d}/${rede_id}.xlsx`, buf, { upsert: true, contentType: XLSX_CT }),
    ))
    // puxa as paradas indevidas do PDF do Unitrac de cada dia (se já estiver no banco)
    // pra o mapa aparecer nos dias inseridos só pela planilha. Best-effort, sequencial
    // pra não estourar memória parseando vários PDFs ao mesmo tempo.
    for (const d of dias) { await puxarResumoDoPdfDoDia(svc, d) }
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
  // puxa as paradas indevidas do PDF do Unitrac deste dia (se já estiver no banco)
  await puxarResumoDoPdfDoDia(svc, data)
  return NextResponse.json({ ok: true, rede_id, data, inseridas: entradas.length })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const u = new URL(req.url)
  const data = u.searchParams.get('data') ?? ''
  const mes = u.searchParams.get('mes') ?? ''
  const rede_id = u.searchParams.get('rede_id') ?? ''
  if (!rede_id) return new NextResponse('rede_id obrigatório', { status: 400 })

  const svc = createServiceClient()

  // Modo MÊS: apaga as entradas da rede no mês inteiro (espelho do upload mensal).
  // Antes o "Limpar" do modo mês só limpava o visual — os dados ficavam no banco.
  if (mes) {
    if (!/^\d{4}-\d{2}$/.test(mes)) return new NextResponse('mes inválido (YYYY-MM)', { status: 400 })
    await deleteEntradasManualMes(svc, rede_id, mes)
    // remove os XLSX crus de cada dia do mês (best-effort)
    const ultimo = Number(ultimoDiaDoMes(mes).slice(-2))
    const alvos = Array.from({ length: ultimo }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}/${rede_id}.xlsx`)
    await svc.storage.from('kpi-manual-raw').remove(alvos)
    return NextResponse.json({ ok: true, mes, rede_id })
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('data (YYYY-MM-DD) ou mes (YYYY-MM) obrigatório', { status: 400 })
  await svc.from('kpi_manual_entradas').delete().eq('data', data).eq('rede_id', rede_id)
  await svc.storage.from('kpi-manual-raw').remove([`${data}/${rede_id}.xlsx`])
  return NextResponse.json({ ok: true })
}
