'use client'

import { useState } from 'react'
import { BarList, type BarItem } from '@/app/painel/charts'
import { Colunas } from './graficos'
import { dataCurta, fmtDur, fmtInt } from './calculos'

// Dashboard do cliente (04/11): tempo na loja, horários e lojas, calculados no
// banco a partir das NFs entregues (/api/dashboard-kpi/lojas).

export type LojaRank = { nome: string; visitas: number; media: number | null }
export type DadosLojas = {
  entregas: number
  comTempo: number
  tempoMedio: number | null
  tempoMediano: number | null
  lojasAtendidas: number
  /** Minutos desde 00:00 (média por carga). */
  primeiraEntrega: number | null
  ultimaEntrega: number | null
  faixas: { ate10: number; de10a20: number; de20a30: number; de30a60: number; acima60: number }
  porHora: { hora: number; entregas: number }[]
  porDia: { data: string; tempoMedio: number | null; lojas: number }[]
  maisTempo: LojaRank[]
  maisAtendidas: LojaRank[]
}

export function fmtHora(min: number | null | undefined): string {
  if (min == null) return '—'
  const m = Math.round(min)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Horas com entrega, de 5h a 21h, com zero onde não houve (o gráfico não pula hora). */
export function serieHoras(porHora: DadosLojas['porHora']): { hora: number; entregas: number }[] {
  const m = new Map(porHora.map(h => [h.hora, h.entregas]))
  const usadas = porHora.filter(h => h.entregas > 0).map(h => h.hora)
  const ini = Math.min(6, ...usadas.filter(h => h >= 5)), fim = Math.max(18, ...usadas.filter(h => h <= 21))
  const out = []
  for (let h = ini; h <= fim; h++) out.push({ hora: h, entregas: m.get(h) ?? 0 })
  return out
}

export function faixasTempo(f: DadosLojas['faixas']): BarItem[] {
  return [
    { key: 'a', label: 'Até 10 min', value: f.ate10, tone: 'success' },
    { key: 'b', label: '10 a 20 min', value: f.de10a20, tone: 'success' },
    { key: 'c', label: '20 a 30 min', value: f.de20a30, tone: 'info' },
    { key: 'd', label: '30 min a 1 hora', value: f.de30a60, tone: 'warning' },
    { key: 'e', label: 'Mais de 1 hora', value: f.acima60, tone: 'danger' },
  ]
}

function Card({ titulo, sub, children, className = '', direita }: { titulo: string; sub?: string; children: React.ReactNode; className?: string; direita?: React.ReactNode }) {
  return (
    <section className={`dash-card animate-fade-up p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-fg)]">{titulo}</h3>
          {sub && <p className="mt-0.5 text-[12px] text-[var(--color-fg-muted)]">{sub}</p>}
        </div>
        {direita}
      </div>
      {children}
    </section>
  )
}

export function HorariosETempo({ d }: { d: DadosLojas }) {
  const horas = serieHoras(d.porHora)
  const pico = horas.reduce((a, b) => (b.entregas > a.entregas ? b : a), horas[0] ?? { hora: 0, entregas: 0 })
  const total = d.comTempo
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card titulo="Entregas por horário" sub={pico?.entregas ? `Hora de chegada na loja · pico às ${pico.hora}h` : 'Hora de chegada na loja'} className="lg:col-span-3">
        <Colunas
          pontos={horas.map(h => ({ chave: String(h.hora), rotulo: `${h.hora}h`, valor: h.entregas }))}
          formatar={n => `${n.toLocaleString('pt-BR')} entregas`}
          altura={240}
        />
      </Card>
      <Card titulo="Tempo na loja" sub={`Quanto o caminhão ficou em cada entrega · mediana ${fmtDur(d.tempoMediano)}`} className="lg:col-span-2">
        {total > 0
          ? <BarList items={faixasTempo(d.faixas)} format={n => `${n.toLocaleString('pt-BR')} · ${Math.round((n / total) * 100)}%`} />
          : <p className="py-10 text-center text-[13px] text-[var(--color-fg-muted)]">Sem horário de entrega no período.</p>}
      </Card>
    </div>
  )
}

export function TempoPorDia({ d }: { d: DadosLojas }) {
  const pts = d.porDia.filter(x => x.tempoMedio != null)
  if (pts.length < 2) return null
  return (
    <Card titulo="Tempo médio na loja por dia" sub="Média das entregas do dia">
      <Colunas
        pontos={pts.map(x => ({ chave: x.data, rotulo: dataCurta(x.data), valor: x.tempoMedio }))}
        formatar={n => fmtDur(n)}
        altura={220}
      />
    </Card>
  )
}

export function RankingLojas({ d, umDia }: { d: DadosLojas; umDia: boolean }) {
  const [aba, setAba] = useState<'tempo' | 'visitas'>('tempo')
  const lista = aba === 'tempo' ? d.maisTempo : d.maisAtendidas
  const max = Math.max(1, ...lista.map(l => (aba === 'tempo' ? l.media ?? 0 : l.visitas)))
  return (
    <Card
      titulo="Lojas"
      sub={aba === 'tempo'
        ? 'Onde o caminhão fica mais tempo · média por loja'
        : 'Lojas com mais entregas no período'}
      direita={umDia ? undefined : (
        <div className="inline-flex shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5 text-[12px] font-medium">
          {(['tempo', 'visitas'] as const).map(a => (
            <button key={a} type="button" onClick={() => setAba(a)}
              className={`rounded-full px-3 py-1 transition-colors ${aba === a ? 'bg-[var(--color-navy-700)] text-white' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'}`}>
              {a === 'tempo' ? 'Mais tempo' : 'Mais entregas'}
            </button>
          ))}
        </div>
      )}
    >
      {lista.length === 0 ? <p className="py-10 text-center text-[13px] text-[var(--color-fg-muted)]">Sem lojas no período.</p> : (
        <ul className="flex flex-col gap-2.5">
          {lista.map(l => {
            const v = aba === 'tempo' ? l.media ?? 0 : l.visitas
            return (
              <li key={l.nome}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate font-semibold text-[var(--color-fg)]" title={l.nome}>{l.nome}</span>
                  <span className="shrink-0 tabular-nums">
                    <b className="font-semibold text-[var(--color-fg)]">{aba === 'tempo' ? fmtDur(l.media) : fmtInt(l.visitas)}</b>
                    <span className="text-[var(--color-fg-subtle)]"> {aba === 'tempo' ? `· ${fmtInt(l.visitas)} entrega${l.visitas === 1 ? '' : 's'}` : `entregas · ${fmtDur(l.media)}`}</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
                  <div className="h-full rounded-full bg-[var(--color-navy-700)]" style={{ width: `${(v / max) * 100}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
