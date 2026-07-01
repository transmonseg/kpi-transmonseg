import { Suspense } from 'react'
import DashboardClient from '../painel/dashboard/dashboard-client'

// Link público — sem resumo (esconde "Gerar KPI"/"última geração", que denunciam
// a automação) e sem sessão (endpoint publico, service client, só leitura).
export default function ApresentacaoPage() {
  return (
    <Suspense fallback={null}>
      <DashboardClient tabInicial="geral" basePath="/dashboard" endpoint="/api/dashboard/publico" />
    </Suspense>
  )
}
