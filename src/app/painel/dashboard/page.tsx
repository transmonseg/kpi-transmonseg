import { redirect } from 'next/navigation'

// O Dashboard agora é a tela inicial (/painel). Mantém a rota antiga funcionando.
export default function DashboardPage() {
  redirect('/painel')
}
