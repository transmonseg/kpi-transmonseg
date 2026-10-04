'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  ChartPieSlice,
  ForkKnife,
  UsersThree,
  ClockCounterClockwise,
  ClipboardText,
  CaretRight,
  Lock,
  FileArrowUp,
  Truck,
  Snowflake,
  Package,
  Buildings,
} from '@phosphor-icons/react/dist/ssr'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { SPRING_UI } from '@/lib/motion'

type Leaf = { href: string; label: string; Icon: PhosphorIcon; exact?: boolean }
type Group = { label: string; Icon: PhosphorIcon; children: Leaf[]; bloqueado?: boolean }
type Papel = 'admin' | 'gerente' | 'visualizador'

const DASHBOARD: Leaf = { href: '/painel', label: 'Dashboard', Icon: ChartPieSlice, exact: true }
const USUARIOS: Leaf = { href: '/painel/usuarios', label: 'Usuários', Icon: UsersThree }

// Benassi saiu da operação (pedido do usuário 04/10/2026): fica no menu com
// cadeado, sem clique. As rotas continuam no código, bloqueadas no middleware.
const GRUPO_BENASSI: Group = { label: 'Benassi', Icon: Buildings, children: [], bloqueado: true }

const GRUPO_NUTRIMAX: Group = {
  label: 'Nutry Max',
  Icon: Truck,
  children: [
    { href: '/painel/nutrimax/gerar', label: 'Gerar KPI', Icon: FileArrowUp },
    { href: '/painel/nutrimax/historico', label: 'Histórico', Icon: ClockCounterClockwise },
  ],
}

const GRUPO_PORTEFRIO: Group = {
  label: 'Portefrio',
  Icon: Snowflake,
  children: [
    { href: '/painel/portefrio/gerar', label: 'Gerar KPI', Icon: FileArrowUp },
    { href: '/painel/portefrio/historico', label: 'Histórico', Icon: ClockCounterClockwise },
  ],
}

const GRUPO_RIOQUALITY: Group = {
  label: 'Rio Quality',
  Icon: Package,
  children: [
    { href: '/painel/rioquality/gerar', label: 'Gerar KPI', Icon: FileArrowUp },
    { href: '/painel/rioquality/historico', label: 'Histórico', Icon: ClockCounterClockwise },
  ],
}

const GRUPO_COZINHA: Group = {
  label: 'Cozinha',
  Icon: ForkKnife,
  children: [
    { href: '/painel/cozinha', label: 'Gerar romaneio', Icon: ClipboardText, exact: true },
    { href: '/painel/cozinha/clientes', label: 'Clientes', Icon: UsersThree },
  ],
}

const GRUPOS_EMPRESA: Group[] = [GRUPO_BENASSI, GRUPO_NUTRIMAX, GRUPO_PORTEFRIO, GRUPO_RIOQUALITY]

function leafActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

function groupHasActive(pathname: string, g: Group) {
  return g.children.some(c => leafActive(pathname, c.href, c.exact))
}

// Pílula branca translúcida que desliza entre os itens (layoutId único).
function PilulaAtiva() {
  return (
    <motion.span
      layoutId="nav-pilula"
      transition={SPRING_UI}
      className="absolute inset-0 rounded-[10px] bg-[var(--color-sidebar-active)]"
    />
  )
}

const ITEM =
  'group relative flex items-center gap-2.5 rounded-[10px] py-[7px] text-[14px] font-medium u-motion u-press outline-none'

function LeafLink({ item, active, nested }: { item: Leaf; active: boolean; nested?: boolean }) {
  const { Icon } = item
  return (
    <Link
      href={item.href}
      data-tour={`nav-${item.href}`}
      aria-current={active ? 'page' : undefined}
      className={
        ITEM + ' ' + (nested ? 'pl-[38px] pr-2.5 ' : 'px-2.5 ') +
        (active
          ? 'text-[var(--color-sidebar-fg-strong)]'
          : 'text-[var(--color-sidebar-fg-muted)] hover:bg-[var(--color-sidebar-hover)] hover:text-[var(--color-sidebar-fg)]')
      }
    >
      {active && <PilulaAtiva />}
      {!nested && <Icon size={18} weight={active ? 'fill' : 'regular'} className="relative shrink-0" />}
      <span className="relative truncate">{item.label}</span>
    </Link>
  )
}

function GroupBlock({ group, pathname }: { group: Group; pathname: string }) {
  const ativo = groupHasActive(pathname, group)
  const [open, setOpen] = useState(ativo)
  const { Icon } = group

  if (group.bloqueado) {
    return (
      <div
        aria-disabled
        title={`${group.label} — desativada`}
        className={ITEM + ' cursor-not-allowed px-2.5 text-[var(--color-sidebar-fg-muted)] opacity-55'}
      >
        <Icon size={18} className="shrink-0" />
        <span className="flex-1 truncate">{group.label}</span>
        <Lock size={14} weight="fill" className="shrink-0" />
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        data-tour={`grupo-${group.label}`}
        className={
          ITEM + ' w-full px-2.5 ' +
          (ativo ? 'text-[var(--color-sidebar-fg-strong)]' : 'text-[var(--color-sidebar-fg)] hover:bg-[var(--color-sidebar-hover)]')
        }
      >
        <Icon size={18} weight={ativo ? 'fill' : 'regular'} className="shrink-0" />
        <span className="flex-1 truncate text-left">{group.label}</span>
        <CaretRight
          size={12}
          weight="bold"
          className={'shrink-0 text-[var(--color-sidebar-fg-muted)] transition-transform duration-300 ' + (open ? 'rotate-90' : '')}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="filhos"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING_UI}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-0.5 pb-1 pt-0.5">
              {group.children.map(c => (
                <LeafLink key={c.href} item={c} active={leafActive(pathname, c.href, c.exact)} nested />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Secao({ children }: { children: React.ReactNode }) {
  return <div className="px-2.5 pb-1 pt-4 text-[12px] font-semibold text-[var(--color-sidebar-fg-muted)]">{children}</div>
}

export function PainelNav({ papel }: { papel: Papel; empresas: string[] }) {
  const pathname = usePathname()

  // Login restrito (gerente/visualizador): Dashboard e, pro gerente, Usuários
  // (convidar visualizadores). Gerar/editar KPI e Cozinha ficam só pro admin.
  if (papel !== 'admin') {
    return (
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3">
        <LeafLink item={DASHBOARD} active={leafActive(pathname, DASHBOARD.href, true)} />
        {papel === 'gerente' && (
          <LeafLink item={USUARIOS} active={pathname.startsWith('/painel/usuarios')} />
        )}
      </nav>
    )
  }

  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3">
      <LeafLink item={DASHBOARD} active={leafActive(pathname, DASHBOARD.href, true)} />
      <LeafLink item={USUARIOS} active={pathname.startsWith('/painel/usuarios')} />

      <Secao>Empresas</Secao>
      {GRUPOS_EMPRESA.map(g => (
        <GroupBlock key={g.label} group={g} pathname={pathname} />
      ))}

      <Secao>Operação</Secao>
      <GroupBlock group={GRUPO_COZINHA} pathname={pathname} />
    </nav>
  )
}
