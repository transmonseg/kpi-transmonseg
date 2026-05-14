import Link from 'next/link'
import { cadastrar } from './actions'

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>
}) {
  const { erro, sucesso } = await searchParams

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gradient-to-br from-brand-50 to-white">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-brand-600 text-white font-bold mb-6 shadow-md shadow-brand-600/20"
        >
          T
        </Link>
        <h1 className="text-2xl font-bold text-ink">Criar conta</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Cadastre-se para acessar o sistema.
        </p>

        <form action={cadastrar} className="mt-8 flex flex-col gap-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-ink mb-1.5"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-border-strong bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition"
              placeholder="voce@empresa.com"
            />
          </div>
          <div>
            <label
              htmlFor="senha"
              className="block text-sm font-medium text-ink mb-1.5"
            >
              Senha
            </label>
            <input
              id="senha"
              name="senha"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-lg border border-border-strong bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          {erro && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
              {decodeURIComponent(erro)}
            </div>
          )}

          {sucesso && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-sm text-emerald-700">
              {decodeURIComponent(sucesso)}
            </div>
          )}

          <button
            type="submit"
            className="mt-2 inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition shadow-sm shadow-brand-600/20"
          >
            Criar conta
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-soft">
          Já tem conta?{' '}
          <Link
            href="/login"
            className="font-semibold text-brand-600 hover:text-brand-700 hover:underline"
          >
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}
