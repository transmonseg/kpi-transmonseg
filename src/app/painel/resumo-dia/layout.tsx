import { redirect } from 'next/navigation'
import { usuarioAtual } from '@/lib/supabase/usuario-atual'
import { getPerfil, podeOperarEmpresa } from '@/lib/perfil'

// F3-02: mesma regra de acesso do Ao vivo (admin, ou operador com Nutry/RQ).
export default async function ResumoDiaLayout({ children }: { children: React.ReactNode }) {
  const user = await usuarioAtual()
  if (!user) redirect('/login')
  const perfil = await getPerfil(user.id)
  if (!podeOperarEmpresa(perfil, 'nutrimax') && !podeOperarEmpresa(perfil, 'rioquality')) redirect('/painel')
  return <>{children}</>
}
