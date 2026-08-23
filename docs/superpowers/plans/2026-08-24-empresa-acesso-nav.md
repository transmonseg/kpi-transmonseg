# Escopo por empresa + reorganização de navegação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma dimensão de escopo "empresa" (Benassi/Nutry Max/Portefrio) ao modelo de permissão existente, fechar gaps de autorização reais descobertos durante a investigação (rotas sem check de papel nenhum), e reorganizar a navegação lateral e um seletor de empresa no topo do painel.

**Architecture:** Nova coluna `empresas text[]` em `perfis`/`convites`, no mesmo padrão já usado por `redes`/`meses`. Uma função `empresaLiberada(perfil, empresa)` em `src/lib/perfil.ts`, aplicada em toda rota/página que hoje pertence a uma empresa específica. A UI de convite e a navegação são estendidas pra ler/escrever essa dimensão nova, sem remover nenhum comportamento existente.

**Tech Stack:** Next.js 16 (App Router, alguns segmentos `'use client'`), Supabase (Postgres + Auth), Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-23-empresa-acesso-nav-design.md`

## Global Constraints

- Repositório de trabalho: `/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg` (branch `main`), espelhado byte-a-byte em `/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP` (branch `main`). Toda mudança replicada nos 2, verificada com `diff` E `git status --short` (não só diff de conteúdo — um deles pode ter um arquivo a mais/a menos que o `diff` de conteúdo não pega), commit e push nos 2, sempre.
- Nunca aplicar a migration nem fazer deploy em produção sem perguntar ao usuário explicitamente. Produção (`kpi.transmonseg.com.br`) roda em `/srv/kpi-transmonseg` no Contabo, vinculada a `github.com/transmonseg/kpi-transmonseg.git` — está hoje bem atrás de `origin/main` (reconstrução do Nutry Max ainda não deployada, não é problema deste plano).
- `redes` continua com o mesmo sentido de hoje: sub-escopo só *dentro* de `benassi`. `meses` continua específico de Benassi. Nenhum dos dois se estende a Nutrimax/Portefrio.
- Toda checagem de empresa nova é **aditiva** — nunca remove um check de `redes`/`papel` que já existir num arquivo.
- Cozinha não é tocada em nenhuma task deste plano.
- Comandos do projeto: `npm test` (vitest), `npm run lint`, `npm run build` (typecheck acontece dentro do build — sem comando dedicado).
- Working tree deve estar limpo antes de começar (`git status` nos dois repos).

---

## Achado de investigação (motiva a Task 3)

Durante a exploração desta feature, foi descoberto que várias rotas/páginas de Benassi hoje **não têm nenhum check de papel**, além de faltar o de empresa — não é um gap introduzido por esta feature, é pré-existente:

- `src/app/api/kpi/simples/route.ts` (POST e GET), `presign/route.ts`, `analisar-alt/route.ts`, `regerar/route.ts`: só checam `auth.getUser()` (autenticado = passa), sem checar `papel`. O nav de hoje só mostra esses links pro admin (`GROUPS` em `nav.tsx` só renderiza pra `papel === 'admin'`), então na prática são telas admin-only — só que sem enforcement real: qualquer login autenticado que digite a URL já consegue gerar/regenerar KPI de verdade.
- `src/app/painel/lojas/page.tsx`: mesma coisa, zero check.
- `src/app/api/kpi/nutrimax/gerar/route.ts` e `src/app/painel/nutrimax/gerar/page.tsx`: idem (já coberto na Task 2).

Em contraste, `src/app/api/dashboard/beta/route.ts` (GET) e `src/app/api/kpi-manual/dia/route.ts`/`link-publico/route.ts` **já** fazem checagem real de `papel`/`redes` — esses só precisam ganhar a checagem de empresa, sem virar admin-only (são de fato usados por login restrito).

A Task 3 fecha os dois tipos de gap: admin-only onde faltava completamente, `empresaLiberada` onde já existia lógica de perfil mas faltava a dimensão de empresa.

---

### Task 1: Migration + módulo de empresas + extensão de `perfil.ts`

**Files:**
- Create: `supabase/migrations/20260824000000_perfis_convites_empresas.sql`
- Create: `src/lib/kpi/empresas.ts`
- Modify: `src/lib/perfil.ts`
- Modify: `src/lib/perfil.test.ts`

**Interfaces:**
- Produces: `EMPRESAS: readonly ['benassi', 'nutrimax', 'portefrio']`, `EMPRESA_LABEL: Record<string, string>` (de `src/lib/kpi/empresas.ts`); `Perfil` ganha campo `empresas: string[]`; `empresaValida(e: string): boolean`, `empresaLiberada(perfil: Perfil, empresa: string): boolean` (de `src/lib/perfil.ts`). Todas as tasks seguintes consomem essas exportações.

- [ ] **Step 1: Criar a migration**

```sql
-- Escopo por empresa, no mesmo padrão de `redes`/`meses`: array direto na
-- linha de perfis/convites, sem tabela de junção. 'admin' sempre vê tudo
-- (bypass em empresaLiberada, ver src/lib/perfil.ts). 'redes' continua
-- sendo sub-escopo só dentro de 'benassi' -- não muda de sentido.
-- Ver docs/superpowers/specs/2026-08-23-empresa-acesso-nav-design.md.

alter table perfis add column if not exists empresas text[] not null default '{}';
alter table convites add column if not exists empresas text[] not null default '{}';

-- Backfill: hoje 100% dos logins restritos são de Benassi.
update perfis set empresas = array['benassi'] where empresas = '{}';
```

**Não aplicar esta migration em nenhum banco ainda** — isso é gate humano, coberto na seção de Validação manual ao final deste plano.

- [ ] **Step 2: Criar `src/lib/kpi/empresas.ts`**

```ts
// Empresas atendidas pelo sistema de KPI (cada uma com seu próprio pipeline).
// Portefrio ainda não tem nenhuma tela — só existe como valor atribuível a um
// login, pra não precisar mexer no modelo de dados de novo quando a tela existir.
export const EMPRESAS = ['benassi', 'nutrimax', 'portefrio'] as const

export const EMPRESA_LABEL: Record<string, string> = {
  benassi: 'Benassi',
  nutrimax: 'Nutry Max',
  portefrio: 'Portefrio',
}
```

- [ ] **Step 3: Estender `src/lib/perfil.ts`**

Arquivo atual completo (pra referência exata do que muda):

```ts
import { createServiceClient } from '@/lib/supabase/service'
import { REDES } from '@/lib/kpi/redes'

export type Papel = 'admin' | 'gerente' | 'visualizador'
export type Perfil = { papel: Papel; redes: string[]; meses: string[] }

const SEM_ACESSO: Perfil = { papel: 'visualizador', redes: [], meses: [] }

export async function getPerfil(userId: string): Promise<Perfil> {
  const svc = createServiceClient()
  const { data } = await svc.from('perfis').select('papel, redes, meses').eq('user_id', userId).maybeSingle()
  if (!data) return SEM_ACESSO
  return {
    papel: data.papel as Papel,
    redes: (data.redes as string[] | null) ?? [],
    meses: (data.meses as string[] | null) ?? [],
  }
}

export function redesEfetivas(perfil: Perfil, redesPedidas: string[]): string[] {
  if (perfil.papel === 'admin') return redesPedidas
  if (redesPedidas.length === 0) return perfil.redes
  return redesPedidas.filter(r => perfil.redes.includes(r))
}

export function redeValida(r: string): r is (typeof REDES)[number] {
  return (REDES as readonly string[]).includes(r)
}

export function mesLiberado(perfil: Perfil, mes: string): boolean {
  return perfil.papel === 'admin' || perfil.meses.includes(mes)
}

export function mesValido(m: string): boolean {
  return /^\d{4}-\d{2}$/.test(m)
}

export function conviteExpirado(expiraEm: string | null): boolean {
  return expiraEm !== null && new Date(expiraEm) < new Date()
}
```

Substitua por (mudanças: import de `EMPRESAS`, campo `empresas` no tipo e em `SEM_ACESSO`, leitura em `getPerfil`, duas funções novas no final — todo o resto idêntico):

```ts
import { createServiceClient } from '@/lib/supabase/service'
import { REDES } from '@/lib/kpi/redes'
import { EMPRESAS } from '@/lib/kpi/empresas'

export type Papel = 'admin' | 'gerente' | 'visualizador'
export type Perfil = { papel: Papel; redes: string[]; meses: string[]; empresas: string[] }

const SEM_ACESSO: Perfil = { papel: 'visualizador', redes: [], meses: [], empresas: [] }

export async function getPerfil(userId: string): Promise<Perfil> {
  const svc = createServiceClient()
  const { data } = await svc.from('perfis').select('papel, redes, meses, empresas').eq('user_id', userId).maybeSingle()
  if (!data) return SEM_ACESSO
  return {
    papel: data.papel as Papel,
    redes: (data.redes as string[] | null) ?? [],
    meses: (data.meses as string[] | null) ?? [],
    empresas: (data.empresas as string[] | null) ?? [],
  }
}

export function redesEfetivas(perfil: Perfil, redesPedidas: string[]): string[] {
  if (perfil.papel === 'admin') return redesPedidas
  if (redesPedidas.length === 0) return perfil.redes
  return redesPedidas.filter(r => perfil.redes.includes(r))
}

export function redeValida(r: string): r is (typeof REDES)[number] {
  return (REDES as readonly string[]).includes(r)
}

export function mesLiberado(perfil: Perfil, mes: string): boolean {
  return perfil.papel === 'admin' || perfil.meses.includes(mes)
}

export function mesValido(m: string): boolean {
  return /^\d{4}-\d{2}$/.test(m)
}

export function empresaValida(e: string): e is (typeof EMPRESAS)[number] {
  return (EMPRESAS as readonly string[]).includes(e)
}

export function empresaLiberada(perfil: Perfil, empresa: string): boolean {
  return perfil.papel === 'admin' || perfil.empresas.includes(empresa)
}

export function conviteExpirado(expiraEm: string | null): boolean {
  return expiraEm !== null && new Date(expiraEm) < new Date()
}
```

- [ ] **Step 4: Adicionar testes em `src/lib/perfil.test.ts`**

Arquivo atual:

```ts
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

Substitua por (mantém o describe existente, adiciona dois novos):

```ts
import { describe, it, expect } from 'vitest'
import { conviteExpirado, empresaValida, empresaLiberada, type Perfil } from './perfil'

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

describe('empresaValida', () => {
  it('empresa conhecida → true', () => {
    expect(empresaValida('benassi')).toBe(true)
    expect(empresaValida('nutrimax')).toBe(true)
    expect(empresaValida('portefrio')).toBe(true)
  })

  it('empresa desconhecida → false', () => {
    expect(empresaValida('inexistente')).toBe(false)
  })
})

describe('empresaLiberada', () => {
  it('admin sempre liberado, mesmo sem a empresa na lista', () => {
    const perfil: Perfil = { papel: 'admin', redes: [], meses: [], empresas: [] }
    expect(empresaLiberada(perfil, 'nutrimax')).toBe(true)
  })

  it('visualizador com a empresa na lista → liberado', () => {
    const perfil: Perfil = { papel: 'visualizador', redes: [], meses: [], empresas: ['nutrimax'] }
    expect(empresaLiberada(perfil, 'nutrimax')).toBe(true)
  })

  it('visualizador sem a empresa na lista → bloqueado', () => {
    const perfil: Perfil = { papel: 'visualizador', redes: [], meses: [], empresas: ['nutrimax'] }
    expect(empresaLiberada(perfil, 'benassi')).toBe(false)
  })
})
```

- [ ] **Step 5: Rodar os testes**

Run: `npm test -- perfil.test.ts`
Expected: PASS, todos os `describe` verdes.

- [ ] **Step 6: Rodar o build (typecheck)**

Run: `npm run build`
Expected: sem erro de tipo. Neste ponto `Perfil` já tem `empresas` obrigatório — se algum outro arquivo constrói um objeto `Perfil` manualmente sem esse campo, o build vai apontar. As Tasks seguintes cobrem os dois pontos já identificados (`src/app/painel/historico/page.tsx` e `src/app/painel/layout.tsx`); se o build acusar algum outro, resolva adicionando `empresas: []` ao literal antes de prosseguir.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260824000000_perfis_convites_empresas.sql src/lib/kpi/empresas.ts src/lib/perfil.ts src/lib/perfil.test.ts
git commit -m "feat(perfil): adiciona dimensão de escopo por empresa (benassi/nutrimax/portefrio)"
```

---

### Task 2: Enforcement em Nutry Max

**Files:**
- Modify: `src/app/api/kpi/nutrimax/gerar/route.ts`
- Create: `src/app/painel/nutrimax/layout.tsx`

**Interfaces:**
- Consumes: `getPerfil` (`@/lib/perfil`), `empresaLiberada` (`@/lib/perfil`) — de Task 1.

**Contexto:** `src/app/painel/nutrimax/gerar/page.tsx` é `'use client'` (não dá pra fazer `redirect()` de servidor dentro dele) — por isso o gate vai num `layout.tsx` novo na raiz de `nutrimax/`, cobrindo qualquer página futura sob esse caminho sem precisar mexer de novo.

- [ ] **Step 1: Adicionar o check em `src/app/api/kpi/nutrimax/gerar/route.ts`**

O início do handler hoje é:

```ts
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const form = await req.formData()
```

Troque por (adiciona import de `getPerfil`/`empresaLiberada` no topo do arquivo e o check logo após a autenticação):

```ts
import { getPerfil, empresaLiberada } from '@/lib/perfil'
```

```ts
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const perfil = await getPerfil(user.id)
  if (!empresaLiberada(perfil, 'nutrimax')) {
    return new NextResponse('Sem permissão.', { status: 403 })
  }

  const form = await req.formData()
```

(A linha `import { getPerfil, empresaLiberada } from '@/lib/perfil'` vai junto com os outros imports já existentes no topo do arquivo, ex. logo abaixo de `import { createClient } from '@/lib/supabase/server'`.)

- [ ] **Step 2: Criar `src/app/painel/nutrimax/layout.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfil, empresaLiberada } from '@/lib/perfil'

export default async function NutrimaxLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const perfil = await getPerfil(user.id)
  if (!empresaLiberada(perfil, 'nutrimax')) redirect('/painel')

  return <>{children}</>
}
```

- [ ] **Step 3: Rodar lint e build**

Run: `npm run lint src/app/api/kpi/nutrimax/gerar/route.ts src/app/painel/nutrimax/layout.tsx && npm run build`
Expected: sem erros.

- [ ] **Step 4: Teste manual rápido**

Com o servidor local rodando (`npm run dev`), logado como um usuário cujo `perfis.empresas` NÃO contenha `'nutrimax'` (qualquer login de teste hoje, já que o backfill da Task 1 só dá `benassi`): acessar `/painel/nutrimax/gerar` deve redirecionar pra `/painel`; um `curl -X POST` autenticado (com o cookie de sessão) em `/api/kpi/nutrimax/gerar` deve devolver 403. Isso não precisa de migration aplicada em produção — só que a migration da Task 1 já esteja aplicada no ambiente onde esse teste rodar (dev/local).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/kpi/nutrimax/gerar/route.ts src/app/painel/nutrimax/layout.tsx
git commit -m "fix(nutrimax): fecha rota e pagina sem check de empresa nenhum"
```

---

### Task 3: Enforcement em Benassi (admin-only onde faltava tudo, empresa onde já tinha lógica)

**Files:**
- Modify: `src/app/api/kpi/simples/route.ts`
- Modify: `src/app/api/kpi/simples/presign/route.ts`
- Modify: `src/app/api/kpi/simples/analisar-alt/route.ts`
- Modify: `src/app/api/kpi/simples/regerar/route.ts`
- Modify: `src/app/api/kpi-manual/dia/route.ts`
- Modify: `src/app/api/kpi-manual/link-publico/route.ts`
- Modify: `src/app/api/dashboard/beta/route.ts`
- Modify: `src/app/painel/lojas/page.tsx`
- Modify: `src/app/painel/historico/page.tsx`
- Create: `src/app/painel/kpi/simples/layout.tsx`
- Create: `src/app/painel/kpi/visualizar/layout.tsx`
- Create: `src/app/painel/dashboard/beta/layout.tsx`

**Interfaces:**
- Consumes: `getPerfil`, `empresaLiberada` (`@/lib/perfil`) — de Task 1.

- [ ] **Step 1: `src/app/api/kpi/simples/route.ts` — admin-only nos dois handlers**

Adicionar ao topo do arquivo (junto dos imports já existentes):

```ts
import { getPerfil } from '@/lib/perfil'
```

No `POST`, o trecho hoje é:

```ts
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const body = await req.json().catch(() => null)
```

Trocar por:

```ts
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })
  const perfil = await getPerfil(user.id)
  if (perfil.papel !== 'admin') return new NextResponse('Sem permissão.', { status: 403 })

  const body = await req.json().catch(() => null)
```

No `GET` (comentário `// GET /api/kpi/simples?data=YYYY-MM-DD → lista histórico de gerações`), o trecho hoje é:

```ts
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const url = new URL(req.url)
```

Trocar por:

```ts
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })
  const perfil = await getPerfil(user.id)
  if (perfil.papel !== 'admin') return new NextResponse('Sem permissão.', { status: 403 })

  const url = new URL(req.url)
```

- [ ] **Step 2: `src/app/api/kpi/simples/presign/route.ts` — admin-only**

Adicionar `import { getPerfil } from '@/lib/perfil'` aos imports. O handler hoje começa:

```ts
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { data, escalaFilename, unitracFilename } = await req.json()
```

Trocar por:

```ts
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })
  const perfil = await getPerfil(user.id)
  if (perfil.papel !== 'admin') return new NextResponse('Sem permissão.', { status: 403 })

  const { data, escalaFilename, unitracFilename } = await req.json()
```

- [ ] **Step 3: `src/app/api/kpi/simples/analisar-alt/route.ts` — admin-only**

Adicionar `import { getPerfil } from '@/lib/perfil'` aos imports. O handler hoje começa:

```ts
export async function POST(req: NextRequest) {
  // createClient (com cookies) so pra autenticacao
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  // Bug I3 (auditoria 2026-05-27): buildLookupContext e inferirSaiDaEscala leem
```

Trocar por:

```ts
export async function POST(req: NextRequest) {
  // createClient (com cookies) so pra autenticacao
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })
  const perfil = await getPerfil(user.id)
  if (perfil.papel !== 'admin') return new NextResponse('Sem permissão.', { status: 403 })

  // Bug I3 (auditoria 2026-05-27): buildLookupContext e inferirSaiDaEscala leem
```

- [ ] **Step 4: `src/app/api/kpi/simples/regerar/route.ts` — admin-only**

Este arquivo já importa `getPerfil` (usado dentro de `filtrarPorPerfil`). O handler `POST` hoje começa:

```ts
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const body = await req.json().catch(() => null) as { id?: string } | null
```

Trocar por:

```ts
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })
  const perfilChamador = await getPerfil(user.id)
  if (perfilChamador.papel !== 'admin') return new NextResponse('Sem permissão.', { status: 403 })

  const body = await req.json().catch(() => null) as { id?: string } | null
```

(Nome `perfilChamador` em vez de `perfil` pra não colidir com o `perfil` já usado dentro de `filtrarPorPerfil`, que é uma função separada — sem conflito de escopo real, mas evita confusão de leitura no arquivo.)

- [ ] **Step 5: `src/app/api/kpi-manual/dia/route.ts` — empresaLiberada, sem virar admin-only**

Este arquivo já importa `getPerfil`. Trocar o import:

```ts
import { getPerfil, redesEfetivas } from '@/lib/perfil'
```

por:

```ts
import { getPerfil, redesEfetivas, empresaLiberada } from '@/lib/perfil'
```

O trecho hoje:

```ts
  const linhas = (rows ?? []) as LinhaManual[]
  const perfil = await getPerfil(user.id)
  const todasRedesPresentes = [...new Set(linhas.map(l => l.rede_id))]
```

Trocar por:

```ts
  const linhas = (rows ?? []) as LinhaManual[]
  const perfil = await getPerfil(user.id)
  if (!empresaLiberada(perfil, 'benassi')) return new NextResponse('Sem permissão.', { status: 403 })
  const todasRedesPresentes = [...new Set(linhas.map(l => l.rede_id))]
```

- [ ] **Step 6: `src/app/api/kpi-manual/link-publico/route.ts` — empresaLiberada**

Trocar o import `import { getPerfil, redesEfetivas } from '@/lib/perfil'` por `import { getPerfil, redesEfetivas, empresaLiberada } from '@/lib/perfil'`.

O trecho hoje:

```ts
  const perfil = await getPerfil(user.id)
  if (perfil.papel === 'visualizador') {
    return new NextResponse('Sem permissão para gerar link público.', { status: 403 })
  }
```

Trocar por:

```ts
  const perfil = await getPerfil(user.id)
  if (perfil.papel === 'visualizador') {
    return new NextResponse('Sem permissão para gerar link público.', { status: 403 })
  }
  if (!empresaLiberada(perfil, 'benassi')) return new NextResponse('Sem permissão.', { status: 403 })
```

- [ ] **Step 7: `src/app/api/dashboard/beta/route.ts` — empresaLiberada no GET e no POST**

Trocar o import `import { getPerfil, redesEfetivas } from '@/lib/perfil'` por `import { getPerfil, redesEfetivas, empresaLiberada } from '@/lib/perfil'`.

No `POST`, o trecho hoje:

```ts
  const perfil = await getPerfil(user.id)
  if (perfil.papel !== 'admin') return new NextResponse('Sem permissão.', { status: 403 })
```

Trocar por (admin já bypassa `empresaLiberada`, então a ordem não muda comportamento pra admin — é só consistência):

```ts
  const perfil = await getPerfil(user.id)
  if (perfil.papel !== 'admin') return new NextResponse('Sem permissão.', { status: 403 })
  if (!empresaLiberada(perfil, 'benassi')) return new NextResponse('Sem permissão.', { status: 403 })
```

No `GET`, o trecho hoje:

```ts
  const perfil = await getPerfil(user.id)
  const u = new URL(req.url)
```

Trocar por:

```ts
  const perfil = await getPerfil(user.id)
  if (!empresaLiberada(perfil, 'benassi')) return new NextResponse('Sem permissão.', { status: 403 })
  const u = new URL(req.url)
```

- [ ] **Step 8: `src/app/painel/lojas/page.tsx` — admin-only**

Arquivo atual completo:

```tsx
import { Badge } from '@/components/ui'
import { createServiceClient } from '@/lib/supabase/service'
import { LojasList } from './lista'

export default async function LojasPage() {
  const svc = createServiceClient()

  const [{ count: total }, { count: orfas }] = await Promise.all([
    svc.from('lojas').select('*', { count: 'exact', head: true }).eq('ativo', true),
    svc.from('lojas').select('*', { count: 'exact', head: true }).eq('ativo', true).is('codigo_unitrac', null),
  ])
```

Trocar por (adiciona os 3 imports novos e o bloco de check logo no início da função, antes do `svc` atual):

```tsx
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPerfil } from '@/lib/perfil'
import { LojasList } from './lista'

export default async function LojasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const perfil = await getPerfil(user.id)
  if (perfil.papel !== 'admin') redirect('/painel')

  const svc = createServiceClient()

  const [{ count: total }, { count: orfas }] = await Promise.all([
    svc.from('lojas').select('*', { count: 'exact', head: true }).eq('ativo', true),
    svc.from('lojas').select('*', { count: 'exact', head: true }).eq('ativo', true).is('codigo_unitrac', null),
  ])
```

(O resto do arquivo, a partir do `return (`, fica exatamente igual.)

- [ ] **Step 9: `src/app/painel/historico/page.tsx` — empresaLiberada**

O trecho hoje:

```tsx
import { getPerfil, redesEfetivas, type Perfil } from '@/lib/perfil'
```
...
```tsx
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const perfil = user ? await getPerfil(user.id) : { papel: 'visualizador' as const, redes: [], meses: [] }
  const podeEditar = perfil.papel === 'admin'
```

Trocar por:

```tsx
import { redirect } from 'next/navigation'
import { getPerfil, redesEfetivas, empresaLiberada, type Perfil } from '@/lib/perfil'
```
...
```tsx
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const perfil = await getPerfil(user.id)
  if (!empresaLiberada(perfil, 'benassi')) redirect('/painel')
  const podeEditar = perfil.papel === 'admin'
```

(O fallback manual `{ papel: 'visualizador' as const, redes: [], meses: [] }` deixa de existir — com `!user` já redirecionando antes, esse ramo nunca era alcançado de qualquer forma; isso também elimina o objeto `Perfil`-shaped que ficaria sem o campo `empresas` obrigatório.)

- [ ] **Step 10: Criar `src/app/painel/kpi/simples/layout.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfil } from '@/lib/perfil'

export default async function SimplesLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const perfil = await getPerfil(user.id)
  if (perfil.papel !== 'admin') redirect('/painel')

  return <>{children}</>
}
```

- [ ] **Step 11: Criar `src/app/painel/kpi/visualizar/layout.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfil, empresaLiberada } from '@/lib/perfil'

export default async function VisualizarLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const perfil = await getPerfil(user.id)
  if (!empresaLiberada(perfil, 'benassi')) redirect('/painel')

  return <>{children}</>
}
```

- [ ] **Step 12: Criar `src/app/painel/dashboard/beta/layout.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfil, empresaLiberada } from '@/lib/perfil'

export default async function DashboardBetaLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const perfil = await getPerfil(user.id)
  if (!empresaLiberada(perfil, 'benassi')) redirect('/painel')

  return <>{children}</>
}
```

- [ ] **Step 13: Rodar lint e build**

Run: `npm run lint && npm run build`
Expected: sem erros novos (compare com a baseline do projeto se já houver warnings pré-existentes de outras áreas).

- [ ] **Step 14: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — nenhum teste existente de `kpi/simples`, `dashboard-metricas`, etc. deve quebrar (as mudanças são só checagem de auth adicional em cima do que já existia, comportamento de dados não muda pra quem já passava).

- [ ] **Step 15: Commit**

```bash
git add src/app/api/kpi/simples/route.ts src/app/api/kpi/simples/presign/route.ts src/app/api/kpi/simples/analisar-alt/route.ts src/app/api/kpi/simples/regerar/route.ts src/app/api/kpi-manual/dia/route.ts src/app/api/kpi-manual/link-publico/route.ts src/app/api/dashboard/beta/route.ts src/app/painel/lojas/page.tsx src/app/painel/historico/page.tsx src/app/painel/kpi/simples/layout.tsx src/app/painel/kpi/visualizar/layout.tsx src/app/painel/dashboard/beta/layout.tsx
git commit -m "fix(benassi): fecha rotas sem check de papel e soma checagem de empresa onde ja tinha logica de perfil"
```

---

### Task 4: `EmpresasCheckboxes` + integração no form de convite

**Files:**
- Create: `src/app/painel/usuarios/empresas-checkboxes.tsx`
- Modify: `src/app/painel/usuarios/page.tsx`

**Interfaces:**
- Consumes: `EMPRESAS`, `EMPRESA_LABEL` (`@/lib/kpi/empresas`) — de Task 1.
- Produces: `EmpresasCheckboxes({ opcoes, children })` — componente client que só renderiza `children` quando `'benassi'` está entre as marcadas. Consumido só por Task 4 (não precisa ser reusado em outro lugar).

- [ ] **Step 1: Criar `src/app/painel/usuarios/empresas-checkboxes.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { EMPRESA_LABEL } from '@/lib/kpi/empresas'
import { Label } from '@/components/ui'

export function EmpresasCheckboxes({
  opcoes,
  children,
}: {
  opcoes: readonly string[]
  children?: React.ReactNode
}) {
  const [marcadas, setMarcadas] = useState<string[]>([])
  const toggle = (e: string) => setMarcadas(m => (m.includes(e) ? m.filter(x => x !== e) : [...m, e]))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Empresas que esse login pode ver</Label>
        <div className="flex flex-wrap gap-1.5">
          {opcoes.map(e => (
            <label
              key={e}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-fg-muted)] transition-colors has-[:checked]:border-[var(--color-accent)] has-[:checked]:bg-[var(--color-accent-soft)] has-[:checked]:text-[var(--color-accent-soft-fg)]"
            >
              <input
                type="checkbox" name="empresas" value={e} className="sr-only"
                checked={marcadas.includes(e)} onChange={() => toggle(e)}
              />
              {EMPRESA_LABEL[e] ?? e}
            </label>
          ))}
        </div>
      </div>
      {marcadas.includes('benassi') && children}
    </div>
  )
}
```

- [ ] **Step 2: Integrar no form de `src/app/painel/usuarios/page.tsx`**

No topo do arquivo, adicionar aos imports:

```tsx
import { EMPRESAS, EMPRESA_LABEL } from '@/lib/kpi/empresas'
import { EmpresasCheckboxes } from './empresas-checkboxes'
```

Logo abaixo de onde `redesDisponiveis`/`mesesDisponiveis`/`mesesDefault` são calculados, adicionar:

```tsx
  const empresasDisponiveis = perfil.papel === 'gerente' ? perfil.empresas : (EMPRESAS as readonly string[])
```

No form de `criarConvite`, o trecho hoje:

```tsx
            <RedesCheckboxes opcoes={redesDisponiveis} />
            <MesesCheckboxes opcoes={mesesDisponiveis} defaultMarcados={mesesDefault} />
```

Trocar por:

```tsx
            <EmpresasCheckboxes opcoes={empresasDisponiveis}>
              <RedesCheckboxes opcoes={redesDisponiveis} />
              <MesesCheckboxes opcoes={mesesDisponiveis} defaultMarcados={mesesDefault} />
            </EmpresasCheckboxes>
```

Nas duas listas (`Convites pendentes` e `Logins ativos`), adicionar a exibição de empresas antes da linha de redes já existente. No bloco de convites, o trecho hoje:

```tsx
                  <div className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                    {(c.redes as string[]).map(r => REDE_LABEL[r] ?? r).join(', ')}
                  </div>
```

Trocar por:

```tsx
                  <div className="mt-1 text-[11px] font-medium text-[var(--color-fg)]">
                    {((c.empresas as string[] | null) ?? []).map(e => EMPRESA_LABEL[e] ?? e).join(', ') || 'sem empresa'}
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                    {(c.redes as string[]).map(r => REDE_LABEL[r] ?? r).join(', ')}
                  </div>
```

No bloco de logins ativos, o trecho hoje:

```tsx
                  <div className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                    {(p.redes as string[]).map(r => REDE_LABEL[r] ?? r).join(', ') || 'sem rede'}
                  </div>
```

Trocar por:

```tsx
                  <div className="mt-1 text-[11px] font-medium text-[var(--color-fg)]">
                    {((p.empresas as string[] | null) ?? []).map(e => EMPRESA_LABEL[e] ?? e).join(', ') || 'sem empresa'}
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                    {(p.redes as string[]).map(r => REDE_LABEL[r] ?? r).join(', ') || 'sem rede'}
                  </div>
```

E, nas duas queries que buscam essas listas, incluir `empresas` no `select`:

```tsx
    svc.from('perfis').select('user_id, email, papel, redes, meses, empresas, criado_por').neq('papel', 'admin').order('email'),
    svc.from('convites').select('token, papel, redes, meses, empresas, criado_por, expira_em').is('usado_em', null).order('criado_em', { ascending: false }),
```

- [ ] **Step 3: Rodar lint e build**

Run: `npm run lint src/app/painel/usuarios/empresas-checkboxes.tsx src/app/painel/usuarios/page.tsx && npm run build`
Expected: sem erros. (Nesta task o form ainda não grava `empresas` de verdade — isso é a Task 5 — então o build deve passar mas o checkbox novo ainda não persiste nada; é esperado até a Task 5 fechar o ciclo.)

- [ ] **Step 4: Commit**

```bash
git add src/app/painel/usuarios/empresas-checkboxes.tsx src/app/painel/usuarios/page.tsx
git commit -m "feat(usuarios): campo de empresas no form de convite, redes/meses so aparecem se benassi marcado"
```

---

### Task 5: `criarConvite`, `resgatar` e resumo do convite gravam/exibem `empresas`

**Files:**
- Modify: `src/app/painel/usuarios/actions.ts`
- Modify: `src/app/convite/[token]/actions.ts`
- Modify: `src/app/convite/[token]/page.tsx`

**Interfaces:**
- Consumes: `empresaValida` (`@/lib/perfil`, Task 1), `EMPRESA_LABEL` (`@/lib/kpi/empresas`, Task 1), `EmpresasCheckboxes` já integrado no form (Task 4).

- [ ] **Step 1: `criarConvite` em `src/app/painel/usuarios/actions.ts`**

Trocar o import:

```ts
import { getPerfil, redeValida, mesValido, type Perfil } from '@/lib/perfil'
```

por:

```ts
import { getPerfil, redeValida, mesValido, empresaValida, type Perfil } from '@/lib/perfil'
```

O corpo de `criarConvite` hoje:

```ts
export async function criarConvite(formData: FormData) {
  const { userId, perfil } = await perfilAtual()

  const papelPedido = String(formData.get('papel') ?? 'visualizador')
  const redesPedidas = formData.getAll('redes').map(String).filter(redeValida)
  const mesesPedidos = formData.getAll('meses').map(String).filter(mesValido)

  // Gerente só cria Visualizador, e só dentro das próprias redes/meses — nunca
  // confia no que vier do form (poderia ser adulterado).
  const papel: 'gerente' | 'visualizador' =
    perfil.papel === 'gerente' ? 'visualizador' : (papelPedido === 'gerente' ? 'gerente' : 'visualizador')
  const redes = perfil.papel === 'gerente' ? redesPedidas.filter(r => perfil.redes.includes(r)) : redesPedidas
  const meses = perfil.papel === 'gerente' ? mesesPedidos.filter(m => perfil.meses.includes(m)) : mesesPedidos

  if (redes.length === 0) {
    redirect('/painel/usuarios?erro=' + encodeURIComponent('Escolha ao menos uma rede (dentro do seu próprio acesso).'))
  }

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('convites')
    .insert({ papel, redes, meses, criado_por: userId })
    .select('token')
    .single()
```

Trocar por:

```ts
export async function criarConvite(formData: FormData) {
  const { userId, perfil } = await perfilAtual()

  const papelPedido = String(formData.get('papel') ?? 'visualizador')
  const redesPedidas = formData.getAll('redes').map(String).filter(redeValida)
  const mesesPedidos = formData.getAll('meses').map(String).filter(mesValido)
  const empresasPedidas = formData.getAll('empresas').map(String).filter(empresaValida)

  // Gerente só cria Visualizador, e só dentro das próprias redes/meses/empresas —
  // nunca confia no que vier do form (poderia ser adulterado).
  const papel: 'gerente' | 'visualizador' =
    perfil.papel === 'gerente' ? 'visualizador' : (papelPedido === 'gerente' ? 'gerente' : 'visualizador')
  const redes = perfil.papel === 'gerente' ? redesPedidas.filter(r => perfil.redes.includes(r)) : redesPedidas
  const meses = perfil.papel === 'gerente' ? mesesPedidos.filter(m => perfil.meses.includes(m)) : mesesPedidos
  const empresas = perfil.papel === 'gerente' ? empresasPedidas.filter(e => perfil.empresas.includes(e)) : empresasPedidas

  if (empresas.length === 0) {
    redirect('/painel/usuarios?erro=' + encodeURIComponent('Escolha ao menos uma empresa.'))
  }
  if (empresas.includes('benassi') && redes.length === 0) {
    redirect('/painel/usuarios?erro=' + encodeURIComponent('Escolha ao menos uma rede da Benassi (dentro do seu próprio acesso).'))
  }

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('convites')
    .insert({ papel, redes, meses, empresas, criado_por: userId })
    .select('token')
    .single()
```

- [ ] **Step 2: `resgatar` em `src/app/convite/[token]/actions.ts`**

O trecho hoje:

```ts
  await svc.from('perfis').insert({
    user_id: created.user.id,
    email,
    papel: convite.papel,
    redes: convite.redes,
    meses: convite.meses,
    criado_por: convite.criado_por,
  })
```

Trocar por:

```ts
  await svc.from('perfis').insert({
    user_id: created.user.id,
    email,
    papel: convite.papel,
    redes: convite.redes,
    meses: convite.meses,
    empresas: convite.empresas,
    criado_por: convite.criado_por,
  })
```

- [ ] **Step 3: Resumo do convite em `src/app/convite/[token]/page.tsx`**

Adicionar ao import: `import { EMPRESA_LABEL } from '@/lib/kpi/empresas'`.

O trecho hoje:

```tsx
          {!bloqueado && (
            <p className="mt-2 max-w-[36ch] text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
              Acesso de <strong>{PAPEL_LABEL[convite.papel as 'gerente' | 'visualizador']}</strong> — só a tela de
              Dashboard, redes: {(convite.redes as string[]).map(r => REDE_LABEL[r] ?? r).join(', ') || '—'}.
            </p>
          )}
```

Trocar por:

```tsx
          {!bloqueado && (
            <p className="mt-2 max-w-[36ch] text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
              Acesso de <strong>{PAPEL_LABEL[convite.papel as 'gerente' | 'visualizador']}</strong> — empresas:{' '}
              {((convite.empresas as string[] | null) ?? []).map(e => EMPRESA_LABEL[e] ?? e).join(', ') || '—'}
              {((convite.empresas as string[] | null) ?? []).includes('benassi') && (
                <> · redes: {(convite.redes as string[]).map(r => REDE_LABEL[r] ?? r).join(', ') || '—'}</>
              )}.
            </p>
          )}
```

- [ ] **Step 4: Rodar lint e build**

Run: `npm run lint && npm run build`
Expected: sem erros.

- [ ] **Step 5: Teste manual do ciclo completo**

Com a migration da Task 1 aplicada no ambiente de dev/local: como admin, ir em `/painel/usuarios`, marcar só `Nutry Max` (sem Benassi) — os blocos de redes/meses não devem aparecer — gerar o convite, resgatar em uma aba anônima, e confirmar (via `select * from perfis where email = ...` no banco de dev) que a linha criada tem `empresas = {nutrimax}` e `redes = {}`.

- [ ] **Step 6: Commit**

```bash
git add src/app/painel/usuarios/actions.ts "src/app/convite/[token]/actions.ts" "src/app/convite/[token]/page.tsx"
git commit -m "feat(convite): grava e exibe empresas no ciclo de convite/resgate"
```

---

### Task 6: Reorganização do nav + threading de `empresas` por layout/shell

**Files:**
- Modify: `src/app/painel/nav.tsx`
- Modify: `src/app/painel/painel-shell.tsx`
- Modify: `src/app/painel/layout.tsx`

**Interfaces:**
- Consumes: `empresaLiberada`/`Perfil.empresas` (Task 1).
- Produces: `PainelNav({ papel, empresas })` (troca de assinatura — antes só `{ papel }`); `PainelShell` ganha prop `empresas: string[]`. Task 7 consome `empresas`/`papel` já disponíveis em `painel-shell.tsx`.

- [ ] **Step 1: Reestruturar `GROUPS` em `src/app/painel/nav.tsx`**

O trecho hoje:

```tsx
const GROUPS: Group[] = [
  {
    label: 'KPI',
    Icon: TableIcon,
    children: [
      { href: '/painel/kpi/simples', label: 'Gerar KPI', Icon: TableIcon },
      { href: '/painel/dashboard/beta', label: 'Dashboard (API Beta)', Icon: ChartBar },
      { href: '/painel/historico', label: 'Histórico', Icon: ClockCounterClockwise },
      { href: '/painel/lojas', label: 'Lojas', Icon: Storefront },
    ],
  },
  {
    label: 'Cozinha',
    Icon: ForkKnife,
    children: [
      { href: '/painel/cozinha', label: 'Gerar Romaneio', Icon: ClipboardText, exact: true },
      { href: '/painel/cozinha/clientes', label: 'Clientes', Icon: UsersThree },
    ],
  },
  {
    label: 'Nutry Max',
    Icon: TableIcon,
    children: [
      { href: '/painel/nutrimax/gerar', label: 'Gerar KPI', Icon: TableIcon },
    ],
  },
]
```

Trocar por:

```tsx
const GRUPO_BENASSI: Group = {
  label: 'Benassi',
  Icon: TableIcon,
  children: [
    { href: '/painel/kpi/simples', label: 'Gerar KPI', Icon: TableIcon },
    { href: '/painel/dashboard/beta', label: 'Dashboard (API Beta)', Icon: ChartBar },
    { href: '/painel/historico', label: 'Histórico', Icon: ClockCounterClockwise },
    { href: '/painel/lojas', label: 'Lojas', Icon: Storefront },
  ],
}

const GRUPO_NUTRIMAX: Group = {
  label: 'Nutry Max',
  Icon: TableIcon,
  children: [
    { href: '/painel/nutrimax/gerar', label: 'Gerar KPI', Icon: TableIcon },
  ],
}

const GRUPO_COZINHA: Group = {
  label: 'Cozinha',
  Icon: ForkKnife,
  children: [
    { href: '/painel/cozinha', label: 'Gerar Romaneio', Icon: ClipboardText, exact: true },
    { href: '/painel/cozinha/clientes', label: 'Clientes', Icon: UsersThree },
  ],
}

// Grupos com tela hoje. Portefrio fica de fora até ter alguma página.
const GRUPOS_EMPRESA: Group[] = [GRUPO_BENASSI, GRUPO_NUTRIMAX]
```

- [ ] **Step 2: Renderização do admin em `PainelNav`**

O trecho hoje (final da função, ramo admin):

```tsx
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
      <LeafLink item={DASHBOARD} active={pathname === '/painel'} />
      <LeafLink item={USUARIOS} active={pathname.startsWith('/painel/usuarios')} />

      <div className="my-2 h-px bg-[var(--color-sidebar-border)]" />

      {GROUPS.map(g => (
        <GroupBlock key={g.label} group={g} pathname={pathname} />
      ))}
    </nav>
  )
}
```

Trocar por:

```tsx
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
      <LeafLink item={DASHBOARD} active={pathname === '/painel'} />
      <LeafLink item={USUARIOS} active={pathname.startsWith('/painel/usuarios')} />

      <div className="my-2 h-px bg-[var(--color-sidebar-border)]" />
      <span className="px-2.5 pb-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-sidebar-fg-muted)]">
        Empresas
      </span>
      {GRUPOS_EMPRESA.map(g => (
        <GroupBlock key={g.label} group={g} pathname={pathname} />
      ))}

      <div className="my-2 h-px bg-[var(--color-sidebar-border)]" />
      <GroupBlock group={GRUPO_COZINHA} pathname={pathname} />
    </nav>
  )
}
```

- [ ] **Step 3: Gate de `VER_KPIS` no ramo não-admin de `PainelNav`**

O trecho hoje:

```tsx
export function PainelNav({ papel }: { papel: Papel }) {
  const pathname = usePathname()

  // Login restrito (gerente/visualizador): Dashboard, Ver KPIs (read-only,
  // já filtrado pelas redes do perfil) e Usuários pro gerente (convidar
  // visualizadores). Sem acesso ao resto (gerar/editar KPI, Cozinha etc).
  if (papel !== 'admin') {
    return (
      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        <LeafLink item={DASHBOARD} active={pathname === '/painel'} />
        <LeafLink item={VER_KPIS} active={pathname.startsWith('/painel/kpi/visualizar')} />
        {papel === 'gerente' && (
          <LeafLink item={USUARIOS} active={pathname.startsWith('/painel/usuarios')} />
        )}
      </nav>
    )
  }
```

Trocar por (assinatura da função ganha `empresas`; `VER_KPIS` só aparece se `benassi` estiver entre as empresas do perfil):

```tsx
export function PainelNav({ papel, empresas }: { papel: Papel; empresas: string[] }) {
  const pathname = usePathname()

  // Login restrito (gerente/visualizador): Dashboard, Ver KPIs (só se a empresa
  // Benassi estiver liberada — read-only, já filtrado pelas redes do perfil) e
  // Usuários pro gerente (convidar visualizadores). Sem acesso ao resto
  // (gerar/editar KPI, Cozinha etc).
  if (papel !== 'admin') {
    return (
      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        <LeafLink item={DASHBOARD} active={pathname === '/painel'} />
        {empresas.includes('benassi') && (
          <LeafLink item={VER_KPIS} active={pathname.startsWith('/painel/kpi/visualizar')} />
        )}
        {papel === 'gerente' && (
          <LeafLink item={USUARIOS} active={pathname.startsWith('/painel/usuarios')} />
        )}
      </nav>
    )
  }
```

- [ ] **Step 4: `src/app/painel/painel-shell.tsx` — nova prop `empresas`**

O trecho hoje:

```tsx
type Props = {
  userEmail: string | null | undefined
  papel: 'admin' | 'gerente' | 'visualizador'
  sairAction: () => void | Promise<void>
  children: React.ReactNode
}

export function PainelShell({ userEmail, papel, sairAction, children }: Props) {
```

Trocar por:

```tsx
type Props = {
  userEmail: string | null | undefined
  papel: 'admin' | 'gerente' | 'visualizador'
  empresas: string[]
  sairAction: () => void | Promise<void>
  children: React.ReactNode
}

export function PainelShell({ userEmail, papel, empresas, sairAction, children }: Props) {
```

As duas ocorrências de `<PainelNav papel={papel} />` (uma no `<aside>` desktop, outra dentro do drawer mobile) trocam para:

```tsx
<PainelNav papel={papel} empresas={empresas} />
```

- [ ] **Step 5: `src/app/painel/layout.tsx` — obter e repassar `empresas`**

Arquivo atual completo:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveUserDesktopAware } from '@/lib/supabase/desktop-auth'
import { getPerfil } from '@/lib/perfil'
import { sair } from './actions'
import { PainelShell } from './painel-shell'

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  // No site: getUser() normal. No app desktop offline: cai pra sessão local.
  const user = await resolveUserDesktopAware(supabase)

  if (!user) redirect('/login')

  // App desktop não tem login restrito (offline, sem convite) — trata como admin.
  const perfil = process.env.DESKTOP_APP === '1' ? { papel: 'admin' as const } : await getPerfil(user.id)

  return (
    <PainelShell userEmail={user.email} papel={perfil.papel} sairAction={sair}>
      {children}
    </PainelShell>
  )
}
```

Trocar por:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveUserDesktopAware } from '@/lib/supabase/desktop-auth'
import { getPerfil } from '@/lib/perfil'
import { sair } from './actions'
import { PainelShell } from './painel-shell'

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  // No site: getUser() normal. No app desktop offline: cai pra sessão local.
  const user = await resolveUserDesktopAware(supabase)

  if (!user) redirect('/login')

  // App desktop não tem login restrito (offline, sem convite) — trata como admin.
  const perfil = process.env.DESKTOP_APP === '1'
    ? { papel: 'admin' as const, redes: [], meses: [], empresas: [] }
    : await getPerfil(user.id)

  return (
    <PainelShell userEmail={user.email} papel={perfil.papel} empresas={perfil.empresas} sairAction={sair}>
      {children}
    </PainelShell>
  )
}
```

- [ ] **Step 6: Rodar lint e build**

Run: `npm run lint && npm run build`
Expected: sem erros de tipo (a assinatura de `PainelNav` mudou — se algum outro call site além dos dois em `painel-shell.tsx` existir, o build acusa).

- [ ] **Step 7: Teste manual visual**

Com `npm run dev`: logar como admin e conferir que o nav mostra "Empresas" com Benassi + Nutry Max agrupados, Cozinha continua abaixo, tudo navegável igual antes (mudou só o rótulo do grupo e o agrupamento visual, nenhum `href` mudou). Logar como um visualizador Benassi (`empresas: ['benassi']` do backfill) e conferir que o nav dele continua idêntico a antes (Dashboard + Ver KPIs).

- [ ] **Step 8: Commit**

```bash
git add src/app/painel/nav.tsx src/app/painel/painel-shell.tsx src/app/painel/layout.tsx
git commit -m "refactor(nav): agrupa Benassi/Nutry Max sob \"Empresas\", gate real por empresaLiberada"
```

---

### Task 7: Seletor de empresa no topo do painel

**Files:**
- Create: `src/app/painel/empresa-switcher.tsx`
- Modify: `src/app/painel/painel-shell.tsx`

**Interfaces:**
- Consumes: `EMPRESA_LABEL` (`@/lib/kpi/empresas`, Task 1); `papel`/`empresas` já disponíveis em `painel-shell.tsx` desde a Task 6.

- [ ] **Step 1: Criar `src/app/painel/empresa-switcher.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { EMPRESA_LABEL } from '@/lib/kpi/empresas'

// Só as empresas que já têm alguma tela hoje. Portefrio entra aqui quando
// tiver a própria rota raiz.
const EMPRESA_HOME: Record<string, string> = {
  benassi: '/painel/kpi/simples',
  nutrimax: '/painel/nutrimax/gerar',
}

const EMPRESAS_COM_TELA = Object.keys(EMPRESA_HOME)

export function EmpresaSwitcher({
  papel,
  empresas,
}: {
  papel: 'admin' | 'gerente' | 'visualizador'
  empresas: string[]
}) {
  const pathname = usePathname()
  const visiveis = EMPRESAS_COM_TELA.filter(e => papel === 'admin' || empresas.includes(e))

  // 0 ou 1 opção: nada pra trocar, não mostra seletor nenhum.
  if (visiveis.length < 2) return null

  const atual = visiveis.find(e => pathname.startsWith(EMPRESA_HOME[e])) ?? visiveis[0]

  return (
    <div className="hidden items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-1 sm:flex">
      {visiveis.map(e => (
        <Link
          key={e}
          href={EMPRESA_HOME[e]}
          className={
            'rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ' +
            (e === atual
              ? 'bg-[var(--color-navy-700)] text-white'
              : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]')
          }
        >
          {EMPRESA_LABEL[e] ?? e}
        </Link>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Integrar no header de `src/app/painel/painel-shell.tsx`**

Adicionar ao import: `import { EmpresaSwitcher } from './empresa-switcher'`.

O trecho do header hoje:

```tsx
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-bg)]/70 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Abrir menu"
              aria-expanded={open}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg-muted)] transition active:scale-[0.96] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)] md:hidden"
            >
              <List size={18} weight="bold" />
            </button>
            <HeaderTitle />
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
```

Trocar por:

```tsx
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-bg)]/70 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Abrir menu"
              aria-expanded={open}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg-muted)] transition active:scale-[0.96] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)] md:hidden"
            >
              <List size={18} weight="bold" />
            </button>
            <HeaderTitle />
            <EmpresaSwitcher papel={papel} empresas={empresas} />
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
```

- [ ] **Step 3: Rodar lint e build**

Run: `npm run lint && npm run build`
Expected: sem erros.

- [ ] **Step 4: Teste manual visual**

Com `npm run dev`, logado como admin: o seletor deve aparecer no header (Benassi | Nutry Max), clicar em cada um navega pra raiz certa e destaca a opção ativa. Logado como um visualizador com só `empresas: ['benassi']`: o seletor não deve aparecer (só 1 opção visível).

- [ ] **Step 5: Commit**

```bash
git add src/app/painel/empresa-switcher.tsx src/app/painel/painel-shell.tsx
git commit -m "feat(painel): seletor de empresa no header (Benassi / Nutry Max)"
```

---

## Espelhamento nos dois repositórios

Depois de cada task acima (Tasks 1 a 7), replicar exatamente os mesmos arquivos em `/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP`, confirmar com `diff -rq` E `git status --short` nos dois repos, e fazer commit + push nos dois com a mesma mensagem (mesmo padrão já seguido no resto desta sessão).

## Validação manual end-to-end (gate humano, fora das tasks numeradas)

Só depois de todas as 7 tasks revisadas e com os testes/lint/build passando:

1. **Aplicar a migration** (`20260824000000_perfis_convites_empresas.sql`) — perguntar ao usuário antes, mesmo em ambiente de dev/staging, seguindo a mesma disciplina do resto do projeto.
2. Criar um convite de teste com `empresas = ['nutrimax']` (sem `benassi`), resgatar numa conta de teste, e confirmar:
   - Esse login **não** acessa `/painel/kpi/simples`, `/painel/kpi/visualizar`, `/painel/historico`, `/painel/lojas`, `/painel/dashboard/beta` (redirect pra `/painel` em todos).
   - **Atualizado pela revisão final (ruling, ver ledger):** geração de KPI é admin-only em todo o sistema (mesma regra do `/api/kpi/simples` da Benassi) — Nutry Max não é exceção. Então esse login com `papel: visualizador` ou `gerente` **também não** acessa `/painel/nutrimax/gerar` (redirect pra `/painel`) nem consegue chamar `POST /api/kpi/nutrimax/gerar` (403). Só um **admin** de fato gera KPI da Nutry Max hoje — não-admin não tem nenhuma tela de Nutry Max ainda (a tela de leitura/histórico da Nutry Max é trabalho futuro, fora deste plano). Repita este mesmo teste com um convite `papel: admin` (se fizer sentido no seu fluxo de teste) pra confirmar que admin gera normalmente.
   - Nota conhecida: como esse login não alcança nenhuma tela hoje, `/painel` pode mostrar um estado de erro (a chamada a `/api/dashboard` retorna 403) em vez de um "sem acesso" amigável — comportamento aceito por ora, não é regressão.
3. Criar um segundo convite com `empresas = ['benassi']` + uma rede específica (ex. `PREZUNIC`), resgatar, e confirmar que o comportamento é **idêntico ao de hoje** (zero regressão): Dashboard mostra só a rede escolhida, sem acesso a `kpi/simples`/`lojas`/`dashboard/beta` (isso já era assim antes, agora só ficou realmente garantido no backend).
4. Confirmar como admin que nada mudou no que ele enxerga — só a reorganização visual do nav e o seletor de empresa no topo.
5. **Não aplicar a migration em produção nem fazer deploy** até o usuário validar esse checklist e autorizar explicitamente.
