'use client'

import { FileArrowDown, Truck } from '@phosphor-icons/react/dist/ssr'
import { cn } from '@/components/ui'
import { StatusBadge } from './status-badge'
import type { RedeManual } from '@/lib/kpi/manual-tipos'

/** As tabelas do KPI Manual, uma por rede — usado tanto na tela autenticada
 *  (/painel/kpi/visualizar) quanto no link público (/kpi-publico/[token]).
 *  Colunas/ordem seguem o mesmo XLSX que a operação já usa (ver
 *  gerar-xlsx-manual.ts): Loja, Motorista, Placa, Saída CD, CHD, Saída,
 *  Chegada CD (só se a REDE tiver esse dado nesse dia). Status vem como
 *  badge extra — no Excel ele substitui a placa, aqui mostra os dois. */
export function KpiManualCards({
  redes,
  data,
  mostrarBaixarXlsx = true,
  onVerSomenteEsta,
}: {
  redes: RedeManual[]
  data: string
  mostrarBaixarXlsx?: boolean
  onVerSomenteEsta?: (redeId: string) => void
}) {
  return (
    <div className="flex flex-col gap-6">
      {redes.map(rede => {
        const temVoltaBase = rede.linhas.some(l => l.volta_base != null)
        return (
          <div
            key={rede.rede_id}
            className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-3">
              <div className="flex items-center gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-fg)]">
                  <Truck size={16} weight="fill" className="text-[var(--color-accent)]" />
                  {rede.rede_nome}
                </h2>
                <span className="text-[12px] text-[var(--color-fg-muted)]">{rede.linhas.length} loja(s)</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {onVerSomenteEsta && redes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onVerSomenteEsta(rede.rede_id)}
                    className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-2 text-[12.5px] font-medium text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-fg)]"
                  >
                    Ver só esta
                  </button>
                )}
                {mostrarBaixarXlsx && (
                  <a
                    href={`/api/kpi-manual/export?rede=${rede.rede_id}&data=${data}`}
                    className="flex items-center gap-1.5 rounded-full bg-[var(--color-navy-700)] px-4 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
                  >
                    <FileArrowDown size={14} weight="bold" />
                    Baixar XLSX
                  </a>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] text-left">
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">Loja</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] hidden sm:table-cell">Motorista</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">Placa</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">Status</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] hidden md:table-cell">Saída CD</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] hidden md:table-cell">Chegada Loja</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] hidden md:table-cell">Saída Loja</th>
                    {temVoltaBase && (
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] hidden md:table-cell">Chegada CD</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {(() => {
                    // Uma loja pode ter mais de uma linha no mesmo dia (dois
                    // veículos, duas viagens) — não são consecutivas na ordem
                    // de lançamento, então marca por contagem, não por vizinhança.
                    const porLoja = new Map<string, number>()
                    for (const l of rede.linhas) porLoja.set(l.loja, (porLoja.get(l.loja) ?? 0) + 1)
                    const vistos = new Map<string, number>()
                    return rede.linhas.map((l, i) => {
                      const total = porLoja.get(l.loja) ?? 1
                      const ordem = (vistos.get(l.loja) ?? 0) + 1
                      vistos.set(l.loja, ordem)
                      return (
                        <tr key={`${l.loja}-${i}`} className="hover:bg-[var(--color-bg-hover)]">
                          <td className="px-4 py-2 text-[var(--color-fg)]">
                            {l.loja}
                            {total > 1 && (
                              <span className="ml-1.5 text-[10.5px] font-medium text-[var(--color-fg-subtle)]">
                                · veículo {ordem}/{total}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-[var(--color-fg-muted)] hidden sm:table-cell">{l.motorista ?? '—'}</td>
                          <td className="px-4 py-2 text-numeric text-[var(--color-fg)]">{l.placa ?? '—'}</td>
                          <td className="px-4 py-2">
                            <StatusBadge status={l.status} />
                          </td>
                          <td className="px-4 py-2 text-numeric text-[var(--color-fg-muted)] hidden md:table-cell">{l.saida_cd ?? '—'}</td>
                          <td className="px-4 py-2 text-numeric text-[var(--color-fg-muted)] hidden md:table-cell">{l.chd ?? '—'}</td>
                          <td className="px-4 py-2 text-numeric text-[var(--color-fg-muted)] hidden md:table-cell">{l.sai ?? '—'}</td>
                          {temVoltaBase && (
                            <td className="px-4 py-2 text-numeric text-[var(--color-fg-muted)] hidden md:table-cell">{l.volta_base ?? '—'}</td>
                          )}
                        </tr>
                      )
                    })
                  })()}
                  {rede.linhas.length === 0 && (
                    <tr>
                      <td colSpan={temVoltaBase ? 8 : 7} className={cn('px-4 py-8 text-center text-[var(--color-fg-subtle)]')}>
                        Nenhuma loja nesta rede.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
