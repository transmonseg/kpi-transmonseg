'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DownloadSimple,
  FloppyDisk,
  CircleNotch,
  CaretDown,
} from '@phosphor-icons/react/dist/ssr'
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
  kpi_rota_id?: string | null
  rota_status?: string | null
  kpi_linha_id?: string | null
}

type HoraEdits = {
  saida_cd?: string
  chd_loja_1?: string; saida_loja_1?: string
  chd_loja_2?: string; saida_loja_2?: string
  chd_loja_3?: string; saida_loja_3?: string
}

type HoraMap = Record<string, Record<string, HoraEdits>>

type AnomaliaItem = {
  id: string
  codigo: string
  severidade: string
  descricao: string
  sugestao: string | null
  status: string
  kpi_rota_id: string | null
  parada_id: string | null
}

type KpiDetalhe = {
  kpi: { id: string; data: string; rede_id: string; status: string }
  linhas: KpiLinha[]
  anomalias: {
    high: number
    medium: number
    low: number
    pendentes: number
    lista: AnomaliaItem[]
  }
}

type FiltroLinhas = 'todas' | 'com_anomalia' | 'sem_anomalia'

type EditMap = Record<string, Record<string, { motorista?: string; placa?: string }>>

const SEM_VALOR = '—'

function fmtHora(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Retorna HH:MM usando horas UTC (os timestamps são armazenados com BRT como UTC)
function isoParaHHMM(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function hhmmParaIso(hhmm: string, date: string): string {
  return `${date}T${hhmm}:00.000Z`
}

const HIGH_CODES = new Set(['ANOM-01', 'ANOM-04', 'ANOM-06', 'ANOM-07'])
const MEDIUM_CODES = new Set(['ANOM-03', 'ANOM-05', 'ANOM-08', 'ANOM-10', 'ANOM-11'])

const CODIGO_LABELS: Record<string, string> = {
  'ANOM-01': 'SEM RASTREADOR',
  'ANOM-02': 'GPS S/ ESCALA',
  'ANOM-03': 'PARADA SUSPEITA',
  'ANOM-04': 'GPS INVÁLIDO',
  'ANOM-05': 'PARADAS ERRADAS',
  'ANOM-06': 'SEM SAÍDA CD',
  'ANOM-07': 'ORDEM GPS',
  'ANOM-08': 'TEMPO EXCEDIDO',
  'ANOM-10': 'LOJA AUSENTE',
  'ANOM-11': 'FORA JANELA',
}

type SituacaoVariant = 'danger' | 'warning' | 'success' | 'muted'

function situacaoInfo(l: KpiLinha): { label: string; variant: SituacaoVariant } {
  if (l.rota_status === 'sem_entrega') return { label: 'SEM ENTREGA', variant: 'muted' }
  const codes = l.anomalias_codigos
  for (const code of ['ANOM-01', 'ANOM-04', 'ANOM-06', 'ANOM-07']) {
    if (codes.includes(code)) return { label: CODIGO_LABELS[code] ?? code, variant: 'danger' }
  }
  for (const code of ['ANOM-08', 'ANOM-05', 'ANOM-03']) {
    if (codes.includes(code)) return { label: CODIGO_LABELS[code] ?? code, variant: 'warning' }
  }
  for (const code of ['ANOM-11', 'ANOM-10', 'ANOM-02']) {
    if (codes.includes(code)) return { label: CODIGO_LABELS[code] ?? code, variant: 'muted' }
  }
  if (codes.length > 0) return { label: codes[0], variant: 'muted' }
  // Sem passou pela BASE mas fez entrega
  if (!l.saida_cd && l.chd_loja_1 && l.anomalias_codigos.length === 0) {
    return { label: 'SAÍDA DIRETA', variant: 'muted' }
  }
  return { label: 'OK', variant: 'success' }
}

function buildTooltip(l: KpiLinha): string {
  if (l.rota_status === 'sem_entrega') return 'Marcado como sem entrega'
  if (!l.saida_cd && l.chd_loja_1 && l.anomalias_codigos.length === 0) {
    return 'Caminhão saiu direto sem passar pela BASE (rotina noturna ou primeira entrega cedo)'
  }
  if (l.anomalias_codigos.length === 0) return 'Rota sem anomalias detectadas'
  return l.anomalias_codigos
    .map((c) => `${c}: ${CODIGO_LABELS[c] ?? c}`)
    .join('\n')
}

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
  const [resolvendo, setResolvendo] = useState<string | null>(null)
  const [marcandoSemEntrega, setMarcandoSemEntrega] = useState<string | null>(null)
  const [editMapHora, setEditMapHora] = useState<HoraMap>({})

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
        setEditMapHora({})
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

  function editarHora(
    kpiId: string,
    escalaLinhaId: string,
    campo: keyof HoraEdits,
    valor: string,
  ) {
    setEditMapHora((prev) => ({
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

  function hasHoraEdits(kpiId: string): boolean {
    const edits = editMapHora[kpiId]
    return !!edits && Object.keys(edits).length > 0
  }

  async function salvarEReGerar(kpi: KpiDoDia) {
    const escalaEdits = editMap[kpi.kpi_id]
    const horaEditsKpi = editMapHora[kpi.kpi_id]
    const temEscalaEdits = !!escalaEdits && Object.keys(escalaEdits).length > 0
    const temHoraEdits = !!horaEditsKpi && Object.keys(horaEditsKpi).length > 0
    if (!temEscalaEdits && !temHoraEdits) return

    setSalvando(kpi.kpi_id)
    setErroSalvar((prev) => { const e = { ...prev }; delete e[kpi.kpi_id]; return e })

    try {
      let targetId = kpi.kpi_id
      let linhasAtuais = detalhe[kpi.kpi_id]?.linhas ?? []

      // 1. Escala edits (motorista/placa) → processar + gerar normal
      if (temEscalaEdits) {
        await Promise.all(
          Object.entries(escalaEdits).map(([linhaId, campos]) =>
            fetch('/api/escalas/linha', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: linhaId,
                ...(campos.motorista !== undefined && { motorista_nome: campos.motorista }),
                ...(campos.placa !== undefined && { placa_raw: campos.placa }),
              }),
            }).then((r) => { if (!r.ok) throw new Error(`Falha ao atualizar linha ${linhaId}`) }),
          ),
        )

        const processarRes = await fetch('/api/kpi/processar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, rede_id: kpi.rede_id }),
        })
        if (!processarRes.ok) throw new Error(await processarRes.text())
        const { kpi_ids } = (await processarRes.json()) as { kpi_ids: string[] }
        targetId = kpi_ids.includes(kpi.kpi_id) ? kpi.kpi_id : (kpi_ids[0] ?? kpi.kpi_id)

        const gerarRes = await fetch('/api/kpi/gerar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kpi_id: targetId }),
        })
        if (!gerarRes.ok) {
          const txt = await gerarRes.text()
          if (gerarRes.status !== 422) throw new Error(txt)
        }

        // Re-fetch linhas para ter os novos kpi_linha_ids após consolidaKpi
        const freshRes = await fetch(`/api/kpi/${targetId}`)
        if (freshRes.ok) {
          const fresh = (await freshRes.json()) as { linhas: KpiLinha[] }
          linhasAtuais = fresh.linhas
        }
      }

      // 2. Hora edits → PATCH kpi_linhas diretamente, depois gerar sem re-consolidar
      if (temHoraEdits) {
        // Se kpi_linhas ainda não existem (gerar nunca foi chamado e não há escala edits)
        const temLinhaId = linhasAtuais.some((l) => l.kpi_linha_id)
        if (!temLinhaId) {
          const gerarRes = await fetch('/api/kpi/gerar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kpi_id: targetId }),
          })
          if (!gerarRes.ok) throw new Error(await gerarRes.text())
          const freshRes = await fetch(`/api/kpi/${targetId}`)
          if (freshRes.ok) {
            const fresh = (await freshRes.json()) as { linhas: KpiLinha[] }
            linhasAtuais = fresh.linhas
          }
        }

        await Promise.all(
          Object.entries(horaEditsKpi).map(async ([escalaLinhaId, horaEdits]) => {
            const linha = linhasAtuais.find((l) => l.escala_linha_id === escalaLinhaId)
            if (!linha?.kpi_linha_id) return
            const payload: Record<string, string | null> = {}
            const campos: Array<keyof HoraEdits> = [
              'saida_cd', 'chd_loja_1', 'saida_loja_1',
              'chd_loja_2', 'saida_loja_2', 'chd_loja_3', 'saida_loja_3',
            ]
            for (const campo of campos) {
              const val = horaEdits[campo]
              if (val !== undefined) {
                payload[campo] = val ? hhmmParaIso(val, data) : null
              }
              // Se não foi editado, envia o valor original para recalcular tempo corretamente
              else {
                const original = linha[campo as keyof KpiLinha] as string | null
                if (original !== undefined) payload[campo] = original
              }
            }
            const r = await fetch(`/api/kpi/linhas/${linha.kpi_linha_id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
            if (!r.ok) throw new Error(`Erro ao salvar horário: ${await r.text()}`)
          }),
        )

        // Re-gerar Excel a partir das kpi_linhas editadas (sem re-consolidar)
        const gerarRes2 = await fetch('/api/kpi/gerar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kpi_id: targetId, skip_consolida: true }),
        })
        if (!gerarRes2.ok) throw new Error(await gerarRes2.text())
      }

      setEditMap((prev) => { const e = { ...prev }; delete e[kpi.kpi_id]; return e })
      setEditMapHora((prev) => { const e = { ...prev }; delete e[kpi.kpi_id]; return e })
      setSignedUrls((prev) => { const e = { ...prev }; delete e[kpi.kpi_id]; return e })
      setDetalhe((prev) => { const e = { ...prev }; delete e[kpi.kpi_id]; return e })
      await carregarDetalhe(targetId)

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

  async function resolverAnomalia(kpiId: string, anomaliaId: string, acao: 'ignorar' | 'aceitar') {
    setResolvendo(anomaliaId)
    try {
      const res = await fetch(`/api/anomalias/${anomaliaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao }),
      })
      if (!res.ok) throw new Error(await res.text())
      // Recarrega detalhe para atualizar status das anomalias
      setDetalhe((prev) => { const e = { ...prev }; delete e[kpiId]; return e })
      await carregarDetalhe(kpiId)
      // Atualiza contadores do card
      const diasRes = await fetch(`/api/kpi/dia?data=${data}`)
      if (diasRes.ok) setKpis(await diasRes.json())
    } catch (e) {
      console.error('Erro ao resolver anomalia', e)
    } finally {
      setResolvendo(null)
    }
  }

  async function marcarSemEntrega(kpiId: string, rotaId: string) {
    setMarcandoSemEntrega(rotaId)
    try {
      const res = await fetch(`/api/kpi/rotas/${rotaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sem_entrega' }),
      })
      if (!res.ok) throw new Error(await res.text())
      setDetalhe((prev) => { const e = { ...prev }; delete e[kpiId]; return e })
      await carregarDetalhe(kpiId)
      const diasRes = await fetch(`/api/kpi/dia?data=${data}`)
      if (diasRes.ok) setKpis(await diasRes.json())
    } catch (e) {
      console.error('Erro ao marcar sem entrega', e)
    } finally {
      setMarcandoSemEntrega(null)
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
          const temEdits = hasEdits(k.kpi_id) || hasHoraEdits(k.kpi_id)
          const isSalvando = salvando === k.kpi_id
          const erroK = erroSalvar[k.kpi_id]
          const temAnomaliasBloqueando = k.qtd_anomalias_high > 0

          return (
            <div
              key={k.kpi_id}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]"
            >
              {/* Cabeçalho */}
              <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
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
                    {downloadingId === `${k.kpi_id}:xlsx`
                      ? <CircleNotch size={13} weight="bold" className="animate-spin" />
                      : <><DownloadSimple size={13} weight="bold" />XLSX</>}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => baixar(k.kpi_id, 'pdf')}
                    disabled={downloadingId === `${k.kpi_id}:pdf`}
                  >
                    {downloadingId === `${k.kpi_id}:pdf`
                      ? <CircleNotch size={13} weight="bold" className="animate-spin" />
                      : <><DownloadSimple size={13} weight="bold" />PDF</>}
                  </Button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-[var(--color-border)]">
                  {loadingDetalhe === k.kpi_id && (
                    <div className="px-4 py-4 text-[12px] text-[var(--color-fg-muted)] animate-pulse">
                      Carregando…
                    </div>
                  )}
                  {erroK && (
                    <div className="mx-3 mt-3 rounded-md bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/30 px-3 py-2 text-[12px] text-[var(--color-danger-soft-fg)]">
                      {erroK}
                    </div>
                  )}
                  {det && (
                    <PainelRevisao
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
                      editMapHora={editMapHora[k.kpi_id] ?? {}}
                      onEditarHora={(escalaLinhaId, campo, valor) =>
                        editarHora(k.kpi_id, escalaLinhaId, campo, valor)
                      }
                      dataKpi={data}
                      temEdits={temEdits}
                      salvando={isSalvando}
                      onSalvar={() => salvarEReGerar(k)}
                      onBaixar={(tipo) => baixar(k.kpi_id, tipo)}
                      onResolver={(anomId, acao) => resolverAnomalia(k.kpi_id, anomId, acao)}
                      resolvendo={resolvendo}
                      marcandoSemEntrega={marcandoSemEntrega}
                      onMarcarSemEntrega={(rotaId) => marcarSemEntrega(k.kpi_id, rotaId)}
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

function PainelRevisao({
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
  onResolver,
  resolvendo,
  marcandoSemEntrega,
  onMarcarSemEntrega,
  editMapHora,
  onEditarHora,
  dataKpi,
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
  onResolver: (anomId: string, acao: 'ignorar' | 'aceitar') => void
  resolvendo: string | null
  marcandoSemEntrega: string | null
  onMarcarSemEntrega: (rotaId: string) => void
  editMapHora: Record<string, HoraEdits>
  onEditarHora: (escalaLinhaId: string, campo: keyof HoraEdits, valor: string) => void
  dataKpi: string
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

  const anomaliasAltas = det.anomalias.lista.filter((a) => a.severidade === 'HIGH')
  const anomaliasOutras = det.anomalias.lista.filter((a) => a.severidade !== 'HIGH')
  const temAnomaliasPendentes = det.anomalias.lista.some((a) => a.status === 'pendente' && a.severidade === 'HIGH')

  const chips: Array<{ id: FiltroLinhas; label: string; count: number }> = [
    { id: 'todas', label: 'Todas', count: stats.total },
    { id: 'com_anomalia', label: 'Com anomalia', count: stats.comAnom },
    { id: 'sem_anomalia', label: 'OK', count: stats.semAnomalia },
  ]

  return (
    <div>
      {/* Barra de stats simples */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
        {([
          { label: 'Total', value: stats.total, color: 'text-[var(--color-fg)]' },
          { label: 'Alta', value: stats.altas, color: stats.altas > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-fg-muted)]' },
          { label: 'Média', value: stats.medias, color: stats.medias > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-fg-muted)]' },
          { label: 'Baixa', value: stats.baixas, color: 'text-[var(--color-fg-muted)]' },
          { label: 'OK', value: stats.semAnomalia, color: 'text-[var(--color-success)]' },
        ] as const).map(({ label, value, color }) => (
          <div key={label} className="flex items-baseline gap-1">
            <span className={cn('text-[14px] font-bold tabular-nums', color)}>{value}</span>
            <span className="text-[10px] text-[var(--color-fg-subtle)]">{label}</span>
          </div>
        ))}
        <div className="flex-1" />
        {/* Ações */}
        {temEdits && (
          <Button
            size="sm"
            onClick={onSalvar}
            disabled={salvando}
            className="bg-[var(--color-warning)] text-white hover:opacity-90"
          >
            {salvando ? <><Spinner />Salvando…</> : <><IconSave />Salvar e Re-gerar</>}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => onBaixar('xlsx')}>
          <IconDownload />XLSX
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onBaixar('pdf')}>
          <IconDownload />PDF
        </Button>
      </div>

      {temEdits && (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-warning-soft)]/40 px-4 py-1.5 text-[11px] text-[var(--color-warning-soft-fg)] font-medium">
          Alterações não salvas — clique em "Salvar e Re-gerar" para aplicar.
        </div>
      )}

      {/* Painel de anomalias altas */}
      {anomaliasAltas.length > 0 && (
        <div className="border-b border-[var(--color-border)]">
          <div className="px-3 py-2 bg-[var(--color-danger-soft)]/60">
            <p className="text-[11px] font-semibold text-[var(--color-danger-soft-fg)] mb-1.5">
              Anomalias Altas ({anomaliasAltas.length})
            </p>
            <div className="flex flex-col gap-1.5">
              {anomaliasAltas.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    'rounded-md border px-3 py-2 text-[11px]',
                    a.status === 'pendente'
                      ? 'bg-[var(--color-bg)] border-[var(--color-danger)]/30'
                      : 'bg-[var(--color-bg-subtle)] border-[var(--color-border)] opacity-60',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-[10px] font-bold text-[var(--color-danger-soft-fg)] mr-1.5">
                        {a.codigo}
                      </span>
                      <span className="text-[var(--color-fg)]">{a.descricao}</span>
                      {a.sugestao && (
                        <p className="text-[var(--color-fg-muted)] mt-0.5 italic">{a.sugestao}</p>
                      )}
                    </div>
                    {a.status === 'pendente' ? (
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => onResolver(a.id, 'ignorar')}
                          disabled={resolvendo === a.id}
                          className="rounded px-2 py-0.5 text-[10px] font-medium bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-fg)] hover:opacity-80 disabled:opacity-50 cursor-pointer"
                        >
                          {resolvendo === a.id ? '…' : 'Ignorar'}
                        </button>
                        <button
                          onClick={() => onResolver(a.id, 'aceitar')}
                          disabled={resolvendo === a.id}
                          className="rounded px-2 py-0.5 text-[10px] font-medium bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-hover)] disabled:opacity-50 cursor-pointer"
                        >
                          Aceitar
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-[var(--color-fg-subtle)] shrink-0 capitalize">
                        {a.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Anomalias médias/baixas — colapsável */}
      {anomaliasOutras.length > 0 && (
        <AnomaliasMediasLowPanel anomalias={anomaliasOutras} onResolver={onResolver} resolvendo={resolvendo} />
      )}

      {/* Barra de filtro + dica */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)]">
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
              {c.label} <span className="text-[var(--color-fg-subtle)]">({c.count})</span>
            </button>
          ))}
        </div>
        <span className="text-[10px] text-[var(--color-fg-subtle)]">
          Clique em motorista ou placa para editar
        </span>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] tabular-nums">
          <thead className="bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)]">
            <tr>
              <Th>#</Th>
              <Th>Situação</Th>
              <Th align="left">Loja</Th>
              <Th align="left">Motorista</Th>
              <Th>Placa</Th>
              <Th>Saída CD</Th>
              <Th>Par. 1</Th>
              <Th>Par. 2</Th>
              <Th>Par. 3</Th>
              <Th align="left">Obs</Th>
            </tr>
          </thead>
          <tbody>
            {linhasFiltradas.map((l) => {
              const sev = severidadeDaCodigos(l.anomalias_codigos)
              const rowBg =
                sev === 'HIGH'
                  ? 'bg-[var(--color-danger-soft)]'
                  : sev === 'MEDIUM'
                    ? 'bg-[var(--color-warning-soft)]/50'
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
                  <Td>
                    <span className="text-[var(--color-fg-subtle)]">{l.ordem}</span>
                  </Td>
                  <SituacaoCell
                    linha={l}
                    marcandoSemEntrega={marcandoSemEntrega}
                    onMarcarSemEntrega={onMarcarSemEntrega}
                  />
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
                  <CelulaHoraTd
                    iso={l.saida_cd}
                    editVal={l.escala_linha_id ? (editMapHora[l.escala_linha_id]?.saida_cd) : undefined}
                    onChange={l.escala_linha_id ? (v) => onEditarHora(l.escala_linha_id!, 'saida_cd', v) : undefined}
                  />
                  <ParadaCellEditavel
                    chegada={l.chd_loja_1} saida={l.saida_loja_1} min={l.tempo_loja_1_min}
                    editChd={l.escala_linha_id ? editMapHora[l.escala_linha_id]?.chd_loja_1 : undefined}
                    editSai={l.escala_linha_id ? editMapHora[l.escala_linha_id]?.saida_loja_1 : undefined}
                    onChangeChd={l.escala_linha_id ? (v) => onEditarHora(l.escala_linha_id!, 'chd_loja_1', v) : undefined}
                    onChangeSai={l.escala_linha_id ? (v) => onEditarHora(l.escala_linha_id!, 'saida_loja_1', v) : undefined}
                  />
                  <ParadaCellEditavel
                    chegada={l.chd_loja_2} saida={l.saida_loja_2} min={l.tempo_loja_2_min}
                    editChd={l.escala_linha_id ? editMapHora[l.escala_linha_id]?.chd_loja_2 : undefined}
                    editSai={l.escala_linha_id ? editMapHora[l.escala_linha_id]?.saida_loja_2 : undefined}
                    onChangeChd={l.escala_linha_id ? (v) => onEditarHora(l.escala_linha_id!, 'chd_loja_2', v) : undefined}
                    onChangeSai={l.escala_linha_id ? (v) => onEditarHora(l.escala_linha_id!, 'saida_loja_2', v) : undefined}
                  />
                  <ParadaCellEditavel
                    chegada={l.chd_loja_3} saida={l.saida_loja_3} min={l.tempo_loja_3_min}
                    editChd={l.escala_linha_id ? editMapHora[l.escala_linha_id]?.chd_loja_3 : undefined}
                    editSai={l.escala_linha_id ? editMapHora[l.escala_linha_id]?.saida_loja_3 : undefined}
                    onChangeChd={l.escala_linha_id ? (v) => onEditarHora(l.escala_linha_id!, 'chd_loja_3', v) : undefined}
                    onChangeSai={l.escala_linha_id ? (v) => onEditarHora(l.escala_linha_id!, 'saida_loja_3', v) : undefined}
                  />
                  <Td
                    align="left"
                    className="max-w-[200px] truncate text-[var(--color-fg-muted)]"
                    title={l.observacao ?? undefined}
                  >
                    {l.observacao ?? '—'}
                  </Td>
                </tr>
              )
            })}
            {linhasFiltradas.length === 0 && (
              <tr>
                <td
                  colSpan={10}
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


function AnomaliasMediasLowPanel({
  anomalias,
  onResolver,
  resolvendo,
}: {
  anomalias: AnomaliaItem[]
  onResolver: (anomId: string, acao: 'ignorar' | 'aceitar') => void
  resolvendo: string | null
}) {
  const [open, setOpen] = useState(false)
  const pendentes = anomalias.filter((a) => a.status === 'pendente').length
  return (
    <div className="border-b border-[var(--color-border)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-medium text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer"
      >
        <span>
          {anomalias.length} anomalia{anomalias.length === 1 ? '' : 's'} média/baixa
          {pendentes > 0 && <span className="ml-1 text-[var(--color-warning)]">({pendentes} pendente{pendentes === 1 ? '' : 's'})</span>}
        </span>
        <CaretDown
          size={13}
          weight="bold"
          className={cn('transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="px-3 pb-2 flex flex-col gap-1.5">
          {anomalias.map((a) => (
            <div
              key={a.id}
              className={cn(
                'rounded-md border px-3 py-2 text-[11px]',
                a.status === 'pendente'
                  ? 'bg-[var(--color-bg)] border-[var(--color-border)]'
                  : 'bg-[var(--color-bg-subtle)] border-[var(--color-border)] opacity-60',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className={cn(
                    'font-mono text-[10px] font-bold mr-1.5',
                    a.severidade === 'MEDIUM' ? 'text-[var(--color-warning)]' : 'text-[var(--color-fg-muted)]',
                  )}>
                    {a.codigo}
                  </span>
                  <span className="text-[var(--color-fg)]">{a.descricao}</span>
                  {a.sugestao && (
                    <p className="text-[var(--color-fg-muted)] mt-0.5 italic">{a.sugestao}</p>
                  )}
                </div>
                {a.status === 'pendente' ? (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => onResolver(a.id, 'ignorar')}
                      disabled={resolvendo === a.id}
                      className="rounded px-2 py-0.5 text-[10px] font-medium bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-hover)] disabled:opacity-50 cursor-pointer"
                    >
                      {resolvendo === a.id ? '…' : 'Ignorar'}
                    </button>
                  </div>
                ) : (
                  <span className="text-[10px] text-[var(--color-fg-subtle)] shrink-0 capitalize">
                    {a.status}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SituacaoCell({
  linha,
  marcandoSemEntrega,
  onMarcarSemEntrega,
}: {
  linha: KpiLinha
  marcandoSemEntrega: string | null
  onMarcarSemEntrega: (rotaId: string) => void
}) {
  const sit = situacaoInfo(linha)
  const tooltip = buildTooltip(linha)
  const podeMarcar = !!linha.kpi_rota_id && linha.rota_status !== 'sem_entrega'
  const isBusy = marcandoSemEntrega === linha.kpi_rota_id

  return (
    <Td>
      <div className="flex flex-col items-center gap-0.5">
        <span
          title={tooltip}
          className={cn(
            'inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide cursor-help whitespace-nowrap',
            sit.variant === 'danger' && 'bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-fg)]',
            sit.variant === 'warning' && 'bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-fg)]',
            sit.variant === 'success' && 'bg-[var(--color-success-soft,#dcfce7)] text-[var(--color-success-soft-fg,#166534)]',
            sit.variant === 'muted' && 'bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)]',
          )}
        >
          {sit.label}
        </span>
        {podeMarcar && (
          <button
            onClick={() => onMarcarSemEntrega(linha.kpi_rota_id!)}
            disabled={isBusy}
            title="Marcar que o caminhão não fez esta entrega"
            className="text-[8.5px] text-[var(--color-fg-subtle)] hover:text-[var(--color-danger)] underline cursor-pointer disabled:opacity-50 transition-colors leading-tight"
          >
            {isBusy ? '…' : 'sem entrega'}
          </button>
        )}
      </div>
    </Td>
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
      placeholder="—"
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full rounded border px-2 py-1 text-[11px] transition-colors',
        'border-[var(--color-border)] bg-[var(--color-bg-subtle)]',
        'hover:border-[var(--color-accent)]/50 hover:bg-[var(--color-bg)]',
        'focus:border-[var(--color-accent)] focus:bg-[var(--color-bg-elevated)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30',
        monospace && 'font-mono text-[10.5px] uppercase tracking-wider',
        vazio ? 'italic text-[var(--color-fg-subtle)]' : 'text-[var(--color-fg)]',
      )}
    />
  )
}

function CelulaHoraTd({
  iso,
  editVal,
  onChange,
}: {
  iso: string | null
  editVal: string | undefined
  onChange: ((v: string) => void) | undefined
}) {
  const displayVal = editVal !== undefined ? editVal : isoParaHHMM(iso)
  const editado = editVal !== undefined && editVal !== isoParaHHMM(iso)
  return (
    <Td className="px-1 py-0.5 w-20">
      {onChange ? (
        <input
          type="time"
          value={displayVal}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full rounded border px-1.5 py-1 text-[11px] font-mono transition-colors',
            editado
              ? 'border-[var(--color-warning)] bg-[var(--color-warning-soft)]/30 text-[var(--color-fg)]'
              : 'border-[var(--color-border)] bg-[var(--color-bg-subtle)] text-[var(--color-fg)]',
            'hover:border-[var(--color-accent)]/50 focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/30',
          )}
        />
      ) : (
        <span className="tabular-nums">{fmtHora(iso)}</span>
      )}
    </Td>
  )
}

function ParadaCellEditavel({
  chegada, saida, min,
  editChd, editSai,
  onChangeChd, onChangeSai,
}: {
  chegada: string | null; saida: string | null; min: number | null
  editChd: string | undefined; editSai: string | undefined
  onChangeChd: ((v: string) => void) | undefined
  onChangeSai: ((v: string) => void) | undefined
}) {
  const hasData = chegada || saida || editChd !== undefined || editSai !== undefined
  if (!hasData) return <Td className="text-[var(--color-fg-subtle)]">—</Td>

  const chdVal = editChd !== undefined ? editChd : isoParaHHMM(chegada)
  const saiVal = editSai !== undefined ? editSai : isoParaHHMM(saida)
  const editadoChd = editChd !== undefined && editChd !== isoParaHHMM(chegada)
  const editadoSai = editSai !== undefined && editSai !== isoParaHHMM(saida)

  // Calcular tempo em minutos on-the-fly quando editado
  let tempoMin = min
  if (editadoChd || editadoSai) {
    const [ch, cm] = (chdVal || '00:00').split(':').map(Number)
    const [sh, sm] = (saiVal || '00:00').split(':').map(Number)
    const diff = (sh * 60 + sm) - (ch * 60 + cm)
    tempoMin = diff > 0 ? diff : null
  }

  return (
    <Td className="px-1 py-0.5 min-w-[90px]">
      <div className="flex flex-col gap-0.5">
        {onChangeChd ? (
          <input
            type="time"
            value={chdVal}
            onChange={(e) => onChangeChd(e.target.value)}
            className={cn(
              'w-full rounded border px-1 py-0.5 text-[10px] font-mono transition-colors',
              editadoChd
                ? 'border-[var(--color-warning)] bg-[var(--color-warning-soft)]/30'
                : 'border-[var(--color-border)] bg-[var(--color-bg-subtle)]',
              'focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/30',
            )}
          />
        ) : (
          <span className="text-[10px] font-mono">{fmtHora(chegada)}</span>
        )}
        {onChangeSai ? (
          <input
            type="time"
            value={saiVal}
            onChange={(e) => onChangeSai(e.target.value)}
            className={cn(
              'w-full rounded border px-1 py-0.5 text-[10px] font-mono transition-colors',
              editadoSai
                ? 'border-[var(--color-warning)] bg-[var(--color-warning-soft)]/30'
                : 'border-[var(--color-border)] bg-[var(--color-bg-subtle)]',
              'focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/30',
            )}
          />
        ) : (
          <span className="text-[10px] font-mono">{fmtHora(saida)}</span>
        )}
        {tempoMin != null && tempoMin > 0 && (
          <span className={cn(
            'text-[9px]',
            editadoChd || editadoSai ? 'text-[var(--color-warning)]' : 'text-[var(--color-fg-muted)]',
          )}>{tempoMin}min</span>
        )}
      </div>
    </Td>
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
  title,
}: {
  children: React.ReactNode
  align?: 'left' | 'center' | 'right'
  className?: string
  title?: string
}) {
  return (
    <td
      title={title}
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


function Spinner({ className = '' }: { className?: string }) {
  return <CircleNotch size={14} weight="bold" className={cn('animate-spin', className)} />
}

function IconDownload() {
  return <DownloadSimple size={14} weight="bold" />
}

function IconSave() {
  return <FloppyDisk size={14} weight="bold" />
}
