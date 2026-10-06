import { redirect } from 'next/navigation'
import { usuarioAtual } from '@/lib/supabase/usuario-atual'
import { getPerfil } from '@/lib/perfil'

// Monitoramento dentro do painel: equipe da Transmonseg (admin e operador).
// Login de cliente (gerente/visualizador) não vê.
export default async function MonitoramentoLayout({ children }: { children: React.ReactNode }) {
  const user = await usuarioAtual()
  if (!user) redirect('/login')
  const perfil = await getPerfil(user.id)
  if (perfil.papel !== 'admin' && perfil.papel !== 'operador') redirect('/painel')
  return children
}
