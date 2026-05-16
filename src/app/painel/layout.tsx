import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ThemeToggle } from '@/lib/theme/ThemeToggle'
import { sair } from './actions'
import { HeaderTitle } from './header-title'
import { PainelNav } from './nav'

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)]">
      {/* Sidebar — always dark, regardless of app theme. */}
      <aside
        className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-zinc-900 bg-gradient-to-b from-zinc-950 to-[#0a0a0c] md:flex"
        style={{ colorScheme: 'dark' }}
      >
        <div className="flex h-14 items-center border-b border-zinc-900/80 px-4">
          <Link
            href="/painel"
            className="flex items-center gap-2.5 outline-none"
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
        </div>

        <PainelNav />

        <div className="mt-auto border-t border-zinc-900/80 px-3 py-3">
          <div className="px-2 pb-2 text-[11px] text-zinc-500 truncate">
            {user.email}
          </div>
          <form action={sair}>
            <button
              type="submit"
              className="w-full rounded-md px-2 py-1.5 text-left text-[13px] font-medium text-zinc-400 transition hover:bg-zinc-800/60 hover:text-zinc-100"
            >
              Sair
            </button>
          </form>
        </div>
      </aside>

      {/* Main column. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 px-6 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-bg)]/70">
          <div className="flex items-center gap-3 min-w-0">
            <HeaderTitle />
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="hidden h-7 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 text-[12px] font-medium text-[var(--color-fg-muted)] sm:flex">
              {user.email}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-4 md:px-8 md:py-6">{children}</main>
      </div>
    </div>
  )
}
