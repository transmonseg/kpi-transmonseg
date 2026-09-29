# Recuperar pendentes com prova forte — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Confirmar como ENTREGUE as poucas NFs pendentes que têm prova forte (parada compartilhada provada, parada curta de outro endereço com parada própria, parada fundida pela API da Unitrac), sem criar falso positivo. Ganho estimado +0,3 a +0,5 pp/dia.

**Architecture:** Só `src/lib/kpi-romaneio/agregacao.ts` (bloco do `modoPrecisao`/R2, opt-in Nutry Max) e testes. Rio Quality intacto. Nada de mudança de layout.

**Tech Stack:** TypeScript, Vitest, Python (trava).

**Spec:** `~/ClaudeGerado/kpi-regen-0922/estudo-melhorias-26-09.md` (seções 5 e 6) — ranking 1, 2 e 3; relatório Unitrac oficial de 26/09 (`/private/tmp/claude-501/-Users-joaquimsalles/43f3d9c2-79a4-4525-b647-10dd95cc3a2d/scratchpad/erica28/3EB0A3293FA15365AB3561_relatorio_53565.xlsx`).

## Global Constraints

- Zero falso positivo novo na trava (`scripts/verificar-kpi-gabaritos.py` nos dias 22/23/24/25 + 26 quando disponível) e no gabarito de 26/09 do estudo.
- STATUS de NF confirmada começa com `ENTREGUE`; resumo "NF CONFIRMADAS" == linhas ENTREGUE == numerador da TAXA (teste de consistência já existe).
- Fuso: convenção existente. Rio Quality idêntico. Layout do xlsx inalterado.
- Não usar raio >300 m sem parada longa, nem "mesma rua" (FP comprovado no estudo).

## Review Focus

- Parada compartilhada na Ilha Grande (RBG2D21 2389318, equipe: "não foi") — continua REVISAR (Task 1 testa).
- RQV3J99 2393491 (parada 10 min a 9 m) e RQU8D91 2383464 viram ENTREGUE (Task 1 testa com fixture).
- RQQ5B81 2386225 (parada curta a 4,2 km, equipe "não esteve") — continua não confirmada (Task 2 testa).
- TOS5E38 2393419 (parada fundida, centro a ~310 m do cadastro, ≥8 min) vira ENTREGUE (Task 3 testa).
- Parada de 2 min a 280 m que é de outro cliente próximo — não confirma (Task 3 testa).

---

### Task 1: Parada compartilhada com prova forte → ENTREGUE

**Files:** Modify `src/lib/kpi-romaneio/agregacao.ts` (ramo que produz `PARADA COMPARTILHADA - REVISAR` / `viaVizinhanca` sob `modoPrecisao`); Test `agregacao.test.ts`.

- [ ] Testes que falham: NF com `viaVizinhanca` (horário emprestado de vizinho) E (a) alvo Unitrac da NF com situação 1 (feito) → STATUS `ENTREGUE`; (b) parada da própria placa (crua Unitrac ou da ponte) com ≥3 min a ≤100 m do geocode confiável ou do cadastro Unitrac → `ENTREGUE` com horário DESSA parada; (c) sem nenhuma das duas → continua `PARADA COMPARTILHADA - REVISAR`; (d) opção desligada → nada muda.
- [ ] Implementar reaproveitando `acharParadaUnitracPropria`/paradas cruas já disponíveis. Constante `DURACAO_MIN_COMPARTILHADA_PROVADA_MIN = 3`, `RAIO_COMPARTILHADA_PROVADA_M = 100`.
- [ ] `npx vitest run` verde. Commit `feat(kpi): parada compartilhada com prova forte vira entregue`.

### Task 2: "Parada curta de outro endereço" com parada própria → ENTREGUE

**Files:** Modify `agregacao.ts` (onde `perdeuParadaCompartilhada` define `PARADA CURTA DE OUTRO ENDEREÇO - NÃO CONFIRMA ESTE CLIENTE - CONFERIR`); Test.

- [ ] Testes que falham: NF rebaixada por parada curta de outro endereço MAS com outra parada da própria placa ≥3 min a ≤300 m do cadastro Unitrac (ou do geocode confiável), que não esteja mais perto (≤150 m) de outro cliente da placa → `ENTREGUE` com o horário dessa parada. Sem essa parada → continua rebaixada. Caso RQQ5B81 2386225 (nenhuma parada própria perto) → continua não confirmada.
- [ ] Implementar. Constante `DURACAO_MIN_OUTRO_ENDERECO_PROVADO_MIN = 3`. `npx vitest run` verde. Commit `feat(kpi): parada curta de outro endereco com parada propria perto vira entregue`.

### Task 3: R2 tolera parada fundida pela API da Unitrac

**Files:** Modify `agregacao.ts` (`acharParadaUnitracPropria` e chamadores); Test.

- [ ] Testes que falham: (a) parada Unitrac da própria placa com ≥8 min e centro a 301–350 m do cadastro, sem outro cliente da placa a ≤150 m → `ENTREGUE`; (b) mesma parada com 5 min a 320 m → não confirma; (c) parada da PONTE (paradas derivadas do GPS contínuo, já separadas) a ≤100 m com ≥2 min conta como candidata da R2 quando a parada crua da Unitrac fundiu duas paradas; (d) parada de 2 min a 280 m que está a ≤150 m de outro cliente → não confirma.
- [ ] Implementar. Constantes `RAIO_PARADA_FUNDIDA_M = 350`, `DURACAO_MIN_PARADA_FUNDIDA_MIN = 8`. `npx vitest run` verde. Commit `feat(kpi): R2 tolera parada fundida da Unitrac e usa paradas da ponte`.

### Task 4: Medição, trava e deploy (com OK do usuário)

- [ ] Gerar 22/23/24/25/26 numa cópia fora de produção (PDFs 22–25 em `/tmp/kd/` no servidor; 26 no storage `nutrimax/2026-09-26/`, geração mais recente em `kpi_romaneio_geracoes`). Rodar a trava com os 5 dias (acrescentar 26 via `--dia`); medir contra o gabarito de 26/09 do estudo (NF confirmada sem prova contradita = FP). Critérios: trava 0; FP 0; taxa ≥ a de hoje em todos os dias (22:95,3 23:93,2 24:94,7 25:95,1 26:96,6).
- [ ] Revisão final. Pedir OK. Deploy (push definitivo + TEMP, pull/build/restart, HTTP 200).
