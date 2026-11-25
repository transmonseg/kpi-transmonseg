import { NextResponse } from 'next/server'
import { usuarioAtual } from '@/lib/supabase/usuario-atual'
import { getPerfil, empresaLiberada, podeOperarEmpresa } from '@/lib/perfil'
import { clienteDashValido, type ClienteDash } from '@/lib/kpi-romaneio/dashboard-kpis'
import { buscarLinkDashboard, dentroDoLink } from '@/lib/kpi-romaneio/dashboard-link'

/** Leitura: qualquer login com a empresa liberada. Escrita: admin ou operador da empresa. */
export async function checarAcesso(cliente: string | null, escrita = false):
  Promise<{ ok: true; cliente: ClienteDash; email: string | null } | { ok: false; resp: NextResponse }> {
  const user = await usuarioAtual()
  if (!user) return { ok: false, resp: new NextResponse('Não autenticado', { status: 401 }) }
  if (!cliente || !clienteDashValido(cliente)) return { ok: false, resp: new NextResponse('Cliente inválido', { status: 400 }) }
  const perfil = await getPerfil(user.id)
  if (!empresaLiberada(perfil, cliente) || (escrita && !podeOperarEmpresa(perfil, cliente))) {
    return { ok: false, resp: new NextResponse('Sem permissão.', { status: 403 }) }
  }
  return { ok: true, cliente, email: user.email ?? null }
}

export const dataValida = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

/** 25/11: leitura com login OU com ?link=<token> (Dashboard compartilhado):
 *  com link, só o cliente e as datas dentro do período do link. */
export async function checarLeitura(sp: URLSearchParams):
  Promise<{ ok: true; cliente: ClienteDash; email: string | null } | { ok: false; resp: NextResponse }> {
  const token = sp.get('link')
  if (!token) return checarAcesso(sp.get('cliente'))
  const l = await buscarLinkDashboard(token)
  if (!l) return { ok: false, resp: new NextResponse('Link inválido.', { status: 404 }) }
  const de = sp.get('de') ?? sp.get('data'), ate = sp.get('ate') ?? sp.get('data')
  if (sp.get('cliente') !== l.cliente || !dataValida(de) || !dataValida(ate) || !dentroDoLink(l, de, ate)) {
    return { ok: false, resp: new NextResponse('Fora do período deste link.', { status: 403 }) }
  }
  return { ok: true, cliente: l.cliente, email: null }
}
