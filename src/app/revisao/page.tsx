import { FilaRevisao } from '@/components/FilaRevisao'

export const dynamic = 'force-dynamic'

export default function RevisaoPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 4 }}>Fila de Revisao</h1>
      <p style={{ marginBottom: 24, color: '#666', fontSize: 14 }}>
        Lojas que o sistema nao identificou automaticamente.
        Aprove para treinar o sistema ou pule para revisar depois.
      </p>
      <FilaRevisao />
    </main>
  )
}
