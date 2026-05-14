import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sair } from './actions'
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
    <div className="min-h-screen flex">
      <aside className="w-64 shrink-0 border-r border-border bg-white flex flex-col">
        <div className="px-5 py-5 border-b border-border">
          <Link href="/painel" className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-brand-600 text-white font-bold text-sm shadow-sm shadow-brand-600/20">
              T
            </span>
            <span>
              <span className="block font-bold text-sm tracking-tight text-ink">
                TRANSMONSEG
              </span>
              <span className="block text-xs text-ink-soft">Sistema KPI</span>
            </span>
          </Link>
        </div>

        <PainelNav />

        <div className="p-3 border-t border-border">
          <div className="px-2.5 py-1.5 text-xs text-ink-soft truncate">
            {user.email}
          </div>
          <form action={sair}>
            <button
              type="submit"
              className="w-full text-left px-2.5 py-1.5 mt-1 rounded-md text-sm text-ink hover:bg-surface-hover transition"
            >
              Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-8 lg:p-10">{children}</main>
    </div>
  )
}
