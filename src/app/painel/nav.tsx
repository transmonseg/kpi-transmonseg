'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/painel', label: 'Início' },
  { href: '/painel/cozinha', label: 'Cozinha' },
]

const KPI_ITEMS = [
  { href: '/painel/kpi', label: 'KPI do Dia' },
  { href: '/painel/kpi/novo', label: 'Upload de Relatórios' },
  { href: '/painel/revisao', label: 'Revisar Anomalias' },
  { href: '/painel/historico', label: 'Histórico' },
]

const ALTERACOES_ITEMS = [
  { href: '/painel/alteracoes/nova', label: 'Nova alteração' },
]

const SOON = ['Cadastro de Lojas']

export function PainelNav() {
  const pathname = usePathname()

  return (
    <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 text-sm">
      {ITEMS.map(item => {
        const active = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? 'px-3 py-2 rounded-lg bg-brand-50 text-brand-700 font-semibold transition'
                : 'px-3 py-2 rounded-lg text-ink hover:bg-surface-hover transition'
            }
          >
            {item.label}
          </Link>
        )
      })}

      <div className="px-3 pt-5 pb-2 text-ink-muted text-xs uppercase tracking-wider font-semibold">
        KPI Benassi
      </div>
      {KPI_ITEMS.map(item => {
        const active = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? 'px-3 py-2 rounded-lg bg-brand-50 text-brand-700 font-semibold transition'
                : 'px-3 py-2 rounded-lg text-ink hover:bg-surface-hover transition'
            }
          >
            {item.label}
          </Link>
        )
      })}

      <div className="px-3 pt-5 pb-2 text-ink-muted text-xs uppercase tracking-wider font-semibold">
        Alterações
      </div>
      {ALTERACOES_ITEMS.map(item => {
        const active = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? 'px-3 py-2 rounded-lg bg-brand-50 text-brand-700 font-semibold transition'
                : 'px-3 py-2 rounded-lg text-ink hover:bg-surface-hover transition'
            }
          >
            {item.label}
          </Link>
        )
      })}

      <div className="px-3 pt-5 pb-2 text-ink-muted text-xs uppercase tracking-wider font-semibold">
        Em breve
      </div>
      {SOON.map(label => (
        <div
          key={label}
          className="px-3 py-2 rounded-lg text-ink-muted cursor-not-allowed text-sm"
        >
          {label}
        </div>
      ))}
    </nav>
  )
}
