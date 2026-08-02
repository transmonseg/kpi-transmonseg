'use client'

import { useEffect, useState } from 'react'
import { WarningCircle, FileArrowDown, Truck } from '@phosphor-icons/react/dist/ssr'
import { STATUS_LABEL, TIER_STYLE, tierEfetivo, type StatusRota, type CategoriaRevisao } from '@/lib/kpi/status-rota'
import { cn } from '@/components/ui'

type PreviewLinha = {
  ordem: number
  loja_nome: string
  placa: string | null
  motorista: string | null
  turno: string
  saida_cd_fmt: string | null
  chegada_loja_fmt: string | null
  saida_loja_fmt: string | null
  status: StatusRota
  revisar: boolean
  categoria: CategoriaRevisao | null
}

type RedeResult = {
  rede_id: string
  rede_nome: string
  qtd_rotas: number
  qtd_sem_gps: number
  xlsxBase64: string
  preview: PreviewLinha[]
}

function baixarXlsx(base64: string, nome: string) {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

function StatusBadge({ status, revisar, categoria }: { status: StatusRota; revisar: boolean; categoria: CategoriaRevisao | null }) {
  const t = TIER_STYLE[tierEfetivo({ status, revisar, categoria })]
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap"
      style={{ background: t.bg, color: t.fg }}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

export default function VisualizarKpiPage() {
  const [redes, setRedes] = useState<RedeResult[] | null>(null)
  const [data, setData] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('geracao')
    if (!id) {
      setErro('Link inválido — falta o identificador da geração.')
      setCarregando(false)
      return
    }
    ;(async () => {
      try {
        const res = await fetch('/api/kpi/simples/regerar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id }),
        })
        if (!res.ok) throw new Error(await res.text())
        const json = await res.json() as { redes: RedeResult[]; data?: string }
        setRedes(json.redes)
        setData(json.data ?? null)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar essa geração.')
      } finally {
        setCarregando(false)
      }
    })()
  }, [])

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <header className="mb-8 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          KPI Transmonseg
        </span>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-fg)] md:text-[34px]">
          {data ? `KPI do dia ${data.split('-').reverse().join('/')}` : 'Visualizar KPI'}
        </h1>
      </header>

      {carregando && (
        <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-4">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--color-fg-subtle)] border-t-transparent" />
          <p className="text-[13px] text-[var(--color-fg-muted)]">Carregando…</p>
        </div>
      )}

      {erro && (
        <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-5 py-4">
          <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
          <p className="text-[13px] leading-relaxed text-[var(--color-danger-soft-fg)]">{erro}</p>
        </div>
      )}

      {redes && (
        <div className="flex flex-col gap-6">
          {redes.map(rede => (
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
                  <span className="text-[12px] text-[var(--color-fg-muted)]">
                    {rede.qtd_rotas} rota(s){rede.qtd_sem_gps > 0 ? ` · ${rede.qtd_sem_gps} sem GPS` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => baixarXlsx(rede.xlsxBase64, `KPI-${rede.rede_nome}-${data ?? ''}.xlsx`)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-navy-700)] px-4 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
                >
                  <FileArrowDown size={14} weight="bold" />
                  Baixar XLSX
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] text-left">
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">Loja</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">Status</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">Placa</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] hidden sm:table-cell">Motorista</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] hidden md:table-cell">Saída CD</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] hidden md:table-cell">Ch. Loja</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] hidden md:table-cell">Saída Loja</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {rede.preview.map(linha => (
                      <tr key={linha.ordem} className="hover:bg-[var(--color-bg-hover)]">
                        <td className="px-4 py-2 text-[var(--color-fg)]">{linha.loja_nome}</td>
                        <td className="px-4 py-2">
                          <StatusBadge status={linha.status} revisar={linha.revisar} categoria={linha.categoria} />
                        </td>
                        <td className="px-4 py-2 text-numeric text-[var(--color-fg)]">{linha.placa ?? '—'}</td>
                        <td className="px-4 py-2 text-[var(--color-fg-muted)] hidden sm:table-cell">{linha.motorista ?? '—'}</td>
                        <td className="px-4 py-2 text-numeric text-[var(--color-fg-muted)] hidden md:table-cell">{linha.saida_cd_fmt ?? '—'}</td>
                        <td className="px-4 py-2 text-numeric text-[var(--color-fg-muted)] hidden md:table-cell">{linha.chegada_loja_fmt ?? '—'}</td>
                        <td className="px-4 py-2 text-numeric text-[var(--color-fg-muted)] hidden md:table-cell">{linha.saida_loja_fmt ?? '—'}</td>
                      </tr>
                    ))}
                    {rede.preview.length === 0 && (
                      <tr>
                        <td colSpan={7} className={cn('px-4 py-8 text-center text-[var(--color-fg-subtle)]')}>
                          Nenhuma rota nesta rede.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {redes.length === 0 && (
            <p className="text-[13px] text-[var(--color-fg-muted)]">Nenhuma rede encontrada nessa geração.</p>
          )}
        </div>
      )}
    </div>
  )
}
