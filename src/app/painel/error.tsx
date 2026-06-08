'use client'

import Link from 'next/link'
import { WarningCircle, ArrowRight } from '@phosphor-icons/react/dist/ssr'

// Error boundary do /painel. No app desktop, telas que leem o banco na nuvem
// (Dashboard/Histórico/Lojas) dependem da service key — que NÃO é embutida no .exe
// por segurança. Em vez do erro genérico ("server error"), mostra um aviso claro e
// manda pra tela que funciona offline (Gerar KPI). No site, só aparece em falha real.
export default function PainelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const isDesktop = typeof window !== 'undefined' && !!(window as unknown as { api?: { isDesktop?: boolean } }).api?.isDesktop
  const ehTelaDaNuvem = isDesktop && /SERVICE_KEY_AUSENTE_DESKTOP|supabaseKey is required/i.test(error?.message ?? '')

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-[640px] flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-warning)]/12">
        <WarningCircle size={26} weight="fill" className="text-[var(--color-warning)]" />
      </div>
      {ehTelaDaNuvem ? (
        <>
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--color-fg)]">
            Esta tela usa dados da nuvem
          </h1>
          <p className="max-w-[48ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
            Dashboard, Histórico e Lojas leem o banco de dados central — disponíveis no
            site (navegador). No app, o que roda <strong>offline</strong> é a geração do
            KPI, que funciona sem internet.
          </p>
          <Link
            href="/painel/kpi/simples"
            className="group inline-flex items-center gap-2 rounded-[var(--radius-card)] bg-[var(--color-navy-700)] px-5 py-3 text-[14px] font-semibold text-white transition-all hover:-translate-y-0.5"
          >
            Ir para Gerar KPI
            <ArrowRight size={18} weight="bold" className="transition-transform group-hover:translate-x-1" />
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--color-fg)]">
            Algo deu errado nesta tela
          </h1>
          <p className="max-w-[48ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
            {error?.message || 'Erro inesperado.'}
          </p>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-[var(--radius-card)] bg-[var(--color-navy-700)] px-5 py-3 text-[14px] font-semibold text-white transition-all hover:-translate-y-0.5"
          >
            Tentar de novo
          </button>
        </>
      )}
    </div>
  )
}
