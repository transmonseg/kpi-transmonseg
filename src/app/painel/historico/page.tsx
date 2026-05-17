import Link from 'next/link'
import {
  FunnelSimple,
  WarningCircle,
  ArrowUpRight,
  CaretLeft,
  CaretRight,
  FileMagnifyingGlass,
} from '@phosphor-icons/react/dist/ssr'
import { createServiceClient } from '@/lib/supabase/service'
import { cn } from '@/components/ui'

export const metadata = { title: 'Histórico de KPIs — Transmonseg' }

const PER_PAGE = 25

type KpiHistorico = {
  id: string
  data: string
  rede_id: string
  rede_nome: string
  status: string
  qtd_linhas: number | null
  qtd_anomalias_high: number | null
  qtd_anomalias_medium: number | null
  qtd_anomalias_low: number | null
  gerada_em: string | null
  xlsx_path: string | null
  pdf_path: string | null
}

async function fetchHistorico(params: {
  page: number
  redeId: string
  status: string
  dataInicio: string
  dataFim: string
}) {
  const svc = createServiceClient()
  const from = (params.page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  let q = svc
    .from('kpis')
    .select(
      `
      id, data, rede_id, status,
      qtd_linhas, qtd_anomalias_high, qtd_anomalias_medium, qtd_anomalias_low,
      gerada_em, xlsx_path, pdf_path,
      redes ( nome )
    `,
      { count: 'exact' },
    )
    .order('data', { ascending: false })
    .order('rede_id')
    .range(from, to)

  if (params.redeId !== 'all') q = q.eq('rede_id', params.redeId)
  if (params.status !== 'all') q = q.eq('status', params.status)
  if (params.dataInicio) q = q.gte('data', params.dataInicio)
  if (params.dataFim) q = q.lte('data', params.dataFim)

  const { data: rows, error, count } = await q
  if (error) throw new Error(error.message)

  const kpis: KpiHistorico[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    data: r.data as string,
    rede_id: r.rede_id as string,
    rede_nome:
      (Array.isArray(r.redes)
        ? (r.redes[0] as { nome: string } | undefined)?.nome
        : (r.redes as { nome: string } | null)?.nome) ?? (r.rede_id as string),
    status: r.status as string,
    qtd_linhas: r.qtd_linhas as number | null,
    qtd_anomalias_high: r.qtd_anomalias_high as number | null,
    qtd_anomalias_medium: r.qtd_anomalias_medium as number | null,
    qtd_anomalias_low: r.qtd_anomalias_low as number | null,
    gerada_em: r.gerada_em as string | null,
    xlsx_path: r.xlsx_path as string | null,
    pdf_path: r.pdf_path as string | null,
  }))

  return { kpis, total: count ?? 0 }
}

async function fetchRedes() {
  const svc = createServiceClient()
  const { data } = await svc.from('redes').select('id, nome').order('nome')
  return data ?? []
}

const STATUS_TOM: Record<string, { dot: string; label: string }> = {
  rascunho: { dot: 'bg-[var(--color-fg-subtle)]', label: 'rascunho' },
  gerada: { dot: 'bg-[var(--color-accent)]', label: 'gerada' },
  revisada: { dot: 'bg-[var(--color-warning)]', label: 'revisada' },
  finalizada: { dot: 'bg-[var(--color-success)]', label: 'finalizada' },
}

function StatusInline({ status }: { status: string }) {
  const tom = STATUS_TOM[status] ?? STATUS_TOM.rascunho
  return (
    <span className="inline-flex items-center gap-2 text-[12px] text-[var(--color-fg-muted)]">
      <span aria-hidden className={cn('inline-block h-1.5 w-1.5 rounded-full', tom.dot)} />
      {tom.label}
    </span>
  )
}

function formatarData(iso: string): string {
  const [a, m, d] = iso.split('-')
  if (!a || !m || !d) return iso
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  const mi = Number.parseInt(m, 10) - 1
  return `${Number.parseInt(d, 10)} ${meses[mi] ?? m} ${a}`
}

const INPUT_CLS =
  'h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[13px] text-[var(--color-fg)] transition-colors focus-visible:outline-none focus-visible:border-[var(--color-fg)]'

const SELECT_CLS = cn(INPUT_CLS, 'pr-7 appearance-none')

const LABEL_CLS =
  'text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]'

export default async function HistoricoPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    rede?: string
    status?: string
    inicio?: string
    fim?: string
  }>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10))
  const redeId = sp.rede ?? 'all'
  const status = sp.status ?? 'all'
  const dataInicio = sp.inicio ?? ''
  const dataFim = sp.fim ?? ''

  const [{ kpis, total }, redes] = await Promise.all([
    fetchHistorico({ page, redeId, status, dataInicio, dataFim }),
    fetchRedes(),
  ])

  const totalPages = Math.ceil(total / PER_PAGE)

  function buildHref(overrides: Record<string, string | number>) {
    const p = new URLSearchParams({
      page: String(page),
      rede: redeId,
      status,
      ...(dataInicio ? { inicio: dataInicio } : {}),
      ...(dataFim ? { fim: dataFim } : {}),
      ...Object.fromEntries(
        Object.entries(overrides).map(([k, v]) => [k, String(v)]),
      ),
    })
    return `/painel/historico?${p.toString()}`
  }

  return (
    <div className="mx-auto w-full max-w-[1300px]">
      <header className="mb-10 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          Histórico
        </span>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-fg)] md:text-[34px]">
          Todas as gerações
        </h1>
        <p className="mt-1 max-w-[55ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Todos os KPIs gerados, com filtros por data, rede e status.
          Clique numa linha pra abrir o detalhe.
        </p>
      </header>

      {/* Filtros — linha editorial sem card wrapper */}
      <form
        method="GET"
        action="/painel/historico"
        className="mb-8 flex flex-wrap items-end gap-4 border-y border-[var(--color-border)] py-6"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="hist-inicio" className={LABEL_CLS}>De</label>
          <input id="hist-inicio" type="date" name="inicio" defaultValue={dataInicio} className={INPUT_CLS} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="hist-fim" className={LABEL_CLS}>Até</label>
          <input id="hist-fim" type="date" name="fim" defaultValue={dataFim} className={INPUT_CLS} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="hist-rede" className={LABEL_CLS}>Rede</label>
          <select id="hist-rede" name="rede" defaultValue={redeId} className={SELECT_CLS}>
            <option value="all">Todas</option>
            {redes.map((r: { id: string; nome: string }) => (
              <option key={r.id} value={r.id}>{r.nome}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="hist-status" className={LABEL_CLS}>Status</label>
          <select id="hist-status" name="status" defaultValue={status} className={SELECT_CLS}>
            <option value="all">Todos</option>
            <option value="rascunho">Rascunho</option>
            <option value="gerada">Gerada</option>
            <option value="revisada">Revisada</option>
            <option value="finalizada">Finalizada</option>
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-fg)] px-5 text-[13px] font-medium text-[var(--color-bg)] transition-all duration-150 active:scale-[0.97] hover:bg-[var(--color-fg-muted)]"
        >
          <FunnelSimple size={14} weight="bold" />
          Filtrar
        </button>
      </form>

      {kpis.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-6 py-16 text-center">
          <FileMagnifyingGlass size={28} weight="bold" className="text-[var(--color-fg-subtle)]" />
          <p className="text-[14px] text-[var(--color-fg-muted)]">
            Nenhum KPI encontrado para os filtros selecionados.
          </p>
          <Link
            href="/painel/kpi/dia"
            className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-accent)] hover:underline"
          >
            Gerar novo KPI
            <ArrowUpRight size={12} weight="bold" />
          </Link>
        </div>
      ) : (
        // Tabela editorial — anti-card, sticky header, mono nos números
        <div className="overflow-x-auto border-y border-[var(--color-border)]">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left">
                <Th>Data</Th>
                <Th>Rede</Th>
                <Th>Status</Th>
                <Th align="right">Linhas</Th>
                <Th>Anomalias</Th>
                <Th>Gerado</Th>
                <Th>Ação</Th>
              </tr>
            </thead>
            <tbody>
              {kpis.map((k) => {
                const hrefDia = `/painel/kpi/dia?data=${k.data}&rede=${k.rede_id}`
                const hasAnomalias =
                  (k.qtd_anomalias_high ?? 0) + (k.qtd_anomalias_medium ?? 0) + (k.qtd_anomalias_low ?? 0) > 0
                return (
                  <tr
                    key={k.id}
                    className="border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-subtle)]"
                  >
                    <Td>
                      <Link href={hrefDia} className="flex flex-col">
                        <span className="font-medium text-[var(--color-fg)] transition-colors hover:text-[var(--color-accent)]">
                          {formatarData(k.data)}
                        </span>
                        <span className="text-numeric text-[11px] text-[var(--color-fg-subtle)]">
                          {k.data}
                        </span>
                      </Link>
                    </Td>
                    <Td><span className="text-[var(--color-fg-muted)]">{k.rede_nome}</span></Td>
                    <Td><StatusInline status={k.status} /></Td>
                    <Td align="right">
                      <span className="text-numeric text-[14px] font-medium text-[var(--color-fg)]">
                        {k.qtd_linhas ?? '—'}
                      </span>
                    </Td>
                    <Td>
                      {hasAnomalias ? (
                        <div className="flex items-center gap-2">
                          {(k.qtd_anomalias_high ?? 0) > 0 && (
                            <AnomaliaChip count={k.qtd_anomalias_high!} tone="danger" />
                          )}
                          {(k.qtd_anomalias_medium ?? 0) > 0 && (
                            <AnomaliaChip count={k.qtd_anomalias_medium!} tone="warning" />
                          )}
                          {(k.qtd_anomalias_low ?? 0) > 0 && (
                            <AnomaliaChip count={k.qtd_anomalias_low!} tone="muted" />
                          )}
                        </div>
                      ) : (
                        <span className="text-[12px] text-[var(--color-fg-subtle)]">limpo</span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-numeric text-[12px] text-[var(--color-fg-muted)]">
                        {k.gerada_em
                          ? new Date(k.gerada_em).toLocaleString('pt-BR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : '—'}
                      </span>
                    </Td>
                    <Td>
                      {k.xlsx_path || k.pdf_path ? (
                        <Link
                          href={hrefDia}
                          className="group inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-fg)] hover:text-[var(--color-accent)]"
                        >
                          Abrir
                          <ArrowUpRight
                            size={12}
                            weight="bold"
                            className="transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                          />
                        </Link>
                      ) : (
                        <span className="text-[12px] text-[var(--color-fg-subtle)]">—</span>
                      )}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-[12px] text-[var(--color-fg-muted)]">
            <span className="text-numeric font-medium text-[var(--color-fg)]">{total}</span>{' '}
            resultado{total !== 1 ? 's' : ''} · página{' '}
            <span className="text-numeric text-[var(--color-fg)]">{page}</span> de{' '}
            <span className="text-numeric">{totalPages}</span>
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link
                href={buildHref({ page: page - 1 })}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[12px] font-medium text-[var(--color-fg)] transition-colors active:scale-[0.97] hover:border-[var(--color-fg)]"
              >
                <CaretLeft size={12} weight="bold" />
                Anterior
              </Link>
            ) : (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-[12px] text-[var(--color-fg-subtle)]">
                <CaretLeft size={12} weight="bold" />
                Anterior
              </span>
            )}
            {page < totalPages ? (
              <Link
                href={buildHref({ page: page + 1 })}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[12px] font-medium text-[var(--color-fg)] transition-colors active:scale-[0.97] hover:border-[var(--color-fg)]"
              >
                Próxima
                <CaretRight size={12} weight="bold" />
              </Link>
            ) : (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-[12px] text-[var(--color-fg-subtle)]">
                Próxima
                <CaretRight size={12} weight="bold" />
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={cn(
        'px-4 py-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]',
        align === 'right' && 'text-right'
      )}
    >
      {children}
    </th>
  )
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td className={cn('whitespace-nowrap px-4 py-4', align === 'right' && 'text-right')}>{children}</td>
  )
}

function AnomaliaChip({ count, tone }: { count: number; tone: 'danger' | 'warning' | 'muted' }) {
  const toneClass =
    tone === 'danger'
      ? 'border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-fg)]'
      : tone === 'warning'
        ? 'border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-fg)]'
        : 'border-[var(--color-border)] bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)]'
  const letter = tone === 'danger' ? 'H' : tone === 'warning' ? 'M' : 'L'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium', toneClass)}>
      {tone === 'danger' && <WarningCircle size={10} weight="fill" />}
      <span className="text-numeric">{count}</span>
      <span className="text-[9px] tracking-[0.1em]">{letter}</span>
    </span>
  )
}
