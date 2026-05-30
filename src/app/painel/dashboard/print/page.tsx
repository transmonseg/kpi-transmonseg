import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { calcularMetricas, filtrar } from '@/lib/kpi/dashboard-metricas'
import { intervaloPeriodo, carregarEntradasManuais } from '@/lib/kpi/dashboard-query'
import { REDE_LABEL } from '@/lib/kpi/redes'
import { hojeBR } from '@/lib/data-br'
import { redirect } from 'next/navigation'

export const runtime = 'nodejs'

export default async function PrintPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const periodo = sp.periodo ?? 'mes'
  const ref = sp.data ?? hojeBR()
  const [ini, fim] = intervaloPeriodo(periodo, ref)
  const redes = (sp.redes ?? '').split(',').filter(Boolean)

  const svc = createServiceClient()
  const m = calcularMetricas(filtrar(await carregarEntradasManuais(svc, ini, fim), { redes }))

  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: 'system-ui, sans-serif', color: '#18181b', padding: '32px', maxWidth: 800, margin: '0 auto' }}>
        <script dangerouslySetInnerHTML={{ __html: 'window.addEventListener("load",()=>setTimeout(()=>window.print(),350))' }} />
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Relatório de Operação</h1>
        <p style={{ color: '#71717a', fontSize: 13, margin: '4px 0 24px' }}>
          Período: {ini} a {fim}{redes.length ? ` · Redes: ${redes.map(r => REDE_LABEL[r] ?? r).join(', ')}` : ' · Todas as redes'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
          {[['Entregues', m.entregue], ['Não foi', m.nao_foi], ['Sem rastreador', m.sem_rastreador], ['Taxa', `${m.pctEntregue}%`]].map(([l, v]) => (
            <div key={l as string} style={{ border: '1px solid #e4e4e7', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{v}</div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#71717a', letterSpacing: 0.5 }}>{l}</div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>Por rede</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f4f4f5', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px' }}>Rede</th><th style={{ padding: '6px 8px', textAlign: 'right' }}>Entregues</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Não foi</th><th style={{ padding: '6px 8px', textAlign: 'right' }}>Sem rastr.</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Taxa</th>
            </tr>
          </thead>
          <tbody>
            {m.porRede.map(r => (
              <tr key={r.rede_id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '6px 8px' }}>{REDE_LABEL[r.rede_id] ?? r.rede_id}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.entregue}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.nao_foi}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.sem_rastreador}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{r.pctEntregue}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: 32, fontSize: 10, color: '#a1a1aa', textAlign: 'center' }}>KPI Transmonseg · gerado a partir dos KPIs manuais inseridos</p>
      </body>
    </html>
  )
}
