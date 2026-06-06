import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { montarXlsxMensal, type RawDoDia } from '@/lib/kpi/export-mensal'
import { ultimoDiaDoMes } from '@/lib/kpi/manual-import'
import { mesBR } from '@/lib/data-br'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const u = new URL(req.url)
  const rede = u.searchParams.get('rede') ?? ''
  const mes = u.searchParams.get('mes') ?? mesBR()
  if (!rede) return new NextResponse('rede obrigatória', { status: 400 })
  if (!/^\d{4}-\d{2}$/.test(mes)) return new NextResponse('mês inválido (YYYY-MM)', { status: 400 })

  const svc = createServiceClient()
  // dias do mês em que esta rede tem KPI inserido. Pagina até esgotar: uma rede
  // cheia (várias lojas × até 31 dias) passa do teto de 1000 linhas do Supabase, e
  // sem paginar o export perdia dias silenciosamente. ORDER BY id estabiliza as
  // janelas; só precisamos das datas distintas no fim.
  const PAGE = 1000
  const datasRaw: string[] = []
  for (let from = 0; ; from += PAGE) {
    const { data: rows, error } = await svc.from('kpi_manual_entradas')
      .select('data')
      .eq('rede_id', rede).gte('data', `${mes}-01`).lte('data', ultimoDiaDoMes(mes))
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return new NextResponse(error.message, { status: 500 })
    const lote = (rows ?? []) as { data: string }[]
    datasRaw.push(...lote.map(r => r.data))
    if (lote.length < PAGE) break
  }
  const dias = [...new Set(datasRaw)].sort()

  // baixa o XLSX bruto que foi inserido em cada dia (preserva o layout original)
  const raws: RawDoDia[] = []
  for (const dataDia of dias) {
    const { data: blob } = await svc.storage.from('kpi-manual-raw').download(`${dataDia}/${rede}.xlsx`)
    if (!blob) continue
    raws.push({ dia: dataDia.slice(8, 10), buf: Buffer.from(await blob.arrayBuffer()) })
  }

  const buf = await montarXlsxMensal(raws)
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="KPI-${rede}-${mes}.xlsx"`,
    },
  })
}
