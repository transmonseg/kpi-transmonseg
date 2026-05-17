'use client'

import { useState, useTransition } from 'react'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, cn } from '@/components/ui'

type VeiculoSlot = {
  motorista_nome: string | null
  motorista_codigo: number | null
  placa_raw: string | null
  placa_norm: string | null
}

type AlteracaoParsed = {
  tipo: 'SUBSTITUICAO' | 'INCLUSAO' | 'COMUNICADO' | 'INFORMATIVO' | 'SWAP'
  rede_id: string | null
  loja_nome_raw: string | null
  entra: VeiculoSlot | null
  sai: VeiculoSlot | null
  motivo: string | null
  texto_original: string
  confianca: 'alta' | 'media' | 'baixa'
}

type RedeResult = {
  rede_id: string
  rede_nome: string
  qtd_rotas: number
  qtd_sem_gps: number
  xlsxBase64: string
  pdfBase64: string
}

function downloadBase64(base64: string, filename: string, mime: string) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

function fmtSlot(slot: VeiculoSlot | null): string {
  if (!slot) return '—'
  const parts: string[] = []
  if (slot.motorista_nome) parts.push(slot.motorista_nome)
  if (slot.motorista_codigo !== null && slot.motorista_codigo !== undefined) parts.push(`#${slot.motorista_codigo}`)
  if (slot.placa_norm) parts.push(slot.placa_norm)
  return parts.join(' · ') || '—'
}

const TIPO_LABELS: Record<AlteracaoParsed['tipo'], string> = {
  SUBSTITUICAO: 'Substituição',
  INCLUSAO: 'Inclusão',
  COMUNICADO: 'Comunicado',
  INFORMATIVO: 'Informativo',
  SWAP: 'Swap',
}

const CONF_CLASS: Record<string, string> = {
  alta: 'text-[var(--color-success)]',
  media: 'text-[var(--color-warning)]',
  baixa: 'text-[var(--color-danger)]',
}

// ─── Seção de alterações ────────────────────────────────────────────────────

interface AlteracoesCardProps {
  confirmadas: AlteracaoParsed[]
  onConfirm: (a: AlteracaoParsed) => void
  onRemove: (idx: number) => void
}

function AlteracoesCard({ confirmadas, onConfirm, onRemove }: AlteracoesCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [modo, setModo] = useState<'texto' | 'pdf'>('texto')
  const [texto, setTexto] = useState('')
  const [previews, setPreviews] = useState<AlteracaoParsed[]>([])
  const [analisando, startAnalisar] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function resetPreviews() { setPreviews([]); setErr(null) }

  function analisarTexto() {
    if (!texto.trim()) return
    resetPreviews()
    startAnalisar(async () => {
      try {
        const res = await fetch('/api/kpi/simples/analisar-alt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto }),
        })
        if (!res.ok) throw new Error(await res.text())
        setPreviews(await res.json() as AlteracaoParsed[])
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao analisar.')
      }
    })
  }

  function analisarPdf(file: File) {
    resetPreviews()
    startAnalisar(async () => {
      try {
        const fd = new FormData()
        fd.append('pdf', file)
        const res = await fetch('/api/kpi/simples/analisar-alt', { method: 'POST', body: fd })
        if (!res.ok) throw new Error(await res.text())
        setPreviews(await res.json() as AlteracaoParsed[])
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao analisar.')
      }
    })
  }

  function confirmar(a: AlteracaoParsed) {
    onConfirm(a)
    setPreviews(prev => prev.filter(p => p !== a))
  }

  const count = confirmadas.length

  return (
    <Card>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 cursor-pointer text-left hover:bg-[var(--color-bg-hover)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
            Alterações de Escala
          </span>
          {count > 0 && (
            <span className="text-xs bg-[var(--color-info-soft)] text-[var(--color-info-soft-fg)] px-2 py-0.5 rounded-full font-medium">
              {count} confirmada{count !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <svg
          className={cn('h-4 w-4 text-[var(--color-fg-muted)] transition-transform', expanded && 'rotate-180')}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <CardContent className="space-y-4 pt-0 border-t border-[var(--color-border)]">
          {/* Lista de confirmadas */}
          {confirmadas.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-[var(--color-fg-subtle)] pt-1">Confirmadas</p>
              {confirmadas.map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded bg-[var(--color-bg-subtle)] px-3 py-2 text-xs">
                  <span className="text-[var(--color-fg)]">
                    <span className="font-medium">{TIPO_LABELS[a.tipo]}</span>
                    {a.rede_id && <span className="text-[var(--color-fg-muted)]"> · {a.rede_id}</span>}
                    {a.loja_nome_raw && <span className="text-[var(--color-fg-subtle)]"> · {a.loja_nome_raw}</span>}
                    {a.entra && <span className="text-[var(--color-success)]"> → {fmtSlot(a.entra)}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    className="ml-2 shrink-0 text-[var(--color-fg-subtle)] hover:text-[var(--color-danger)] transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Seletor de modo */}
          <div className="flex gap-1.5 pt-1">
            {(['texto', 'pdf'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { setModo(m); resetPreviews() }}
                className={cn(
                  'text-xs px-3 py-1 rounded border transition-colors',
                  modo === m
                    ? 'border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] text-[var(--color-fg)]'
                    : 'border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)]',
                )}
              >
                {m === 'texto' ? 'Mensagem de texto' : 'PDF'}
              </button>
            ))}
          </div>

          {/* Input texto */}
          {modo === 'texto' && (
            <div className="space-y-2">
              <textarea
                value={texto}
                onChange={e => { setTexto(e.target.value); resetPreviews() }}
                rows={5}
                placeholder={`🚨 ALTERAÇÃO 🚨\nZona Sul Tijuca\nEntra: Carlos 432 ABC1D23\nSai: José 811 XYZ9876\nMotivo: falta`}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2 text-xs font-mono text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus:border-[var(--color-border-strong)] resize-y"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={analisarTexto}
                disabled={!texto.trim() || analisando}
              >
                {analisando ? 'Analisando…' : 'Analisar'}
              </Button>
            </div>
          )}

          {/* Input PDF */}
          {modo === 'pdf' && (
            <div className="space-y-2">
              <Input
                type="file"
                accept=".pdf"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) analisarPdf(f)
                }}
              />
              {analisando && <p className="text-xs text-[var(--color-fg-muted)]">Lendo PDF…</p>}
            </div>
          )}

          {err && <p className="text-xs text-[var(--color-danger)]">{err}</p>}

          {/* Previews para confirmar/descartar */}
          {previews.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[var(--color-fg-muted)]">
                {previews.length} alteração{previews.length !== 1 ? 'ões' : ''} identificada{previews.length !== 1 ? 's' : ''} — confirme antes de gerar
              </p>
              {previews.map((a, i) => (
                <div key={i} className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
                  <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
                    <span className="text-xs font-semibold text-[var(--color-fg)]">{TIPO_LABELS[a.tipo]}</span>
                    <span className={cn('text-xs', CONF_CLASS[a.confianca] ?? 'text-[var(--color-fg-muted)]')}>
                      confiança {a.confianca}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 px-3 py-2.5 text-xs">
                    <div><span className="text-[var(--color-fg-subtle)]">Rede </span><span className="text-[var(--color-fg)]">{a.rede_id ?? '—'}</span></div>
                    <div><span className="text-[var(--color-fg-subtle)]">Loja </span><span className="text-[var(--color-fg)]">{a.loja_nome_raw ?? '—'}</span></div>
                    <div><span className="text-[var(--color-fg-subtle)]">Entra </span><span className="text-[var(--color-success)]">{fmtSlot(a.entra)}</span></div>
                    <div><span className="text-[var(--color-fg-subtle)]">Sai </span><span className="text-[var(--color-danger)]">{fmtSlot(a.sai)}</span></div>
                    {a.motivo && (
                      <div className="col-span-2">
                        <span className="text-[var(--color-fg-subtle)]">Motivo </span>
                        <span className="text-[var(--color-fg-muted)]">{a.motivo}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 px-3 pb-3">
                    <Button size="sm" onClick={() => confirmar(a)}>Confirmar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setPreviews(prev => prev.filter((_, j) => j !== i))}>
                      Descartar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function KpiSimplesPage() {
  const [escalas, setEscalas] = useState<File[]>([])
  const [unitrac, setUnitrac] = useState<File | null>(null)
  const [data, setData] = useState<string>(hoje)
  const [alteracoes, setAlteracoes] = useState<AlteracaoParsed[]>([])
  const [redes, setRedes] = useState<RedeResult[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function addAlteracao(a: AlteracaoParsed) { setAlteracoes(prev => [...prev, a]) }
  function removeAlteracao(idx: number) { setAlteracoes(prev => prev.filter((_, i) => i !== idx)) }

  async function uploadComPresign(file: File, isUnitrac: boolean): Promise<string> {
    const endpoint = isUnitrac ? '/api/unitrac/presign' : '/api/escalas/presign'
    const body = isUnitrac
      ? { data, filename: file.name }
      : { data, filename: file.name, tipo: 'auto' }

    const presignRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!presignRes.ok) throw new Error(`Presign falhou: ${await presignRes.text()}`)
    const { signedUrl, path } = await presignRes.json() as { signedUrl: string; path: string }

    const ext = file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'xlsx'
    const contentType = ext === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

    const putRes = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file })
    if (!putRes.ok) throw new Error(`Upload falhou (${putRes.status}): ${putRes.statusText}`)
    return path
  }

  async function processar() {
    if (escalas.length === 0) { setErro('Selecione ao menos uma escala.'); return }
    if (!unitrac) { setErro('Selecione o Unitrac.'); return }
    if (!data) { setErro('Selecione a data.'); return }

    setErro(null)
    setRedes(null)

    startTransition(async () => {
      try {
        const [escalaBucketPaths, unitracBucketPath] = await Promise.all([
          Promise.all(escalas.map(f => uploadComPresign(f, false))),
          uploadComPresign(unitrac, true),
        ])

        const res = await fetch('/api/kpi/simples', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ escalaBucketPaths, unitracBucketPath, data, alteracoes }),
        })
        if (!res.ok) throw new Error((await res.text()) || 'Erro ao processar.')
        const json = await res.json() as { redes: RedeResult[] }
        setRedes(json.redes)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Erro inesperado.')
      }
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8 px-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-fg)]">KPI Simples</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Upload de escala e Unitrac para gerar KPIs sem banco de dados.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Arquivos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="escala">Escala(s) (XLSX ou PDF)</Label>
            <Input
              id="escala"
              type="file"
              accept=".xlsx,.pdf"
              multiple
              onChange={e => {
                const files = Array.from(e.target.files ?? [])
                if (files.length > 0) setEscalas(prev => {
                  const names = new Set(prev.map(f => f.name))
                  return [...prev, ...files.filter(f => !names.has(f.name))]
                })
                e.target.value = ''
              }}
            />
            {escalas.length > 0 && (
              <ul className="space-y-1">
                {escalas.map((f, i) => (
                  <li key={f.name} className="flex items-center justify-between gap-2 text-xs text-[var(--color-fg-muted)] bg-[var(--color-bg-subtle)] rounded px-2 py-1">
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setEscalas(prev => prev.filter((_, j) => j !== i))}
                      className="shrink-0 hover:text-[var(--color-danger)] transition-colors"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="unitrac">Unitrac (XLSX ou PDF)</Label>
            <Input id="unitrac" type="file" accept=".xlsx,.pdf" onChange={e => setUnitrac(e.target.files?.[0] ?? null)} />
            {unitrac && <p className="text-xs text-[var(--color-fg-muted)]">{unitrac.name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="data">Data de referência</Label>
            <Input
              id="data"
              type="date"
              value={data}
              onChange={e => setData(e.target.value)}
              className="max-w-[180px]"
            />
          </div>
        </CardContent>
      </Card>

      <AlteracoesCard confirmadas={alteracoes} onConfirm={addAlteracao} onRemove={removeAlteracao} />

      {erro && <p className="text-sm text-[var(--color-danger)]">{erro}</p>}

      <Button onClick={processar} disabled={pending || escalas.length === 0 || !unitrac || !data} className="w-full">
        {pending
          ? 'Processando...'
          : `Gerar KPIs${escalas.length > 1 ? ` (${escalas.length} escalas)` : ''}${alteracoes.length > 0 ? ` · ${alteracoes.length} alt.` : ''}`}
      </Button>

      {redes && redes.length === 0 && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-[var(--color-fg-muted)]">
            Nenhuma rede encontrada. Verifique os arquivos enviados.
          </CardContent>
        </Card>
      )}

      {redes && redes.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
            Resultado — {redes.length} {redes.length === 1 ? 'rede' : 'redes'}
          </h2>
          {redes.map(r => (
            <Card key={r.rede_id}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div>
                  <p className="font-medium text-[var(--color-fg)]">{r.rede_nome}</p>
                  <p className="text-xs text-[var(--color-fg-muted)]">
                    {r.qtd_rotas} {r.qtd_rotas === 1 ? 'rota' : 'rotas'}
                    {r.qtd_sem_gps > 0 && (
                      <span className="ml-2 text-[var(--color-warning)]">
                        · {r.qtd_sem_gps} sem GPS
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => downloadBase64(r.xlsxBase64, `KPI-${r.rede_id}-${data}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
                  >
                    XLSX
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => downloadBase64(r.pdfBase64, `KPI-${r.rede_id}-${data}.pdf`, 'application/pdf')}
                  >
                    PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
