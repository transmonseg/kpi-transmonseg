import { NextResponse } from 'next/server'
import { usuarioAtual } from '@/lib/supabase/usuario-atual'
import { getPerfil } from '@/lib/perfil'
import { assinarPasse } from '@/lib/passe-central'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Passe pro quadro do monitoramento entrar na conta de quem esta' logado aqui
// (ver src/lib/passe-central.ts). Mesma regra do layout /painel/monitoramento.
export async function GET() {
  const user = await usuarioAtual()
  if (!user?.email) return new NextResponse('Não autenticado', { status: 401 })
  const perfil = await getPerfil(user.id)
  if (perfil.papel !== 'admin' && perfil.papel !== 'operador') return new NextResponse('Sem permissão.', { status: 403 })
  const segredo = process.env.PASSE_CENTRAL_SECRET
  if (!segredo) return new NextResponse('PASSE_CENTRAL_SECRET ausente', { status: 500 })
  return NextResponse.json({ passe: assinarPasse(user.email, segredo, Math.floor(Date.now() / 1000)) }, { headers: { 'Cache-Control': 'no-store' } })
}
