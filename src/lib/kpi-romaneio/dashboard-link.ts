// 25/11: link do Dashboard travado num dia/período (sem login). Quem abre só
// consegue ler o que está dentro de [de, ate] daquele cliente.
import { createServiceClient } from '@/lib/supabase/service'
import { clienteDashValido, type ClienteDash } from './dashboard-kpis'

export type LinkDashboard = { token: string; cliente: ClienteDash; de: string; ate: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function buscarLinkDashboard(token: string): Promise<LinkDashboard | null> {
  if (!UUID.test(token)) return null
  const { data } = await createServiceClient().from('kpi_dashboard_links').select('token, cliente, de, ate').eq('token', token).maybeSingle()
  if (!data || !clienteDashValido(data.cliente)) return null
  return { token: data.token, cliente: data.cliente, de: data.de, ate: data.ate }
}

/** O pedido [de, ate] cabe inteiro no período do link? */
export const dentroDoLink = (l: { de: string; ate: string }, de: string, ate: string) =>
  de <= ate && l.de <= de && ate <= l.ate
