import Link from 'next/link'
import {
  ArrowUpRight,
  WarningCircle,
  ClockCounterClockwise,
  ForkKnife,
  TableIcon,
  CheckCircle,
} from '@phosphor-icons/react/dist/ssr'
import { createServiceClient } from '@/lib/supabase/service'

type KpiStatus = 'rascunho' | 'gerada' | 'revisada' | 'finalizada' | null

type HomeStatus = {
  hojeIso: string
  escalasHoje: number
  unitracHoje: number
  kpiStatus: KpiStatus
  redesGeradasHoje: number
  anomaliasHighPendentes: number
  ultimaGeracao: {
    data: string
    redeId: string
    geradaEm: string | null
  } | null
}

async function fetchHomeStatus(): Promise<HomeStatus> {
  const hoje = new Date().toISOString().slice(0, 10)
  const svc = createServiceClient()

  const [escalas, unitrac, kpis, anomalias, ultima] = await Promise.all([
    svc.from('escala_uploads').select('id', { count: 'exact', head: true }).eq('data_escala', hoje),
    svc.from('unitrac_uploads').select('id', { count: 'exact', head: true }).eq('data_relatorio', hoje),
    svc.from('kpis').select('id,status,rede_id').eq('data', hoje),
    svc
      .from('anomalias')
      .select('id', { count: 'exact', head: true })
      .eq('data', hoje)
      .eq('severidade', 'HIGH')
      .eq('status', 'pendente'),
    svc
      .from('kpis')
      .select('data, rede_id, gerada_em')
      .not('gerada_em', 'is', null)
      .order('gerada_em', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const rows = kpis.data ?? []
  const kpiStatus: KpiStatus = (() => {
    if (rows.length === 0) return null
    if (rows.every(r => r.status === 'finalizada')) return 'finalizada'
    if (rows.some(r => r.status === 'gerada' || r.status === 'revisada')) return 'gerada'
    return 'rascunho'
  })()

  return {
    hojeIso: hoje,
    escalasHoje: escalas.count ?? 0,
    unitracHoje: unitrac.count ?? 0,
    kpiStatus,
    redesGeradasHoje: rows.length,
    anomaliasHighPendentes: anomalias.count ?? 0,
    ultimaGeracao: ultima.data
      ? { data: ultima.data.data, redeId: ultima.data.rede_id, geradaEm: ultima.data.gerada_em }
      : null,
  }
}

function formatHoje(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  })
}

function formatDataCurta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

function formatRelativo(isoTs: string | null): string {
  if (!isoTs) return '—'
  const dt = new Date(isoTs)
  if (Number.isNaN(dt.getTime())) return '—'
  const diff = Date.now() - dt.getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'agora há pouco'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `há ${d} dia${d === 1 ? '' : 's'}`
  return dt.toLocaleDateString('pt-BR')
}

function kpiHeroValue(status: KpiStatus, qtd: number): { headline: string; aside: string } {
  if (!status) return { headline: 'Sem KPI', aside: 'subir escalas pra começar' }
  if (status === 'finalizada') return { headline: 'Finalizada', aside: `${qtd} redes prontas` }
  if (status === 'revisada') return { headline: 'Revisada', aside: `${qtd} redes geradas` }
  if (status === 'gerada') return { headline: 'Gerada', aside: `${qtd} redes geradas` }
  return { headline: 'Rascunho', aside: 'em andamento' }
}

export default async function PainelHome() {
  const status = await fetchHomeStatus()
  const kpi = kpiHeroValue(status.kpiStatus, status.redesGeradasHoje)
  const hasAnomalias = status.anomaliasHighPendentes > 0

  // Semântica de cor para o número KPI principal
  const kpiNumberClass =
    status.kpiStatus === 'finalizada'
      ? 'text-[var(--color-success)]'
      : status.kpiStatus === null
        ? 'text-[var(--color-fg-subtle)]'
        : 'text-[var(--color-fg)]'

  // Linha de acento inferior — codifica o status visualmente
  const kpiBottomColor =
    status.kpiStatus === 'finalizada'
      ? 'var(--color-success)'
      : status.kpiStatus === 'gerada' || status.kpiStatus === 'revisada'
        ? 'var(--color-accent)'
        : status.kpiStatus === 'rascunho'
          ? 'var(--color-warning)'
          : 'transparent'

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      {/* Headline editorial — data do dia como statement tipográfico */}
      <header className="mb-12 flex flex-col gap-2 animate-fade-up">
        <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-fg-subtle)]">
          KPI Transmonseg
        </span>
        <h1 className="text-display text-[44px] capitalize text-[var(--color-fg)] md:text-[58px] lg:text-[68px]">
          {formatHoje(status.hojeIso)}
        </h1>
      </header>

      {/* Bento assimétrico: hero 8/12 + lateral 4/12 */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* HERO — KPI do dia */}
        <Link
          href={`/painel/kpi/dia?data=${status.hojeIso}`}
          style={{ animationDelay: '60ms' }}
          className="animate-fade-up group relative col-span-1 flex flex-col justify-between overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-8 transition-all duration-200 hover:border-[var(--color-border-strong)] active:scale-[0.997] md:p-10 lg:col-span-8 lg:min-h-[340px]"
        >
          {/* Dot grid — fade toward bottom-right, dá profundidade sem poluição */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[var(--radius-card)]"
            style={{
              backgroundImage: 'radial-gradient(circle, var(--color-border) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
              opacity: 0.9,
              maskImage: 'radial-gradient(ellipse 80% 80% at 88% 55%, black 10%, transparent 75%)',
              WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 88% 55%, black 10%, transparent 75%)',
            }}
          />
          {/* Accent ambient glow — sutil, radius largo */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full opacity-[0.08]"
            style={{ background: 'radial-gradient(closest-side, var(--color-accent), transparent)' }}
          />

          <div className="relative flex items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
                <TableIcon size={12} weight="bold" />
                Operação do dia
              </div>
              <h2 className="mt-3 text-[15px] font-medium tracking-tight text-[var(--color-fg-muted)]">
                KPI Benassi
              </h2>
            </div>
            <ArrowUpRight
              size={20}
              weight="bold"
              className="shrink-0 text-[var(--color-fg-subtle)] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--color-fg)]"
            />
          </div>

          <div className="relative mt-10 flex flex-col gap-3">
            <span className={`text-display text-[68px] transition-colors duration-300 md:text-[88px] ${kpiNumberClass}`}>
              {kpi.headline}
            </span>
            <span className="text-[14px] text-[var(--color-fg-muted)]">
              {kpi.aside}
              {status.escalasHoje + status.unitracHoje > 0 && (
                <>
                  <span className="mx-2.5 text-[var(--color-fg-subtle)]">·</span>
                  <span className="text-numeric text-[var(--color-fg)]">
                    {status.escalasHoje + status.unitracHoje}
                  </span>{' '}
                  upload{status.escalasHoje + status.unitracHoje === 1 ? '' : 's'} hoje
                </>
              )}
            </span>
          </div>

          {/* Linha de acento de status — lê o estado de uma relance */}
          <div
            aria-hidden
            className="absolute bottom-0 left-0 right-0 h-[3px] rounded-b-[var(--radius-card)]"
            style={{ background: kpiBottomColor }}
          />
        </Link>

        {/* Coluna lateral — 2 cards empilhados */}
        <div className="col-span-1 grid grid-cols-1 gap-4 lg:col-span-4">
          {/* Anomalias HIGH */}
          <Link
            href="/painel/revisao"
            style={{ animationDelay: '120ms' }}
            className="animate-fade-up group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 transition-all duration-200 hover:border-[var(--color-border-strong)] active:scale-[0.997]"
          >
            {hasAnomalias && (
              <div
                aria-hidden
                className="pointer-events-none absolute -top-24 -right-24 h-[220px] w-[220px] rounded-full opacity-[0.07]"
                style={{ background: 'radial-gradient(closest-side, var(--color-danger), transparent)' }}
              />
            )}
            <div className="relative flex items-start justify-between">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
                {hasAnomalias ? (
                  <WarningCircle size={12} weight="fill" className="text-[var(--color-danger)]" />
                ) : (
                  <CheckCircle size={12} weight="fill" className="text-[var(--color-success)]" />
                )}
                Anomalias HIGH
              </div>
              <ArrowUpRight
                size={16}
                weight="bold"
                className="shrink-0 text-[var(--color-fg-subtle)] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--color-fg)]"
              />
            </div>
            <div className="relative mt-4 flex items-baseline gap-2.5">
              <span
                className={`text-display text-[52px] ${
                  hasAnomalias ? 'text-[var(--color-danger)]' : 'text-[var(--color-fg-muted)]'
                }`}
              >
                {status.anomaliasHighPendentes}
              </span>
              <span className="text-[12px] text-[var(--color-fg-muted)]">
                {hasAnomalias ? 'pendente(s)' : 'tudo limpo'}
              </span>
            </div>
          </Link>

          {/* Última geração */}
          <Link
            href="/painel/historico"
            style={{ animationDelay: '180ms' }}
            className="animate-fade-up group flex flex-col rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 transition-all duration-200 hover:border-[var(--color-border-strong)] active:scale-[0.997]"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
                <ClockCounterClockwise size={12} weight="bold" />
                Última geração
              </div>
              <ArrowUpRight
                size={16}
                weight="bold"
                className="shrink-0 text-[var(--color-fg-subtle)] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--color-fg)]"
              />
            </div>
            <div className="mt-4">
              {status.ultimaGeracao ? (
                <>
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-numeric text-[32px] font-semibold tracking-tight text-[var(--color-fg)]">
                      {formatDataCurta(status.ultimaGeracao.data)}
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-fg-muted)]">
                      {status.ultimaGeracao.redeId.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-[var(--color-fg-subtle)]">
                    {formatRelativo(status.ultimaGeracao.geradaEm)}
                  </p>
                </>
              ) : (
                <p className="text-[13px] text-[var(--color-fg-muted)]">Nenhuma geração ainda</p>
              )}
            </div>
          </Link>
        </div>
      </section>

      {/* Status operacional — anti-card via divide-y (minimalist-ui Rule 4) */}
      <section
        className="mt-14 animate-fade-up"
        style={{ animationDelay: '240ms' }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-fg-subtle)]">
            Status operacional
          </h2>
          <span className="text-numeric text-[11px] text-[var(--color-fg-subtle)]">
            {status.hojeIso}
          </span>
        </div>
        <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
          <StatusRow
            label="Escalas carregadas"
            value={status.escalasHoje}
            hint={`upload${status.escalasHoje === 1 ? '' : 's'} processado${status.escalasHoje === 1 ? '' : 's'}`}
            tone={status.escalasHoje > 0 ? 'success' : 'muted'}
          />
          <StatusRow
            label="Relatório Unitrac"
            value={status.unitracHoje}
            hint={`PDF/XLSX importado${status.unitracHoje === 1 ? '' : 's'}`}
            tone={status.unitracHoje > 0 ? 'success' : 'muted'}
          />
          <StatusRow
            label="KPI gerada"
            value={status.redesGeradasHoje}
            hint={status.kpiStatus ?? 'aguardando uploads'}
            tone={status.kpiStatus === 'finalizada' ? 'success' : status.kpiStatus ? 'info' : 'muted'}
          />
          <StatusRow
            label="Anomalias HIGH pendentes"
            value={status.anomaliasHighPendentes}
            hint={hasAnomalias ? 'revisar antes de finalizar' : 'nenhuma pendência'}
            tone={hasAnomalias ? 'danger' : 'muted'}
          />
        </div>
      </section>

      {/* Acessos secundários */}
      <section
        className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2 animate-fade-up"
        style={{ animationDelay: '300ms' }}
      >
        <SecondaryLink
          href="/painel/cozinha"
          icon={<ForkKnife size={18} weight="bold" />}
          title="Cozinha Industrial"
          description="Upload da escala da Cozinha. Gera XLSX e PDF com rota, motorista e placa."
        />
        <SecondaryLink
          href="/painel/historico"
          icon={<ClockCounterClockwise size={18} weight="bold" />}
          title="Histórico de gerações"
          description="Consulte rodadas anteriores. Baixe XLSX e PDF de qualquer dia."
        />
      </section>
    </div>
  )
}

function StatusRow({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: number | string
  hint: string
  tone: 'success' | 'danger' | 'info' | 'muted'
}) {
  const dotColor =
    tone === 'success'
      ? 'bg-[var(--color-success)]'
      : tone === 'danger'
        ? 'bg-[var(--color-danger)]'
        : tone === 'info'
          ? 'bg-[var(--color-accent)]'
          : 'bg-[var(--color-border-strong)]'

  const valueColor =
    tone === 'success'
      ? 'text-[var(--color-success)]'
      : tone === 'danger'
        ? 'text-[var(--color-danger)]'
        : tone === 'info'
          ? 'text-[var(--color-accent)]'
          : 'text-[var(--color-fg-subtle)]'

  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 py-4 md:gap-6">
      <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
      <span className="text-[14px] font-medium text-[var(--color-fg)]">{label}</span>
      <span className={`text-numeric text-[22px] font-semibold tracking-tight ${valueColor}`}>
        {value}
      </span>
      <span className="hidden text-[12px] text-[var(--color-fg-muted)] sm:block">{hint}</span>
    </div>
  )
}

function SecondaryLink({
  href,
  icon,
  title,
  description,
}: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 transition-all duration-200 hover:border-[var(--color-border-strong)] active:scale-[0.997]"
    >
      {/* Acento lateral — aparece no hover, sinaliza interatividade */}
      <div
        aria-hidden
        className="absolute left-0 top-5 bottom-5 w-[3px] rounded-r-full bg-[var(--color-accent)] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      />
      <div className="flex items-center justify-between">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg-muted)] transition-all duration-200 group-hover:border-[var(--color-accent)]/25 group-hover:bg-[var(--color-accent)]/8 group-hover:text-[var(--color-accent)]">
          {icon}
        </span>
        <ArrowUpRight
          size={16}
          weight="bold"
          className="shrink-0 text-[var(--color-fg-subtle)] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--color-fg)]"
        />
      </div>
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight text-[var(--color-fg)]">
          {title}
        </h3>
        <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
          {description}
        </p>
      </div>
    </Link>
  )
}
