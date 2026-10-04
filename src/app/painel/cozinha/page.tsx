import { CozinhaUploader } from './uploader'

export const metadata = { title: 'Cozinha — Transmonseg' }

export default function CozinhaPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-8 flex flex-col gap-1.5">
        <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.022em] text-[var(--color-fg)] sm:text-[34px]">
          Cozinha
        </h1>
        <p className="max-w-[62ch] text-[15px] text-[var(--color-fg-muted)]">
          Faça upload da escala da Cozinha Industrial em XLSX. O sistema extrai
          rota, motorista e placa de cada bloco e gera dois arquivos limpos
          (XLSX e PDF).
        </p>
      </header>

      <CozinhaUploader />
    </div>
  )
}
