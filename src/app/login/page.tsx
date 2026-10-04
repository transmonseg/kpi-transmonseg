import Link from 'next/link'
import { ArrowRight, WarningCircle, CheckCircle, CaretLeft } from '@phosphor-icons/react/dist/ssr'
import { Input, Label } from '@/components/ui'
import { ThemeToggle } from '@/lib/theme/ThemeToggle'
import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>
}) {
  const { erro, sucesso } = await searchParams

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[var(--color-bg)] px-6 py-10 text-[var(--color-fg)]">
      {/* Top bar leve */}
      <div className="absolute left-4 top-4 flex items-center gap-3 md:left-8 md:top-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[14px] font-medium text-[var(--color-accent)] u-motion u-press hover:bg-[var(--color-bg-subtle)]"
        >
          <CaretLeft size={11} weight="bold" />
          Início
        </Link>
      </div>
      <div className="absolute right-4 top-4 md:right-8 md:top-8">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link
            href="/"
            className="mb-6 inline-flex size-14 items-center justify-center rounded-[16px] bg-[var(--color-navy-700)] text-[22px] font-bold text-white shadow-[0_8px_24px_-8px_rgba(31,56,100,0.6)] u-motion u-press"
          >
            T
          </Link>
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.025em] text-[var(--color-fg)]">
            Entrar no KPI
          </h1>
          <p className="mt-2 text-[15px] text-[var(--color-fg-muted)]">
            Use o e-mail e a senha do seu acesso Transmonseg.
          </p>
        </div>

        <div className="u-card p-7">
          <div>
            <form action={login} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="voce@empresa.com"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="senha">Senha</Label>
                <Input
                  id="senha"
                  name="senha"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </div>

              {erro && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-[12px] bg-[var(--color-danger-soft)] px-3.5 py-3 text-[13px] leading-relaxed text-[var(--color-danger-soft-fg)]"
                >
                  <WarningCircle size={14} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
                  <span>{decodeURIComponent(erro)}</span>
                </div>
              )}

              {sucesso && (
                <div
                  role="status"
                  className="flex items-start gap-2.5 rounded-[12px] bg-[var(--color-success-soft)] px-3.5 py-3 text-[13px] leading-relaxed text-[var(--color-success-soft-fg)]"
                >
                  <CheckCircle size={14} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-success)]" />
                  <span>{decodeURIComponent(sucesso)}</span>
                </div>
              )}

              <button
                type="submit"
                className="group mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--color-navy-700)] text-[16px] font-semibold text-white u-motion u-press hover:bg-[var(--color-navy-800)]"
              >
                Entrar
                <ArrowRight size={16} weight="bold" className="transition-transform duration-300 group-hover:translate-x-0.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
