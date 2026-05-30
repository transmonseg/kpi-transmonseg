import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { REDES } from '@/lib/kpi/redes'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const svc = createServiceClient()
  const u = new URL(req.url)

  // re-download do XLSX cru: ?download=DATA/REDE
  const dl = u.searchParams.get('download')
  if (dl) {
    const { data } = await svc.storage.from('kpi-manual-raw').download(`${dl}.xlsx`)
    if (!data) return new NextResponse('Não encontrado', { status: 404 })
    return new NextResponse(await data.arrayBuffer(), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${dl.replace('/', '-')}.xlsx"`,
      },
    })
  }

  // ?data=YYYY-MM-DD → retorna só as redes daquela data (pra aba Inserir saber o que já foi enviado)
  const soData = u.searchParams.get('data')
  if (soData) {
    const { data: rows } = await svc.from('kpi_manual_entradas').select('rede_id').eq('data', soData)
    const redes: Record<string, number> = {}
    for (const r of rows ?? []) redes[r.rede_id as string] = (redes[r.rede_id as string] ?? 0) + 1
    return NextResponse.json({ data: soData, redes })
  }

  // Histórico completo (sem filtro de data) → cresce além de 1000 linhas rápido.
  // Sem paginar, o teto do Supabase cortava dias e a completude por dia saía errada.
  const PAGE = 1000
  const todas: { data: string; rede_id: string }[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await svc.from('kpi_manual_entradas')
      .select('data, rede_id')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) break
    const lote = (data ?? []) as { data: string; rede_id: string }[]
    todas.push(...lote)
    if (lote.length < PAGE) break
  }
  const porDia = new Map<string, Record<string, number>>()
  for (const e of todas) {
    const d = porDia.get(e.data as string) ?? {}
    d[e.rede_id as string] = (d[e.rede_id as string] ?? 0) + 1
    porDia.set(e.data as string, d)
  }
  const dias = [...porDia.entries()]
    .map(([data, redes]) => ({ data, redes, completude: `${Object.keys(redes).length}/${REDES.length}` }))
    .sort((a, b) => b.data.localeCompare(a.data))
  return NextResponse.json({ dias })
}
