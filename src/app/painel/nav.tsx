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
  Lock,
  Truck,
  Snowflake,
  Package,
  Buildings,
  FileArrowUp,
} from '@phosphor-icons/react/dist/ssr'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'

type Leaf = { href: string; label: string; Icon: PhosphorIcon; exact?: boolean }
type Group = { label: string; Icon: PhosphorIcon; href?: string; children: Leaf[]; cor?: string }
type Papel = 'admin' | 'gerente' | 'visualizador' | 'operador'

const DASHBOARD: Leaf = { href: '/painel', label: 'Dashboard', Icon: ChartBar }
const USUARIOS: Leaf = { href: '/painel/usuarios', label: 'Usuários', Icon: UsersThree }

const GRUPO_BENASSI: Group = {
  label: 'Benassi',
  Icon: Buildings,
  children: [
    { href: '/painel/kpi/simples', label: 'Gerar KPI', Icon: TableIcon },
    { href: '/painel/dashboard/beta', label: 'Dashboard (API Beta)', Icon: ChartBar },
    { href: '/painel/historico', label: 'Histórico', Icon: ClockCounterClockwise },
    { href: '/painel/lojas', label: 'Lojas', Icon: Storefront },
  ],
}

const GRUPO_NUTRIMAX: Group = {
  label: 'Nutry Max',
  Icon: Truck,
  cor: '#1baf7a',
  children: [
    { href: '/painel/nutrimax/gerar', label: 'Gerar KPI', Icon: FileArrowUp },
    { href: '/painel/nutrimax/historico', label: 'Histórico', Icon: ClockCounterClockwise },
  ],
}

const GRUPO_PORTEFRIO: Group = {
  label: 'Portefrio',
  Icon: Snowflake,
  cor: '#2a78d6',
  children: [
    { href: '/painel/portefrio/gerar', label: 'Gerar KPI', Icon: FileArrowUp },
    { href: '/painel/portefrio/historico', label: 'Histórico', Icon: ClockCounterClockwise },
  ],
}

const GRUPO_COZINHA: Group = {
  label: 'Cozinha',
  Icon: ForkKnife,
  cor: '#d05a8a',
  children: [
    { href: '/painel/cozinha', label: 'Gerar Romaneio', Icon: ClipboardText, exact: true },
    { href: '/painel/cozinha/clientes', label: 'Clientes', Icon: UsersThree },
  ],
}

const GRUPO_RIOQUALITY: Group = {
  label: 'Rio Quality',
  Icon: Package,
  cor: '#e08a00',
  children: [
    { href: '/painel/rioquality/gerar', label: 'Gerar KPI', Icon: FileArrowUp },
    { href: '/painel/rioquality/historico', label: 'Histórico', Icon: ClockCounterClockwise },
  ],
}

const GRUPOS_EMPRESA: Group[] = [GRUPO_BENASSI, GRUPO_NUTRIMAX, GRUPO_PORTEFRIO, GRUPO_RIOQUALITY]
const NOME_PARA_EMPRESA: Record<string, string> = { 'Nutry Max': 'nutrimax', Portefrio: 'portefrio', 'Rio Quality': 'rioquality' }

function leafActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

function groupHasActive(pathname: string, g: Group) {
  if (g.href && pathname === g.href) return true
  return g.children.some(c => leafActive(pathname, c.href, c.exact))
}

// Menu lateral (04/10/2026): preto mantido, com o acabamento do dashboard —
// item ativo em pílula azul com brilho, subpáginas ligadas por uma linha-guia.
const ITEM_BASE =
  'group relative flex items-center gap-2.5 rounded-xl py-2 text-[13px] font-medium ' +
  'transition-[background-color,color,transform] duration-200 active:scale-[0.98]'

const ATIVO = 'nav-ativo text-white'

function LeafLink({ item, active, nested }: { item: Leaf; active: boolean; nested?: boolean }) {
  const { Icon } = item
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={
        ITEM_BASE + ' ' + (nested ? 'ml-[22px] pl-3.5 pr-2.5 ' : 'px-2.5 ') +
        (active
          ? ATIVO
          : 'text-[var(--color-sidebar-fg-muted)] hover:bg-white/[0.045] hover:text-[var(--color-sidebar-fg-strong)]')
      }
    >
      {nested && (
        <span aria-hidden className={`absolute -left-px top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full transition-colors ${active ? 'bg-[#8fb0e0]' : 'bg-transparent'}`} />
      )}
      <Icon
        size={nested ? 15 : 17}
        weight={active ? 'fill' : 'regular'}
        className={active ? 'text-white' : 'text-[var(--color-sidebar-fg-muted)] transition-colors group-hover:text-[var(--color-sidebar-fg-strong)]'}
      />
      <span>{item.label}</span>
    </Link>
  )
}

function IconeGrupo({ Icon, ativo }: { Icon: PhosphorIcon; cor?: string; ativo?: boolean }) {
  // Uma cor só, como os outros itens do menu (sem bolha colorida por empresa).
  return <Icon size={17} weight={ativo ? 'fill' : 'regular'} className={ativo ? 'text-white' : 'text-[var(--color-sidebar-fg-muted)] transition-colors group-hover:text-white'} />
}

function GroupBlock({ group, pathname }: { group: Group; pathname: string }) {
  // Benassi saiu da operação (04/10/2026): cadeado, sem clique.
  if (group.label === 'Benassi') {
    const { Icon } = group
    return (
      <div title="Benassi — desativada" aria-disabled className="flex cursor-not-allowed items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium text-[var(--color-sidebar-fg-muted)] opacity-45">
        <Icon size={17} />
        <span className="flex-1">Benassi</span>
        <Lock size={12} weight="fill" />
      </div>
    )
  }
  return <GroupBlockAtivo group={group} pathname={pathname} />
}

function GroupBlockAtivo({ group, pathname }: { group: Group; pathname: string }) {
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
          'group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-[7px] text-[13px] font-medium ' +
          'transition-[background-color,color,transform] duration-200 active:scale-[0.98] ' +
          (headerAtivo
            ? ATIVO
            : ativo
              ? 'text-white'
              : 'text-[var(--color-sidebar-fg)] hover:bg-white/[0.045] hover:text-white')
        }
      >
        <IconeGrupo Icon={Icon} cor={group.cor} ativo={ativo || open} />
        <span className="flex-1 text-left">{group.label}</span>
        <CaretRight
          size={13}
          weight="bold"
          className={'text-[var(--color-sidebar-fg-muted)] transition-transform duration-200 ' + (open ? 'rotate-90' : '')}
        />
      </button>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
      >
        <div className="overflow-hidden">
          <div className="relative mb-1 mt-0.5 flex flex-col gap-0.5 before:absolute before:bottom-1.5 before:left-[22px] before:top-1.5 before:w-px before:bg-white/[0.08]">
            {group.children.map(c => (
              <LeafLink key={c.href} item={c} active={leafActive(pathname, c.href, c.exact)} nested />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function PainelNav({ papel, empresas }: { papel: Papel; empresas: string[] }) {
  const pathname = usePathname()

  // Login restrito (gerente/visualizador): Dashboard, Ver KPIs (só se a empresa
  // Benassi estiver liberada — read-only, já filtrado pelas redes do perfil) e
  // Usuários pro gerente (convidar visualizadores). Sem acesso ao resto
  // (gerar/editar KPI, Cozinha etc).
  if (papel === 'operador') {
    const grupos = GRUPOS_EMPRESA.filter(g => g.label !== 'Benassi' && empresas.includes(NOME_PARA_EMPRESA[g.label] ?? ''))
    return (
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
        <LeafLink item={DASHBOARD} active={pathname === '/painel'} />
        {grupos.length > 0 && (
          <span className="px-2.5 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Empresas</span>
        )}
        {grupos.map(g => <GroupBlock key={g.label} group={g} pathname={pathname} />)}
      </nav>
    )
  }

  if (papel !== 'admin') {
    return (
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
        <LeafLink item={DASHBOARD} active={pathname === '/painel'} />
        {papel === 'gerente' && (
          <LeafLink item={USUARIOS} active={pathname.startsWith('/painel/usuarios')} />
        )}
      </nav>
    )
  }

  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
      <LeafLink item={DASHBOARD} active={pathname === '/painel'} />
      <LeafLink item={USUARIOS} active={pathname.startsWith('/painel/usuarios')} />

      <span className="px-2.5 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
        Empresas
      </span>
      {GRUPOS_EMPRESA.map(g => (
        <GroupBlock key={g.label} group={g} pathname={pathname} />
      ))}

      <span className="px-2.5 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
        Operação
      </span>
      <GroupBlock group={GRUPO_COZINHA} pathname={pathname} />
    </nav>
  )
}
