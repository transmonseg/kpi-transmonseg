'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { CaretDown, X } from '@phosphor-icons/react/dist/ssr'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Textarea,
  cn,
  type BadgeProps,
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

type AlteracaoApi = {
  id: string
  data_alteracao: string
  tipo: string
  loja_raw: string | null
  rede_id: string | null
  motorista_entra: string | null
  motorista_sai: string | null
  placa_entra_norm: string | null
  placa_sai_norm: string | null
  motivo: string | null
  status: string
  confianca: string | null
  created_at: string
}

const PLACEHOLDER = `Cole aqui a mensagem de alteração. Exemplo:

🚨ALTERAÇÃO 🚨
Prezunic Caxias centenário
Entra: Sidnei 674 LQE5401
Sai: Anderson 811 LCE4337
Motivo: Pneu do caminhão furou`

const TIPO_LABEL: Record<AlteracaoParsed['tipo'], string> = {
  SUBSTITUICAO: 'Substituição',
  INCLUSAO: 'Inclusão',
  COMUNICADO: 'Comunicado',
  INFORMATIVO: 'Informativo',
  SWAP: 'Swap',
}

function confiancaVariant(c: string | null): BadgeProps['variant'] {
  if (c === 'alta') return 'success'
  if (c === 'media') return 'warning'
  if (c === 'baixa') return 'danger'
  return 'default'
}

function confiancaLabel(c: string | null): string {
  if (c === 'alta') return 'Confiança alta'
  if (c === 'media') return 'Confiança média'
  if (c === 'baixa') return 'Confiança baixa'
  return '—'
}

function fmtSlot(slot: VeiculoSlot | null): string {
  if (!slot) return '—'
  const parts: string[] = []
  if (slot.motorista_nome) parts.push(slot.motorista_nome)
  if (slot.motorista_codigo !== null && slot.motorista_codigo !== undefined)
    parts.push(`#${slot.motorista_codigo}`)
  if (slot.placa_norm) parts.push(slot.placa_norm)
  return parts.length ? parts.join(' · ') : '—'
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-[12px] text-[var(--color-fg)]">{value}</dd>
    </div>
  )
}

export function AlteracaoInline({ data }: { data: string }) {
  const [expanded, setExpanded] = useState(false)
  const [texto, setTexto] = useState('')
  const [parsed, setParsed] = useState<AlteracaoParsed | null>(null)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const [aplicadas, setAplicadas] = useState<AlteracaoApi[]>([])
  const [loadingList, setLoadingList] = useState(false)

  const refreshList = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await fetch(`/api/alteracoes?data=${data}`)
      if (res.ok) {
        const rows = (await res.json()) as AlteracaoApi[]
        setAplicadas(rows ?? [])
      } else {
        setAplicadas([])
      }
    } catch {
      setAplicadas([])
    } finally {
      setLoadingList(false)
    }
  }, [data])

  useEffect(() => {
    let active = true
    let settled = false
    // Mostra "carregando" só se a fetch demorar mais de 120ms — evita flash
    const t = setTimeout(() => {
      if (active && !settled) setLoadingList(true)
    }, 120)
    fetch(`/api/alteracoes?data=${data}`)
      .then((res) => (res.ok ? (res.json() as Promise<AlteracaoApi[]>) : Promise.resolve<AlteracaoApi[]>([])))
      .then((rows) => {
        if (active) setAplicadas(rows ?? [])
      })
      .catch(() => {
        if (active) setAplicadas([])
      })
      .finally(() => {
        settled = true
        clearTimeout(t)
        if (active) setLoadingList(false)
      })
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [data])

  function analisar() {
    setErr(null)
    setSavedFlash(false)
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
          body: JSON.stringify({ texto, data, aplicar: true }),
        })
        if (!res.ok) throw new Error(await res.text())
        setSavedFlash(true)
        setTexto('')
        setParsed(null)
        await refreshList()
        setTimeout(() => setSavedFlash(false), 4000)
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao aplicar.')
      }
    })
  }

  const podeAnalisar = texto.trim().length > 0 && !pending
  const count = aplicadas.length
  const collapsedDefault = count === 0 && !expanded

  return (
    <Card>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'w-full flex items-center justify-between px-5 py-3 cursor-pointer',
          'text-left transition-colors hover:bg-[var(--color-bg-hover)]',
          expanded && 'border-b border-[var(--color-border)]',
        )}
      >
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
            Alterações de Escala
          </p>
          {count > 0 && <Badge variant="info">{count} aplicada{count === 1 ? '' : 's'}</Badge>}
          {savedFlash && <Badge variant="success">salvo</Badge>}
        </div>
        <CaretDown
          size={16}
          weight="bold"
          className={cn(
            'text-[var(--color-fg-muted)] transition-transform duration-200',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {expanded && (
        <CardContent className="flex flex-col gap-3">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={6}
            placeholder={PLACEHOLDER}
            className="font-mono text-[12px]"
          />

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={analisar}
              disabled={!podeAnalisar}
            >
              {pending && !parsed ? 'Analisando…' : 'Analisar'}
            </Button>
            {parsed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setParsed(null)
                  setErr(null)
                }}
              >
                Limpar preview
              </Button>
            )}
          </div>

          {err && (
            <div className="rounded-md bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/30 px-3 py-2 text-[12px] text-[var(--color-danger-soft-fg)] flex items-start justify-between gap-2">
              <span className="flex-1">{err}</span>
              <button
                onClick={() => setErr(null)}
                className="text-[var(--color-danger-soft-fg)]/70 hover:text-[var(--color-danger-soft-fg)] cursor-pointer shrink-0 inline-flex items-center justify-center h-5 w-5 rounded hover:bg-[var(--color-danger)]/10 transition-colors"
                title="Dispensar"
              >
                <X size={13} weight="bold" />
              </button>
            </div>
          )}

          {parsed && (
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <Badge variant="info">{TIPO_LABEL[parsed.tipo]}</Badge>
                  <Badge variant={confiancaVariant(parsed.confianca)}>
                    {confiancaLabel(parsed.confianca)}
                  </Badge>
                </div>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2.5 px-3 py-3">
                <Field label="Rede" value={parsed.rede_id ?? '—'} />
                <Field label="Loja" value={parsed.loja_nome_raw ?? '—'} />
                <Field label="Entra" value={fmtSlot(parsed.entra)} />
                <Field label="Sai" value={fmtSlot(parsed.sai)} />
                <div className="sm:col-span-2">
                  <Field label="Motivo" value={parsed.motivo ?? '—'} />
                </div>
              </dl>

              <div className="border-t border-[var(--color-border)] px-3 py-2 flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={aplicar}
                  disabled={pending}
                >
                  {pending ? 'Aplicando…' : 'Aplicar alteração'}
                </Button>
                {parsed.confianca === 'baixa' && (
                  <span className="text-[11px] text-[var(--color-fg-muted)]">
                    Confiança baixa — será salva como pendente.
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Lista de aplicadas/pendentes do dia */}
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] mt-1">
              {loadingList ? 'Carregando…' : count === 0 ? 'Nenhuma alteração registrada hoje' : 'Registradas hoje'}
            </p>
            {aplicadas.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge
                    variant={
                      a.status === 'aplicada'
                        ? 'success'
                        : a.status === 'pendente'
                          ? 'warning'
                          : 'default'
                    }
                  >
                    {a.status}
                  </Badge>
                  <Badge variant="default">{a.tipo}</Badge>
                  <span
                    className="text-[12px] text-[var(--color-fg)] truncate"
                    title={a.loja_raw ?? ''}
                  >
                    {a.loja_raw ?? '—'}
                    {a.motorista_entra && (
                      <span className="text-[var(--color-fg-muted)]">
                        {' '}· entra {a.motorista_entra}
                      </span>
                    )}
                  </span>
                </div>
                <span className="text-[11px] text-[var(--color-fg-subtle)] tabular-nums shrink-0">
                  {formatTime(a.created_at)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      )}

      {!expanded && count > 0 && (
        <div className="px-5 pb-3 -mt-1">
          <span className="text-[11px] text-[var(--color-fg-subtle)]">
            Clique para expandir e registrar novas alterações.
          </span>
        </div>
      )}

      {!expanded && collapsedDefault && (
        <div className="px-5 pb-3 -mt-1">
          <span className="text-[11px] text-[var(--color-fg-subtle)]">
            Substituições, inclusões e comunicados de motorista vão aqui.
          </span>
        </div>
      )}
    </Card>
  )
}
