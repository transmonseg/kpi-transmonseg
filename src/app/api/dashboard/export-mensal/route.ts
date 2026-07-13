import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { gerarXlsxMes, type EntradaManualRow } from '@/lib/kpi/gerar-xlsx-manual'
import { ultimoDiaDoMes } from '@/lib/kpi/manual-import'
import { mesBR } from '@/lib/data-br'
import { getPerfil } from '@/lib/perfil'

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

  // Login restrito (gerente/visualizador) só baixa a(s) rede(s) que o perfil permite.
  const perfil = await getPerfil(user.id)
  if (perfil.papel !== 'admin' && !perfil.redes.includes(rede)) {
    return new NextResponse('Sem permissão pra essa rede.', { status: 403 })
  }

  const svc = createServiceClient()
  // Regenera a planilha a partir dos dados salvos (kpi_manual_entradas) — não
  // depende de arquivo bruto guardado no storage. Pagina até esgotar: uma rede
  // cheia (várias lojas × até 31 dias) passa do teto de 1000 linhas do Supabase.
  const PAGE = 1000
  const linhas: EntradaManualRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data: rows, error } = await svc.from('kpi_manual_entradas')
      .select('data, loja, placa, motorista, status, saida_cd, chd, sai, volta_base')
      .eq('rede_id', rede).gte('data', `${mes}-01`).lte('data', ultimoDiaDoMes(mes))
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return new NextResponse(error.message, { status: 500 })
    const lote = (rows ?? []) as EntradaManualRow[]
    linhas.push(...lote)
    if (lote.length < PAGE) break
  }

  if (linhas.length === 0) return new NextResponse('Nenhum KPI encontrado para essa rede/mês', { status: 404 })

  const porDia = new Map<string, EntradaManualRow[]>()
  for (const l of linhas) {
    const arr = porDia.get(l.data) ?? []
    arr.push(l)
    porDia.set(l.data, arr)
  }

  const buf = await gerarXlsxMes(rede, mes, porDia)
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="KPI-${rede}-${mes}.xlsx"`,
    },
  })
}
