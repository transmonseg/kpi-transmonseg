'use client'

import { Fragment, useMemo, useState } from 'react'
import { CaretDown, CaretRight, CaretUpDown, MagnifyingGlass } from '@phosphor-icons/react/dist/ssr'
import {
  dataCurta, fmtInt, fmtPct, tom, COR_TOM,
  type AgruparPor, type GrupoAgg, type GrupoSemana, type Recorrente,
} from './calculos'

// F3-10 (ACH-08): Dashboard por rota e por motorista. Mesma tabela da aba
// "Por placa" (taxa, NFs, dias), mais as placas que rodaram, a tendência
// semanal e o dia a dia ao abrir a linha.

export type Visao = 'placa' | AgruparPor

export function SeletorVisao({ visao, onTrocar }: { visao: Visao; onTrocar: (v: Visao) => void }) {
  return (
    <div role="tablist" aria-label="Agrupar por" className="inline-flex h-9 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-0.5 shadow-soft">
      {([['placa', 'Por placa'], ['rota', 'Por rota'], ['motorista', 'Por motorista']] as [Visao, string][]).map(([v, rotulo]) => (
        <button
          key={v} type="button" role="tab" aria-selected={visao === v} onClick={() => onTrocar(v)}
          className={`h-8 rounded-[var(--radius-sm)] px-3.5 text-[12px] font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.97] ${visao === v ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)] shadow-soft' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'}`}
        >{rotulo}</button>
      ))}
    </div>
  )
}

/** Tendência semanal: linha navy (cor única) + taxa da última semana e a
 *  diferença para a anterior. */
export function Tendencia({ semanas }: { semanas: GrupoSemana[] }) {
  const s = semanas.filter(x => x.taxa != null)
  if (s.length === 0) return <span className="text-[var(--color-fg-subtle)]">—</span>
  const ult = s[s.length - 1], ant = s.length > 1 ? s[s.length - 2] : null
  const vals = s.map(x => x.taxa as number)
  const min = Math.min(...vals), max = Math.max(...vals)
  const pts = s.map((x, i) => `${s.length === 1 ? 30 : (i / (s.length - 1)) * 60},${18 - (((x.taxa as number) - min) / (max - min || 1)) * 14}`).join(' ')
  const d = ant ? (ult.taxa as number) - (ant.taxa as number) : null
  const dica = s.map(x => `semana de ${dataCurta(x.semana)}: ${fmtPct(x.taxa)} (${x.nfConfirmadas}/${x.naConta})`).join('\n')
  return (
    <span className="inline-flex items-center gap-2" title={dica}>
      <svg viewBox="0 0 60 20" className="h-5 w-[60px] shrink-0 overflow-visible" aria-hidden>
        {s.length > 1 && <polyline points={pts} fill="none" stroke="var(--color-navy-700)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        {pts.split(' ').slice(-1).map(p => { const [x, y] = p.split(',').map(Number); return <circle key="u" cx={x} cy={y} r="2" fill="var(--color-navy-700)" /> })}
      </svg>
      <span className="whitespace-nowrap text-[12px] tabular-nums text-[var(--color-fg-muted)]">
        {d == null ? `${s.length} sem.` : `${d >= 0 ? '+' : '−'}${Math.abs(d).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pts`}
      </span>
    </span>
  )
}

/** "Piores rotas recorrentes": abaixo da meta em pelo menos 3 dos últimos 5 dias da rota. */
export function PioresRecorrentes({ lista, meta, onAbrir }: { lista: Recorrente[]; meta: number; onAbrir: (chave: string) => void }) {
  const [todas, setTodas] = useState(false)
  if (!lista.length) {
    return <p className="px-5 pb-4 text-[13px] text-[var(--color-fg-muted)]">Nenhuma rota abaixo da meta em 3 dos últimos 5 dias.</p>
  }
  const visiveis = todas ? lista : lista.slice(0, 6)
  return (
    <div className="px-5 pb-4">
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visiveis.map(({ grupo, abaixo, ultimos }) => (
          <li key={grupo.chave}>
            <button type="button" onClick={() => onAbrir(grupo.chave)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-2.5 text-left transition-colors hover:border-[var(--color-border-strong)]">
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <b className="min-w-0 truncate font-semibold text-[var(--color-fg)]">{grupo.nome}</b>
                <span className="shrink-0 font-semibold tabular-nums" style={{ color: COR_TOM[tom(grupo.taxa, meta)] }}>{fmtPct(grupo.taxa)}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="flex gap-1" aria-label={`abaixo da meta em ${abaixo} dos últimos ${ultimos.length} dias`}>
                  {ultimos.map(u => (
                    <span key={u.data} title={`${dataCurta(u.data)}: ${fmtPct(u.taxa)} (${u.placas.join(', ')})`}
                      className={`size-2.5 rounded-full ${(u.taxa as number) < meta ? 'bg-[var(--color-navy-700)]' : 'border border-[var(--color-border-strong)]'}`} />
                  ))}
                </span>
                <span className="text-[12px] text-[var(--color-fg-muted)]">{abaixo} de {ultimos.length} dias abaixo · {grupo.placas.length} {grupo.placas.length === 1 ? 'placa' : 'placas'}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {lista.length > 6 && (
        <button type="button" onClick={() => setTodas(t => !t)} className="mt-2 text-[12px] font-medium text-[var(--color-accent)]">
          {todas ? 'Mostrar menos' : `Ver todas (${lista.length})`}
        </button>
      )}
    </div>
  )
}

type Col = 'nome' | 'taxa' | 'nfs' | 'dias' | 'placas'

export function TabelaGrupos({ grupos, por, umDia, meta, aberto, onAbrir }: {
  grupos: GrupoAgg[]
  por: AgruparPor
  umDia: boolean
  meta: number
  aberto: string | null
  onAbrir: (chave: string | null) => void
}) {
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<{ col: Col; desc: boolean }>({ col: 'taxa', desc: false })
  const rotulo = por === 'rota' ? 'Rota' : 'Motorista'
  const rotuloOutros = por === 'rota' ? 'motoristas' : 'rotas'
  const linhas = useMemo(() => {
    const b = busca.trim().toUpperCase()
    const f = grupos.filter(g => !b || g.nome.toUpperCase().includes(b) || g.placas.some(p => p.includes(b)) || g.outros.some(o => o.toUpperCase().includes(b)))
    const v = (g: GrupoAgg): number | string => {
      switch (ordem.col) {
        case 'nome': return g.nome
        case 'taxa': return g.taxa ?? -1
        case 'nfs': return g.nfPlanejado
        case 'dias': return g.dias
        case 'placas': return g.placas.length
      }
    }
    return f.sort((a, c) => {
      const x = v(a), y = v(c)
      const r = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)
      return ordem.desc ? -r : r
    })
  }, [grupos, busca, ordem])

  const th = (col: Col, txt: string, dir = false) => (
    <th className={`whitespace-nowrap px-4 py-2.5 font-medium ${dir ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={() => setOrdem(o => ({ col, desc: o.col === col ? !o.desc : col !== 'nome' && col !== 'taxa' }))}
        className={`inline-flex items-center gap-1 transition-colors hover:text-[var(--color-fg)] ${ordem.col === col ? 'text-[var(--color-fg)]' : ''}`}>
        {txt}<CaretUpDown size={11} className={ordem.col === col ? 'opacity-100' : 'opacity-40'} />
      </button>
    </th>
  )
  const colunas = 5 + (umDia ? 0 : 2)

  return (
    <div>
      <div className="px-5 pb-3">
        <label className="flex h-9 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 text-[13px] focus-within:border-[var(--color-accent)]">
          <MagnifyingGlass size={14} className="text-[var(--color-fg-subtle)]" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder={por === 'rota' ? 'Buscar rota, placa ou motorista' : 'Buscar motorista, placa ou rota'} className="w-full bg-transparent outline-none placeholder:text-[var(--color-fg-subtle)]" />
        </label>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead className="sticky top-0 z-[1] bg-[var(--color-bg-elevated)] text-[12px] text-[var(--color-fg-muted)]">
            <tr className="border-y border-[var(--color-border)]">
              {th('nome', rotulo)}
              {th('taxa', 'Taxa')}
              {th('nfs', 'NFs', true)}
              {!umDia && th('dias', 'Dias', true)}
              {th('placas', 'Placas')}
              {!umDia && <th className="whitespace-nowrap px-4 py-2.5 text-left font-medium">Tendência semanal</th>}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {linhas.map(g => {
              const t = tom(g.taxa, meta)
              const abertoAqui = aberto === g.chave
              return (
                <Fragment key={g.chave}>
                  <tr onClick={() => onAbrir(abertoAqui ? null : g.chave)} aria-expanded={abertoAqui}
                    className={`group cursor-pointer border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-subtle)] ${abertoAqui ? 'bg-[var(--color-bg-subtle)]' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[var(--color-fg)]">{g.nome}</div>
                      <div className="max-w-[260px] truncate text-[12px] text-[var(--color-fg-muted)]">{g.outros.length ? `${g.outros.length} ${g.outros.length === 1 ? rotuloOutros.slice(0, -1) : rotuloOutros}: ${g.outros.join(', ')}` : '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-14 text-right font-semibold tabular-nums" style={{ color: COR_TOM[t] }}>{fmtPct(g.taxa)}</span>
                        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
                          <span className="block h-full rounded-full" style={{ width: `${Math.min(100, g.taxa ?? 0)}%`, background: COR_TOM[t] }} />
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {fmtInt(g.nfConfirmadas)}<span className="text-[var(--color-fg-subtle)]">/{fmtInt(g.nfPlanejado - g.nfForaDaConta)}</span>
                    </td>
                    {!umDia && <td className="px-4 py-3 text-right tabular-nums">{g.dias}</td>}
                    <td className="px-4 py-3">
                      <span className="tabular-nums">{g.placas.length}</span>
                      <span className="ml-1.5 text-[12px] text-[var(--color-fg-muted)]">{g.placas.slice(0, 4).join(', ')}{g.placas.length > 4 ? '…' : ''}</span>
                    </td>
                    {!umDia && <td className="px-4 py-3"><Tendencia semanas={g.semanas} /></td>}
                    <td className="pr-4 text-[var(--color-fg-subtle)]">{abertoAqui ? <CaretDown size={14} /> : <CaretRight size={14} className="transition-transform group-hover:translate-x-0.5" />}</td>
                  </tr>
                  {abertoAqui && (
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)]/60">
                      <td colSpan={colunas} className="px-4 pb-4 pt-1">
                        <DiaADia grupo={g} meta={meta} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {linhas.length === 0 && (
              <tr><td colSpan={colunas} className="px-4 py-10 text-center text-[13px] text-[var(--color-fg-muted)]">Nada encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DiaADia({ grupo, meta }: { grupo: GrupoAgg; meta: number }) {
  const dias = [...grupo.porDia].reverse()
  return (
    <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
      {dias.map(d => (
        <div key={d.data} className="flex items-baseline justify-between gap-2 rounded-[var(--radius-sm)] bg-[var(--color-bg-elevated)] px-3 py-2 text-[12px]">
          <span className="min-w-0 truncate"><b className="font-semibold text-[var(--color-fg)]">{dataCurta(d.data)}</b> <span className="text-[var(--color-fg-muted)]">· {d.placas.join(', ') || '—'}</span></span>
          <span className="shrink-0 tabular-nums">
            <span className="font-semibold" style={{ color: COR_TOM[tom(d.taxa, meta)] }}>{fmtPct(d.taxa)}</span>
            <span className="ml-1 text-[var(--color-fg-subtle)]">{d.nfConfirmadas}/{d.naConta}</span>
          </span>
        </div>
      ))}
    </div>
  )
}
