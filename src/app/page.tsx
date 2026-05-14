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
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900">
          KPI TRANSMONSEG
        </h1>
        <p className="mt-3 text-zinc-600">
          Sistema de gestão de escalas e KPI de entregas.
        </p>
        <div className="mt-10 flex flex-col gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800 transition"
          >
            Entrar
          </Link>
          <Link
            href="/cadastro"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-100 transition"
          >
            Criar conta
          </Link>
        </div>
      </div>
    </div>
  )
}
