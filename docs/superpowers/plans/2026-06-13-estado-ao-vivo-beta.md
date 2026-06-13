# Estado AO VIVO no beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps usam checkbox.

**Goal:** No beta, classificar cada linha como ENTREGUE / EM_ROTA / NA_BASE / SEM_SINAL (andamento ao vivo) em vez de "não foi" prematuro, pra gerar cedo sem mar de vermelho.

**Architecture:** Função pura `situacaoViva` (núcleo). KPI beta (rota+tela) e Dashboard API beta (fonte+rota+tela) computam e exibem o estado. Normal intocado.

**Tech Stack:** TypeScript, Next.js, vitest. Reusa helpers já existentes (`placaRastreada`, `placaSaiuDaBase`, `saiu`).

---

## Task 1: situacaoViva (puro, TDD)

**Files:** Create `src/lib/kpi/situacao-viva.ts`, `src/lib/kpi/situacao-viva.test.ts`

- [ ] **Step 1: teste que falha**
```ts
// src/lib/kpi/situacao-viva.test.ts
import { describe, it, expect } from 'vitest'
import { situacaoViva } from './situacao-viva'

describe('situacaoViva', () => {
  it('entregue vence tudo', () => {
    expect(situacaoViva({ entregue: true, naApi: false, saiuDaBase: false })).toBe('ENTREGUE')
  })
  it('não entregue + fora da API → SEM_SINAL', () => {
    expect(situacaoViva({ entregue: false, naApi: false, saiuDaBase: false })).toBe('SEM_SINAL')
  })
  it('não entregue + na API + saiu da base → EM_ROTA', () => {
    expect(situacaoViva({ entregue: false, naApi: true, saiuDaBase: true })).toBe('EM_ROTA')
  })
  it('não entregue + na API + não saiu → NA_BASE', () => {
    expect(situacaoViva({ entregue: false, naApi: true, saiuDaBase: false })).toBe('NA_BASE')
  })
})
```

- [ ] **Step 2: rodar e falhar**
Run: `npx vitest run src/lib/kpi/situacao-viva.test.ts` → FAIL.

- [ ] **Step 3: implementar**
```ts
// src/lib/kpi/situacao-viva.ts
export type SituacaoViva = 'ENTREGUE' | 'EM_ROTA' | 'NA_BASE' | 'SEM_SINAL'

/** Andamento ao vivo de uma linha no beta. Honesto pra geração cedo: distingue
 *  "ainda não saiu" e "em rota" de uma falha. Não crava "não foi" (evita falso). */
export function situacaoViva(a: { entregue: boolean; naApi: boolean; saiuDaBase: boolean }): SituacaoViva {
  if (a.entregue) return 'ENTREGUE'
  if (!a.naApi) return 'SEM_SINAL'
  return a.saiuDaBase ? 'EM_ROTA' : 'NA_BASE'
}

export const SITUACAO_VIVA_LABEL: Record<SituacaoViva, string> = {
  ENTREGUE: 'Entregue', EM_ROTA: 'Em rota', NA_BASE: 'Na base', SEM_SINAL: 'Sem sinal',
}
```

- [ ] **Step 4: rodar e passar** → `npx vitest run src/lib/kpi/situacao-viva.test.ts` PASS.
- [ ] **Step 5: commit**
```bash
git add src/lib/kpi/situacao-viva.ts src/lib/kpi/situacao-viva.test.ts
git commit -m "feat(beta): situacaoViva (entregue/em rota/na base/sem sinal) — puro, TDD"
```

---

## Task 2: KPI beta — computar e exibir o estado ao vivo

**Files:** Modify `src/app/api/kpi/beta/route.ts`, `src/app/painel/kpi/beta/page.tsx`

- [ ] **Step 1: rota — import + tipo no PreviewLinha**
Em `src/app/api/kpi/beta/route.ts`, adicionar import:
```ts
import { situacaoViva, type SituacaoViva } from '@/lib/kpi/situacao-viva'
```
No `type PreviewLinha = { ... }` adicionar:
```ts
  situacaoViva?: SituacaoViva
```

- [ ] **Step 2: rota — calcular no preview**
No objeto retornado do `preview` (onde já tem `viaApi: confirmacoesApi.get(...)`), adicionar:
```ts
          situacaoViva: situacaoViva({
            entrego: undefined as never, // (placeholder removido na linha abaixo)
          } as never),
```
NÃO usar o acima — usar exatamente:
```ts
          situacaoViva: situacaoViva({
            entregue: statusInfo.status === 'ENTREGUE' || statusInfo.status === 'ENTREGUE_GEO',
            naApi: placaRastreada(rota.placa_norm),
            saiuDaBase: placaSaiuDaBase(rota.placa_norm),
          }),
```

- [ ] **Step 3: verificar tipos**
Run: `npx tsc --noEmit 2>&1 | grep "^src/app/api/kpi/beta"` → vazio.

- [ ] **Step 4: tela — tipo + badge**
Em `src/app/painel/kpi/beta/page.tsx`, no `type PreviewLinha` adicionar `situacaoViva?: 'ENTREGUE'|'EM_ROTA'|'NA_BASE'|'SEM_SINAL'`.
No bloco do status (depois do `<StatusBadge .../>`), quando NÃO entregue, mostrar o andamento em vez de só o motivo vermelho. Substituir a parte "não confirmado" do IIFE pra priorizar a situação viva:
```tsx
            // Andamento ao vivo (beta): em rota / na base / sem sinal em vez de vermelho.
            const sv = linha.situacaoViva
            if (sv && sv !== 'ENTREGUE') {
              const cfg = sv === 'EM_ROTA' ? { txt: 'Em rota', cls: 'border-[var(--color-info)] text-[var(--color-info)]' }
                : sv === 'NA_BASE' ? { txt: 'Na base', cls: 'border-[var(--color-border-strong)] text-[var(--color-fg-muted)]' }
                : { txt: 'Sem sinal', cls: 'border-[var(--color-border-strong)] text-[var(--color-fg-subtle)]' }
              return (
                <span className={cn('inline-flex w-fit items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium leading-tight', cfg.cls)}
                  title="Andamento ao vivo pela API (ainda não entregue)">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'currentColor' }} />
                  {cfg.txt}
                </span>
              )
            }
```
> Inserir esse `if (sv && sv !== 'ENTREGUE')` ANTES do bloco `const tier = tierEfetivo(...)` dentro do mesmo IIFE de `(() => { ... })()`, e DEPOIS do ramo `if (entregue && !linha.revisar) { ... }`. Assim: entregue→selo de confiança; não-entregue→andamento ao vivo; e o `tier`/motivo vira fallback se `sv` ausente.

- [ ] **Step 5: tipos + lint**
Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head` → vazio.
Run: `npx eslint src/app/painel/kpi/beta/page.tsx src/app/api/kpi/beta/route.ts 2>&1 | grep -E "error" | grep -v warning` → vazio.

- [ ] **Step 6: commit**
```bash
git add src/app/api/kpi/beta/route.ts src/app/painel/kpi/beta/page.tsx
git commit -m "feat(kpi-beta): estado ao vivo (em rota/na base) em vez de vermelho cedo"
```

---

## Task 3: Dashboard API beta — contagem de andamento

**Files:** Modify `src/lib/kpi/dashboard-api-fonte.ts`, `src/app/api/dashboard/beta/route.ts`, `src/app/painel/dashboard/beta/page.tsx`

- [ ] **Step 1: fonte — anexar situacaoViva às linhas salvas**
Em `src/lib/kpi/dashboard-api-fonte.ts`:
Adicionar import: `import { situacaoViva, type SituacaoViva } from './situacao-viva'`
Exportar tipo do registro salvo:
```ts
export type EntradaApiDia = EntradaManual & { situacaoViva: SituacaoViva }
```
No `gerarDiaApi`, onde monta cada linha (`out.push(rotaParaEntrada(...))`), trocar por:
```ts
    const placaUni = rota.placa_unitrac ?? rota.placa_norm
    const ent = rotaParaEntrada(rota, esc, st.status, data)
    const sv = situacaoViva({
      entregue: st.status === 'ENTREGUE' || st.status === 'ENTREGUE_GEO',
      naApi: !!placaUni && porPlaca.has(placaUni),
      saiuDaBase: saiu(placaUni),
    })
    out.push({ ...ent, situacaoViva: sv })
```
Trocar o retorno de `gerarDiaApi` pra `Promise<EntradaApiDia[]>` e `const out: EntradaApiDia[] = []`.
`salvarDiaApi`/`carregarEntradasApi` continuam (o campo extra vai junto no JSON; `calcularMetricas` ignora).

- [ ] **Step 2: GET agrega andamento**
Em `src/app/api/dashboard/beta/route.ts` (GET), depois de `const filt = filtrar(linhas, { redes })`, adicionar:
```ts
  const andamento = { ENTREGUE: 0, EM_ROTA: 0, NA_BASE: 0, SEM_SINAL: 0 }
  for (const l of filt as Array<{ situacaoViva?: keyof typeof andamento }>) {
    if (l.situacaoViva && l.situacaoViva in andamento) andamento[l.situacaoViva]++
  }
```
E incluir `andamento` no `NextResponse.json({ ... , andamento })`.
> `carregarEntradasApi` é tipado como `EntradaManual[]`; o campo `situacaoViva` existe no JSON salvo mesmo não estando no tipo — o cast acima lê em runtime. Sem erro de tipo.

- [ ] **Step 3: tela mostra o andamento**
Em `src/app/painel/dashboard/beta/page.tsx`, o `DashboardClient` busca `/api/dashboard/beta` internamente; pra mostrar o andamento, a página beta faz um fetch leve próprio ao trocar nonce/data. Adicionar estado e busca:
```tsx
  const [andamento, setAndamento] = useState<{ENTREGUE:number;EM_ROTA:number;NA_BASE:number;SEM_SINAL:number} | null>(null)
  useEffect(() => {
    fetch(`/api/dashboard/beta?periodo=dia&data=${data}`).then(r => r.ok ? r.json() : null)
      .then(j => setAndamento(j?.andamento ?? null)).catch(() => setAndamento(null))
  }, [data, nonce])
```
E renderizar abaixo do botão "Puxar dia":
```tsx
      {andamento && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded border border-[var(--color-success)] px-2 py-1 text-[var(--color-success-soft-fg)] bg-[var(--color-success-soft)]">Entregue {andamento.ENTREGUE}</span>
          <span className="rounded border border-[var(--color-info)] px-2 py-1 text-[var(--color-info)]">Em rota {andamento.EM_ROTA}</span>
          <span className="rounded border border-[var(--color-border-strong)] px-2 py-1 text-[var(--color-fg-muted)]">Na base {andamento.NA_BASE}</span>
          {andamento.SEM_SINAL > 0 && <span className="rounded border border-[var(--color-border-strong)] px-2 py-1 text-[var(--color-fg-subtle)]">Sem sinal {andamento.SEM_SINAL}</span>}
        </div>
      )}
```
> `useEffect` já é importável (a página é client). Se `useEffect` não estiver no import do React, adicionar.

- [ ] **Step 4: tipos + lint**
Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head` → vazio.
Run: `npx eslint src/lib/kpi/dashboard-api-fonte.ts src/app/api/dashboard/beta/route.ts src/app/painel/dashboard/beta/page.tsx 2>&1 | grep -E "error" | grep -v warning` → vazio.

- [ ] **Step 5: commit**
```bash
git add src/lib/kpi/dashboard-api-fonte.ts src/app/api/dashboard/beta/route.ts src/app/painel/dashboard/beta/page.tsx
git commit -m "feat(dashboard-beta): contagem de andamento ao vivo (entregue/em rota/na base)"
```

---

## Task 4: Validação

- [ ] **Step 1: suíte**
Run: `npx vitest run` → tudo verde.
- [ ] **Step 2: e2e dashboard (reusa script existente)**
Run: `NODE_OPTIONS="--max-old-space-size=8192" npx tsx scripts/dev/e2e-dash-api.mts 2026-06-13`
Expected: gera linhas do dia 13; conferir que existem EM_ROTA/NA_BASE (não só entregue), provando o estado ao vivo.
- [ ] **Step 3: isolamento + finish**
Run: `git diff --name-only main...HEAD | grep -E "api/kpi/simples|dashboard-metricas|dashboard-query|api/dashboard/route|kpi_manual"` → vazio (normal intocado).
Merge na main + push (skill finishing-a-development-branch).
