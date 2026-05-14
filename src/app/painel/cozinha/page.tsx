import { CozinhaUploader } from './uploader'

export default function CozinhaPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight">Cozinha</h1>
      <p className="mt-2 text-zinc-600">
        Faça upload da escala da Cozinha Industrial no formato XLSX. O sistema
        vai extrair as informações de rota, motorista e placa e gerar dois
        arquivos limpos para download.
      </p>

      <div className="mt-8">
        <CozinhaUploader />
      </div>
    </div>
  )
}
