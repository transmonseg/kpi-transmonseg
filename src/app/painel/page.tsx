import { usuarioAtual } from '@/lib/supabase/usuario-atual'
import { getPerfil } from '@/lib/perfil'
import {
  CLIENTES_DASHBOARD,
  NOME_CLIENTE,
  buscarSerieDashboard,
  type ClienteDashboard,
} from '@/lib/kpi-romaneio/dashboard-dados'
import { DashboardClientes } from './dashboard-clientes'

// Redesign 04/10/2026: o Dashboard escolhe o CLIENTE no topo (segmentado) e o
// painel de performance dele aparece embaixo. O dashboard antigo (Benassi)
// saiu junto com a Benassi (cadeado no menu).
export default async function PainelHome({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const sp = await searchParams
  const user = await usuarioAtual()
  const perfil = user && process.env.DESKTOP_APP !== '1'
    ? await getPerfil(user.id)
    : { papel: 'admin' as const, redes: [], meses: [], empresas: [] }

  const visiveis = CLIENTES_DASHBOARD.filter(c => perfil.papel === 'admin' || perfil.empresas.includes(c))
  const cliente: ClienteDashboard | undefined =
    visiveis.find(c => c === sp.cliente) ?? visiveis[0]

  if (!cliente) {
    return (
      <div className="u-card mx-auto mt-10 max-w-lg px-6 py-14 text-center">
        <p className="text-[20px] font-semibold tracking-[-0.01em]">Nenhum dashboard liberado</p>
        <p className="mt-2 text-[15px] text-[var(--color-fg-muted)]">Peça ao administrador para liberar o acesso à sua empresa.</p>
      </div>
    )
  }

  const serie = await buscarSerieDashboard(cliente)

  return (
    <DashboardClientes
      cliente={cliente}
      clientesVisiveis={visiveis.map(c => ({ value: c, label: NOME_CLIENTE[c] }))}
      serie={serie}
      podeGerar={perfil.papel === 'admin'}
    />
  )
}
