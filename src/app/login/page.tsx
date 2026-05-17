import Link from 'next/link'
import { ArrowUpRight, WarningCircle, CaretLeft } from '@phosphor-icons/react/dist/ssr'
import { Input, Label } from '@/components/ui'
import { ThemeToggle } from '@/lib/theme/ThemeToggle'
import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>
}) {
  const { erro } = await searchParams

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[var(--color-bg)] px-6 py-10 text-[var(--color-fg)]">
      {/* Ambient navy orb */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[20%] right-[-15%] h-[700px] w-[700px] rounded-full opacity-[0.06] dark:opacity-[0.10]"
        style={{
          background:
            'radial-gradient(closest-side, var(--color-navy-700), transparent 70%)',
        }}
      />

      {/* Top bar leve */}
      <div className="absolute left-4 top-4 flex items-center gap-3 md:left-8 md:top-8">
        <Link
          href="/"
          className="group inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/80 px-3 py-1.5 text-[12px] font-medium text-[var(--color-fg-muted)] backdrop-blur-xl transition-colors hover:text-[var(--color-fg)] active:scale-[0.97]"
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
            className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-navy-700)] text-[16px] font-semibold tracking-tight text-white"
          >
            T
          </Link>
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-fg-subtle)]">
            Acesso restrito
          </span>
          <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-[-0.025em] text-[var(--color-fg)] md:text-[32px]">
            Entrar no painel
          </h1>
          <p className="mt-2 max-w-[36ch] text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
            Acesse com seu email e senha pra operar escalas, KPIs e revisão.
          </p>
        </div>

        {/* Double-bezel card */}
        <div className="rounded-[var(--radius-display)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-1.5 shadow-soft">
          <div
            className="rounded-[calc(var(--radius-display)-0.375rem)] bg-[var(--color-bg)] p-7"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)' }}
          >
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
                  className="flex items-start gap-2.5 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-3.5 py-3 text-[12px] leading-relaxed text-[var(--color-danger-soft-fg)]"
                >
                  <WarningCircle size={14} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
                  <span>{decodeURIComponent(erro)}</span>
                </div>
              )}

              <button
                type="submit"
                className="group mt-2 inline-flex h-12 items-center justify-between rounded-full bg-[var(--color-fg)] pl-6 pr-2 text-[14px] font-medium text-[var(--color-bg)] transition-all duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[var(--color-navy-700)] active:scale-[0.98]"
              >
                Entrar
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 transition-transform duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
                  <ArrowUpRight size={14} weight="bold" />
                </span>
              </button>
            </form>
          </div>
        </div>

        <p className="mt-6 text-center text-[13px] text-[var(--color-fg-muted)]">
          Não tem conta?{' '}
          <Link
            href="/cadastro"
            className="font-medium text-[var(--color-fg)] underline decoration-[var(--color-navy-700)] underline-offset-[3px] transition-colors hover:text-[var(--color-navy-700)] dark:hover:text-[var(--color-navy-300)]"
          >
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  )
}
