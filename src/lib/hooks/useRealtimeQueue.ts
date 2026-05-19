import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface ReviewQueueRow {
  id: string
  raw_name: string
  matched_name: string | null
  match_score: number | null
  algorithm: string | null
  rede_id: string
  data: string
  status: string
  version: number
}

export function useRealtimeQueue() {
  const [rows, setRows] = useState<ReviewQueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('review_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .then(({ data }) => { setRows(data ?? []); setLoading(false) })

    const channel = supabase
      .channel('review_queue_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'review_queue' }, (payload) => {
        if (payload.eventType === 'INSERT' && (payload.new as ReviewQueueRow).status === 'pending') {
          setRows(prev => [...prev, payload.new as ReviewQueueRow])
        } else if (payload.eventType === 'UPDATE') {
          setRows(prev => {
            const updated = payload.new as ReviewQueueRow
            if (updated.status !== 'pending') return prev.filter(r => r.id !== updated.id)
            return prev.map(r => r.id === updated.id ? updated : r)
          })
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { rows, setRows, loading }
}
