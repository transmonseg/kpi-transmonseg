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

const POLL_INTERVAL_MS = 5000

export function useRealtimeQueue() {
  const [rows, setRows] = useState<ReviewQueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false

    async function fetchRows() {
      const { data } = await supabase
        .from('review_queue')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
      if (!cancelled) {
        setRows(data ?? [])
        setLoading(false)
      }
    }

    fetchRows()
    const interval = setInterval(fetchRows, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { rows, setRows, loading }
}
