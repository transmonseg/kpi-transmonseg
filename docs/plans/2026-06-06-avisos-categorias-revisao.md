# Avisos e Categorias de Revisão — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Classificar cada motivo de revisão do KPI numa categoria + natureza e surfaceá-la em 3 formas (motivo por linha, selo por natureza, painel-resumo de pendências), pra distinguir "dado faltando" de "erro real".

**Architecture:** `derivarStatus` (puro) passa a emitir `categoria`+`natureza`; o `route.ts` computa 3 flags novas usando helpers puros exportados do matcher (`resolverLojaEsperada`, `lojaNomeDivergeDaEscala`); a UI mostra selo por natureza + painel. Não altera decisões de match.

**Tech Stack:** Next.js 16 / React 19 / TS strict / vitest.

---

### Task 1: Tipos + categorias em status-rota.ts (TDD)

**Files:** Modify `src/lib/kpi/status-rota.ts`; Test `src/lib/kpi/status-rota.test.ts`

1. Teste: `LOJA_SEM_CADASTRO` → status `SEM_RASTREADOR`/`NAO_FOI_AO_CLIENTE`, `categoria='LOJA_SEM_CADASTRO'`, `natureza='dado'`, motivo cita "sem cadastro no Unitrac".
2. Teste: `LOJA_AMBIGUA` → `categoria='LOJA_AMBIGUA'`, `natureza='dado'`, motivo cita a outra loja.
3. Teste: `ENTREGOU_FORA_ESCALA` → `categoria='ENTREGOU_FORA_ESCALA'`, `natureza='operacao'`, motivo cita a loja real.
4. Rodar → falham.
5. Implementar: tipos `CategoriaRevisao`, `NaturezaRevisao`; campos em `DadosStatusRota` (`lojaSemCadastroUnitrac?`, `lojaAmbiguaComGemea?: {outra:string}|null`, `entregouLojaForaEscala?: {lojaReal:string}|null`); `categoria`+`natureza` em `ResultadoStatus`; branches no topo de `derivarStatus` (prioridade alta); mapas `CATEGORIA_LABEL`, `CATEGORIA_NATUREZA`, `NATUREZA_STYLE`. Todas as saídas existentes ganham `categoria:null, natureza:null` (ou natureza derivada do status).
6. Rodar → passam. Commit.

### Task 2: Helpers puros exportados do matcher

**Files:** Modify `src/lib/kpi/matcher.ts`; Test `src/lib/kpi/matcher.test.ts`

1. Refatorar o closure `melhorLojaEscalada(linha)` → `export function resolverLojaEsperada(linha, lojas): LojaRow|null` (mesmo corpo, `lojas` vira parâmetro). Closure interno chama o export.
2. Adicionar `export function lojaNomeDivergeDaEscala(nomeEscala, loja): boolean` = `min(matchScore(nome,loja.nome), matchScore(nome,loja.nome_unitrac??Inf)) > 4`.
3. Teste: `resolverLojaEsperada` resolve "Prezunic SPID - Carioca" → Estação Carioca (reusa fixture). `lojaNomeDivergeDaEscala('Prezunic SPID - Freguesia', VistaAlegre)===true`.
4. Rodar suíte matcher → verde (refactor sem mudança de comportamento). Commit.

### Task 3: route.ts computa flags + repassa

**Files:** Modify `src/app/api/kpi/simples/route.ts`

1. Antes do `derivarStatus`, resolver `esperada = resolverLojaEsperada(escLinhaRow, lojasParaMatcher)`.
2. `lojaSemCadastroUnitrac = !esperada || esperada.codigo_unitrac==null || esperada.lat==null || esperada.lng==null` (só quando linha sem parada).
3. `lojaAmbiguaComGemea`: se esperada tem coord, achar outra loja (fungível, ≠esperada, coord) a ≤120m → `{outra: nome}`.
4. `entregouLojaForaEscala`: se rota tem parada LOJA com loja_id, e `lojaNomeDivergeDaEscala(esc.loja_nome_raw, lojaById[loja_id])` → `{lojaReal: nome}`.
5. Passar as 3 flags pro `derivarStatus`. Acrescentar `categoria: statusInfo.categoria`, `natureza: statusInfo.natureza` no objeto retornado da linha (preview).
6. `tsc` verde. Commit.

### Task 4: UI — selo por natureza + painel-resumo

**Files:** Modify `src/app/painel/kpi/simples/page.tsx`

1. No tipo da linha do preview, aceitar `categoria?`, `natureza?`.
2. Selo: ao lado do status, quando `natureza`, renderizar chip com cor de `NATUREZA_STYLE` + label da categoria.
3. Painel "Pendências" no topo da seção da rede: agrupar linhas `revisar` por categoria, mostrar contagem (ex: "🟣 2 sem cadastro · 🟠 1 ambígua · 🔵 1 fora da escala"). Esconder se zero.
4. Rodar local, conferir visual. Commit.

### Task 5: Validação final

1. `npx vitest run` → todos verdes (inclui novos).
2. `npx tsc --noEmit -p tsconfig.json` → 0.
3. `npm run build` → OK.
4. Commit final se algo pendente.
