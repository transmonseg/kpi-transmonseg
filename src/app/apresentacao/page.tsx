import { redirect } from 'next/navigation'

// Rota renomeada pra /dashboard. Mantém redirect pra não quebrar quem já tinha
// esse link salvo/aberto (cache do navegador, aba antiga, link compartilhado).
export default async function ApresentacaoRedirect({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const sp = await searchParams
  redirect(sp.tab ? `/dashboard?tab=${sp.tab}` : '/dashboard')
}
