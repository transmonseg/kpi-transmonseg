import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfil, empresaLiberada } from '@/lib/perfil'

export default async function DashboardBetaLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const perfil = await getPerfil(user.id)
  if (!empresaLiberada(perfil, 'benassi')) redirect('/painel')

  return <>{children}</>
}
