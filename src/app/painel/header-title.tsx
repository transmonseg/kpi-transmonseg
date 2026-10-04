'use client'

import { usePathname } from 'next/navigation'

const TITLES: Record<string, string> = {
  '/painel': 'Dashboard',
  '/painel/cozinha': 'Cozinha',
  '/painel/cozinha/clientes': 'Clientes',
  '/painel/kpi/simples': 'Gerar KPI',
  '/painel/historico': 'Histórico',
  '/painel/lojas': 'Lojas',
}

function resolveTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname]
  // Try parent paths for nested routes.
  const parts = pathname.split('/').filter(Boolean)
  while (parts.length > 0) {
    parts.pop()
    const candidate = '/' + parts.join('/')
    if (TITLES[candidate]) return TITLES[candidate]
  }
  return 'Painel'
}

export function HeaderTitle() {
  const pathname = usePathname()
  return (
    <h1 className="text-sm font-semibold tracking-tight text-[var(--color-fg)]">
      {resolveTitle(pathname)}
    </h1>
  )
}
