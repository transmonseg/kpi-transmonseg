import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ArrowUpRight,
  TableIcon,
  Lightning,
  ShieldCheck,
  WaveTriangle,
  CheckCircle,
} from '@phosphor-icons/react/dist/ssr'
import { createClient } from '@/lib/supabase/server'
import { ThemeToggle } from '@/lib/theme/ThemeToggle'

export const metadata = {
  title: 'KPI Transmonseg — Operação logística visível em minutos',
  description:
    'Suba escalas e relatório Unitrac. Receba KPIs por rede com geolocalização, anomalias detectadas e XLSX/PDF prontos.',
}

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/painel')

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-[var(--color-bg)] text-[var(--color-fg)]">
      {/* Ambient orbs — radial gradient navy bem sutil, anti-neon */}
      <div
        aria-hidden
        className="pointer-events-none fixed -top-[40%] -right-[20%] h-[900px] w-[900px] rounded-full opacity-[0.07] dark:opacity-[0.12]"
        style={{
          background:
            'radial-gradient(closest-side, var(--color-navy-700), transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -bottom-[30%] -left-[15%] h-[700px] w-[700px] rounded-full opacity-[0.04] dark:opacity-[0.08]"
        style={{
          background:
            'radial-gradient(closest-side, var(--color-navy-700), transparent 70%)',
        }}
      />

      {/* Fluid island nav — pill flutuante */}
      <nav className="sticky top-6 z-30 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/80 px-2 py-2 backdrop-blur-xl">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-[var(--color-fg)]"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-navy-700)] text-[11px] font-semibold tracking-tight text-white">
            T
          </span>
          <span className="hidden tracking-tight sm:inline">Transmonseg KPI</span>
        </Link>
        <span aria-hidden className="hidden h-4 w-px bg-[var(--color-border)] sm:inline-block" />
        <ThemeToggle />
        <Link
          href="/login"
          className="group ml-1 inline-flex items-center gap-2 rounded-full bg-[var(--color-fg)] py-1.5 pl-4 pr-1.5 text-[13px] font-medium text-[var(--color-bg)] transition-all duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[var(--color-navy-700)] active:scale-[0.97]"
        >
          Entrar
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/15 transition-transform duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-px group-hover:translate-x-px">
            <ArrowUpRight size={11} weight="bold" />
          </span>
        </Link>
      </nav>

      {/* Hero — Editorial Split asymmetric */}
      <section className="relative mx-auto w-full max-w-[1280px] px-6 pb-24 pt-16 md:px-10 md:pb-32 md:pt-24 lg:pb-40 lg:pt-32">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="col-span-1 lg:col-span-7">
            {/* Eyebrow pill */}
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">
              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-navy-700)]" />
              KPI Benassi · v1
            </span>

            <h1 className="mt-6 text-[44px] font-semibold leading-[0.95] tracking-[-0.04em] text-[var(--color-fg)] md:text-[72px] lg:text-[96px]">
              Operação visível.
              <br />
              <span className="text-[var(--color-navy-700)] dark:text-[var(--color-navy-300)]">
                Em minutos.
              </span>
            </h1>

            <p className="mt-8 max-w-[58ch] text-[16px] leading-relaxed text-[var(--color-fg-muted)] md:text-[18px]">
              Suba a escala do dia e o relatório Unitrac. Cruza tudo, detecta
              anomalias, gera XLSX e PDF prontos por rede. Sem planilha manual,
              sem sumiço de placa, sem dúvida no horário.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-fg)] py-3 pl-6 pr-2 text-[14px] font-medium text-[var(--color-bg)] transition-all duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[var(--color-navy-700)] active:scale-[0.97]"
              >
                Entrar no painel
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 transition-transform duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
                  <ArrowUpRight size={14} weight="bold" />
                </span>
              </Link>

              <Link
                href="/cadastro"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-transparent px-6 py-3 text-[14px] font-medium text-[var(--color-fg)] transition-all duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[var(--color-fg)] active:scale-[0.97]"
              >
                Criar conta
              </Link>
            </div>
          </div>

          {/* Lateral — proof bento */}
          <aside className="col-span-1 flex flex-col gap-4 lg:col-span-5">
            <ProofBento />
          </aside>
        </div>
      </section>

      {/* Features — Asymmetric Bento */}
      <section className="relative mx-auto w-full max-w-[1280px] px-6 pb-24 md:px-10 md:pb-32 lg:pb-40">
        <div className="mb-12 flex flex-col gap-3 md:mb-16">
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-fg-subtle)]">
            Como funciona
          </span>
          <h2 className="max-w-[24ch] text-[32px] font-semibold leading-tight tracking-[-0.025em] text-[var(--color-fg)] md:text-[48px]">
            Da escala bruta ao KPI{' '}
            <span className="text-[var(--color-navy-700)] dark:text-[var(--color-navy-300)]">
              pronto pra publicar
            </span>
            .
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <FeatureCard
            className="md:col-span-7 md:row-span-2"
            eyebrow="01 · Cruzamento"
            icon={<WaveTriangle weight="duotone" size={28} />}
            title="Escala × Unitrac em uma passada."
            description="Detecta placa, horário, loja e cruza com o relatório de telemetria. Identifica entregas sem GPS, sumiços, paradas duplicadas, motorista trocado. Tudo automático."
            big
          />
          <FeatureCard
            className="md:col-span-5"
            eyebrow="02 · Anomalias"
            icon={<ShieldCheck weight="duotone" size={24} />}
            title="Qualidade em camadas."
            description="HIGH, MEDIUM e LOW. Revisa, aceita, ignora, corrige. Antes de ir pro PDF."
          />
          <FeatureCard
            className="md:col-span-5"
            eyebrow="03 · Output"
            icon={<TableIcon weight="duotone" size={24} />}
            title="XLSX + PDF por rede."
            description="Cabeçalho navy oficial, fonte Calibri, layout pronto pra cliente. Já formatado."
          />
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="relative mx-auto w-full max-w-[1280px] px-6 pb-24 md:px-10 md:pb-32">
        <div className="relative overflow-hidden rounded-[var(--radius-display)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-10 md:p-16">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-32 -top-32 h-[400px] w-[400px] rounded-full opacity-[0.08]"
            style={{
              background:
                'radial-gradient(closest-side, var(--color-navy-700), transparent)',
            }}
          />
          <div className="relative flex flex-col items-start gap-8 md:flex-row md:items-end md:justify-between">
            <div className="max-w-[26ch]">
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-fg-subtle)]">
                Pronto pra começar
              </span>
              <h2 className="mt-3 text-[32px] font-semibold leading-tight tracking-[-0.025em] text-[var(--color-fg)] md:text-[44px]">
                Suba a escala de hoje.
              </h2>
            </div>
            <Link
              href="/login"
              className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-fg)] py-3 pl-6 pr-2 text-[14px] font-medium text-[var(--color-bg)] transition-all duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[var(--color-navy-700)] active:scale-[0.97]"
            >
              Entrar
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 transition-transform duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
                <ArrowUpRight size={14} weight="bold" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer compacto */}
      <footer className="relative mx-auto w-full max-w-[1280px] border-t border-[var(--color-border)] px-6 py-10 md:px-10">
        <div className="flex flex-col items-start justify-between gap-4 text-[12px] text-[var(--color-fg-subtle)] md:flex-row md:items-center">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-navy-700)] text-[11px] font-semibold text-white">
              T
            </span>
            <span className="text-numeric">
              Transmonseg KPI · {new Date().getFullYear()}
            </span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/login" className="transition-colors hover:text-[var(--color-fg)]">
              Entrar
            </Link>
            <Link href="/cadastro" className="transition-colors hover:text-[var(--color-fg)]">
              Criar conta
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function ProofBento() {
  const stats = [
    { value: '17', label: 'redes suportadas', hint: 'Assaí, Carrefour, Sendas, Princesa, Guanabara, +12' },
    { value: '< 30s', label: 'pra gerar', hint: 'da escala ao XLSX pronto' },
    { value: '3 sev', label: 'de anomalia', hint: 'HIGH, MEDIUM, LOW' },
  ]

  return (
    <div className="relative">
      {/* Double-bezel outer shell */}
      <div className="relative rounded-[var(--radius-display)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-1.5 shadow-soft">
        {/* Inner core */}
        <div
          className="relative overflow-hidden rounded-[calc(var(--radius-display)-0.375rem)] bg-[var(--color-bg)] p-8"
          style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)' }}
        >
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-fg-subtle)]">
            <Lightning size={12} weight="fill" className="text-[var(--color-navy-700)] dark:text-[var(--color-navy-300)]" />
            Em produção
          </div>

          <div className="mt-8 flex flex-col divide-y divide-[var(--color-border)]">
            {stats.map((s, i) => (
              <div key={i} className="flex items-baseline justify-between gap-4 py-5 first:pt-0 last:pb-0">
                <div className="flex flex-col">
                  <span className="text-display text-[44px] text-[var(--color-fg)]">
                    {s.value}
                  </span>
                  <span className="mt-1 text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
                    {s.label}
                  </span>
                </div>
                <span className="max-w-[55%] text-right text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
                  {s.hint}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center gap-2 border-t border-[var(--color-border)] pt-5 text-[11px] text-[var(--color-fg-muted)]">
            <CheckCircle weight="fill" size={12} className="text-[var(--color-success)]" />
            <span>Última geração há instantes</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function FeatureCard({
  className,
  eyebrow,
  icon,
  title,
  description,
  big,
}: {
  className?: string
  eyebrow: string
  icon: React.ReactNode
  title: string
  description: string
  big?: boolean
}) {
  return (
    <article
      className={
        'group relative flex flex-col justify-between gap-8 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-8 transition-colors duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[var(--color-border-strong)] md:p-10 ' +
        (className ?? '')
      }
    >
      <div className="flex items-center justify-between gap-4">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-navy-700)] transition-transform duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-0.5 dark:text-[var(--color-navy-300)]">
          {icon}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-fg-subtle)]">
          {eyebrow}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <h3
          className={
            big
              ? 'max-w-[18ch] text-[28px] font-semibold leading-tight tracking-[-0.025em] text-[var(--color-fg)] md:text-[36px]'
              : 'max-w-[20ch] text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-fg)]'
          }
        >
          {title}
        </h3>
        <p
          className={
            big
              ? 'max-w-[42ch] text-[15px] leading-relaxed text-[var(--color-fg-muted)] md:text-[16px]'
              : 'max-w-[36ch] text-[13.5px] leading-relaxed text-[var(--color-fg-muted)]'
          }
        >
          {description}
        </p>
      </div>
    </article>
  )
}
