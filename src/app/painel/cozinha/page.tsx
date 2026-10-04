import { CozinhaUploader } from './uploader'

export const metadata = { title: 'Cozinha — Transmonseg' }

export default function CozinhaPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-8 flex flex-col gap-1">
        <span className="text-overline">Operação</span>
        <h1 className="mt-1 text-display text-[34px] leading-none text-[var(--color-fg)] md:text-[40px]">
          Cozinha
        </h1>
        <p className="mt-2 max-w-[65ch] text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
          Faça upload da escala da Cozinha Industrial em XLSX. O sistema extrai
          rota, motorista e placa de cada bloco e gera dois arquivos limpos
          (XLSX e PDF).
        </p>
      </header>

      <CozinhaUploader />
    </div>
  )
}
