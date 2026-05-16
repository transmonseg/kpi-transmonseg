import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { Button, Card, Input, Label, cn } from '@/components/ui'
import { AnomaliaLista, type AnomaliaRow } from './anomalia-lista'

export const metadata = { title: 'Revisar Anomalias — Transmonseg' }

async function fetchAnomalias(params: {
  data: string
  severidade: string
  status: string
}): Promise<AnomaliaRow[]> {
  const svc = createServiceClient()

  let q = svc
    .from('anomalias')
    .select(
      `
      id,
      codigo,
      severidade,
      descricao,
      sugestao,
      status,
      data,
      kpi_rotas ( placa_norm, rede_id, redes ( nome ) )
    `,
    )
    .eq('data', params.data)
    .order('severidade', { ascending: true })
    .order('codigo')

  if (params.severidade !== 'all') {
    q = q.eq('severidade', params.severidade)
  }
  if (params.status !== 'all') {
    q = q.eq('status', params.status)
  }

  const { data: rows, error } = await q
  if (error) throw new Error(error.message)

  return (rows ?? []).map((r) => {
    type RotaRaw = {
      placa_norm: string | null
      rede_id: string | null
      redes: { nome: string } | { nome: string }[] | null
    }
    const rotaRaw = (
      Array.isArray(r.kpi_rotas) ? r.kpi_rotas[0] : r.kpi_rotas
    ) as RotaRaw | null
    const redeNome = rotaRaw?.redes
      ? Array.isArray(rotaRaw.redes)
        ? rotaRaw.redes[0]?.nome
        : (rotaRaw.redes as { nome: string }).nome
      : null

    return {
      id: r.id as string,
      codigo: r.codigo as string,
      severidade: r.severidade as 'HIGH' | 'MEDIUM' | 'LOW',
      descricao: r.descricao as string,
      sugestao: r.sugestao as string | null,
      status: r.status as string,
      data: r.data as string,
      placa: rotaRaw?.placa_norm ?? null,
      rede_id: rotaRaw?.rede_id ?? null,
      rede_nome: redeNome ?? null,
    }
  })
}

const SEVERIDADES = ['all', 'HIGH', 'MEDIUM', 'LOW'] as const
const STATUS_OPTS = [
  'all',
  'pendente',
  'ignorada',
  'aceita',
  'corrigida',
  'sem_entrega',
] as const

export default async function RevisaoPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; severidade?: string; status?: string }>
}) {
  const sp = await searchParams
  const hoje = new Date().toISOString().slice(0, 10)
  const data = sp.data ?? hoje
  const severidade = sp.severidade ?? 'all'
  const status = sp.status ?? 'pendente'

  const anomalias = await fetchAnomalias({ data, severidade, status })

  function buildHref(overrides: Record<string, string>) {
    const p = new URLSearchParams({ data, severidade, status, ...overrides })
    return `/painel/revisao?${p.toString()}`
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-border)] pb-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-[20px] font-semibold tracking-tight text-[var(--color-fg)]">
            Revisar Anomalias
          </h1>
          <p className="text-[13px] text-[var(--color-fg-muted)]">
            Revise e classifique as anomalias detectadas antes de gerar o KPI.
          </p>
        </div>
        <form
          method="GET"
          action="/painel/revisao"
          className="flex items-end gap-2"
        >
          <input type="hidden" name="severidade" value={severidade} />
          <input type="hidden" name="status" value={status} />
          <div className="space-y-1.5">
            <Label htmlFor="rev-data">Data</Label>
            <Input
              id="rev-data"
              type="date"
              name="data"
              defaultValue={data}
              className="w-[160px]"
            />
          </div>
          <Button type="submit" size="md">
            Ver
          </Button>
        </form>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <FilterPills
          label="Severidade"
          options={[...SEVERIDADES]}
          selected={severidade}
          buildHref={(v) => buildHref({ severidade: v })}
          format={(s) => (s === 'all' ? 'Todos' : s)}
        />
        <FilterPills
          label="Status"
          options={[...STATUS_OPTS]}
          selected={status}
          buildHref={(v) => buildHref({ status: v })}
          format={(s) => (s === 'all' ? 'Todos' : s.replace('_', ' '))}
        />
      </div>

      <AnomaliaLista anomalias={anomalias} />
    </div>
  )
}

function FilterPills({
  label,
  options,
  selected,
  buildHref,
  format,
}: {
  label: string
  options: string[]
  selected: string
  buildHref: (v: string) => string
  format: (v: string) => string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
        {label}:
      </span>
      <div className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-0.5">
        {options.map((opt) => {
          const active = selected === opt
          return (
            <Link
              key={opt}
              href={buildHref(opt)}
              className={cn(
                'rounded-[5px] px-2.5 py-1 text-[11px] font-medium capitalize transition-colors',
                active
                  ? 'bg-[var(--color-bg-elevated)] text-[var(--color-fg)] shadow-sm'
                  : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
              )}
            >
              {format(opt)}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
