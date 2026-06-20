'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from '@phosphor-icons/react/dist/ssr'
import type { Metricas } from '@/lib/kpi/dashboard-metricas'
import type { ResumoDiaApi } from '@/lib/kpi/dashboard-api-fonte'
import { REDE_LABEL } from '@/lib/kpi/redes'
import { fmtNum } from '@/app/painel/charts'
import { TabelaRanking, type ColunaRanking } from './tabela-ranking'

const PERIODO_LABEL: Record<string, string> = { dia: 'no dia', semana: 'na semana', mes: 'no mês', ano: 'no ano', custom: 'no período' }

const fmtMin = (n: number | null | undefined) => {
  if (n == null) return '—'
  const h = Math.floor(n / 60), m = Math.round(n % 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}

// Célula de loja: nome + rede embaixo (padrão do dashboard).
function CelLoja({ rede, loja }: { rede: string; loja: string }) {
  return (
    <div>
      <div className="max-w-[280px] truncate font-medium text-[var(--color-fg)]">{loja}</div>
      <div className="text-[11px] text-[var(--color-fg-subtle)]">{REDE_LABEL[rede] ?? rede}</div>
    </div>
  )
}

export default function RankingsClient({ periodo, data, de, ate, redes }: { periodo: string; data: string; de: string; ate: string; redes: string }) {
  const [m, setM] = useState<Metricas | null>(null)
  const [resumo, setResumo] = useState<ResumoDiaApi | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)

  const qs = useMemo(() => {
    const p = new URLSearchParams(periodo === 'custom' ? { periodo, de, ate, redes } : { periodo, data, redes })
    return p.toString()
  }, [periodo, data, de, ate, redes])

  useEffect(() => {
    setCarregando(true); setErro(false)
    Promise.all([
      fetch(`/api/dashboard?${qs}&completo=1`).then(r => { if (!r.ok) throw new Error(); return r.json() }),
      fetch(`/api/dashboard/beta?${qs}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([dash, beta]) => { setM(dash.metricas); setResumo(beta?.resumoApi ?? null) })
      .catch(() => setErro(true))
      .finally(() => setCarregando(false))
  }, [qs])

  // Volta pro dashboard mantendo o filtro.
  const voltarHref = `/painel?${qs}`

  // Placas que mais param (agrupado dos pontos de risco).
  const placasParam = useMemo(() => {
    const map = new Map<string, { placa: string; n: number; totalMin: number; rede?: string }>()
    for (const p of resumo?.pontosRisco ?? []) {
      const e = map.get(p.placa) ?? { placa: p.placa, n: 0, totalMin: 0, rede: p.rede }
      e.n++; e.totalMin += p.duracaoMin; if (!e.rede && p.rede) e.rede = p.rede
      map.set(p.placa, e)
    }
    return [...map.values()].sort((a, b) => b.n - a.n || b.totalMin - a.totalMin)
  }, [resumo])

  // Lojas com problema = sem GPS + não foi, combinados.
  const lojasProblema = useMemo(() => {
    const map = new Map<string, { rede_id: string; loja: string; sem: number; nao: number }>()
    const get = (rede_id: string, loja: string) => {
      const k = `${rede_id}|${loja}`
      let e = map.get(k); if (!e) { e = { rede_id, loja, sem: 0, nao: 0 }; map.set(k, e) }
      return e
    }
    for (const x of m?.topSemRastreador ?? []) get(x.rede_id, x.loja).sem = x.ocorrencias
    for (const x of m?.topNaoFoi ?? []) get(x.rede_id, x.loja).nao = x.ocorrencias
    return [...map.values()].sort((a, b) => (b.sem + b.nao) - (a.sem + a.nao))
  }, [m])

  if (carregando) {
    return (
      <div className="mx-auto w-full max-w-[1180px] px-5 py-8 sm:px-8">
        <div className="h-7 w-48 animate-pulse rounded bg-[var(--color-bg-elevated)]" />
        <div className="mt-6 space-y-5">{[0, 1, 2].map(i => <div key={i} className="h-64 animate-pulse rounded-[var(--radius-card)] bg-[var(--color-bg-elevated)]" />)}</div>
      </div>
    )
  }
  if (erro || !m) {
    return (
      <div className="mx-auto w-full max-w-[1180px] px-5 py-16 text-center sm:px-8">
        <p className="text-[14px] text-[var(--color-fg-muted)]">Não foi possível carregar os rankings.</p>
        <Link href={voltarHref} className="mt-3 inline-block text-[13px] text-[var(--color-accent)] hover:underline">← Voltar ao dashboard</Link>
      </div>
    )
  }

  // Colunas reaproveitadas
  const colLoja = <T extends { rede_id: string; loja: string }>(): ColunaRanking<T> => ({
    chave: 'loja', titulo: 'Loja', render: l => <CelLoja rede={l.rede_id} loja={l.loja} />,
    ord: l => l.loja, busca: l => `${l.loja} ${REDE_LABEL[l.rede_id] ?? l.rede_id}`,
  })

  return (
    <div className="mx-auto w-full max-w-[1180px] px-5 py-8 sm:px-8">
      <header className="mb-6">
        <Link href={voltarHref} className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]">
          <ArrowLeft size={13} weight="bold" /> Voltar ao dashboard
        </Link>
        <h1 className="mt-2 text-display text-[28px] leading-none text-[var(--color-fg)]">Rankings completos</h1>
        <p className="mt-2 text-[13px] text-[var(--color-fg-muted)]">Todas as listas {PERIODO_LABEL[periodo] ?? 'no período'}, sem corte. Clique no cabeçalho pra ordenar; use a busca pra filtrar.</p>
      </header>

      <div className="space-y-6">
        {/* Placas que mais param */}
        <TabelaRanking
          titulo="Placas que mais param" ancora="placas-param"
          sub="Paradas indevidas por placa (fora de loja e da base, 10min ou mais)."
          buscaPlaceholder="Buscar placa…"
          linhas={placasParam}
          colunas={[
            { chave: 'placa', titulo: 'Placa', render: l => <span className="text-numeric font-medium text-[var(--color-fg)]">{l.placa}</span>, ord: l => l.placa, busca: l => l.placa },
            { chave: 'rede', titulo: 'Rede', render: l => <span className="text-[12px] text-[var(--color-fg-muted)]">{l.rede ? (REDE_LABEL[l.rede] ?? l.rede) : '—'}</span>, ord: l => l.rede ?? '', busca: l => (l.rede ? REDE_LABEL[l.rede] ?? l.rede : '') },
            { chave: 'n', titulo: 'Paradas', alinhar: 'right', render: l => <span className="font-semibold" style={{ color: 'var(--color-danger)' }}>{l.n}</span>, ord: l => l.n },
            { chave: 'total', titulo: 'Tempo total parado', alinhar: 'right', render: l => fmtMin(l.totalMin), ord: l => l.totalMin },
          ] as ColunaRanking<typeof placasParam[number]>[]}
        />

        {/* Lojas com problema */}
        <TabelaRanking
          titulo="Lojas com problema" ancora="lojas-problema"
          sub="Sem registro de GPS e entregas não realizadas, por loja."
          buscaPlaceholder="Buscar loja…"
          linhas={lojasProblema}
          colunas={[
            colLoja<typeof lojasProblema[number]>(),
            { chave: 'sem', titulo: 'Sem GPS', alinhar: 'right', render: l => l.sem || '—', ord: l => l.sem },
            { chave: 'nao', titulo: 'Não foi', alinhar: 'right', render: l => l.nao || '—', ord: l => l.nao },
          ]}
        />

        {/* Rotas mais demoradas */}
        <TabelaRanking
          titulo="Rotas mais demoradas (CD → loja)" ancora="rotas"
          buscaPlaceholder="Buscar loja…"
          linhas={m.topRotasDemoradas}
          colunas={[
            colLoja<Metricas['topRotasDemoradas'][number]>(),
            { chave: 'tempo', titulo: 'Tempo de rota', alinhar: 'right', render: l => fmtMin(l.tempo_rota), ord: l => l.tempo_rota ?? 0 },
            { chave: 'n', titulo: 'Visitas', alinhar: 'right', render: l => l.n, ord: l => l.n },
          ]}
        />

        {/* Tempo em loja */}
        <TabelaRanking
          titulo="Mais tempo em loja" ancora="tempo-loja"
          buscaPlaceholder="Buscar loja…"
          linhas={m.topTempoEmLoja}
          colunas={[
            colLoja<Metricas['topTempoEmLoja'][number]>(),
            { chave: 'tempo', titulo: 'Tempo em loja', alinhar: 'right', render: l => fmtMin(l.tempo_loja), ord: l => l.tempo_loja ?? 0 },
            { chave: 'n', titulo: 'Visitas', alinhar: 'right', render: l => l.n, ord: l => l.n },
          ]}
        />

        {/* Tempo total */}
        <TabelaRanking
          titulo="Maior tempo total (CD → saída loja)" ancora="tempo-total"
          buscaPlaceholder="Buscar loja…"
          linhas={m.topTempoTotal}
          colunas={[
            colLoja<Metricas['topTempoTotal'][number]>(),
            { chave: 'tempo', titulo: 'Tempo total', alinhar: 'right', render: l => fmtMin(l.tempo_total), ord: l => l.tempo_total ?? 0 },
            { chave: 'n', titulo: 'Visitas', alinhar: 'right', render: l => l.n, ord: l => l.n },
          ]}
        />

        {/* Motoristas */}
        <TabelaRanking
          titulo="Motoristas" ancora="motoristas"
          buscaPlaceholder="Buscar motorista…"
          linhas={m.topMotoristas}
          colunas={[
            { chave: 'motorista', titulo: 'Motorista', render: l => <span className="font-medium text-[var(--color-fg)]">{l.motorista}</span>, ord: l => l.motorista, busca: l => l.motorista },
            { chave: 'entregas', titulo: 'Entregas', alinhar: 'right', render: l => fmtNum(l.entregas), ord: l => l.entregas },
            { chave: 'rota', titulo: 'Tempo de rota', alinhar: 'right', render: l => fmtMin(l.tempo_rota), ord: l => l.tempo_rota ?? 0 },
            { chave: 'loja', titulo: 'Tempo em loja', alinhar: 'right', render: l => fmtMin(l.tempo_loja), ord: l => l.tempo_loja ?? 0 },
          ]}
        />

        {/* Sem rastreador */}
        <TabelaRanking
          titulo="Sem rastreador" ancora="sem-rastreador"
          sub="Entregas sem registro de GPS, por loja."
          buscaPlaceholder="Buscar loja…"
          linhas={m.topSemRastreador}
          colunas={[colLoja<Metricas['topSemRastreador'][number]>(), { chave: 'oc', titulo: 'Ocorrências', alinhar: 'right', render: l => l.ocorrencias, ord: l => l.ocorrencias }]}
        />

        {/* Não foi */}
        <TabelaRanking
          titulo="Não foi ao cliente" ancora="nao-foi"
          buscaPlaceholder="Buscar loja…"
          linhas={m.topNaoFoi}
          colunas={[colLoja<Metricas['topNaoFoi'][number]>(), { chave: 'oc', titulo: 'Ocorrências', alinhar: 'right', render: l => l.ocorrencias, ord: l => l.ocorrencias }]}
        />

        {/* Em análise */}
        <TabelaRanking
          titulo="Em análise (sem legenda/horário)" ancora="em-analise"
          sub="Linhas que ficaram sem como confirmar — QA do dado."
          buscaPlaceholder="Buscar loja…"
          linhas={m.topIndefinido}
          colunas={[colLoja<Metricas['topIndefinido'][number]>(), { chave: 'oc', titulo: 'Ocorrências', alinhar: 'right', render: l => l.ocorrencias, ord: l => l.ocorrencias }]}
        />

        {/* Placas mais ativas */}
        <TabelaRanking
          titulo="Placas mais ativas" ancora="placas-ativas"
          sub="Por volume de entregas no período."
          buscaPlaceholder="Buscar placa…"
          linhas={m.placasMaisAtivas}
          colunas={[
            { chave: 'placa', titulo: 'Placa', render: l => <span className="text-numeric font-medium text-[var(--color-fg)]">{l.placa}</span>, ord: l => l.placa, busca: l => l.placa },
            { chave: 'entregas', titulo: 'Entregas', alinhar: 'right', render: l => fmtNum(l.entregas), ord: l => l.entregas },
          ]}
        />
      </div>
    </div>
  )
}
