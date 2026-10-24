'use client'

import Link from 'next/link'
import { Broadcast } from '@phosphor-icons/react/dist/ssr'

// F3-05 (AC-13): o Ao vivo é a porta do dia; o Gerar KPI fica para dias
// passados. Escolhendo hoje no Gerar, a tela aponta o Ao vivo (e avisa que,
// se gerar aqui mesmo, o dia também vai para o Ao vivo e o monitoramento).
export function PortaHojeAviso({ cliente }: { cliente: 'nutrimax' | 'rioquality' }) {
  return (
    <div className="dash-card mb-4 flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="dash-icone shrink-0" style={{ ['--dash-tom' as string]: '#1f3864' }}><Broadcast size={17} weight="bold" /></span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-[var(--color-fg)]">O dia de hoje entra pelo Ao vivo</p>
          <p className="mt-0.5 text-[13px] text-[var(--color-fg-muted)]">
            Solte os arquivos de hoje no Ao vivo: o KPI do dia sai de lá. Se gerar aqui mesmo, o dia também vai para o Ao vivo e o monitoramento.
          </p>
        </div>
      </div>
      <Link href={`/painel/ao-vivo?cliente=${cliente}`}
        className="inline-flex h-11 shrink-0 items-center rounded-full bg-[var(--color-navy-700)] px-5 text-[13px] font-semibold text-white transition hover:bg-[var(--color-navy-800)] active:scale-[0.98]">
        Abrir o Ao vivo
      </Link>
    </div>
  )
}
