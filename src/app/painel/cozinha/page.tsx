import { CozinhaUploader } from './uploader'

export default function CozinhaPage() {
  return (
    <div className="max-w-5xl">
      <div className="border-b border-border pb-5 mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Cozinha</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          Faça upload da escala da Cozinha Industrial em XLSX. O sistema extrai
          rota, motorista e placa de cada bloco e gera dois arquivos limpos.
        </p>
      </div>

      <CozinhaUploader />
    </div>
  )
}
