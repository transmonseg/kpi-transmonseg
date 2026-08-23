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
  ClipboardText,
  CaretRight,
} from '@phosphor-icons/react/dist/ssr'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'

type Leaf = { href: string; label: string; Icon: PhosphorIcon; exact?: boolean }
type Group = { label: string; Icon: PhosphorIcon; href?: string; children: Leaf[] }
type Papel = 'admin' | 'gerente' | 'visualizador'

const DASHBOARD: Leaf = { href: '/painel', label: 'Dashboard', Icon: ChartBar }
const USUARIOS: Leaf = { href: '/painel/usuarios', label: 'Usuários', Icon: UsersThree }
const VER_KPIS: Leaf = { href: '/painel/kpi/visualizar', label: 'Ver KPIs', Icon: ClockCounterClockwise }

const GROUPS: Group[] = [
  {
    label: 'KPI',
    Icon: TableIcon,
    children: [
      { href: '/painel/kpi/simples', label: 'Gerar KPI', Icon: TableIcon },
      { href: '/painel/dashboard/beta', label: 'Dashboard (API Beta)', Icon: ChartBar },
      { href: '/painel/historico', label: 'Histórico', Icon: ClockCounterClockwise },
      { href: '/painel/lojas', label: 'Lojas', Icon: Storefront },
    ],
  },
  {
    label: 'Cozinha',
    Icon: ForkKnife,
    children: [
      { href: '/painel/cozinha', label: 'Gerar Romaneio', Icon: ClipboardText, exact: true },
      { href: '/painel/cozinha/clientes', label: 'Clientes', Icon: UsersThree },
    ],
  },
  {
    label: 'Nutry Max',
    Icon: TableIcon,
    children: [
      { href: '/painel/nutrimax/gerar', label: 'Gerar KPI', Icon: TableIcon },
    ],
  },
]

function leafActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

function groupHasActive(pathname: string, g: Group) {
  if (g.href && pathname === g.href) return true
  return g.children.some(c => leafActive(pathname, c.href, c.exact))
}

const ITEM_BASE =
  'group relative flex items-center gap-2.5 rounded-lg py-2 text-[13px] font-medium ' +
  'transition-[background-color,color] duration-150 active:scale-[0.98]'

function LeafLink({ item, active, nested }: { item: Leaf; active: boolean; nested?: boolean }) {
  const { Icon } = item
  return (
    <Link
      href={item.href}
      className={
        ITEM_BASE + ' ' + (nested ? 'pl-9 pr-2.5 ' : 'px-2.5 ') +
        (active
          ? 'bg-[var(--color-sidebar-active)] text-[var(--color-sidebar-fg-strong)]'
          : 'text-[var(--color-sidebar-fg-muted)] hover:bg-[var(--color-sidebar-hover)] hover:text-[var(--color-sidebar-fg)]')
      }
    >
      {active && (
        <span
          aria-hidden
          className="absolute -left-2 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-[var(--color-sidebar-accent)]"
        />
      )}
      <Icon
        size={16}
        weight={active ? 'fill' : 'regular'}
        className={active ? 'text-[var(--color-sidebar-accent)]' : 'text-[var(--color-sidebar-fg-muted)] group-hover:text-[var(--color-sidebar-fg)]'}
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
          'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium ' +
          'transition-[background-color,color] duration-150 active:scale-[0.98] ' +
          (headerAtivo
            ? 'bg-[var(--color-sidebar-active)] text-[var(--color-sidebar-fg-strong)]'
            : 'text-[var(--color-sidebar-fg)] hover:bg-[var(--color-sidebar-hover)]')
        }
      >
        <Icon
          size={16}
          weight={headerAtivo ? 'fill' : 'regular'}
          className={headerAtivo ? 'text-[var(--color-sidebar-accent)]' : 'text-[var(--color-sidebar-fg-muted)] group-hover:text-[var(--color-sidebar-fg)]'}
        />
        <span className="flex-1 text-left">{group.label}</span>
        <CaretRight
          size={13}
          weight="bold"
          className={'text-[var(--color-sidebar-fg-muted)] transition-transform duration-200 ' + (open ? 'rotate-90' : '')}
        />
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="mt-px flex flex-col gap-px pt-px">
            {group.children.map(c => (
              <LeafLink key={c.href} item={c} active={leafActive(pathname, c.href, c.exact)} nested />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function PainelNav({ papel }: { papel: Papel }) {
  const pathname = usePathname()

  // Login restrito (gerente/visualizador): Dashboard, Ver KPIs (read-only,
  // já filtrado pelas redes do perfil) e Usuários pro gerente (convidar
  // visualizadores). Sem acesso ao resto (gerar/editar KPI, Cozinha etc).
  if (papel !== 'admin') {
    return (
      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        <LeafLink item={DASHBOARD} active={pathname === '/painel'} />
        <LeafLink item={VER_KPIS} active={pathname.startsWith('/painel/kpi/visualizar')} />
        {papel === 'gerente' && (
          <LeafLink item={USUARIOS} active={pathname.startsWith('/painel/usuarios')} />
        )}
      </nav>
    )
  }

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
      <LeafLink item={DASHBOARD} active={pathname === '/painel'} />
      <LeafLink item={USUARIOS} active={pathname.startsWith('/painel/usuarios')} />

      <div className="my-2 h-px bg-[var(--color-sidebar-border)]" />

      {GROUPS.map(g => (
        <GroupBlock key={g.label} group={g} pathname={pathname} />
      ))}
    </nav>
  )
}
