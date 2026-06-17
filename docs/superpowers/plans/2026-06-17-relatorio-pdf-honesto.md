# Relatório PDF honesto (Benassi · Transmonseg) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alinhar o PDF de operação ao dashboard reformulado: taxa definitiva, 7 categorias visíveis (incluindo "em análise"), visibilidade/completude, selo provisório/final e caixa de cálculo auditável, com redesign nível consultoria.

**Architecture:** O PDF já recebe `Metricas` atualizado via `api/dashboard/relatorio/route.ts`. Reescrevemos a apresentação (`Relatorio.tsx`, `relatorio-narrativa.ts`), o tema (`tema.ts`), adicionamos gráficos empilhados (`charts-pdf.tsx`) e helpers puros (`derivados.ts`), e estendemos `Metricas` só com `topIndefinido`. Nada de métrica recalculada.

**Tech Stack:** Next.js (custom build), `@react-pdf/renderer` v4, TypeScript, Vitest. Fontes nativas Helvetica.

## Global Constraints

- Zero custo (free tier); nenhuma dependência paga ou fonte externa.
- Português correto com acentos. **NUNCA travessão "—"**; placeholder de "sem dado" = `s/d`.
- Paleta navy (`tema.ts`), A4, `@react-pdf/renderer`.
- Não recalcular métricas: tudo vem de `calcularMetricas`. XLSX/modelo oficial intocado.
- Taxa de entrega = `entregue / (entregue + nao_foi)` (definitiva). "Fora da conferência" = `total - (entregue + nao_foi)`. Visibilidade GPS = `com_rastreador / total`.
- Cada task termina verde em `npx tsc --noEmit` e `npx vitest run`. Commit ao fim de cada task.

---

### Task 1: Paleta de status e placeholder "s/d" no tema

**Files:**
- Modify: `src/lib/relatorio/tema.ts`
- Test: `src/lib/relatorio/tema.test.ts` (criar)

**Interfaces:**
- Produces: `ORDEM_STATUS: readonly StatusKey[]`, `type StatusKey`, `STATUS_LABEL: Record<StatusKey,string>`, `STATUS_COR: Record<StatusKey,string>`. `fmtMin`/`fmtNum` passam a devolver `'s/d'` em vez de `'—'`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/relatorio/tema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fmtMin, fmtNum, ORDEM_STATUS, STATUS_LABEL, STATUS_COR } from './tema'

describe('tema', () => {
  it('placeholder de sem-dado é "s/d", nunca travessão', () => {
    expect(fmtMin(null)).toBe('s/d')
    expect(fmtMin(NaN)).toBe('s/d')
    expect(fmtNum(null)).toBe('s/d')
    expect(fmtMin(90)).toBe('1h30')
    expect(fmtMin(45)).toBe('45min')
    for (const v of [fmtMin(null), fmtNum(null)]) expect(v).not.toContain('—')
  })
  it('as 7 categorias têm rótulo e cor; "indefinido" é "Em análise"', () => {
    expect(ORDEM_STATUS).toHaveLength(7)
    expect(STATUS_LABEL.indefinido).toBe('Em análise')
    expect(STATUS_LABEL.entregue).toBe('Entregue')
    for (const k of ORDEM_STATUS) expect(STATUS_COR[k]).toMatch(/^#|^var|^rgb/)
    // em análise e sem rastreador NÃO podem ter a mesma cor (viram blob único)
    expect(STATUS_COR.indefinido).not.toBe(STATUS_COR.sem_rastreador)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/relatorio/tema.test.ts`
Expected: FAIL (ORDEM_STATUS/STATUS_LABEL não existem; fmtMin(null) === '—').

- [ ] **Step 3: Implementar no tema**

Em `src/lib/relatorio/tema.ts`, trocar nos dois formatadores o `return '—'` por `return 's/d'`:

```ts
export const fmtMin = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return 's/d'
  const h = Math.floor(n / 60), m = Math.round(n % 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}

export const fmtNum = (n: number | null | undefined) =>
  n == null || isNaN(n) ? 's/d' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
```

Adicionar ao fim do arquivo:

```ts
/** Ordem canônica das 7 categorias no mix de status do relatório. */
export const ORDEM_STATUS = [
  'entregue', 'em_rota', 'nao_foi', 'mudou_de_rota', 'desatualizado', 'sem_rastreador', 'indefinido',
] as const
export type StatusKey = typeof ORDEM_STATUS[number]

export const STATUS_LABEL: Record<StatusKey, string> = {
  entregue: 'Entregue',
  em_rota: 'Em rota',
  nao_foi: 'Não foi',
  mudou_de_rota: 'Mudou de rota',
  desatualizado: 'Desatualizado',
  sem_rastreador: 'Sem rastreador',
  indefinido: 'Em análise',
}

// Cores print-friendly; "em análise" usa um cinza claro distinto de "sem rastreador".
export const STATUS_COR: Record<StatusKey, string> = {
  entregue: C.ok,
  em_rota: C.info,
  nao_foi: C.bad,
  mudou_de_rota: C.warn,
  desatualizado: '#B45309',
  sem_rastreador: C.muted,
  indefinido: '#B8B2AA',
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/relatorio/tema.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/relatorio/tema.ts src/lib/relatorio/tema.test.ts
git commit -m "feat(relatorio): paleta das 7 categorias + placeholder s/d (sem travessão)"
```

---

### Task 2: Gráficos empilhados em charts-pdf

**Files:**
- Modify: `src/lib/relatorio/charts-pdf.tsx`
- Test: `src/lib/relatorio/charts-pdf.test.ts` (criar)

**Interfaces:**
- Consumes: `C` de `./tema`; `View, Text, Svg, Rect, Line` de `@react-pdf/renderer` (já importados).
- Produces:
  - `segmentos(valores: number[], largura: number): number[]` (puro).
  - `StackedBarPdf({ data: { label: string; value: number; color: string }[]; width: number; height?: number })`.
  - `StackedColumnPdf({ data: { label: string; segments: { value: number; color: string }[] }[]; width: number; height?: number })`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/relatorio/charts-pdf.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { segmentos } from './charts-pdf'

describe('segmentos', () => {
  it('reparte a largura proporcionalmente e fecha com o total', () => {
    expect(segmentos([1, 1, 2], 100)).toEqual([25, 25, 50])
    expect(segmentos([3, 1], 80).reduce((a, b) => a + b, 0)).toBeCloseTo(80)
  })
  it('total zero ou vazio não quebra (sem divisão por zero)', () => {
    expect(segmentos([0, 0, 0], 100)).toEqual([0, 0, 0])
    expect(segmentos([], 100)).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/relatorio/charts-pdf.test.ts`
Expected: FAIL ("segmentos" is not exported).

- [ ] **Step 3: Implementar os componentes**

Em `src/lib/relatorio/charts-pdf.tsx`, adicionar ao fim (antes/depois dos existentes, mantendo os imports do topo):

```tsx
/** Reparte `largura` proporcional aos valores. Total <= 0 devolve tudo zero. */
export function segmentos(valores: number[], largura: number): number[] {
  const total = valores.reduce((a, b) => a + b, 0)
  if (total <= 0) return valores.map(() => 0)
  return valores.map(v => (v / total) * largura)
}

// ── StackedBarPdf: uma barra horizontal empilhada por status + legenda ────────
export function StackedBarPdf({
  data,
  width,
  height = 14,
}: {
  data: { label: string; value: number; color: string }[]
  width: number
  height?: number
}) {
  const segs = segmentos(data.map(d => d.value), width)
  const total = data.reduce((a, d) => a + d.value, 0)
  let x = 0
  return (
    <View>
      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} fill={C.bgSubtle} />
        {data.map((d, i) => {
          const w = segs[i]
          const rect = w > 0 ? <Rect key={i} x={x} y={0} width={w} height={height} fill={d.color} /> : null
          x += w
          return rect
        })}
      </Svg>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
        {data.filter(d => d.value > 0).map((d, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 3 }}>
            <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: d.color, marginRight: 4 }} />
            <Text style={{ fontSize: 7.5, color: C.inkSoft }}>
              {d.label} {d.value} ({total > 0 ? Math.round((100 * d.value) / total) : 0}%)
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// ── StackedColumnPdf: colunas empilhadas por status (série diária) ────────────
export function StackedColumnPdf({
  data,
  width,
  height = 120,
}: {
  data: { label: string; segments: { value: number; color: string }[] }[]
  width: number
  height?: number
}) {
  const n = Math.max(data.length, 1)
  const totals = data.map(d => d.segments.reduce((a, s) => a + s.value, 0))
  const max = Math.max(...totals, 1)
  const gap = n > 30 ? 1 : 2
  const slot = width / n
  const barW = Math.max(slot - gap, 1)
  const every = Math.max(1, Math.ceil(n / 12))
  return (
    <View>
      <Svg width={width} height={height}>
        <Line x1={0} y1={height - 0.5} x2={width} y2={height - 0.5} stroke={AXIS} strokeWidth={1} />
        {data.map((d, i) => {
          const colTotal = totals[i]
          const colH = max > 0 ? (colTotal / max) * (height - 2) : 0
          let yTop = height - colH
          return d.segments.map((s, si) => {
            if (s.value <= 0) return null
            const segH = (s.value / (colTotal || 1)) * colH
            const rect = (
              <Rect key={`${i}-${si}`} x={i * slot + gap / 2} y={yTop} width={barW} height={segH} fill={s.color} />
            )
            yTop += segH
            return rect
          })
        })}
      </Svg>
      <View style={{ flexDirection: 'row', marginTop: 2 }}>
        {data.map((d, i) => (
          <Text key={i} style={{ width: slot, fontSize: 6.5, color: LABEL, textAlign: 'center' }}>
            {i % every === 0 ? d.label : ''}
          </Text>
        ))}
      </View>
    </View>
  )
}
```

(`AXIS` e `LABEL` já são constantes no topo do arquivo.)

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/relatorio/charts-pdf.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Verificar tipos e commit**

Run: `npx tsc --noEmit` → Expected: sem erros.

```bash
git add src/lib/relatorio/charts-pdf.tsx src/lib/relatorio/charts-pdf.test.ts
git commit -m "feat(relatorio): StackedBarPdf e StackedColumnPdf para o mix de status"
```

---

### Task 3: topIndefinido no Metricas

**Files:**
- Modify: `src/lib/kpi/dashboard-metricas.ts` (interface ~linha 60; return ~linha 348)
- Modify (mocks): `src/lib/kpi/relatorio-narrativa.test.ts`, `src/lib/relatorio/relatorio.test.tsx`
- Test: `src/lib/kpi/dashboard-metricas.test.ts`

**Interfaces:**
- Produces: `Metricas.topIndefinido: Array<{ rede_id: string; loja: string; ocorrencias: number }>` (lojas com status `indefinido`, via `agrupaLoja('indefinido')`).

- [ ] **Step 1: Escrever o teste que falha**

Em `src/lib/kpi/dashboard-metricas.test.ts`, dentro do primeiro `describe('calcularMetricas')`, no teste "totais, rede, serie, turno, tempo", adicionar uma entrada indefinida ao array `ents` (topo do arquivo) e uma asserção. Primeiro, no array `ents`:

```ts
  E({ rede_id: 'ASSAI', loja: 'D', status: 'indefinido', chd: null, sai: null }),
```

Depois, dentro do teste, adicionar:

```ts
    expect(m.topIndefinido[0]).toMatchObject({ rede_id: 'ASSAI', loja: 'D', ocorrencias: 1 })
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/kpi/dashboard-metricas.test.ts`
Expected: FAIL (`m.topIndefinido` é undefined). Obs: o `total` do teste sobe de 4 para 5 e `filtrar` "sem filtro" de 4 para 5 — ajustar esses números no mesmo arquivo se quebrarem (total esperado 5; `filtrar(ents, {})` 5; PRINCESA total continua 2; ASSAI total vira 3).

- [ ] **Step 3: Implementar**

Na interface `Metricas` (após `topNaoFoi`, ~linha 60):

```ts
  topIndefinido: Array<{ rede_id: string; loja: string; ocorrencias: number }>
```

No `return` de `calcularMetricas` (após `topNaoFoi: agrupaLoja('nao_foi'),`, ~linha 348):

```ts
    topIndefinido: agrupaLoja('indefinido'),
```

Atualizar os dois mocks literais de `Metricas` adicionando o campo (qualquer posição dentro do objeto):

- Em `src/lib/kpi/relatorio-narrativa.test.ts`, no `base()`, após `topNaoFoi: [],`:
```ts
  topIndefinido: [],
```
- Em `src/lib/relatorio/relatorio.test.tsx`, no `fakeMetricas()`, após `topNaoFoi: [...],`:
```ts
    topIndefinido: [],
```

- [ ] **Step 4: Rodar a suíte e confirmar verde**

Run: `npx vitest run src/lib/kpi/dashboard-metricas.test.ts src/lib/kpi/relatorio-narrativa.test.ts src/lib/relatorio/relatorio.test.tsx`
Expected: PASS. Depois `npx tsc --noEmit` → sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi/dashboard-metricas.ts src/lib/kpi/dashboard-metricas.test.ts src/lib/kpi/relatorio-narrativa.test.ts src/lib/relatorio/relatorio.test.tsx
git commit -m "feat(kpi): topIndefinido (lojas em análise) para a página de exceções"
```

---

### Task 4: Helpers puros do relatório (derivados)

**Files:**
- Create: `src/lib/relatorio/derivados.ts`
- Test: `src/lib/relatorio/derivados.test.ts`

**Interfaces:**
- Consumes: `Metricas` de `@/lib/kpi/dashboard-metricas`.
- Produces: `conferiveis(m)`, `foraConferencia(m)`, `visibilidadeGps(m)`, `ehProvisorio(m)`, `seloTexto(m): { provisorio: boolean; texto: string }`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/relatorio/derivados.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { conferiveis, foraConferencia, visibilidadeGps, ehProvisorio, seloTexto } from './derivados'
import type { Metricas } from '@/lib/kpi/dashboard-metricas'

const m = (o: Partial<Metricas>): Metricas => ({
  total: 0, entregue: 0, nao_foi: 0, sem_rastreador: 0, em_rota: 0, mudou_de_rota: 0,
  desatualizado: 0, indefinido: 0, com_rastreador: 0, pctEntregue: 0, taxaEntregaDefinitiva: 0,
  andamentoPct: 0, pctSemRastreador: 0, tempoMedioLojaMin: null,
  turnos: { madrugada: 0, manha: 0, tarde: 0, noite: 0 }, porRede: [], rankingSucesso: [],
  rankingSemRastreador: [], serie: [], topSemRastreador: [], topNaoFoi: [], topIndefinido: [],
  placasMaisAtivas: [], tempoMedioRotaMin: null, tempoMedioTotalMin: null, tempoMedioOperacaoMin: null,
  tempoMedioVoltaMin: null, pctComVolta: 0, distHorarioVolta: [], porClienteComTempos: [],
  topRotasDemoradas: [], topTempoEmLoja: [], topTempoTotal: [], distHorarioSaida: [],
  topMotoristas: [], serieTempos: [], ...o,
})

describe('derivados do relatório', () => {
  it('conferíveis e fora da conferência', () => {
    const x = m({ total: 27, entregue: 11, nao_foi: 0, sem_rastreador: 10, indefinido: 6 })
    expect(conferiveis(x)).toBe(11)
    expect(foraConferencia(x)).toBe(16)
  })
  it('visibilidade GPS = com_rastreador / total', () => {
    expect(visibilidadeGps(m({ total: 100, com_rastreador: 73 }))).toBe(73)
    expect(visibilidadeGps(m({ total: 0, com_rastreador: 0 }))).toBe(0)
  })
  it('selo: provisório quando há em rota', () => {
    expect(ehProvisorio(m({ em_rota: 2 }))).toBe(true)
    expect(ehProvisorio(m({ em_rota: 0 }))).toBe(false)
    expect(seloTexto(m({ em_rota: 2 }))).toEqual({ provisorio: true, texto: 'Provisório · 2 em rota' })
    expect(seloTexto(m({ em_rota: 0 }))).toEqual({ provisorio: false, texto: 'Final' })
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/relatorio/derivados.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

Criar `src/lib/relatorio/derivados.ts`:

```ts
import type { Metricas } from '@/lib/kpi/dashboard-metricas'

/** Linhas que dá pra conferir (denominador da taxa definitiva). */
export const conferiveis = (m: Metricas) => m.entregue + m.nao_foi

/** Linhas fora da conferência: em rota + mudou + desatualizado + sem rastreador + em análise. */
export const foraConferencia = (m: Metricas) => m.total - conferiveis(m)

/** Cobertura de rastreamento sobre o total. */
export const visibilidadeGps = (m: Metricas) => (m.total ? Math.round((100 * m.com_rastreador) / m.total) : 0)

/** Tem rota em andamento => o período ainda não fechou. */
export const ehProvisorio = (m: Metricas) => m.em_rota > 0

export function seloTexto(m: Metricas): { provisorio: boolean; texto: string } {
  return ehProvisorio(m)
    ? { provisorio: true, texto: `Provisório · ${m.em_rota} em rota` }
    : { provisorio: false, texto: 'Final' }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/relatorio/derivados.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/relatorio/derivados.ts src/lib/relatorio/derivados.test.ts
git commit -m "feat(relatorio): helpers puros (conferíveis, visibilidade, selo)"
```

---

### Task 5: Narrativa reescrita (7 categorias + visibilidade + completude)

**Files:**
- Modify: `src/lib/kpi/relatorio-narrativa.ts`
- Test: `src/lib/kpi/relatorio-narrativa.test.ts`

**Interfaces:**
- Consumes: `Metricas`, `conferiveis`/`foraConferencia`/`visibilidadeGps` de `@/lib/relatorio/derivados`, `REDE_LABEL`.
- Produces: `montarNarrativa(m, ant, periodo, intervalo): Narrativa` (mesma assinatura), bullets e recomendações no modelo honesto, sem travessão.

- [ ] **Step 1: Reescrever os testes (falham primeiro)**

Substituir o corpo de `src/lib/kpi/relatorio-narrativa.test.ts` por:

```ts
import { describe, it, expect } from 'vitest'
import { montarNarrativa } from './relatorio-narrativa'
import type { Metricas } from './dashboard-metricas'

const base = (o: Partial<Metricas>): Metricas => ({
  total: 0, entregue: 0, nao_foi: 0, sem_rastreador: 0, em_rota: 0, mudou_de_rota: 0,
  desatualizado: 0, indefinido: 0, com_rastreador: 0, pctEntregue: 0, taxaEntregaDefinitiva: 0,
  andamentoPct: 0, pctSemRastreador: 0, tempoMedioLojaMin: null,
  turnos: { madrugada: 0, manha: 0, tarde: 0, noite: 0 }, porRede: [], rankingSucesso: [],
  rankingSemRastreador: [], serie: [], topSemRastreador: [], topNaoFoi: [], topIndefinido: [],
  placasMaisAtivas: [], tempoMedioRotaMin: null, tempoMedioTotalMin: null, tempoMedioOperacaoMin: null,
  tempoMedioVoltaMin: null, pctComVolta: 0, distHorarioVolta: [], porClienteComTempos: [],
  topRotasDemoradas: [], topTempoEmLoja: [], topTempoTotal: [], distHorarioSaida: [],
  topMotoristas: [], serieTempos: [], ...o,
})

describe('montarNarrativa', () => {
  it('fala em conferíveis e visibilidade, e sinaliza abaixo da meta', () => {
    const n = montarNarrativa(
      base({ total: 100, entregue: 81, nao_foi: 9, sem_rastreador: 8, indefinido: 2, com_rastreador: 90, pctEntregue: 90, taxaEntregaDefinitiva: 90, pctSemRastreador: 8 }),
      null, 'mes', ['2026-05-01', '2026-05-31'],
    )
    const txt = n.sumario.join(' ')
    expect(txt).toMatch(/conferíveis/i)
    expect(txt).toMatch(/visibilidade/i)
    expect(txt).toMatch(/90%/)
    expect(txt).toMatch(/meta/i)
  })
  it('nunca usa travessão em nada', () => {
    const n = montarNarrativa(base({ total: 50, entregue: 40, nao_foi: 5, sem_rastreador: 3, indefinido: 2, com_rastreador: 47, pctEntregue: 89, taxaEntregaDefinitiva: 89, pctSemRastreador: 6 }), null, 'dia', ['2026-05-21', '2026-05-21'])
    for (const b of n.sumario) expect(b).not.toContain('—')
    for (const r of n.recomendacoes) { expect(r.titulo).not.toContain('—'); expect(r.corpo).not.toContain('—') }
  })
  it('compara com período anterior quando há', () => {
    const at = base({ total: 100, entregue: 95, nao_foi: 5, pctEntregue: 95, taxaEntregaDefinitiva: 95 })
    const ant = base({ total: 100, entregue: 90, nao_foi: 10, pctEntregue: 90, taxaEntregaDefinitiva: 90 })
    expect(montarNarrativa(at, ant, 'mes', ['2026-05-01', '2026-05-31']).sumario.join(' ')).toMatch(/5 ponto/)
  })
  it('recomenda reduzir sem rastreador quando visibilidade baixa (> 10% sem GPS)', () => {
    const n = montarNarrativa(base({ total: 100, sem_rastreador: 20, pctSemRastreador: 20, entregue: 70, nao_foi: 10, com_rastreador: 80, pctEntregue: 88, taxaEntregaDefinitiva: 88 }), null, 'mes', ['2026-05-01', '2026-05-31'])
    expect(n.recomendacoes.some(r => /rastreador|visibilidade/i.test(r.titulo))).toBe(true)
  })
  it('recomenda investigar "em análise" quando há muita linha sem classificação', () => {
    const n = montarNarrativa(base({ total: 100, entregue: 50, nao_foi: 0, indefinido: 40, sem_rastreador: 10, com_rastreador: 60, pctEntregue: 100, taxaEntregaDefinitiva: 100, pctSemRastreador: 10 }), null, 'mes', ['2026-05-01', '2026-05-31'])
    expect(n.recomendacoes.some(r => /análise|conferência|classifica/i.test(r.titulo))).toBe(true)
  })
})
```

(O campo `conferiveis: undefined as never` foi um lapso; remover essa chave do primeiro teste antes de rodar — `base()` não aceita `conferiveis`.)

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/kpi/relatorio-narrativa.test.ts`
Expected: FAIL (narrativa antiga não menciona "conferíveis"/"visibilidade" nem tem a recomendação de "em análise").

- [ ] **Step 3: Reescrever a narrativa**

Substituir `src/lib/kpi/relatorio-narrativa.ts` por:

```ts
import type { Metricas } from './dashboard-metricas'
import { REDE_LABEL } from './redes'
import { conferiveis, foraConferencia, visibilidadeGps } from '@/lib/relatorio/derivados'

export interface Narrativa { sumario: string[]; recomendacoes: { titulo: string; corpo: string }[] }

const META_ENTREGA = 95
const fmtMin = (n: number | null | undefined) =>
  n == null ? 's/d' : `${Math.floor(n / 60)}h${String(Math.round(n % 60)).padStart(2, '0')}`

export function montarNarrativa(m: Metricas, ant: Metricas | null, periodo: string, _intervalo: [string, string]): Narrativa {
  const sumario: string[] = []
  const rotuloP = { dia: 'no dia', semana: 'na semana', mes: 'no mês', ano: 'no ano' }[periodo] ?? 'no período'
  const conf = conferiveis(m)
  const fora = foraConferencia(m)
  const vis = visibilidadeGps(m)

  // 1. Entregas confirmadas sobre as conferíveis (não sobre o total).
  const statusTaxa = m.pctEntregue >= META_ENTREGA ? 'dentro da meta' : `abaixo da meta de ${META_ENTREGA}%`
  sumario.push(`Foram ${m.total.toLocaleString('pt-BR')} entregas ${rotuloP}. Das ${conf.toLocaleString('pt-BR')} conferíveis, ${m.entregue.toLocaleString('pt-BR')} foram concluídas: taxa de ${m.pctEntregue}% (${statusTaxa}).`)

  // 2. Visibilidade e o que ficou fora da conferência.
  sumario.push(`A visibilidade por GPS cobriu ${vis}% da operação. ${fora.toLocaleString('pt-BR')} linha(s) ficaram fora da conferência: ${m.sem_rastreador} sem rastreador e ${m.indefinido} em análise.`)

  // 3. Comparação vs período anterior.
  if (ant && ant.total > 0) {
    const dTaxa = m.pctEntregue - ant.pctEntregue
    const dir = dTaxa > 0 ? 'subiu' : dTaxa < 0 ? 'caiu' : 'ficou estável'
    sumario.push(`A taxa ${dir} ${Math.abs(dTaxa)} ponto(s) percentual(is) vs o período anterior (${ant.pctEntregue}%).`)
  }

  // 4. Tempos.
  if (m.tempoMedioTotalMin != null) {
    sumario.push(`O ciclo médio (da saída do CD até a saída da loja) foi de ${fmtMin(m.tempoMedioTotalMin)}, sendo ${fmtMin(m.tempoMedioRotaMin)} de rota e ${fmtMin(m.tempoMedioLojaMin)} parado em loja.`)
  }

  // 5. Pior rota (exceção concreta).
  const piorRota = m.topRotasDemoradas[0]
  if (piorRota) sumario.push(`A rota mais lenta foi ${piorRota.loja} (${REDE_LABEL[piorRota.rede_id] ?? piorRota.rede_id}), com ${fmtMin(piorRota.tempo_rota)} médios de CD a loja.`)

  // ── Recomendações (por threshold) ──
  const recomendacoes: Narrativa['recomendacoes'] = []
  if (m.pctSemRastreador > 10) recomendacoes.push({ titulo: 'Aumentar a visibilidade por GPS', corpo: `${m.pctSemRastreador}% das entregas ficaram sem rastreador. Priorizar instalação e manutenção de rastreadores e o cadastro no Unitrac recupera visibilidade e tira essas linhas da incerteza.` })
  const pctIndef = m.total ? Math.round((100 * m.indefinido) / m.total) : 0
  if (pctIndef > 15) recomendacoes.push({ titulo: 'Investigar as linhas em análise', corpo: `${pctIndef}% das linhas ficaram em análise (sem legenda nem horário no relatório de origem). Padronizar o preenchimento da escala fecha essa lacuna e dá uma taxa sobre base maior.` })
  if (m.pctEntregue < META_ENTREGA) recomendacoes.push({ titulo: 'Recuperar a taxa de entrega', corpo: `A taxa (${m.pctEntregue}%) está abaixo da meta de ${META_ENTREGA}%. Investigar as ${m.nao_foi} entregas não realizadas e as lojas com mais ocorrências.` })
  if (m.topRotasDemoradas[0] && (m.topRotasDemoradas[0].tempo_rota ?? 0) > 240) recomendacoes.push({ titulo: 'Otimizar as rotas críticas', corpo: `As rotas mais lentas passam de 4h de CD a loja. Rever roteirização, janelas de saída e consolidação de cargas.` })
  if (recomendacoes.length === 0) recomendacoes.push({ titulo: 'Manter o desempenho', corpo: 'Os indicadores estão dentro das metas no período. Manter o acompanhamento.' })

  return { sumario, recomendacoes }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/kpi/relatorio-narrativa.test.ts`
Expected: PASS (5 testes). Depois `npx tsc --noEmit` → sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi/relatorio-narrativa.ts src/lib/kpi/relatorio-narrativa.test.ts
git commit -m "feat(relatorio): narrativa honesta (conferíveis, visibilidade, em análise)"
```

---

### Task 6: Reescrever Relatorio.tsx (8 páginas)

**Files:**
- Modify: `src/lib/relatorio/Relatorio.tsx`
- Test (smoke): `src/lib/relatorio/relatorio.test.tsx` (já cobre render)

**Interfaces:**
- Consumes: `StackedBarPdf`, `StackedColumnPdf` de `./charts-pdf`; `conferiveis`, `foraConferencia`, `visibilidadeGps`, `seloTexto` de `./derivados`; `ORDEM_STATUS`, `STATUS_LABEL`, `STATUS_COR` de `./tema`; `Metricas`, `m.topIndefinido`. Mantém `KpiCard`, `Tabela`, `TituloSecao`, `Rodape` (já existem no arquivo).

Implementar página a página. Os componentes auxiliares existentes (`KpiCard`, `Tabela`, `TituloSecao`, `Rodape`, `periodoExtenso`, `rotuloRedes`, deltas) permanecem.

- [ ] **Step 1: Imports e dados derivados no topo de `Relatorio`**

Adicionar aos imports do arquivo:

```tsx
import { C, S, fmtMin, fmtNum, ORDEM_STATUS, STATUS_LABEL, STATUS_COR } from './tema'
import { ColumnPdf, BarPdf, LinePdf, StackedBarPdf, StackedColumnPdf } from './charts-pdf'
import { conferiveis, foraConferencia, visibilidadeGps, seloTexto } from './derivados'
```

Dentro de `Relatorio`, após os deltas existentes, adicionar:

```tsx
  const conf = conferiveis(m)
  const fora = foraConferencia(m)
  const vis = visibilidadeGps(m)
  const selo = seloTexto(m)
  const mix = ORDEM_STATUS.map(k => ({ key: k, label: STATUS_LABEL[k], value: m[k] as number, color: STATUS_COR[k] }))
  // série diária empilhada por status (fecha com o total do dia via "outros")
  const serieStack = m.serie.map(p => {
    const outros = Math.max(p.total - p.entregue - p.nao_foi - p.sem_rastreador - p.em_rota, 0)
    return {
      label: p.data.slice(8, 10),
      segments: [
        { value: p.entregue, color: STATUS_COR.entregue },
        { value: p.em_rota, color: STATUS_COR.em_rota },
        { value: p.nao_foi, color: STATUS_COR.nao_foi },
        { value: p.sem_rastreador, color: STATUS_COR.sem_rastreador },
        { value: outros, color: STATUS_COR.indefinido },
      ],
    }
  })
```

- [ ] **Step 2: Capa com selo e frase de valor**

Substituir o bloco da CAPA (o terceiro `View` "Total de entregas no período" e o bloco absoluto) para refletir conferíveis/visibilidade e o selo. Trocar o `View` de "Total de entregas" por:

```tsx
          <View style={{ marginBottom: 16 }}>
            <Text style={S.overline}>Resultado do período</Text>
            <Text style={{ fontSize: 12, marginTop: 3 }}>
              {m.entregue.toLocaleString('pt-BR')} de {conf.toLocaleString('pt-BR')} entregas conferíveis concluídas ({m.pctEntregue}%) · visibilidade GPS {vis}%
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: selo.provisorio ? C.warn : C.ok, marginRight: 6 }} />
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: selo.provisorio ? C.warn : C.ok }}>{selo.texto}</Text>
          </View>
```

- [ ] **Step 3: Página nova "Painel de confiança" (após o Sumário executivo)**

Inserir uma nova `<Page>` logo após a página 2 (Sumário executivo):

```tsx
      {/* ─────────────────── PAINEL DE CONFIANÇA ─────────────────── */}
      <Page size="A4" style={S.page}>
        <TituloSecao over="Transparência" titulo="Painel de confiança" />
        <View style={{ flexDirection: 'row', marginBottom: 16 }}>
          {[
            { rot: 'Entregas confirmadas', val: `${m.pctEntregue}%`, sub: `${m.entregue} de ${conf} conferíveis` },
            { rot: 'Visibilidade GPS', val: `${vis}%`, sub: 'da operação rastreada' },
            { rot: 'Fora da conferência', val: fmtNum(fora), sub: `${m.sem_rastreador} sem GPS · ${m.indefinido} em análise` },
          ].map((c, i) => (
            <View key={i} style={{ width: '31.5%', marginRight: i < 2 ? '2.75%' : 0, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 10 }}>
              <Text style={[S.overline, { marginBottom: 4 }]}>{c.rot}</Text>
              <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.navy }}>{c.val}</Text>
              <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 3 }}>{c.sub}</Text>
            </View>
          ))}
        </View>

        <Text style={[S.h2, { fontSize: 11 }]}>Mix de status do período</Text>
        <View style={{ marginBottom: 14 }}>
          <StackedBarPdf data={mix} width={CONTENT_W} />
        </View>

        <Tabela
          cols={[
            { titulo: 'Categoria', width: '55%' },
            { titulo: 'Linhas', width: '22%', align: 'right' },
            { titulo: '% do total', width: '23%', align: 'right' },
          ]}
          rows={mix.map(s => [s.label, fmtNum(s.value), m.total ? `${Math.round((100 * s.value) / m.total)}%` : '0%'])}
        />

        <View style={{ marginTop: 12, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderLeftColor: C.navy, borderRadius: 6, padding: 10 }}>
          <Text style={{ fontSize: 9, lineHeight: 1.45, color: C.inkSoft }}>
            Como lemos a taxa: contamos como entrega só o que foi confirmado, e dividimos pelas linhas conferíveis (entregue mais não foi). Linhas sem rastreador ou em análise ficam fora da taxa, não inflam nem derrubam o número. O detalhe do cálculo está no apêndice.
          </Text>
        </View>
        <Rodape geradoEm={geradoEm} />
      </Page>
```

- [ ] **Step 4: Scorecard com visibilidade, "em análise" e por-rede definitivo**

No Scorecard, trocar o `KpiCard` "Cobertura GPS" para usar `vis`, e inserir um card "Em análise". Substituir o card de Cobertura GPS por:

```tsx
          <KpiCard rotulo="Visibilidade GPS" valor={`${vis}%`} delta={dGps} unidadeDelta=" p.p." sentido="maior_melhor" />
          <KpiCard rotulo="Em análise" valor={fmtNum(m.indefinido)} delta={null} unidadeDelta="" sentido="menor_melhor" />
```

E o card "Taxa de entrega" ganha a base no rótulo do valor (deixar o valor como `${m.pctEntregue}%`; a base aparece na tabela e no painel de confiança — não duplicar texto no card).

Na tabela "Desempenho por rede", adicionar a coluna "Sem confirmação" e ajustar larguras:

```tsx
          <Tabela
            cols={[
              { titulo: 'Rede', width: '34%' },
              { titulo: 'Entregas', width: '16%', align: 'right' },
              { titulo: '% entrega', width: '17%', align: 'right' },
              { titulo: 'Sem conf.', width: '16%', align: 'right' },
              { titulo: 'Tempo médio', width: '17%', align: 'right' },
            ]}
            rows={m.porRede.slice(0, 18).map(r => [
              REDE_LABEL[r.rede_id] ?? r.rede_id,
              fmtNum(r.entregue),
              `${r.pctEntregue}%`,
              fmtNum(r.total - r.entregue - r.nao_foi),
              fmtMin(r.tempoMedioMin),
            ])}
          />
```

Remover a função `redeRow` antiga (substituída pelo `.map` inline acima).

- [ ] **Step 5: Tendências com coluna empilhada por status**

Na página de Tendências, trocar o primeiro gráfico (`ColumnPdf` de `colEntregas`) por `StackedColumnPdf`:

```tsx
          {serieStack.length > 0 ? (
            <StackedColumnPdf data={serieStack} width={CONTENT_W} height={120} />
          ) : (
            <Text style={S.muted}>Sem dados no período.</Text>
          )}
```

Manter o caption de `diaPico`. Remover a const `colEntregas` (não usada mais).

- [ ] **Step 6: Exceções cruzando "em análise"**

No bloco de exceções, somar `topIndefinido` ao `probMap` e adicionar a coluna. Após o loop de `topNaoFoi`, adicionar:

```tsx
  for (const r of m.topIndefinido) {
    const k = `${r.rede_id}|${r.loja}`
    const cur = probMap.get(k) ?? { rede_id: r.rede_id, loja: r.loja, sem_rast: 0, nao_foi: 0, em_analise: 0 }
    cur.em_analise = (cur.em_analise ?? 0) + r.ocorrencias
    probMap.set(k, cur)
  }
```

Ajustar o tipo `LojaProb` para incluir `em_analise: number` e o `sort` para considerar `sem_rast + nao_foi + em_analise`. A tabela "Lojas com mais ocorrências" passa a:

```tsx
            <Tabela
              cols={[
                { titulo: 'Loja', width: '34%' },
                { titulo: 'Rede', width: '26%' },
                { titulo: 'Sem GPS', width: '13%', align: 'right' },
                { titulo: 'Não foi', width: '13%', align: 'right' },
                { titulo: 'Em análise', width: '14%', align: 'right' },
              ]}
              rows={lojasProblema.map(l => [
                l.loja,
                REDE_LABEL[l.rede_id] ?? l.rede_id,
                String(l.sem_rast),
                String(l.nao_foi),
                String(l.em_analise ?? 0),
              ])}
            />
```

(Atualizar a inicialização de `cur` nos loops de `topSemRastreador`/`topNaoFoi` para incluir `em_analise: 0`.)

- [ ] **Step 7: Apêndice com definições corretas + caixa de cálculo + glossário**

No Apêndice, substituir a lista de definições por estas (corretas) e adicionar a caixa de cálculo e o glossário. Trocar o array de definições por:

```tsx
            {[
              ['Taxa de entrega', 'Entregas confirmadas ÷ conferíveis (entregue + não foi). Linhas sem confirmação ficam fora.'],
              ['Conferíveis', 'Linhas com desfecho definido: entregue ou não foi ao cliente.'],
              ['Visibilidade GPS', 'Percentual da operação com rastreador ativo no período.'],
              ['Fora da conferência', 'Linhas sem desfecho confirmável: em rota, sem rastreador, em análise, desatualizado ou mudou de rota.'],
              ['Tempo de rota', 'Da saída do CD até a chegada na loja.'],
              ['Tempo em loja', 'Da chegada na loja até a saída da loja.'],
              ['Não realizadas', 'Entregas programadas com confirmação de que não foram concluídas.'],
            ].map(([t, d], i, arr) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: i === arr.length - 1 ? 0 : 5 }}>
                <Text style={{ width: 110, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.ink }}>{t}</Text>
                <Text style={{ flex: 1, fontSize: 8.5, color: C.inkSoft }}>{d}</Text>
              </View>
            ))}
```

Adicionar, após a caixa de definições, a caixa de cálculo auditável:

```tsx
        <View style={{ marginTop: 16 }}>
          <Text style={[S.h2, { fontSize: 11 }]}>Como a taxa foi calculada</Text>
          <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 12 }}>
            {[
              ['Entregas confirmadas (numerador)', fmtNum(m.entregue)],
              ['Não realizadas', fmtNum(m.nao_foi)],
              ['Conferíveis (denominador)', `${fmtNum(conf)}  =  ${fmtNum(m.entregue)} + ${fmtNum(m.nao_foi)}`],
              ['Taxa de entrega', `${m.pctEntregue}%  =  ${fmtNum(m.entregue)} ÷ ${fmtNum(conf)}`],
              ['Total de linhas no período', fmtNum(m.total)],
              ['Fora da conferência', `${fmtNum(fora)}  (${m.sem_rastreador} sem GPS · ${m.indefinido} em análise · ${m.em_rota} em rota · ${m.desatualizado} desatualizado · ${m.mudou_de_rota} mudou de rota)`],
            ].map(([t, d], i, arr) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: i === arr.length - 1 ? 0 : 5 }}>
                <Text style={{ width: 180, fontSize: 8.5, color: C.inkSoft }}>{t}</Text>
                <Text style={{ flex: 1, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.ink }}>{d}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ marginTop: 16 }}>
          <Text style={[S.h2, { fontSize: 11 }]}>Glossário das categorias</Text>
          <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 12 }}>
            {[
              ['Entregue', 'Entrega confirmada na loja esperada.'],
              ['Em rota', 'Veículo ainda em operação no fechamento (período provisório).'],
              ['Não foi', 'Confirmado que o veículo não chegou ao cliente.'],
              ['Mudou de rota', 'Entregou, mas em destino diferente do programado.'],
              ['Desatualizado', 'Rastreador existe mas parou de comunicar.'],
              ['Sem rastreador', 'Placa sem GPS ou sem cadastro no Unitrac.'],
              ['Em análise', 'Sem legenda nem horário no relatório de origem: aguarda classificação.'],
            ].map(([t, d], i, arr) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: i === arr.length - 1 ? 0 : 5 }}>
                <Text style={{ width: 90, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.ink }}>{t}</Text>
                <Text style={{ flex: 1, fontSize: 8.5, color: C.inkSoft }}>{d}</Text>
              </View>
            ))}
          </View>
        </View>
```

- [ ] **Step 8: Verificar tipos e smoke**

Run: `npx tsc --noEmit` → Expected: sem erros (resolver qualquer `colEntregas`/`redeRow` órfão).
Run: `npx vitest run src/lib/relatorio/relatorio.test.tsx` → Expected: PASS (render não lança, buffer > 1000).

- [ ] **Step 9: Commit**

```bash
git add src/lib/relatorio/Relatorio.tsx
git commit -m "feat(relatorio): redesign honesto (painel de confiança, taxa definitiva, caixa de cálculo)"
```

---

### Task 7: Verificação visual e fechamento

**Files:**
- Create (temporário): `scripts/dev/gerar-relatorio-preview.mts`
- Verifica: render real do PDF, suíte completa, build.

- [ ] **Step 1: Script que gera o PDF real a partir de KPIs reais**

Criar `scripts/dev/gerar-relatorio-preview.mts` que carrega entradas de um XLSX real (via `parseKpiManual`), calcula `Metricas`, monta a narrativa e renderiza o `Relatorio` para `relatorio-preview.pdf`:

```ts
import { readFile, writeFile, glob } from 'node:fs/promises'
import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { parseKpiManual } from '@/lib/kpi/parse-kpi-manual'
import { calcularMetricas } from '@/lib/kpi/dashboard-metricas'
import { montarNarrativa } from '@/lib/kpi/relatorio-narrativa'
import { Relatorio, type RelatorioCtx } from '@/lib/relatorio/Relatorio'

const arquivos: string[] = []
for await (const p of glob('docs/conversas-tia-erica/dia-19/kpis-pos-deploy/KPI-*.xlsx')) arquivos.push(p)
const ents = (await Promise.all(arquivos.map(async (a) => {
  const rede = (a.match(/KPI-([A-Z_]+)-/)?.[1]) ?? 'REDE'
  return parseKpiManual(await readFile(a) as any, rede, '2026-05-19')
}))).flat()
const m = calcularMetricas(ents)
const intervalo: [string, string] = ['2026-05-19', '2026-05-19']
const ctx: RelatorioCtx = { m, ant: null, periodo: 'dia', intervalo, redes: [], narrativa: montarNarrativa(m, null, 'dia', intervalo), mes: '2026-05', geradoEm: '19/05/2026 14:00' }
const buf = await renderToBuffer(React.createElement(Relatorio, { ctx }) as React.ReactElement<DocumentProps>)
await writeFile('relatorio-preview.pdf', buf)
console.log(`OK: relatorio-preview.pdf (${buf.length} bytes), total ${m.total} linhas, taxa ${m.pctEntregue}%`)
```

Run: `npx tsx scripts/dev/gerar-relatorio-preview.mts`
Expected: imprime "OK: relatorio-preview.pdf ... bytes".

- [ ] **Step 2: Olhar o PDF página por página**

Abrir `relatorio-preview.pdf` (usar a ferramenta Read sobre o PDF, páginas 1 a 8) e conferir visualmente:
- Capa: selo provisório/final correto, frase de valor com conferíveis + visibilidade.
- Painel de confiança: barra empilhada fecha 100%, tabela das 7 categorias soma o total.
- Scorecard: visibilidade e "em análise" presentes; por-rede com coluna "Sem conf.".
- Tendências: colunas empilhadas por status.
- Exceções: coluna "Em análise".
- Apêndice: definições corretas, caixa de cálculo com a conta certa, glossário.
- Nenhum travessão "—" em nenhuma página.

Corrigir no `Relatorio.tsx` o que estiver visualmente quebrado (overflow, sobreposição, cor indistinta) e regenerar.

- [ ] **Step 3: Suíte completa, tipos e build**

Run: `npx vitest run` → Expected: tudo verde.
Run: `npx tsc --noEmit` → Expected: sem erros.
Run: `npm run build` → Expected: exit 0.

- [ ] **Step 4: Remover o preview e commitar**

```bash
rm -f relatorio-preview.pdf
git add scripts/dev/gerar-relatorio-preview.mts
git commit -m "test(relatorio): script de geração do PDF para verificação visual"
git push
```

---

## Self-Review

**Spec coverage:**
- Métrica-estrela (visibilidade + conferíveis): Tasks 4, 5, 6 (capa, painel, scorecard). ✓
- Confiança-primeiro: Task 6 Step 3 (página após o sumário). ✓
- 7 categorias visíveis: Tasks 1, 2, 6 (tema, StackedBar, painel/glossário). ✓
- Selo provisório/final: Tasks 4, 6 (capa). ✓
- Caixa de cálculo auditável + definições corretas + glossário: Task 6 Step 7. ✓
- Narrativa reescrita: Task 5. ✓
- Exceções com em análise: Tasks 3, 6 Step 6. ✓
- Tendências empilhadas: Tasks 2, 6 Step 5. ✓
- Sem travessão (s/d): Tasks 1, 5; verificação na Task 7 Step 2. ✓
- Verificação visual do PDF real: Task 7. ✓
- XLSX/dashboard intocados: nenhuma task os altera. ✓

**Placeholder scan:** Sem "TBD/TODO" e sem chaves inválidas nos testes. Todo step que altera código mostra o código completo. Sem placeholders.

**Type consistency:** `Metricas.topIndefinido` (Task 3) é consumido na Task 6 Step 6. `StackedBarPdf`/`StackedColumnPdf`/`segmentos` (Task 2) consumidos na Task 6 Steps 3 e 5. `seloTexto`/`conferiveis`/`foraConferencia`/`visibilidadeGps` (Task 4) consumidos nas Tasks 5 e 6. `ORDEM_STATUS`/`STATUS_LABEL`/`STATUS_COR` (Task 1) consumidos na Task 6 Step 1. Tipos batem.
