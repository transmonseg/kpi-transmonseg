import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { REDES } from '@/lib/kpi/redes'
import { gerarXlsxDia, type EntradaManualRow } from '@/lib/kpi/gerar-xlsx-manual'
import { ultimoDiaDoMes } from '@/lib/kpi/manual-import'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const svc = createServiceClient()
  const u = new URL(req.url)

  // re-download do KPI de um dia: ?download=DATA/REDE — regenerado a partir dos
  // dados salvos (kpi_manual_entradas), não depende de arquivo bruto guardado.
  const dl = u.searchParams.get('download')
  if (dl) {
    const [dataDia, redeId] = dl.split('/')
    if (!dataDia || !redeId) return new NextResponse('Formato esperado: DATA/REDE', { status: 400 })
    const { data: rows, error } = await svc.from('kpi_manual_entradas')
      .select('data, loja, placa, motorista, status, saida_cd, chd, sai, volta_base')
      .eq('rede_id', redeId).eq('data', dataDia)
      .order('id', { ascending: true })
    if (error) return new NextResponse(error.message, { status: 500 })
    const linhas = (rows ?? []) as EntradaManualRow[]
    if (linhas.length === 0) return new NextResponse('Não encontrado', { status: 404 })
    const buf = await gerarXlsxDia(redeId, dataDia, linhas)
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="KPI-${redeId}-${dataDia}.xlsx"`,
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

  // ?mes=YYYY-MM → por rede, quantos dias distintos e quantas linhas (lojas) já
  // tem no mês (pra aba Inserir mostrar "já enviado" no modo Mês inteiro, igual
  // já faz no modo Dia). Pagina pelo mesmo motivo do histórico completo.
  const soMes = u.searchParams.get('mes')
  if (soMes) {
    if (!/^\d{4}-\d{2}$/.test(soMes)) return new NextResponse('mes inválido (YYYY-MM)', { status: 400 })
    const PAGE = 1000
    const linhas: { data: string; rede_id: string }[] = []
    for (let from = 0; ; from += PAGE) {
      const { data: rows, error } = await svc.from('kpi_manual_entradas')
        .select('data, rede_id')
        .gte('data', `${soMes}-01`).lte('data', ultimoDiaDoMes(soMes))
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) return new NextResponse(error.message, { status: 500 })
      const lote = (rows ?? []) as { data: string; rede_id: string }[]
      linhas.push(...lote)
      if (lote.length < PAGE) break
    }
    const porRede: Record<string, { dias: Set<string>; lojas: number }> = {}
    for (const l of linhas) {
      const r = porRede[l.rede_id] ?? { dias: new Set<string>(), lojas: 0 }
      r.dias.add(l.data)
      r.lojas++
      porRede[l.rede_id] = r
    }
    const redes: Record<string, { dias: number; lojas: number }> = {}
    for (const [rede_id, r] of Object.entries(porRede)) redes[rede_id] = { dias: r.dias.size, lojas: r.lojas }
    return NextResponse.json({ mes: soMes, redes })
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
