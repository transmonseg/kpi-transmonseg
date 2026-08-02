import { WarningCircle } from '@phosphor-icons/react/dist/ssr'
import { createServiceClient } from '@/lib/supabase/service'
import { agruparPorRede } from '@/lib/kpi/agrupar-manual'
import { KpiManualCards } from '@/components/kpi/kpi-manual-cards'
import type { LinhaManual } from '@/lib/kpi/manual-tipos'

export const metadata = { title: 'KPI — Transmonseg' }

function Erro({ mensagem }: { mensagem: string }) {
  return (
    <div className="mx-auto flex max-w-[520px] flex-col items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-6 py-12 text-center">
      <WarningCircle size={28} weight="fill" className="text-[var(--color-danger)]" />
      <p className="text-[14px] leading-relaxed text-[var(--color-danger-soft-fg)]">{mensagem}</p>
    </div>
  )
}

export default async function KpiPublicoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const svc = createServiceClient()

  const { data: link } = await svc
    .from('kpi_manual_links_publicos')
    .select('data, redes')
    .eq('token', token)
    .maybeSingle()

  if (!link) {
    return <Erro mensagem="Esse link não existe ou não é mais válido." />
  }

  const { data: rows, error } = await svc
    .from('kpi_manual_entradas')
    .select('rede_id, loja, placa, motorista, status, saida_cd, chd, sai, volta_base')
    .eq('data', link.data as string)
    .in('rede_id', link.redes as string[])
    .order('id', { ascending: true })

  if (error) {
    return <Erro mensagem="Não foi possível carregar o KPI agora. Tenta de novo em instantes." />
  }

  const redes = agruparPorRede((rows ?? []) as LinhaManual[])
  const dataFmt = (link.data as string).split('-').reverse().join('/')

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <header className="mb-6 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          KPI Transmonseg
        </span>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-fg)] md:text-[34px]">
          KPI do dia {dataFmt}
        </h1>
      </header>

      {redes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-6 py-16 text-center">
          <p className="text-[14px] text-[var(--color-fg-muted)]">Nenhum KPI inserido nesse dia.</p>
        </div>
      ) : (
        <KpiManualCards redes={redes} data={link.data as string} mostrarBaixarXlsx={false} />
      )}
    </div>
  )
}
