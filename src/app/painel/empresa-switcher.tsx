'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { EMPRESA_LABEL } from '@/lib/kpi/empresas'

// Admin: leva pra tela de geração de cada empresa (única coisa que existe
// hoje). Não-admin: leva pra tela de leitura correspondente — Nutry Max
// ainda não tem uma, então fica de fora do set pra não-admin até existir.
const EMPRESA_HOME_ADMIN: Record<string, string> = {
  benassi: '/painel/kpi/simples',
  nutrimax: '/painel/nutrimax/gerar',
}
const EMPRESA_HOME_NAO_ADMIN: Record<string, string> = {
  benassi: '/painel/kpi/visualizar',
}

export function EmpresaSwitcher({
  papel,
  empresas,
}: {
  papel: 'admin' | 'gerente' | 'visualizador'
  empresas: string[]
}) {
  const pathname = usePathname()
  const homeMap = papel === 'admin' ? EMPRESA_HOME_ADMIN : EMPRESA_HOME_NAO_ADMIN
  const visiveis = Object.keys(homeMap).filter(e => papel === 'admin' || empresas.includes(e))

  // 0 ou 1 opção: nada pra trocar, não mostra seletor nenhum.
  if (visiveis.length < 2) return null

  const atual = visiveis.find(e => pathname.startsWith(homeMap[e]))

  return (
    <div className="hidden items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-1 sm:flex">
      {visiveis.map(e => (
        <Link
          key={e}
          href={homeMap[e]}
          className={
            'rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ' +
            (e === atual
              ? 'bg-[var(--color-navy-700)] text-white'
              : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]')
          }
        >
          {EMPRESA_LABEL[e] ?? e}
        </Link>
      ))}
    </div>
  )
}
