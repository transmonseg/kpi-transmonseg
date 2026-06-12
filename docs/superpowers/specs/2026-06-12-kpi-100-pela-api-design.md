# KPI 100% pela API (beta) — Design

**Data:** 2026-06-12
**Status:** aprovado, pronto pra plano de implementação
**Escopo:** beta isolado. Produção (`/api/kpi/simples`) NUNCA é tocada.

## Problema

Quase toda falha do sistema nasce do parsing do PDF do Unitrac: OCR de placa,
formato "Cidade - UF", geofence concatenada por vírgula, fontes CID, relatório
parcial. O PDF é um export degradado dos mesmos dados que a API do Unitrac já
expõe estruturados.

Spike (12/06, `relatorio_10254.pdf`) provou que **os dados de entrega ESTÃO na
API**: a parada FUM-8748 das 05:51 em Niterói e a das 06:40 em Icaraí aparecem
cruas em `/mapa_servicos/stops/{cv}/{horas}`. O que faltava: a API reporta cada
entrega como **eventos GPS curtos e fragmentados** (ex: `tempoparada` de 1 min),
enquanto o PDF/parser **consolida** esses pontos numa entrega só (48 min). Por
isso o `buscarParadas` atual (filtro `>= 120s`) descartava as entregas.

## Objetivo

Gerar o KPI sem o PDF, puxando paradas direto da API, eliminando a classe de
bugs de parsing. Tudo no beta, validado contra o PDF antes de virar tela.

## Não-objetivos (YAGNI)

- Não toca `/api/kpi/simples` nem nenhum fluxo de produção.
- Não substitui o PDF na produção nesta entrega (só prova viabilidade no beta).
- Não reimplementa matcher/preview/status — reaproveita 100%.

## Arquitetura

### O coração: engine de consolidação

`src/lib/unitrac-api/consolida.ts` — função pura, sem I/O, testável isolada:

```
consolidaParadasApi(
  eventos: StopApiCru[],        // de /stops/{cv}/{horas}, SEM filtro de 120s
  pontos: MapaPontos,           // geofences autoritativas (buscarPontos)
  data: string,                 // 'YYYY-MM-DD' alvo — filtra a janela do dia
  baseCoord: { lat; lng },      // base Benassi p/ classificar BASE
  placaNorm: string,
): UnitracParadaRow[]
```

Algoritmo:
1. **Filtra pela data alvo** (janela do dia em BRT; a API devolve "últimas N horas").
2. **Clusteriza** eventos consecutivos por proximidade (≤ ~raio/100m do âncora) e
   contiguidade temporal numa "permanência":
   - `chegada` = horário do 1º evento do cluster
   - `saida` = inferida: horário do 1º evento do PRÓXIMO cluster em outro local
     (o caminhão só "saiu" quando apareceu noutro lugar) — espelha o que o PDF faz.
     Fallback: último evento do cluster + sua duração.
3. **Resolve geofence** de cada cluster via `acharLojaPorCoordenada` → `codigo_loja`
   + `nome_loja` autoritativos. Sem geofence → sem código.
4. **Classifica**: `BASE` (dentro do raio da base Benassi), `LOJA` (dentro de
   geofence de loja), `FORA_BASE` (parou, sem geofence).
5. Emite `UnitracParadaRow[]` — **mesma shape que o parser do PDF produz**.

Consequência: matcher, preview, derivarStatus, confirmação via API (PR #45),
anomalias — **tudo reaproveitado, zero duplicação de lógica**.

### Risco nº1: inferência de saída

No FUM, a permanência de 48 min em Niterói tinha 1 evento só na API. A saída
(06:39) precisa ser inferida do próximo cluster (Icaraí, 06:40). Se a inferência
de saída não reproduzir o PDF dentro da tolerância, a ideia não fecha. **Por isso
a Fase 1 é dedicada a provar exatamente isso antes de qualquer tela.**

## Fases

### Fase 1 — make-or-break (engine + prova)
- `consolida.ts` com TDD: clustering, inferência de saída, resolução de geofence,
  detecção de BASE, multi-viagem (manhã + noite), dia sem entrega.
- Comparador (script dev, não-produção): roda API-consolidada vs PDF lado a lado
  num dia real e mede as métricas de sucesso abaixo.
- **Gate:** só passa pra Fase 2 se o critério de sucesso for atingido.

### Fase 2 — toggle no beta (só se Fase 1 passar)
- `/api/kpi/beta`: parâmetro `fonte: 'pdf' | 'api'`. Quando `'api'`, monta
  `paradaRows` via `consolidaParadasApi` em vez de parsear o PDF. Resto idêntico.
- `/painel/kpi/beta`: toggle "Fonte: PDF | API". Sem mudança de fluxo.

## Critério de sucesso (definido ANTES de prosseguir)

A consolidação da API deve, contra o PDF do mesmo dia:
- Reproduzir **≥ 95% das entregas** (paradas LOJA/FORA_BASE que viram entrega).
- Horário de chegada dentro de **±5 min**.
- **Identidade de loja correta** (mesma geofence/código) onde o PDF tem código.

Medido pelo comparador sobre ≥ 1 dia real completo (não só os 3 veículos).

## Componentes e isolamento

| Componente | Arquivo | Responsabilidade | Depende de |
|---|---|---|---|
| Engine consolidação | `src/lib/unitrac-api/consolida.ts` | eventos crus → `UnitracParadaRow[]` | pontos.ts, geo |
| Testes engine | `src/lib/unitrac-api/consolida.test.ts` | TDD da engine | — |
| Comparador | script dev temporário | API vs PDF, métricas | engine + parser PDF |
| Toggle rota | `src/app/api/kpi/beta/route.ts` | param `fonte` | engine |
| Toggle tela | `src/app/painel/kpi/beta/page.tsx` | botão Fonte | — |

## Testes

- `consolida.ts`: unit tests com fixtures sintéticos + derivados de dados reais
  (clustering, saída por próximo-cluster, BASE, multi-viagem, dia vazio).
- Comparador: validação ponta a ponta contra dias reais (gate da Fase 1).
- Suíte existente segue verde (produção intocada).
