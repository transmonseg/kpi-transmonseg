import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveUserDesktopAware } from '@/lib/supabase/desktop-auth'
import { getPerfil, empresaLiberada } from '@/lib/perfil'

// Mesmo gate do layout da Nutry Max: admin + empresa 'rioquality' liberada
// no perfil (ver migration 20260905000000, que libera pros admins atuais).
export default async function RioQualityLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const user = await resolveUserDesktopAware(supabase)
  if (!user) redirect('/login')

  if (process.env.DESKTOP_APP !== '1') {
    const perfil = await getPerfil(user.id)
    if (perfil.papel !== 'admin' || !empresaLiberada(perfil, 'rioquality')) redirect('/painel')
  }

  return <>{children}</>
}
