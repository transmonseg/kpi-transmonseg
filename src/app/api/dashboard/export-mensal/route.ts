import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { montarXlsxMensal, type RawDoDia } from '@/lib/kpi/export-mensal'
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
  // dias do mês em que esta rede tem KPI inserido
  const { data: rows, error } = await svc.from('kpi_manual_entradas')
    .select('data')
    .eq('rede_id', rede).gte('data', `${mes}-01`).lte('data', `${mes}-31`)
  if (error) return new NextResponse(error.message, { status: 500 })
  const dias = [...new Set((rows ?? []).map(r => r.data as string))].sort()

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
