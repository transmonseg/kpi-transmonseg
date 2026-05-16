import Link from 'next/link'
import { Badge, Card } from '@/components/ui'
import { createServiceClient } from '@/lib/supabase/service'

type KpiStatus = 'rascunho' | 'gerada' | 'revisada' | 'finalizada' | null

type HomeStatus = {
  hojeIso: string
  escalasHoje: number
  unitracHoje: number
  kpiStatus: KpiStatus
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
    svc.from('kpis').select('id,status').eq('data', hoje),
    svc.from('anomalias').select('id', { count: 'exact', head: true })
      .eq('data', hoje)
      .eq('severidade', 'HIGH')
      .eq('status', 'pendente'),
    svc.from('kpis').select('data, rede_id, gerada_em')
      .not('gerada_em', 'is', null)
      .order('gerada_em', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const kpiStatus: KpiStatus = (() => {
    const rows = kpis.data ?? []
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
    anomaliasHighPendentes: anomalias.count ?? 0,
    ultimaGeracao: ultima.data
      ? {
          data: ultima.data.data,
          redeId: ultima.data.rede_id,
          geradaEm: ultima.data.gerada_em,
        }
      : null,
  }
}

function formatHoje(iso: string): string {
  // iso = YYYY-MM-DD
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  })
}

function formatDataCurta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
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

export default async function PainelHome() {
  const status = await fetchHomeStatus()
  const temAlgumDado =
    status.escalasHoje > 0 ||
    status.unitracHoje > 0 ||
    status.kpiStatus !== null ||
    status.anomaliasHighPendentes > 0

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--color-fg)]">
          Início
        </h1>
        <p className="text-[13px] text-[var(--color-fg-muted)]">
          <span className="capitalize">{formatHoje(status.hojeIso)}</span>
          {' · '}
          {temAlgumDado
            ? 'Resumo do dia abaixo. Escolha por onde começar.'
            : 'Bem-vindo. Comece pelo Dia para subir escalas e gerar KPIs.'}
        </p>
      </div>

      {/* Grid principal — 4 cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <HomeCard
          href={`/painel/kpi/dia?data=${status.hojeIso}`}
          eyebrow="Operação"
          title="Dia"
          description="Upload de escalas e Unitrac, geração e revisão do KPI."
          stat={
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
                {status.escalasHoje + status.unitracHoje}
              </span>
              <span className="text-[12px] text-[var(--color-fg-muted)]">
                upload{status.escalasHoje + status.unitracHoje === 1 ? '' : 's'} hoje
              </span>
            </div>
          }
          aside={<KpiStatusBadge status={status.kpiStatus} />}
        />

        <HomeCard
          href="/painel/historico"
          eyebrow="Histórico"
          title="Última geração de KPI"
          description="Consulte rodadas anteriores, baixe XLSX e PDF."
          stat={
            status.ultimaGeracao ? (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
                  {formatDataCurta(status.ultimaGeracao.data)}
                </span>
                <span className="text-[12px] text-[var(--color-fg-muted)]">
                  {status.ultimaGeracao.redeId.toUpperCase()}
                </span>
              </div>
            ) : (
              <span className="text-[13px] text-[var(--color-fg-muted)]">
                Nenhuma geração ainda
              </span>
            )
          }
          aside={
            status.ultimaGeracao && (
              <span className="text-[11px] text-[var(--color-fg-subtle)]">
                {formatRelativo(status.ultimaGeracao.geradaEm)}
              </span>
            )
          }
        />

        <HomeCard
          href="/painel/revisao"
          eyebrow="Qualidade"
          title="Anomalias pendentes"
          description="Revise ocorrências antes de finalizar o KPI."
          stat={
            <div className="flex items-baseline gap-2">
              <span
                className={
                  status.anomaliasHighPendentes > 0
                    ? 'text-2xl font-semibold tracking-tight text-[var(--color-danger)]'
                    : 'text-2xl font-semibold tracking-tight text-[var(--color-fg-muted)]'
                }
              >
                {status.anomaliasHighPendentes}
              </span>
              <span className="text-[12px] text-[var(--color-fg-muted)]">
                HIGH hoje
              </span>
            </div>
          }
          aside={
            status.anomaliasHighPendentes > 0 ? (
              <Badge variant="danger">Atenção</Badge>
            ) : (
              <Badge variant="success">OK</Badge>
            )
          }
        />

        <HomeCard
          href="/painel/cozinha"
          eyebrow="Operação"
          title="Cozinha"
          description="Upload da escala da Cozinha Industrial. Gera XLSX e PDF limpos."
          stat={
            <span className="text-[13px] text-[var(--color-fg-muted)]">
              Rota, motorista e placa em PDF/XLSX
            </span>
          }
          aside={<Badge variant="info">Ativo</Badge>}
        />
      </div>

      {/* Status compacto de hoje */}
      <div className="mt-8">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-fg-muted)]">
          Status de hoje
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat
            label="Escalas"
            value={status.escalasHoje}
            hint={`upload${status.escalasHoje === 1 ? '' : 's'}`}
            tone={status.escalasHoje > 0 ? 'success' : 'muted'}
          />
          <MiniStat
            label="Unitrac"
            value={status.unitracHoje}
            hint={`relatório${status.unitracHoje === 1 ? '' : 's'}`}
            tone={status.unitracHoje > 0 ? 'success' : 'muted'}
          />
          <MiniStat
            label="KPI"
            value={status.kpiStatus === null ? '—' : status.kpiStatus === 'finalizada' ? 'OK' : '↗'}
            hint={status.kpiStatus ?? 'não processado'}
            tone={
              status.kpiStatus === 'finalizada'
                ? 'success'
                : status.kpiStatus
                  ? 'info'
                  : 'muted'
            }
          />
          <MiniStat
            label="Anomalias"
            value={status.anomaliasHighPendentes}
            hint={`HIGH pendente${status.anomaliasHighPendentes === 1 ? '' : 's'}`}
            tone={status.anomaliasHighPendentes > 0 ? 'danger' : 'muted'}
          />
        </div>
      </div>
    </div>
  )
}

function HomeCard({
  href,
  eyebrow,
  title,
  description,
  stat,
  aside,
}: {
  href: string
  eyebrow: string
  title: string
  description: string
  stat: React.ReactNode
  aside?: React.ReactNode
}) {
  return (
    <Link href={href} className="group block">
      <Card className="h-full transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-hover)]">
        <div className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-subtle)]">
                {eyebrow}
              </div>
              <h3 className="mt-1 text-[15px] font-semibold tracking-tight text-[var(--color-fg)]">
                {title}
              </h3>
            </div>
            {aside}
          </div>
          <p className="text-[12.5px] leading-relaxed text-[var(--color-fg-muted)]">
            {description}
          </p>
          <div className="mt-auto pt-2">{stat}</div>
        </div>
      </Card>
    </Link>
  )
}

function KpiStatusBadge({ status }: { status: KpiStatus }) {
  if (!status) return <Badge>Sem KPI</Badge>
  if (status === 'finalizada') return <Badge variant="success">Finalizada</Badge>
  if (status === 'revisada') return <Badge variant="info">Revisada</Badge>
  if (status === 'gerada') return <Badge variant="info">Gerada</Badge>
  return <Badge variant="warning">Rascunho</Badge>
}

function MiniStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string | number
  hint: string
  tone: 'success' | 'danger' | 'info' | 'muted'
}) {
  const valueColor =
    tone === 'success'
      ? 'text-[var(--color-success)]'
      : tone === 'danger'
        ? 'text-[var(--color-danger)]'
        : tone === 'info'
          ? 'text-[var(--color-accent)]'
          : 'text-[var(--color-fg-muted)]'

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-fg-subtle)]">
        {label}
      </p>
      <p className={`mt-1 text-xl font-semibold tracking-tight ${valueColor}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-[var(--color-fg-muted)]">{hint}</p>
    </div>
  )
}
