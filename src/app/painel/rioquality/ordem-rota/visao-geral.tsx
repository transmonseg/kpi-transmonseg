'use client'

// 14/11 (Érica: "imagina ter que abrir para fazer análise de 100 carros"):
// todas as viagens de uma vez, uma linha por placa, cada entrega um quadrinho
// com o número que ela tinha no plano, na ordem em que foi feita. Azul = na
// ordem, laranja = fora; tracejado no fim = planejada e não entregue.
import { useState } from 'react'
import type { Viagem } from '@/lib/kpi-romaneio/relatorio-ordem-rota'

const META = 70
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const p0 = (x: number) => `${x.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`
type Ordem = 'pior' | 'placa' | 'saida'

export function VisaoGeral({ itens, aberta, onAbrir, varios }: { itens: Viagem[]; aberta: Viagem | null; onAbrir: (v: Viagem) => void; varios: boolean }) {
  const [ordem, setOrdem] = useState<Ordem>('pior')
  const lista = [...itens].sort((a, b) =>
    ordem === 'placa' ? a.placa.localeCompare(b.placa) || a.data.localeCompare(b.data)
      : ordem === 'saida' ? a.data.localeCompare(b.data) || (a.primeira ?? '99').localeCompare(b.primeira ?? '99')
        : a.pct - b.pct || b.entregas - a.entregas)
  return (
    <section className="dash-card flex min-w-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="text-[14px] font-semibold text-[var(--color-fg)]">Todas as viagens <span className="font-medium text-[var(--color-fg-subtle)]">({itens.length})</span></h2>
        <span className="flex flex-wrap items-center gap-3 text-[11.5px] text-[var(--color-fg-muted)]">
          <span className="inline-flex items-center gap-1.5"><Quadro tipo="ok" n={3} />na ordem</span>
          <span className="inline-flex items-center gap-1.5"><Quadro tipo="fora" n={7} />fora da ordem</span>
          <span className="inline-flex items-center gap-1.5"><Quadro tipo="nao" n={9} />não entregue</span>
          <span>O número é a posição no plano; a fila é a ordem em que o caminhão chegou.</span>
        </span>
        <div role="radiogroup" aria-label="Ordenar" className="ml-auto inline-flex rounded-full bg-[var(--color-bg-subtle)] p-0.5">
          {([['pior', 'Pior primeiro'], ['saida', 'Horário'], ['placa', 'Placa']] as const).map(([v, rot]) => (
            <button key={v} type="button" role="radio" aria-checked={ordem === v} onClick={() => setOrdem(v)}
              className={`h-7 rounded-full px-3 text-[12px] font-semibold transition-colors ${ordem === v ? 'bg-[var(--color-bg-elevated)] text-[var(--color-fg)] shadow-sm' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'}`}>{rot}</button>
          ))}
        </div>
      </div>
      {lista.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-[var(--color-fg-muted)]">Nenhuma viagem encontrada.</p>
      ) : (
        <ul className="max-h-[720px] overflow-y-auto">
          {lista.map(v => {
            const ativa = aberta?.romaneio === v.romaneio && aberta.data === v.data
            return (
              <li key={`${v.data}-${v.romaneio}`}>
                <button type="button" onClick={() => onAbrir(v)} aria-current={ativa ? 'true' : undefined} title="Abrir a viagem"
                  className={`grid w-full grid-cols-1 gap-2 border-b border-[var(--color-border)] px-4 py-2.5 text-left transition-colors md:grid-cols-[190px_minmax(0,1fr)_92px] md:items-center md:gap-4 ${ativa ? 'bg-[var(--color-bg-subtle)] shadow-[inset_3px_0_0_var(--color-navy-700)]' : 'hover:bg-[var(--color-bg-subtle)]'}`}>
                  <span className="flex min-w-0 items-baseline justify-between gap-2 md:flex-col md:items-start md:gap-0.5">
                    <span className="text-[13px] font-semibold text-[var(--color-fg)]">{v.placa}{varios && <span className="ml-1.5 text-[11px] font-medium text-[var(--color-fg-subtle)]">{br(v.data)}</span>}</span>
                    <span className="min-w-0 max-w-full truncate text-[11.5px] text-[var(--color-fg-muted)]" title={v.motorista}>{v.motorista}{v.primeira ? ` · ${v.primeira}–${v.ultima}` : ''}</span>
                  </span>
                  <span className="flex flex-wrap gap-[3px]">
                    {v.sequencia.map(s => (
                      <Quadro key={s.real} tipo={s.naOrdem ? 'ok' : 'fora'} n={s.planejada}
                        dica={`${s.real}ª entrega feita · era a ${s.planejada}ª no plano${s.chegada ? ` · chegou ${s.chegada}` : ''} · ${s.cliente}`} />
                    ))}
                    {v.naoFeitasLista.map(f => <Quadro key={`n${f.planejada}-${f.nf}`} tipo="nao" n={f.planejada} dica={`Não entregue · era a ${f.planejada}ª no plano · ${f.cliente}`} />)}
                  </span>
                  <span className="flex items-baseline justify-between gap-2 md:flex-col md:items-end md:gap-0">
                    <span className={`text-[15px] font-semibold tabular-nums ${v.pct < META ? 'text-[var(--color-warning)]' : 'text-[var(--color-fg)]'}`}>{p0(v.pct)}</span>
                    <span className="text-[11px] tabular-nums text-[var(--color-fg-muted)]">{v.naOrdem}/{v.entregas} na ordem</span>
                    {v.invertida && <span className="whitespace-nowrap text-[10.5px] font-semibold text-[var(--color-warning)]">de trás pra frente</span>}
                    <KmSelo km={v.kmExtra} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function Quadro({ tipo, n, dica }: { tipo: 'ok' | 'fora' | 'nao'; n: number; dica?: string }) {
  const cls = tipo === 'ok'
    ? 'bg-[var(--color-navy-700)] text-white'
    : tipo === 'fora'
      ? 'bg-[var(--color-warning)] text-white'
      : 'border border-dashed border-[var(--color-fg-subtle)] text-[var(--color-fg-subtle)]'
  return (
    <span title={dica} className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[5px] px-1 text-[10.5px] font-semibold tabular-nums ${cls}`}>{n}</span>
  )
}

/** Fila de entregas enxuta (Dashboard): posição no plano na ordem feita. */
export function Fila({ fila, naoFeitas }: { fila: [number, boolean][]; naoFeitas: number[] }) {
  return (
    <span className="flex flex-wrap gap-[3px]">
      {fila.map(([p, ok], i) => <Quadro key={i} tipo={ok ? 'ok' : 'fora'} n={p} dica={`${i + 1}ª entrega feita · era a ${p}ª no plano`} />)}
      {naoFeitas.map(p => <Quadro key={`n${p}`} tipo="nao" n={p} dica={`Não entregue · era a ${p}ª no plano`} />)}
    </span>
  )
}

export function LegendaOrdem() {
  return (
    <span className="flex flex-wrap items-center gap-3 text-[11.5px] text-[var(--color-fg-muted)]">
      <span className="inline-flex items-center gap-1.5"><Quadro tipo="ok" n={3} />na ordem</span>
      <span className="inline-flex items-center gap-1.5"><Quadro tipo="fora" n={7} />fora da ordem</span>
      <span className="inline-flex items-center gap-1.5"><Quadro tipo="nao" n={9} />não entregue</span>
    </span>
  )
}

/** Recorrência: um tracinho por dia (altura = % na ordem; laranja abaixo da meta). */
export function DiasMini({ porDia }: { porDia: { data: string; pct: number }[] }) {
  if (porDia.length < 2) return null
  return (
    <span className="inline-flex h-4 items-end gap-[2px]" aria-label="% na ordem por dia">
      {porDia.slice(-20).map(d => (
        <span key={d.data} title={`${d.data.slice(8, 10)}/${d.data.slice(5, 7)}: ${Math.round(d.pct)}%`} className="w-[4px] rounded-[1px]"
          style={{ height: `${Math.max(15, d.pct)}%`, background: d.pct < META ? 'var(--color-warning)' : 'var(--color-navy-700)' }} />
      ))}
    </span>
  )
}

export const kmTxt = (x: number) => `${Math.abs(x).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`

/** Km x plano: laranja = andou mais que a ordem do plano; verde = caminho mais curto. */
export function KmSelo({ km }: { km: number | null }) {
  if (km == null || Math.abs(km) < 1) return null
  return (
    <span className="whitespace-nowrap text-[10.5px] font-semibold tabular-nums" style={{ color: km > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}
      title={km > 0 ? 'Andou mais que se seguisse a ordem do plano (linha reta entre os clientes)' : 'Fez um caminho mais curto que a ordem do plano (linha reta entre os clientes)'}>
      {kmTxt(km)} {km > 0 ? 'a mais' : 'a menos'}
    </span>
  )
}
