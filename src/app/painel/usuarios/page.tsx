import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { WarningCircle, CheckCircle, X } from '@phosphor-icons/react/dist/ssr'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Label, Badge } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPerfil, conviteExpirado } from '@/lib/perfil'
import { REDES, REDE_LABEL } from '@/lib/kpi/redes'
import { mesesConhecidos, formatMes } from '@/lib/kpi/meses'
import { criarConvite, revogarConvite, revogarAcesso, atualizarMeses } from './actions'
import { CopiarLink } from './copiar-link'
import { RedesCheckboxes } from './redes-checkboxes'
import { MesesCheckboxes } from './meses-checkboxes'

const PAPEL_LABEL = { gerente: 'Gerente', visualizador: 'Visualizador' } as const

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; link?: string }>
}) {
  const { erro, link } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const perfil = await getPerfil(user.id)
  if (perfil.papel === 'visualizador') redirect('/painel')

  const svc = createServiceClient()
  const [{ data: perfisRows }, { data: convitesRows }] = await Promise.all([
    svc.from('perfis').select('user_id, email, papel, redes, meses, criado_por').neq('papel', 'admin').order('email'),
    svc.from('convites').select('token, papel, redes, meses, criado_por, expira_em').is('usado_em', null).order('criado_em', { ascending: false }),
  ])

  const meus = perfil.papel === 'gerente'
  const logins = (perfisRows ?? []).filter(p => !meus || p.criado_por === user.id)
  const convites = (convitesRows ?? [])
    .filter(c => !meus || c.criado_por === user.id)
    .filter(c => !conviteExpirado(c.expira_em as string | null))

  const h = await headers()
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`
  const redesDisponiveis = perfil.papel === 'gerente' ? perfil.redes : (REDES as readonly string[])
  const mesesDisponiveis = perfil.papel === 'gerente' ? perfil.meses : mesesConhecidos()
  // Default: tudo liberado exceto o mês mais recente (cada mês novo passa a
  // exigir liberação explícita — é justamente a restrição que essa feature existe pra fazer).
  const mesesDefault = perfil.papel === 'gerente' ? perfil.meses : mesesConhecidos().slice(0, -1)

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-8 px-5 sm:px-8">
      <header>
        <span className="text-overline">Acesso</span>
        <h1 className="mt-1 text-display text-[30px] leading-none text-[var(--color-fg)]">Usuários</h1>
        <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
          Gere links de convite pra logins que só enxergam o Dashboard, restritos às redes escolhidas.
        </p>
      </header>

      {erro && (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-3.5 py-3 text-[12px] leading-relaxed text-[var(--color-danger-soft-fg)]">
          <WarningCircle size={14} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
          <span>{decodeURIComponent(erro)}</span>
        </div>
      )}

      {link && (
        <div role="status" className="flex items-start gap-2.5 rounded-lg border border-[var(--color-success)]/40 bg-[var(--color-success-soft)] px-4 py-3.5 text-[13px] leading-relaxed text-[var(--color-success-soft-fg)]">
          <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-success)]" />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <span className="font-medium">Convite criado com sucesso.</span>
            <code className="min-w-0 flex-1 truncate rounded border border-[var(--color-success)]/30 bg-[var(--color-bg-elevated)] px-2 py-1 text-[11px] text-[var(--color-fg)]">
              {origin}/convite/{link}
            </code>
            <CopiarLink texto={`${origin}/convite/${link}`} />
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Gerar convite</CardTitle>
          <CardDescription>
            {perfil.papel === 'gerente'
              ? 'Cria um login Visualizador, restrito às redes que você mesmo tem acesso.'
              : 'Cria um login Gerente (pode convidar Visualizadores) ou Visualizador (só vê).'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={criarConvite} className="flex flex-col gap-5">
            {perfil.papel === 'admin' ? (
              <div className="flex max-w-[280px] flex-col gap-2">
                <Label htmlFor="papel">Papel</Label>
                <select
                  id="papel" name="papel" defaultValue="visualizador"
                  className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[13px] text-[var(--color-fg)] outline-none transition-colors hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)]"
                >
                  <option value="visualizador">Visualizador (só vê)</option>
                  <option value="gerente">Gerente (vê + convida)</option>
                </select>
              </div>
            ) : (
              <input type="hidden" name="papel" value="visualizador" />
            )}

            <RedesCheckboxes opcoes={redesDisponiveis} />
            <MesesCheckboxes opcoes={mesesDisponiveis} defaultMarcados={mesesDefault} />

            <Button type="submit" className="self-start">Gerar link de convite</Button>
          </form>
        </CardContent>
      </Card>

      {convites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Convites pendentes</CardTitle>
            <CardDescription>Ainda não usados. Copie o link de novo se precisar reenviar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {convites.map(c => (
              <div key={c.token as string} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--color-fg)]">
                    <Badge>{PAPEL_LABEL[c.papel as 'gerente' | 'visualizador']}</Badge>
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                    {(c.redes as string[]).map(r => REDE_LABEL[r] ?? r).join(', ')}
                  </div>
                  <div className="mt-0.5 text-[11px] capitalize text-[var(--color-fg-subtle)]">
                    {(c.meses as string[] | null)?.length ? (c.meses as string[]).map(formatMes).join(', ') : 'sem mês liberado'}
                  </div>
                  <code className="mt-1.5 block max-w-full truncate text-[11px] text-[var(--color-fg-muted)]">
                    {origin}/convite/{c.token as string}
                  </code>
                </div>
                <CopiarLink texto={`${origin}/convite/${c.token as string}`} />
                <form action={revogarConvite.bind(null, c.token as string)}>
                  <Button type="submit" variant="ghost" size="sm">
                    <X size={13} weight="bold" /> Cancelar
                  </Button>
                </form>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Logins ativos</CardTitle>
          <CardDescription>{meus ? 'Os que você convidou.' : 'Todos os logins restritos do sistema.'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {logins.length === 0 && (
            <p className="text-[13px] text-[var(--color-fg-muted)]">Nenhum login restrito ainda.</p>
          )}
          {logins.map(p => (
            <div key={p.user_id as string} className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--color-fg)]">
                    {p.email}
                    <Badge>{PAPEL_LABEL[p.papel as 'gerente' | 'visualizador']}</Badge>
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                    {(p.redes as string[]).map(r => REDE_LABEL[r] ?? r).join(', ') || 'sem rede'}
                  </div>
                </div>
                <form action={revogarAcesso.bind(null, p.user_id as string)}>
                  <Button type="submit" variant="danger" size="sm">Revogar</Button>
                </form>
              </div>
              <form action={atualizarMeses.bind(null, p.user_id as string)} className="flex flex-wrap items-end gap-3 border-t border-[var(--color-border)] pt-3">
                <div className="min-w-0 flex-1">
                  <MesesCheckboxes opcoes={mesesDisponiveis} defaultMarcados={(p.meses as string[] | null) ?? []} />
                </div>
                <Button type="submit" variant="secondary" size="sm">Salvar meses</Button>
              </form>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
