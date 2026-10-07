// Logins separados por cliente (06/10): o KPI é o dono dos perfis; a cada tick
// manda pro monitoramento quem vê o quê (admin = tudo; operador só da Nutry =
// Nutry; só da Rio Quality = Rio Quality). Falha só loga.
import { createServiceClient } from '@/lib/supabase/service'

export async function sincronizarAcessosMonitoramento(): Promise<string> {
  const chave = process.env.MOTOR_SECRET
  if (!chave) return 'MOTOR_SECRET ausente'
  const svc = createServiceClient()
  const { data: perfis, error } = await svc.from('perfis').select('user_id, papel, empresas')
  if (error) return `perfis: ${error.message}`
  const emails = new Map<string, string>()
  for (let pagina = 1; pagina <= 20; pagina++) {
    const { data, error: e2 } = await svc.auth.admin.listUsers({ page: pagina, perPage: 200 })
    if (e2) return `usuarios: ${e2.message}`
    for (const u of data.users) if (u.email) emails.set(u.id, u.email)
    if (data.users.length < 200) break
  }
  const contas = (perfis ?? []).flatMap(p => {
    const email = emails.get(p.user_id as string)
    return email ? [{ email, admin: p.papel === 'admin', empresas: (p.empresas as string[] | null) ?? [] }] : []
  })
  const r = await fetch(`${process.env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'}/api/acessos/sincronizar`, {
    method: 'POST', headers: { 'x-motor-key': chave, 'content-type': 'application/json' },
    body: JSON.stringify({ contas }), signal: AbortSignal.timeout(20_000),
  })
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; alterados?: string[]; erro?: string }
  if (!j.ok) return `monitoramento: ${j.erro ?? r.status}`
  return j.alterados?.length ? `alterados: ${j.alterados.join(', ')}` : 'sem mudança'
}
