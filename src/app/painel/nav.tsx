'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  ChartBar,
  ForkKnife,
  TableIcon,
  UsersThree,
  Storefront,
  ClockCounterClockwise,
  CaretRight,
} from '@phosphor-icons/react/dist/ssr'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'

type Leaf = { href: string; label: string; Icon: PhosphorIcon }
type Group = { label: string; Icon: PhosphorIcon; href?: string; children: Leaf[] }

const DASHBOARD: Leaf = { href: '/painel', label: 'Dashboard', Icon: ChartBar }

const GROUPS: Group[] = [
  {
    label: 'KPI',
    Icon: TableIcon,
    children: [
      { href: '/painel/kpi/simples', label: 'Gerar KPI', Icon: TableIcon },
      { href: '/painel/historico', label: 'Histórico', Icon: ClockCounterClockwise },
      { href: '/painel/lojas', label: 'Lojas', Icon: Storefront },
    ],
  },
  {
    label: 'Cozinha',
    Icon: ForkKnife,
    href: '/painel/cozinha',
    children: [
      { href: '/painel/cozinha/clientes', label: 'Clientes', Icon: UsersThree },
    ],
  },
]

function leafActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/')
}

function groupHasActive(pathname: string, g: Group) {
  if (g.href && pathname === g.href) return true
  return g.children.some(c => leafActive(pathname, c.href))
}

function LeafLink({ item, active, nested }: { item: Leaf; active: boolean; nested?: boolean }) {
  const { Icon } = item
  return (
    <Link
      href={item.href}
      className={
        'group relative flex items-center gap-2.5 rounded-lg py-2 text-[13px] font-medium transition-all duration-150 ' +
        (nested ? 'pl-9 pr-2.5 ' : 'px-2.5 ') +
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

function GroupBlock({ group, pathname }: { group: Group; pathname: string }) {
  const router = useRouter()
  const ativo = groupHasActive(pathname, group)
  const [open, setOpen] = useState(ativo)
  const { Icon } = group
  const headerAtivo = !!group.href && pathname === group.href

  return (
    <div>
      <button
        onClick={() => {
          if (group.href) { router.push(group.href); setOpen(true) }
          else setOpen(o => !o)
        }}
        className={
          'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-150 ' +
          (headerAtivo
            ? 'bg-white/[0.06] text-white'
            : 'text-zinc-300 hover:bg-white/[0.03] hover:text-zinc-100')
        }
      >
        <Icon
          size={16}
          weight={headerAtivo ? 'fill' : 'regular'}
          className={headerAtivo ? 'text-[var(--color-accent)]' : 'text-zinc-500 group-hover:text-zinc-300'}
        />
        <span className="flex-1 text-left">{group.label}</span>
        <CaretRight
          size={13}
          weight="bold"
          className={'text-zinc-600 transition-transform duration-200 ' + (open ? 'rotate-90' : '')}
        />
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="mt-px flex flex-col gap-px pt-px">
            {group.children.map(c => (
              <LeafLink key={c.href} item={c} active={leafActive(pathname, c.href)} nested />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function PainelNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3 pt-4 pb-3">
      <LeafLink item={DASHBOARD} active={pathname === '/painel'} />

      <div className="my-2 h-px bg-[var(--color-sidebar-border)]" />

      {GROUPS.map(g => (
        <GroupBlock key={g.label} group={g} pathname={pathname} />
      ))}
    </nav>
  )
}
