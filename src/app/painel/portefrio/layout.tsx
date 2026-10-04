import { redirect } from 'next/navigation'
import { usuarioAtual } from '@/lib/supabase/usuario-atual'
import { getPerfil, empresaLiberada } from '@/lib/perfil'

export default async function PortefrioLayout({ children }: { children: React.ReactNode }) {
  const user = await usuarioAtual()
  if (!user) redirect('/login')

  // Mesmo bypass do layout pai (src/app/painel/layout.tsx): app desktop não
  // tem login restrito (offline, sem convite) — trata como admin, sem
  // consultar perfis.
  if (process.env.DESKTOP_APP !== '1') {
    const perfil = await getPerfil(user.id)
    if (perfil.papel !== 'admin' || !empresaLiberada(perfil, 'portefrio')) redirect('/painel')
  }

  return <>{children}</>
}
