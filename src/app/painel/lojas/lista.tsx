'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
import { Badge, Button, Card, Input, Label } from '@/components/ui'

type LojaRow = {
  id: string
  rede_id: string
  nome: string
  nome_curto: string | null
  codigo_escala: string | null
  codigo_unitrac: string | null
  nome_unitrac: string | null
  lat: number | null
  lng: number | null
  raio_metros: number
  entrega_d1_fixo: boolean
  ativo: boolean
}

type FilterMode = 'todas' | 'orfas' | string

type EditState = {
  nome: string
  codigo_escala: string
  codigo_unitrac: string
  lat: string
  lng: string
}

type CreateState = {
  rede_id: string
  nome: string
  nome_curto: string
  codigo_escala: string
  codigo_unitrac: string
  lat: string
  lng: string
}

const EMPTY_CREATE: CreateState = {
  rede_id: '',
  nome: '',
  nome_curto: '',
  codigo_escala: '',
  codigo_unitrac: '',
  lat: '',
  lng: '',
}

function buildUrl(filter: FilterMode, q: string): string {
  const params = new URLSearchParams()
  if (filter === 'orfas') params.set('orfa', 'true')
  else if (filter !== 'todas') params.set('rede_id', filter)
  if (q.trim()) params.set('q', q.trim())
  return `/api/lojas?${params.toString()}`
}

export function LojasList() {
  const [lojas, setLojas] = useState<LojaRow[]>([])
  const [filter, setFilter] = useState<FilterMode>('todas')
  const [q, setQ] = useState('')
  const [redes, setRedes] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [creating, setCreating] = useState(false)
  const [createState, setCreateState] = useState<CreateState>(EMPTY_CREATE)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const load = useCallback(() => {
    start(async () => {
      setError(null)
      const res = await fetch(buildUrl(filter, q))
      if (!res.ok) { setError(await res.text()); return }
      const data: LojaRow[] = await res.json()
      setLojas(data)
      const redeSet = new Set(data.map(l => l.rede_id))
      setRedes(prev => {
        const merged = new Set([...prev, ...redeSet])
        return Array.from(merged).sort()
      })
    })
  }, [filter, q])

  useEffect(() => { load() }, [load])

  function startEdit(loja: LojaRow) {
    setEditingId(loja.id)
    setEditState({
      nome: loja.nome,
      codigo_escala: loja.codigo_escala ?? '',
      codigo_unitrac: loja.codigo_unitrac ?? '',
      lat: loja.lat !== null ? String(loja.lat) : '',
      lng: loja.lng !== null ? String(loja.lng) : '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditState(null)
  }

  function saveEdit(id: string) {
    if (!editState) return
    start(async () => {
      setError(null)
      const res = await fetch(`/api/lojas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: editState.nome,
          codigo_escala: editState.codigo_escala || null,
          codigo_unitrac: editState.codigo_unitrac || null,
          lat: editState.lat ? parseFloat(editState.lat) : null,
          lng: editState.lng ? parseFloat(editState.lng) : null,
        }),
      })
      if (!res.ok) { setError(await res.text()); return }
      setEditingId(null)
      setEditState(null)
      load()
    })
  }

  function deleteRow(id: string) {
    if (!confirm('Desativar esta loja?')) return
    start(async () => {
      setError(null)
      const res = await fetch(`/api/lojas/${id}`, { method: 'DELETE' })
      if (!res.ok) { setError(await res.text()); return }
      load()
    })
  }

  function createLoja() {
    if (!createState.rede_id || !createState.nome) {
      setError('rede_id e nome são obrigatórios.')
      return
    }
    start(async () => {
      setError(null)
      const res = await fetch('/api/lojas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rede_id: createState.rede_id,
          nome: createState.nome,
          nome_curto: createState.nome_curto || null,
          codigo_escala: createState.codigo_escala || null,
          codigo_unitrac: createState.codigo_unitrac || null,
          lat: createState.lat ? parseFloat(createState.lat) : null,
          lng: createState.lng ? parseFloat(createState.lng) : null,
        }),
      })
      if (!res.ok) { setError(await res.text()); return }
      setCreating(false)
      setCreateState(EMPTY_CREATE)
      load()
    })
  }

  const chips: { label: string; value: FilterMode }[] = [
    { label: 'Todas', value: 'todas' },
    { label: 'Órfãs', value: 'orfas' },
    ...redes.map(r => ({ label: r, value: r as FilterMode })),
  ]

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="text"
          placeholder="Buscar por nome…"
          value={q}
          onChange={e => setQ(e.target.value)}
          className="w-56"
        />
        <div className="flex flex-wrap gap-1.5">
          {chips.map(c => {
            const active = filter === c.value
            return (
              <button
                key={c.value}
                onClick={() => setFilter(c.value)}
                className={
                  active
                    ? 'rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--color-accent-soft-fg)] transition'
                    : 'rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 py-1 text-[12px] font-medium text-[var(--color-fg-muted)] transition hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-fg)]'
                }
              >
                {c.label}
              </button>
            )
          })}
        </div>
        <div className="ml-auto">
          <Button
            onClick={() => { setCreating(true); setError(null) }}
            size="md"
          >
            + Nova loja
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-3 py-2 text-[12px] text-[var(--color-danger-soft-fg)]"
        >
          {error}
        </div>
      )}

      {/* Form criação */}
      {creating && (
        <Card>
          <div className="p-5">
            <h3 className="mb-4 text-[13px] font-semibold text-[var(--color-fg)]">
              Nova loja
            </h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <FormField
                label="Rede *"
                value={createState.rede_id}
                onChange={v => setCreateState(s => ({ ...s, rede_id: v }))}
              />
              <FormField
                label="Nome *"
                value={createState.nome}
                onChange={v => setCreateState(s => ({ ...s, nome: v }))}
              />
              <FormField
                label="Nome curto"
                value={createState.nome_curto}
                onChange={v => setCreateState(s => ({ ...s, nome_curto: v }))}
              />
              <FormField
                label="Código Escala"
                value={createState.codigo_escala}
                onChange={v => setCreateState(s => ({ ...s, codigo_escala: v }))}
              />
              <FormField
                label="Código Unitrac"
                value={createState.codigo_unitrac}
                onChange={v => setCreateState(s => ({ ...s, codigo_unitrac: v }))}
              />
              <FormField
                label="Latitude"
                value={createState.lat}
                onChange={v => setCreateState(s => ({ ...s, lat: v }))}
              />
              <FormField
                label="Longitude"
                value={createState.lng}
                onChange={v => setCreateState(s => ({ ...s, lng: v }))}
              />
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={createLoja} disabled={pending}>
                Criar
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setCreating(false); setCreateState(EMPTY_CREATE); setError(null) }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Tabela */}
      <Card className="overflow-hidden">
        {pending && (
          <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-5 py-2 text-[11px] text-[var(--color-fg-muted)]">
            Carregando…
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-muted)]">
                <th className="px-4 py-2.5 text-left font-semibold">Rede</th>
                <th className="px-4 py-2.5 text-left font-semibold">Nome</th>
                <th className="px-4 py-2.5 text-left font-semibold">Cód. Escala</th>
                <th className="px-4 py-2.5 text-left font-semibold">Cód. Unitrac</th>
                <th className="px-4 py-2.5 text-left font-semibold">GPS</th>
                <th className="px-4 py-2.5 text-left font-semibold">D+1</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {lojas.length === 0 && !pending && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-[13px] text-[var(--color-fg-muted)]"
                  >
                    Nenhuma loja encontrada.
                  </td>
                </tr>
              )}
              {lojas.map((loja) => {
                const isEditing = editingId === loja.id

                if (isEditing && editState) {
                  return (
                    <tr
                      key={loja.id}
                      className="border-t border-[var(--color-border)] bg-[var(--color-accent-soft)]/40"
                    >
                      <td className="px-4 py-2 text-[12px] text-[var(--color-fg-muted)]">
                        {loja.rede_id}
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          value={editState.nome}
                          onChange={e => setEditState(s => s ? { ...s, nome: e.target.value } : s)}
                          className="h-8"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          value={editState.codigo_escala}
                          onChange={e => setEditState(s => s ? { ...s, codigo_escala: e.target.value } : s)}
                          className="h-8 w-24"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          value={editState.codigo_unitrac}
                          onChange={e => setEditState(s => s ? { ...s, codigo_unitrac: e.target.value } : s)}
                          className="h-8 w-28"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          <Input
                            value={editState.lat}
                            placeholder="lat"
                            onChange={e => setEditState(s => s ? { ...s, lat: e.target.value } : s)}
                            className="h-8 w-24"
                          />
                          <Input
                            value={editState.lng}
                            placeholder="lng"
                            onChange={e => setEditState(s => s ? { ...s, lng: e.target.value } : s)}
                            className="h-8 w-24"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2 text-[12px] text-[var(--color-fg-muted)]">
                        {loja.entrega_d1_fixo ? 'Sim' : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={() => saveEdit(loja.id)}
                            disabled={pending}
                          >
                            Salvar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={cancelEdit}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr
                    key={loja.id}
                    className="border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-hover)]"
                  >
                    <td className="px-4 py-2.5 text-[12px] font-medium text-[var(--color-fg-muted)]">
                      {loja.rede_id}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-[var(--color-fg)]">
                      {loja.nome}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-[var(--color-fg-muted)]">
                      {loja.codigo_escala ?? '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      {loja.codigo_unitrac ? (
                        <span className="font-mono text-[12px] text-[var(--color-fg-muted)]">
                          {loja.codigo_unitrac}
                        </span>
                      ) : (
                        <Badge variant="warning">Órfã</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[12px]">
                      {loja.lat !== null && loja.lng !== null ? (
                        <span className="text-[var(--color-success-soft-fg)]">
                          {loja.lat.toFixed(4)}, {loja.lng.toFixed(4)}
                        </span>
                      ) : (
                        <span className="text-[var(--color-fg-subtle)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[12px]">
                      {loja.entrega_d1_fixo ? (
                        <span className="font-medium text-[var(--color-accent)]">Sim</span>
                      ) : (
                        <span className="text-[var(--color-fg-subtle)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(loja)}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteRow(loja.id)}
                          disabled={pending}
                          className="hover:text-[var(--color-danger)]"
                        >
                          Excluir
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function FormField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}
