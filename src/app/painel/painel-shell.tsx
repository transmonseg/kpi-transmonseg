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
  papel: 'admin' | 'gerente' | 'visualizador'
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
        className="sidebar-navy sticky top-0 hidden h-[100dvh] w-[232px] shrink-0 flex-col md:flex"
        style={{ colorScheme: 'dark' }}
      >
        <SidebarBrand />
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
            'absolute inset-0 bg-black/40 backdrop-blur-[3px] transition-opacity duration-300 ' +
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
            'sidebar-navy absolute left-0 top-0 flex h-full w-[272px] max-w-[84vw] flex-col shadow-2xl transition-transform duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] ' +
            (open ? 'translate-x-0' : '-translate-x-full')
          }
        >
          <SidebarBrand onCloseHint={() => setOpen(false)} />
          <PainelNav papel={papel} empresas={empresas} />
          <SidebarFooter userEmail={userEmail} sairAction={sairAction} />
        </aside>
      </div>

      {/* Main column. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-[52px] items-center justify-between border-b border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-bg)_78%,transparent)] px-4 backdrop-blur-xl backdrop-saturate-150 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Abrir menu"
              aria-expanded={open}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-fg)] u-motion u-press hover:bg-[var(--color-bg-hover)] md:hidden"
            >
              <List size={18} weight="bold" />
            </button>
            <HeaderTitle />
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="hidden items-center gap-2 sm:flex">
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-[var(--color-navy-700)] text-[12px] font-semibold text-white">
                {(userEmail ?? '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="max-w-[220px] truncate text-[13px] text-[var(--color-fg-muted)]">{userEmail}</span>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-10 md:py-9">{children}</main>
      </div>
    </div>
  )
}

function SidebarBrand({ onCloseHint }: { onCloseHint?: () => void }) {
  return (
    <div className="flex h-[60px] items-center justify-between px-4">
      <Link href="/painel" className="group flex items-center gap-2.5 outline-none" onClick={onCloseHint}>
        <span className="inline-flex size-8 items-center justify-center rounded-[9px] bg-white text-[15px] font-bold text-[#1F3864] shadow-[0_1px_2px_rgba(0,0,0,0.25)] u-motion group-active:scale-95">
          T
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-white">Transmonseg</span>
          <span className="text-[12px] text-[var(--color-sidebar-fg-muted)]">KPI de entregas</span>
        </span>
      </Link>
      {onCloseHint && (
        <button
          type="button"
          onClick={onCloseHint}
          aria-label="Fechar menu"
          className="inline-flex size-8 items-center justify-center rounded-full text-[var(--color-sidebar-fg-muted)] u-motion u-press hover:bg-white/10 hover:text-white md:hidden"
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
    <div className="mt-auto border-t border-[var(--color-sidebar-border)] p-3">
      <div className="flex items-center gap-2.5 px-2 pb-2">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-[13px] font-semibold text-white">
          {(userEmail ?? '?').slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 truncate text-[13px] text-[var(--color-sidebar-fg)]">{userEmail}</span>
      </div>
      <form action={sairAction}>
        <button
          type="submit"
          className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-left text-[14px] font-medium text-[var(--color-sidebar-fg-muted)] u-motion u-press hover:bg-[var(--color-sidebar-hover)] hover:text-white"
        >
          <SignOut size={17} />
          Sair
        </button>
      </form>
    </div>
  )
}
