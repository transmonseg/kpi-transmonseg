import Link from 'next/link'
import {
  ArrowUpRight,
  CaretLeft,
  CaretRight,
  FileMagnifyingGlass,
  ClockCounterClockwise,
  ArrowClockwise,
} from '@phosphor-icons/react/dist/ssr'
import { createServiceClient } from '@/lib/supabase/service'
import { cn } from '@/components/ui'

export const metadata = { title: 'Histórico de KPIs — Transmonseg' }

const PER_PAGE = 25

type RedeResumo = {
  rede_id: string
  rede_nome: string
  qtd_rotas: number
  qtd_sem_gps: number
  qtd_anomalias_high?: number
  qtd_anomalias_medium?: number
  qtd_anomalias_low?: number
}

type GeracaoRow = {
  id: string
  data: string
  gerado_em: string | null
  total_rotas: number
  total_sem_gps: number
  redes: RedeResumo[]
}

async function fetchHistorico(params: {
  page: number
  dataInicio: string
  dataFim: string
}) {
  const svc = createServiceClient()
  const from = (params.page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  let q = svc
    .from('kpi_simples')
    .select('id, data, gerado_em, total_rotas, total_sem_gps, redes', { count: 'exact' })
    .order('gerado_em', { ascending: false })
    .range(from, to)

  if (params.dataInicio) q = q.gte('data', params.dataInicio)
  if (params.dataFim) q = q.lte('data', params.dataFim)

  const { data: rows, error, count } = await q
  if (error) throw new Error(error.message)

  const geracoes: GeracaoRow[] = (rows ?? []).map(r => ({
    id: r.id as string,
    data: r.data as string,
    gerado_em: r.gerado_em as string | null,
    total_rotas: (r.total_rotas as number | null) ?? 0,
    total_sem_gps: (r.total_sem_gps as number | null) ?? 0,
    redes: (r.redes as RedeResumo[]) ?? [],
  }))

  return { geracoes, total: count ?? 0 }
}

function formatarData(iso: string): string {
  const [a, m, d] = iso.split('-')
  if (!a || !m || !d) return iso
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  const mi = Number.parseInt(m, 10) - 1
  return `${Number.parseInt(d, 10)} ${meses[mi] ?? m} ${a}`
}

const INPUT_CLS =
  'h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[13px] text-[var(--color-fg)] cursor-pointer transition-[border-color,box-shadow] duration-150 hover:border-[var(--color-border-strong)] focus-visible:outline-none focus-visible:border-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/15'

const LABEL_CLS =
  'text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]'

export default async function HistoricoPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    inicio?: string
    fim?: string
  }>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10))
  const dataInicio = sp.inicio ?? ''
  const dataFim = sp.fim ?? ''

  const { geracoes, total } = await fetchHistorico({ page, dataInicio, dataFim })
  const totalPages = Math.ceil(total / PER_PAGE)

  function buildHref(overrides: Record<string, string | number>) {
    const p = new URLSearchParams({
      page: String(page),
      ...(dataInicio ? { inicio: dataInicio } : {}),
      ...(dataFim ? { fim: dataFim } : {}),
      ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])),
    })
    return `/painel/historico?${p.toString()}`
  }

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <header className="mb-10 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          <ClockCounterClockwise size={11} weight="bold" className="inline mr-1" />
          Histórico
        </span>
        <h1 className="text-display text-[36px] leading-[1.02] tracking-[-0.025em] text-[var(--color-fg)] md:text-[44px]">
          Gerações salvas
        </h1>
        <p className="mt-1 max-w-[55ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Cada geração do KPI fica registrada com os arquivos de origem, alterações e edições aplicadas.
          Clique numa linha pra reabrir e baixar XLSX/PDF.
        </p>
      </header>

      {/* Filtros — linha editorial sem card wrapper */}
      <form
        data-tour="hist-filtro"
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
        <button
          type="submit"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-navy-700)] px-5 text-[13px] font-medium text-white shadow-soft transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.97] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-6px_rgba(31,56,100,0.45)]"
        >
          Filtrar
        </button>
        {(dataInicio || dataFim) && (
          <Link
            href="/painel/historico"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 text-[12px] font-medium text-[var(--color-fg-muted)] transition-all duration-150 hover:border-[var(--color-fg-muted)] hover:text-[var(--color-fg)] active:scale-[0.97]"
          >
            <span aria-hidden className="text-[14px] leading-none">×</span>
            Limpar
          </Link>
        )}
      </form>

      {geracoes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-6 py-16 text-center">
          <FileMagnifyingGlass size={28} weight="bold" className="text-[var(--color-fg-subtle)]" />
          <p className="text-[14px] text-[var(--color-fg-muted)]">
            Nenhuma geração registrada para os filtros selecionados.
          </p>
          <Link
            href="/painel/kpi/simples"
            className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-navy-700)] hover:underline"
          >
            Gerar novo KPI
            <ArrowUpRight size={12} weight="bold" />
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto border-y border-[var(--color-border)]">
          <table data-tour="hist-tabela" className="w-full text-[13px]">
            <thead>
              <tr className="text-left">
                <Th>Data</Th>
                <Th>Redes</Th>
                <Th align="right">Rotas</Th>
                <Th align="right">Sem GPS</Th>
                <Th align="right">Anomalias</Th>
                <Th>Gerado</Th>
                <Th align="right" dataTour="hist-regerar">Ação</Th>
              </tr>
            </thead>
            <tbody>
              {geracoes.map(g => {
                const hrefRegerar = `/painel/kpi/simples?geracao=${g.id}`
                return (
                  <tr
                    key={g.id}
                    className="group border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-subtle)] cursor-pointer"
                  >
                    <Td>
                      <Link href={hrefRegerar} className="flex flex-col">
                        <span className="font-medium text-[var(--color-fg)] group-hover:text-[var(--color-navy-700)]">{formatarData(g.data)}</span>
                        <span className="text-numeric text-[11px] text-[var(--color-fg-subtle)]">{g.data}</span>
                      </Link>
                    </Td>
                    <Td>
                      <Link href={hrefRegerar} className="flex flex-wrap gap-1.5">
                        {g.redes.map(r => (
                          <span
                            key={r.rede_id}
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-fg-muted)]"
                          >
                            {r.rede_nome}
                            <span className="text-numeric text-[var(--color-fg-subtle)]">
                              {r.qtd_rotas}
                            </span>
                          </span>
                        ))}
                      </Link>
                    </Td>
                    <Td align="right">
                      <Link href={hrefRegerar}>
                        <span className="text-numeric text-[14px] font-medium text-[var(--color-fg)]">
                          {g.total_rotas}
                        </span>
                      </Link>
                    </Td>
                    <Td align="right">
                      <Link href={hrefRegerar}>
                        <span className={cn('text-numeric text-[13px]', g.total_sem_gps > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-fg-subtle)]')}>
                          {g.total_sem_gps}
                        </span>
                      </Link>
                    </Td>
                    <Td align="right">
                      <Link href={hrefRegerar}>
                        {(() => {
                          const high = g.redes.reduce((s, r) => s + (r.qtd_anomalias_high ?? 0), 0)
                          const med = g.redes.reduce((s, r) => s + (r.qtd_anomalias_medium ?? 0), 0)
                          const low = g.redes.reduce((s, r) => s + (r.qtd_anomalias_low ?? 0), 0)
                          const total = high + med + low
                          if (total === 0) return <span className="text-[12px] text-[var(--color-fg-subtle)]">limpo</span>
                          return (
                            <span className="inline-flex items-center gap-1">
                              {high > 0 && (
                                <span className="inline-flex h-5 items-center gap-1 rounded border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-1.5 text-[10px] font-semibold text-[var(--color-danger-soft-fg)]">
                                  <span className="text-numeric">{high}</span>H
                                </span>
                              )}
                              {med > 0 && (
                                <span className="inline-flex h-5 items-center gap-1 rounded border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] px-1.5 text-[10px] font-semibold text-[var(--color-warning-soft-fg)]">
                                  <span className="text-numeric">{med}</span>M
                                </span>
                              )}
                              {low > 0 && (
                                <span className="inline-flex h-5 items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-1.5 text-[10px] font-medium text-[var(--color-fg-muted)]">
                                  <span className="text-numeric">{low}</span>L
                                </span>
                              )}
                            </span>
                          )
                        })()}
                      </Link>
                    </Td>
                    <Td>
                      <Link href={hrefRegerar}>
                        <span className="text-numeric text-[12px] text-[var(--color-fg-muted)]">
                          {g.gerado_em
                            ? new Date(g.gerado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                            : '—'}
                        </span>
                      </Link>
                    </Td>
                    <Td align="right">
                      <Link
                        href={hrefRegerar}
                        className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-navy-700)] px-2.5 py-1 text-[11px] font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.96] group-hover:shadow-sm"
                      >
                        <ArrowClockwise size={11} weight="bold" className="transition-transform duration-300 group-hover:rotate-90" />
                        Regerar
                      </Link>
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

function Th({
  children,
  align = 'left',
  dataTour,
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  dataTour?: string
}) {
  return (
    <th
      data-tour={dataTour}
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
