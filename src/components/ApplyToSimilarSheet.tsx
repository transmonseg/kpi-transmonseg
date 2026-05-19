'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface SimilarRow { id: string; raw_name: string; match_score: number }

interface Props {
  open: boolean
  onClose: () => void
  resolvedName: string
  currentRowId: string
  onApply: (ids: string[]) => Promise<void>
}

export function ApplyToSimilarSheet({ open, onClose, resolvedName, currentRowId, onApply }: Props) {
  const [similar, setSimilar] = useState<SimilarRow[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (!open) return
    supabase.rpc('find_similar_pending', {
      p_name: resolvedName, p_row_id: currentRowId, p_threshold: 0.4
    }).then(({ data }) => setSimilar(data ?? []))
  }, [open, resolvedName, currentRowId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleApply() {
    setLoading(true)
    await onApply([currentRowId, ...Array.from(selected)])
    setLoading(false)
    onClose()
  }

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white',
      padding: 24, boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
      borderRadius: '16px 16px 0 0', zIndex: 100
    }}>
      <h3 style={{ margin: '0 0 16px' }}>Aplicar &ldquo;{resolvedName}&rdquo; a linhas similares?</h3>
      {similar.length === 0
        ? <p style={{ color: '#666' }}>Nenhuma linha similar na fila.</p>
        : <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {similar.map(row => (
              <label key={row.id} style={{ display: 'flex', gap: 8, padding: '6px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.has(row.id)}
                  onChange={e => {
                    const next = new Set(selected)
                    e.target.checked ? next.add(row.id) : next.delete(row.id)
                    setSelected(next)
                  }} />
                <span>{row.raw_name}</span>
                <span style={{ marginLeft: 'auto', color: '#999', fontSize: 12 }}>
                  {(row.match_score * 100).toFixed(0)}%
                </span>
              </label>
            ))}
          </div>
      }
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button onClick={onClose}
          style={{ flex: 1, padding: 10, background: '#f5f5f5', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          Cancelar
        </button>
        <button onClick={handleApply} disabled={loading}
          style={{ flex: 2, padding: 10, background: '#10b981', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
          {loading ? 'Aplicando...' : `Aplicar a ${selected.size + 1} linha(s)`}
        </button>
      </div>
    </div>
  )
}
