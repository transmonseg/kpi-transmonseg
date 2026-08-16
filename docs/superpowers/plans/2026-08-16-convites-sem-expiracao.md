# Convites sem expiração + geração de acessos por rede — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make invite links (`convites`) never expire by default, then use the system to issue 20 permanent invites (1 gerente with full access, 18 visualizador — one per rede, 1 visualizador with all 18 redes).

**Architecture:** `convites.expira_em` becomes nullable with no default (`null` = never expires). A new pure helper `conviteExpirado()` centralizes the null-safe expiration check, replacing the three duplicated inline checks. No new tables, no new UI — the existing invite flow (`/painel/usuarios` → `criarConvite` → `/convite/[token]`) is reused as-is.

**Tech Stack:** Next.js 16 (App Router, server actions), TypeScript, Supabase-compatible Postgres/PostgREST self-hosted on Contabo (`kpi_transmonseg` db), Vitest.

## Global Constraints

- Apply every code/migration change identically to **both** repos: `~/Projects/Transmonseg/kpi/KPI TEMP` and `~/Projects/Transmonseg/kpi/KPI transmonseg` (definitivo) — same relative file paths, same diffs (per project sync convention).
- Production is the self-hosted Contabo stack at `https://kpi.transmonseg.com.br`. The app actually deployed there (PM2 process `kpi-transmonseg`, `/srv/kpi-transmonseg` on the VPS) tracks the **definitivo** repo (`transmonseg/kpi-transmonseg`), not TEMP — the migration and deploy steps target that repo/DB.
- Do not touch `/kpi-publico`, `kpi_manual_links_publicos`, or anything under the KPI Manual system — out of scope (see spec).
- Existing convites (already issued, still carrying a 7-day `expira_em`) are left untouched — this change is not retroactive.
- Never write secret values (service-role keys, DB passwords) into files that get committed — pass them via env vars at the shell when running one-off scripts.

---

### Task 1: Migration — `convites.expira_em` becomes nullable, no default

**Files:**
- Create (both repos, identical content): `supabase/migrations/20260816000000_convites_expira_em_nullable.sql`

**Interfaces:**
- Produces: after this migration, inserting into `convites` without an `expira_em` value yields `NULL` (previously defaulted to `now() + 7 days`).

- [ ] **Step 1: Write the migration file**

```sql
-- Convites deixam de expirar por padrão: expira_em vira opcional. NULL =
-- nunca expira. Convites já existentes mantêm o prazo que já tinham —
-- não é retroativo.
alter table convites alter column expira_em drop default;
alter table convites alter column expira_em drop not null;
```

Save this exact content to `supabase/migrations/20260816000000_convites_expira_em_nullable.sql` in **both** repos.

- [ ] **Step 2: Apply the migration to the real production database (Contabo)**

Run (this is the only database that matters — `kpi_transmonseg` on the Contabo VPS; the old Supabase cloud project is decommissioned and does not need this):

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"alter table convites alter column expira_em drop default; alter table convites alter column expira_em drop not null;\""
```

Expected output: two `ALTER TABLE` lines, no error.

- [ ] **Step 3: Verify the column is now nullable with no default**

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"select column_name, is_nullable, column_default from information_schema.columns where table_name = 'convites' and column_name = 'expira_em';\""
```

Expected: `is_nullable = YES`, `column_default` empty/null.

- [ ] **Step 4: Commit the migration file in both repos**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
git add supabase/migrations/20260816000000_convites_expira_em_nullable.sql
git commit -m "feat(convites): expira_em vira opcional (null = nunca expira)"
```

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg"
git add supabase/migrations/20260816000000_convites_expira_em_nullable.sql
git commit -m "feat(convites): expira_em vira opcional (null = nunca expira)"
```

Note: `criarConvite` (`src/app/painel/usuarios/actions.ts`) already inserts into `convites` **without** setting `expira_em` (`.insert({ papel, redes, meses, criado_por: userId })`) — no code change needed there. Once this migration lands, every new convite it creates is born with `expira_em = null` automatically.

---

### Task 2: `conviteExpirado()` helper + unit test

**Files:**
- Modify: `src/lib/perfil.ts` (both repos)
- Create: `src/lib/perfil.test.ts` (both repos)

**Interfaces:**
- Produces: `export function conviteExpirado(expiraEm: string | null): boolean` — `true` only when `expiraEm` is non-null and in the past. `null` always means "never expires" → `false`.
- Consumed by: Task 3 (the three call sites that currently duplicate this check inline).

- [ ] **Step 1: Write the failing test**

Create `src/lib/perfil.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { conviteExpirado } from './perfil'

describe('conviteExpirado', () => {
  it('null (nunca expira) → false', () => {
    expect(conviteExpirado(null)).toBe(false)
  })

  it('data no passado → true', () => {
    expect(conviteExpirado('2020-01-01T00:00:00.000Z')).toBe(true)
  })

  it('data no futuro → false', () => {
    expect(conviteExpirado('2999-01-01T00:00:00.000Z')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && npx vitest run src/lib/perfil.test.ts
```

Expected: FAIL — `conviteExpirado` is not exported from `./perfil`.

- [ ] **Step 3: Implement the helper**

Add to `src/lib/perfil.ts` (near `mesValido`, at the end of the file):

```typescript
/** null = convite sem prazo (nunca expira). Só é expirado se tiver uma
 *  data e ela já tiver passado. */
export function conviteExpirado(expiraEm: string | null): boolean {
  return expiraEm !== null && new Date(expiraEm) < new Date()
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && npx vitest run src/lib/perfil.test.ts
```

Expected: PASS, 3/3.

- [ ] **Step 5: Repeat steps 1-4 identically in the definitivo repo**

Same two files (`src/lib/perfil.ts`, `src/lib/perfil.test.ts`), same content, in `~/Projects/Transmonseg/kpi/KPI transmonseg`. Run the same test command there and confirm PASS.

- [ ] **Step 6: Commit in both repos**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
git add src/lib/perfil.ts src/lib/perfil.test.ts
git commit -m "feat(perfil): conviteExpirado() — null-safe, null nunca expira"
```

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg"
git add src/lib/perfil.ts src/lib/perfil.test.ts
git commit -m "feat(perfil): conviteExpirado() — null-safe, null nunca expira"
```

---

### Task 3: Use `conviteExpirado()` at the three call sites

**Files:**
- Modify: `src/app/convite/[token]/page.tsx:1-6,26` (both repos)
- Modify: `src/app/convite/[token]/actions.ts:1-6,25-27` (both repos)
- Modify: `src/app/painel/usuarios/page.tsx:1-13,40` (both repos)

**Interfaces:**
- Consumes: `conviteExpirado(expiraEm: string | null): boolean` from `@/lib/perfil` (Task 2).

- [ ] **Step 1: Update `src/app/convite/[token]/page.tsx`**

Add the import (alongside the existing ones near the top):

```typescript
import { conviteExpirado } from '@/lib/perfil'
```

Replace line 26:

```typescript
const expirado = !!convite && new Date(convite.expira_em as string) < new Date()
```

with:

```typescript
const expirado = !!convite && conviteExpirado(convite.expira_em as string | null)
```

- [ ] **Step 2: Update `src/app/convite/[token]/actions.ts`**

Add the import:

```typescript
import { conviteExpirado } from '@/lib/perfil'
```

Replace lines 25-27:

```typescript
  if (new Date(convite.expira_em as string) < new Date()) {
    redirect('/login?erro=' + encodeURIComponent('Esse convite expirou. Peça um link novo.'))
  }
```

with:

```typescript
  if (conviteExpirado(convite.expira_em as string | null)) {
    redirect('/login?erro=' + encodeURIComponent('Esse convite expirou. Peça um link novo.'))
  }
```

- [ ] **Step 3: Update `src/app/painel/usuarios/page.tsx`**

Add the import (there's already an import from `@/lib/perfil` on line 7 — add `conviteExpirado` to that same import list: `import { getPerfil } from '@/lib/perfil'` → `import { getPerfil, conviteExpirado } from '@/lib/perfil'`).

Replace line 40:

```typescript
    .filter(c => new Date(c.expira_em as string) > new Date())
```

with:

```typescript
    .filter(c => !conviteExpirado(c.expira_em as string | null))
```

- [ ] **Step 4: Type-check and run the full test suite**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && npx tsc --noEmit && npx vitest run
```

Expected: no type errors, all tests pass (including the 3 new ones from Task 2).

- [ ] **Step 5: Repeat steps 1-4 identically in the definitivo repo**

Same three files, same edits, in `~/Projects/Transmonseg/kpi/KPI transmonseg`. Run the same `tsc --noEmit && vitest run` there and confirm clean.

- [ ] **Step 6: Commit in both repos**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
git add src/app/convite/\[token\]/page.tsx src/app/convite/\[token\]/actions.ts src/app/painel/usuarios/page.tsx
git commit -m "refactor(convites): usa conviteExpirado() nos 3 pontos de checagem"
```

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg"
git add src/app/convite/\[token\]/page.tsx src/app/convite/\[token\]/actions.ts src/app/painel/usuarios/page.tsx
git commit -m "refactor(convites): usa conviteExpirado() nos 3 pontos de checagem"
```

---

### Task 4: Push and deploy to production (Contabo)

**Files:** none (operational task — push + remote deploy).

**Interfaces:**
- Consumes: commits from Tasks 1-3 in both repos.

- [ ] **Step 1: Push both repos to GitHub**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && git push origin main
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg" && git push origin main
```

- [ ] **Step 2: Deploy the definitivo repo on the Contabo VPS**

The live PM2 process (`kpi-transmonseg`, cwd `/srv/kpi-transmonseg`) tracks `transmonseg/kpi-transmonseg` (the definitivo repo):

```bash
ssh transmonseg-vps "cd /srv/kpi-transmonseg && git pull origin main && npm ci && npm run build && pm2 restart kpi-transmonseg"
```

- [ ] **Step 3: Verify the deploy is healthy**

```bash
ssh transmonseg-vps "pm2 show kpi-transmonseg | grep -E 'status|restarts|pid'"
curl -sS -o /dev/null -w "%{http_code}\n" https://kpi.transmonseg.com.br/login
```

Expected: `status: online`, no crash loop, `200` from curl.

---

### Task 5: Generate the 20 invite links

**Files:** none — one-off script, run from the scratchpad directory, deleted after use (not committed; the 20 rows it creates in `convites` are the actual deliverable, not a repo artifact).

**Interfaces:**
- Consumes: `convites` table now accepting `expira_em = null` (Task 1, deployed via Task 4). REDES catalog (18 codes, copied from `src/lib/kpi/redes.ts`). `mesesConhecidos()` logic (copied from `src/lib/kpi/meses.ts`) — as of 2026-08-16 this evaluates to `['2026-05','2026-06','2026-07','2026-08']`.
- Produces: 20 rows in `convites` (1 gerente, 19 visualizador), each with `expira_em = null`, `criado_por` = the admin's `auth.users.id` for `joaquimsallescp1110@gmail.com`. Final output: a list of 20 URLs of the form `https://kpi.transmonseg.com.br/convite/<token>`.

- [ ] **Step 1: Write the generation script**

Save to `/private/tmp/claude-501/-Users-joaquimsalles/91f05c12-c01d-4e78-91a8-e528b9e478cf/scratchpad/gerar-convites.mjs`:

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

function mesesConhecidos() {
  const hoje = new Date().toISOString().slice(0, 7) // aproximação (UTC) — ok pra este uso pontual
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
    { label: 'gerente (todas as redes)', papel: 'gerente', redes: REDES },
    ...REDES.map(r => ({ label: `visualizador (${r})`, papel: 'visualizador', redes: [r] })),
    { label: 'visualizador (todas as redes)', papel: 'visualizador', redes: REDES },
  ]

  const linhas = []
  for (const p of pedidos) {
    const [row] = await svc('/rest/v1/convites', {
      method: 'POST',
      body: JSON.stringify({ papel: p.papel, redes: p.redes, meses, criado_por: criadoPor }),
    })
    linhas.push(`${p.label.padEnd(32)} ${BASE}/convite/${row.token}`)
  }

  console.log(linhas.join('\n'))
}

main()
```

- [ ] **Step 2: Run it against production**

```bash
export SUPABASE_SERVICE_KEY="<SERVICE_KEY do Contabo, ver sistema-kpi/chaves.md no cofre>"
node /private/tmp/claude-501/-Users-joaquimsalles/91f05c12-c01d-4e78-91a8-e528b9e478cf/scratchpad/gerar-convites.mjs
```

Expected: 20 lines printed, one per invite, each a full `https://kpi.transmonseg.com.br/convite/<token>` URL.

- [ ] **Step 3: Delete the scratch script**

```bash
rm /private/tmp/claude-501/-Users-joaquimsalles/91f05c12-c01d-4e78-91a8-e528b9e478cf/scratchpad/gerar-convites.mjs
```

---

### Task 6: Verify end-to-end and hand off

**Files:** none.

- [ ] **Step 1: SQL check — 20 new convites, all with `expira_em is null`**

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"select papel, redes, expira_em from convites where expira_em is null order by criado_em desc limit 20;\""
```

Expected: 20 rows, `expira_em` column empty for all.

- [ ] **Step 2: Open one visualizador link in a real browser and confirm it works**

Use the chrome-devtools browser tool to navigate to one of the generated visualizador URLs, confirm the page shows "Definir sua senha" (not "Convite indisponível"), and take a screenshot.

- [ ] **Step 3: Send the screenshot and the full list of 20 links to the user**
