'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  cn,
} from '@/components/ui'

type KpiDoDia = {
  kpi_id: string
  rede_id: string
  rede_nome: string
  status: string
  qtd_linhas: number
  qtd_anomalias_high: number
  qtd_anomalias_medium: number
  qtd_anomalias_low: number
  xlsx_path: string | null
  pdf_path: string | null
  gerada_em: string | null
}

type KpiLinha = {
  kpi_id: string
  escala_linha_id: string | null
  ordem: number
  loja_nome: string
  motorista: string | null
  placa: string | null
  carro_ordem: 1 | 2
  saida_cd: string | null
  chd_loja_1: string | null
  saida_loja_1: string | null
  tempo_loja_1_min: number | null
  chd_loja_2: string | null
  saida_loja_2: string | null
  tempo_loja_2_min: number | null
  chd_loja_3: string | null
  saida_loja_3: string | null
  tempo_loja_3_min: number | null
  observacao: string | null
}

type KpiDetalhe = {
  kpi: { id: string; data: string; rede_id: string; status: string }
  linhas: Array<Omit<KpiLinha, 'saida_cd' | 'chd_loja_1' | 'saida_loja_1' | 'chd_loja_2' | 'saida_loja_2' | 'chd_loja_3' | 'saida_loja_3'> & {
    saida_cd: string | null
    chd_loja_1: string | null
    saida_loja_1: string | null
    chd_loja_2: string | null
    saida_loja_2: string | null
    chd_loja_3: string | null
    saida_loja_3: string | null
  }>
  anomalias: { high: number; medium: number; low: number; pendentes: number }
}

type FiltroLinhas = 'todas' | 'com_anomalia' | 'sem_anomalia'

function fmtHora(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function linhaTemAnomalia(l: KpiDetalhe['linhas'][number]): boolean {
  return !!l.observacao && l.observacao.trim().length > 0
}

function severidadeFromObs(obs: string | null): 'HIGH' | 'MEDIUM' | 'LOW' | null {
  if (!obs) return null
  const upper = obs.toUpperCase()
  if (upper.includes('SEM_ENTREGA') || upper.includes('FORA_JANELA') || upper.includes('SEM_PARADA')) return 'HIGH'
  if (upper.includes('PARADA_CURTA') || upper.includes('PARADA_LONGA')) return 'MEDIUM'
  return 'LOW'
}

export function KpisGerados({
  data,
  refreshKey,
}: {
  data: string
  refreshKey: number
}) {
  const [kpis, setKpis] = useState<KpiDoDia[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<Record<string, KpiDetalhe>>({})
  const [loadingDetalhe, setLoadingDetalhe] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<FiltroLinhas>('todas')
  const [signedUrls, setSignedUrls] = useState<
    Record<string, { xlsx_url: string | null; pdf_url: string | null }>
  >({})
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let settled = false
    const t = setTimeout(() => {
      if (active && !settled) setLoading(true)
    }, 150)
    fetch(`/api/kpi/dia?data=${data}`)
      .then((res) => (res.ok ? (res.json() as Promise<KpiDoDia[]>) : Promise.resolve<KpiDoDia[]>([])))
      .then((rows) => {
        if (!active) return
        setKpis(rows ?? [])
        // Limpa caches relacionados ao dia/refresh
        setExpanded(null)
        setDetalhe({})
        setSignedUrls({})
      })
      .catch(() => {
        if (active) setKpis([])
      })
      .finally(() => {
        settled = true
        clearTimeout(t)
        if (active) setLoading(false)
      })
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [data, refreshKey])

  async function toggleExpand(kpiId: string) {
    if (expanded === kpiId) {
      setExpanded(null)
      return
    }
    setExpanded(kpiId)
    if (!detalhe[kpiId]) {
      setLoadingDetalhe(kpiId)
      try {
        const res = await fetch(`/api/kpi/${kpiId}`)
        if (res.ok) {
          const d = (await res.json()) as KpiDetalhe
          setDetalhe((prev) => ({ ...prev, [kpiId]: d }))
        }
      } finally {
        setLoadingDetalhe(null)
      }
    }
  }

  async function baixar(kpiId: string, tipo: 'xlsx' | 'pdf') {
    setDownloadingId(`${kpiId}:${tipo}`)
    try {
      let urls = signedUrls[kpiId]
      if (!urls) {
        // Chama /api/kpi/gerar — idempotente, retorna signed URLs frescas
        const res = await fetch('/api/kpi/gerar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kpi_id: kpiId }),
        })
        if (!res.ok) throw new Error(await res.text())
        urls = (await res.json()) as { xlsx_url: string | null; pdf_url: string | null }
        setSignedUrls((prev) => ({ ...prev, [kpiId]: urls! }))
      }
      const url = tipo === 'xlsx' ? urls.xlsx_url : urls.pdf_url
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      console.error('Falha ao baixar', e)
    } finally {
      setDownloadingId(null)
    }
  }

  if (loading && kpis.length === 0) {
    return (
      <Card>
        <CardContent>
          <div className="text-[12px] text-[var(--color-fg-muted)] py-2">
            Carregando KPIs do dia…
          </div>
        </CardContent>
      </Card>
    )
  }

  if (kpis.length === 0) return null

  return (
    <Card>
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
            KPIs Gerados
          </p>
          <Badge variant="default">{kpis.length}</Badge>
        </div>
      </div>

      <CardContent className="flex flex-col gap-2">
        {kpis.map((k) => {
          const isExpanded = expanded === k.kpi_id
          const det = detalhe[k.kpi_id]
          return (
            <div
              key={k.kpi_id}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]"
            >
              <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[13px] font-semibold text-[var(--color-fg)] truncate">
                    {k.rede_nome}
                  </span>
                  <span className="text-[11px] text-[var(--color-fg-muted)] tabular-nums">
                    {k.qtd_linhas} linha{k.qtd_linhas === 1 ? '' : 's'}
                  </span>
                  {k.qtd_anomalias_high > 0 && (
                    <Badge variant="danger">{k.qtd_anomalias_high} alta</Badge>
                  )}
                  {k.qtd_anomalias_medium > 0 && (
                    <Badge variant="warning">{k.qtd_anomalias_medium} média</Badge>
                  )}
                  {k.qtd_anomalias_low > 0 && (
                    <Badge variant="default">{k.qtd_anomalias_low} baixa</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExpand(k.kpi_id)}
                  >
                    {isExpanded ? 'Fechar' : 'Ver'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => baixar(k.kpi_id, 'xlsx')}
                    disabled={downloadingId === `${k.kpi_id}:xlsx`}
                  >
                    {downloadingId === `${k.kpi_id}:xlsx` ? '…' : '↓ XLSX'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => baixar(k.kpi_id, 'pdf')}
                    disabled={downloadingId === `${k.kpi_id}:pdf`}
                  >
                    {downloadingId === `${k.kpi_id}:pdf` ? '…' : '↓ PDF'}
                  </Button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
                  {loadingDetalhe === k.kpi_id && (
                    <div className="px-3 py-3 text-[12px] text-[var(--color-fg-muted)]">
                      Carregando linhas…
                    </div>
                  )}
                  {det && (
                    <DetalheLinhas
                      kpi={k}
                      det={det}
                      filtro={filtro}
                      setFiltro={setFiltro}
                      onBaixarFiltrado={(tipo) => {
                        // Filtro real no servidor é TODO.
                        // Por enquanto baixa o arquivo completo do KPI; o filtro
                        // só atua na visualização da tabela acima.
                        baixar(k.kpi_id, tipo)
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function DetalheLinhas({
  kpi,
  det,
  filtro,
  setFiltro,
  onBaixarFiltrado,
}: {
  kpi: KpiDoDia
  det: KpiDetalhe
  filtro: FiltroLinhas
  setFiltro: (f: FiltroLinhas) => void
  onBaixarFiltrado: (tipo: 'xlsx' | 'pdf') => void
}) {
  const linhasFiltradas = useMemo(() => {
    if (filtro === 'todas') return det.linhas
    if (filtro === 'com_anomalia') return det.linhas.filter(linhaTemAnomalia)
    return det.linhas.filter((l) => !linhaTemAnomalia(l))
  }, [det.linhas, filtro])

  const stats = useMemo(() => {
    const total = det.linhas.length
    const comAnom = det.linhas.filter(linhaTemAnomalia).length
    const sem = total - comAnom
    return { total, comAnom, sem }
  }, [det.linhas])

  const chips: Array<{ id: FiltroLinhas; label: string; count: number }> = [
    { id: 'todas', label: 'Todas', count: stats.total },
    { id: 'com_anomalia', label: 'Com anomalia', count: stats.comAnom },
    { id: 'sem_anomalia', label: 'Sem anomalia', count: stats.sem },
  ]

  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-1">
          {chips.map((c) => (
            <button
              key={c.id}
              onClick={() => setFiltro(c.id)}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer',
                filtro === c.id
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
                  : 'bg-[var(--color-bg)] text-[var(--color-fg-muted)] border border-[var(--color-border)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-hover)]',
              )}
            >
              {c.label}
              <span className="opacity-70 tabular-nums">({c.count})</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => onBaixarFiltrado('xlsx')}>
            ↓ XLSX
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onBaixarFiltrado('pdf')}>
            ↓ PDF
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px] tabular-nums">
          <thead className="bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)]">
            <tr>
              <Th>#</Th>
              <Th align="left">Loja</Th>
              <Th align="left">Motorista</Th>
              <Th>Placa</Th>
              <Th>Saída CD</Th>
              <Th>Par. 1</Th>
              <Th>Par. 2</Th>
              <Th>Par. 3</Th>
              <Th align="left">Anomalias</Th>
            </tr>
          </thead>
          <tbody>
            {linhasFiltradas.map((l) => {
              const sev = severidadeFromObs(l.observacao)
              const rowBg =
                sev === 'HIGH'
                  ? 'bg-[var(--color-danger-soft)]'
                  : sev === 'MEDIUM'
                    ? 'bg-[var(--color-warning-soft)]/60'
                    : ''
              return (
                <tr
                  key={`${l.kpi_id}-${l.ordem}-${l.carro_ordem}`}
                  className={cn(
                    'border-t border-[var(--color-border)]',
                    rowBg,
                    !rowBg && 'hover:bg-[var(--color-bg-hover)]',
                  )}
                >
                  <Td>{l.ordem}</Td>
                  <Td align="left" className="font-medium text-[var(--color-fg)] max-w-[180px] truncate">
                    {l.loja_nome}
                  </Td>
                  <Td align="left" className="max-w-[140px] truncate">
                    {l.motorista ?? '—'}
                  </Td>
                  <Td className="font-mono text-[10.5px]">{l.placa ?? '—'}</Td>
                  <Td>{fmtHora(l.saida_cd)}</Td>
                  <ParadaCell
                    chegada={l.chd_loja_1}
                    saida={l.saida_loja_1}
                    min={l.tempo_loja_1_min}
                  />
                  <ParadaCell
                    chegada={l.chd_loja_2}
                    saida={l.saida_loja_2}
                    min={l.tempo_loja_2_min}
                  />
                  <ParadaCell
                    chegada={l.chd_loja_3}
                    saida={l.saida_loja_3}
                    min={l.tempo_loja_3_min}
                  />
                  <Td align="left" className="max-w-[200px] truncate text-[var(--color-fg-muted)]">
                    {l.observacao ?? '—'}
                  </Td>
                </tr>
              )
            })}
            {linhasFiltradas.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-4 text-center text-[12px] text-[var(--color-fg-subtle)]"
                >
                  Nenhuma linha nesse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-3 py-2 text-[10px] text-[var(--color-fg-subtle)] border-t border-[var(--color-border)] flex items-center justify-between">
        <span>
          {linhasFiltradas.length} de {stats.total} linha
          {stats.total === 1 ? '' : 's'} · KPI {kpi.kpi_id.slice(0, 8)}
        </span>
        <span>
          {/* TODO(server-filter): hoje download ignora o filtro acima e retorna sempre o KPI completo. Pra suportar export filtrado precisaria de endpoint que aceite lista de escala_linha_id. */}
          Download retorna sempre o arquivo completo do KPI.
        </span>
      </div>
    </div>
  )
}

function Th({
  children,
  align = 'center',
}: {
  children: React.ReactNode
  align?: 'left' | 'center' | 'right'
}) {
  return (
    <th
      scope="col"
      className={cn(
        'px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap',
        align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center',
      )}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align = 'center',
  className,
}: {
  children: React.ReactNode
  align?: 'left' | 'center' | 'right'
  className?: string
}) {
  return (
    <td
      className={cn(
        'px-2 py-1.5 text-[var(--color-fg)] whitespace-nowrap',
        align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center',
        className,
      )}
    >
      {children}
    </td>
  )
}

function ParadaCell({
  chegada,
  saida,
  min,
}: {
  chegada: string | null
  saida: string | null
  min: number | null
}) {
  if (!chegada && !saida && min == null)
    return <Td className="text-[var(--color-fg-subtle)]">—</Td>
  return (
    <Td>
      <span className="inline-flex flex-col leading-tight">
        <span>
          {fmtHora(chegada)}
          <span className="text-[var(--color-fg-subtle)] mx-0.5">→</span>
          {fmtHora(saida)}
        </span>
        {min != null && (
          <span className="text-[9.5px] text-[var(--color-fg-muted)]">{min}min</span>
        )}
      </span>
    </Td>
  )
}
