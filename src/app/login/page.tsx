import Link from 'next/link'
import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>
}) {
  const { erro } = await searchParams

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-zinc-900">Entrar</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Acesse o sistema com seu email e senha.
        </p>

        <form action={login} className="mt-8 flex flex-col gap-4">
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
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
          </div>

          {erro && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {decodeURIComponent(erro)}
            </div>
          )}

          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition"
          >
            Entrar
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-600">
          Não tem conta?{' '}
          <Link href="/cadastro" className="font-medium text-zinc-900 hover:underline">
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  )
}
