'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  HouseSimple,
  ForkKnife,
  TableIcon,
  UsersThree,
} from '@phosphor-icons/react/dist/ssr'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'

type Item = { href: string; label: string; Icon: PhosphorIcon }

const NAV_ITEMS: Item[] = [
  { href: '/painel', label: 'Início', Icon: HouseSimple },
  { href: '/painel/cozinha', label: 'Cozinha', Icon: ForkKnife },
  { href: '/painel/cozinha/clientes', label: 'Clientes', Icon: UsersThree },
  { href: '/painel/kpi/simples', label: 'KPI', Icon: TableIcon },
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

export function PainelNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-1 flex-col gap-px px-3 pt-4 pb-3">
      {NAV_ITEMS.map(item => (
        <NavLink
          key={item.href}
          item={item}
          active={isActive(pathname, item.href)}
        />
      ))}
    </nav>
  )
}
