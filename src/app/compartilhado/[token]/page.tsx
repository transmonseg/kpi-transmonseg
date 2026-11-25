import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { buscarLinkDashboard } from '@/lib/kpi-romaneio/dashboard-link'
import { VisaoGeral } from '@/app/painel/dashboard-kpi/visao-geral'
import { NOMES_CLIENTE } from '@/lib/kpi-romaneio/nomes-cliente-dash'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Dashboard · Transmonseg', robots: { index: false, follow: false } }

// 25/11: Dashboard compartilhado. Só o dia/período do link, sem trocar a data
// e sem nada de quem opera (Inserir KPI, conferência).
export default async function DashboardCompartilhado({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const link = await buscarLinkDashboard(token)
  if (!link) notFound()
  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <div className="mb-6">
        <span className="text-overline">{NOMES_CLIENTE[link.cliente]}</span>
        <h1 className="mt-1 text-display text-[34px] leading-none text-[var(--color-fg)] md:text-[40px]">Dashboard</h1>
      </div>
      <VisaoGeral cliente={link.cliente} podeInserir={false} link={{ token: link.token, de: link.de, ate: link.ate }} />
    </div>
  )
}
