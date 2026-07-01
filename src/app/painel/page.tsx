import { Suspense } from 'react'
import DashboardClient from './dashboard/dashboard-client'
import { fetchResumo } from './dashboard/fetch-resumo'

export default async function PainelHome({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams
  const resumo = await fetchResumo()
  return (
    <Suspense fallback={null}>
      <DashboardClient resumo={resumo} tabInicial={sp.tab === 'inserir' || sp.tab === 'historico' ? sp.tab : 'geral'} />
    </Suspense>
  )
}
