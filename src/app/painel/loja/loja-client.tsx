'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { REDE_LABEL } from '@/lib/kpi/redes'
import { LineChart, ColumnChart, fmtMin, fmtNum } from '@/app/painel/charts'
import { ArrowLeft, WarningCircle, ArrowClockwise } from '@phosphor-icons/react/dist/ssr'

type Periodo = 'dia' | 'semana' | 'mes' | 'ano'

interface PontoDia {
  data: string
  total: number
  entregue: number
  nao_foi: number
  sem_rast: number
  tempo_rota: number | null
  tempo_loja: number | null
  tempo_total: number | null
  tempo_operacao: number | null
}
interface Resumo {
  total: number
  entregue: number
  pctEntregue: number
  sem_rast: number
  pctSemRastreador: number
  tempoMedioRota: number | null
  tempoMedioLoja: number | null
  tempoMedioTotal: number | null
  tempoMedioOperacao: number | null
}
interface LojaData {
  rede: string
  loja: string
  intervalo: [string, string]
  resumo: Resumo
  serie: PontoDia[]
}

const CARD = 'rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-soft'
const BTN_SEC = 'inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3.5 text-[13px] font-medium text-[var(--color-fg)] shadow-soft transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-hover)]'

const ANO_ATUAL = Number(new Date().getFullYear())
const ANOS = [ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2].map(String)

export default function LojaClient({
  rede, loja, periodoInicial, dataInicial,
}: {
  rede: string
  loja: string
  periodoInicial: string
  dataInicial: string
}) {
  const [periodo, setPeriodo] = useState<Periodo>(
    (['dia', 'semana', 'mes', 'ano'].includes(periodoInicial) ? periodoInicial : 'mes') as Periodo,
  )
  const [data, setData] = useState(dataInicial)
  const [d, setD] = useState<LojaData | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    if (!rede || !loja) return
    setCarregando(true)
    const qs = new URLSearchParams({ rede, loja, periodo, data })
    fetch(`/api/dashboard/loja?${qs}`)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then((j: LojaData) => { setD(j); setErro(false) })
      .catch(() => { setD(null); setErro(true) })
      .finally(() => setCarregando(false))
  }, [rede, loja, periodo, data])

  const recarregar = () => setData(x => x)

  return (
    <div className="mx-auto w-full max-w-[1180px] px-5 sm:px-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/painel"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-accent)]"
          >
            <ArrowLeft size={13} weight="bold" /> Dashboard
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-display text-[30px] leading-none text-[var(--color-fg)]">{loja || 'Loja'}</h1>
            <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-fg-muted)]">
              {REDE_LABEL[rede] ?? rede}
            </span>
          </div>
          <p className="mt-2 max-w-[52ch] text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
            Evolução de entregas, rastreamento e tempos desta loja no período.
          </p>
        </div>
      </header>

      {/* Filtro de período */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="inline-flex h-9 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-0.5 shadow-soft">
          {(['dia', 'semana', 'mes', 'ano'] as Periodo[]).map(p => (
            <button
              key={p} onClick={() => setPeriodo(p)}
              className={[
                'h-8 rounded-[var(--radius-sm)] px-3.5 text-[12px] font-medium capitalize transition-[background-color,color,transform] duration-150 active:scale-[0.97]',
                periodo === p ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)] shadow-soft' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
              ].join(' ')}
            >{p === 'mes' ? 'Mês' : p === 'ano' ? 'Ano' : p}</button>
          ))}
        </div>
        {periodo === 'ano' ? (
          <select
            value={data.slice(0, 4)} onChange={e => setData(`${e.target.value}-01-01`)}
            className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[13px] text-[var(--color-fg)] outline-none transition-colors hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
          >
            {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        ) : periodo === 'mes' ? (
          <input
            type="month" value={data.slice(0, 7)} onChange={e => setData(`${e.target.value}-01`)}
            className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-[13px] text-[var(--color-fg)] outline-none transition-colors hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
          />
        ) : (
          <input
            type="date" value={data} onChange={e => setData(e.target.value)}
            className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-[13px] text-[var(--color-fg)] outline-none transition-colors hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
          />
        )}
        {d?.intervalo && (
          <span className="text-numeric text-[11px] text-[var(--color-fg-subtle)]">
            {periodo === 'dia' ? d.intervalo[0] : `${d.intervalo[0]} → ${d.intervalo[1]}`}
          </span>
        )}
      </div>

      <div className="py-8">
        {!rede || !loja ? (
          <SemParametros />
        ) : carregando ? (
          <Skeleton />
        ) : erro ? (
          <Erro onRetry={recarregar} />
        ) : !d || d.resumo.total === 0 ? (
          <Vazio />
        ) : (
          <Conteudo d={d} />
        )}
      </div>
    </div>
  )
}

function Conteudo({ d }: { d: LojaData }) {
  const { resumo, serie } = d
  const tiles = [
    { label: 'Entregas', valor: fmtNum(resumo.total), sub: `${serie.length} dia${serie.length === 1 ? '' : 's'} operados`, cor: 'var(--color-fg)' },
    { label: 'Taxa de entrega', valor: `${resumo.pctEntregue}%`, sub: `${resumo.entregue} de ${resumo.total}`, cor: resumo.pctEntregue >= 95 ? 'var(--color-success)' : resumo.pctEntregue >= 80 ? 'var(--color-warning)' : 'var(--color-danger)' },
    { label: 'Sem rastreador', valor: fmtNum(resumo.sem_rast), sub: `${resumo.pctSemRastreador}% do total`, cor: resumo.pctSemRastreador > 10 ? 'var(--color-danger)' : 'var(--color-fg)' },
    { label: 'Tempo total médio', valor: fmtMin(resumo.tempoMedioTotal), sub: 'Saída CD → Saída Loja', cor: 'var(--color-info)' },
  ]
  // Tempo de operação (Saída CD → Chegada CD) só quando a loja tem a coluna preenchida.
  if (resumo.tempoMedioOperacao != null) {
    tiles.push({ label: 'Tempo de operação', valor: fmtMin(resumo.tempoMedioOperacao), sub: 'Saída CD → Chegada CD', cor: 'var(--color-success)' })
  }
  const gridCols = tiles.length === 5 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'

  return (
    <div className="space-y-12">
      {/* Cards de resumo */}
      <div className={`grid grid-cols-2 overflow-hidden divide-x divide-y divide-[var(--color-border)] ${gridCols} sm:divide-y-0 ${CARD} animate-fade-up`}>
        {tiles.map((t, i) => (
          <div key={t.label} className="p-5 sm:p-6 animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="text-display text-numeric text-[34px] leading-none" style={{ color: t.cor }}>{t.valor}</div>
            <div className="mt-2 text-overline">{t.label}</div>
            <div className="mt-0.5 text-[11px] text-[var(--color-fg-subtle)]">{t.sub}</div>
          </div>
        ))}
      </div>

      {/* Entregas por dia */}
      {serie.length > 0 && (
        <div className={`${CARD} p-5 sm:p-6 animate-fade-up`}>
          <h3 className="text-overline mb-4">Entregas por dia</h3>
          <ColumnChart
            items={serie.map(s => ({ label: s.data.slice(8, 10), value: s.total }))}
            format={n => String(Math.round(n))}
            height={220}
            labelEvery={serie.length > 14 ? 3 : 1}
          />
        </div>
      )}

      {/* Evolução dos tempos */}
      {serie.length >= 2 && (
        <div className={`${CARD} p-5 sm:p-6 animate-fade-up`}>
          <h3 className="text-overline mb-4">Evolução dos tempos médios</h3>
          <LineChart
            labels={serie.map(s => s.data.slice(8, 10))}
            series={[
              { name: 'Tempo de Rota', color: 'var(--color-accent)', values: serie.map(s => s.tempo_rota ?? 0), fill: true },
              { name: 'Tempo em Loja', color: 'var(--color-warning)', values: serie.map(s => s.tempo_loja ?? 0), fill: true },
              { name: 'Tempo Total', color: 'var(--color-info)', values: serie.map(s => s.tempo_total ?? 0), dashed: true },
            ]}
            height={260}
            labelEvery={serie.length > 14 ? 3 : 2}
          />
        </div>
      )}

      {/* Tabela dos dias */}
      <div className={`${CARD} overflow-hidden animate-fade-up`}>
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <h3 className="text-overline mb-1">Detalhe por dia</h3>
          <p className="mb-4 text-[12px] text-[var(--color-fg-subtle)]">Entregas, cobertura de GPS e tempo total por dia operado</p>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[10px] uppercase tracking-[0.1em] text-[var(--color-fg-subtle)]">
                <th className="px-5 py-2.5 font-semibold">Dia</th>
                <th className="px-3 py-2.5 text-right font-semibold">Entregues / Total</th>
                <th className="px-3 py-2.5 text-right font-semibold">Sem GPS</th>
                <th className="px-5 py-2.5 text-right font-semibold">Tempo total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {serie.map(s => (
                <tr key={s.data} className="transition-colors hover:bg-[var(--color-bg-subtle)]">
                  <td className="px-5 py-2.5 text-numeric font-medium text-[var(--color-fg)]">
                    {s.data.slice(8, 10)}/{s.data.slice(5, 7)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-fg)]">
                    {s.entregue} / {s.total}
                  </td>
                  <td className="px-3 py-2.5 text-right text-numeric" style={{ color: s.sem_rast ? 'var(--color-danger)' : 'var(--color-fg-subtle)' }}>
                    {s.sem_rast || '—'}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-[var(--color-fg-muted)]">{fmtMin(s.tempo_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-12">
      <div className={`grid grid-cols-2 overflow-hidden divide-x divide-y divide-[var(--color-border)] sm:grid-cols-4 sm:divide-y-0 ${CARD}`}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-5 sm:p-6">
            <div className="h-8 w-20 rounded animate-shimmer" />
            <div className="mt-3 h-2.5 w-24 rounded animate-shimmer" />
          </div>
        ))}
      </div>
      <div className="h-[240px] rounded-[var(--radius-card)] animate-shimmer" />
    </div>
  )
}

function Vazio() {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] py-20 text-center animate-fade-up">
      <WarningCircle size={28} weight="bold" className="text-[var(--color-fg-subtle)]" />
      <div className="mt-3 text-[14px] font-semibold text-[var(--color-fg)]">Sem dados neste período</div>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
        Esta loja não tem entregas registradas no período selecionado.
      </p>
    </div>
  )
}

function SemParametros() {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] py-20 text-center animate-fade-up">
      <WarningCircle size={28} weight="bold" className="text-[var(--color-fg-subtle)]" />
      <div className="mt-3 text-[14px] font-semibold text-[var(--color-fg)]">Loja não informada</div>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
        Acesse esta página clicando no nome de uma loja no <Link href="/painel" className="font-medium text-[var(--color-accent)]">Dashboard</Link>.
      </p>
    </div>
  )
}

function Erro({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] py-20 text-center animate-fade-up">
      <WarningCircle size={28} weight="fill" style={{ color: 'var(--color-danger)' }} />
      <div className="mt-3 text-[14px] font-semibold text-[var(--color-fg)]">Não foi possível carregar</div>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-[var(--color-fg-muted)]">Houve uma falha ao buscar os dados da loja. Tente novamente.</p>
      <button onClick={onRetry} className={`mt-4 ${BTN_SEC}`}>
        <ArrowClockwise size={14} weight="bold" /> Tentar de novo
      </button>
    </div>
  )
}
