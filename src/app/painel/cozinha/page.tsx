import { CozinhaUploader } from './uploader'

export const metadata = { title: 'Cozinha — Transmonseg' }

export default function CozinhaPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-6 flex flex-col gap-1 border-b border-[var(--color-border)] pb-5">
        <h1 className="text-[20px] font-semibold tracking-tight text-[var(--color-fg)]">
          Cozinha
        </h1>
        <p className="text-[13px] text-[var(--color-fg-muted)]">
          Faça upload da escala da Cozinha Industrial em XLSX. O sistema extrai
          rota, motorista e placa de cada bloco e gera dois arquivos limpos
          (XLSX e PDF).
        </p>
      </header>

      <CozinhaUploader />
    </div>
  )
}
