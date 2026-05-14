import Link from 'next/link'
import { cadastrar } from './actions'

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>
}) {
  const { erro, sucesso } = await searchParams

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-zinc-900">Criar conta</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Cadastre-se para acessar o sistema.
        </p>

        <form action={cadastrar} className="mt-8 flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="senha" className="block text-sm font-medium text-zinc-700">
              Senha
            </label>
            <input
              id="senha"
              name="senha"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-500">Mínimo 6 caracteres.</p>
          </div>

          {erro && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {decodeURIComponent(erro)}
            </div>
          )}

          {sucesso && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
              {decodeURIComponent(sucesso)}
            </div>
          )}

          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition"
          >
            Criar conta
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-600">
          Já tem conta?{' '}
          <Link href="/login" className="font-medium text-zinc-900 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}
