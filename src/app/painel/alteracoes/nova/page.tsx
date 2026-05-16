import { AlteracaoForm } from './form'

export const metadata = { title: 'Nova alteração — Transmonseg' }

export default function NovaAlteracaoPage() {
  return (
    <div className="container mx-auto py-6 px-4 max-w-3xl">
      <h1 className="text-2xl font-bold mb-1 text-ink">Nova alteração</h1>
      <p className="text-sm text-ink-soft mb-6">
        Cole a mensagem do WhatsApp. O sistema identifica rede, loja, placas e motorista. Confira e clique em Aplicar.
      </p>
      <AlteracaoForm />
    </div>
  )
}
