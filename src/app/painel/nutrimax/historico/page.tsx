import Link from 'next/link'
import { CaretLeft, CaretRight, FileMagnifyingGlass, ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr'
import { createServiceClient } from '@/lib/supabase/service'
import { fmtInstanteBR } from '@/lib/data-br'
import { Badge, cn } from '@/components/ui'

export const metadata = { title: 'Histórico Nutry Max — Transmonseg' }

const PER_PAGE = 25

type ResumoKpi = { total: number; ok: number; incompletos: number; semRastreador: number; modoApi?: boolean }
type ResumoRomaneio = { total: number; ok: number; divergentes: number; ausentes: number; pesoTotalKg: number }
type GeracaoRow = {
  id: string
  tipo: 'KPI' | 'ROMANEIO'
  data: string
  gerado_em: string | null
  resumo: ResumoKpi | ResumoRomaneio
}

async function fetchHistorico(params: { page: number; tipo: string; dataInicio: string; dataFim: string }) {
  const svc = createServiceClient()
  const from = (params.page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  let q = svc
    .from('kpi_nutrimax_geracoes')
    .select('id, tipo, data, gerado_em, resumo', { count: 'exact' })
    .order('gerado_em', { ascending: false })
    .range(from, to)

  if (params.tipo === 'KPI' || params.tipo === 'ROMANEIO') q = q.eq('tipo', params.tipo)
  if (params.dataInicio) q = q.gte('data', params.dataInicio)
  if (params.dataFim) q = q.lte('data', params.dataFim)

  const { data: rows, error, count } = await q
  if (error) throw new Error(error.message)

  const geracoes: GeracaoRow[] = (rows ?? []).map(r => ({
    id: r.id as string,
    tipo: r.tipo as 'KPI' | 'ROMANEIO',
    data: r.data as string,
    gerado_em: r.gerado_em as string | null,
    resumo: r.resumo as ResumoKpi | ResumoRomaneio,
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

function resumoTexto(g: GeracaoRow): string {
  if (g.tipo === 'KPI') {
    const r = g.resumo as ResumoKpi
    return `${r.total} loja(s) · ${r.ok} confirmadas · ${r.incompletos} pendentes · ${r.semRastreador} sem rastreador${r.modoApi ? ' · via API' : ''}`
  }
  const r = g.resumo as ResumoRomaneio
  return `${r.total} carga(s) · ${r.ok} OK · ${r.divergentes} divergentes · ${r.ausentes} ausentes`
}

function hrefReabrir(g: GeracaoRow): string {
  return g.tipo === 'KPI' ? `/painel/nutrimax/gerar?geracao=${g.id}` : `/painel/nutrimax/romaneio?geracao=${g.id}`
}

const INPUT_CLS =
  'h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[13px] text-[var(--color-fg)] cursor-pointer transition-[border-color,box-shadow] duration-150 hover:border-[var(--color-border-strong)] focus-visible:outline-none focus-visible:border-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/15'

const LABEL_CLS =
  'text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]'

export default async function NutrimaxHistoricoPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tipo?: string; inicio?: string; fim?: string }>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10))
  const tipo = sp.tipo ?? ''
  const dataInicio = sp.inicio ?? ''
  const dataFim = sp.fim ?? ''

  const { geracoes, total } = await fetchHistorico({ page, tipo, dataInicio, dataFim })
  const totalPages = Math.ceil(total / PER_PAGE)

  function buildHref(overrides: Record<string, string | number>) {
    const p = new URLSearchParams({
      page: String(page),
      ...(tipo ? { tipo } : {}),
      ...(dataInicio ? { inicio: dataInicio } : {}),
      ...(dataFim ? { fim: dataFim } : {}),
      ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])),
    })
    return `/painel/nutrimax/historico?${p.toString()}`
  }

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <header className="mb-10 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          <ClockCounterClockwise size={11} weight="bold" className="inline mr-1" />
          Nutry Max
        </span>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-fg)] md:text-[34px]">
          Histórico
        </h1>
        <p className="mt-1 max-w-[55ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Cada geração do Gerar KPI e do Gerar Romaneio fica registrada aqui. Clique numa linha
          pra reabrir e baixar o XLSX de novo, sem re-subir os arquivos.
        </p>
      </header>

      <div className="mb-6 flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-0.5 w-fit">
        {[{ id: '', label: 'Todas' }, { id: 'KPI', label: 'Gerar KPI' }, { id: 'ROMANEIO', label: 'Gerar Romaneio' }].map(o => (
          <Link
            key={o.id}
            href={buildHref({ tipo: o.id, page: 1 })}
            className={cn(
              'rounded-[4px] px-3 py-1 text-[12px] font-medium transition-colors',
              tipo === o.id
                ? 'bg-[var(--color-bg-elevated)] text-[var(--color-fg)] shadow-sm'
                : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
            )}
          >
            {o.label}
          </Link>
        ))}
      </div>

      <form
        method="GET"
        action="/painel/nutrimax/historico"
        className="mb-8 flex flex-wrap items-end gap-4 border-y border-[var(--color-border)] py-6"
      >
        {tipo && <input type="hidden" name="tipo" value={tipo} />}
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
            href={buildHref({ inicio: '', fim: '' })}
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
        </div>
      ) : (
        <div className="overflow-x-auto border-y border-[var(--color-border)]">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left">
                <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">Data</th>
                <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">Tipo</th>
                <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">Resumo</th>
                <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">Gerado</th>
              </tr>
            </thead>
            <tbody>
              {geracoes.map(g => {
                const href = hrefReabrir(g)
                return (
                  <tr key={g.id} className="group border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-subtle)] cursor-pointer">
                    <td className="whitespace-nowrap px-4 py-4">
                      <Link href={href} className="flex flex-col">
                        <span className="font-medium text-[var(--color-fg)] group-hover:text-[var(--color-navy-700)]">{formatarData(g.data)}</span>
                        <span className="text-numeric text-[11px] text-[var(--color-fg-subtle)]">{g.data}</span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <Link href={href}>
                        <Badge variant={g.tipo === 'KPI' ? 'info' : 'success'}>{g.tipo === 'KPI' ? 'Gerar KPI' : 'Gerar Romaneio'}</Badge>
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <Link href={href} className="text-[12.5px] text-[var(--color-fg-muted)]">{resumoTexto(g)}</Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <Link href={href}>
                        <span className="text-numeric text-[12px] text-[var(--color-fg-muted)]">{fmtInstanteBR(g.gerado_em)}</span>
                      </Link>
                    </td>
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
              <Link href={buildHref({ page: page - 1 })} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[12px] font-medium text-[var(--color-fg)] transition-colors active:scale-[0.97] hover:border-[var(--color-fg)]">
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
              <Link href={buildHref({ page: page + 1 })} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[12px] font-medium text-[var(--color-fg)] transition-colors active:scale-[0.97] hover:border-[var(--color-fg)]">
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
