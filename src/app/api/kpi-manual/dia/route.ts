// GET /api/kpi-manual/dia?data=YYYY-MM-DD
// KPI de um dia pra visualização na tela ("Ver KPIs") — lê o KPI MANUAL
// (kpi_manual_entradas, o que a operação insere depois de corrigir), não o
// gerado bruto pelo sistema (kpi_simples). É o dado final/confiável que vai
// pro cliente. Agrupa por rede_id, filtra pelo perfil de quem pediu.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPerfil, redesEfetivas, empresaLiberada } from '@/lib/perfil'
import { agruparPorRede } from '@/lib/kpi/agrupar-manual'
import type { LinhaManual } from '@/lib/kpi/manual-tipos'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const url = new URL(req.url)
  const data = url.searchParams.get('data')
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return new NextResponse('"data" inválida (use YYYY-MM-DD)', { status: 400 })
  }

  const perfil = await getPerfil(user.id)
  if (!empresaLiberada(perfil, 'benassi')) return new NextResponse('Sem permissão.', { status: 403 })

  const svc = createServiceClient()
  const { data: rows, error } = await svc
    .from('kpi_manual_entradas')
    .select('rede_id, loja, placa, motorista, status, saida_cd, chd, sai, volta_base')
    .eq('data', data)
    .order('id', { ascending: true })
  if (error) return new NextResponse(error.message, { status: 500 })

  const linhas = (rows ?? []) as LinhaManual[]
  const todasRedesPresentes = [...new Set(linhas.map(l => l.rede_id))]
  const permitidas = new Set(redesEfetivas(perfil, todasRedesPresentes))

  const redes = agruparPorRede(linhas.filter(l => permitidas.has(l.rede_id)))

  return NextResponse.json({ data, redes, papel: perfil.papel })
}
