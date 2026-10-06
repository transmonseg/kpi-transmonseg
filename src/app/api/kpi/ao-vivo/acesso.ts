import { NextResponse } from 'next/server'
import { usuarioAtual } from '@/lib/supabase/usuario-atual'
import { getPerfil, podeOperarEmpresa } from '@/lib/perfil'
import { clienteAoVivoValido, type ClienteAoVivo } from '@/lib/kpi-romaneio/ao-vivo-servico'

/** KPI ao vivo: admin, ou operador com a empresa liberada (mesma regra de gerar). */
export async function acessoAoVivo(cliente: string | null):
  Promise<{ ok: true; cliente: ClienteAoVivo; email: string | null } | { ok: false; resp: NextResponse }> {
  const user = await usuarioAtual()
  if (!user) return { ok: false, resp: new NextResponse('Não autenticado', { status: 401 }) }
  if (!clienteAoVivoValido(cliente)) return { ok: false, resp: new NextResponse('Cliente inválido', { status: 400 }) }
  const perfil = await getPerfil(user.id)
  if (!podeOperarEmpresa(perfil, cliente)) return { ok: false, resp: new NextResponse('Sem permissão.', { status: 403 }) }
  return { ok: true, cliente, email: user.email ?? null }
}
