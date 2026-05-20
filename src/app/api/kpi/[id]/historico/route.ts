import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { id } = await params
  const svc = createServiceClient()

  const { data, error } = await svc
    .from('kpi_geracoes')
    .select('id, evento, gerada_em, gerada_por, qtd_linhas, qtd_anomalias_high, qtd_anomalias_medium, qtd_anomalias_low, xlsx_path, pdf_path, status, payload_json')
    .eq('kpi_id', id)
    .order('gerada_em', { ascending: false })
    .limit(50)

  if (error) return new NextResponse(error.message, { status: 500 })

  const itens = data ?? []

  // Coleta paths únicos pra assinar em batch
  const paths = new Set<string>()
  for (const it of itens) {
    if (it.xlsx_path) paths.add(it.xlsx_path)
    if (it.pdf_path) paths.add(it.pdf_path)
  }

  const urlByPath: Record<string, string> = {}
  if (paths.size > 0) {
    const signed = await Promise.all(
      Array.from(paths).map(async (p) => {
        const r = await svc.storage.from('kpis-gerados').createSignedUrl(p, 604800)
        return { p, url: r.data?.signedUrl ?? null }
      }),
    )
    for (const s of signed) {
      if (s.url) urlByPath[s.p] = s.url
    }
  }

  const historico = itens.map((it) => ({
    ...it,
    xlsx_url: it.xlsx_path ? urlByPath[it.xlsx_path] ?? null : null,
    pdf_url: it.pdf_path ? urlByPath[it.pdf_path] ?? null : null,
  }))

  return NextResponse.json({ historico })
}
