import Link from 'next/link'

export default function PainelHome() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight">Início</h1>
      <p className="mt-2 text-zinc-600">
        Bem-vindo ao sistema de gestão de escalas e KPI da TRANSMONSEG.
      </p>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/painel/cozinha"
          className="block rounded-xl border border-zinc-200 bg-white p-6 hover:border-zinc-400 transition"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Cozinha</h2>
            <span className="text-xs font-medium uppercase tracking-wider px-2 py-1 bg-green-100 text-green-700 rounded">
              Disponível
            </span>
          </div>
          <p className="mt-2 text-sm text-zinc-600">
            Faça upload da escala da Cozinha Industrial e baixe a versão limpa
            em XLSX e PDF.
          </p>
        </Link>

        <div className="block rounded-xl border border-zinc-200 bg-zinc-50 p-6 opacity-70">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">KPI Benassi</h2>
            <span className="text-xs font-medium uppercase tracking-wider px-2 py-1 bg-zinc-200 text-zinc-600 rounded">
              Em breve
            </span>
          </div>
          <p className="mt-2 text-sm text-zinc-600">
            Geração automática de KPI a partir da escala e do relatório Unitrac.
          </p>
        </div>
      </div>
    </div>
  )
}
