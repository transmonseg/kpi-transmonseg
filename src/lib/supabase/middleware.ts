import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveUserDesktopAware } from './desktop-auth'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // No site: getUser() normal. No app desktop offline: cai pra sessão local
  // (não expulsa pro /login quem já logou). No-op no web (DESKTOP_APP unset).
  const user = await resolveUserDesktopAware(supabase)

  const path = request.nextUrl.pathname
  // Auditoria de segurança: /cadastro criava conta sem convite/aprovação — qualquer
  // pessoa da internet virava usuário autenticado com acesso de service-role a
  // lojas/KPI de todos os clientes (nenhuma rota checa dono por rede). Fechado até
  // existir controle de acesso por rede — login continua liberado pros 5 usuários
  // já existentes.
  const isAuthPage = path.startsWith('/login')
  // /dashboard (e o alias antigo /apresentacao, que só redireciona pra lá) é o
  // link público sem login; a API que ele consome também precisa passar aqui.
  const isDashboardPublico = path === '/dashboard' || path.startsWith('/dashboard/') ||
    path === '/apresentacao' || path.startsWith('/apresentacao/') ||
    path === '/api/dashboard/publico'
  const isPublic = path === '/' || isAuthPage || isDashboardPublico

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone()
    // Desktop cai na tela offline (Gerar KPI); site vai pro painel (dashboard).
    url.pathname = process.env.DESKTOP_APP === '1' ? '/painel/kpi/simples' : '/painel'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
