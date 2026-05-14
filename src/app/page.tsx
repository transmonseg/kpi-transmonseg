import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect('/painel')

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gradient-to-br from-brand-50 to-white">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-brand-600 text-white font-bold text-xl mb-6 shadow-lg shadow-brand-600/25">
          T
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-ink">
          KPI TRANSMONSEG
        </h1>
        <p className="mt-3 text-ink-soft">
          Sistema de gestão de escalas e KPI de entregas.
        </p>
        <div className="mt-10 flex flex-col gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition shadow-sm shadow-brand-600/20"
          >
            Entrar
          </Link>
          <Link
            href="/cadastro"
            className="inline-flex items-center justify-center rounded-lg border border-border-strong bg-white px-5 py-3 text-sm font-semibold text-ink hover:bg-surface-hover transition"
          >
            Criar conta
          </Link>
        </div>
      </div>
    </div>
  )
}
