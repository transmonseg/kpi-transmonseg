import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { montarXlsxMensal } from '@/lib/kpi/export-mensal'
import type { EntradaManual } from '@/lib/kpi/parse-kpi-manual'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const u = new URL(req.url)
  const rede = u.searchParams.get('rede') ?? ''
  const mes = u.searchParams.get('mes') ?? new Date().toISOString().slice(0, 7)
  if (!rede) return new NextResponse('rede obrigatória', { status: 400 })
  if (!/^\d{4}-\d{2}$/.test(mes)) return new NextResponse('mês inválido (YYYY-MM)', { status: 400 })

  const svc = createServiceClient()
  const { data, error } = await svc.from('kpi_manual_entradas')
    .select('data, rede_id, loja, placa, motorista, status, saida_cd, chd, sai')
    .eq('rede_id', rede).gte('data', `${mes}-01`).lte('data', `${mes}-31`)
  if (error) return new NextResponse(error.message, { status: 500 })

  const buf = await montarXlsxMensal(rede, mes, (data ?? []) as EntradaManual[])
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="KPI-${rede}-${mes}.xlsx"`,
    },
  })
}
