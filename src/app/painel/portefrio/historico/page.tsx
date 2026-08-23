import { WarningCircle } from '@phosphor-icons/react/dist/ssr'
import { Card, CardContent } from '@/components/ui'

export default function PortefrioHistoricoPage() {
  return (
    <div className="mx-auto w-full max-w-[720px]">
      <header className="mb-8">
        <span className="text-overline">Portefrio</span>
        <h1 className="mt-1 text-display text-[30px] leading-none text-[var(--color-fg)]">Histórico</h1>
        <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
          Ainda não há gerações de KPI da Portefrio pra listar aqui — depende do pipeline de
          geração existir primeiro.
        </p>
      </header>

      <Card>
        <CardContent className="flex items-start gap-3 py-6">
          <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-warning)]" />
          <p className="text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
            Essa tela existe pra mostrar onde a Portefrio vai aparecer no sistema.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
