import Link from 'next/link'

export default function PainelHome() {
  return (
    <div className="max-w-5xl">
      <div className="border-b border-border pb-5 mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Início</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          Bem-vindo ao sistema de gestão de escalas e KPI da TRANSMONSEG.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Link
          href="/painel/cozinha"
          className="group block rounded-xl border border-border bg-white p-6 hover:border-brand-400 hover:shadow-md hover:shadow-brand-500/10 transition"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-brand-50 text-brand-600 group-hover:bg-brand-100 transition mb-3">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 7l9-4 9 4-9 4-9-4z" />
                  <path d="M3 17l9 4 9-4" />
                  <path d="M3 12l9 4 9-4" />
                </svg>
              </div>
              <h2 className="font-bold text-ink">Cozinha</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Upload da escala da Cozinha Industrial. Gera XLSX e PDF limpos
                com rota, motorista e placa.
              </p>
            </div>
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 bg-emerald-50 text-emerald-700 rounded">
              Ativo
            </span>
          </div>
        </Link>

        <div className="rounded-xl border border-border bg-surface-alt p-6 opacity-80">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-surface-hover text-ink-muted mb-3">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 3v18h18" />
                  <path d="M7 14l4-4 4 4 6-6" />
                </svg>
              </div>
              <h2 className="font-bold text-ink-soft">KPI Benassi</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Geração automática de KPI a partir da escala e do relatório
                Unitrac.
              </p>
            </div>
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 bg-surface-hover text-ink-soft rounded">
              Em breve
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
