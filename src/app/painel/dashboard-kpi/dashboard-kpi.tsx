'use client'

import { useRouter } from 'next/navigation'
import { Lock, UploadSimple } from '@phosphor-icons/react/dist/ssr'
import type { ClienteDash } from '@/lib/kpi-romaneio/dashboard-kpis'
import { VisaoGeral } from './visao-geral'
import { InserirKpi } from './inserir-kpi'
import { HistoricoKpi } from './historico-kpi'

export type Aba = 'geral' | 'inserir' | 'historico'

const NOMES: Record<ClienteDash, string> = { nutrimax: 'Nutry Max', rioquality: 'Rio Quality', portefrio: 'Portefrio' }

// Dashboard por cliente (04/10/2026): mesmo funcionamento do da Benassi --
// Visão geral (período livre), Inserir KPI (só analisa o que for inserido) e
// Histórico (baixar qualquer dia).
export function DashboardKpi({ cliente, clientes, aba, podeInserir, visaoCliente = false, dataInicial }: {
  cliente: ClienteDash
  clientes: ClienteDash[]
  aba: Aba
  podeInserir: boolean
  /** Visao do cliente (nao admin): sem os cartoes de problema (A revisar, Sem rastreador, Nao foi ao cliente). */
  visaoCliente?: boolean
  dataInicial?: string
}) {
  const router = useRouter()
  const ir = (c: ClienteDash, a: Aba, data?: string) => {
    const q = new URLSearchParams({ empresa: c })
    if (a !== 'geral') q.set('tab', a)
    if (data) q.set('data', data)
    router.replace(`/painel?${q.toString()}`, { scroll: false })
  }

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      {/* Empresa -- conta de uma empresa só (login da Nutry, da Rio Quality) não vê
          as outras nem a Benassi travada (06/10, logins separados). */}
      {clientes.length > 1 && (
      <div className="mb-6 flex flex-wrap items-center gap-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-1 shadow-soft sm:w-fit">
        {clientes.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => ir(c, aba === 'inserir' && !podeInserir ? 'geral' : aba)}
            className={`h-9 rounded-xl px-4 text-[13px] font-medium transition-[background-color,color,transform] duration-200 active:scale-[0.97] ${
              c === cliente
                ? 'bg-[var(--color-navy-700)] text-white shadow-[0_6px_16px_-8px_rgba(31,56,100,0.8)]'
                : 'text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-fg)]'
            }`}
          >
            {NOMES[c]}
          </button>
        ))}
        <span title="Benassi — desativada" className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-xl px-4 text-[13px] font-medium text-[var(--color-fg-subtle)] opacity-60">
          <Lock size={12} weight="fill" /> Benassi
        </span>
      </div>
      )}

      {/* Cabeçalho */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-overline">{NOMES[cliente]}</span>
          <h1 className="mt-1 text-display text-[34px] leading-none text-[var(--color-fg)] md:text-[40px]">Dashboard</h1>
          <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
            Performance de entregas, KM e tempos por placa — calculado a partir dos KPIs inseridos.
          </p>
        </div>
        {podeInserir && aba !== 'inserir' && (
          <button
            type="button"
            onClick={() => ir(cliente, 'inserir')}
            className="inline-flex h-10 items-center gap-2 self-start rounded-full bg-[var(--color-navy-700)] px-5 text-[13px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(31,56,100,0.9)] transition-[transform,background-color] duration-200 hover:bg-[var(--color-navy-800)] active:scale-[0.97] sm:self-auto"
          >
            <UploadSimple size={16} weight="bold" /> Inserir KPI
          </button>
        )}
      </div>

      {/* Abas (mesmo estilo do dashboard da Benassi) */}
      <div className="mb-6 flex gap-1 border-b border-[var(--color-border)]">
        {([['geral', 'Visão geral'], ...(podeInserir ? [['inserir', 'Inserir KPI']] : []), ['historico', 'Histórico']] as [Aba, string][]).map(([a, rotulo]) => (
          <button
            key={a}
            type="button"
            onClick={() => ir(cliente, a)}
            className={`relative px-4 pb-3 pt-1 text-[13px] font-medium transition-colors ${aba === a ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]'}`}
          >
            {rotulo}
            <span className={`absolute inset-x-2 -bottom-px h-0.5 origin-left rounded-full bg-[var(--color-accent)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${aba === a ? 'scale-x-100' : 'scale-x-0'}`} />
          </button>
        ))}
      </div>

      {aba === 'geral' && (
        <div key={`g-${cliente}`} className="animate-fade-up">
          <VisaoGeral cliente={cliente} dataInicial={dataInicial} podeInserir={podeInserir} visaoCliente={visaoCliente} onInserir={() => ir(cliente, 'inserir')} />
        </div>
      )}
      {aba === 'inserir' && podeInserir && (
        <div key={`i-${cliente}`} className="animate-fade-up">
          <InserirKpi cliente={cliente} nome={NOMES[cliente]} onAbrirDia={d => ir(cliente, 'geral', d)} />
        </div>
      )}
      {aba === 'historico' && (
        <div key={`h-${cliente}`} className="animate-fade-up">
          <HistoricoKpi cliente={cliente} podeExcluir={podeInserir} onAbrirDia={d => ir(cliente, 'geral', d)} />
        </div>
      )}
    </div>
  )
}
