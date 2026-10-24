'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, Circle, UploadSimple, WarningCircle } from '@phosphor-icons/react/dist/ssr'
import { buscarComSessao, lerJson } from '@/lib/sessao-fetch'
import type { BannerAvisoRomaneio, ItemChecklist } from '@/lib/kpi-romaneio/manha'

type Cliente = ItemChecklist['cliente']
type Manha = { data: string; itens: ItemChecklist[]; banners: BannerAvisoRomaneio[] }

// F3-07 (ACH-04): checklist da manhã no topo do Ao vivo -- o que já chegou
// hoje (com o horário) e um botão de subir no que falta -- e o banner do aviso
// interno das 06:30/07:30 (motor de desvio sem romaneio com a frota rodando).
// Ícones navy de cor única; o que falta fica com o contorno.
export function ChecklistManha({ recarga, onSubir }: { recarga: unknown; onSubir: (cliente: Cliente) => void }) {
  const [manha, setManha] = useState<Manha | null>(null)

  useEffect(() => {
    let vivo = true
    const buscar = () => buscarComSessao('/api/kpi/ao-vivo/manha', { cache: 'no-store' })
      .then(r => (r.ok ? lerJson<Manha>(r) : null))
      .then(m => { if (vivo && m) setManha(m) })
      .catch(() => {}) // sem o checklist a tela segue igual
    buscar()
    const t = setInterval(buscar, 60_000)
    return () => { vivo = false; clearInterval(t) }
  }, [recarga])

  if (!manha || manha.itens.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {manha.banners.map(b => (
        <p key={b.cliente} role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-[var(--color-warning-soft)] px-4 py-2.5 text-[13px] text-[var(--color-warning-soft-fg)]">
          <span className="inline-flex items-center gap-2"><WarningCircle size={16} weight="fill" />{b.texto}</span>
          <button type="button" onClick={() => onSubir(b.cliente)}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-current px-3.5 text-[12.5px] font-semibold transition hover:bg-white/40 active:scale-[0.98]">
            <UploadSimple size={13} weight="bold" />Subir agora
          </button>
        </p>
      ))}
      <section aria-label="Checklist da manhã" className="dash-card flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-fg-subtle)]">Hoje</span>
        {manha.itens.map(i => (
          <span key={i.chave} title={i.documento} className="inline-flex items-center gap-1.5 text-[13px]">
            {i.ok
              ? <CheckCircle size={17} weight="fill" className="text-[var(--color-navy-700)]" aria-label="recebido" />
              : <Circle size={17} className="text-[var(--color-navy-400)]" aria-label="falta" />}
            <span className={i.ok ? 'font-semibold text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)]'}>{i.rotulo}</span>
            {i.ok
              ? <span className="tabular-nums text-[var(--color-fg-muted)]">{i.hora ?? ''}</span>
              : (
                <button type="button" onClick={() => onSubir(i.cliente)}
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 text-[12px] font-semibold text-[var(--color-navy-700)] transition hover:border-[var(--color-border-strong)] active:scale-[0.98]">
                  <UploadSimple size={12} weight="bold" />Subir
                </button>
              )}
          </span>
        ))}
      </section>
    </div>
  )
}
