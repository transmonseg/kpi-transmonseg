import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveUserDesktopAware } from '@/lib/supabase/desktop-auth'
import { getPerfil, empresaLiberada } from '@/lib/perfil'

export default async function NutrimaxLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const user = await resolveUserDesktopAware(supabase)
  if (!user) redirect('/login')

  // Mesmo bypass do layout pai (src/app/painel/layout.tsx): app desktop não
  // tem login restrito (offline, sem convite) — trata como admin, sem
  // consultar perfis.
  if (process.env.DESKTOP_APP !== '1') {
    const perfil = await getPerfil(user.id)
    if (!empresaLiberada(perfil, 'nutrimax')) redirect('/painel')
  }

  return <>{children}</>
}
