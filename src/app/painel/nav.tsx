'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Item = { href: string; label: string }

const PRINCIPAL: Item[] = [
  { href: '/painel', label: 'Início' },
  { href: '/painel/cozinha', label: 'Cozinha' },
]

const KPI_BENASSI: Item[] = [
  { href: '/painel/kpi/dia', label: 'Dia' },
  { href: '/painel/historico', label: 'Histórico' },
]

const OUTROS: Item[] = [
  { href: '/painel/alteracoes/nova', label: 'Alteração de Escala' },
  { href: '/painel/revisao', label: 'Revisar Anomalias' },
]

function isActive(pathname: string, href: string) {
  if (href === '/painel') return pathname === '/painel'
  return pathname === href || pathname.startsWith(href + '/')
}

function NavLink({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={
        'group relative flex items-center rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ' +
        (active
          ? 'bg-zinc-800/80 text-white'
          : 'text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-50')
      }
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-brand-400"
        />
      )}
      <span className="pl-1.5">{item.label}</span>
    </Link>
  )
}

function Section({
  title,
  items,
  pathname,
}: {
  title: string
  items: Item[]
  pathname: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
        {title}
      </div>
      {items.map(item => (
        <NavLink
          key={item.href}
          item={item}
          active={isActive(pathname, item.href)}
        />
      ))}
    </div>
  )
}

export function PainelNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-1 flex-col gap-1 px-2 py-3">
      <Section title="Principal" items={PRINCIPAL} pathname={pathname} />
      <Section title="KPI Benassi" items={KPI_BENASSI} pathname={pathname} />
      <Section title="Outros" items={OUTROS} pathname={pathname} />
    </nav>
  )
}
