'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { EMPRESA_LABEL } from '@/lib/kpi/empresas'

// Só as empresas que já têm alguma tela hoje. Portefrio entra aqui quando
// tiver a própria rota raiz.
const EMPRESA_HOME: Record<string, string> = {
  benassi: '/painel/kpi/simples',
  nutrimax: '/painel/nutrimax/gerar',
}

const EMPRESAS_COM_TELA = Object.keys(EMPRESA_HOME)

export function EmpresaSwitcher({
  papel,
  empresas,
}: {
  papel: 'admin' | 'gerente' | 'visualizador'
  empresas: string[]
}) {
  const pathname = usePathname()
  const visiveis = EMPRESAS_COM_TELA.filter(e => papel === 'admin' || empresas.includes(e))

  // 0 ou 1 opção: nada pra trocar, não mostra seletor nenhum.
  if (visiveis.length < 2) return null

  const atual = visiveis.find(e => pathname.startsWith(EMPRESA_HOME[e])) ?? visiveis[0]

  return (
    <div className="hidden items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-1 sm:flex">
      {visiveis.map(e => (
        <Link
          key={e}
          href={EMPRESA_HOME[e]}
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
