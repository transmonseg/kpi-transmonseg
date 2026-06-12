# Dashboard API beta (acumula dia → mês) — Design

**Data:** 2026-06-12
**Status:** aprovado ("só faz"), pronto pro plano
**Escopo:** ADIÇÃO. Dashboard normal e suas tabelas NÃO são tocados.

## Ideia

Um dashboard beta que, em vez da Tia inserir os dados, **puxa cada dia da API**
(escala + alvos/NF + GPS, pipeline já construído) e **acumula** num armazém
próprio. A API só tem ~4 dias, mas o acúmulo constrói semana/mês/ano sozinho.

## Isolamento (requisito duro)

- **Armazém separado em Storage** (bucket `kpi-api-dash`, 1 JSON por dia) — NÃO
  usa `kpi_manual_entradas`. O dashboard normal nunca enxerga a beta. Sem DDL/
  migration (DDL é não-confiável neste projeto; Storage foi provado: create/
  upload/download/list OK).
- **Página separada** `/painel/dashboard/beta`, reusando o MESMO visual
  (`DashboardClient`) via um prop opcional `endpoint` cujo default preserva o
  comportamento atual — adição pura, não quebra o normal.

## Arquitetura

### Armazém (Storage)
- Bucket privado `kpi-api-dash`. Arquivo `{YYYY-MM-DD}.json` = array de linhas no
  formato `EntradaManual` (rede_id, data, loja, placa, motorista, status,
  saida_cd, chd, sai, volta_base). Regerar o dia faz upsert (sobrescreve).

### Fonte de dados (`src/lib/kpi/dashboard-api-fonte.ts`, novo)
- `statusRotaParaDashboard(StatusRota): StatusManual` — ENTREGUE/ENTREGUE_GEO →
  'entregue'; SEM_RASTREADOR → 'sem_rastreador'; resto → 'nao_foi'. (puro, testável)
- `rotaParaEntrada(rota, esc, status, data): EntradaManual` — mapeia campos +
  formata horários (saida_cd, chegada loja, saída loja, volta_base). (puro, testável)
- `salvarDiaApi(svc, data, entradas)` — upsert `{data}.json` no bucket.
- `carregarEntradasApi(svc, ini, fim): EntradaManual[]` — enumera as datas do
  intervalo, baixa cada `{data}.json` (ignora ausentes), concatena. Espelha
  `carregarEntradasManuais` mas lendo do Storage.
- `gerarDiaApi(svc, data, escalaLinhas): EntradaManual[]` — orquestra o pipeline
  (consolidaParadasApi → cruzaEscalaUnitrac → confirmaPorAlvo → derivarStatus →
  rotaParaEntrada), reusando as libs estáveis (matcher, consolida, alvos).

### Rota (`src/app/api/dashboard/beta/route.ts`, nova)
- **POST** `{ data, escalaPaths? }`:
  1. Escala do dia: lê `escala_linhas` daquele `data` (persistida pela geração de
     KPI). Se vazia E há `escalaPaths` → baixa de `escalas-raw` e parseia. Se as
     duas vazias → 400 "envie a escala do dia".
  2. `gerarDiaApi` → linhas → `salvarDiaApi`. Retorna resumo (qtd, entregues).
- **GET** `{ periodo, data(ref), redes }`: espelha `/api/dashboard` GET, mas usa
  `carregarEntradasApi`. Mesma agregação (`calcularMetricas`, `filtrar`,
  `intervaloPeriodo`/`intervaloAnterior`).

### UI
- `DashboardClient`: novo prop opcional `endpoint = '/api/dashboard'`. A linha de
  fetch passa a usar `${endpoint}?...`. Default = comportamento idêntico de hoje.
- Página nova `/painel/dashboard/beta`: painel "Puxar dia pela API" (data +
  upload opcional da escala + botão → POST) em cima, depois
  `<DashboardClient endpoint="/api/dashboard/beta" />`. Link de volta pro normal.
- Acesso: item novo no menu (`nav.tsx`, adição — igual ao item do KPI beta que já
  existe) "Dashboard (API beta)". A página normal do dashboard NÃO é tocada; o
  link de volta pro normal fica só na página beta.

## Mapeamento de status

| StatusRota (pipeline) | StatusManual (dashboard) |
|---|---|
| ENTREGUE, ENTREGUE_GEO | entregue |
| SEM_RASTREADOR | sem_rastreador |
| MUDOU_DE_ROTA, FORA_DE_BASE, NAO_SAIU_DA_BASE, NAO_FOI_AO_CLIENTE | nao_foi |

## Erro / borda
- Dia fora da janela da API (~4 dias) → o POST salva o que a API der (pode vir
  vazio); a UI avisa igual ao banner do KPI beta.
- API fora do ar → GET mostra o que já está salvo no bucket.
- Sem escala (nem stored nem upload) → 400 pedindo a escala.

## Testes
- Unit (puros): `statusRotaParaDashboard`, `rotaParaEntrada` (incl. formatação de
  horário e null-safety).
- Suíte existente segue verde (normal intocado).
- Validação manual: puxar um dia coberto (ex 2026-06-12) e conferir o painel.

## Não-objetivos (YAGNI)
- Não toca `kpi_manual_entradas`, `/api/dashboard`, nem o pipeline de produção.
- Não recalcula histórico além do que a API cobre; o histórico beta cresce por
  acúmulo diário.
- Sem persistência em tabela (Storage basta pro beta).
