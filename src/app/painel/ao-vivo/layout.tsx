import { redirect } from 'next/navigation'
import { usuarioAtual } from '@/lib/supabase/usuario-atual'
import { getPerfil, podeOperarEmpresa } from '@/lib/perfil'

export default async function AoVivoLayout({ children }: { children: React.ReactNode }) {
  const user = await usuarioAtual()
  if (!user) redirect('/login')
  const perfil = await getPerfil(user.id)
  if (!podeOperarEmpresa(perfil, 'nutrimax')) redirect('/painel')
  return <>{children}</>
}
