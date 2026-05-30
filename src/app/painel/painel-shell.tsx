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
  sairAction: () => void | Promise<void>
  children: React.ReactNode
}

export function PainelShell({ userEmail, sairAction, children }: Props) {
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
        className="sticky top-0 hidden h-[100dvh] w-[196px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0a0a0a] md:flex"
        style={{ colorScheme: 'dark' }}
      >
        <SidebarBrand />
        <PainelNav />
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
            'absolute left-0 top-0 flex h-full w-[260px] max-w-[80vw] flex-col border-r border-white/[0.06] bg-[#0a0a0a] shadow-2xl transition-transform duration-200 ease-out ' +
            (open ? 'translate-x-0' : '-translate-x-full')
          }
        >
          <SidebarBrand onCloseHint={() => setOpen(false)} />
          <PainelNav />
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

function SidebarBrand({ onCloseHint }: { onCloseHint?: () => void }) {
  return (
    <div className="flex h-16 items-center justify-between border-b border-white/[0.06] px-4">
      <Link
        href="/painel"
        className="group flex items-center gap-3 outline-none"
        onClick={onCloseHint}
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#1F3864] text-[12px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_3px_rgba(0,0,0,0.5)] transition group-hover:bg-[#2a4773]">
          T
        </span>
        <span className="flex flex-col leading-none">
          <span className="text-[14px] font-medium tracking-tight text-zinc-50">
            Transmonseg
          </span>
          <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-600">
            KPI
          </span>
        </span>
      </Link>
      {onCloseHint && (
        <button
          type="button"
          onClick={onCloseHint}
          aria-label="Fechar menu"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition active:scale-[0.96] hover:bg-white/[0.06] hover:text-zinc-100 md:hidden"
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
    <div className="mt-auto border-t border-white/[0.06] p-3">
      <div className="truncate px-2.5 pb-2 text-[11px] text-zinc-600">
        {userEmail}
      </div>
      <form action={sairAction}>
        <button
          type="submit"
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-zinc-500 transition-all duration-150 active:scale-[0.98] hover:bg-white/[0.04] hover:text-zinc-100"
        >
          <SignOut size={15} weight="bold" />
          Sair
        </button>
      </form>
    </div>
  )
}
