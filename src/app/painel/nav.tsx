'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  HouseSimple,
  ForkKnife,
  TableIcon,
  CalendarBlank,
  ClockCounterClockwise,
  FilePlus,
  MagnifyingGlass,
} from '@phosphor-icons/react/dist/ssr'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'

type Item = { href: string; label: string; Icon: PhosphorIcon }

const PRINCIPAL: Item[] = [
  { href: '/painel', label: 'Início', Icon: HouseSimple },
  { href: '/painel/cozinha', label: 'Cozinha', Icon: ForkKnife },
]

const KPI_BENASSI: Item[] = [
  { href: '/painel/kpi/simples', label: 'Simples', Icon: TableIcon },
  { href: '/painel/kpi/dia', label: 'Dia', Icon: CalendarBlank },
  { href: '/painel/historico', label: 'Histórico', Icon: ClockCounterClockwise },
]

const OUTROS: Item[] = [
  { href: '/painel/alteracoes/nova', label: 'Alteração de Escala', Icon: FilePlus },
  { href: '/painel/revisao', label: 'Revisar Anomalias', Icon: MagnifyingGlass },
]

function isActive(pathname: string, href: string) {
  if (href === '/painel') return pathname === '/painel'
  return pathname === href || pathname.startsWith(href + '/')
}

function NavLink({ item, active }: { item: Item; active: boolean }) {
  const { Icon } = item
  return (
    <Link
      href={item.href}
      className={
        'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-150 ' +
        (active
          ? 'bg-white/[0.06] text-white'
          : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-100')
      }
    >
      {active && (
        <span
          aria-hidden
          className="absolute -left-2 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-[var(--color-accent)]"
        />
      )}
      <Icon
        size={16}
        weight={active ? 'fill' : 'regular'}
        className={active ? 'text-[var(--color-accent)]' : 'text-zinc-500 group-hover:text-zinc-300'}
      />
      <span>{item.label}</span>
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
    <div className="flex flex-col gap-px">
      <div className="px-2.5 pb-2 pt-5 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-600">
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
    <nav className="flex flex-1 flex-col gap-1 px-3 pt-1 pb-3">
      <Section title="Principal" items={PRINCIPAL} pathname={pathname} />
      <Section title="KPI Benassi" items={KPI_BENASSI} pathname={pathname} />
      <Section title="Outros" items={OUTROS} pathname={pathname} />
    </nav>
  )
}
