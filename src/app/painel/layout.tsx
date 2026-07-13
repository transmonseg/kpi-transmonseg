import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveUserDesktopAware } from '@/lib/supabase/desktop-auth'
import { getPerfil } from '@/lib/perfil'
import { sair } from './actions'
import { PainelShell } from './painel-shell'

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  // No site: getUser() normal. No app desktop offline: cai pra sessão local.
  const user = await resolveUserDesktopAware(supabase)

  if (!user) redirect('/login')

  // App desktop não tem login restrito (offline, sem convite) — trata como admin.
  const perfil = process.env.DESKTOP_APP === '1' ? { papel: 'admin' as const } : await getPerfil(user.id)

  return (
    <PainelShell userEmail={user.email} papel={perfil.papel} sairAction={sair}>
      {children}
    </PainelShell>
  )
}
