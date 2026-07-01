import { Suspense } from 'react'
import DashboardClient from '../painel/dashboard/dashboard-client'
import { fetchResumo } from '../painel/dashboard/fetch-resumo'

export default async function ApresentacaoPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams
  const resumo = await fetchResumo()
  return (
    <Suspense fallback={null}>
      <DashboardClient resumo={resumo} tabInicial={sp.tab === 'inserir' || sp.tab === 'historico' ? sp.tab : 'geral'} basePath="/apresentacao" />
    </Suspense>
  )
}
