import { usuarioAtual } from '@/lib/supabase/usuario-atual'
import { getPerfil, podeOperarEmpresa } from '@/lib/perfil'
import { CLIENTES_DASH, type ClienteDash } from '@/lib/kpi-romaneio/dashboard-kpis'
import { DashboardKpi, type Aba } from './dashboard-kpi/dashboard-kpi'

// Dashboard por cliente (04/10/2026): escolhe a empresa no topo; mesmo
// funcionamento do antigo dashboard da Benassi (Visão geral / Inserir KPI /
// Histórico). A Benassi saiu da operação e fica com cadeado.
export default async function PainelHome({ searchParams }: { searchParams: Promise<{ empresa?: string; tab?: string; data?: string }> }) {
  const sp = await searchParams
  const user = await usuarioAtual()
  const perfil = user && process.env.DESKTOP_APP !== '1'
    ? await getPerfil(user.id)
    : { papel: 'admin' as const, redes: [], meses: [], empresas: [] }

  const clientes = CLIENTES_DASH.filter(c => perfil.papel === 'admin' || perfil.empresas.includes(c))
  const cliente: ClienteDash | undefined = clientes.find(c => c === sp.empresa) ?? clientes[0]
  if (!cliente) {
    return (
      <div className="dash-card mx-auto mt-10 max-w-lg px-6 py-14 text-center">
        <p className="text-[17px] font-semibold text-[var(--color-fg)]">Nenhum dashboard liberado</p>
        <p className="mt-2 text-[13px] text-[var(--color-fg-muted)]">Peça ao administrador para liberar o acesso à sua empresa.</p>
      </div>
    )
  }
  const podeInserir = podeOperarEmpresa(perfil, cliente)
  const aba: Aba = sp.tab === 'inserir' && podeInserir ? 'inserir' : sp.tab === 'historico' ? 'historico' : 'geral'
  const dataInicial = sp.data && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : undefined

  return <DashboardKpi key={`${cliente}-${dataInicial ?? ''}`} cliente={cliente} clientes={clientes} aba={aba} podeInserir={podeInserir} dataInicial={dataInicial} />
}
