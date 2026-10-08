import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveUserDesktopAware } from './desktop-auth'
import { getPerfil } from '@/lib/perfil'
import { urlSupabaseServidor, nomeCookieSessao } from './url'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    urlSupabaseServidor(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: nomeCookieSessao() },
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
  // /cadastro fechado (auditoria de segurança, commit 1f82413): daqui pra frente
  // login novo só nasce de convite (/convite/<token>), gerado por admin/gerente.
  const isAuthPage = path.startsWith('/login')
  // /dashboard (e o alias antigo /apresentacao, que só redireciona pra lá) é o
  // link público sem login; a API que ele consome também precisa passar aqui.
  const isDashboardPublico = path === '/dashboard' || path.startsWith('/dashboard/') ||
    path === '/apresentacao' || path.startsWith('/apresentacao/') ||
    path === '/api/dashboard/publico'
  const isConvite = path.startsWith('/convite/')
  // Link de acesso reutilizável (sem login) — qualquer um com o slug cria a
  // própria conta, ver src/app/acesso/[slug]/.
  const isAcesso = path.startsWith('/acesso/')
  // Link público do KPI Manual (sem login) — token é a própria permissão,
  // ver /api/kpi-manual/link-publico (onde ele é gerado, isso sim autenticado).
  const isKpiPublico = path.startsWith('/kpi-publico/')
  const isPublic = path === '/' || isAuthPage || isDashboardPublico || isConvite || isAcesso || isKpiPublico

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Benassi saiu da operação (pedido do usuário 04/10/2026): telas travadas
  // com cadeado no menu pra todo mundo. Código e dados ficam (reversível:
  // tirar o prefixo daqui e o cadeado em nav.tsx / dashboard-kpi.tsx).
  const BENASSI_BLOQUEADO = [
    '/painel/kpi/simples', '/painel/kpi/visualizar', '/painel/kpi/revisar',
    '/painel/dashboard/beta', '/painel/dashboard/print', '/painel/historico',
    '/painel/lojas', '/painel/loja', '/painel/rankings',
  ]
  if (user && BENASSI_BLOQUEADO.some(p => path === p || path.startsWith(p + '/'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/painel'
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone()
    // Desktop cai na tela offline (Gerar KPI); site vai pro painel (dashboard).
    url.pathname = process.env.DESKTOP_APP === '1' ? '/painel/kpi/simples' : '/painel'
    return NextResponse.redirect(url)
  }

  // Login restrito (gerente/visualizador): só a tela de Dashboard (/painel), a
  // tela de convidados do gerente, e as APIs que a própria tela de Dashboard usa.
  // Qualquer outra rota do sistema (KPI, Lojas, Cozinha, Histórico) é bloqueada —
  // ver docs/superpowers/specs/2026-07-13-rbac-dashboard-design.md.
  if (user && !isPublic) {
    const perfil = await getPerfil(user.id)
    if (perfil.papel !== 'admin') {
      const podeBenassi = perfil.empresas.includes('benassi')
      // Operador: gera/vê só as empresas liberadas no perfil (rotas por empresa;
      // cada rota/layout rechecha empresa liberada). Hoje só Nutry Max tem tela
      // e API liberadas pra operador.
      const operadorNutry = perfil.papel === 'operador' && perfil.empresas.includes('nutrimax') && (
        path === '/painel/nutrimax' || path.startsWith('/painel/nutrimax/') ||
        path === '/painel/ao-vivo' || path.startsWith('/api/kpi/ao-vivo') ||
        path.startsWith('/api/kpi/nutrimax/') ||
        path.startsWith('/api/kpi/historico/')
      )
      // Monitoramento dentro da Central (05/10): equipe toda (o layout confere o papel).
      // Ao vivo da Rio Quality (05/10): operador com a Rio Quality liberada (a rota confere o cliente).
      // Rio Quality (06/10): mesmo acesso do operador da Nutry -- ao vivo, Gerar
      // KPI e Histórico da Rio Quality (cada rota/layout rechecha a empresa).
      const operadorAoVivoRq = perfil.papel === 'operador' && perfil.empresas.includes('rioquality') && (
        path === '/painel/ao-vivo' || path.startsWith('/api/kpi/ao-vivo') || path.startsWith('/api/kpi/historico/') ||
        path === '/painel/rioquality' || path.startsWith('/painel/rioquality/') || path.startsWith('/api/kpi/rioquality/')
      )
      // Login unico (08/10): o passe do quadro tambem (a rota confere o papel).
      const operadorMonitoramento = perfil.papel === 'operador' && (path === '/painel/monitoramento' || path.startsWith('/painel/monitoramento/') || path === '/api/monitoramento/passe')
      const permitido =
        operadorNutry || operadorAoVivoRq || operadorMonitoramento ||
        path === '/painel' ||
        // Dashboard por cliente: a rota confere empresa liberada e bloqueia
        // escrita (inserir/excluir) pra quem não é admin.
        path === '/api/dashboard-kpi' || path.startsWith('/api/dashboard-kpi/') ||
        (podeBenassi && (
          path === '/api/dashboard' ||
          path === '/api/dashboard/beta' ||
          path === '/api/dashboard/export-mensal' ||
          // Ver KPI Manual do dia (read-only) — qualquer papel logado com
          // acesso a Benassi acessa; a leitura filtra por perfil.redes.
          path === '/painel/kpi/visualizar' ||
          path === '/api/kpi-manual/dia' ||
          path === '/api/kpi-manual/export' ||
          // Gerar link público: admin/gerente podem, visualizador não (a rota
          // já rechecha isso, aqui é só pra não bloquear o gerente também).
          (path === '/api/kpi-manual/link-publico' && perfil.papel === 'gerente')
        )) ||
        (path === '/painel/usuarios' && perfil.papel === 'gerente')
      if (!permitido) {
        if (path.startsWith('/api/')) {
          return new NextResponse('Sem permissão.', { status: 403 })
        }
        const url = request.nextUrl.clone()
        url.pathname = '/painel'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}
