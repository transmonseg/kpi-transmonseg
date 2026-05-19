import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

export type KpiDoDia = {
  kpi_id: string
  rede_id: string
  rede_nome: string
  status: string
  qtd_linhas: number
  qtd_anomalias_high: number
  qtd_anomalias_medium: number
  qtd_anomalias_low: number
  xlsx_path: string | null
  pdf_path: string | null
  gerada_em: string | null
  analise_ia: string | null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { searchParams } = new URL(req.url)
  const data = searchParams.get('data')

  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data))
    return new NextResponse('Parâmetro data inválido. Use YYYY-MM-DD.', { status: 400 })

  const svc = createServiceClient()

  const { data: rows, error } = await svc
    .from('kpis')
    .select(`
      id, rede_id, status,
      qtd_linhas, qtd_anomalias_high, qtd_anomalias_medium, qtd_anomalias_low,
      xlsx_path, pdf_path, gerada_em, analise_ia,
      redes ( nome )
    `)
    .eq('data', data)
    .order('rede_id')

  if (error) return new NextResponse(error.message, { status: 500 })

  const result: KpiDoDia[] = (rows ?? []).map((r) => {
    const redes = r.redes as { nome?: string } | { nome?: string }[] | null
    const rede_nome =
      (Array.isArray(redes) ? redes[0]?.nome : redes?.nome) ?? (r.rede_id as string)
    return {
      kpi_id: r.id as string,
      rede_id: r.rede_id as string,
      rede_nome,
      status: r.status as string,
      qtd_linhas: (r.qtd_linhas as number | null) ?? 0,
      qtd_anomalias_high: (r.qtd_anomalias_high as number | null) ?? 0,
      qtd_anomalias_medium: (r.qtd_anomalias_medium as number | null) ?? 0,
      qtd_anomalias_low: (r.qtd_anomalias_low as number | null) ?? 0,
      xlsx_path: r.xlsx_path as string | null,
      pdf_path: r.pdf_path as string | null,
      gerada_em: r.gerada_em as string | null,
      analise_ia: r.analise_ia as string | null,
    }
  })

  return NextResponse.json(result)
}
