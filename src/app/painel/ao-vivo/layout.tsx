import { redirect } from 'next/navigation'
import { usuarioAtual } from '@/lib/supabase/usuario-atual'
import { getPerfil, podeOperarEmpresa } from '@/lib/perfil'
import { ContaAoVivo } from './conta-contexto'

export default async function AoVivoLayout({ children }: { children: React.ReactNode }) {
  const user = await usuarioAtual()
  if (!user) redirect('/login')
  const perfil = await getPerfil(user.id)
  if (!podeOperarEmpresa(perfil, 'nutrimax') && !podeOperarEmpresa(perfil, 'rioquality')) redirect('/painel')
  return <ContaAoVivo papel={perfil.papel}>{children}</ContaAoVivo>
}
