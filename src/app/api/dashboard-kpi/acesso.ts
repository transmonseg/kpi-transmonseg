import { NextResponse } from 'next/server'
import { usuarioAtual } from '@/lib/supabase/usuario-atual'
import { getPerfil, empresaLiberada } from '@/lib/perfil'
import { clienteDashValido, type ClienteDash } from '@/lib/kpi-romaneio/dashboard-kpis'

/** Leitura: qualquer login com a empresa liberada. Escrita: só admin. */
export async function checarAcesso(cliente: string | null, escrita = false):
  Promise<{ ok: true; cliente: ClienteDash; email: string | null } | { ok: false; resp: NextResponse }> {
  const user = await usuarioAtual()
  if (!user) return { ok: false, resp: new NextResponse('Não autenticado', { status: 401 }) }
  if (!cliente || !clienteDashValido(cliente)) return { ok: false, resp: new NextResponse('Cliente inválido', { status: 400 }) }
  const perfil = await getPerfil(user.id)
  if (!empresaLiberada(perfil, cliente) || (escrita && perfil.papel !== 'admin')) {
    return { ok: false, resp: new NextResponse('Sem permissão.', { status: 403 }) }
  }
  return { ok: true, cliente, email: user.email ?? null }
}

export const dataValida = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
