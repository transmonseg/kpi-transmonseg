import { NextRequest, NextResponse } from 'next/server'
import { usuarioAtual } from '@/lib/supabase/usuario-atual'
import { getPerfil, podeOperarEmpresa } from '@/lib/perfil'
import { lerEntradaGuardadaNutrimax } from '@/lib/kpi-romaneio/entrada-guardada'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Tela Gerar KPI: o romaneio desse dia já está guardado? (Ao vivo ou geração anterior)
export async function GET(req: NextRequest) {
  const user = await usuarioAtual()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })
  if (!podeOperarEmpresa(await getPerfil(user.id), 'nutrimax')) return new NextResponse('Sem permissão.', { status: 403 })
  const data = req.nextUrl.searchParams.get('data') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida', { status: 400 })
  const g = await lerEntradaGuardadaNutrimax(data)
  if (!g) return NextResponse.json(null)
  const linhas = [...g.entrada.romaneio, ...g.entrada.pao.linhas]
  return NextResponse.json({ enviadoEm: g.enviadoEm, origem: g.origem, nfs: linhas.length, placas: new Set(linhas.map(l => l.placa)).size, escala: g.entrada.escalaEnviada, pao: g.entrada.paoEnviado })
}
