import { redirect } from 'next/navigation'
import { usuarioAtual } from '@/lib/supabase/usuario-atual'
import { getPerfil } from '@/lib/perfil'
import { sair } from './actions'
import { PainelShell } from './painel-shell'

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // No site: getUser() normal. No app desktop offline: cai pra sessão local.
  const user = await usuarioAtual()

  if (!user) redirect('/login')

  // App desktop não tem login restrito (offline, sem convite) — trata como admin.
  const perfil = process.env.DESKTOP_APP === '1'
    ? { papel: 'admin' as const, redes: [], meses: [], empresas: [] }
    : await getPerfil(user.id)

  return (
    // Nome cadastrado aparece no lugar do e-mail (06/10, tia Érica: "quero tirar sku").
    <PainelShell userEmail={(typeof user.user_metadata?.nome === 'string' && user.user_metadata.nome.trim()) || user.email} papel={perfil.papel} empresas={perfil.empresas} sairAction={sair}>
      {children}
    </PainelShell>
  )
}
