'use client'

import { useState, useTransition } from 'react'
import { Check, X } from '@phosphor-icons/react/dist/ssr'
import { Button, Card, CardContent, Input, Label, Textarea } from '@/components/ui'
import type { AlteracaoBloco } from '@/lib/parsers/alteracoes-v2.types'
import { AlteracaoCard } from './AlteracaoCard'

interface AplicarResult {
  aplicados: number
  erros: Array<{ idx: number; msg: string }>
  redes_afetadas: string[]
  blocos_aplicados_em_escala: number
}

const PLACEHOLDER = `Cole aqui a mensagem do WhatsApp:

Alteração zona sul
Filial 43
Sai: Douglas LTE-0A64
Entra: Eduardo LQA-5883

Filial 23
Sai: Eduardo LQA-5883
Entra: Douglas LTE-0A64`

export function AlteracoesV2Form() {
  const [texto, setTexto] = useState('')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [blocos, setBlocos] = useState<AlteracaoBloco[] | null>(null)
  const [pending, start] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<AplicarResult | null>(null)

  function analisar() {
    setErro(null)
    setResultado(null)
    setBlocos(null)
    start(async () => {
      try {
        const res = await fetch('/api/alteracoes/parsear-v2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto }),
        })
        if (!res.ok) throw new Error(await res.text())
        const j = (await res.json()) as { blocos: AlteracaoBloco[] }
        setBlocos(j.blocos)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Erro ao analisar')
      }
    })
  }

  function aplicarTudo() {
    if (!blocos) return
    setErro(null)
    start(async () => {
      try {
        const res = await fetch('/api/alteracoes/aplicar-lote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blocos, data }),
        })
        if (!res.ok) throw new Error(await res.text())
        const j = (await res.json()) as AplicarResult
        setResultado(j)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Erro ao aplicar')
      }
    })
  }

  function atualizarBloco(idx: number, next: AlteracaoBloco) {
    setBlocos((prev) => prev?.map((b, i) => (i === idx ? next : b)) ?? null)
  }

  function descartarBloco(idx: number) {
    setBlocos((prev) => prev?.filter((_, i) => i !== idx) ?? null)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="data">Data da alteração</Label>
            <Input
              id="data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="max-w-xs"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="texto">Mensagem</Label>
            <Textarea
              id="texto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={8}
              placeholder={PLACEHOLDER}
              className="font-mono text-[12px]"
            />
          </div>

          <Button onClick={analisar} disabled={!texto.trim() || pending}>
            {pending && !blocos ? 'Analisando…' : 'Analisar'}
          </Button>
        </CardContent>
      </Card>

      {erro && (
        <div className="rounded-md bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-fg)] px-3 py-2 text-[12px] flex justify-between gap-2">
          <span>{erro}</span>
          <button onClick={() => setErro(null)}><X size={13} /></button>
        </div>
      )}

      {blocos && blocos.length === 0 && (
        <div className="rounded-md border border-dashed border-[var(--color-border-strong)] px-3 py-4 text-[12px] text-[var(--color-fg-muted)] text-center">
          Nenhuma alteração detectada. Verifique a mensagem.
        </div>
      )}

      {blocos && blocos.length > 0 && (
        <>
          <div className="space-y-2">
            {blocos.map((b, i) => (
              <AlteracaoCard
                key={i}
                bloco={b}
                onChange={(next) => atualizarBloco(i, next)}
                onDescartar={() => descartarBloco(i)}
                aplicando={pending}
              />
            ))}
          </div>

          {resultado ? (
            <div className="rounded-md bg-[var(--color-success-soft)] text-[var(--color-success-soft-fg)] px-3 py-2 text-[12px] flex items-center gap-2">
              <Check size={14} weight="bold" />
              <span>
                {resultado.aplicados} alteração(ões) salva(s){' '}
                {resultado.blocos_aplicados_em_escala > 0 && (
                  <>· {resultado.blocos_aplicados_em_escala} linha(s) de escala atualizada(s)</>
                )}
                {resultado.redes_afetadas?.length > 0 && (
                  <>· Redes: {resultado.redes_afetadas.join(', ')}</>
                )}
                <br />
                <span className="text-[11px] opacity-80">
                  Agora gere o KPI em /painel/kpi/simples na data {data} — as alterações serão aplicadas automaticamente.
                </span>
              </span>
            </div>
          ) : (
            <Button
              onClick={aplicarTudo}
              disabled={pending || blocos.length === 0}
              className="bg-[var(--color-success)] text-white"
            >
              {pending ? 'Aplicando…' : `Aplicar ${blocos.length} alteração(ões)`}
            </Button>
          )}
        </>
      )}
    </div>
  )
}
