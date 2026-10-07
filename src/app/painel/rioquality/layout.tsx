import { redirect } from 'next/navigation'
import { usuarioAtual } from '@/lib/supabase/usuario-atual'
import { getPerfil, podeOperarEmpresa } from '@/lib/perfil'

// Mesmo gate do layout da Nutry Max (06/10): admin, ou operador com a Rio
// Quality liberada no perfil (login da Rio Quality).
export default async function RioQualityLayout({ children }: { children: React.ReactNode }) {
  const user = await usuarioAtual()
  if (!user) redirect('/login')

  if (process.env.DESKTOP_APP !== '1') {
    const perfil = await getPerfil(user.id)
    if (!podeOperarEmpresa(perfil, 'rioquality')) redirect('/painel')
  }

  return <>{children}</>
}
