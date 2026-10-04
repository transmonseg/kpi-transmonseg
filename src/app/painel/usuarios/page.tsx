import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { WarningCircle, CheckCircle, X, Lock, CaretDown } from '@phosphor-icons/react/dist/ssr'
import { botao } from '@/components/apple/botao'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPerfil, conviteExpirado } from '@/lib/perfil'
import { EMPRESAS, EMPRESA_LABEL } from '@/lib/kpi/empresas'
import { criarConvite, revogarConvite, revogarAcesso } from './actions'
import { CopiarLink } from './copiar-link'
import { EmpresasCheckboxes } from './empresas-checkboxes'

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
    svc.from('perfis').select('user_id, email, papel, redes, meses, empresas, criado_por').neq('papel', 'admin').order('email'),
    svc.from('convites').select('token, papel, redes, meses, empresas, criado_por, expira_em').is('usado_em', null).order('criado_em', { ascending: false }),
  ])

  const meus = perfil.papel === 'gerente'
  const logins = (perfisRows ?? []).filter(p => !meus || p.criado_por === user.id)
  const convites = (convitesRows ?? [])
    .filter(c => !meus || c.criado_por === user.id)
    .filter(c => !conviteExpirado(c.expira_em as string | null))

  const h = await headers()
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`
  const empresasDisponiveis = perfil.papel === 'gerente' ? perfil.empresas : (EMPRESAS as readonly string[])

  const empresasAtivas = empresasDisponiveis.filter(e => e !== 'benassi')
  const grupos = [...empresasAtivas, 'benassi'].map(e => ({
    empresa: e,
    logins: logins.filter(l => ((l.empresas as string[] | null) ?? []).includes(e)),
  }))
  const semEmpresa = logins.filter(l => !((l.empresas as string[] | null) ?? []).length)

  return (
    <div className="mx-auto w-full max-w-[1180px]">
      <header className="mb-8">
        <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.022em] text-[var(--color-fg)] sm:text-[34px]">Usuários</h1>
        <p className="mt-1.5 max-w-[62ch] text-[15px] text-[var(--color-fg-muted)]">
          Crie acessos para cada empresa. A pessoa recebe um link de convite e entra direto no dashboard dela.
        </p>
      </header>

      {erro && (
        <div role="alert" className="mb-6 flex items-start gap-2.5 rounded-[14px] bg-[var(--color-danger-soft)] px-4 py-3 text-[14px] text-[var(--color-danger-soft-fg)]">
          <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
          <span>{decodeURIComponent(erro)}</span>
        </div>
      )}

      {link && (
        <div role="status" className="mb-6 flex flex-col gap-3 rounded-[14px] bg-[var(--color-success-soft)] px-4 py-4 text-[14px] text-[var(--color-success-soft-fg)] sm:flex-row sm:items-center">
          <span className="inline-flex items-center gap-2 font-semibold"><CheckCircle size={20} weight="fill" className="text-[var(--color-success)]" /> Convite criado</span>
          <code className="min-w-0 flex-1 truncate rounded-[10px] bg-[var(--color-bg-elevated)] px-3 py-2 text-[13px] text-[var(--color-fg)]">{origin}/convite/{link}</code>
          <CopiarLink texto={`${origin}/convite/${link}`} />
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[380px_1fr]">
        <section data-tour="usr-novo" className="u-card p-6 lg:sticky lg:top-20">
          <h2 className="text-[19px] font-semibold tracking-[-0.015em]">Novo acesso</h2>
          <p className="mt-1 text-[14px] text-[var(--color-fg-muted)]">
            {perfil.papel === 'gerente' ? 'Login que só vê o dashboard, dentro do seu acesso.' : 'Escolha o tipo de login e a empresa.'}
          </p>
          <form action={criarConvite} className="mt-5 flex flex-col gap-5">
            {perfil.papel === 'admin' ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-[13px] font-semibold text-[var(--color-fg-muted)]">Tipo de login</legend>
                {([
                  ['visualizador', 'Visualizador', 'Só vê o dashboard da empresa'],
                  ['gerente', 'Gerente', 'Vê o dashboard e convida visualizadores'],
                ] as const).map(([v, t, d]) => (
                  <label key={v} className="flex cursor-pointer items-start gap-3 rounded-[14px] bg-[var(--color-bg-subtle)] p-3.5 u-motion has-[:checked]:bg-[var(--color-accent-soft)] has-[:checked]:shadow-[0_0_0_1.5px_var(--color-accent)]">
                    <input type="radio" name="papel" value={v} defaultChecked={v === 'visualizador'} className="mt-1 accent-[var(--color-navy-700)]" />
                    <span>
                      <span className="block text-[15px] font-semibold">{t}</span>
                      <span className="block text-[13px] text-[var(--color-fg-muted)]">{d}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <input type="hidden" name="papel" value="visualizador" />
            )}

            <EmpresasCheckboxes opcoes={empresasAtivas} bloqueadas={empresasDisponiveis.includes('benassi') ? ['benassi'] : []} />

            <button type="submit" className={botao('primario') + ' w-full'}>Gerar link de convite</button>
          </form>
        </section>

        <div data-tour="usr-lista" className="flex flex-col gap-6">
          {convites.length > 0 && (
            <section className="u-card overflow-hidden">
              <div className="px-5 pb-2 pt-5">
                <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Convites pendentes</h2>
                <p className="text-[13px] text-[var(--color-fg-muted)]">Ainda não usados. Copie de novo se precisar reenviar.</p>
              </div>
              <ul>
                {convites.map(c => (
                  <li key={c.token as string} className="flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                        <PapelPonto papel={c.papel as string} />
                        <span className="text-[var(--color-fg-muted)]">·</span>
                        {((c.empresas as string[] | null) ?? []).map(e => EMPRESA_LABEL[e] ?? e).join(', ') || 'sem empresa'}
                      </div>
                      <code className="mt-1 block max-w-full truncate text-[12px] text-[var(--color-fg-subtle)]">{origin}/convite/{c.token as string}</code>
                    </div>
                    <CopiarLink texto={`${origin}/convite/${c.token as string}`} />
                    <form action={revogarConvite.bind(null, c.token as string)}>
                      <button type="submit" className={botao('fantasma', 'sm')}><X size={13} weight="bold" /> Cancelar</button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {grupos.map(g => g.empresa === 'benassi' ? (
            g.logins.length > 0 && (
              <details key={g.empresa} className="u-card group overflow-hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 u-motion hover:bg-[var(--color-bg-subtle)]">
                  <span>
                    <span className="inline-flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-[var(--color-fg-muted)]"><Lock size={15} weight="fill" /> Benassi · desativada</span>
                    <span className="block text-[13px] text-[var(--color-fg-muted)]">{g.logins.length} {g.logins.length === 1 ? 'login antigo' : 'logins antigos'} — sem acesso a nada enquanto a Benassi estiver travada</span>
                  </span>
                  <CaretDown size={14} className="text-[var(--color-fg-muted)] transition-transform group-open:rotate-180" />
                </summary>
                <ListaLogins logins={g.logins} />
              </details>
            )
          ) : (
            <section key={g.empresa} className="u-card overflow-hidden">
              <div className="flex items-baseline justify-between px-5 pb-2 pt-5">
                <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{EMPRESA_LABEL[g.empresa] ?? g.empresa}</h2>
                <span className="text-[13px] text-[var(--color-fg-muted)]">{g.logins.length} {g.logins.length === 1 ? 'acesso' : 'acessos'}</span>
              </div>
              {g.logins.length === 0
                ? <p className="border-t border-[var(--color-border)] px-5 py-4 text-[14px] text-[var(--color-fg-muted)]">Ninguém ainda. Crie o primeiro acesso ao lado.</p>
                : <ListaLogins logins={g.logins} />}
            </section>
          ))}

          {semEmpresa.length > 0 && (
            <section className="u-card overflow-hidden">
              <div className="px-5 pb-2 pt-5"><h2 className="text-[17px] font-semibold tracking-[-0.01em]">Sem empresa</h2></div>
              <ListaLogins logins={semEmpresa} />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function PapelPonto({ papel }: { papel: string }) {
  const g = papel === 'gerente'
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-fg-muted)]">
      <span className={`size-2 rounded-full ${g ? 'bg-[var(--color-navy-500)]' : 'bg-[var(--color-fg-subtle)]'}`} />
      {PAPEL_LABEL[papel as 'gerente' | 'visualizador'] ?? papel}
    </span>
  )
}

function ListaLogins({ logins }: { logins: { user_id: unknown; email: unknown; papel: unknown }[] }) {
  return (
    <ul>
      {logins.map(p => (
        <li key={p.user_id as string} className="flex items-center gap-3 border-t border-[var(--color-border)] px-5 py-3 u-motion hover:bg-[var(--color-bg-subtle)]">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[14px] font-semibold text-[var(--color-accent)]">
            {String(p.email ?? '?').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-medium">{p.email as string}</div>
            <PapelPonto papel={p.papel as string} />
          </div>
          <form action={revogarAcesso.bind(null, p.user_id as string)}>
            <button type="submit" className={botao('perigo', 'sm')}>Revogar</button>
          </form>
        </li>
      ))}
    </ul>
  )
}
