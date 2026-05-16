'use client'

import { useState, useTransition } from 'react'
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
  const [texto, setTexto] = useState('')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [parsed, setParsed] = useState<AlteracaoParsed | null>(null)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [savedResult, setSavedResult] = useState<AplicarResult | null>(null)

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
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao aplicar.')
      }
    })
  }

  const podeAnalisar = texto.trim().length > 0 && !pending
  const podeAplicar = !!parsed && !pending && !savedResult

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
        <div
          className={cn(
            'rounded-md border px-4 py-3 text-[13px]',
            'border-transparent bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-fg)]',
          )}
        >
          {err}
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
              <div
                className={cn(
                  'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] font-semibold',
                  'border-transparent bg-[var(--color-success-soft)] text-[var(--color-success-soft-fg)]',
                )}
              >
                <span aria-hidden="true">✓</span>
                <span>Salvo (status: {savedResult.status})</span>
              </div>
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
