'use client'
import { useState, useOptimistic, useTransition, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { DataGridProps } from 'react-data-grid'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeQueue, type ReviewQueueRow } from '@/lib/hooks/useRealtimeQueue'
import { useGridKeyNav } from '@/lib/hooks/useGridKeyNav'
import { ApplyToSimilarSheet } from './ApplyToSimilarSheet'

 
const DataGrid = dynamic(() => import('react-data-grid').then(m => ({ default: m.DataGrid })), { ssr: false }) as React.ComponentType<DataGridProps<ReviewQueueRow>>

// React is needed for JSX and the ComponentType cast above
import React from 'react'

export function FilaRevisao() {
  const { rows, setRows, loading } = useRealtimeQueue()
  const [optimisticRows, dispatchOptimistic] = useOptimistic(
    rows,
    (state: ReviewQueueRow[], removedId: string) => state.filter(r => r.id !== removedId)
  )
  const [, startTransition] = useTransition()
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [pending, setPending] = useState<{ id: string; name: string } | null>(null)
  const supabase = createClient()

  const onNext = useCallback(() => setSelectedIdx(i => Math.min(i + 1, optimisticRows.length - 1)), [optimisticRows.length])
  const onPrev = useCallback(() => setSelectedIdx(i => Math.max(i - 1, 0)), [])
  useGridKeyNav(onNext, onPrev)

  async function approve(ids: string[], resolvedName: string) {
    startTransition(async () => {
      ids.forEach(id => dispatchOptimistic(id))
      const { error } = await supabase.rpc('bulk_approve_rows', {
        p_ids: ids, p_resolved_name: resolvedName
      })
      if (error) {
        const { data } = await supabase.from('review_queue').select('*').eq('status', 'pending')
        setRows(data ?? [])
      }
    })
  }

  const columns: DataGridProps<ReviewQueueRow>['columns'] = [
    { key: 'raw_name', name: 'Nome Original', width: 250 },
    { key: 'matched_name', name: 'Sugestao', width: 250 },
    {
      key: 'match_score', name: 'Score', width: 80,
      renderCell: ({ row }) =>
        row.match_score ? `${(row.match_score * 100).toFixed(0)}%` : '-'
    },
    { key: 'rede_id', name: 'Rede', width: 120 },
    { key: 'data', name: 'Data', width: 110 },
    {
      key: 'actions', name: 'Acoes', width: 200,
      renderCell: ({ row }) => (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', height: '100%' }}>
          <button onClick={() => { setPending({ id: row.id, name: row.matched_name ?? row.raw_name }); setSheetOpen(true) }}
            style={{ padding: '4px 10px', background: '#10b981', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
            Aprovar
          </button>
          <button onClick={() => approve([row.id], row.raw_name)}
            style={{ padding: '4px 10px', background: '#e5e7eb', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
            Pular
          </button>
        </div>
      )
    }
  ]

  if (loading) return <p>Carregando...</p>
  if (optimisticRows.length === 0)
    return <p style={{ color: '#666', padding: 24 }}>Fila vazia &mdash; nenhum item pendente.</p>

  return (
    <>
      <p style={{ marginBottom: 8, fontSize: 14, color: '#666' }}>
        {optimisticRows.length} item(s) pendente(s) &middot; j/k para navegar
      </p>
      <DataGrid
        columns={columns}
        rows={optimisticRows}
        rowKeyGetter={(row) => row.id}
        rowHeight={44}
        selectedRows={new Set([optimisticRows[selectedIdx]?.id].filter((id): id is string => Boolean(id)))}
        onSelectedRowsChange={() => {}}
        style={{ height: '60vh' }}
      />
      {pending && (
        <ApplyToSimilarSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          resolvedName={pending.name}
          currentRowId={pending.id}
          onApply={ids => approve(ids, pending.name)}
        />
      )}
    </>
  )
}
