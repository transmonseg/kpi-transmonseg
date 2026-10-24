import { NextRequest, NextResponse } from 'next/server'
import { usuarioAtual } from '@/lib/supabase/usuario-atual'
import { getPerfil, podeOperarEmpresa } from '@/lib/perfil'
import { createServiceClient } from '@/lib/supabase/service'
import { EMPRESA_NUTRIMAX } from '@/lib/kpi-romaneio/constants'
import { completarPlaca } from '@/lib/kpi-romaneio/trocas-placa'
import type { SugestaoTroca } from '@/lib/kpi-romaneio/sugerir-trocas'
import { buscarFrota } from '@/lib/unitrac-api'
import { COD_USER_NUTRIMAX } from '@/lib/kpi-romaneio/constants'
import type { PlacaSemRastreadorRow } from '@/lib/kpi-romaneio/placas-sem-rastreador'

// Tela "Placas do dia" (05/10, pedido da operação: "KPI ainda não tem espaço
// de alteração na Nutry"): placa sem rastreador (com vigência) e troca de
// placa do dia. As duas tabelas são lidas na geração do KPI.

const dataOk = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

// Placa digitada só pelo final ("9C84", 06/10): completa pela frota da Unitrac.
// Placa inteira não consulta nada.
async function placaDaFrota(digitada: string): Promise<{ placa: string } | { erro: string }> {
  const direta = completarPlaca(digitada, [])
  if ('placa' in direta || direta.erro === 'Placa inválida.') return direta
  const frota = await buscarFrota(COD_USER_NUTRIMAX).catch(() => [])
  if (frota.length === 0) return { erro: 'Não consegui consultar a frota agora. Digite a placa inteira.' }
  return completarPlaca(digitada, frota.map(v => v.placaNorm))
}

async function acesso(): Promise<{ ok: true; email: string } | { ok: false; resp: NextResponse }> {
  const user = await usuarioAtual()
  if (!user) return { ok: false, resp: new NextResponse('Não autenticado', { status: 401 }) }
  const perfil = await getPerfil(user.id)
  if (!podeOperarEmpresa(perfil, 'nutrimax')) return { ok: false, resp: new NextResponse('Sem permissão.', { status: 403 }) }
  return { ok: true, email: user.email ?? user.id }
}

export async function GET(req: NextRequest) {
  const a = await acesso()
  if (!a.ok) return a.resp
  const data = req.nextUrl.searchParams.get('data')
  if (!dataOk(data)) return new NextResponse('Data inválida.', { status: 400 })
  const svc = createServiceClient()
  const [sr, tr, calc] = await Promise.all([
    svc.from('kpi_placa_sem_rastreador').select('*').eq('empresa', EMPRESA_NUTRIMAX).order('inicio', { ascending: false }),
    svc.from('kpi_troca_placa').select('*').eq('empresa', EMPRESA_NUTRIMAX).eq('data', data).order('criado_em'),
    // F1-03: sugestões do último cálculo do dia (também de dia fechado).
    svc.from('kpi_ao_vivo_calculo').select('resultado').eq('cliente', 'nutrimax').eq('data', data).maybeSingle(),
  ])
  if (sr.error || tr.error) return new NextResponse((sr.error ?? tr.error)!.message, { status: 500 })
  const sugestoes = ((calc?.data?.resultado as { sugestoesTroca?: SugestaoTroca[] } | null)?.sugestoesTroca) ?? []
  const linhas = (sr.data ?? []) as PlacaSemRastreadorRow[]
  return NextResponse.json({
    // Vigentes no dia (mesma regra de placasSemRastreadorNoDia).
    semRastreador: linhas.filter(l => l.inicio <= data && (l.fim == null || l.fim >= data)),
    trocas: tr.data ?? [],
    sugestoes,
  })
}

export async function POST(req: NextRequest) {
  const a = await acesso()
  if (!a.ok) return a.resp
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!b) return new NextResponse('Corpo inválido.', { status: 400 })
  const svc = createServiceClient()

  if (b.tipo === 'sem_rastreador') {
    const pl = await placaDaFrota(String(b.placa ?? ''))
    if ('erro' in pl) return new NextResponse(pl.erro, { status: 400 })
    const placa = pl.placa
    if (!dataOk(b.inicio) || (b.fim != null && b.fim !== '' && !dataOk(b.fim))) return new NextResponse('Data inválida.', { status: 400 })
    const fim = b.fim ? String(b.fim) : null
    if (fim && fim < String(b.inicio)) return new NextResponse('A data final é antes da inicial.', { status: 400 })
    const { data, error } = await svc.from('kpi_placa_sem_rastreador').insert({
      empresa: EMPRESA_NUTRIMAX, placa, inicio: b.inicio, fim, motivo: b.motivo ? String(b.motivo).slice(0, 200) : null, responsavel: a.email,
    }).select().single()
    if (error) return new NextResponse(error.message, { status: 500 })
    return NextResponse.json(data)
  }

  // D-28 (F1-05): troca de placa agora vai pela MESMA rota do Ao vivo
  // (/api/kpi/ao-vivo/troca, com `data`), que também move as NFs no
  // monitoramento. Gravar só aqui deixava o monitoramento no carro errado.
  if (b.tipo === 'troca') return new NextResponse('Troca de placa é registrada pela rota do Ao vivo (/api/kpi/ao-vivo/troca).', { status: 400 })

  return new NextResponse('Tipo inválido.', { status: 400 })
}

/** Encerrar sem rastreador ("voltou a rastrear"): grava `fim`. */
export async function PATCH(req: NextRequest) {
  const a = await acesso()
  if (!a.ok) return a.resp
  const b = await req.json().catch(() => null) as { id?: number; fim?: string } | null
  if (!b?.id || !dataOk(b.fim)) return new NextResponse('Dados inválidos.', { status: 400 })
  const { error } = await createServiceClient().from('kpi_placa_sem_rastreador').update({ fim: b.fim }).eq('id', b.id).eq('empresa', EMPRESA_NUTRIMAX)
  if (error) return new NextResponse(error.message, { status: 500 })
  return NextResponse.json({ ok: true })
}
