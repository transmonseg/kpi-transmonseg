import Link from 'next/link'
import {
  ArrowUpRight,
  WarningCircle,
  ClockCounterClockwise,
  PencilSimpleLine,
  Storefront,
  TableIcon,
  CheckCircle,
  Sparkle,
} from '@phosphor-icons/react/dist/ssr'
import { createServiceClient } from '@/lib/supabase/service'

type GeracaoResumo = {
  rede_id: string
  rede_nome: string
  qtd_rotas: number
  qtd_sem_gps: number
}

type SerieDiaria = {
  data: string
  rotas: number
  semGps: number
  cobertura: number
}

type HomeData = {
  hojeIso: string
  geracoesHoje: number
  ultimaGeracao: { id: string; data: string; geradoEm: string | null; totalRotas: number; redes: GeracaoResumo[] } | null
  anomaliasHighPendentes: number
  lojasCadastradas: number
  alteracoesPendentesHoje: number
  placasDoDia: number
  motoristasDoDia: number
  serie14d: SerieDiaria[]
}

async function fetchHomeData(): Promise<HomeData> {
  const hoje = new Date().toISOString().slice(0, 10)
  const svc = createServiceClient()

  const dataLimite14d = new Date()
  dataLimite14d.setDate(dataLimite14d.getDate() - 13)
  const desde14dIso = dataLimite14d.toISOString().slice(0, 10)

  const [
    geracoesHojeRes,
    ultimaRes,
    anomalias,
    lojas,
    alteracoesPendentes,
    placasDoDiaRes,
    motoristasDoDiaRes,
    serie14dRes,
  ] = await Promise.all([
    svc.from('kpi_simples').select('id', { count: 'exact', head: true }).eq('data', hoje),
    svc
      .from('kpi_simples')
      .select('id, data, gerado_em, total_rotas, redes')
      .order('gerado_em', { ascending: false })
      .limit(1)
      .maybeSingle(),
    svc
      .from('anomalias')
      .select('id', { count: 'exact', head: true })
      .eq('data', hoje)
      .eq('severidade', 'HIGH')
      .eq('status', 'pendente'),
    svc.from('lojas').select('id', { count: 'exact', head: true }).eq('ativo', true),
    svc
      .from('alteracoes')
      .select('id', { count: 'exact', head: true })
      .eq('data_alteracao', hoje)
      .eq('status', 'pendente'),
    svc.from('escala_linhas').select('placa_norm').eq('data_entrega', hoje),
    svc.from('escala_linhas').select('motorista_nome').eq('data_entrega', hoje),
    svc
      .from('kpi_simples')
      .select('data, total_rotas, total_sem_gps, gerado_em')
      .gte('data', desde14dIso)
      .order('gerado_em', { ascending: false }),
  ])

  // Agrega por dia mantendo só a geração mais recente do dia (sort já é DESC).
  const serieMap = new Map<string, { rotas: number; semGps: number }>()
  for (const row of (serie14dRes.data ?? []) as Array<{ data: string; total_rotas: number | null; total_sem_gps: number | null }>) {
    if (!serieMap.has(row.data)) {
      serieMap.set(row.data, {
        rotas: row.total_rotas ?? 0,
        semGps: row.total_sem_gps ?? 0,
      })
    }
  }
  const serie14d: SerieDiaria[] = []
  for (let i = 13; i >= 0; i--) {
    const dt = new Date()
    dt.setDate(dt.getDate() - i)
    const iso = dt.toISOString().slice(0, 10)
    const v = serieMap.get(iso)
    const rotas = v?.rotas ?? 0
    const semGps = v?.semGps ?? 0
    serie14d.push({
      data: iso,
      rotas,
      semGps,
      cobertura: rotas > 0 ? Math.round(((rotas - semGps) / rotas) * 100) : 0,
    })
  }

  const placasUnicas = new Set(
    (placasDoDiaRes.data ?? []).map(r => r.placa_norm).filter(Boolean)
  ).size
  const motoristasUnicos = new Set(
    (motoristasDoDiaRes.data ?? []).map(r => r.motorista_nome).filter(Boolean)
  ).size

  return {
    hojeIso: hoje,
    geracoesHoje: geracoesHojeRes.count ?? 0,
    ultimaGeracao: ultimaRes.data
      ? {
          id: ultimaRes.data.id as string,
          data: ultimaRes.data.data as string,
          geradoEm: ultimaRes.data.gerado_em as string | null,
          totalRotas: (ultimaRes.data.total_rotas as number | null) ?? 0,
          redes: (ultimaRes.data.redes as GeracaoResumo[]) ?? [],
        }
      : null,
    anomaliasHighPendentes: anomalias.count ?? 0,
    lojasCadastradas: lojas.count ?? 0,
    alteracoesPendentesHoje: alteracoesPendentes.count ?? 0,
    placasDoDia: placasUnicas,
    motoristasDoDia: motoristasUnicos,
    serie14d,
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

function formatRelativo(isoTs: string | null): string {
  if (!isoTs) return 'sem registro'
  const dt = new Date(isoTs)
  if (Number.isNaN(dt.getTime())) return 'sem registro'
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

export default async function PainelHome() {
  const data = await fetchHomeData()
  const hasAnomalias = data.anomaliasHighPendentes > 0
  const temGeracaoHoje = data.geracoesHoje > 0

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      {/* Headline editorial */}
      <header className="mb-12 flex flex-col gap-2 animate-fade-up">
        <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-fg-subtle)]">
          KPI Transmonseg · Painel
        </span>
        <h1 className="text-display text-[44px] capitalize leading-[1.02] tracking-[-0.025em] text-[var(--color-fg)] md:text-[58px] lg:text-[64px]">
          {formatHoje(data.hojeIso)}
        </h1>
      </header>

      {/* Hero: KPI do dia + lateral */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* HERO KPI — leva pro /simples */}
        <Link
          href="/painel/kpi/simples"
          style={{ animationDelay: '60ms' }}
          className="animate-fade-up group relative col-span-1 flex flex-col justify-between overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-8 transition-all duration-300 hover:border-[var(--color-border-strong)] active:scale-[0.997] md:p-10 lg:col-span-8 lg:min-h-[340px]"
        >
          {/* Dot grid de profundidade */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[var(--radius-card)]"
            style={{
              backgroundImage: 'radial-gradient(circle, var(--color-border) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
              opacity: 0.85,
              maskImage: 'radial-gradient(ellipse 80% 80% at 88% 55%, black 10%, transparent 75%)',
              WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 88% 55%, black 10%, transparent 75%)',
            }}
          />
          {/* Accent glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full opacity-[0.10]"
            style={{ background: 'radial-gradient(closest-side, var(--color-navy-700), transparent)' }}
          />

          <div className="relative flex items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
                <Sparkle size={12} weight="fill" />
                Gerar KPI
              </div>
              <h2 className="mt-3 text-[15px] font-medium tracking-tight text-[var(--color-fg-muted)]">
                Suba escalas e Unitrac — receba XLSX e PDF por rede
              </h2>
            </div>
            <ArrowUpRight
              size={20}
              weight="bold"
              className="shrink-0 text-[var(--color-fg-subtle)] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--color-fg)]"
            />
          </div>

          <div className="relative mt-10 flex flex-col gap-3">
            {temGeracaoHoje ? (
              <>
                <span className="text-display text-[68px] tracking-[-0.045em] leading-[0.92] text-[var(--color-fg)] md:text-[88px]">
                  {data.geracoesHoje}
                </span>
                <span className="text-[14px] text-[var(--color-fg-muted)]">
                  geraç{data.geracoesHoje === 1 ? 'ão' : 'ões'} hoje
                  {data.ultimaGeracao && (
                    <>
                      <span className="mx-2.5 text-[var(--color-fg-subtle)]">·</span>
                      <span className="text-numeric text-[var(--color-fg)]">{data.ultimaGeracao.totalRotas}</span> rotas
                      <span className="mx-2.5 text-[var(--color-fg-subtle)]">·</span>
                      <span>{formatRelativo(data.ultimaGeracao.geradoEm)}</span>
                    </>
                  )}
                </span>
              </>
            ) : (
              <>
                <span className="text-display text-[64px] tracking-[-0.045em] leading-[0.92] text-[var(--color-fg-subtle)] md:text-[80px]">
                  Pronto
                </span>
                <span className="text-[14px] text-[var(--color-fg-muted)]">
                  nenhuma geração hoje — clique para começar
                </span>
              </>
            )}
          </div>

          {/* Linha de acento — verde se gerou */}
          <div
            aria-hidden
            className="absolute bottom-0 left-0 right-0 h-[3px] rounded-b-[var(--radius-card)]"
            style={{ background: temGeracaoHoje ? 'var(--color-success)' : 'var(--color-border)' }}
          />
        </Link>

        {/* Coluna lateral */}
        <div className="col-span-1 grid grid-cols-1 gap-4 lg:col-span-4">
          {/* Anomalias HIGH */}
          <Link
            href="/painel/revisao"
            style={{ animationDelay: '120ms' }}
            className="animate-fade-up group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 transition-all duration-300 hover:border-[var(--color-border-strong)] active:scale-[0.997]"
          >
            {hasAnomalias && (
              <div
                aria-hidden
                className="pointer-events-none absolute -top-24 -right-24 h-[220px] w-[220px] rounded-full opacity-[0.09]"
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
                className={`text-display text-[52px] tracking-[-0.04em] leading-none ${
                  hasAnomalias ? 'text-[var(--color-danger)]' : 'text-[var(--color-fg-muted)]'
                }`}
              >
                {data.anomaliasHighPendentes}
              </span>
              <span className="text-[12px] text-[var(--color-fg-muted)]">
                {hasAnomalias ? 'pendente(s)' : 'tudo limpo'}
              </span>
            </div>
          </Link>

          {/* Última geração */}
          <Link
            href={data.ultimaGeracao ? '/painel/historico' : '/painel/kpi/simples'}
            style={{ animationDelay: '180ms' }}
            className="animate-fade-up group flex flex-col rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 transition-all duration-300 hover:border-[var(--color-border-strong)] active:scale-[0.997]"
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
              {data.ultimaGeracao ? (
                <>
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-numeric text-[28px] font-semibold tracking-tight text-[var(--color-fg)]">
                      {data.ultimaGeracao.totalRotas}
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-fg-muted)]">
                      rotas · {data.ultimaGeracao.redes.length} rede{data.ultimaGeracao.redes.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-[var(--color-fg-subtle)]">
                    {formatRelativo(data.ultimaGeracao.geradoEm)}
                  </p>
                </>
              ) : (
                <p className="text-[13px] text-[var(--color-fg-muted)]">Nenhuma geração ainda</p>
              )}
            </div>
          </Link>
        </div>
      </section>

      {/* Operação do dia — anti-card via divide-y */}
      <section
        className="mt-14 animate-fade-up"
        style={{ animationDelay: '240ms' }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-fg-subtle)]">
            Operação do dia
          </h2>
          <span className="text-numeric text-[11px] text-[var(--color-fg-subtle)]">
            {data.hojeIso}
          </span>
        </div>
        <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
          <StatusRow
            label="Placas escaladas"
            value={data.placasDoDia}
            hint={`${data.motoristasDoDia} motorista(s) único(s)`}
            tone={data.placasDoDia > 0 ? 'info' : 'muted'}
          />
          <StatusRow
            label="Alterações pendentes"
            value={data.alteracoesPendentesHoje}
            hint={data.alteracoesPendentesHoje > 0 ? 'aplicar antes de gerar KPI' : 'nenhuma pendente'}
            tone={data.alteracoesPendentesHoje > 0 ? 'warning' : 'muted'}
          />
          <StatusRow
            label="Anomalias HIGH pendentes"
            value={data.anomaliasHighPendentes}
            hint={hasAnomalias ? 'revisar antes de finalizar' : 'nenhuma pendência'}
            tone={hasAnomalias ? 'danger' : 'muted'}
          />
          <StatusRow
            label="Lojas cadastradas"
            value={data.lojasCadastradas}
            hint="base de geofences"
            tone="muted"
          />
        </div>
      </section>

      {/* Sparkline 14 dias — cobertura GPS por dia */}
      <CoberturaSparkline serie={data.serie14d} />

      {/* Acessos secundários */}
      <section
        className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 animate-fade-up"
        style={{ animationDelay: '300ms' }}
      >
        <SecondaryLink
          href="/painel/alteracoes/nova"
          icon={<PencilSimpleLine size={18} weight="bold" />}
          title="Alterações"
          description="Cole mensagem de WhatsApp e aplique trocas de motorista/placa em lote."
        />
        <SecondaryLink
          href="/painel/lojas"
          icon={<Storefront size={18} weight="bold" />}
          title="Lojas"
          description="Cadastro canônico de lojas, lat/lng e geofences."
        />
        <SecondaryLink
          href="/painel/historico"
          icon={<TableIcon size={18} weight="bold" />}
          title="Histórico"
          description="Todas as gerações salvas. Reabra e baixe XLSX/PDF."
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
  tone: 'success' | 'danger' | 'info' | 'warning' | 'muted'
}) {
  const dotColor = {
    success: 'bg-[var(--color-success)]',
    danger: 'bg-[var(--color-danger)]',
    info: 'bg-[var(--color-accent)]',
    warning: 'bg-[var(--color-warning)]',
    muted: 'bg-[var(--color-border-strong)]',
  }[tone]

  const valueColor = {
    success: 'text-[var(--color-success)]',
    danger: 'text-[var(--color-danger)]',
    info: 'text-[var(--color-fg)]',
    warning: 'text-[var(--color-warning)]',
    muted: 'text-[var(--color-fg-subtle)]',
  }[tone]

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

function CoberturaSparkline({ serie }: { serie: SerieDiaria[] }) {
  const W = 720
  const H = 60
  const padX = 4
  const innerW = W - padX * 2
  const step = serie.length > 1 ? innerW / (serie.length - 1) : 0

  // Y axis: 0 a 100%
  const yOf = (cobertura: number) => H - (cobertura / 100) * H

  const points = serie.map((d, i) => ({
    x: padX + i * step,
    y: d.rotas > 0 ? yOf(d.cobertura) : H + 8,  // fora da viewbox quando sem dado
    d,
  }))

  // Path da linha (só conecta pontos com dados)
  const segments: string[] = []
  let started = false
  for (const p of points) {
    if (p.d.rotas === 0) {
      started = false
      continue
    }
    segments.push(started ? `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    started = true
  }
  const linePath = segments.join(' ')

  // Path da área (fill abaixo da linha)
  let areaPath = ''
  if (segments.length > 0) {
    const firstWithData = points.find(p => p.d.rotas > 0)
    const lastWithData = [...points].reverse().find(p => p.d.rotas > 0)
    if (firstWithData && lastWithData) {
      areaPath = `${linePath} L ${lastWithData.x.toFixed(1)} ${H} L ${firstWithData.x.toFixed(1)} ${H} Z`
    }
  }

  const ultimaCobertura = [...serie].reverse().find(d => d.rotas > 0)?.cobertura ?? null
  const mediaCobertura = (() => {
    const validos = serie.filter(d => d.rotas > 0)
    if (validos.length === 0) return null
    return Math.round(validos.reduce((s, d) => s + d.cobertura, 0) / validos.length)
  })()

  // Cor do trend
  const trendColor =
    ultimaCobertura === null
      ? 'var(--color-fg-subtle)'
      : ultimaCobertura >= 80
        ? 'var(--color-success)'
        : ultimaCobertura >= 50
          ? 'var(--color-warning)'
          : 'var(--color-danger)'

  return (
    <section
      className="mt-12 animate-fade-up rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6"
      style={{ animationDelay: '270ms' }}
    >
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-fg-subtle)]">
            Cobertura GPS · últimos 14 dias
          </span>
          <div className="flex items-baseline gap-3">
            <span
              className="text-display text-[36px] leading-none tracking-[-0.025em]"
              style={{ color: trendColor }}
            >
              {ultimaCobertura !== null ? `${ultimaCobertura}%` : '—'}
            </span>
            {mediaCobertura !== null && (
              <span className="text-[12px] text-[var(--color-fg-muted)]">
                média <span className="text-numeric font-semibold text-[var(--color-fg)]">{mediaCobertura}%</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H + 14}`}
        className="block w-full"
        role="img"
        aria-label="Sparkline de cobertura GPS por dia"
        preserveAspectRatio="none"
      >
        {/* Linha de referência 80% (alvo) */}
        <line
          x1={padX}
          x2={W - padX}
          y1={yOf(80)}
          y2={yOf(80)}
          stroke="var(--color-border)"
          strokeDasharray="3 4"
          strokeWidth={1}
        />
        {/* Gradient para o fill da área */}
        <defs>
          <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={trendColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={trendColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {areaPath && <path d={areaPath} fill="url(#spark-grad)" />}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={trendColor}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {/* Pontos */}
        {points.map((p, i) => p.d.rotas > 0 && (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={2.5} fill="var(--color-bg-elevated)" stroke={trendColor} strokeWidth={1.5} />
            <title>{p.d.data} · {p.d.cobertura}% ({p.d.rotas - p.d.semGps}/{p.d.rotas} rotas)</title>
          </g>
        ))}
        {/* Eixo X discreto: data inicial e final */}
        <text x={padX} y={H + 12} fontSize="9" fill="var(--color-fg-subtle)" fontFamily="monospace">
          {serie[0]?.data.slice(5) ?? ''}
        </text>
        <text x={W - padX} y={H + 12} fontSize="9" fill="var(--color-fg-subtle)" fontFamily="monospace" textAnchor="end">
          hoje
        </text>
      </svg>
    </section>
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
      className="group relative flex flex-col gap-3 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 transition-all duration-300 hover:border-[var(--color-border-strong)] active:scale-[0.997]"
    >
      <div
        aria-hidden
        className="absolute left-0 top-5 bottom-5 w-[3px] rounded-r-full bg-[var(--color-navy-700)] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      />
      <div className="flex items-center justify-between">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg-muted)] transition-all duration-200 group-hover:border-[var(--color-navy-700)]/30 group-hover:text-[var(--color-navy-700)]">
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
