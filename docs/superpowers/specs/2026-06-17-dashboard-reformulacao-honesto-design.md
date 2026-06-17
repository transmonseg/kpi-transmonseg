# Dashboard normal — reformulação honesta (sem falsa informação) — Design

**Data:** 2026-06-17
**Origem:** risco de falsa informação no dashboard normal, confirmado no código + pesquisa de boas práticas (`~/pesquisas/pesquisa-dashboard-entregas-honesto-2026-06-17.md`).

## Problema

O dashboard normal (`/painel/dashboard`) reconstrói o status relendo o TEXTO do XLSX
(`parse-kpi-manual.ts`) e colapsa tudo em 3 baldes (entregue/nao_foi/sem_rastreador).
Vetores de falsa informação confirmados:
1. **Linha descartada em silêncio:** legenda não reconhecida → `else continue` → o caminhão some → total subestimado → `pctEntregue` infla (o "filtro silencioso" que a HBR descreve).
2. **Colapso mentiroso:** "EM ROTA" virava "NÃO FOI" (inflava falha); "DESATUALIZADO" cai como "sem rastreador".
3. **Dupla contagem / dado velho:** subir o mesmo dia 2x (manhã parcial + tarde) soma, e o parcial polui o acumulado mensal.

## Decisões (validadas com o fundador)

- **Fonte:** mantém o UPLOAD do XLSX; conserta o parser (não troca o motor pra ler da geração).
- **Categorias:** 6 ricas — Entregue, Em rota, Não foi, Mudou de rota, Desatualizado, Sem rastreador.
- **Taxa:** definitiva = Entregue / (Entregue + Não foi). As outras 4 categorias FORA do denominador.
- **Re-upload do dia:** substitui o anterior (idempotente por data), com carimbo "atualizado às HH:MM" e selo provisório (tem em rota) / final.
- **Garantia anti-mentira:** nenhuma linha é descartada; o que não casar vira "indefinido" VISÍVEL. Dado faltante nunca é somado como zero.

## Mapa legenda → categoria (parser)

| Legenda no XLSX (do KPI) | Categoria StatusManual |
|---|---|
| ENTREGUE / ENTREGUE (GEO) / chegada na loja preenchida | `entregue` |
| EM ROTA / AGUARDANDO BASE | `em_rota` |
| NÃO FOI AO CLIENTE / NÃO SAIU DA BASE | `nao_foi` |
| MUDOU DE ROTA (- CONFERIR) | `mudou_de_rota` |
| DESATUALIZADO | `desatualizado` |
| SEM RASTREADOR | `sem_rastreador` |
| nenhuma das acima | `indefinido` (visível, nunca descartado) |

Ordem de teste das regex importa: checar "NÃO SAIU" e "EM ROTA"/"AGUARDANDO" antes do
genérico; "DESATUALIZADO" antes de "SEM RASTREAD"; chegada preenchida = entregue só se
nenhuma legenda de exceção casar.

## Métricas (duas taxas, não uma)

- **Taxa de entrega (definitiva)** = `entregue / (entregue + nao_foi)`. Denominador só
  com desfecho DEFINITIVO. em_rota, mudou_de_rota, desatualizado, sem_rastreador ficam
  FORA (senão a taxa mente nos dois sentidos).
- **Andamento do dia** = `em_rota / total` (quanto ainda está rodando) e
  `resolvido = (entregue + nao_foi + mudou_de_rota) / total`.
- **Qualidade de rastreamento** = contagem de sem_rastreador (sem equipamento) vs
  desatualizado (tem, precisa manutenção) — separadas, NUNCA somadas na taxa.
- Métricas de tempo (rota/loja/operação), rankings, heatmap: recalculados sobre
  `entregue` (mesma base de hoje), agora com a contagem correta de total.

## Re-upload / provisório-final (regra pura)

- Chave de substituição: `data` (um dia = um conjunto). Re-upload do mesmo dia
  remove o anterior e grava o novo (idempotente). Evita dupla contagem.
- `provisorio = entradas.some(status === 'em_rota')` → selo "Provisório" (âmbar);
  senão "Final". Guardar `atualizado_em` (timestamp do upload) pra o "as of".

## Componentes (unidades isoladas, TDD)

1. **`parse-kpi-manual.ts`** — `StatusManual` expandido (7 valores incl. `indefinido`);
   classificação por regex sem `continue`. Puro. Testes cobrindo cada legenda + a
   garantia de não-descarte.
2. **`dashboard-metricas.ts`** — `calcularMetricas` com as 2 taxas + 6 categorias +
   `indefinido`; `Metricas` ganha `em_rota`, `mudou_de_rota`, `desatualizado`,
   `indefinido`, `taxaEntregaDefinitiva`, `andamento`. Puro. Testes das fórmulas.
3. **Regra de substituição/provisório** — função pura `resumoDia(entradas)` →
   `{ provisorio, atualizado_em }`. Testada. O storage/route usa.
4. **UI `dashboard-client.tsx`** — 6 categorias com cores (verde ok / âmbar
   conferir+manutenção / vermelho não foi / cinza sem dado / azul em rota), as 2 taxas,
   selo provisório/final + "atualizado às HH:MM". Cor sempre com rótulo.

## Onde aparece / compatibilidade

- O dashboard API beta (`dashboard-api-fonte.ts`) já produz status rico; alinhar o
  `StatusManual` pra os dois falarem a mesma língua (a beta mapeia o status do
  `derivarStatus` direto, sem texto).
- XLSX antigo/editado: degrada com elegância (cai em `entregue` por chegada ou
  `indefinido`), nunca mente nem descarta.

## Critérios de aceite

- Subir um XLSX com "EM ROTA"/"DESATUALIZADO"/"MUDOU DE ROTA": as linhas aparecem nas
  categorias certas, **nenhuma some**; total = nº de linhas do XLSX.
- Taxa de entrega = entregue/(entregue+não foi); em rota não infla falha nem o total.
- Sem rastreador e desatualizado contados separados.
- Subir o mesmo dia 2x: o 2º substitui o 1º (sem dobrar); selo provisório→final.
- Linha com legenda desconhecida: vira "indefinido" visível, não descartada.

## Fora de escopo (YAGNI)

- Trocar a fonte pra ler direto da geração (decidido: mantém upload).
- Reconciliação automática via API no dashboard normal (a beta já puxa da API).
- Redesenho visual completo — só as mudanças que servem à honestidade dos números.
