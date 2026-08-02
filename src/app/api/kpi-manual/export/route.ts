import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { gerarXlsxDia, type EntradaManualRow } from '@/lib/kpi/gerar-xlsx-manual'
import { getPerfil, redesEfetivas } from '@/lib/perfil'

export const runtime = 'nodejs'

/** Baixa de volta o KPI de UM dia — regenerado a partir dos dados salvos em
 *  kpi_manual_entradas (o arquivo bruto não fica guardado no storage). */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const u = new URL(req.url)
  const rede = u.searchParams.get('rede') ?? ''
  const data = u.searchParams.get('data') ?? ''
  if (!rede) return new NextResponse('rede obrigatória', { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('data inválida (YYYY-MM-DD)', { status: 400 })

  // Este endpoint agora é acessível por qualquer papel logado (botão "Baixar
  // XLSX" do Ver KPIs) — sem essa checagem, trocar ?rede= na URL vazava dado
  // de rede fora do perfil de quem pediu.
  const perfil = await getPerfil(user.id)
  if (!redesEfetivas(perfil, [rede]).includes(rede)) {
    return new NextResponse('Sem permissão para esta rede.', { status: 403 })
  }

  const svc = createServiceClient()
  const { data: rows, error } = await svc.from('kpi_manual_entradas')
    .select('data, loja, placa, motorista, status, saida_cd, chd, sai, volta_base')
    .eq('rede_id', rede).eq('data', data)
    .order('id', { ascending: true })
  if (error) return new NextResponse(error.message, { status: 500 })

  const linhas = (rows ?? []) as EntradaManualRow[]
  if (linhas.length === 0) return new NextResponse('Nenhum KPI encontrado para essa rede/dia', { status: 404 })

  const buf = await gerarXlsxDia(rede, data, linhas)
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="KPI-${rede}-${data}.xlsx"`,
    },
  })
}
