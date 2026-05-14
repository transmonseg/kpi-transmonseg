import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sair } from './actions'

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
      <aside className="w-60 shrink-0 border-r border-zinc-200 bg-white flex flex-col">
        <div className="px-5 py-5 border-b border-zinc-200">
          <Link href="/painel" className="font-bold text-lg tracking-tight">
            TRANSMONSEG
          </Link>
          <p className="text-xs text-zinc-500 mt-0.5">Sistema KPI</p>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1 text-sm">
          <Link
            href="/painel"
            className="px-3 py-2 rounded-lg hover:bg-zinc-100 transition"
          >
            Início
          </Link>
          <Link
            href="/painel/cozinha"
            className="px-3 py-2 rounded-lg hover:bg-zinc-100 transition"
          >
            Cozinha
          </Link>
          <div className="px-3 py-2 text-zinc-400 text-xs uppercase tracking-wider mt-4">
            Em breve
          </div>
          <div className="px-3 py-2 rounded-lg text-zinc-400 cursor-not-allowed">
            KPI Benassi
          </div>
          <div className="px-3 py-2 rounded-lg text-zinc-400 cursor-not-allowed">
            Alterações
          </div>
          <div className="px-3 py-2 rounded-lg text-zinc-400 cursor-not-allowed">
            Histórico
          </div>
        </nav>

        <div className="p-3 border-t border-zinc-200 text-xs">
          <div className="px-2 py-1.5 text-zinc-600 truncate">{user.email}</div>
          <form action={sair}>
            <button
              type="submit"
              className="w-full text-left px-2 py-1.5 mt-1 rounded hover:bg-zinc-100 text-zinc-700"
            >
              Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-8">{children}</main>
    </div>
  )
}
