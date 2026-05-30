# Gerador de Relatório PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans pra implementar task-a-task. Steps usam checkbox (`- [ ]`).

**Goal:** Gerar um relatório PDF executivo de verdade (capa, sumário, scorecard, gráficos, exceções, recomendações), por período (dia/semana/mês/ano), a partir dos KPIs manuais — não o print da tela.

**Architecture:** `@react-pdf/renderer` (server-side, sem browser, free-tier) monta o documento a partir das métricas que `calcularMetricas` já produz. Estende-se o período com 'ano' e comparação vs período anterior (deltas). A narrativa ("o que aconteceu") é 100% por REGRAS (determinística, sem IA). Gráficos são desenhados com as primitivas `Svg`/`Rect`/`Polyline` do react-pdf (porto dos charts atuais). Uma rota `/api/dashboard/relatorio` renderiza o buffer e devolve o PDF; um botão no dashboard dispara.

**Tech Stack:** Next.js 16 (route handler nodejs), `@react-pdf/renderer`, TypeScript, Vitest.

**Decisões do dono (2026-05-30):** motor = `@react-pdf/renderer`; narrativa = só regras (sem IA).

---

## Princípios aplicados (da pesquisa)

- Relatório = documento de **decisão**: status → mudança → causa → exceção → ação.
- Estrutura: Capa · Sumário executivo (3-6 bullets) · Scorecard (vs período anterior) · Tendências (com interpretação) · Exceções/onde agir · Por rede · Recomendações · Apêndice (motoristas, definições).
- Comparar sempre vs **período anterior** (e meta). Destacar exceções por **threshold**, não por adjetivo.
- Gráficos simples (linha=tendência, barra=ranking, coluna=volume), 1 mensagem por bloco, cor só pra status.
- Tabelas: título acima, unidade no header, número à direita, poucas linhas de grade.

---

## Mapa de Arquivos

| Arquivo | Ação | Responsabilidade |
|---------|------|------------------|
| `next.config.ts` | Modificar | `serverExternalPackages: ['@react-pdf/renderer']` |
| `src/lib/kpi/dashboard-query.ts` | Modificar | período 'ano' + `intervaloAnterior()` |
| `src/lib/kpi/relatorio-narrativa.ts` | Criar | comparação de métricas + narrativa por regras |
| `src/lib/kpi/relatorio-narrativa.test.ts` | Criar | TDD da narrativa |
| `src/lib/relatorio/tema.ts` | Criar | cores/estilos do PDF (navy) |
| `src/lib/relatorio/charts-pdf.tsx` | Criar | BarPdf / ColumnPdf / LinePdf (react-pdf Svg) |
| `src/lib/relatorio/Relatorio.tsx` | Criar | o documento completo (capa → apêndice) |
| `src/app/api/dashboard/relatorio/route.ts` | Criar | renderToBuffer + resposta PDF |
| `src/app/painel/dashboard/dashboard-client.tsx` | Modificar | botão "Gerar relatório" |

---

## Task 1: Instalar react-pdf + tema base

**Files:** `package.json`, `next.config.ts`, `src/lib/relatorio/tema.ts`

- [ ] **Step 1: Instalar a dependência**

```bash
npm install @react-pdf/renderer
```
Esperado: adiciona `@react-pdf/renderer` em dependencies. (MIT, sem custo.)

- [ ] **Step 2: Opt-out do bundling no next.config**

Em `next.config.ts`, garantir (criar a chave se não existir):
```ts
serverExternalPackages: ['@react-pdf/renderer'],
```

- [ ] **Step 3: Criar o tema do PDF**

`src/lib/relatorio/tema.ts`:
```ts
import { StyleSheet } from '@react-pdf/renderer'

// Navy KPI (#1F3864) — mesma identidade do dashboard/XLSX.
export const C = {
  navy: '#1F3864', navySoft: '#E2EAF3', ink: '#0A0A0A', inkSoft: '#3F3E3A',
  muted: '#6B6660', border: '#E1DDD9', bg: '#FFFFFF', bgSubtle: '#F4F4F3',
  ok: '#16A34A', warn: '#D97706', bad: '#DC2626', info: '#2563EB',
}

export const S = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 56, paddingHorizontal: 44, fontSize: 9.5, color: C.ink, fontFamily: 'Helvetica' },
  h1: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: C.navy },
  h2: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.ink, marginBottom: 8 },
  overline: { fontSize: 7.5, letterSpacing: 1.2, color: C.muted, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  muted: { color: C.muted },
  card: { borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 12 },
  row: { flexDirection: 'row' },
})

export const fmtMin = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return '—'
  const h = Math.floor(n / 60), m = Math.round(n % 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}
export const fmtNum = (n: number | null | undefined) =>
  n == null || isNaN(n) ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
```

- [ ] **Step 4: tsc limpo**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**
```bash
git add package.json package-lock.json next.config.ts src/lib/relatorio/tema.ts
git commit -m "feat(relatorio): add @react-pdf/renderer + tema do PDF"
```

---

## Task 2: Período 'ano' + período anterior (TDD)

**Files:** `src/lib/kpi/dashboard-query.ts`, novo `src/lib/kpi/dashboard-query.test.ts`

- [ ] **Step 1: Teste que falha** — `src/lib/kpi/dashboard-query.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import { intervaloPeriodo, intervaloAnterior } from './dashboard-query'

describe('intervaloPeriodo', () => {
  it('ano = jan a dez', () => expect(intervaloPeriodo('ano', '2026-05-21')).toEqual(['2026-01-01', '2026-12-31']))
  it('mes', () => expect(intervaloPeriodo('mes', '2026-05-21')).toEqual(['2026-05-01', '2026-05-31']))
  it('dia', () => expect(intervaloPeriodo('dia', '2026-05-21')).toEqual(['2026-05-21', '2026-05-21']))
})
describe('intervaloAnterior', () => {
  it('mes anterior', () => expect(intervaloAnterior('mes', '2026-05-21')).toEqual(['2026-04-01', '2026-04-30']))
  it('dia anterior', () => expect(intervaloAnterior('dia', '2026-05-21')).toEqual(['2026-05-20', '2026-05-20']))
  it('ano anterior', () => expect(intervaloAnterior('ano', '2026-05-21')).toEqual(['2025-01-01', '2025-12-31']))
})
```
Rodar: `npx vitest run src/lib/kpi/dashboard-query.test.ts` → FAIL.

- [ ] **Step 2: Implementar** em `dashboard-query.ts`: no `intervaloPeriodo`, antes do bloco 'mês', adicionar:
```ts
  if (periodo === 'ano') return [`${ref.slice(0, 4)}-01-01`, `${ref.slice(0, 4)}-12-31`]
```
E adicionar a função:
```ts
/** Intervalo do período imediatamente anterior ao de `ref` (pra comparação). */
export function intervaloAnterior(periodo: string, ref: string): [string, string] {
  const d = new Date(`${ref}T00:00:00Z`)
  if (periodo === 'dia') { const p = new Date(d); p.setUTCDate(d.getUTCDate() - 1); const s = p.toISOString().slice(0, 10); return [s, s] }
  if (periodo === 'semana') { const p = new Date(d); p.setUTCDate(d.getUTCDate() - 7); return intervaloPeriodo('semana', p.toISOString().slice(0, 10)) }
  if (periodo === 'ano') { const a = Number(ref.slice(0, 4)) - 1; return [`${a}-01-01`, `${a}-12-31`] }
  // mês (default)
  const y = d.getUTCFullYear(), mo = d.getUTCMonth() // 0-based; mês anterior = mo-1
  const ini = new Date(Date.UTC(y, mo - 1, 1)), fim = new Date(Date.UTC(y, mo, 0))
  return [ini.toISOString().slice(0, 10), fim.toISOString().slice(0, 10)]
}
```

- [ ] **Step 3: Testes passam** — `npx vitest run src/lib/kpi/dashboard-query.test.ts` → PASS. **Step 4: tsc**. **Step 5: Commit** `feat(relatorio): periodo 'ano' + intervaloAnterior pra comparacao`.

---

## Task 3: Narrativa por regras + comparação (TDD)

**Files:** `src/lib/kpi/relatorio-narrativa.ts`, `src/lib/kpi/relatorio-narrativa.test.ts`

Gera o sumário executivo e as recomendações a partir das métricas atuais + anteriores, com thresholds fixos.

- [ ] **Step 1: Teste que falha** — cobre: bullet de taxa vs meta, bullet de variação vs período anterior, recomendação quando sem_rast alto.
```ts
import { describe, it, expect } from 'vitest'
import { montarNarrativa } from './relatorio-narrativa'
import type { Metricas } from './dashboard-metricas'

const base = (o: Partial<Metricas>): Metricas => ({ /* preencher mínimos: total, entregue, nao_foi, sem_rastreador, pctEntregue, pctSemRastreador, com_rastreador, tempoMedioLojaMin: null, tempoMedioRotaMin: null, tempoMedioTotalMin: null, turnos:{madrugada:0,manha:0,tarde:0,noite:0}, porRede:[], rankingSucesso:[], rankingSemRastreador:[], serie:[], serieTempos:[], topSemRastreador:[], topNaoFoi:[], placasMaisAtivas:[], porClienteComTempos:[], topRotasDemoradas:[], topTempoEmLoja:[], topTempoTotal:[], distHorarioSaida:[], topMotoristas:[], ...o })

describe('montarNarrativa', () => {
  it('taxa abaixo da meta vira bullet de alerta', () => {
    const n = montarNarrativa(base({ total: 100, entregue: 90, pctEntregue: 90, sem_rastreador: 5, pctSemRastreador: 5 }), null, 'mes', ['2026-05-01', '2026-05-31'])
    expect(n.sumario.join(' ')).toMatch(/90%/)
    expect(n.sumario.join(' ')).toMatch(/meta/)
  })
  it('compara com período anterior quando há', () => {
    const at = base({ total: 100, entregue: 95, pctEntregue: 95 })
    const ant = base({ total: 100, entregue: 90, pctEntregue: 90 })
    expect(montarNarrativa(at, ant, 'mes', ['2026-05-01', '2026-05-31']).sumario.join(' ')).toMatch(/5( pontos| p\.p\.|%)/)
  })
  it('recomenda reduzir sem rastreador quando > 10%', () => {
    const n = montarNarrativa(base({ total: 100, sem_rastreador: 20, pctSemRastreador: 20, entregue: 70, pctEntregue: 70 }), null, 'mes', ['2026-05-01', '2026-05-31'])
    expect(n.recomendacoes.some(r => /rastreador/i.test(r.titulo))).toBe(true)
  })
})
```
Rodar → FAIL.

- [ ] **Step 2: Implementar** `relatorio-narrativa.ts`:
```ts
import type { Metricas } from './dashboard-metricas'
import { REDE_LABEL } from './redes'

export interface Narrativa { sumario: string[]; recomendacoes: { titulo: string; corpo: string }[] }

const META_ENTREGA = 95
const fmtMin = (n: number | null | undefined) => n == null ? '—' : `${Math.floor(n/60)}h${String(Math.round(n%60)).padStart(2,'0')}`

export function montarNarrativa(m: Metricas, ant: Metricas | null, periodo: string, intervalo: [string, string]): Narrativa {
  const sumario: string[] = []
  const rotuloP = { dia: 'no dia', semana: 'na semana', mes: 'no mês', ano: 'no ano' }[periodo] ?? 'no período'

  // 1. Volume + taxa de entrega vs meta
  const statusTaxa = m.pctEntregue >= META_ENTREGA ? 'dentro da meta' : `abaixo da meta de ${META_ENTREGA}%`
  sumario.push(`Foram ${m.total.toLocaleString('pt-BR')} entregas programadas ${rotuloP}, com taxa de entrega de ${m.pctEntregue}% (${statusTaxa}).`)

  // 2. Comparação vs período anterior
  if (ant && ant.total > 0) {
    const dTaxa = m.pctEntregue - ant.pctEntregue
    const dir = dTaxa > 0 ? 'subiu' : dTaxa < 0 ? 'caiu' : 'ficou estável'
    sumario.push(`A taxa ${dir} ${Math.abs(dTaxa)} ponto(s) percentual(is) vs o período anterior (${ant.pctEntregue}%).`)
  }

  // 3. Rastreamento
  sumario.push(`${m.sem_rastreador} entrega(s) ocorreram sem rastreador (${m.pctSemRastreador}% do total) e ${m.nao_foi} não foram realizadas.`)

  // 4. Tempos
  if (m.tempoMedioTotalMin != null) {
    sumario.push(`O ciclo médio (saída do CD → saída da loja) foi de ${fmtMin(m.tempoMedioTotalMin)}, sendo ${fmtMin(m.tempoMedioRotaMin)} de rota e ${fmtMin(m.tempoMedioLojaMin)} parado em loja.`)
  }

  // 5. Pior rota/loja (exceção concreta)
  const piorRota = m.topRotasDemoradas[0]
  if (piorRota) sumario.push(`A rota mais lenta foi ${piorRota.loja} (${REDE_LABEL[piorRota.rede_id] ?? piorRota.rede_id}), com ${fmtMin(piorRota.tempo_rota)} médios de CD → loja.`)

  // ── Recomendações (por threshold) ──
  const recomendacoes: Narrativa['recomendacoes'] = []
  if (m.pctSemRastreador > 10) recomendacoes.push({ titulo: 'Reduzir entregas sem rastreador', corpo: `${m.pctSemRastreador}% das entregas ficaram sem GPS. Priorizar instalação/manutenção de rastreadores e cadastro no Unitrac pra recuperar visibilidade.` })
  if (m.pctEntregue < META_ENTREGA) recomendacoes.push({ titulo: 'Recuperar a taxa de entrega', corpo: `A taxa (${m.pctEntregue}%) está abaixo da meta de ${META_ENTREGA}%. Investigar as ${m.nao_foi} entregas não realizadas e as lojas com mais ocorrências.` })
  if (m.topRotasDemoradas[0] && (m.topRotasDemoradas[0].tempo_rota ?? 0) > 240) recomendacoes.push({ titulo: 'Otimizar as rotas críticas', corpo: `As rotas mais lentas passam de 4h de CD → loja. Rever roteirização, janelas de saída e consolidação de cargas.` })
  if (recomendacoes.length === 0) recomendacoes.push({ titulo: 'Manter o desempenho', corpo: 'Os indicadores estão dentro das metas no período. Manter o acompanhamento.' })

  return { sumario, recomendacoes }
}
```

- [ ] **Step 3: Testes passam · Step 4: tsc · Step 5: Commit** `feat(relatorio): narrativa executiva por regras (deterministica)`.

---

## Task 4: Gráficos em react-pdf (Svg)

**Files:** `src/lib/relatorio/charts-pdf.tsx`

Três componentes que desenham com `Svg`/`Rect`/`Polyline`/`Line`/`Text` do react-pdf (sem medição de DOM — dimensões fixas passadas por prop). Espelham os charts do dashboard, mas estáticos pra impressão.

- [ ] **Step 1:** Implementar `BarPdf` (barras horizontais — rankings), `ColumnPdf` (colunas — volume/dia, horário) e `LinePdf` (linha multi-série — evolução de tempos). Assinatura:
```tsx
import { Svg, Rect, Line, Polyline, Text as SvgText, G } from '@react-pdf/renderer'
import { C } from './tema'

export function ColumnPdf({ data, width, height = 120, color = C.navy }: { data: { label: string; value: number }[]; width: number; height?: number; color?: string }) { /* eixo base + barras proporcionais + labels esparsos */ }
export function BarPdf({ data, width, height, color = C.navy }: { data: { label: string; value: number }[]; width: number; height?: number; color?: string }) { /* barras horizontais com rótulo + valor */ }
export function LinePdf({ labels, series, width, height = 140 }: { labels: string[]; series: { name: string; color: string; values: number[] }[]; width: number; height?: number }) { /* gridlines + polylines + legenda */ }
```
Regras: y-axis com 2-3 ticks; cor única por série; sem animação; fontes 7-8pt. Reaproveitar a matemática de escala dos charts atuais (`src/app/painel/charts.tsx`), trocando elementos HTML por primitivas Svg do react-pdf.

- [ ] **Step 2: tsc · Step 3: Commit** `feat(relatorio): graficos (barra/coluna/linha) em react-pdf Svg`.

---

## Task 5: Documento — capa, sumário, scorecard

**Files:** `src/lib/relatorio/Relatorio.tsx`

- [ ] **Step 1:** Criar o componente `Relatorio({ ctx })` onde `ctx` tem `{ m, ant, periodo, intervalo, redes, narrativa, mes, geradoEm }`. Páginas:
  - **Capa:** faixa navy com "Relatório de Operação", período por extenso (ex "Maio de 2026"), redes incluídas (ou "Todas as redes"), `geradoEm`, marca Benassi/Transmonseg.
  - **Sumário executivo:** os bullets de `narrativa.sumario` numa lista limpa.
  - **Scorecard:** grid de KPI cards (Taxa de entrega, Não foi, Cobertura GPS, Tempo total/rota/loja) cada um com valor + delta vs período anterior (▲/▼ + p.p.) + estado de cor (ok/warn/bad). Tabela "por rede" (rede · entregas · % entrega · tempo) com número à direita.
- [ ] **Step 2: tsc · Step 3: Commit** `feat(relatorio): capa, sumario executivo e scorecard`.

---

## Task 6: Documento — tendências, exceções, recomendações, apêndice

**Files:** `src/lib/relatorio/Relatorio.tsx`

- [ ] **Step 1:** Adicionar as páginas:
  - **Tendências:** `ColumnPdf` (entregas por dia) + `LinePdf` (evolução de tempos) + `ColumnPdf` (horário de saída), cada um com 1 linha de interpretação vinda das regras (pico, dia de maior volume).
  - **Exceções / onde agir:** tabela de lojas com mais problema (sem GPS / não foi) + `BarPdf` top rotas demoradas + `BarPdf` top tempo em loja.
  - **Recomendações:** `narrativa.recomendacoes` como blocos titulados.
  - **Apêndice:** tabela top motoristas + definições das métricas (tempo de rota = saída CD → chegada; tempo em loja = chegada → saída; etc.) em rodapé.
  - **Rodapé** em todas as páginas: "Transmonseg · Relatório gerado em {geradoEm} · página X de Y" (via `render` do react-pdf).
- [ ] **Step 2: tsc · Step 3: Commit** `feat(relatorio): tendencias, excecoes, recomendacoes e apendice`.

---

## Task 7: Rota /api/dashboard/relatorio

**Files:** `src/app/api/dashboard/relatorio/route.ts`

- [ ] **Step 1:** Route handler (runtime nodejs) que: autentica; lê `periodo`/`data`/`redes`; resolve intervalo atual (`intervaloPeriodo`) e anterior (`intervaloAnterior`); carrega entradas dos dois períodos (`carregarEntradasManuais`, já paginado), filtra por rede, roda `calcularMetricas` em ambos; monta `montarNarrativa`; `const buffer = await renderToBuffer(<Relatorio ctx={...} />)`; responde com `Content-Type: application/pdf` e `Content-Disposition: attachment; filename="relatorio-{periodo}-{intervalo}.pdf"`.
```ts
import { renderToBuffer } from '@react-pdf/renderer'
// ...resolve métricas atual + anterior, narrativa...
const buffer = await renderToBuffer(<Relatorio ctx={ctx} />)
return new NextResponse(buffer as unknown as BodyInit, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="relatorio-${periodo}.pdf"` } })
```
- [ ] **Step 2: build** (`npm run build`) — garante que react-pdf empacota no route handler. **Step 3: Commit** `feat(relatorio): rota /api/dashboard/relatorio gera o PDF`.

---

## Task 8: Botão na UI + validação final + merge

**Files:** `src/app/painel/dashboard/dashboard-client.tsx`

- [ ] **Step 1:** No header da Visão geral, adicionar botão **"Gerar relatório"** (ao lado do "Baixar PDF" atual, ou substituindo-o) que abre `/api/dashboard/relatorio?periodo=${periodo}&data=${data}&redes=${redes.join(',')}` numa nova aba. Incluir o `periodo='ano'` no seletor de período do dashboard (hoje é dia/semana/mês) e ajustar o input (ano → `type="number"`/select de ano).
- [ ] **Step 2:** `npx tsc --noEmit && npx vitest run && npm run build` — tudo verde.
- [ ] **Step 3:** Commit `feat(relatorio): botao Gerar relatorio + periodo anual no dashboard` e merge `--ff-only` pra main + push.

---

## Self-Review

| Requisito | Coberto em |
|-----------|-----------|
| PDF gerado (não print) | Task 1,5,6,7 (react-pdf renderToBuffer) |
| Períodos dia/semana/mês/ano | Task 2 (+ano) + Task 8 (UI) |
| Todos os dados + gráficos | Task 4 (charts) + 5/6 (seções) |
| "Explicando o que aconteceu" | Task 3 (narrativa por regras) |
| Comparação vs período anterior | Task 2 (intervaloAnterior) + 3/5 (deltas) |
| Zero-custo | react-pdf (sem browser) + narrativa sem IA |

**Riscos:** (1) react-pdf no bundle do route handler em Next 16 — mitigado por `serverExternalPackages` (Task 1). (2) Fonte: v1 usa Helvetica (built-in); registrar Geist fica pra fase 2. (3) Gráficos SVG do react-pdf não medem DOM — usar dimensões fixas (já previsto).

**Fases futuras (fora deste plano):** fonte Geist registrada; narrativa via IA (modelo free já existe em `analisador-ia.ts`); agendar envio mensal automático.
