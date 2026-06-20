import { hojeBR } from '@/lib/data-br'
import RankingsClient from './rankings-client'

// Auth vem do layout do /painel. Respeita período/rede vindos do dashboard.
export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; data?: string; de?: string; ate?: string; redes?: string }>
}) {
  const sp = await searchParams
  return (
    <RankingsClient
      periodo={sp.periodo ?? 'mes'}
      data={sp.data ?? hojeBR()}
      de={sp.de ?? ''}
      ate={sp.ate ?? ''}
      redes={sp.redes ?? ''}
    />
  )
}
