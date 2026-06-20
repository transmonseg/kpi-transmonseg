'use client'

import { useEffect, useMemo } from 'react'
import { X } from '@phosphor-icons/react/dist/ssr'
import type { Metricas } from '@/lib/kpi/dashboard-metricas'
import type { ResumoDiaApi } from '@/lib/kpi/dashboard-api-fonte'
import { REDE_LABEL } from '@/lib/kpi/redes'
import { fmtNum } from '@/app/painel/charts'
import { TabelaRanking, type ColunaRanking } from '../rankings/tabela-ranking'

// Cada card do dashboard abre um destes detalhes, ampliado na própria tela.
export type TipoDetalhe = 'rede' | 'nao-foi' | 'gps' | 'placas' | 'rotas' | 'tempo-loja' | 'motoristas' | 'lojas'

const fmtMin = (n: number | null | undefined) => {
  if (n == null) return '—'
  const h = Math.floor(n / 60), m = Math.round(n % 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}

function CelLoja({ rede, loja }: { rede: string; loja: string }) {
  return (
    <div>
      <div className="max-w-[280px] truncate font-medium text-[var(--color-fg)]">{loja}</div>
      <div className="text-[11px] text-[var(--color-fg-subtle)]">{REDE_LABEL[rede] ?? rede}</div>
    </div>
  )
}
const colLoja = <T extends { rede_id: string; loja: string }>(): ColunaRanking<T> => ({
  chave: 'loja', titulo: 'Loja', render: l => <CelLoja rede={l.rede_id} loja={l.loja} />,
  ord: l => l.loja, busca: l => `${l.loja} ${REDE_LABEL[l.rede_id] ?? l.rede_id}`,
})

// Abre instantâneo: usa os números que o dashboard JÁ carregou (sem novo fetch).
export function ModalDetalhe({ tipo, m, resumo, onClose }: {
  tipo: TipoDetalhe
  m: Metricas
  resumo: ResumoDiaApi | null
  onClose: () => void
}) {
  // Trava o scroll do fundo enquanto o modal está aberto (não rola "atrás").
  useEffect(() => {
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => { document.body.style.overflow = anterior; window.removeEventListener('keydown', h) }
  }, [onClose])

  const placas = useMemo(() => {
    const map = new Map<string, { placa: string; n: number; totalMin: number; rede?: string }>()
    for (const p of resumo?.pontosRisco ?? []) {
      const e = map.get(p.placa) ?? { placa: p.placa, n: 0, totalMin: 0, rede: p.rede }
      e.n++; e.totalMin += p.duracaoMin; if (!e.rede && p.rede) e.rede = p.rede
      map.set(p.placa, e)
    }
    return [...map.values()].sort((a, b) => b.n - a.n || b.totalMin - a.totalMin)
  }, [resumo])

  const lojasProblema = useMemo(() => {
    const map = new Map<string, { rede_id: string; loja: string; sem: number; nao: number }>()
    const get = (rede_id: string, loja: string) => {
      const k = `${rede_id}|${loja}`; let e = map.get(k)
      if (!e) { e = { rede_id, loja, sem: 0, nao: 0 }; map.set(k, e) }
      return e
    }
    for (const x of m.topSemRastreador) get(x.rede_id, x.loja).sem = x.ocorrencias
    for (const x of m.topNaoFoi) get(x.rede_id, x.loja).nao = x.ocorrencias
    return [...map.values()].sort((a, b) => (b.sem + b.nao) - (a.sem + a.nao))
  }, [m])

  let tabela: React.ReactNode = null
  if (tipo === 'placas') tabela = (
    <TabelaRanking titulo="Placas que mais param" ancora="m-placas" sub="Paradas indevidas por placa (fora de loja e da base, 10min+)." buscaPlaceholder="Buscar placa…" linhas={placas}
      colunas={[
        { chave: 'placa', titulo: 'Placa', render: l => <span className="text-numeric font-medium text-[var(--color-fg)]">{l.placa}</span>, ord: l => l.placa, busca: l => l.placa },
        { chave: 'rede', titulo: 'Rede', render: l => <span className="text-[12px] text-[var(--color-fg-muted)]">{l.rede ? (REDE_LABEL[l.rede] ?? l.rede) : '—'}</span>, ord: l => l.rede ?? '', busca: l => (l.rede ? REDE_LABEL[l.rede] ?? l.rede : '') },
        { chave: 'n', titulo: 'Paradas', alinhar: 'right', render: l => <span className="font-semibold" style={{ color: 'var(--color-danger)' }}>{l.n}</span>, ord: l => l.n },
        { chave: 'total', titulo: 'Tempo total parado', alinhar: 'right', render: l => fmtMin(l.totalMin), ord: l => l.totalMin },
      ] as ColunaRanking<typeof placas[number]>[]} />
  )
  else if (tipo === 'nao-foi') tabela = (
    <TabelaRanking titulo="Não foi ao cliente" ancora="m-naofoi" sub="Por loja, no período." buscaPlaceholder="Buscar loja…" linhas={m.topNaoFoi}
      colunas={[colLoja<Metricas['topNaoFoi'][number]>(), { chave: 'oc', titulo: 'Ocorrências', alinhar: 'right', render: l => l.ocorrencias, ord: l => l.ocorrencias }]} />
  )
  else if (tipo === 'gps') tabela = (
    <TabelaRanking titulo="Sem rastreador (sem GPS)" ancora="m-gps" sub="Entregas sem registro de GPS, por loja." buscaPlaceholder="Buscar loja…" linhas={m.topSemRastreador}
      colunas={[colLoja<Metricas['topSemRastreador'][number]>(), { chave: 'oc', titulo: 'Ocorrências', alinhar: 'right', render: l => l.ocorrencias, ord: l => l.ocorrencias }]} />
  )
  else if (tipo === 'lojas') tabela = (
    <TabelaRanking titulo="Lojas com problema" ancora="m-lojas" sub="Sem GPS + não foi, combinados." buscaPlaceholder="Buscar loja…" linhas={lojasProblema}
      colunas={[colLoja<typeof lojasProblema[number]>(), { chave: 'sem', titulo: 'Sem GPS', alinhar: 'right', render: l => l.sem || '—', ord: l => l.sem }, { chave: 'nao', titulo: 'Não foi', alinhar: 'right', render: l => l.nao || '—', ord: l => l.nao }]} />
  )
  else if (tipo === 'rotas') tabela = (
    <TabelaRanking titulo="Rotas mais demoradas (CD → loja)" ancora="m-rotas" buscaPlaceholder="Buscar loja…" linhas={m.topRotasDemoradas}
      colunas={[colLoja<Metricas['topRotasDemoradas'][number]>(), { chave: 't', titulo: 'Tempo de rota', alinhar: 'right', render: l => fmtMin(l.tempo_rota), ord: l => l.tempo_rota ?? 0 }, { chave: 'n', titulo: 'Visitas', alinhar: 'right', render: l => l.n, ord: l => l.n }]} />
  )
  else if (tipo === 'tempo-loja') tabela = (
    <TabelaRanking titulo="Mais tempo em loja" ancora="m-tloja" buscaPlaceholder="Buscar loja…" linhas={m.topTempoEmLoja}
      colunas={[colLoja<Metricas['topTempoEmLoja'][number]>(), { chave: 't', titulo: 'Tempo em loja', alinhar: 'right', render: l => fmtMin(l.tempo_loja), ord: l => l.tempo_loja ?? 0 }, { chave: 'n', titulo: 'Visitas', alinhar: 'right', render: l => l.n, ord: l => l.n }]} />
  )
  else if (tipo === 'motoristas') tabela = (
    <TabelaRanking titulo="Motoristas" ancora="m-mot" buscaPlaceholder="Buscar motorista…" linhas={m.topMotoristas}
      colunas={[
        { chave: 'mot', titulo: 'Motorista', render: l => <span className="font-medium text-[var(--color-fg)]">{l.motorista}</span>, ord: l => l.motorista, busca: l => l.motorista },
        { chave: 'ent', titulo: 'Entregas', alinhar: 'right', render: l => fmtNum(l.entregas), ord: l => l.entregas },
        { chave: 'r', titulo: 'Tempo de rota', alinhar: 'right', render: l => fmtMin(l.tempo_rota), ord: l => l.tempo_rota ?? 0 },
        { chave: 'l', titulo: 'Tempo em loja', alinhar: 'right', render: l => fmtMin(l.tempo_loja), ord: l => l.tempo_loja ?? 0 },
      ]} />
  )
  else if (tipo === 'rede') tabela = (
    <TabelaRanking titulo="Desempenho por rede" ancora="m-rede" buscaPlaceholder="Buscar rede…" linhas={m.porRede}
      colunas={[
        { chave: 'rede', titulo: 'Rede', render: l => <span className="font-medium text-[var(--color-fg)]">{REDE_LABEL[l.rede_id] ?? l.rede_id}</span>, ord: l => REDE_LABEL[l.rede_id] ?? l.rede_id, busca: l => REDE_LABEL[l.rede_id] ?? l.rede_id },
        { chave: 'tx', titulo: 'Taxa de entrega', alinhar: 'right', render: l => `${l.pctEntregue}%`, ord: l => l.pctEntregue },
        { chave: 'tot', titulo: 'Entregas', alinhar: 'right', render: l => fmtNum(l.total), ord: l => l.total },
      ]} />
  )

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/65 p-4 backdrop-blur-sm sm:p-8" onClick={onClose}>
      <div className="w-full max-w-[760px]" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex justify-end">
          <button
            type="button" onClick={onClose} aria-label="Fechar"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg-muted)] shadow-soft transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-fg)] active:scale-95"
          >
            <X size={18} weight="bold" />
          </button>
        </div>
        {tabela}
      </div>
    </div>
  )
}
