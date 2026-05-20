import { AlteracoesV2Form } from './AlteracoesV2Form'

export const metadata = { title: 'Nova alteração — Transmonseg' }

export default function NovaAlteracaoPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-6 flex flex-col gap-1 border-b border-[var(--color-border)] pb-5">
        <h1 className="text-[20px] font-semibold tracking-tight text-[var(--color-fg)]">
          Nova alteração
        </h1>
        <p className="text-[13px] text-[var(--color-fg-muted)]">
          Cole a mensagem do WhatsApp. O sistema identifica rede, loja, placas
          e motorista. Confira o resultado e clique em Aplicar.
        </p>
      </header>

      <AlteracoesV2Form />
    </div>
  )
}
