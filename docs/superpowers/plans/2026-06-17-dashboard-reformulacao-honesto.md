# Dashboard normal honesto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acabar com a falsa informação do dashboard normal: parser que não descarta linha e reconhece status ricos (6 categorias), taxa de entrega definitiva, sem-dado fora do denominador, e selo provisório/final por dia.

**Architecture:** Mantém o upload do XLSX. `StatusManual` expande de 3 para 7 valores; `parse-kpi-manual` classifica por regex sem `continue`; `dashboard-metricas` ganha as 6 categorias + 2 taxas; a UI mostra tudo com cores honestas + provisório/final. O re-upload do dia já substitui o anterior (idempotente por data+rede), então só falta derivar o selo provisório.

**Tech Stack:** TypeScript, Vitest, exceljs, Next.js (custom), Supabase.

## Global Constraints

- NUNCA descartar linha: o que não casar legenda vira `indefinido` VISÍVEL. Dado faltante nunca somado como zero.
- Taxa de entrega definitiva = `entregue / (entregue + nao_foi)`. em_rota, mudou_de_rota, desatualizado, sem_rastreador, indefinido FORA do denominador.
- Convenção de tempo BRT mascarado como UTC (não afeta este plano — só horas HH:MM string).
- Sem travessão (—) em rótulo de cliente.
- 6 categorias: entregue, em_rota, nao_foi, mudou_de_rota, desatualizado, sem_rastreador (+ indefinido técnico).

---

### Task 1: `StatusManual` expandido + parser sem descarte

**Files:**
- Modify: `src/lib/kpi/parse-kpi-manual.ts`
- Test: `src/lib/kpi/parse-kpi-manual.test.ts` (criar se não existir)

**Interfaces:**
- Produces: `type StatusManual = 'entregue' | 'em_rota' | 'nao_foi' | 'mudou_de_rota' | 'desatualizado' | 'sem_rastreador' | 'indefinido'`; `classificarStatusManual(txt: string, temChegada: boolean): StatusManual` (puro, exportado).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { classificarStatusManual } from './parse-kpi-manual'

describe('classificarStatusManual', () => {
  it('reconhece todas as legendas ricas, sem descartar', () => {
    expect(classificarStatusManual('DESATUALIZADO', false)).toBe('desatualizado')
    expect(classificarStatusManual('SEM RASTREADOR', false)).toBe('sem_rastreador')
    expect(classificarStatusManual('MUDOU DE ROTA - CONFERIR', false)).toBe('mudou_de_rota')
    expect(classificarStatusManual('EM ROTA', false)).toBe('em_rota')
    expect(classificarStatusManual('AGUARDANDO BASE', false)).toBe('em_rota')
    expect(classificarStatusManual('NÃO SAIU DA BASE', false)).toBe('nao_foi')
    expect(classificarStatusManual('NÃO FOI AO CLIENTE', false)).toBe('nao_foi')
    expect(classificarStatusManual('', true)).toBe('entregue')        // tem chegada
    expect(classificarStatusManual('', false)).toBe('indefinido')      // nunca descarta
  })
  it('desatualizado tem prioridade sobre rastreador; em rota não vira não foi', () => {
    expect(classificarStatusManual('DESATUALIZADO SEM RASTREADOR', false)).toBe('desatualizado')
    expect(classificarStatusManual('EM ROTA', false)).not.toBe('nao_foi')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/kpi/parse-kpi-manual.test.ts`
Expected: FAIL ("classificarStatusManual is not a function").

- [ ] **Step 3: Implement**

Em `parse-kpi-manual.ts`, trocar o type e extrair a classificação:

```ts
export type StatusManual = 'entregue' | 'em_rota' | 'nao_foi' | 'mudou_de_rota' | 'desatualizado' | 'sem_rastreador' | 'indefinido'

/** Classifica a legenda do XLSX em status rico. Ordem por especificidade. NUNCA
 *  devolve "descartar": sem legenda + sem chegada = 'indefinido' (visível). */
export function classificarStatusManual(txt: string, temChegada: boolean): StatusManual {
  const t = txt.toUpperCase()
  if (/DESATUALIZ/.test(t)) return 'desatualizado'
  if (/SEM\s*RASTREAD/.test(t)) return 'sem_rastreador'
  if (/MUDOU\s*DE\s*ROTA/.test(t)) return 'mudou_de_rota'
  if (/EM\s*ROTA|AGUARDANDO\s*BASE/.test(t)) return 'em_rota'
  if (/N[ÃA]O\s*SAIU/.test(t)) return 'nao_foi'
  if (/N[ÃA]O\s*FOI/.test(t)) return 'nao_foi'
  if (temChegada) return 'entregue'
  return 'indefinido'
}
```

Trocar o bloco antigo (linhas ~95-99: `if /NÃO FOI/ ... else continue`) por:

```ts
    const status = classificarStatusManual(txt, !!chd)
    out.push({ rede_id, data, loja, placa, motorista, status, saida_cd, chd, sai, volta_base })
```

(Remove o `else continue` — nenhuma linha é descartada.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/kpi/parse-kpi-manual.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi/parse-kpi-manual.ts src/lib/kpi/parse-kpi-manual.test.ts
git commit -m "feat(dashboard): StatusManual rico + parser sem descarte de linha"
```

---

### Task 2: Alinhar `statusRotaParaDashboard` (beta) ao StatusManual rico

**Files:**
- Modify: `src/lib/kpi/dashboard-api-fonte.ts:19-22`
- Test: `src/lib/kpi/dashboard-api-fonte.test.ts`

**Interfaces:**
- Consumes: `StatusManual` (Task 1), `StatusRota` de `status-rota`.
- Produces: `statusRotaParaDashboard(status: StatusRota): StatusManual` mapeando os 8 status.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { statusRotaParaDashboard } from './dashboard-api-fonte'

describe('statusRotaParaDashboard', () => {
  it('mapeia os status ricos pras categorias do dashboard', () => {
    expect(statusRotaParaDashboard('ENTREGUE')).toBe('entregue')
    expect(statusRotaParaDashboard('ENTREGUE_GEO')).toBe('entregue')
    expect(statusRotaParaDashboard('MUDOU_DE_ROTA')).toBe('mudou_de_rota')
    expect(statusRotaParaDashboard('DESATUALIZADO')).toBe('desatualizado')
    expect(statusRotaParaDashboard('SEM_RASTREADOR')).toBe('sem_rastreador')
    expect(statusRotaParaDashboard('NAO_SAIU_DA_BASE')).toBe('nao_foi')
    expect(statusRotaParaDashboard('NAO_FOI_AO_CLIENTE')).toBe('nao_foi')
    expect(statusRotaParaDashboard('FORA_DE_BASE')).toBe('em_rota')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/kpi/dashboard-api-fonte.test.ts -t statusRotaParaDashboard`
Expected: FAIL (MUDOU_DE_ROTA vira 'nao_foi' hoje).

- [ ] **Step 3: Implement**

Substituir `statusRotaParaDashboard` (dashboard-api-fonte.ts:19-23):

```ts
export function statusRotaParaDashboard(status: StatusRota): StatusManual {
  switch (status) {
    case 'ENTREGUE': case 'ENTREGUE_GEO': return 'entregue'
    case 'MUDOU_DE_ROTA': return 'mudou_de_rota'
    case 'DESATUALIZADO': return 'desatualizado'
    case 'SEM_RASTREADOR': return 'sem_rastreador'
    case 'FORA_DE_BASE': return 'em_rota'
    case 'NAO_SAIU_DA_BASE': case 'NAO_FOI_AO_CLIENTE': return 'nao_foi'
    default: return 'nao_foi'
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/kpi/dashboard-api-fonte.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi/dashboard-api-fonte.ts src/lib/kpi/dashboard-api-fonte.test.ts
git commit -m "feat(dashboard): beta mapeia status ricos pras 6 categorias"
```

---

### Task 3: Métricas — 6 categorias + taxa definitiva + provisório

**Files:**
- Modify: `src/lib/kpi/dashboard-metricas.ts`
- Test: `src/lib/kpi/dashboard-metricas.test.ts`

**Interfaces:**
- Consumes: `StatusManual` rico, `EntradaManual`.
- Produces: `Metricas` ganha `em_rota`, `mudou_de_rota`, `desatualizado`, `indefinido` (number), `taxaEntregaDefinitiva` (number), `andamentoPct` (number). Nova função `resumoDia(ents: EntradaManual[]): { provisorio: boolean }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { calcularMetricas, resumoDia } from './dashboard-metricas'
import type { EntradaManual } from './parse-kpi-manual'

const e = (status: EntradaManual['status']): EntradaManual => ({
  rede_id: 'ASSAI', data: '2026-06-16', loja: 'L', placa: null, motorista: null,
  status, saida_cd: null, chd: null, sai: null, volta_base: null,
})

describe('métricas honestas', () => {
  it('taxa definitiva exclui em rota/sem dado do denominador', () => {
    const m = calcularMetricas([e('entregue'), e('entregue'), e('nao_foi'), e('em_rota'), e('sem_rastreador'), e('desatualizado')])
    // 2 entregue, 1 nao_foi → 2/3 = 67%; em rota/sem dado FORA
    expect(m.taxaEntregaDefinitiva).toBe(67)
    expect(m.em_rota).toBe(1)
    expect(m.desatualizado).toBe(1)
    expect(m.sem_rastreador).toBe(1)
    expect(m.total).toBe(6)              // nada descartado
  })
  it('resumoDia: tem em rota → provisório', () => {
    expect(resumoDia([e('entregue'), e('em_rota')]).provisorio).toBe(true)
    expect(resumoDia([e('entregue'), e('nao_foi')]).provisorio).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/kpi/dashboard-metricas.test.ts -t honestas`
Expected: FAIL (`taxaEntregaDefinitiva`/`resumoDia` não existem).

- [ ] **Step 3: Implement**

Em `dashboard-metricas.ts`:

1. No `interface Metricas`, adicionar os campos:
```ts
  em_rota: number
  mudou_de_rota: number
  desatualizado: number
  indefinido: number
  taxaEntregaDefinitiva: number
  andamentoPct: number
```

2. Em `calcularMetricas`, após `const sem_rastreador = cont('sem_rastreador')`:
```ts
  const em_rota = cont('em_rota')
  const mudou_de_rota = cont('mudou_de_rota')
  const desatualizado = cont('desatualizado')
  const indefinido = cont('indefinido')
  const denomDefinitivo = entregue + nao_foi
  const taxaEntregaDefinitiva = denomDefinitivo ? Math.round(100 * entregue / denomDefinitivo) : 0
  const andamentoPct = total ? Math.round(100 * em_rota / total) : 0
```

3. No `return`, trocar `pctEntregue` pra usar a definitiva e incluir os novos campos:
```ts
    pctEntregue: taxaEntregaDefinitiva,   // honesto: entregue/(entregue+nao_foi)
    taxaEntregaDefinitiva, andamentoPct,
    em_rota, mudou_de_rota, desatualizado, indefinido,
```
(Manter `com_rastreador: entregue + nao_foi` — já é o denominador definitivo.)

4. Adicionar a função pura no fim do arquivo:
```ts
/** Resumo do dia pro selo provisório/final: tem alguma entrega ainda "em rota" →
 *  provisório (o dia não fechou). Sem em rota → final. */
export function resumoDia(ents: EntradaManual[]): { provisorio: boolean } {
  return { provisorio: ents.some(e => e.status === 'em_rota') }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/kpi/dashboard-metricas.test.ts`
Expected: PASS (incluindo os testes antigos do arquivo).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi/dashboard-metricas.ts src/lib/kpi/dashboard-metricas.test.ts
git commit -m "feat(dashboard): 6 categorias + taxa de entrega definitiva + resumoDia"
```

---

### Task 4: UI — 6 categorias, cores honestas, taxa definitiva, selo provisório/final

**Files:**
- Modify: `src/app/painel/dashboard/dashboard-client.tsx`

**Interfaces:**
- Consumes: `Metricas` com os novos campos (Task 3).

- [ ] **Step 1: Mapa STATUS com 6 categorias + cores**

Substituir o objeto `STATUS` (dashboard-client.tsx:27-29) por:
```ts
const STATUS: Record<string, { label: string; cor: string }> = {
  entregue:       { label: 'Entregue',      cor: 'var(--color-success)' },
  em_rota:        { label: 'Em rota',       cor: 'var(--color-info)' },
  nao_foi:        { label: 'Não foi',       cor: 'var(--color-danger)' },
  mudou_de_rota:  { label: 'Mudou de rota', cor: 'var(--color-warning)' },
  desatualizado:  { label: 'Desatualizado', cor: 'var(--color-warning)' },
  sem_rastreador: { label: 'Sem rastreador',cor: 'var(--color-fg-subtle)' },
  indefinido:     { label: 'Indefinido',    cor: 'var(--color-fg-subtle)' },
}
```
(Inclui `indefinido` pra nunca renderizar vazio; aparece só se houver linha sem legenda reconhecida.)

- [ ] **Step 2: Listas de categorias**

Trocar as duas ocorrências de `(['entregue', 'nao_foi', 'sem_rastreador'] as const)` por
`(['entregue', 'em_rota', 'nao_foi', 'mudou_de_rota', 'desatualizado', 'sem_rastreador'] as const)`.
No array de barras (linhas ~419-421), incluir as 6 categorias com `value: m[k]` e `color: STATUS[k].cor`.

- [ ] **Step 3: Hero da taxa**

A taxa principal já usa `m.pctEntregue` (agora = definitiva). Trocar a nota (linha ~377) para:
`{m.entregue} de {m.entregue + m.nao_foi} definitivas · meta ≥ 95%` e adicionar abaixo um sub-rótulo:
`{m.em_rota} em rota · {m.desatualizado} desatualizado · {m.sem_rastreador} sem rastreador` (cinza, fora da taxa).

- [ ] **Step 4: Selo provisório/final + as-of**

Onde o cabeçalho do período é renderizado, adicionar um selo: se `m.em_rota > 0` mostrar
âmbar "Provisório (tem entregas em rota)", senão verde "Final". (O timestamp "atualizado às"
vem de `uploaded_at` já disponível na query do histórico; se não estiver no escopo da métrica,
exibir só o selo provisório/final nesta task.)

- [ ] **Step 5: Verificar visual (ver rodando)**

Run: `npm run build` (esperado exit 0).
Abrir `/painel/dashboard`, subir um XLSX do dia com em rota/desatualizado, conferir: 6 categorias aparecem, taxa = entregue/(entregue+não foi), nada some, selo provisório quando há em rota.

- [ ] **Step 6: Commit**

```bash
git add src/app/painel/dashboard/dashboard-client.tsx
git commit -m "feat(dashboard): UI com 6 categorias, taxa definitiva e selo provisório/final"
```

---

### Task 5: Verificação E2E + suíte

**Files:**
- Create: `scripts/dev/verif-dashboard.mts`

- [ ] **Step 1: Script de verificação**

Parsear um XLSX gerado pelo KPI (com em rota/desatualizado) via `parseKpiManual`, rodar
`calcularMetricas`, e imprimir: total (= nº linhas, nada descartado), as 6 categorias,
taxaEntregaDefinitiva, e `resumoDia().provisorio`. Asserir que `total` == linhas do XLSX.

- [ ] **Step 2: Rodar**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsx scripts/dev/verif-dashboard.mts <xlsx>`
Expected: total == linhas; categorias somam o total; taxa coerente.

- [ ] **Step 3: Suíte + build + tsc**

Run: `npx tsc --noEmit -p tsconfig.json` (exit 0, ignorar `.next`).
Run: `npx vitest run` (100% verde).
Run: `npm run build` (exit 0).

- [ ] **Step 4: Commit**

```bash
git add scripts/dev/verif-dashboard.mts
git commit -m "test(dashboard): verificação E2E do parser sem descarte + métricas honestas"
```

---

## Self-Review

**Spec coverage:** parser sem descarte + 6 categorias (Task 1) ✓; mapa beta (Task 2) ✓; 2 taxas + provisório (Task 3) ✓; UI cores/categorias/selo (Task 4) ✓; re-upload substitui (já existe no upload route — confirmado, sem task) ✓; "as of" (Task 4 parcial — selo provisório/final; timestamp via uploaded_at) ✓; verificação (Task 5) ✓.

**Placeholders:** nenhum — código completo nas Tasks 1-3; Task 4 referencia âncoras de um arquivo existente já lido; Task 5 descreve o script.

**Type consistency:** `StatusManual` (7 valores) usado igual em Tasks 1-4; `taxaEntregaDefinitiva`/`andamentoPct`/`resumoDia` consistentes entre Task 3 e 4; `statusRotaParaDashboard` retorna `StatusManual` (Task 2). Os 7 valores de StatusManual aparecem no STATUS da UI (6 + indefinido tratado como fallback cinza).

**Nota:** `indefinido` não está no objeto STATUS da UI — adicionar entrada `indefinido: { label: 'Indefinido', cor: 'var(--color-fg-subtle)' }` pra nunca renderizar vazio (incluído na Task 4 Step 1).
