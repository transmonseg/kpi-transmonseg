# Evolução da Loja + Comparação + Fechar por Rede — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps em checkbox.

**Goal:** 3 features no dashboard/KPI: (A) comparação vs período anterior no scorecard, (B) página de evolução por loja, (C) fechar (carimbar) revisão por rede/dia.

**Decisões do dono (2026-05-30):** evolução = página dedicada com URL; fechar = só carimba (quem/quando, sem travar); granularidade = por rede.

**Tech:** Next.js 16, React 19, Supabase, Tailwind v4, charts em `src/app/painel/charts.tsx`, `calcularMetricas`, `intervaloPeriodo`/`intervaloAnterior` (já existem).

---

## PARTE A — Comparação vs período anterior

**Arquivos:** `src/app/api/dashboard/route.ts`, `src/app/painel/dashboard/dashboard-client.tsx`

- [ ] **A1:** Em `/api/dashboard/route.ts`, além das métricas do período atual, carregar o período anterior (`intervaloAnterior(periodo, ref)` — já existe), filtrar por rede, `calcularMetricas` e retornar como `metricasAnterior` (null se o anterior não tiver linhas). Responder `{ ...atual, metricasAnterior }`.
- [ ] **A2:** No `dashboard-client.tsx`, receber `metricasAnterior` no fetch; passar pro `Conteudo`. Na CAMADA 1, abaixo de cada KPI (taxa de entrega, não foi, cobertura GPS, e os tempos no TempoStrip), mostrar um delta discreto: `▲/▼ X p.p. vs período anterior` (verde se melhora, vermelho se piora — atenção ao sentido: pra "não foi" e "sem rastreador", subir é RUIM). Criar um helper `Delta({ atual, anterior, inverso? })` que renderiza ▲/▼ + valor + cor. Quando `metricasAnterior` é null, mostrar "sem comparação" discreto.
- [ ] **A3:** tsc + build + commit `feat(dashboard): comparacao vs periodo anterior no scorecard`.

---

## PARTE B — Página de evolução por loja

**Arquivos:** `src/app/api/dashboard/loja/route.ts` (criar), `src/app/painel/loja/page.tsx` (criar), `src/app/painel/loja/loja-client.tsx` (criar), `src/app/painel/dashboard/dashboard-client.tsx` (links).

- [ ] **B1: API** `/api/dashboard/loja/route.ts` (runtime nodejs): autentica; lê `rede`, `loja`, `periodo` (default 'mes'), `data`. Carrega `kpi_manual_entradas` filtrado por `rede_id=rede AND loja=loja` no intervalo (paginar via `.range` se necessário; uma loja num mês raramente passa de 1000, mas paginar por segurança). Agrupa por `data`: `{ data, total, entregue, nao_foi, sem_rast, tempo_rota, tempo_loja, tempo_total }` (tempos = média dos entregues do dia, usando o mesmo `diffMin` de dashboard-metricas). Retorna `{ rede, loja, intervalo, resumo: {total, pctEntregue, sem_rast, tempoMedioRota/Loja/Total}, serie: [...] }`.
- [ ] **B2: Página** `src/app/painel/loja/page.tsx` (server): lê searchParams `rede`/`loja`/`periodo`/`data`; renderiza `LojaClient` com esses params (o fetch dos dados é no client, igual o dashboard). Auth vem do layout do /painel.
- [ ] **B3: Client** `loja-client.tsx`: header com nome da loja + rede (badge) + link "voltar ao dashboard"; filtro de período (reusar o padrão dia/semana/mês/ano + input adaptativo do dashboard); cards de resumo (entregas, taxa, sem GPS, tempo total); gráficos de evolução com `LineChart`/`ColumnChart` de `@/app/painel/charts` (entregas por dia, taxa de entrega %, tempos rota/loja/total); tabela dos dias. Estados loading/vazio/erro. Seguir o design system (cards `var(--color-*)`, text-overline, animate-fade-up). Sem emoji.
- [ ] **B4: Links** no `dashboard-client.tsx`: nas tabelas (lojas com problema, TopRotas, TopTempoLoja) e no `BarList`, o nome da loja vira `<Link href={\`/painel/loja?rede=${rede}&loja=${encodeURIComponent(loja)}&periodo=${periodo}&data=${data}\`}>` com hover de accent. (No BarList, adicionar uma prop opcional `hrefDe?: (item) => string` pra não quebrar os outros usos.)
- [ ] **B5:** tsc + build + commit `feat(loja): pagina de evolucao por loja + links no dashboard`.

---

## PARTE C — Fechar (carimbar) por rede

**Arquivos:** `supabase/migrations/2026..._kpi_fechamentos.sql` (criar+aplicar), `src/app/api/kpi-manual/fechar/route.ts` (criar), `src/app/painel/dashboard/inserir-manual.tsx` (UI).

- [ ] **C1: Migration** `kpi_fechamentos`:
```sql
create table if not exists public.kpi_fechamentos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  rede_id text not null,
  fechado_por uuid,
  fechado_por_nome text,
  fechado_em timestamptz not null default now(),
  observacao text,
  unique (data, rede_id)
);
alter table public.kpi_fechamentos enable row level security;
create policy "fechamento_read" on public.kpi_fechamentos for select to authenticated using (true);
```
Aplicar via Supabase MCP apply_migration (projeto luhwpsckvbctxynifryk). Escrita só pelo service client das rotas.

- [ ] **C2: API** `/api/kpi-manual/fechar/route.ts`:
  - `POST` {data, rede_id} → autentica; service client faz `upsert` em kpi_fechamentos com `fechado_por = user.id`, `fechado_por_nome = user.email`, `fechado_em = now()` (onConflict data,rede_id). Retorna o registro.
  - `DELETE` ?data=&rede_id= → reabrir (delete). 
  - `GET` ?data= → lista os fechamentos daquela data ({ rede_id, fechado_por_nome, fechado_em }).
- [ ] **C3: UI** em `inserir-manual.tsx`: no `useEffect` que carrega o estado por data, também buscar `/api/kpi-manual/fechar?data=`; cada card de rede ganha um indicador de fechamento: se fechado → badge "✓ Fechado · {nome} · {DD/MM}" + botão "Reabrir"; se aberto → botão "Fechar" (chama POST). Funciona no modo dia (a granularidade é data+rede). Botão "Fechar" com cor de sucesso, "Reabrir" discreto.
- [ ] **C4:** tsc + build + commit `feat(kpi): fechar/carimbar revisao por rede e dia`.

---

## Final
- [ ] Rodar `npx tsc --noEmit && npx vitest run && npm run build` — tudo verde.
- [ ] Merge `--ff-only` pra main + push.

## Self-Review
| Requisito | Onde |
|---|---|
| Comparação vs período anterior | Parte A (reusa intervaloAnterior) |
| Evolução da loja (página dedicada, URL) | Parte B |
| Fechar por rede, só carimba | Parte C (kpi_fechamentos) |
| Sem IA, sem notificação | nada disso entra |
