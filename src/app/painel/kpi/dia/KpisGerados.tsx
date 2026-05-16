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
  anomalias_codigos: string[]
}

type KpiDetalhe = {
  kpi: { id: string; data: string; rede_id: string; status: string }
  linhas: KpiLinha[]
  anomalias: { high: number; medium: number; low: number; pendentes: number }
}

type FiltroLinhas = 'todas' | 'com_anomalia' | 'sem_anomalia'

// Edições locais por kpi_id → escala_linha_id → campos
type EditMap = Record<string, Record<string, { motorista?: string; placa?: string }>>

const SEM_VALOR = '—'

function fmtHora(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const HIGH_CODES = new Set(['ANOM-01', 'ANOM-04', 'ANOM-06', 'ANOM-07'])
const MEDIUM_CODES = new Set(['ANOM-03', 'ANOM-05', 'ANOM-08', 'ANOM-10', 'ANOM-11'])

function severidadeDaCodigos(codigos: string[]): 'HIGH' | 'MEDIUM' | 'LOW' | null {
  if (codigos.length === 0) return null
  if (codigos.some((c) => HIGH_CODES.has(c))) return 'HIGH'
  if (codigos.some((c) => MEDIUM_CODES.has(c))) return 'MEDIUM'
  return 'LOW'
}

function linhaTemAnomalia(l: KpiLinha): boolean {
  return l.anomalias_codigos.length > 0
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
  const [filtros, setFiltros] = useState<Record<string, FiltroLinhas>>({})
  const [editMap, setEditMap] = useState<EditMap>({})
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erroSalvar, setErroSalvar] = useState<Record<string, string>>({})
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
        setExpanded(null)
        setDetalhe({})
        setSignedUrls({})
        setEditMap({})
        setErroSalvar({})
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

  async function carregarDetalhe(kpiId: string) {
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

  async function toggleExpand(kpiId: string) {
    if (expanded === kpiId) {
      setExpanded(null)
      return
    }
    setExpanded(kpiId)
    if (!detalhe[kpiId]) {
      await carregarDetalhe(kpiId)
    }
  }

  function editarCelula(
    kpiId: string,
    escalaLinhaId: string,
    campo: 'motorista' | 'placa',
    valor: string,
  ) {
    setEditMap((prev) => ({
      ...prev,
      [kpiId]: {
        ...(prev[kpiId] ?? {}),
        [escalaLinhaId]: {
          ...(prev[kpiId]?.[escalaLinhaId] ?? {}),
          [campo]: valor,
        },
      },
    }))
  }

  function hasEdits(kpiId: string): boolean {
    const edits = editMap[kpiId]
    return !!edits && Object.keys(edits).length > 0
  }

  async function salvarEReGerar(kpi: KpiDoDia) {
    const edits = editMap[kpi.kpi_id]
    if (!edits) return
    setSalvando(kpi.kpi_id)
    setErroSalvar((prev) => { const e = { ...prev }; delete e[kpi.kpi_id]; return e })

    try {
      // 1. PATCH escala_linhas para cada linha editada
      await Promise.all(
        Object.entries(edits).map(([linhaId, campos]) =>
          fetch('/api/escalas/linha', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: linhaId,
              ...(campos.motorista !== undefined && { motorista_nome: campos.motorista }),
              ...(campos.placa !== undefined && { placa_raw: campos.placa }),
            }),
          }).then((r) => {
            if (!r.ok) throw new Error(`Falha ao atualizar linha ${linhaId}`)
          }),
        ),
      )

      // 2. Re-processar a rede
      const processarRes = await fetch('/api/kpi/processar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, rede_id: kpi.rede_id }),
      })
      if (!processarRes.ok)
        throw new Error(await processarRes.text())

      const { kpi_ids } = (await processarRes.json()) as { kpi_ids: string[] }

      // 3. Re-gerar KPI
      const targetId = kpi_ids.includes(kpi.kpi_id) ? kpi.kpi_id : (kpi_ids[0] ?? kpi.kpi_id)
      const gerarRes = await fetch('/api/kpi/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kpi_id: targetId }),
      })
      if (!gerarRes.ok) {
        const txt = await gerarRes.text()
        if (gerarRes.status !== 422) throw new Error(txt)
      }

      // 4. Limpa edições e recarrega detalhe
      setEditMap((prev) => { const e = { ...prev }; delete e[kpi.kpi_id]; return e })
      setSignedUrls((prev) => { const e = { ...prev }; delete e[kpi.kpi_id]; return e })
      setDetalhe((prev) => { const e = { ...prev }; delete e[kpi.kpi_id]; return e })
      await carregarDetalhe(targetId !== kpi.kpi_id ? targetId : kpi.kpi_id)

      // Atualiza lista de KPIs para refletir novos contadores
      const diasRes = await fetch(`/api/kpi/dia?data=${data}`)
      if (diasRes.ok) setKpis(await diasRes.json())
    } catch (e) {
      setErroSalvar((prev) => ({
        ...prev,
        [kpi.kpi_id]: e instanceof Error ? e.message : 'Erro ao salvar.',
      }))
    } finally {
      setSalvando(null)
    }
  }

  async function baixar(kpiId: string, tipo: 'xlsx' | 'pdf') {
    setDownloadingId(`${kpiId}:${tipo}`)
    try {
      let urls = signedUrls[kpiId]
      if (!urls) {
        const res = await fetch(`/api/kpi/${kpiId}/signed-urls`)
        if (!res.ok) throw new Error(await res.text())
        urls = (await res.json()) as { xlsx_url: string | null; pdf_url: string | null }
        setSignedUrls((prev) => ({ ...prev, [kpiId]: urls! }))
      }
      const url = tipo === 'xlsx' ? urls.xlsx_url : urls.pdf_url
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      else alert('Arquivo ainda não gerado. Clique em "Gerar" primeiro.')
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
          const filtro = filtros[k.kpi_id] ?? 'todas'
          const temEdits = hasEdits(k.kpi_id)
          const isSalvando = salvando === k.kpi_id
          const erroK = erroSalvar[k.kpi_id]

          return (
            <div
              key={k.kpi_id}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]"
            >
              {/* Cabeçalho do card */}
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
                    variant={isExpanded ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => toggleExpand(k.kpi_id)}
                  >
                    {isExpanded ? 'Fechar' : 'Revisar'}
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

              {/* Painel de revisão */}
              {isExpanded && (
                <div className="border-t border-[var(--color-border)]">
                  {loadingDetalhe === k.kpi_id && (
                    <div className="px-4 py-4 text-[12px] text-[var(--color-fg-muted)]">
                      Carregando linhas…
                    </div>
                  )}
                  {erroK && (
                    <div className="mx-3 mt-3 rounded-md bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/30 px-3 py-2 text-[12px] text-[var(--color-danger-soft-fg)]">
                      {erroK}
                    </div>
                  )}
                  {det && (
                    <TabelaRevisao
                      kpi={k}
                      det={det}
                      filtro={filtro}
                      setFiltro={(f) =>
                        setFiltros((prev) => ({ ...prev, [k.kpi_id]: f }))
                      }
                      editMap={editMap[k.kpi_id] ?? {}}
                      onEditarCelula={(linhaId, campo, valor) =>
                        editarCelula(k.kpi_id, linhaId, campo, valor)
                      }
                      temEdits={temEdits}
                      salvando={isSalvando}
                      onSalvar={() => salvarEReGerar(k)}
                      onBaixar={(tipo) => baixar(k.kpi_id, tipo)}
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

function TabelaRevisao({
  kpi,
  det,
  filtro,
  setFiltro,
  editMap,
  onEditarCelula,
  temEdits,
  salvando,
  onSalvar,
  onBaixar,
}: {
  kpi: KpiDoDia
  det: KpiDetalhe
  filtro: FiltroLinhas
  setFiltro: (f: FiltroLinhas) => void
  editMap: Record<string, { motorista?: string; placa?: string }>
  onEditarCelula: (linhaId: string, campo: 'motorista' | 'placa', valor: string) => void
  temEdits: boolean
  salvando: boolean
  onSalvar: () => void
  onBaixar: (tipo: 'xlsx' | 'pdf') => void
}) {
  const stats = useMemo(() => {
    const total = det.linhas.length
    const altas = det.linhas.filter((l) => severidadeDaCodigos(l.anomalias_codigos) === 'HIGH').length
    const medias = det.linhas.filter((l) => severidadeDaCodigos(l.anomalias_codigos) === 'MEDIUM').length
    const baixas = det.linhas.filter((l) => severidadeDaCodigos(l.anomalias_codigos) === 'LOW').length
    const semAnomalia = det.linhas.filter((l) => l.anomalias_codigos.length === 0).length
    const comAnom = total - semAnomalia
    return { total, altas, medias, baixas, semAnomalia, comAnom }
  }, [det.linhas])

  const linhasFiltradas = useMemo(() => {
    if (filtro === 'com_anomalia') return det.linhas.filter(linhaTemAnomalia)
    if (filtro === 'sem_anomalia') return det.linhas.filter((l) => !linhaTemAnomalia(l))
    return det.linhas
  }, [det.linhas, filtro])

  const chips: Array<{ id: FiltroLinhas; label: string; count: number }> = [
    { id: 'todas', label: 'Todas', count: stats.total },
    { id: 'com_anomalia', label: 'Com anomalia', count: stats.comAnom },
    { id: 'sem_anomalia', label: 'Sem anomalia', count: stats.semAnomalia },
  ]

  return (
    <div>
      {/* Stats bar */}
      <div className="flex gap-3 px-3 pt-3 pb-2 flex-wrap">
        {([
          { label: 'Total', value: stats.total, cls: '' },
          { label: 'Alta', value: stats.altas, cls: stats.altas > 0 ? 'text-red-500' : '' },
          { label: 'Média', value: stats.medias, cls: stats.medias > 0 ? 'text-yellow-600' : '' },
          { label: 'Baixa', value: stats.baixas, cls: '' },
          { label: 'OK', value: stats.semAnomalia, cls: 'text-green-600' },
        ] as const).map(({ label, value, cls }) => (
          <Card key={label} className="px-3 py-1.5 min-w-[70px]">
            <CardContent className="p-0">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className={cn('text-lg font-bold', cls)}>{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Barra de controles */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)]">
        {/* Filtro chips */}
        <div className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5">
          {chips.map((c) => (
            <button
              key={c.id}
              onClick={() => setFiltro(c.id)}
              className={cn(
                'rounded-[5px] px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer',
                filtro === c.id
                  ? 'bg-[var(--color-bg-elevated)] text-[var(--color-fg)] shadow-sm'
                  : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
              )}
            >
              {c.label} <span className="opacity-60">({c.count})</span>
            </button>
          ))}
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1.5">
          {temEdits && (
            <Button
              size="sm"
              onClick={onSalvar}
              disabled={salvando}
              className="bg-[var(--color-warning)] text-white hover:opacity-90"
            >
              {salvando ? (
                <>
                  <Spinner />
                  Salvando…
                </>
              ) : (
                <>
                  <IconSave />
                  Salvar e Re-gerar
                </>
              )}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => onBaixar('xlsx')}>
            <IconDownload />
            XLSX
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onBaixar('pdf')}>
            <IconDownload />
            PDF
          </Button>
        </div>
      </div>

      {temEdits && (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-warning-soft)]/40 px-4 py-1.5 text-[11px] text-[var(--color-warning-soft-fg)] font-medium">
          Você tem alterações não salvas. Clique em "Salvar e Re-gerar" para aplicar.
        </div>
      )}

      <div className="px-3 py-1.5 bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[11px] text-[var(--color-fg-muted)]">
        Clique em qualquer célula de motorista ou placa para editar.
      </div>

      {/* Tabela */}
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
              const sev = severidadeDaCodigos(l.anomalias_codigos)
              const rowBg =
                sev === 'HIGH'
                  ? 'bg-[var(--color-danger-soft)]'
                  : sev === 'MEDIUM'
                    ? 'bg-[var(--color-warning-soft)]/60'
                    : ''
              const edits = l.escala_linha_id ? (editMap[l.escala_linha_id] ?? {}) : {}
              const motoristaVal = edits.motorista !== undefined ? edits.motorista : (l.motorista ?? '')
              const placaVal = edits.placa !== undefined ? edits.placa : (l.placa ?? '')

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
                  <Td
                    align="left"
                    className="font-medium text-[var(--color-fg)] max-w-[180px] truncate"
                  >
                    {l.loja_nome}
                  </Td>
                  <Td align="left" className="px-1 py-0.5 max-w-[160px]">
                    {l.escala_linha_id ? (
                      <CelulaEditavel
                        valor={motoristaVal}
                        onChange={(v) =>
                          onEditarCelula(l.escala_linha_id!, 'motorista', v)
                        }
                      />
                    ) : (
                      <span className="px-2">{l.motorista ?? '—'}</span>
                    )}
                  </Td>
                  <Td className="px-1 py-0.5 w-28">
                    {l.escala_linha_id ? (
                      <CelulaEditavel
                        valor={placaVal}
                        onChange={(v) =>
                          onEditarCelula(l.escala_linha_id!, 'placa', v)
                        }
                        monospace
                      />
                    ) : (
                      <span className="font-mono text-[10.5px] px-2">{l.placa ?? '—'}</span>
                    )}
                  </Td>
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
                  <Td
                    align="left"
                    className="max-w-[200px] truncate text-[var(--color-fg-muted)]"
                  >
                    {l.observacao ?? '—'}
                  </Td>
                </tr>
              )
            })}
            {linhasFiltradas.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-5 text-center text-[12px] text-[var(--color-fg-subtle)]"
                >
                  Nenhuma linha nesse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-3 py-1.5 text-[10px] text-[var(--color-fg-subtle)] border-t border-[var(--color-border)]">
        {linhasFiltradas.length} de {stats.total} linha
        {stats.total === 1 ? '' : 's'} · KPI {kpi.kpi_id.slice(0, 8)}
      </div>
    </div>
  )
}

function CelulaEditavel({
  valor,
  onChange,
  monospace,
}: {
  valor: string
  onChange: (v: string) => void
  monospace?: boolean
}) {
  const vazio = !valor || valor === SEM_VALOR
  return (
    <input
      value={vazio ? '' : valor}
      placeholder={SEM_VALOR}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-[11px] transition-colors',
        'placeholder:text-[var(--color-fg-subtle)]',
        'hover:border-[var(--color-border)] hover:bg-[var(--color-bg-subtle)]',
        'focus:border-[var(--color-accent)] focus:bg-[var(--color-bg-elevated)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30',
        monospace && 'font-mono text-[10.5px]',
        vazio ? 'italic text-[var(--color-fg-subtle)]' : 'text-[var(--color-fg)]',
      )}
    />
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

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={cn('h-3.5 w-3.5 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
    </svg>
  )
}

function IconDownload() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function IconSave() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  )
}
