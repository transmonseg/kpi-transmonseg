import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveUserDesktopAware } from '@/lib/supabase/desktop-auth'
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

  return (
    <PainelShell userEmail={user.email} sairAction={sair}>
      {children}
    </PainelShell>
  )
}
