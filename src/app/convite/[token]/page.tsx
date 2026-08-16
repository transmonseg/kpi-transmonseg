import Link from 'next/link'
import { ArrowUpRight, WarningCircle, CaretLeft } from '@phosphor-icons/react/dist/ssr'
import { Input, Label } from '@/components/ui'
import { ThemeToggle } from '@/lib/theme/ThemeToggle'
import { createServiceClient } from '@/lib/supabase/service'
import { conviteExpirado } from '@/lib/perfil'
import { REDE_LABEL } from '@/lib/kpi/redes'
import { resgatar } from './actions'

const PAPEL_LABEL = { gerente: 'Gerente', visualizador: 'Visualizador' } as const

export default async function ConvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ erro?: string }>
}) {
  const { token } = await params
  const { erro } = await searchParams

  const svc = createServiceClient()
  const { data: convite } = await svc.from('convites').select('*').eq('token', token).maybeSingle()

  const invalido = !convite
  const usado = !!convite?.usado_em
  const expirado = !!convite && conviteExpirado(convite.expira_em as string | null)
  const bloqueado = invalido || usado || expirado

  const resgatarComToken = resgatar.bind(null, token)

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[var(--color-bg)] px-6 py-10 text-[var(--color-fg)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[20%] right-[-15%] h-[700px] w-[700px] rounded-full opacity-[0.06] dark:opacity-[0.10]"
        style={{ background: 'radial-gradient(closest-side, var(--color-navy-700), transparent 70%)' }}
      />
      <div className="absolute left-4 top-4 md:left-8 md:top-8">
        <Link
          href="/login"
          className="group inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/80 px-3 py-1.5 text-[12px] font-medium text-[var(--color-fg-muted)] backdrop-blur-xl transition-colors hover:text-[var(--color-fg)] active:scale-[0.97]"
        >
          <CaretLeft size={11} weight="bold" />
          Entrar
        </Link>
      </div>
      <div className="absolute right-4 top-4 md:right-8 md:top-8">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-navy-700)] text-[16px] font-semibold tracking-tight text-white">
            T
          </span>
          <span className="mt-6 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-fg-subtle)]">
            Convite
          </span>
          <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-[-0.025em] text-[var(--color-fg)] md:text-[32px]">
            {bloqueado ? 'Convite indisponível' : 'Definir sua senha'}
          </h1>
          {!bloqueado && (
            <p className="mt-2 max-w-[36ch] text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
              Acesso de <strong>{PAPEL_LABEL[convite.papel as 'gerente' | 'visualizador']}</strong> — só a tela de
              Dashboard, redes: {(convite.redes as string[]).map(r => REDE_LABEL[r] ?? r).join(', ') || '—'}.
            </p>
          )}
        </div>

        <div className="rounded-[var(--radius-display)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-1.5 shadow-soft">
          <div
            className="rounded-[calc(var(--radius-display)-0.375rem)] bg-[var(--color-bg)] p-7"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)' }}
          >
            {bloqueado ? (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-3.5 py-3 text-[12px] leading-relaxed text-[var(--color-danger-soft-fg)]"
              >
                <WarningCircle size={14} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
                <span>
                  {invalido && 'Esse link de convite não existe.'}
                  {!invalido && usado && 'Esse convite já foi usado.'}
                  {!invalido && !usado && expirado && 'Esse convite expirou. Peça um link novo.'}
                </span>
              </div>
            ) : (
              <form action={resgatarComToken} className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">Seu email</Label>
                  <Input id="email" name="email" type="email" required autoComplete="email" placeholder="voce@email.com" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="senha">Senha</Label>
                  <Input
                    id="senha" name="senha" type="password" required minLength={6}
                    autoComplete="new-password" placeholder="Mínimo 6 caracteres"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="confirmar">Confirmar senha</Label>
                  <Input
                    id="confirmar" name="confirmar" type="password" required minLength={6}
                    autoComplete="new-password" placeholder="Repita a senha"
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
                  className="group mt-2 inline-flex h-12 items-center justify-between rounded-full bg-[var(--color-navy-700)] pl-6 pr-2 text-[14px] font-medium text-white transition-all duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] hover:opacity-90 active:scale-[0.98]"
                >
                  Criar acesso
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 transition-transform duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
                    <ArrowUpRight size={14} weight="bold" />
                  </span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
