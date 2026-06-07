# Redesign do Dashboard — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Quebrar a "Visão geral" (scroll gigante) em 3 sub-views (Resumo · Por rede · Detalhe) com header de filtros sticky e hero tiles com variação, e melhorar o relatório PDF — sem mexer no cálculo das métricas.

**Architecture:** O dashboard já é componentizado (`Conteudo` só orquestra sub-componentes nomeados: HeroTile, PorRede, TempoStrip, EvolucaoTempos, TopMotoristas, etc.). O redesign **regroupa** esses sub-componentes em 3 funções-view selecionadas por um segmented control, move os filtros pra um header sticky, garante o `delta` (variação) nos tiles, e enriquece `/api/dashboard/relatorio`. `dashboard-metricas` NÃO muda.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TS strict · Tailwind v4 · @react-pdf/renderer · vitest.

**Gates (é UI):** cada fase fecha com `npx tsc --noEmit -p tsconfig.json` (0), `npm run lint` (0 erros), `npm run build` (OK), e conferência visual local (`npm run dev`). Backend já coberto por `dashboard-metricas.test.ts`.

---

## FASE 1 — Layout: 3 sub-views + header sticky

### Task 1.1 — Estado da sub-view + segmented control
**Files:** Modify `src/app/painel/dashboard/dashboard-client.tsx`
- No `Conteudo` ({m,mAnt,mes,periodo,data}), adicionar estado: `const [view, setView] = useState<'resumo'|'rede'|'detalhe'>('resumo')`.
- Tipo `type SubView = 'resumo' | 'rede' | 'detalhe'`.
- Renderizar um **segmented control** no topo do `Conteudo` (mesmo estilo do seletor de período, linhas 168-178): 3 botões `Resumo · Por rede · Detalhe`.
- Gate: tsc 0.

### Task 1.2 — Extrair 3 funções-view e rotear pelo `view`
**Files:** Modify `src/app/painel/dashboard/dashboard-client.tsx`
- Criar `ResumoView`, `PorRedeView`, `DetalheView` (cada uma recebe `{m, mAnt, mes, periodo, data, lojaHref}`).
- Mover a renderização atual do `Conteudo` (linhas ~301-489) pra dentro delas, **regroupando** os sub-componentes já existentes:
  - **ResumoView:** hero tiles (`data-tour=resumo`) + barra de mix de status + `DonutRede` + "loja com mais problema"/`Top*` curto + `SerieChart` (entregas por dia).
  - **PorRedeView:** `PorRede` + `ComparativoRede` + `HeatmapDiaRede`.
  - **DetalheView:** `TempoStrip` + `EvolucaoTempos` + `DistribuicaoHoraria` + `DistribuicaoVolta` + `TopRotas` + `TopTempoLoja` + `TopMotoristas`.
- `Conteudo` passa a só renderizar: segmented control + `{view==='resumo' && <ResumoView .../>}` etc.
- **Não duplicar** sub-componentes — só mudar QUAL view os chama.
- Gate: tsc 0 · build OK · `npm run dev` → as 3 views trocam e mostram as seções certas.
- Commit: `feat(dashboard): 3 sub-views (resumo/por rede/detalhe)`.

### Task 1.3 — Header de filtros sticky
**Files:** Modify `src/app/painel/dashboard/dashboard-client.tsx` (componente `VisaoGeral`, filtros linhas 166-212)
- Envolver o bloco de filtros (período + input de data + chips de rede) num container `sticky top-0 z-20` com fundo `bg-[var(--color-bg)]/80 backdrop-blur` + leve borda/sombra inferior, padding vertical curto.
- Garantir que o segmented control (Task 1.1) fica logo abaixo, também acessível ao rolar (pode ficar dentro do sticky ou logo após).
- Gate: tsc 0 · build OK · dev: filtros não somem ao rolar.
- Commit: `feat(dashboard): header de filtros sticky`.

---

## FASE 2 — Hero tiles com variação + cor

### Task 2.1 — Garantir `delta` (variação vs período anterior) em todos os hero tiles
**Files:** Modify `src/app/painel/dashboard/dashboard-client.tsx`
- Conferir os hero tiles do `ResumoView`: cada `<HeroTile>` deve receber `delta={<Delta atual={m.X} anterior={mAnt?.X} .../>}` (o componente `Delta` já existe, linha 531; `HeroTile` já aceita `delta`).
- Tiles-alvo (5): taxa de entrega (`pctEntregue`, inverso=false), não foi (`nao_foi`, inverso=true), sem rastreador (`sem_rastreador`/`pctSemRastreador`, inverso=true), tempo médio loja (`tempoMedioLojaMin`, inverso=true, suf=' min'), tempo médio rota (`tempoMedioRotaMin`, inverso=true, suf=' min').
- Cor (`status` ok/warn/bad) por limiar simples (ex: pctEntregue ≥90 ok, ≥75 warn, senão bad) — usar as cores `COR` já definidas (linha 33).
- Gate: tsc 0 · build OK · dev: tiles mostram "▲/▼ X vs período anterior" + cor.
- Commit: `feat(dashboard): hero tiles com variação vs período anterior + cor`.

---

## FASE 3 — Relatório PDF executivo

### Task 3.1 — Enriquecer `/api/dashboard/relatorio`
**Files:** Modify `src/app/api/dashboard/relatorio/route.ts` (e o componente PDF que ele usa, ver imports)
- Estrutura nova do PDF (react-pdf, sem dependência externa):
  1. **Capa:** título "Relatório KPI", rede(s), período (intervalo), data de geração.
  2. **Resumo executivo (1 pág):** os 5 KPIs com valor + variação vs período anterior + cor.
  3. **Por rede:** tabela (rede · total · entregue · %entregue · sem rastreador · tempo médio).
  4. **Apêndice:** definições curtas das métricas (taxa de entrega, sem rastreador, tempo de rota/loja).
- Reusar `calcularMetricas`/`Metricas` (já disponível) — não recalcular nada novo.
- Gate: tsc 0 · build OK · abrir o relatório (`/api/dashboard/relatorio?...`) e conferir as 4 partes.
- Commit: `feat(dashboard): relatório PDF executivo (capa + resumo + por rede + apêndice)`.

---

## FASE 4 — Fechamento
- `npx vitest run` (todos verdes — backend intacto) · tsc 0 · lint 0 · build OK.
- Conferência visual final das 3 views + tiles + relatório.
- Push (deploy).
