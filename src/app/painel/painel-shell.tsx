'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { List, X, SignOut } from '@phosphor-icons/react/dist/ssr'
import { ThemeToggle } from '@/lib/theme/ThemeToggle'
import { HeaderTitle } from './header-title'
import { PainelNav } from './nav'
import { TourRunner } from './tour-runner'

type Props = {
  userEmail: string | null | undefined
  papel: 'admin' | 'gerente' | 'visualizador' | 'operador'
  empresas: string[]
  sairAction: () => void | Promise<void>
  children: React.ReactNode
}

export function PainelShell({ userEmail, papel, empresas, sairAction, children }: Props) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Close drawer on route change.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Lock body scroll while drawer is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="flex min-h-[100dvh] bg-[var(--color-bg)] text-[var(--color-fg)]">
      {/* Tour guiado multi-página — montado uma vez aqui (não re-monta ao navegar). */}
      <TourRunner />

      {/* Desktop sidebar — always dark, regardless of app theme. */}
      <aside
        className="sidebar-kpi sticky top-0 hidden h-[100dvh] w-[220px] shrink-0 flex-col md:flex"
        style={{ colorScheme: 'dark' }}
      >
        <SidebarBrand central={papel === 'admin' || papel === 'operador'} />
        <PainelNav papel={papel} empresas={empresas} />
        <SidebarFooter userEmail={userEmail} sairAction={sairAction} />
      </aside>

      {/* Mobile drawer + backdrop. */}
      <div
        aria-hidden={!open}
        className={
          'fixed inset-0 z-40 md:hidden ' +
          (open ? 'pointer-events-auto' : 'pointer-events-none')
        }
      >
        {/* Backdrop. */}
        <div
          onClick={() => setOpen(false)}
          className={
            'absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-200 ' +
            (open ? 'opacity-100' : 'opacity-0')
          }
        />
        {/* Drawer panel. */}
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
          style={{ colorScheme: 'dark' }}
          className={
            'sidebar-kpi absolute left-0 top-0 flex h-full w-[272px] max-w-[84vw] flex-col shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ' +
            (open ? 'translate-x-0' : '-translate-x-full')
          }
        >
          <SidebarBrand central={papel === 'admin' || papel === 'operador'} onCloseHint={() => setOpen(false)} />
          <PainelNav papel={papel} empresas={empresas} />
          <SidebarFooter userEmail={userEmail} sairAction={sairAction} />
        </aside>
      </div>

      {/* Main column. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-bg)]/70 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Abrir menu"
              aria-expanded={open}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg-muted)] transition active:scale-[0.96] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)] md:hidden"
            >
              <List size={18} weight="bold" />
            </button>
            <HeaderTitle />
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="hidden h-8 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[12px] font-medium text-[var(--color-fg-muted)] sm:flex">
              {userEmail}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-10 md:py-10">{children}</main>
      </div>
    </div>
  )
}

function SidebarBrand({ onCloseHint, central }: { onCloseHint?: () => void; central?: boolean }) {
  return (
    <div className="flex h-16 items-center justify-between px-4">
      <div className="flex items-center gap-1.5">

      <Link href="/painel" className="group flex items-center gap-3 outline-none" onClick={onCloseHint}>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#1f3864] text-[14px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] transition-transform duration-300 group-hover:scale-105">
          T
        </span>
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-white">Transmonseg</span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8fb0e0]/70">{central ? 'Central' : 'KPI'}</span>
        </span>
      </Link>
      </div>
      {onCloseHint && (
        <button
          type="button"
          onClick={onCloseHint}
          aria-label="Fechar menu"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-sidebar-fg-muted)] transition active:scale-[0.96] hover:bg-white/[0.06] hover:text-white md:hidden"
        >
          <X size={16} weight="bold" />
        </button>
      )}
    </div>
  )
}

function SidebarFooter({
  userEmail,
  sairAction,
}: {
  userEmail: string | null | undefined
  sairAction: () => void | Promise<void>
}) {
  return (
    <div className="mt-auto p-3">
      <div className="flex items-center gap-2.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-2.5">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[12px] font-semibold text-white">
          {(userEmail ?? '?').slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-sidebar-fg)]">{userEmail}</span>
        <form action={sairAction}>
          <button
            type="submit"
            title="Sair"
            aria-label="Sair"
            className="inline-flex size-8 items-center justify-center rounded-full text-[var(--color-sidebar-fg-muted)] transition-[background-color,color,transform] duration-200 active:scale-95 hover:bg-white/[0.08] hover:text-white"
          >
            <SignOut size={15} weight="bold" />
          </button>
        </form>
      </div>
    </div>
  )
}
