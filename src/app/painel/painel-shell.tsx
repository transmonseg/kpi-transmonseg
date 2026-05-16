'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ThemeToggle } from '@/lib/theme/ThemeToggle'
import { HeaderTitle } from './header-title'
import { PainelNav } from './nav'

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
    <div className="flex min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)]">
      {/* Desktop sidebar — always dark, regardless of app theme. */}
      <aside
        className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-zinc-900 bg-gradient-to-b from-zinc-950 to-[#0a0a0c] md:flex"
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
            'absolute left-0 top-0 flex h-full w-[260px] max-w-[80vw] flex-col border-r border-zinc-900 bg-gradient-to-b from-zinc-950 to-[#0a0a0c] shadow-2xl transition-transform duration-200 ease-out ' +
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
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-bg)]/70 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Abrir menu"
              aria-expanded={open}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg-muted)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)] md:hidden"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden
              >
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <HeaderTitle />
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="hidden h-7 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 text-[12px] font-medium text-[var(--color-fg-muted)] sm:flex">
              {userEmail}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-4 md:px-8 md:py-6">{children}</main>
      </div>
    </div>
  )
}

function SidebarBrand({ onCloseHint }: { onCloseHint?: () => void }) {
  return (
    <div className="flex h-14 items-center justify-between border-b border-zinc-900/80 px-4">
      <Link
        href="/painel"
        className="flex items-center gap-2.5 outline-none"
        onClick={onCloseHint}
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-[13px] font-bold text-white shadow-sm shadow-black/40">
          T
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[13px] font-semibold tracking-tight text-zinc-50">
            Transmonseg
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
            KPI
          </span>
        </span>
      </Link>
      {onCloseHint && (
        <button
          type="button"
          onClick={onCloseHint}
          aria-label="Fechar menu"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-800/60 hover:text-zinc-100 md:hidden"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
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
    <div className="mt-auto border-t border-zinc-900/80 px-3 py-3">
      <div className="truncate px-2 pb-2 text-[11px] text-zinc-500">
        {userEmail}
      </div>
      <form action={sairAction}>
        <button
          type="submit"
          className="w-full rounded-md px-2 py-1.5 text-left text-[13px] font-medium text-zinc-400 transition hover:bg-zinc-800/60 hover:text-zinc-100"
        >
          Sair
        </button>
      </form>
    </div>
  )
}
