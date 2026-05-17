'use client'

import { useRef, useState, useTransition } from 'react'
import { Check, X, FilePdf, FileXls, UploadSimple } from '@phosphor-icons/react/dist/ssr'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Textarea,
  cn,
} from '@/components/ui'

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

type AplicarResult = {
  id: string
  status: string
  confianca: 'alta' | 'media' | 'baixa'
}

const PLACEHOLDER = `ALTERAÇÃO
Prezunic Caxias centenário, Caxias centro
Entra: Sidnei 674 LQE5401
Sai : Anderson 811 LCE4337
Motivo: Pneu do caminhão furou`

const TIPO_LABEL: Record<AlteracaoParsed['tipo'], string> = {
  SUBSTITUICAO: 'Substituição',
  INCLUSAO: 'Inclusão',
  COMUNICADO: 'Comunicado',
  INFORMATIVO: 'Informativo',
  SWAP: 'Swap',
}

function confiancaVariant(
  c: AlteracaoParsed['confianca'],
): 'success' | 'warning' | 'danger' {
  if (c === 'alta') return 'success'
  if (c === 'media') return 'warning'
  return 'danger'
}

function confiancaLabel(c: AlteracaoParsed['confianca']): string {
  if (c === 'alta') return 'Confiança alta'
  if (c === 'media') return 'Confiança média'
  return 'Confiança baixa'
}

function fmtSlot(slot: VeiculoSlot | null): string {
  if (!slot) return '—'
  const parts: string[] = []
  if (slot.motorista_nome) parts.push(slot.motorista_nome)
  if (slot.motorista_codigo !== null) parts.push(`#${slot.motorista_codigo}`)
  if (slot.placa_norm) parts.push(slot.placa_norm)
  return parts.length ? parts.join(' · ') : '—'
}

export function AlteracaoForm() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [texto, setTexto] = useState('')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [parsed, setParsed] = useState<AlteracaoParsed | null>(null)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [savedResult, setSavedResult] = useState<AplicarResult | null>(null)
  const [arquivoNome, setArquivoNome] = useState<string | null>(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [reprocessando, setReprocessando] = useState(false)

  async function handleArquivoUpload(file: File) {
    setArquivoNome(file.name)
    setUploadLoading(true)
    setErr(null)
    setSavedResult(null)
    setParsed(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('data_escala', data)
      const res = await fetch('/api/alteracoes/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      const resultado = (await res.json()) as AlteracaoParsed
      setParsed(resultado)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro no upload.')
    } finally {
      setUploadLoading(false)
    }
  }

  async function reprocessarKpi(dataParam: string, redeId: string | null) {
    try {
      const body: Record<string, string> = { data: dataParam }
      if (redeId) body.rede_id = redeId
      await fetch('/api/kpi/processar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (e) {
      console.error('Erro ao reprocessar:', e)
    }
  }

  function analisar() {
    setErr(null)
    setSavedResult(null)
    setParsed(null)
    start(async () => {
      try {
        const res = await fetch('/api/alteracoes/parsear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto }),
        })
        if (!res.ok) throw new Error(await res.text())
        const json = (await res.json()) as AlteracaoParsed
        setParsed(json)
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao analisar.')
      }
    })
  }

  function aplicar() {
    if (!parsed) return
    setErr(null)
    start(async () => {
      try {
        const res = await fetch('/api/alteracoes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texto,
            data,
            aplicar: true,
          }),
        })
        if (!res.ok) throw new Error(await res.text())
        const json = (await res.json()) as AplicarResult
        setSavedResult(json)
        setReprocessando(true)
        try {
          await reprocessarKpi(data, parsed.rede_id)
        } finally {
          setReprocessando(false)
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao aplicar.')
      }
    })
  }

  const podeAnalisar = texto.trim().length > 0 && !pending
  const podeAplicar = !!parsed && !pending && !savedResult

  const isPdf = arquivoNome?.toLowerCase().endsWith('.pdf')
  const FileIcon = isPdf ? FilePdf : FileXls

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="data-alteracao">Data da alteração</Label>
            <Input
              id="data-alteracao"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="max-w-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="texto-alteracao">Mensagem</Label>
            <Textarea
              id="texto-alteracao"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={10}
              placeholder={PLACEHOLDER}
              className="font-mono text-[12px] min-h-[200px]"
            />
          </div>

          {/* Upload de arquivo */}
          <div className="space-y-1.5">
            <Label>Upload de arquivo</Label>
            <div
              onClick={() => !uploadLoading && fileInputRef.current?.click()}
              className={cn(
                'flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors',
                uploadLoading
                  ? 'border-[var(--color-border)] bg-[var(--color-bg-subtle)] cursor-wait'
                  : 'border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] hover:border-[var(--color-accent)]/70 hover:bg-[var(--color-bg-hover)] cursor-pointer',
              )}
            >
              {arquivoNome ? (
                <>
                  <FileIcon size={18} weight="duotone" className="shrink-0 text-[var(--color-fg-muted)]" />
                  <span className="flex-1 min-w-0 text-[12px] font-medium text-[var(--color-fg)] truncate">
                    {arquivoNome}
                  </span>
                  {uploadLoading ? (
                    <span className="text-[11px] text-[var(--color-fg-muted)] animate-pulse shrink-0">
                      Analisando…
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setArquivoNome(null)
                        setParsed(null)
                        if (fileInputRef.current) fileInputRef.current.value = ''
                      }}
                      className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] shrink-0 inline-flex items-center justify-center h-5 w-5 rounded hover:bg-[var(--color-bg-hover)] transition-colors"
                    >
                      <X size={13} weight="bold" />
                    </button>
                  )}
                </>
              ) : (
                <>
                  <UploadSimple size={16} weight="bold" className="shrink-0 text-[var(--color-fg-subtle)]" />
                  <span className="text-[12px] text-[var(--color-fg-muted)]">
                    PDF ou XLSX — clique para selecionar
                  </span>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xlsx,.xls"
              disabled={uploadLoading}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleArquivoUpload(f)
              }}
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button
              type="button"
              onClick={analisar}
              disabled={!podeAnalisar}
              size="md"
            >
              {pending && !parsed ? 'Analisando…' : 'Analisar'}
            </Button>
            {parsed && !savedResult && (
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => {
                  setParsed(null)
                  setErr(null)
                }}
              >
                Limpar preview
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {err && (
        <div className="rounded-md border border-transparent bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-fg)] px-4 py-3 text-[13px] flex items-start justify-between gap-2">
          <span className="flex-1">{err}</span>
          <button
            type="button"
            onClick={() => setErr(null)}
            className="text-[var(--color-danger-soft-fg)]/70 hover:text-[var(--color-danger-soft-fg)] cursor-pointer shrink-0 inline-flex items-center justify-center h-5 w-5 rounded hover:bg-[var(--color-danger)]/10 transition-colors"
          >
            <X size={13} weight="bold" />
          </button>
        </div>
      )}

      {parsed && (
        <Card>
          <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-3">
            <div className="flex items-center gap-2">
              <Badge variant="info">{TIPO_LABEL[parsed.tipo]}</Badge>
              <Badge variant={confiancaVariant(parsed.confianca)}>
                {confiancaLabel(parsed.confianca)}
              </Badge>
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 px-5 py-4 text-[13px] sm:grid-cols-2">
            <FieldRow label="Rede" value={parsed.rede_id ?? '—'} />
            <FieldRow label="Loja" value={parsed.loja_nome_raw ?? '—'} />
            <FieldRow label="Entra" value={fmtSlot(parsed.entra)} />
            <FieldRow label="Sai" value={fmtSlot(parsed.sai)} />
            <FieldRow
              label="Motivo"
              value={parsed.motivo ?? '—'}
              fullWidth
            />
          </dl>

          <div className="flex items-center gap-3 border-t border-[var(--color-border)] px-5 py-3">
            {savedResult ? (
              <>
                <div className="inline-flex items-center gap-2 rounded-md border border-transparent bg-[var(--color-success-soft)] text-[var(--color-success-soft-fg)] px-3 py-1.5 text-[13px] font-semibold">
                  <Check size={14} weight="bold" />
                  <span>Salvo (status: {savedResult.status})</span>
                </div>
                {reprocessando && (
                  <Badge variant="default" className="animate-pulse">Reprocessando KPI…</Badge>
                )}
              </>
            ) : (
              <Button
                type="button"
                onClick={aplicar}
                disabled={!podeAplicar}
                size="md"
                className="bg-[var(--color-success)] text-white hover:opacity-90"
              >
                {pending ? 'Aplicando…' : 'Aplicar alteração'}
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

function FieldRow({
  label,
  value,
  fullWidth,
}: {
  label: string
  value: string
  fullWidth?: boolean
}) {
  return (
    <div className={cn(fullWidth && 'sm:col-span-2')}>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-[var(--color-fg)]">{value}</dd>
    </div>
  )
}
