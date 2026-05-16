import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  cn,
} from '@/components/ui'

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

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'info'> = {
  rascunho: 'default',
  gerada: 'info',
  revisada: 'warning',
  finalizada: 'success',
}

function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANT[status] ?? 'default'
  return <Badge variant={variant}>{status}</Badge>
}

function formatarData(iso: string): string {
  const [a, m, d] = iso.split('-')
  if (!a || !m || !d) return iso
  const meses = [
    'jan',
    'fev',
    'mar',
    'abr',
    'mai',
    'jun',
    'jul',
    'ago',
    'set',
    'out',
    'nov',
    'dez',
  ]
  const mi = Number.parseInt(m, 10) - 1
  return `${Number.parseInt(d, 10)} ${meses[mi] ?? m} ${a}`
}

const SELECT_CLS = cn(
  'h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)]',
  'px-3 text-[13px] text-[var(--color-fg)]',
  'transition-colors focus-visible:outline-none focus-visible:border-[var(--color-accent)]',
  'focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30',
)

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
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-6 flex flex-col gap-1 border-b border-[var(--color-border)] pb-5">
        <h1 className="text-[20px] font-semibold tracking-tight text-[var(--color-fg)]">
          Histórico de KPIs
        </h1>
        <p className="text-[13px] text-[var(--color-fg-muted)]">
          Todos os KPIs gerados, com links para download. Clique em uma data para
          abrir o detalhe.
        </p>
      </header>

      <Card className="mb-6">
        <form
          method="GET"
          action="/painel/historico"
          className="grid grid-cols-1 items-end gap-3 px-5 py-4 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]"
        >
          <div className="space-y-1.5">
            <Label htmlFor="hist-inicio">Data início</Label>
            <Input
              id="hist-inicio"
              type="date"
              name="inicio"
              defaultValue={dataInicio}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hist-fim">Data fim</Label>
            <Input
              id="hist-fim"
              type="date"
              name="fim"
              defaultValue={dataFim}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hist-rede">Rede</Label>
            <select
              id="hist-rede"
              name="rede"
              defaultValue={redeId}
              className={SELECT_CLS}
            >
              <option value="all">Todas</option>
              {redes.map((r: { id: string; nome: string }) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hist-status">Status</Label>
            <select
              id="hist-status"
              name="status"
              defaultValue={status}
              className={SELECT_CLS}
            >
              <option value="all">Todos</option>
              <option value="rascunho">Rascunho</option>
              <option value="gerada">Gerada</option>
              <option value="revisada">Revisada</option>
              <option value="finalizada">Finalizada</option>
            </select>
          </div>
          <div>
            <Button type="submit" size="md" fullWidth>
              Filtrar
            </Button>
          </div>
        </form>
      </Card>

      {kpis.length === 0 ? (
        <Card className="px-6 py-12 text-center">
          <p className="text-[13px] text-[var(--color-fg-muted)]">
            Nenhum KPI encontrado para os filtros selecionados.
          </p>
          <p className="mt-1 text-[12px] text-[var(--color-fg-subtle)]">
            Acesse{' '}
            <Link
              href="/painel/kpi/dia"
              className="font-medium text-[var(--color-accent)] hover:underline"
            >
              Dia
            </Link>{' '}
            para começar a gerar KPIs.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] text-left">
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                    Data
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                    Rede
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                    Linhas
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                    Anomalias
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                    Gerado em
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                    Downloads
                  </th>
                </tr>
              </thead>
              <tbody>
                {kpis.map((k) => {
                  const hrefDia = `/painel/kpi/dia?data=${k.data}&rede=${k.rede_id}`
                  return (
                    <tr
                      key={k.id}
                      className="border-b border-[var(--color-border)] transition-colors last:border-0 hover:bg-[var(--color-bg-subtle)]"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <Link
                          href={hrefDia}
                          className="font-medium text-[var(--color-fg)] hover:text-[var(--color-accent)]"
                        >
                          {formatarData(k.data)}
                        </Link>
                        <div className="mt-0.5 font-mono text-[11px] text-[var(--color-fg-subtle)]">
                          {k.data}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[var(--color-fg-muted)]">
                        {k.rede_nome}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={k.status} />
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-fg-muted)]">
                        {k.qtd_linhas ?? '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {(k.qtd_anomalias_high ?? 0) > 0 && (
                            <Badge variant="danger">
                              {k.qtd_anomalias_high} H
                            </Badge>
                          )}
                          {(k.qtd_anomalias_medium ?? 0) > 0 && (
                            <Badge variant="warning">
                              {k.qtd_anomalias_medium} M
                            </Badge>
                          )}
                          {(k.qtd_anomalias_low ?? 0) > 0 && (
                            <Badge variant="default">
                              {k.qtd_anomalias_low} L
                            </Badge>
                          )}
                          {!k.qtd_anomalias_high &&
                            !k.qtd_anomalias_medium &&
                            !k.qtd_anomalias_low && (
                              <span className="text-[12px] text-[var(--color-fg-subtle)]">
                                —
                              </span>
                            )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[12px] text-[var(--color-fg-muted)]">
                        {k.gerada_em
                          ? new Date(k.gerada_em).toLocaleString('pt-BR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {k.xlsx_path || k.pdf_path ? (
                          <Link
                            href={hrefDia}
                            className="text-[12px] font-medium text-[var(--color-accent)] hover:underline"
                          >
                            Ver / Baixar
                          </Link>
                        ) : (
                          <span className="text-[12px] text-[var(--color-fg-subtle)]">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-between">
          <p className="text-[12px] text-[var(--color-fg-muted)]">
            {total} resultado{total !== 1 ? 's' : ''} — página {page} de{' '}
            {totalPages}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link href={buildHref({ page: page - 1 })}>
                <Button variant="secondary" size="sm" type="button">
                  Anterior
                </Button>
              </Link>
            )}
            {page < totalPages && (
              <Link href={buildHref({ page: page + 1 })}>
                <Button variant="secondary" size="sm" type="button">
                  Próxima
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
