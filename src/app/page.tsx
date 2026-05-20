import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ArrowUpRight,
  TableIcon,
  Lightning,
  ShieldCheck,
  WaveTriangle,
  CheckCircle,
  PencilSimpleLine,
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
      {/* Grain/noise overlay — fixed, never attached to scroll container */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[60] opacity-[0.022] dark:opacity-[0.038]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '120px 120px',
        }}
      />

      {/* Ambient orbs */}
      <div
        aria-hidden
        className="pointer-events-none fixed -right-[20%] -top-[40%] h-[900px] w-[900px] rounded-full opacity-[0.06] dark:opacity-[0.10]"
        style={{
          background: 'radial-gradient(closest-side, var(--color-navy-700), transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -bottom-[30%] -left-[15%] h-[700px] w-[700px] rounded-full opacity-[0.04] dark:opacity-[0.07]"
        style={{
          background: 'radial-gradient(closest-side, var(--color-navy-600), transparent 70%)',
        }}
      />

      {/* ─── Floating island nav ─── */}
      <nav className="sticky top-5 z-30 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/85 px-2 py-2 shadow-soft backdrop-blur-2xl">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-[var(--color-fg)]"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-navy-700)] text-[11px] font-bold tracking-tight text-white">
            T
          </span>
          <span className="hidden tracking-tight sm:inline">Transmonseg KPI</span>
        </Link>
        <span aria-hidden className="hidden h-4 w-px bg-[var(--color-border)] sm:inline-block" />
        <ThemeToggle />
        <Link
          href="/login"
          className="group ml-1 inline-flex items-center gap-2 rounded-full bg-[var(--color-navy-700)] py-1.5 pl-4 pr-1.5 text-[13px] font-medium text-white transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:opacity-90 active:scale-[0.97]"
        >
          Entrar
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/15 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-px group-hover:translate-x-px">
            <ArrowUpRight size={11} weight="bold" />
          </span>
        </Link>
      </nav>

      {/* ─── Hero — Editorial Split ─── */}
      <section className="relative mx-auto w-full max-w-[1280px] px-6 pb-16 pt-16 md:px-10 md:pb-20 md:pt-20 lg:pb-28 lg:pt-28">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-10">
          {/* Left: massive typography */}
          <div className="col-span-1 lg:col-span-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-fg-subtle)]">
              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-navy-700)]" />
              KPI Benassi · v1
            </span>

            <h1 className="mt-5 text-[52px] font-semibold leading-[0.91] tracking-[-0.045em] text-[var(--color-fg)] md:text-[84px] lg:text-[108px]">
              Operação
              <br />
              <span className="text-[var(--color-navy-700)] dark:text-[var(--color-navy-300)]">
                visível.
              </span>
              <br />
              Em minutos.
            </h1>

            {/* Accent separator */}
            <div className="mt-7 h-px w-14 bg-[var(--color-navy-700)] opacity-35" />

            <p className="mt-6 max-w-[50ch] text-[16px] leading-[1.75] text-[var(--color-fg-muted)] md:text-[18px]">
              Sobe a escala do dia e o relatório Unitrac. Cruza
              tudo, detecta anomalias, gera XLSX e PDF prontos
              por rede. Sem planilha manual. Sem sumiço de placa.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-navy-700)] py-3.5 pl-7 pr-2.5 text-[14px] font-medium text-white shadow-[0_4px_20px_-4px_rgba(31,56,100,0.45)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:shadow-[0_6px_24px_-4px_rgba(31,56,100,0.65)] hover:opacity-95 active:scale-[0.97]"
              >
                Entrar no painel
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
                  <ArrowUpRight size={14} weight="bold" />
                </span>
              </Link>
              <Link
                href="/cadastro"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-transparent px-7 py-3.5 text-[14px] font-medium text-[var(--color-fg)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[var(--color-fg)] active:scale-[0.97]"
              >
                Criar conta
              </Link>
            </div>
          </div>

          {/* Right: ProofBento */}
          <aside className="col-span-1 flex flex-col justify-center lg:col-span-5">
            <ProofBento />
          </aside>
        </div>
      </section>

      {/* ─── Stats strip ─── */}
      <section className="relative mx-auto w-full max-w-[1280px] px-6 pb-16 md:px-10 md:pb-20">
        <div className="relative overflow-hidden rounded-[var(--radius-display)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <div className="grid grid-cols-1 divide-y divide-[var(--color-border)] md:grid-cols-3 md:divide-x md:divide-y-0">
            {[
              {
                num: '15+',
                label: 'Redes atendidas',
                sub: 'Assaí, Carrefour, Guanabara, Sendas, Zona Sul, Princesa, +9',
              },
              {
                num: '< 30s',
                label: 'Da escala ao KPI',
                sub: 'Cruzamento, anomalias, XLSX e PDF em segundos — sem etapa manual',
              },
              {
                num: '11',
                label: 'Tipos de anomalia',
                sub: 'GPS inválido, fora janela, sem rastreador, tempo excessivo, +7',
              },
            ].map((s, i) => (
              <div key={i} className="flex flex-col gap-2.5 px-8 py-8 md:py-10">
                <span className="text-display text-[56px] font-semibold leading-none tracking-[-0.05em] text-[var(--color-navy-700)] dark:text-[var(--color-navy-300)] md:text-[68px]">
                  {s.num}
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--color-fg)]">
                    {s.label}
                  </span>
                  <span className="text-[12px] leading-relaxed text-[var(--color-fg-subtle)]">
                    {s.sub}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features — Asymmetric Bento ─── */}
      <section className="relative mx-auto w-full max-w-[1280px] px-6 pb-24 md:px-10 md:pb-32 lg:pb-40">
        <div className="mb-14 flex flex-col gap-3">
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-fg-subtle)]">
            Como funciona
          </span>
          <h2 className="max-w-[22ch] text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--color-fg)] md:text-[52px]">
            Da escala bruta ao KPI{' '}
            <span className="text-[var(--color-navy-700)] dark:text-[var(--color-navy-300)]">
              pronto pra publicar.
            </span>
          </h2>
        </div>

        {/* 7+5 / 5+7 alternating layout */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <FeatureCard
            className="md:col-span-7"
            step="01"
            eyebrow="Cruzamento"
            icon={<WaveTriangle weight="duotone" size={30} />}
            title="Escala × Unitrac em uma passada."
            description="Detecta placa, horário, loja e cruza com o relatório de telemetria. Identifica entregas sem GPS, sumiços, paradas duplicadas, motorista trocado. Tudo automático."
            big
          />
          <FeatureCard
            className="md:col-span-5"
            step="02"
            eyebrow="Anomalias"
            icon={<ShieldCheck weight="duotone" size={28} />}
            title="Qualidade em camadas."
            description="HIGH, MEDIUM e LOW. Revisa, aceita, ignora, corrige — antes de ir pro PDF."
          />
          <FeatureCard
            className="md:col-span-5"
            step="03"
            eyebrow="Output"
            icon={<TableIcon weight="duotone" size={28} />}
            title="XLSX + PDF por rede."
            description="Cabeçalho navy oficial, fonte Calibri, layout pronto pra cliente. Já formatado."
          />
          <FeatureCard
            className="md:col-span-7"
            step="04"
            eyebrow="Edição & Histórico"
            icon={<PencilSimpleLine weight="duotone" size={28} />}
            title="Edita, reprocessa — histórico preservado."
            description="Edite motorista, placa, horários direto na tabela de revisão. Marque rotas como sem entrega. Aplique alterações coladas do WhatsApp. Cada geração fica no histórico — baixe versões anteriores quando quiser."
            big
          />
        </div>
      </section>

      {/* ─── Bottom CTA — dark navy ─── */}
      <section className="relative mx-auto w-full max-w-[1280px] px-6 pb-24 md:px-10 md:pb-32">
        <div className="relative overflow-hidden rounded-[var(--radius-display)] bg-[var(--color-navy-800)] px-10 py-16 dark:bg-[var(--color-navy-900)] md:px-16 md:py-24">
          {/* Inner glow orbs */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-[450px] w-[450px] rounded-full opacity-[0.18]"
            style={{
              background: 'radial-gradient(closest-side, var(--color-navy-400), transparent)',
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-20 -left-20 h-[300px] w-[300px] rounded-full opacity-[0.10]"
            style={{
              background: 'radial-gradient(closest-side, var(--color-navy-300), transparent)',
            }}
          />

          <div className="relative flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-4">
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-navy-300)]">
                Pronto pra começar
              </span>
              <h2 className="text-[40px] font-semibold leading-[1.0] tracking-[-0.038em] text-white md:text-[62px]">
                Suba a escala
                <br />
                de hoje.
              </h2>
            </div>

            <div className="flex flex-col items-start gap-3 md:items-end">
              <Link
                href="/login"
                className="group inline-flex items-center gap-2 rounded-full bg-white py-4 pl-8 pr-2.5 text-[14px] font-semibold text-[var(--color-navy-800)] shadow-[0_4px_28px_-4px_rgba(255,255,255,0.25)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:shadow-[0_6px_32px_-4px_rgba(255,255,255,0.40)] active:scale-[0.97]"
              >
                Entrar no painel
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-navy-700)]/15 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
                  <ArrowUpRight size={14} weight="bold" />
                </span>
              </Link>
              <span className="text-[12px] text-[var(--color-navy-400)]">
                Sem cartão. Acesso imediato.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="relative mx-auto w-full max-w-[1280px] border-t border-[var(--color-border)] px-6 py-10 md:px-10">
        <div className="flex flex-col items-start justify-between gap-4 text-[12px] text-[var(--color-fg-subtle)] md:flex-row md:items-center">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-navy-700)] text-[11px] font-bold text-white">
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

/* ─── ProofBento ─── */
function ProofBento() {
  const stats = [
    {
      value: '15+',
      label: 'redes suportadas',
      hint: 'Assaí, Carrefour, Sendas, Princesa, Guanabara, Zona Sul, +9',
    },
    {
      value: '< 30s',
      label: 'pra gerar o KPI',
      hint: 'da escala ao XLSX/PDF pronto, com anomalias detectadas',
    },
    {
      value: '11',
      label: 'tipos de anomalia',
      hint: 'sem rastreador, GPS inválido, fora janela, tempo excessivo, +7',
    },
  ]

  return (
    <div className="relative">
      {/* Double-bezel outer shell */}
      <div className="relative rounded-[var(--radius-display)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-1.5 shadow-diffusion">
        {/* Inner core */}
        <div
          className="relative overflow-hidden rounded-[calc(var(--radius-display)-0.375rem)] bg-[var(--color-bg)] p-8 md:p-10"
          style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)' }}
        >
          {/* Navy accent top bar */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-[3px] rounded-t-[calc(var(--radius-display)-0.375rem)]"
            style={{
              background:
                'linear-gradient(90deg, var(--color-navy-700) 0%, var(--color-navy-400) 60%, transparent 100%)',
              opacity: 0.55,
            }}
          />

          {/* Live indicator */}
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-fg-subtle)]">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            Em produção
          </div>

          <div className="mt-6 flex flex-col divide-y divide-[var(--color-border)]">
            {stats.map((s, i) => (
              <div
                key={i}
                className="flex items-baseline justify-between gap-4 py-5 first:pt-0 last:pb-0"
              >
                <div className="flex flex-col">
                  <span className="text-display text-[48px] font-semibold leading-none tracking-[-0.045em] text-[var(--color-fg)]">
                    {s.value}
                  </span>
                  <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
                    {s.label}
                  </span>
                </div>
                <span className="max-w-[52%] text-right text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
                  {s.hint}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-[var(--color-border)] pt-5">
            <div className="flex items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
              <CheckCircle weight="fill" size={13} className="text-[var(--color-success)]" />
              <span>Última geração há instantes</span>
            </div>
            <Lightning
              size={13}
              weight="fill"
              className="text-[var(--color-navy-700)] opacity-35 dark:text-[var(--color-navy-300)]"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── FeatureCard ─── */
function FeatureCard({
  className,
  step,
  eyebrow,
  icon,
  title,
  description,
  big,
}: {
  className?: string
  step: string
  eyebrow: string
  icon: React.ReactNode
  title: string
  description: string
  big?: boolean
}) {
  return (
    <article
      className={
        'group relative flex flex-col justify-between overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[var(--color-border-strong)] hover:shadow-diffusion ' +
        (big ? 'gap-16 p-8 md:p-12 ' : 'gap-12 p-8 md:p-10 ') +
        (className ?? '')
      }
    >
      {/* Step number — large watermark */}
      <span
        aria-hidden
        className="pointer-events-none absolute right-5 top-3 select-none font-semibold tracking-[-0.06em] text-[var(--color-fg)] opacity-[0.04] transition-opacity duration-700 group-hover:opacity-[0.07]"
        style={{ fontSize: big ? '110px' : '90px', lineHeight: 1 }}
      >
        {step}
      </span>

      {/* Top row: icon + eyebrow */}
      <div className="flex items-start justify-between gap-4">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-navy-700)] transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-0.5 dark:text-[var(--color-navy-300)]">
          {icon}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-fg-subtle)]">
          {eyebrow}
        </span>
      </div>

      {/* Bottom: title + description */}
      <div className="flex flex-col gap-3">
        <div className="h-px w-10 bg-[var(--color-navy-700)] opacity-20" />
        <h3
          className={
            big
              ? 'max-w-[20ch] text-[26px] font-semibold leading-[1.1] tracking-[-0.025em] text-[var(--color-fg)] md:text-[34px]'
              : 'max-w-[22ch] text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-[var(--color-fg)]'
          }
        >
          {title}
        </h3>
        <p
          className={
            big
              ? 'max-w-[44ch] text-[15px] leading-[1.75] text-[var(--color-fg-muted)] md:text-[16px]'
              : 'max-w-[36ch] text-[13.5px] leading-[1.75] text-[var(--color-fg-muted)]'
          }
        >
          {description}
        </p>
      </div>
    </article>
  )
}
