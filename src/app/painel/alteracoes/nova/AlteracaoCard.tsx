'use client'

import { Database, X } from '@phosphor-icons/react/dist/ssr'
import { Badge, Input, cn } from '@/components/ui'
import type {
  AlteracaoBloco,
  SlotVeiculo,
  FonteCampo,
} from '@/lib/parsers/alteracoes-v2.types'

interface Props {
  bloco: AlteracaoBloco
  onChange: (next: AlteracaoBloco) => void
  onDescartar: () => void
  aplicando?: boolean
}

function confiancaVariant(c: AlteracaoBloco['confianca']) {
  return c === 'alta' ? 'success' : c === 'media' ? 'warning' : 'danger'
}

function FonteIcone({ fonte }: { fonte: FonteCampo }) {
  if (fonte !== 'banco') return null
  return (
    <span title="Preenchido do banco" className="inline-flex">
      <Database
        size={11}
        weight="duotone"
        className="text-[var(--color-accent)] shrink-0"
      />
    </span>
  )
}

export function AlteracaoCard({ bloco, onChange, onDescartar, aplicando }: Props) {
  function updateSlot(key: 'sai' | 'entra', patch: Partial<SlotVeiculo>) {
    const slot: SlotVeiculo = {
      ...(bloco[key] ?? {
        motorista_nome: null,
        motorista_codigo: null,
        placa_norm: null,
        placa_raw: null,
        fonte_nome: null,
        fonte_codigo: null,
        fonte_placa: null,
      }),
      ...patch,
    }
    onChange({ ...bloco, [key]: slot })
  }

  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="default">{bloco.rede_id ?? '(sem rede)'}</Badge>
          {bloco.filial && <Badge variant="info">Filial {bloco.filial}</Badge>}
          {bloco.loja_nome_raw && (
            <span className="text-[11px] text-[var(--color-fg-muted)]">
              {bloco.loja_nome_raw}
            </span>
          )}
          <Badge variant={confiancaVariant(bloco.confianca)}>
            {bloco.confianca}
          </Badge>
        </div>
        <button
          onClick={onDescartar}
          className="text-[var(--color-fg-subtle)] hover:text-[var(--color-danger)] p-0.5"
          disabled={aplicando}
        >
          <X size={14} weight="bold" />
        </button>
      </div>

      {/* Sai */}
      <SlotRow
        label="Sai"
        slot={bloco.sai}
        onChange={(p) => updateSlot('sai', p)}
      />

      {/* Entra */}
      <SlotRow
        label="Entra"
        slot={bloco.entra}
        onChange={(p) => updateSlot('entra', p)}
      />

      {/* Motivo */}
      <div>
        <label className="block text-[10px] uppercase font-semibold text-[var(--color-fg-subtle)] mb-0.5">
          Motivo
        </label>
        <Input
          value={bloco.motivo ?? ''}
          onChange={(e) => onChange({ ...bloco, motivo: e.target.value || null })}
          placeholder="Motivo..."
          className="text-[12px]"
        />
      </div>

      {/* Warnings */}
      {bloco.warnings.length > 0 && (
        <ul className="text-[10px] text-[var(--color-warning-soft-fg)] bg-[var(--color-warning-soft)] rounded px-2 py-1 list-disc list-inside">
          {bloco.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SlotRow({
  label,
  slot,
  onChange,
}: {
  label: string
  slot: SlotVeiculo | null
  onChange: (patch: Partial<SlotVeiculo>) => void
}) {
  const s: SlotVeiculo =
    slot ?? {
      motorista_nome: null,
      motorista_codigo: null,
      placa_norm: null,
      placa_raw: null,
      fonte_nome: null,
      fonte_codigo: null,
      fonte_placa: null,
    }
  return (
    <div className="grid grid-cols-[60px_1fr_80px_120px] gap-2 items-center">
      <span className="text-[10px] uppercase font-semibold text-[var(--color-fg-subtle)]">
        {label}
      </span>
      <div className="relative">
        <Input
          value={s.motorista_nome ?? ''}
          onChange={(e) =>
            onChange({
              motorista_nome: e.target.value || null,
              fonte_nome: 'mensagem',
            })
          }
          placeholder="Motorista"
          className="text-[12px] pr-5"
        />
        <span className="absolute right-1 top-1/2 -translate-y-1/2">
          <FonteIcone fonte={s.fonte_nome} />
        </span>
      </div>
      <div className="relative">
        <Input
          value={s.motorista_codigo?.toString() ?? ''}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10)
            onChange({
              motorista_codigo: isNaN(n) ? null : n,
              fonte_codigo: 'mensagem',
            })
          }}
          placeholder="Cód"
          className="text-[12px] pr-5"
        />
        <span className="absolute right-1 top-1/2 -translate-y-1/2">
          <FonteIcone fonte={s.fonte_codigo} />
        </span>
      </div>
      <div className="relative">
        <Input
          value={s.placa_norm ?? ''}
          onChange={(e) => {
            const v = e.target.value.toUpperCase() || null
            onChange({ placa_norm: v, placa_raw: v, fonte_placa: 'mensagem' })
          }}
          placeholder="Placa"
          className={cn('text-[12px] font-mono pr-5')}
        />
        <span className="absolute right-1 top-1/2 -translate-y-1/2">
          <FonteIcone fonte={s.fonte_placa} />
        </span>
      </div>
    </div>
  )
}
