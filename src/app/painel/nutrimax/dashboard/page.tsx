import { createServiceClient } from '@/lib/supabase/service'

function hojeBR(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

type LinhaBanco = {
  carga: string
  destino: string
  placa: string
  motorista: string | null
  nf: string
  cliente_nome: string
  status: 'entregue' | 'pendente'
}

export default async function NutrimaxDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>
}) {
  const sp = await searchParams
  const data = sp.data && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : hojeBR()

  const svc = createServiceClient()
  // PostgREST limita a 1000 linhas por página por padrão — um dia do Nutrimax passa
  // disso (~2000+ clientes), então pagina até esgotar.
  const linhas: LinhaBanco[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data: pagina } = await svc
      .from('kpi_nutrimax_entradas')
      .select('carga, destino, placa, motorista, nf, cliente_nome, status')
      .eq('data', data)
      .range(from, from + PAGE - 1)
    const lote = (pagina ?? []) as LinhaBanco[]
    linhas.push(...lote)
    if (lote.length < PAGE) break
  }
  const total = linhas.length
  const entregues = linhas.filter(l => l.status === 'entregue').length
  const pct = total > 0 ? Math.round((entregues / total) * 100) : 0

  const porCarga = new Map<string, { destino: string; placa: string; motorista: string | null; total: number; entregues: number }>()
  for (const l of linhas) {
    const atual = porCarga.get(l.carga) ?? { destino: l.destino, placa: l.placa, motorista: l.motorista, total: 0, entregues: 0 }
    atual.total += 1
    if (l.status === 'entregue') atual.entregues += 1
    porCarga.set(l.carga, atual)
  }
  const cargasOrdenadas = [...porCarga.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-8 px-5 py-8">
      <header>
        <span className="text-overline">Nutrimax</span>
        <h1 className="mt-1 text-display text-[28px] leading-none text-[var(--color-fg)]">Dashboard</h1>
      </header>

      <form className="flex items-center gap-2">
        <input
          type="date" name="data" defaultValue={data}
          className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-[13px] text-[var(--color-fg)] outline-none"
        />
        <button type="submit" className="h-9 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 text-[13px]">
          Ver
        </button>
      </form>

      {total === 0 ? (
        <p className="text-[13px] text-[var(--color-fg-muted)]">
          Nenhum dado pra {data}. Gere e suba o KPI em &quot;Gerar KPI&quot; → &quot;Inserir KPI&quot;.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <p className="text-overline">Taxa de entrega</p>
              <p className="mt-1 text-[28px] font-semibold text-[var(--color-fg)]">{pct}%</p>
            </div>
            <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <p className="text-overline">Total de clientes</p>
              <p className="mt-1 text-[28px] font-semibold text-[var(--color-fg)]">{total}</p>
            </div>
            <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <p className="text-overline">Rotas no dia</p>
              <p className="mt-1 text-[28px] font-semibold text-[var(--color-fg)]">{porCarga.size}</p>
            </div>
          </div>

          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wide text-[var(--color-fg-subtle)]">
                <th className="py-2 pr-3">Carga</th>
                <th className="pr-3">Destino</th>
                <th className="pr-3">Placa</th>
                <th className="pr-3">Motorista</th>
                <th className="pr-3">Entregues</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {cargasOrdenadas.map(([carga, r]) => (
                <tr key={carga} className="border-b border-[var(--color-border)] text-[var(--color-fg)]">
                  <td className="py-2 pr-3 text-numeric">{carga}</td>
                  <td className="pr-3">{r.destino}</td>
                  <td className="pr-3 text-numeric">{r.placa}</td>
                  <td className="pr-3">{r.motorista ?? '—'}</td>
                  <td className="pr-3 text-numeric">{r.entregues}/{r.total}</td>
                  <td className="text-numeric">{r.total > 0 ? Math.round((r.entregues / r.total) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
