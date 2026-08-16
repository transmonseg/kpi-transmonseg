# Links de acesso reutilizáveis (`/acesso/<slug>`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 20 single-use UUID invite links from the previous request with 20 permanent, reusable, human-readable links (`/acesso/gerente`, `/acesso/prezunic`, ...) that anyone can use to create their own login.

**Architecture:** New table `links_acesso` (slug PK, papel/redes/meses/criado_por/ativo) + new route `/acesso/[slug]` that mirrors `/convite/[token]`'s UI and account-creation logic, minus the single-use/expiry machinery. `convites`/`/convite` stay untouched — different concept, still available for one-off personal invites.

**Tech Stack:** Next.js 16 (App Router, server actions), TypeScript, Postgres/PostgREST self-hosted on Contabo (`kpi_transmonseg`), Vitest.

## Global Constraints

- Apply every code/migration change identically to both repos: `~/Projects/Transmonseg/kpi/KPI TEMP` and `~/Projects/Transmonseg/kpi/KPI transmonseg` (definitivo).
- Production is `https://kpi.transmonseg.com.br`, deployed app is the **definitivo** repo on the Contabo VPS (`/srv/kpi-transmonseg`, PM2 process `kpi-transmonseg`).
- Do not modify `convites`, `/convite`, `/kpi-publico`, or `perfil.ts`'s existing exports.
- Never write secret values into committed files.

---

### Task 1: Migration — `links_acesso` table

**Files:**
- Create (both repos, identical): `supabase/migrations/20260816010000_links_acesso.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Links de acesso reutilizáveis: qualquer pessoa com o link cria a própria
-- conta (diferente de `convites`, que é de uso único por e-mail). slug é a
-- URL amigável (/acesso/<slug>). ativo=false revoga sem apagar histórico.
create table if not exists links_acesso (
  slug        text primary key,
  papel       text not null check (papel in ('gerente', 'visualizador')),
  redes       text[] not null default '{}',
  meses       text[] not null default '{}',
  criado_por  uuid not null references auth.users(id),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);
```

Save to `supabase/migrations/20260816010000_links_acesso.sql` in both repos.

- [ ] **Step 2: Apply to production (Contabo)**

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"create table if not exists links_acesso (slug text primary key, papel text not null check (papel in ('gerente', 'visualizador')), redes text[] not null default '{}', meses text[] not null default '{}', criado_por uuid not null references auth.users(id), ativo boolean not null default true, criado_em timestamptz not null default now());\""
```

- [ ] **Step 3: Verify**

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"\\d links_acesso\""
```

Expected: table description showing all 6 columns with correct types.

- [ ] **Step 4: Commit in both repos**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
git add supabase/migrations/20260816010000_links_acesso.sql
git commit -m "feat(links-acesso): tabela links_acesso (link reutilizável por slug)"
```

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg"
git add supabase/migrations/20260816010000_links_acesso.sql
git commit -m "feat(links-acesso): tabela links_acesso (link reutilizável por slug)"
```

---

### Task 2: `/acesso/[slug]` route (redeem page + action)

**Files:**
- Create: `src/app/acesso/[slug]/page.tsx` (both repos)
- Create: `src/app/acesso/[slug]/actions.ts` (both repos)

**Interfaces:**
- Consumes: `createServiceClient` (`@/lib/supabase/service`), `createClient` (`@/lib/supabase/server`), `REDE_LABEL` (`@/lib/kpi/redes`), UI primitives (`@/components/ui`), `ThemeToggle` (`@/lib/theme/ThemeToggle`) — all pre-existing, same as `/convite/[token]`.
- Produces: `resgatar(slug: string, formData: FormData)` server action, imported by `page.tsx`.

- [ ] **Step 1: Write `src/app/acesso/[slug]/actions.ts`**

```typescript
'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function resgatar(slug: string, formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const senha = String(formData.get('senha') ?? '')
  const confirmar = String(formData.get('confirmar') ?? '')

  if (!email) redirect(`/acesso/${slug}?erro=` + encodeURIComponent('Informe um email.'))
  if (senha.length < 6) {
    redirect(`/acesso/${slug}?erro=` + encodeURIComponent('Senha deve ter pelo menos 6 caracteres.'))
  }
  if (senha !== confirmar) {
    redirect(`/acesso/${slug}?erro=` + encodeURIComponent('As senhas não coincidem.'))
  }

  const svc = createServiceClient()
  const { data: link } = await svc.from('links_acesso').select('*').eq('slug', slug).maybeSingle()

  if (!link) redirect('/login?erro=' + encodeURIComponent('Link de acesso inválido.'))
  if (!link.ativo) redirect('/login?erro=' + encodeURIComponent('Esse link não está mais disponível.'))

  const { data: created, error } = await svc.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })
  if (error || !created.user) {
    redirect(`/acesso/${slug}?erro=` + encodeURIComponent(error?.message ?? 'Erro ao criar a conta.'))
  }

  await svc.from('perfis').insert({
    user_id: created.user.id,
    email,
    papel: link.papel,
    redes: link.redes,
    meses: link.meses,
    criado_por: link.criado_por,
  })

  // Mesmo motivo do /convite: quem resgata pode já estar logado testando
  // no mesmo navegador — sem isso o /login barra a volta pra sessão antiga.
  const supabase = await createClient()
  await supabase.auth.signOut()

  redirect('/login?sucesso=' + encodeURIComponent('Conta criada! Entre com o email e a senha que você acabou de definir.'))
}
```

Note: unlike `/convite/actions.ts`, there is **no** update to `links_acesso` after creating the account — the slug stays usable for the next person.

- [ ] **Step 2: Write `src/app/acesso/[slug]/page.tsx`**

```typescript
import Link from 'next/link'
import { ArrowUpRight, WarningCircle, CaretLeft } from '@phosphor-icons/react/dist/ssr'
import { Input, Label } from '@/components/ui'
import { ThemeToggle } from '@/lib/theme/ThemeToggle'
import { createServiceClient } from '@/lib/supabase/service'
import { REDE_LABEL } from '@/lib/kpi/redes'
import { resgatar } from './actions'

const PAPEL_LABEL = { gerente: 'Gerente', visualizador: 'Visualizador' } as const

export default async function AcessoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ erro?: string }>
}) {
  const { slug } = await params
  const { erro } = await searchParams

  const svc = createServiceClient()
  const { data: link } = await svc.from('links_acesso').select('*').eq('slug', slug).maybeSingle()

  const invalido = !link
  const inativo = !!link && !link.ativo
  const bloqueado = invalido || inativo

  const resgatarComSlug = resgatar.bind(null, slug)

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[var(--color-bg)] px-6 py-10 text-[var(--color-fg)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[20%] right-[-15%] h-[700px] w-[700px] rounded-full opacity-[0.06] dark:opacity-[0.10]"
        style={{ background: 'radial-gradient(closest-side, var(--color-navy-700), transparent 70%)' }}
      />
      <div className="absolute left-4 top-4 md:left-8 md:top-8">
        <Link
          href="/login"
          className="group inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/80 px-3 py-1.5 text-[12px] font-medium text-[var(--color-fg-muted)] backdrop-blur-xl transition-colors hover:text-[var(--color-fg)] active:scale-[0.97]"
        >
          <CaretLeft size={11} weight="bold" />
          Entrar
        </Link>
      </div>
      <div className="absolute right-4 top-4 md:right-8 md:top-8">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-navy-700)] text-[16px] font-semibold tracking-tight text-white">
            T
          </span>
          <span className="mt-6 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-fg-subtle)]">
            Acesso
          </span>
          <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-[-0.025em] text-[var(--color-fg)] md:text-[32px]">
            {bloqueado ? 'Link indisponível' : 'Definir sua senha'}
          </h1>
          {!bloqueado && (
            <p className="mt-2 max-w-[36ch] text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
              Acesso de <strong>{PAPEL_LABEL[link.papel as 'gerente' | 'visualizador']}</strong> — só a tela de
              Dashboard, redes: {(link.redes as string[]).map(r => REDE_LABEL[r] ?? r).join(', ') || '—'}.
            </p>
          )}
        </div>

        <div className="rounded-[var(--radius-display)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-1.5 shadow-soft">
          <div
            className="rounded-[calc(var(--radius-display)-0.375rem)] bg-[var(--color-bg)] p-7"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)' }}
          >
            {bloqueado ? (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-3.5 py-3 text-[12px] leading-relaxed text-[var(--color-danger-soft-fg)]"
              >
                <WarningCircle size={14} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
                <span>
                  {invalido && 'Esse link de acesso não existe.'}
                  {!invalido && inativo && 'Esse link não está mais disponível.'}
                </span>
              </div>
            ) : (
              <form action={resgatarComSlug} className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">Seu email</Label>
                  <Input id="email" name="email" type="email" required autoComplete="email" placeholder="voce@email.com" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="senha">Senha</Label>
                  <Input
                    id="senha" name="senha" type="password" required minLength={6}
                    autoComplete="new-password" placeholder="Mínimo 6 caracteres"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="confirmar">Confirmar senha</Label>
                  <Input
                    id="confirmar" name="confirmar" type="password" required minLength={6}
                    autoComplete="new-password" placeholder="Repita a senha"
                  />
                </div>

                {erro && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-3.5 py-3 text-[12px] leading-relaxed text-[var(--color-danger-soft-fg)]"
                  >
                    <WarningCircle size={14} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
                    <span>{decodeURIComponent(erro)}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="group mt-2 inline-flex h-12 items-center justify-between rounded-full bg-[var(--color-navy-700)] pl-6 pr-2 text-[14px] font-medium text-white transition-all duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] hover:opacity-90 active:scale-[0.98]"
                >
                  Criar acesso
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 transition-transform duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
                    <ArrowUpRight size={14} weight="bold" />
                  </span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Type-check and run the full test suite**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && npx tsc --noEmit && npx vitest run
```

Expected: no type errors, all tests pass.

- [ ] **Step 4: Repeat steps 1-3 identically in the definitivo repo**

Same two files, same content, in `~/Projects/Transmonseg/kpi/KPI transmonseg`. Run the same `tsc --noEmit && vitest run` there and confirm clean.

- [ ] **Step 5: Commit in both repos**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
git add src/app/acesso
git commit -m "feat(links-acesso): rota /acesso/[slug] — cria conta sem consumir o link"
```

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg"
git add src/app/acesso
git commit -m "feat(links-acesso): rota /acesso/[slug] — cria conta sem consumir o link"
```

---

### Task 3: Push and deploy to production (Contabo)

**Files:** none.

- [ ] **Step 1: Push both repos**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && git push origin main
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg" && git push origin main
```

- [ ] **Step 2: Deploy definitivo on the VPS**

```bash
ssh transmonseg-vps "cd /srv/kpi-transmonseg && git pull origin main && npm ci && npm run build && pm2 restart kpi-transmonseg"
```

- [ ] **Step 3: Verify healthy**

```bash
ssh transmonseg-vps "pm2 show kpi-transmonseg | grep -E 'status|restarts'"
curl -sS -o /dev/null -w "%{http_code}\n" https://kpi.transmonseg.com.br/login
```

Expected: `status: online`, `200`.

---

### Task 4: Generate the 20 access slugs

**Files:** none — one-off script, run from scratchpad, deleted after use.

**Interfaces:**
- Produces: 20 rows in `links_acesso`. Final output: 20 URLs of the form `https://kpi.transmonseg.com.br/acesso/<slug>`.

- [ ] **Step 1: Write the script**

Save to `/private/tmp/claude-501/-Users-joaquimsalles/91f05c12-c01d-4e78-91a8-e528b9e478cf/scratchpad/gerar-links-acesso.mjs`:

```javascript
const BASE = 'https://kpi.transmonseg.com.br'
const SVC = process.env.SUPABASE_SERVICE_KEY
if (!SVC) throw new Error('Defina SUPABASE_SERVICE_KEY no ambiente antes de rodar.')

const REDES = [
  'PRINCESA', 'PREZUNIC', 'ZONA_SUL', 'ASSAI', 'SENDAS', 'CARREFOUR',
  'SUPERPRIX', 'GUANABARA', 'SUPER_PAX', 'FEIRA_NOVA', 'EMANUEL',
  'ARMAZEM_GRAO', 'ATACADAO', 'VIANENSE', 'SAMS_CLUB', 'MUNDIAL',
  'SUPERCOMPRAS', 'CAB_PETROPOLIS',
]
const slugify = r => r.toLowerCase().replace(/_/g, '-')

function mesesConhecidos() {
  const hoje = new Date().toISOString().slice(0, 7)
  const meses = []
  let y = 2026, m = 5
  while (`${y}-${String(m).padStart(2, '0')}` <= hoje) {
    meses.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return meses
}

async function svc(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      apikey: SVC,
      Authorization: `Bearer ${SVC}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`)
  return res.json()
}

async function main() {
  const meses = mesesConhecidos()
  const [{ user_id: criadoPor }] = await svc(
    '/rest/v1/perfis?select=user_id&email=eq.joaquimsallescp1110@gmail.com'
  )

  const pedidos = [
    { slug: 'gerente', papel: 'gerente', redes: REDES },
    ...REDES.map(r => ({ slug: slugify(r), papel: 'visualizador', redes: [r] })),
    { slug: 'visualizador', papel: 'visualizador', redes: REDES },
  ]

  const linhas = []
  for (const p of pedidos) {
    await svc('/rest/v1/links_acesso', {
      method: 'POST',
      body: JSON.stringify({ slug: p.slug, papel: p.papel, redes: p.redes, meses, criado_por: criadoPor }),
    })
    linhas.push(`${p.slug.padEnd(18)} ${BASE}/acesso/${p.slug}`)
  }

  console.log(linhas.join('\n'))
}

main()
```

- [ ] **Step 2: Run it against production**

```bash
export SUPABASE_SERVICE_KEY="<SERVICE_KEY do Contabo, ver sistema-kpi/chaves.md no cofre>"
node /private/tmp/claude-501/-Users-joaquimsalles/91f05c12-c01d-4e78-91a8-e528b9e478cf/scratchpad/gerar-links-acesso.mjs
```

Expected: 20 lines, one per slug.

- [ ] **Step 3: Delete the scratch script**

```bash
rm /private/tmp/claude-501/-Users-joaquimsalles/91f05c12-c01d-4e78-91a8-e528b9e478cf/scratchpad/gerar-links-acesso.mjs
```

---

### Task 5: Clean up the 20 old single-use convites

**Files:** none.

- [ ] **Step 1: Delete the 20 convites rows created for the previous request**

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"delete from convites where expira_em is null and criado_por = (select user_id from perfis where email = 'joaquimsallescp1110@gmail.com');\""
```

Expected: `DELETE 20`.

Note: this only targets the batch just created (all have `expira_em is null`, all `criado_por` the same admin) — it does not touch any other pre-existing convite.

---

### Task 6: Verify end-to-end and hand off

**Files:** none.

- [ ] **Step 1: SQL check — 20 rows in `links_acesso`, 0 leftover in `convites`**

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"select count(*) from links_acesso;\" -c \"select count(*) from convites where expira_em is null;\""
```

Expected: `20`, then `0`.

- [ ] **Step 2: Open one `/acesso/<slug>` link in a real browser and confirm it works**

Navigate to `https://kpi.transmonseg.com.br/acesso/prezunic`, confirm "Definir sua senha" (not "Link indisponível"), screenshot it.

- [ ] **Step 3: Send the screenshot and the full list of 20 pretty links to the user**
