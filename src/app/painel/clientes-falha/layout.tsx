import { redirect } from 'next/navigation'
import { usuarioAtual } from '@/lib/supabase/usuario-atual'
import { getPerfil, podeOperarEmpresa } from '@/lib/perfil'

// F4-07 (D-08): mesma regra da rota /api/kpi/ponto-cliente -- admin, ou
// operador com a Nutry liberada (Érica, Ana). Gerente/visualizador não entram.
export default async function ClientesFalhaLayout({ children }: { children: React.ReactNode }) {
  const user = await usuarioAtual()
  if (!user) redirect('/login')
  const perfil = await getPerfil(user.id)
  if (!podeOperarEmpresa(perfil, 'nutrimax')) redirect('/painel')
  return <>{children}</>
}
