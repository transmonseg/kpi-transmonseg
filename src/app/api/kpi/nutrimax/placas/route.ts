import { NextRequest, NextResponse } from 'next/server'
import { usuarioAtual } from '@/lib/supabase/usuario-atual'
import { getPerfil, podeOperarEmpresa } from '@/lib/perfil'
import { createServiceClient } from '@/lib/supabase/service'
import { EMPRESA_NUTRIMAX } from '@/lib/kpi-romaneio/constants'
import { normalizarPlacaDigitada } from '@/lib/kpi-romaneio/trocas-placa'
import type { PlacaSemRastreadorRow } from '@/lib/kpi-romaneio/placas-sem-rastreador'

// Tela "Placas do dia" (05/10, pedido da operação: "KPI ainda não tem espaço
// de alteração na Nutry"): placa sem rastreador (com vigência) e troca de
// placa do dia. As duas tabelas são lidas na geração do KPI.

const dataOk = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
const placaOk = (p: string) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p)

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
  const [sr, tr] = await Promise.all([
    svc.from('kpi_placa_sem_rastreador').select('*').eq('empresa', EMPRESA_NUTRIMAX).order('inicio', { ascending: false }),
    svc.from('kpi_troca_placa').select('*').eq('empresa', EMPRESA_NUTRIMAX).eq('data', data).order('criado_em'),
  ])
  if (sr.error || tr.error) return new NextResponse((sr.error ?? tr.error)!.message, { status: 500 })
  const linhas = (sr.data ?? []) as PlacaSemRastreadorRow[]
  return NextResponse.json({
    // Vigentes no dia (mesma regra de placasSemRastreadorNoDia).
    semRastreador: linhas.filter(l => l.inicio <= data && (l.fim == null || l.fim >= data)),
    trocas: tr.data ?? [],
  })
}

export async function POST(req: NextRequest) {
  const a = await acesso()
  if (!a.ok) return a.resp
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!b) return new NextResponse('Corpo inválido.', { status: 400 })
  const svc = createServiceClient()

  if (b.tipo === 'sem_rastreador') {
    const placa = normalizarPlacaDigitada(String(b.placa ?? ''))
    if (!placaOk(placa)) return new NextResponse('Placa inválida.', { status: 400 })
    if (!dataOk(b.inicio) || (b.fim != null && b.fim !== '' && !dataOk(b.fim))) return new NextResponse('Data inválida.', { status: 400 })
    const fim = b.fim ? String(b.fim) : null
    if (fim && fim < String(b.inicio)) return new NextResponse('A data final é antes da inicial.', { status: 400 })
    const { data, error } = await svc.from('kpi_placa_sem_rastreador').insert({
      empresa: EMPRESA_NUTRIMAX, placa, inicio: b.inicio, fim, motivo: b.motivo ? String(b.motivo).slice(0, 200) : null, responsavel: a.email,
    }).select().single()
    if (error) return new NextResponse(error.message, { status: 500 })
    return NextResponse.json(data)
  }

  if (b.tipo === 'troca') {
    const placaEscala = normalizarPlacaDigitada(String(b.placaEscala ?? ''))
    const placaReal = normalizarPlacaDigitada(String(b.placaReal ?? ''))
    if (!placaOk(placaEscala) || !placaOk(placaReal)) return new NextResponse('Placa inválida.', { status: 400 })
    if (placaEscala === placaReal) return new NextResponse('A placa que rodou é igual à da escala.', { status: 400 })
    if (!dataOk(b.data)) return new NextResponse('Data inválida.', { status: 400 })
    const carga = typeof b.carga === 'string' && b.carga.trim() !== '' ? b.carga.trim() : null
    const { data, error } = await svc.from('kpi_troca_placa').insert({
      empresa: EMPRESA_NUTRIMAX, data: b.data, carga, placa_escala: placaEscala, placa_real: placaReal, responsavel: a.email,
    }).select().single()
    if (error) return new NextResponse(error.message, { status: 500 })
    return NextResponse.json(data)
  }

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

/** Remover uma troca registrada por engano. */
export async function DELETE(req: NextRequest) {
  const a = await acesso()
  if (!a.ok) return a.resp
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return new NextResponse('Id inválido.', { status: 400 })
  const { error } = await createServiceClient().from('kpi_troca_placa').delete().eq('id', id).eq('empresa', EMPRESA_NUTRIMAX)
  if (error) return new NextResponse(error.message, { status: 500 })
  return NextResponse.json({ ok: true })
}
