'use client'

import { useState, useTransition } from 'react'

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

const PLACEHOLDER = `🚨ALTERAÇÃO 🚨
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

function confiancaClasses(c: AlteracaoParsed['confianca']): string {
  if (c === 'alta') return 'bg-green-100 text-green-800 border border-green-200'
  if (c === 'media') return 'bg-amber-100 text-amber-800 border border-amber-200'
  return 'bg-red-100 text-red-800 border border-red-200'
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
      <div>
        <label
          htmlFor="data-alteracao"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Data da alteração
        </label>
        <input
          id="data-alteracao"
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="w-full max-w-xs rounded-md border border-border bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
        />
      </div>

      <div>
        <label
          htmlFor="texto-alteracao"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Mensagem
        </label>
        <textarea
          id="texto-alteracao"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={10}
          placeholder={PLACEHOLDER}
          className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand-500 focus:outline-none font-mono"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={analisar}
          disabled={!podeAnalisar}
          className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700 transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending && !parsed ? 'Analisando…' : 'Analisar'}
        </button>
        {parsed && !savedResult && (
          <button
            type="button"
            onClick={() => {
              setParsed(null)
              setErr(null)
            }}
            className="text-sm text-ink-soft hover:text-ink transition"
          >
            Limpar preview
          </button>
        )}
      </div>

      {err && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </div>
      )}

      {parsed && (
        <div className="rounded-lg border border-border bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 border border-brand-100">
                {TIPO_LABEL[parsed.tipo]}
              </span>
              <span
                className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ${confiancaClasses(parsed.confianca)}`}
              >
                {confiancaLabel(parsed.confianca)}
              </span>
            </div>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-ink-muted">
                Rede
              </dt>
              <dd className="mt-0.5 text-ink">{parsed.rede_id ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-ink-muted">
                Loja
              </dt>
              <dd className="mt-0.5 text-ink">{parsed.loja_nome_raw ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-ink-muted">
                Entra
              </dt>
              <dd className="mt-0.5 text-ink">{fmtSlot(parsed.entra)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-ink-muted">
                Sai
              </dt>
              <dd className="mt-0.5 text-ink">{fmtSlot(parsed.sai)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wider text-ink-muted">
                Motivo
              </dt>
              <dd className="mt-0.5 text-ink">{parsed.motivo ?? '—'}</dd>
            </div>
          </dl>

          <div className="border-t border-border px-5 py-3 flex items-center gap-3">
            {savedResult ? (
              <div className="inline-flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm font-semibold text-green-800">
                <span aria-hidden="true">✓</span>
                <span>
                  Salvo (status: {savedResult.status})
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={aplicar}
                disabled={!podeAplicar}
                className="inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? 'Aplicando…' : 'Aplicar alteração'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
