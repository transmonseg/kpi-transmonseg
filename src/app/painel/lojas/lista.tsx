'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'

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
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Buscar por nome…"
          value={q}
          onChange={e => setQ(e.target.value)}
          className="rounded-lg border border-border-strong bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition w-56"
        />
        <div className="flex flex-wrap gap-1.5">
          {chips.map(c => (
            <button
              key={c.value}
              onClick={() => setFilter(c.value)}
              className={
                filter === c.value
                  ? 'px-3 py-1 rounded-full text-xs font-semibold bg-brand-600 text-white transition'
                  : 'px-3 py-1 rounded-full text-xs font-medium bg-surface-hover text-ink-soft hover:bg-brand-50 hover:text-brand-700 transition'
              }
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <button
            onClick={() => { setCreating(true); setError(null) }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition shadow-sm shadow-brand-600/20"
          >
            + Nova loja
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {creating && (
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-ink mb-4">Nova loja</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
          <div className="flex gap-2 mt-4">
            <button
              onClick={createLoja}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition disabled:opacity-50"
            >
              Criar
            </button>
            <button
              onClick={() => { setCreating(false); setCreateState(EMPTY_CREATE); setError(null) }}
              className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-soft hover:bg-surface-hover transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        {pending && (
          <div className="px-5 py-2 text-xs text-ink-muted bg-surface-alt border-b border-border">
            Carregando…
          </div>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand-600 text-white text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3 font-semibold">Rede</th>
              <th className="text-left px-4 py-3 font-semibold">Nome</th>
              <th className="text-left px-4 py-3 font-semibold">Cód. Escala</th>
              <th className="text-left px-4 py-3 font-semibold">Cód. Unitrac</th>
              <th className="text-left px-4 py-3 font-semibold">GPS</th>
              <th className="text-left px-4 py-3 font-semibold">D+1</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {lojas.length === 0 && !pending && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-ink-muted">
                  Nenhuma loja encontrada.
                </td>
              </tr>
            )}
            {lojas.map((loja, i) => {
              const isEditing = editingId === loja.id
              const rowClass = i % 2 === 0 ? 'bg-white' : 'bg-surface-alt'

              if (isEditing && editState) {
                return (
                  <tr key={loja.id} className="border-t border-border bg-brand-50">
                    <td className="px-4 py-2 text-xs text-ink-soft">{loja.rede_id}</td>
                    <td className="px-4 py-2">
                      <input
                        value={editState.nome}
                        onChange={e => setEditState(s => s ? { ...s, nome: e.target.value } : s)}
                        className="w-full rounded border border-border-strong px-2 py-1 text-sm text-ink focus:border-brand-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editState.codigo_escala}
                        onChange={e => setEditState(s => s ? { ...s, codigo_escala: e.target.value } : s)}
                        className="w-24 rounded border border-border-strong px-2 py-1 text-sm text-ink focus:border-brand-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editState.codigo_unitrac}
                        onChange={e => setEditState(s => s ? { ...s, codigo_unitrac: e.target.value } : s)}
                        className="w-28 rounded border border-border-strong px-2 py-1 text-sm text-ink focus:border-brand-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        <input
                          value={editState.lat}
                          placeholder="lat"
                          onChange={e => setEditState(s => s ? { ...s, lat: e.target.value } : s)}
                          className="w-24 rounded border border-border-strong px-2 py-1 text-sm text-ink focus:border-brand-500 focus:outline-none"
                        />
                        <input
                          value={editState.lng}
                          placeholder="lng"
                          onChange={e => setEditState(s => s ? { ...s, lng: e.target.value } : s)}
                          className="w-24 rounded border border-border-strong px-2 py-1 text-sm text-ink focus:border-brand-500 focus:outline-none"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-2 text-ink-muted text-xs">
                      {loja.entrega_d1_fixo ? 'Sim' : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => saveEdit(loja.id)}
                          disabled={pending}
                          className="text-xs font-semibold text-brand-600 hover:text-brand-800 transition disabled:opacity-50"
                        >
                          Salvar
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="text-xs font-medium text-ink-soft hover:text-ink transition"
                        >
                          Cancelar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              }

              return (
                <tr key={loja.id} className={`${rowClass} border-t border-border hover:bg-brand-50 transition`}>
                  <td className="px-4 py-2.5 text-xs font-medium text-ink-soft">{loja.rede_id}</td>
                  <td className="px-4 py-2.5 font-medium text-ink">{loja.nome}</td>
                  <td className="px-4 py-2.5 text-ink-soft font-mono text-xs">{loja.codigo_escala ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    {loja.codigo_unitrac ? (
                      <span className="font-mono text-xs text-ink-soft">{loja.codigo_unitrac}</span>
                    ) : (
                      <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                        Órfã
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {loja.lat !== null && loja.lng !== null ? (
                      <span className="text-emerald-700 font-medium">
                        {loja.lat.toFixed(4)}, {loja.lng.toFixed(4)}
                      </span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink-soft">
                    {loja.entrega_d1_fixo ? (
                      <span className="text-brand-600 font-semibold">Sim</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-3 justify-end">
                      <button
                        onClick={() => startEdit(loja)}
                        className="text-xs font-medium text-ink-soft hover:text-brand-600 transition"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => deleteRow(loja.id)}
                        disabled={pending}
                        className="text-xs font-medium text-ink-soft hover:text-red-600 transition disabled:opacity-50"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
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
    <div>
      <label className="block text-xs font-medium text-ink-soft mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg border border-border-strong bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition"
      />
    </div>
  )
}
