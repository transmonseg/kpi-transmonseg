import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { resolveUserDesktopAware } from '@/lib/supabase/desktop-auth'
import { getPerfil } from '@/lib/perfil'
import DashboardClient from './dashboard/dashboard-client'
import { fetchResumo } from './dashboard/fetch-resumo'

export default async function PainelHome({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams

  const supabase = await createClient()
  const user = await resolveUserDesktopAware(supabase)
  const perfil = user && process.env.DESKTOP_APP !== '1' ? await getPerfil(user.id) : { papel: 'admin' as const, redes: [], meses: [] }
  const redesPermitidas = perfil.papel === 'admin' ? undefined : perfil.redes
  const mesesPermitidos = perfil.papel === 'admin' ? undefined : perfil.meses
  // Resumo do topo mistura números de TODAS as redes (contagem global de gerações) —
  // não faz sentido pra quem só pode ver uma rede específica.
  const resumo = redesPermitidas ? undefined : await fetchResumo()

  return (
    <Suspense fallback={null}>
      <DashboardClient
        resumo={resumo}
        tabInicial={sp.tab === 'inserir' || sp.tab === 'historico' ? sp.tab : 'geral'}
        redesPermitidas={redesPermitidas}
        mesesPermitidos={mesesPermitidos}
      />
    </Suspense>
  )
}
