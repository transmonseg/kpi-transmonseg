import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sair } from './actions'
import { PainelShell } from './painel-shell'

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <PainelShell userEmail={user.email} sairAction={sair}>
      {children}
    </PainelShell>
  )
}
