'use client'

import { usePathname } from 'next/navigation'

const TITLES: Record<string, string> = {
  '/painel': 'Dashboard',
  '/painel/ao-vivo': 'Ao vivo',
  '/painel/usuarios': 'Usuários',
  '/painel/cozinha': 'Cozinha',
  '/painel/cozinha/clientes': 'Clientes da cozinha',
  '/painel/nutrimax/gerar': 'Nutry Max · Gerar KPI',
  '/painel/nutrimax/historico': 'Nutry Max · Histórico',
  '/painel/nutrimax/placas': 'Nutry Max · Placas do dia',
  '/painel/rioquality/gerar': 'Rio Quality · Gerar KPI',
  '/painel/rioquality/historico': 'Rio Quality · Histórico',
  '/painel/portefrio/gerar': 'Portefrio · Gerar KPI',
  '/painel/portefrio/historico': 'Portefrio · Histórico',
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
