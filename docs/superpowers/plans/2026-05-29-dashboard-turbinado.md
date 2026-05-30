# Dashboard Turbinado — Tempos e Rankings

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar métricas ricas de tempos de operação (rota, loja, total), distribuição horária de saída, top rankings de rota/loja/total e top motoristas no dashboard `/painel` existente, puxando de `kpi_manual_entradas` com os filtros dia/semana/mês já presentes.

**Architecture:** Estender `calcularMetricas` com 9 novos campos derivados dos horários já presentes em `kpi_manual_entradas` (`saida_cd`, `chd`, `sai`, `motorista`). Os chart primitives (`BarList`, `ColumnChart`, `LineChart`) já existem em `src/app/painel/fechamento/charts.tsx` — movê-los para `src/app/painel/charts.tsx` antes de deletar a rota `/painel/fechamento` errada. Adicionar no `Conteudo` do `dashboard-client.tsx` um strip de 3 tiles de tempo + FAIXA 4 (evolução + horário + comparativo) + FAIXA 5 (top rankings + motoristas).

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, Vitest, SVG charts próprios (zero dep externa)

---

## Mapa de Arquivos

| Arquivo | Ação | Responsabilidade |
|---------|------|------------------|
| `src/lib/kpi/dashboard-metricas.ts` | Modificar | Novos tipos + helpers + 9 campos em `Metricas` |
| `src/lib/kpi/dashboard-metricas.test.ts` | Modificar | Testes TDD para novos campos |
| `src/app/painel/charts.tsx` | Criar (mover) | Chart primitives compartilhados (BarList, ColumnChart, LineChart) |
| `src/app/painel/fechamento/charts.tsx` | Deletar | Substituído por painel/charts.tsx |
| `src/app/painel/fechamento/fechamento-client.tsx` | Deletar | Rota errada |
| `src/app/painel/fechamento/page.tsx` | Deletar | Rota errada |
| `src/lib/kpi/fechamento-data.ts` | Deletar | Dados baked da rota errada |
| `src/app/painel/nav.tsx` | Modificar | Remover link "Fechamento" |
| `src/app/painel/dashboard/dashboard-client.tsx` | Modificar | Strip de tempo + FAIXA 4 + FAIXA 5 |

---

## Task 1: Novos tipos e helpers em dashboard-metricas.ts

**Files:**
- Modify: `src/lib/kpi/dashboard-metricas.ts`
- Modify: `src/lib/kpi/dashboard-metricas.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `src/lib/kpi/dashboard-metricas.test.ts`:

```typescript
describe('calcularMetricas — novos campos de tempo', () => {
  // Fixture com saida_cd, chd, sai para poder calcular tempos
  const E2 = (o: Partial<EntradaManual>): EntradaManual => ({
    rede_id: 'PRINCESA', data: '2026-05-19', loja: 'A',
    placa: 'ABC1234', motorista: 'JOAO',
    status: 'entregue', saida_cd: '04:00', chd: '05:30', sai: '06:00', ...o,
  })

  const ents2: EntradaManual[] = [
    E2({ loja: 'A', saida_cd: '04:00', chd: '05:30', sai: '06:00' }),  // rota=90, loja=30, total=120
    E2({ loja: 'B', saida_cd: '04:00', chd: '06:00', sai: '07:00' }),  // rota=120, loja=60, total=180
    E2({ loja: 'A', saida_cd: '04:00', chd: '05:30', sai: '06:00', data: '2026-05-20' }),
    E2({ loja: 'C', status: 'sem_rastreador', saida_cd: null, chd: null, sai: null }),
    E2({ loja: 'D', status: 'nao_foi', saida_cd: '05:00', chd: null, sai: null }),
    E2({ loja: 'E', motorista: 'JOSE', saida_cd: '05:00', chd: '06:00', sai: '06:30' }), // rota=60,loja=30,total=90
  ]

  it('tempoMedioRotaMin: media de saida_cd→chd (so entregues)', () => {
    const m = calcularMetricas(ents2)
    // rotas: 90, 120, 90, 60 → media = 360/4 = 90
    expect(m.tempoMedioRotaMin).toBe(90)
  })

  it('tempoMedioTotalMin: media de saida_cd→sai (so entregues)', () => {
    const m = calcularMetricas(ents2)
    // totais: 120, 180, 120, 90 → media = 510/4 = 127 (arredondado)
    expect(m.tempoMedioTotalMin).toBe(128)
  })

  it('distHorarioSaida: agrupa por hora de saida_cd', () => {
    const m = calcularMetricas(ents2)
    const h4 = m.distHorarioSaida.find(h => h.hora === 4)!
    const h5 = m.distHorarioSaida.find(h => h.hora === 5)!
    expect(h4.entregas).toBe(4)  // 4 entradas com saida_cd '04:...'
    expect(h5.entregas).toBe(2)  // 2 entradas com saida_cd '05:...'
    expect(m.distHorarioSaida).toHaveLength(24)
  })

  it('topRotasDemoradas: top lojas por tempo_rota decrescente (min 2 pontos)', () => {
    const m = calcularMetricas(ents2)
    // loja A: 2 entradas, avg rota 90. loja B: 1 entrada → excluída (< 2)
    expect(m.topRotasDemoradas[0].loja).toBe('A')
    expect(m.topRotasDemoradas[0].tempo_rota).toBe(90)
  })

  it('topMotoristas: top por entregas (entregues com motorista)', () => {
    const m = calcularMetricas(ents2)
    const joao = m.topMotoristas.find(x => x.motorista === 'JOAO')!
    expect(joao.entregas).toBe(4)  // 4 entregues com motorista JOAO
  })

  it('serieTempos: avg de tempos por dia', () => {
    const m = calcularMetricas(ents2)
    const d19 = m.serieTempos.find(s => s.data === '2026-05-19')!
    // entregues em 19: 3 entradas (A, B, E) com saida_cd
    // rotas: 90, 120, 60 → avg = 90; lojas: 30, 60, 30 → avg = 40; totais: 120, 180, 90 → avg = 130
    expect(d19.tempo_rota).toBe(90)
    expect(d19.tempo_loja).toBe(40)
    expect(d19.tempo_total).toBe(130)
  })

  it('porClienteComTempos: por rede com avg tempos e lojas únicas', () => {
    const m = calcularMetricas(ents2)
    const princesa = m.porClienteComTempos.find(c => c.rede_id === 'PRINCESA')!
    expect(princesa.entregas).toBe(6)
    expect(princesa.lojas).toBe(5)  // A, B, C, D, E
    expect(typeof princesa.tempo_rota).toBe('number')
  })
})
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
npx vitest run src/lib/kpi/dashboard-metricas.test.ts
```

Esperado: `FAIL` com "m.tempoMedioRotaMin is not a property" ou similar.

- [ ] **Step 3: Adicionar novos tipos em `dashboard-metricas.ts`**

Logo após as interfaces existentes (`Metricas`, `MetricasRede`, etc.), adicionar:

```typescript
export interface ClienteTempos {
  rede_id: string
  entregas: number
  lojas: number
  tempo_rota: number | null
  tempo_loja: number | null
  tempo_total: number | null
  sem_rast: number
}

export interface LojaTopRow {
  rede_id: string
  loja: string
  n: number
  tempo_rota: number | null
  tempo_loja: number | null
  tempo_total: number | null
}

export interface HoraSaidaRow {
  hora: number
  entregas: number
}

export interface MotoristaStat {
  motorista: string
  entregas: number
  tempo_rota: number | null
  tempo_loja: number | null
}

export interface SerieTempoPonto {
  data: string
  tempo_rota: number | null
  tempo_loja: number | null
  tempo_total: number | null
}
```

- [ ] **Step 4: Estender a interface `Metricas` com os 9 novos campos**

Na interface `Metricas` existente, adicionar ao final:

```typescript
  // Tempos de operação (calculados de saida_cd/chd/sai — null quando sem dados)
  tempoMedioRotaMin: number | null
  tempoMedioTotalMin: number | null
  porClienteComTempos: ClienteTempos[]
  topRotasDemoradas: LojaTopRow[]     // top 15 por tempo_rota (min 2 entregas)
  topTempoEmLoja: LojaTopRow[]        // top 15 por tempo_loja
  topTempoTotal: LojaTopRow[]         // top 15 por tempo_total
  distHorarioSaida: HoraSaidaRow[]    // 24 buckets por hora de saida_cd
  topMotoristas: MotoristaStat[]      // top 15 por volume de entregas
  serieTempos: SerieTempoPonto[]      // avg diário de tempos (mesmos dias do serie)
```

- [ ] **Step 5: Adicionar helper `mediaVetorNulo` em `dashboard-metricas.ts`**

Logo após a função `turno`, adicionar:

```typescript
function mediaVetorNulo(ns: (number | null)[]): number | null {
  const t = ns.filter((n): n is number => n != null)
  return t.length ? Math.round(t.reduce((a, b) => a + b, 0) / t.length) : null
}
```

- [ ] **Step 6: Adicionar cálculos dos 9 campos em `calcularMetricas`**

No final de `calcularMetricas`, antes do `return`, adicionar:

```typescript
  // ── Tempos globais ──
  const entregues = ents.filter(e => e.status === 'entregue')
  const tempoMedioRotaMin = mediaVetorNulo(entregues.map(e => diffMin(e.saida_cd, e.chd)))
  const tempoMedioTotalMin = mediaVetorNulo(entregues.map(e => diffMin(e.saida_cd, e.sai)))

  // ── Por cliente com tempos ──
  const porClienteComTempos: ClienteTempos[] = [...redeMap.entries()].map(([rede_id, es]) => {
    const ent = es.filter(e => e.status === 'entregue')
    return {
      rede_id,
      entregas: es.length,
      lojas: new Set(es.map(e => e.loja)).size,
      tempo_rota: mediaVetorNulo(ent.map(e => diffMin(e.saida_cd, e.chd))),
      tempo_loja: mediaVetorNulo(ent.map(e => diffMin(e.chd, e.sai))),
      tempo_total: mediaVetorNulo(ent.map(e => diffMin(e.saida_cd, e.sai))),
      sem_rast: es.filter(e => e.status === 'sem_rastreador').length,
    }
  }).sort((a, b) => b.entregas - a.entregas)

  // ── Top lojas (agrupa por rede+loja, mínimo 2 entregas com dado) ──
  type LojaAcc = { rede_id: string; loja: string; rotas: number[]; lojas_t: number[]; totais: number[] }
  const lojaMap = new Map<string, LojaAcc>()
  for (const e of entregues) {
    const k = `${e.rede_id}|${e.loja}`
    const cur: LojaAcc = lojaMap.get(k) ?? { rede_id: e.rede_id, loja: e.loja, rotas: [], lojas_t: [], totais: [] }
    const r = diffMin(e.saida_cd, e.chd); if (r != null) cur.rotas.push(r)
    const l = diffMin(e.chd, e.sai);     if (l != null) cur.lojas_t.push(l)
    const t = diffMin(e.saida_cd, e.sai); if (t != null) cur.totais.push(t)
    lojaMap.set(k, cur)
  }
  const todasLojas: LojaTopRow[] = [...lojaMap.values()]
    .filter(v => v.rotas.length >= 2 || v.lojas_t.length >= 2)
    .map(v => ({
      rede_id: v.rede_id, loja: v.loja,
      n: Math.max(v.rotas.length, v.lojas_t.length),
      tempo_rota: mediaVetorNulo(v.rotas),
      tempo_loja: mediaVetorNulo(v.lojas_t),
      tempo_total: mediaVetorNulo(v.totais),
    }))

  const topRotasDemoradas = [...todasLojas]
    .filter(l => l.tempo_rota != null)
    .sort((a, b) => (b.tempo_rota ?? 0) - (a.tempo_rota ?? 0))
    .slice(0, 15)
  const topTempoEmLoja = [...todasLojas]
    .filter(l => l.tempo_loja != null)
    .sort((a, b) => (b.tempo_loja ?? 0) - (a.tempo_loja ?? 0))
    .slice(0, 15)
  const topTempoTotal = [...todasLojas]
    .filter(l => l.tempo_total != null)
    .sort((a, b) => (b.tempo_total ?? 0) - (a.tempo_total ?? 0))
    .slice(0, 15)

  // ── Distribuição horária de saída ──
  const horaBuckets: HoraSaidaRow[] = Array.from({ length: 24 }, (_, h) => ({ hora: h, entregas: 0 }))
  for (const e of ents) {
    if (!e.saida_cd) continue
    const h = Number(e.saida_cd.split(':')[0])
    if (h >= 0 && h < 24) horaBuckets[h].entregas++
  }

  // ── Top motoristas ──
  type MotorAcc = { motorista: string; cnt: number; rotas: number[]; lojas_t: number[] }
  const motorMap = new Map<string, MotorAcc>()
  for (const e of entregues.filter(e => e.motorista)) {
    const k = e.motorista!
    const cur: MotorAcc = motorMap.get(k) ?? { motorista: k, cnt: 0, rotas: [], lojas_t: [] }
    cur.cnt++
    const r = diffMin(e.saida_cd, e.chd); if (r != null) cur.rotas.push(r)
    const l = diffMin(e.chd, e.sai);     if (l != null) cur.lojas_t.push(l)
    motorMap.set(k, cur)
  }
  const topMotoristas: MotoristaStat[] = [...motorMap.values()]
    .sort((a, b) => b.cnt - a.cnt).slice(0, 15)
    .map(v => ({ motorista: v.motorista, entregas: v.cnt, tempo_rota: mediaVetorNulo(v.rotas), tempo_loja: mediaVetorNulo(v.lojas_t) }))

  // ── Série temporal de tempos ──
  type SerieTAcc = { rotas: number[]; lojas_t: number[]; totais: number[] }
  const serieTMap = new Map<string, SerieTAcc>()
  for (const e of entregues) {
    const cur: SerieTAcc = serieTMap.get(e.data) ?? { rotas: [], lojas_t: [], totais: [] }
    const r = diffMin(e.saida_cd, e.chd); if (r != null) cur.rotas.push(r)
    const l = diffMin(e.chd, e.sai);     if (l != null) cur.lojas_t.push(l)
    const t = diffMin(e.saida_cd, e.sai); if (t != null) cur.totais.push(t)
    serieTMap.set(e.data, cur)
  }
  const serieTempos: SerieTempoPonto[] = [...serieTMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, v]) => ({
      data,
      tempo_rota: mediaVetorNulo(v.rotas),
      tempo_loja: mediaVetorNulo(v.lojas_t),
      tempo_total: mediaVetorNulo(v.totais),
    }))
```

- [ ] **Step 7: Adicionar novos campos no `return` de `calcularMetricas`**

No objeto de retorno (após `placasMaisAtivas`), adicionar:

```typescript
    tempoMedioRotaMin,
    tempoMedioTotalMin,
    porClienteComTempos,
    topRotasDemoradas,
    topTempoEmLoja,
    topTempoTotal,
    distHorarioSaida: horaBuckets,
    topMotoristas,
    serieTempos,
```

- [ ] **Step 8: Rodar os testes para confirmar que passam**

```bash
npx vitest run src/lib/kpi/dashboard-metricas.test.ts
```

Esperado: todos os testes passando (incluindo os existentes e os 6 novos).

- [ ] **Step 9: Confirmar tsc limpo**

```bash
npx tsc --noEmit
```

Esperado: zero erros.

- [ ] **Step 10: Commit**

```bash
git add src/lib/kpi/dashboard-metricas.ts src/lib/kpi/dashboard-metricas.test.ts
git commit -m "feat(dashboard): extender Metricas com 9 campos de tempo, ranking e horário"
```

---

## Task 2: Mover charts.tsx + limpar /painel/fechamento

**Files:**
- Create: `src/app/painel/charts.tsx` (movido de fechamento/charts.tsx)
- Delete: `src/app/painel/fechamento/charts.tsx`
- Delete: `src/app/painel/fechamento/fechamento-client.tsx`
- Delete: `src/app/painel/fechamento/page.tsx`
- Delete: `src/lib/kpi/fechamento-data.ts`
- Modify: `src/app/painel/nav.tsx`

- [ ] **Step 1: Mover charts.tsx para a pasta painel/**

```bash
cp src/app/painel/fechamento/charts.tsx src/app/painel/charts.tsx
```

Verificar que o arquivo foi copiado:
```bash
ls src/app/painel/charts.tsx
```

- [ ] **Step 2: Deletar toda a rota /painel/fechamento e fechamento-data.ts**

```bash
rm -rf src/app/painel/fechamento
rm src/lib/kpi/fechamento-data.ts
```

- [ ] **Step 3: Remover o link "Fechamento" da nav**

Em `src/app/painel/nav.tsx`, remover:
- A linha `import { ..., ChartLineUp, ... }` → remover só `ChartLineUp` do import
- A linha `const FECHAMENTO: Leaf = { href: '/painel/fechamento', label: 'Fechamento', Icon: ChartLineUp }`
- A linha `<LeafLink item={FECHAMENTO} active={leafActive(pathname, FECHAMENTO.href)} />`

O arquivo ficará:

```typescript
import {
  ChartBar,
  ForkKnife,
  TableIcon,
  UsersThree,
  Storefront,
  ClockCounterClockwise,
  CaretRight,
} from '@phosphor-icons/react/dist/ssr'
// ... (resto igual, sem FECHAMENTO)
```

No `PainelNav`:
```tsx
<nav ...>
  <LeafLink item={DASHBOARD} active={pathname === '/painel'} />
  {/* FECHAMENTO removido */}
  <div className="my-2 h-px bg-[var(--color-sidebar-border)]" />
  {GROUPS.map(g => (
    <GroupBlock key={g.label} group={g} pathname={pathname} />
  ))}
</nav>
```

- [ ] **Step 4: Confirmar tsc limpo e build**

```bash
npx tsc --noEmit && npm run build
```

Esperado: zero erros, rota `/painel/fechamento` sumiu do output.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: mover charts.tsx pra painel/ e remover rota /fechamento errada"
```

---

## Task 3: Strip de 3 tiles de tempo no dashboard

**Files:**
- Modify: `src/app/painel/dashboard/dashboard-client.tsx`

Os 3 tiles (`Tempo médio de rota`, `Tempo médio em loja`, `Tempo médio total`) ficam numa row compacta abaixo da barra de status empilhada, antes da FAIXA 2 "Onde agir agora". Aparecem só quando há dados de tempo (pelo menos um campo não-null).

- [ ] **Step 1: Adicionar import de `fmtMin` em dashboard-client.tsx**

No topo do arquivo, a função `fmtH` já existe. Adicionar ao topo (logo após as imports atuais):

```typescript
const fmtMin = (n: number | null | undefined) => {
  if (n == null) return '—'
  const h = Math.floor(n / 60)
  const m = Math.round(n % 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}
```

(Diferente de `fmtH` que usa `Math.floor(n % 60)` — aqui arredondamos.)

- [ ] **Step 2: Adicionar o componente `TempoStrip`**

Adicionar após a função `PorRede`:

```tsx
function TempoStrip({ m }: { m: Metricas }) {
  if (m.tempoMedioRotaMin == null && m.tempoMedioTotalMin == null) return null
  const tiles = [
    { label: 'Tempo médio de rota', value: fmtMin(m.tempoMedioRotaMin), sub: 'CD → Loja', color: 'var(--color-accent)' },
    { label: 'Tempo médio em loja', value: fmtMin(m.tempoMedioLojaMin), sub: 'Chegada → Saída', color: 'var(--color-warning)' },
    { label: 'Tempo total médio', value: fmtMin(m.tempoMedioTotalMin), sub: 'Saída CD → Saída Loja', color: 'var(--color-info)' },
  ]
  return (
    <div className={`grid grid-cols-3 overflow-hidden divide-x divide-[var(--color-border)] ${CARD} animate-fade-up`}>
      {tiles.map(t => (
        <div key={t.label} className="p-4 sm:p-5">
          <div className="text-overline">{t.label}</div>
          <div className="mt-2 text-display text-numeric text-[28px] leading-none" style={{ color: t.color }}>
            {t.value}
          </div>
          <div className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">{t.sub}</div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Inserir `<TempoStrip>` na função `Conteudo`**

Na função `Conteudo`, entre a barra de status empilhada e a FAIXA 2 (`{/* ───────── FAIXA 2 ─────── */}`):

```tsx
      {/* Strip de tempos médios */}
      <TempoStrip m={m} />

      {/* ───────── FAIXA 2 — ONDE AGIR AGORA ───────── */}
```

- [ ] **Step 4: Confirmar tsc limpo**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/painel/dashboard/dashboard-client.tsx
git commit -m "feat(dashboard): strip de 3 tiles com tempos médios (rota, loja, total)"
```

---

## Task 4: FAIXA 4 — Evolução diária de tempos (LineChart)

**Files:**
- Modify: `src/app/painel/dashboard/dashboard-client.tsx`

- [ ] **Step 1: Adicionar import de `LineChart` no topo**

No topo de `dashboard-client.tsx`, adicionar:

```typescript
import { LineChart, BarList, ColumnChart, type BarItem } from '@/app/painel/charts'
```

- [ ] **Step 2: Adicionar `EvolucaoTempos` component**

Após `TempoStrip`:

```tsx
function EvolucaoTempos({ m }: { m: Metricas }) {
  if (m.serieTempos.length < 2) return null
  return (
    <div className={`${CARD} p-5 sm:p-6 animate-fade-up`}>
      <h3 className="text-overline mb-4">Evolução dos tempos médios</h3>
      <LineChart
        labels={m.serieTempos.map(s => s.data.slice(8, 10))}
        series={[
          { name: 'Tempo de Rota', color: 'var(--color-accent)', values: m.serieTempos.map(s => s.tempo_rota ?? 0), fill: true },
          { name: 'Tempo em Loja', color: 'var(--color-warning)', values: m.serieTempos.map(s => s.tempo_loja ?? 0), fill: true },
          { name: 'Tempo Total', color: 'var(--color-info)', values: m.serieTempos.map(s => s.tempo_total ?? 0), dashed: true },
        ]}
        height={260}
        labelEvery={m.serieTempos.length > 14 ? 3 : 2}
      />
    </div>
  )
}
```

- [ ] **Step 3: Adicionar FAIXA 4 em `Conteudo`**

Após o fechamento da `section` da FAIXA 3 (`</section>`), adicionar:

```tsx
      {/* ───────── FAIXA 4 — TEMPOS E DISTRIBUIÇÃO ───────── */}
      {(m.serieTempos.length >= 2 || m.distHorarioSaida.some(h => h.entregas > 0)) && (
        <section className="space-y-5 animate-fade-up" style={{ animationDelay: '240ms' }}>
          <h2 className="text-overline">Tempos e distribuição</h2>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <EvolucaoTempos m={m} />
            <DistribuicaoHoraria m={m} />
          </div>
        </section>
      )}
```

- [ ] **Step 4: Confirmar tsc limpo**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/painel/dashboard/dashboard-client.tsx
git commit -m "feat(dashboard): FAIXA 4 - LineChart de evolução diária de tempos"
```

---

## Task 5: FAIXA 4 (cont.) — Distribuição horária + comparativo por rede

**Files:**
- Modify: `src/app/painel/dashboard/dashboard-client.tsx`

- [ ] **Step 1: Adicionar `DistribuicaoHoraria` component**

Após `EvolucaoTempos`:

```tsx
function DistribuicaoHoraria({ m }: { m: Metricas }) {
  const temDados = m.distHorarioSaida.some(h => h.entregas > 0)
  if (!temDados) return null
  const peak = m.distHorarioSaida.reduce((best, h) => h.entregas > best.entregas ? h : best)
  const total = m.distHorarioSaida.reduce((s, h) => s + h.entregas, 0)
  const earlyShare = total ? Math.round(m.distHorarioSaida.filter(h => h.hora >= 3 && h.hora <= 6).reduce((s, h) => s + h.entregas, 0) / total * 100) : 0
  return (
    <div className={`${CARD} p-5 sm:p-6 animate-fade-up`}>
      <h3 className="text-overline mb-1">Horário de saída do CD</h3>
      <p className="mb-4 text-[12px] text-[var(--color-fg-subtle)]">Quando os caminhões deixam o centro de distribuição</p>
      <ColumnChart
        items={m.distHorarioSaida.map(h => ({
          label: String(h.hora).padStart(2, '0'),
          value: h.entregas,
        }))}
        format={n => String(Math.round(n))}
        height={220}
        highlightIndex={peak.hora}
        labelEvery={2}
      />
      <div className="mt-3 rounded-[var(--radius-md)] border-l-[3px] border-l-[var(--color-info)] bg-[var(--color-info-soft)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--color-info-soft-fg)]">
        <strong>Pico às {String(peak.hora).padStart(2, '0')}h</strong> — {earlyShare}% das saídas ocorrem entre 03h e 06h.
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Adicionar `ComparativoRede` component**

Após `DistribuicaoHoraria`:

```tsx
type MetricaRede = 'tempo_rota' | 'tempo_loja' | 'tempo_total'
const LABEL_METRICA: Record<MetricaRede, string> = { tempo_rota: 'Tempo de Rota', tempo_loja: 'Tempo em Loja', tempo_total: 'Tempo Total' }

function ComparativoRede({ m }: { m: Metricas }) {
  const [metrica, setMetrica] = useState<MetricaRede>('tempo_rota')
  const temDados = m.porClienteComTempos.some(c => c.tempo_rota != null || c.tempo_loja != null)
  if (!temDados) return null

  const sorted = [...m.porClienteComTempos]
    .filter(c => c[metrica] != null)
    .sort((a, b) => (b[metrica] ?? 0) - (a[metrica] ?? 0))

  const items: BarItem[] = sorted.map(c => ({
    key: c.rede_id,
    label: REDE_LABEL[c.rede_id] ?? c.rede_id,
    value: c[metrica] ?? 0,
    sub: `${c.entregas} entregas · ${c.lojas} lojas`,
    tone: 'accent' as const,
  }))

  return (
    <div className={`${CARD} p-5 sm:p-6 animate-fade-up`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-overline">{LABEL_METRICA[metrica]} médio por rede</h3>
        <div className="flex gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-0.5">
          {(Object.keys(LABEL_METRICA) as MetricaRede[]).map(k => (
            <button
              key={k}
              onClick={() => setMetrica(k)}
              className={[
                'cursor-pointer rounded-[calc(var(--radius-md)-3px)] px-2.5 py-1 text-[11px] font-medium transition-colors duration-150',
                metrica === k
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
                  : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
              ].join(' ')}
            >
              {LABEL_METRICA[k]}
            </button>
          ))}
        </div>
      </div>
      <BarList items={items} format={fmtMin} />
    </div>
  )
}
```

- [ ] **Step 3: Atualizar FAIXA 4 para incluir `ComparativoRede`**

Na seção FAIXA 4 adicionada na Task 4, substituir a grid por:

```tsx
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <EvolucaoTempos m={m} />
            <DistribuicaoHoraria m={m} />
          </div>
          <ComparativoRede m={m} />
```

- [ ] **Step 4: Confirmar tsc limpo**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/painel/dashboard/dashboard-client.tsx
git commit -m "feat(dashboard): ColumnChart horário de saída + comparativo por rede com toggle"
```

---

## Task 6: FAIXA 5 — Top rotas + top tempo em loja

**Files:**
- Modify: `src/app/painel/dashboard/dashboard-client.tsx`

- [ ] **Step 1: Adicionar `TopRotas` component**

Após `ComparativoRede`:

```tsx
function TopRotas({ m }: { m: Metricas }) {
  if (m.topRotasDemoradas.length === 0) return null
  const maxRota = m.topRotasDemoradas[0].tempo_rota ?? 1
  const items: BarItem[] = m.topRotasDemoradas.map((r, i) => ({
    key: `${r.rede_id}|${r.loja}`,
    label: r.loja,
    value: r.tempo_rota ?? 0,
    sub: `${REDE_LABEL[r.rede_id] ?? r.rede_id} · ${r.n} entregas`,
    tone: i < 3 ? 'danger' : ('warning' as const),
  }))
  const worst = m.topRotasDemoradas[0]
  const pctAcima = m.tempoMedioRotaMin
    ? Math.round((worst.tempo_rota ?? 0) / m.tempoMedioRotaMin * 100 - 100)
    : null
  return (
    <div className={`${CARD} p-5 sm:p-6 animate-fade-up`}>
      <h3 className="text-overline mb-1">Rotas mais demoradas</h3>
      <p className="mb-5 text-[12px] text-[var(--color-fg-subtle)]">Top 15 lojas com maior tempo médio CD → Loja</p>
      <BarList items={items} format={fmtMin} showRank maxValue={maxRota} />
      {pctAcima != null && (
        <div className="mt-4 rounded-[var(--radius-md)] border-l-[3px] border-l-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--color-warning-soft-fg)]">
          <strong>{worst.loja}</strong> ({REDE_LABEL[worst.rede_id] ?? worst.rede_id}) lidera com {fmtMin(worst.tempo_rota)} — {pctAcima}% acima da média geral.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Adicionar `TopTempoLoja` component**

Após `TopRotas`:

```tsx
function TopTempoLoja({ m }: { m: Metricas }) {
  if (m.topTempoEmLoja.length === 0) return null
  const maxLoja = m.topTempoEmLoja[0].tempo_loja ?? 1
  const items: BarItem[] = m.topTempoEmLoja.map((r, i) => ({
    key: `${r.rede_id}|${r.loja}`,
    label: r.loja,
    value: r.tempo_loja ?? 0,
    sub: `${REDE_LABEL[r.rede_id] ?? r.rede_id} · ${r.n} entregas`,
    tone: i < 3 ? 'danger' : ('warning' as const),
  }))
  return (
    <div className={`${CARD} p-5 sm:p-6 animate-fade-up`}>
      <h3 className="text-overline mb-1">Maior tempo parado em cliente</h3>
      <p className="mb-5 text-[12px] text-[var(--color-fg-subtle)]">Top 15 lojas com maior tempo médio de descarga</p>
      <BarList items={items} format={fmtMin} showRank maxValue={maxLoja} />
    </div>
  )
}
```

- [ ] **Step 3: Adicionar FAIXA 5 em `Conteudo`**

Após o fechamento da FAIXA 4:

```tsx
      {/* ───────── FAIXA 5 — RANKINGS ───────── */}
      {(m.topRotasDemoradas.length > 0 || m.topTempoEmLoja.length > 0 || m.topMotoristas.length > 0) && (
        <section className="space-y-5 animate-fade-up" style={{ animationDelay: '320ms' }}>
          <h2 className="text-overline">Rankings de performance</h2>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <TopRotas m={m} />
            <TopTempoLoja m={m} />
          </div>
        </section>
      )}
```

- [ ] **Step 4: Confirmar tsc limpo**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/painel/dashboard/dashboard-client.tsx
git commit -m "feat(dashboard): FAIXA 5 - top rotas demoradas + top tempo em loja (BarList)"
```

---

## Task 7: FAIXA 5 (cont.) — Top motoristas

**Files:**
- Modify: `src/app/painel/dashboard/dashboard-client.tsx`

- [ ] **Step 1: Adicionar `TopMotoristas` component**

Após `TopTempoLoja`:

```tsx
function TopMotoristas({ m }: { m: Metricas }) {
  if (m.topMotoristas.length === 0) return null
  const maxEnt = m.topMotoristas[0].entregas
  return (
    <div className={`${CARD} overflow-hidden animate-fade-up`}>
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <h3 className="text-overline mb-1">Visão por motorista</h3>
        <p className="mb-4 text-[12px] text-[var(--color-fg-subtle)]">Top 15 por volume de entregas no período</p>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[10px] uppercase tracking-[0.1em] text-[var(--color-fg-subtle)]">
              <th className="px-5 py-2.5 font-semibold">#</th>
              <th className="px-3 py-2.5 font-semibold">Motorista</th>
              <th className="px-3 py-2.5 font-semibold">Entregas</th>
              <th className="px-3 py-2.5 text-right font-semibold">Rota</th>
              <th className="px-5 py-2.5 text-right font-semibold">Loja</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {m.topMotoristas.map((r, i) => (
              <tr key={r.motorista} className="transition-colors hover:bg-[var(--color-bg-subtle)]">
                <td className="px-5 py-2.5">
                  <span className={[
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[11px] font-semibold tabular-nums',
                    i < 3
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-soft-fg)]'
                      : 'bg-[var(--color-bg-subtle)] text-[var(--color-fg-subtle)]',
                  ].join(' ')}>{i + 1}</span>
                </td>
                <td className="px-3 py-2.5 font-medium text-[var(--color-fg)]">{r.motorista}</td>
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2">
                    <span
                      className="hidden h-1.5 rounded-full bg-[var(--color-accent)] sm:inline-block"
                      style={{ width: `${(r.entregas / maxEnt) * 56}px` }}
                    />
                    <span className="font-semibold tabular-nums text-[var(--color-fg)]">{r.entregas}</span>
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-fg-muted)]">{fmtMin(r.tempo_rota)}</td>
                <td className="px-5 py-2.5 text-right tabular-nums text-[var(--color-fg-muted)]">{fmtMin(r.tempo_loja)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Adicionar `TopMotoristas` na FAIXA 5**

Na seção FAIXA 5 (Task 6, Step 3), expandir para incluir motoristas abaixo da grid:

```tsx
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <TopRotas m={m} />
            <TopTempoLoja m={m} />
          </div>
          <TopMotoristas m={m} />
```

- [ ] **Step 3: Confirmar tsc limpo + suíte de testes completa**

```bash
npx tsc --noEmit && npx vitest run
```

Esperado: zero erros de tipo, todos os testes passando.

- [ ] **Step 4: Build de produção**

```bash
npm run build
```

Esperado: build limpo, rota `/painel` compilada, rota `/painel/fechamento` ausente.

- [ ] **Step 5: Commit final**

```bash
git add src/app/painel/dashboard/dashboard-client.tsx
git commit -m "feat(dashboard): FAIXA 5 completa - top motoristas (tabela)"
```

---

## Task 8: Merge e deploy

**Files:** nenhum arquivo novo

- [ ] **Step 1: Rodar suíte completa uma última vez**

```bash
npx vitest run && npx tsc --noEmit && npm run build
```

Esperado: tudo verde.

- [ ] **Step 2: Merge para main e push**

```bash
git checkout main
git merge --ff-only feat/dashboard-kpi
git push origin main
git checkout feat/dashboard-kpi
git push origin feat/dashboard-kpi
```

---

## Self-Review (spec coverage)

| Requisito do Fechamento HTML | Coberto em | Observação |
|------------------------------|-----------|------------|
| KPIs tempo rota/loja/total | Task 3 (TempoStrip) | 3 tiles compactos |
| Entregas por dia (barras) | Já existe (SerieChart) | Não mexe |
| Evolução tempos por dia (linha) | Task 4 (EvolucaoTempos) | LineChart, mín 2 dias |
| Comparativo por cliente toggle | Task 5 (ComparativoRede) | BarList + toggle |
| Distribuição horária de saída | Task 5 (DistribuicaoHoraria) | ColumnChart + insight |
| Top 15 rotas demoradas | Task 6 (TopRotas) | BarList com rank |
| Top 15 tempo em loja | Task 6 (TopTempoLoja) | BarList com rank |
| Top 15 motoristas | Task 7 (TopMotoristas) | Tabela |
| Filtro dia/semana/mês/custom | Já existe | Nada a fazer |
| Filtro por rede (chips) | Já existe | Nada a fazer |

**Dados vs Baked (diferença key):** O HTML original usa dados baked de Abril (8.390 entregas de múltiplas redes). O dashboard usa `kpi_manual_entradas` em tempo real — campos `saida_cd`/`chd`/`sai`/`motorista` **devem estar preenchidos** nas planilhas inseridas para que os novos gráficos apareçam. Quando não há dados de tempo, cada seção (guarda com `if (...) return null`) some silenciosamente — o dashboard existente permanece intacto.

**Limpeza de fechamento-data.ts e rota errada:** coberta na Task 2.

**Placeholder scan:** zero — todos os steps têm código completo e comandos exatos.

**Consistência de tipos:** `Metricas` estendida na Task 1; `TopRotas`/`TopTempoLoja`/`TopMotoristas`/`TempoStrip`/`ComparativoRede`/`EvolucaoTempos`/`DistribuicaoHoraria` todos acessam `m: Metricas` — nenhuma propriedade inventada fora do que foi definido.
