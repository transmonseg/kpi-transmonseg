# Precisão acima de cobertura + rodízio de carga — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar a especificação técnica da Ana (26/09): nada vira ENTREGUE só por proximidade fraca (300–800 m, parada curta, parada compartilhada viram REVISAR), rodízio de carga inteira vira "ROTA EXECUTADA POR OUTRA PLACA", e cada NF traz motivo em texto e nível de confiança.

**Architecture:** KPI (`src/lib/kpi-romaneio/agregacao.ts`, `gerador-xlsx.ts`, route nutrimax + CLI). Regras opt-in só Nutry Max (padrão das opções de `montarDetalheEntregas`). Rio Quality intacto.

**Tech Stack:** TypeScript, Vitest, Python (trava).

**Spec:** Mensagens da Ana em 26/09 (DM, 07:47 "Relatório de performance 25/09" e 07:55 "Especificação técnica – evolução da KPI", itens 2, 6, 7, 8, 9, 11, 14, 15, 19, 27, 29; áudios: "tem um carro 1H… no romaneio era para ir para umas notas e foi para outra… se não mudar isso não vai conseguir identificar"); análise do rodízio `~/ClaudeGerado/kpi-regen-0922/analise-escala-25-09.md`; planilha da equipe `~/ClaudeGerado/kpi-regen-0922/grupo/3EB0AA52447EE89BCBE007_Ocorrencias KPI 25-09.xlsx`.

## Global Constraints

- Meta da Ana: precisão >95% no que o KPI chama de entregue; "90% de cobertura com 99% de precisão é melhor que 98% com falsos positivos". Nenhuma regra nova pode aumentar falso positivo na trava.
- Carro que parou perto por acaso NUNCA confirma NF de outra placa. Só rodízio de carga inteira (Task 2).
- Fuso: convenção existente. Rio Quality idêntico.
- Trava obrigatória: `python3 scripts/verificar-kpi-gabaritos.py` nos dias 22/23/24/25 sai 0; gabarito da Ana 22/09 ≤2 min ≥988, ≤10 min ≥1104, sem horário ≤29.

## Review Focus

- NF que a equipe marcou "não esteve no local" e o KPI chamava de ENTREGUE por 500–800 m, parada curta ou compartilhada (25/09: 2390611, 2390481, 2390539; 24/09: RBG2D21 2389318, TTH3C94 2388733, RBG5G18 2388403) → não pode sair ENTREGUE (Task 1 testa / trava).
- NF entregue de verdade com parada longa a ≤100 m → continua ENTREGUE (Task 1 testa).
- Carga de Campos em rodízio (25/09: 98669 RQU2G47→TOS1H26, 98673 RBJ2J67→RQU2G47, 98678 TOS1H26→RBJ2J67) → ROTA EXECUTADA POR OUTRA PLACA, e carro que só passou perto de 1 cliente de outra carga → nada (Task 2 testa).
- Taxa do resumo conta só ENTREGA CONFIRMADA; REVISAR/PROVÁVEL aparecem separados (Task 1/3 testa).
- Motivo em texto sempre coerente com o status (Task 3 testa).

---

### Task 0: Casos de 25/09 na trava

**Files:** Modify `scripts/gabaritos/casos-rotulados.csv` (e exceções, se necessário).

- [ ] Acrescentar a aba "Ocorrências 25-09" da planilha (RESOLUÇÃO "Entregue…" → entregue; "Não esteve…"/"Não foi…" → nao_entregue). Rodar a trava contra os xlsx de produção atuais (`~/ClaudeGerado/kpi-regen-0922/pos-deploy-26/{22,23,24,25p}.xlsx` — o 25 é `25p.xlsx`, aceite no script um 4º dia ou rode separado) e registrar como exceção conhecida (desde=2026-09-26) só os falsos positivos que ESTA rodada vai corrigir, para a trava passar a exigir a correção na Task 1 (remover da exceção quando a Task 1 corrigir). Commit `test(kpi): casos da equipe de 25/09 na trava`.

### Task 1: Proximidade fraca vira REVISAR (não ENTREGUE)

**Files:** Modify `src/lib/kpi-romaneio/agregacao.ts`, `src/lib/kpi-romaneio/gerador-xlsx.ts`; Test `agregacao.test.ts`, `gerador-xlsx.test.ts`.

- [ ] Com a opção `modoPrecisao` (opt-in Nutry Max), os rótulos passam a:
  - `ENTREGUE - PARADA PRÓXIMA (500-800m) MAS DENTRO DA ROTA - CONFERIR` → status `pendente`, observação `PARADA PRÓXIMA (300-800m) - REVISAR`;
  - visita da ponte / R2 com `distParadaM` > 300 m (hoje sai ENTREGUE limpo) → `PARADA PRÓXIMA (300-800m) - REVISAR`;
  - `ENTREGUE - PARADA CURTA (ATÉ 3MIN) CONFIRMOU VÁRIOS ENDEREÇOS DIFERENTES AO MESMO TEMPO - CONFERIR` → `PARADA CURTA - REVISAR`;
  - `ENTREGUE - PARADA COMPARTILHADA COM ENTREGA PRÓXIMA (horário aproximado)` → `PARADA COMPARTILHADA - REVISAR`;
  - R2 (parada Unitrac da própria placa): confirma só se ≤100 m com ≥2 min, ou 100–300 m com ≥5 min; senão `PARADA PRÓXIMA (100-300m) - REVISAR`.
  - Horário (chegada/saída) continua preenchido nos REVISAR (é informação útil), mas não contam como entregue.
- [ ] Taxa do resumo (gerador-xlsx): `TAXA DE CONFIRMAÇÃO` = só ENTREGUE confirmado ÷ base (sem sem-rastreador/aguardando); nova linha `REVISAR: N` (soma dos rótulos REVISAR). Testes por rótulo e da taxa.
- [ ] Medir antes/depois nos xlsx de 22–25 regerados numa cópia (padrão das rodadas anteriores): falsos positivos da trava que somem, entregas da equipe que viram REVISAR (reportar — são o custo), resolução automática. Remover da lista de exceções da trava os casos corrigidos. Commit `feat(kpi): proximidade fraca vira revisar (modo precisao)`.

### Task 2: Rodízio de carga inteira

**Files:** Modify `agregacao.ts`, `gerador-xlsx.ts`; Test `agregacao.test.ts`.

- [ ] Sobre a detecção de escala divergente (79351d8/ea8be61/dec208c), com opção `reconhecerRodizio` (opt-in Nutry Max): se, na carga divergente, UM único outro veículo da frota tem parada ≥2 min a ≤300 m de ≥80% dos clientes da carga, a carga é "rodízio" desse veículo X. Para cada NF da carga com parada de X ≥2 min a ≤300 m (mesma regra de confirmação da Task 1: ≤100 m, ou 100–300 m com ≥5 min) → status confirmado, observação `ROTA EXECUTADA POR OUTRA PLACA (X)`, evidência `rota_outra_placa`, chegada/saída da parada de X, coluna nova `PLACA EXECUTORA`= X. NFs da carga sem parada de X → continuam `PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA`. Cobertura <80% ou mais de um veículo dividindo → nada muda.
- [ ] Testes: os 3 casos reais de 25/09 (fixtures resumidas), carro que para perto de 1 cliente de outra carga → nada, dia em andamento → AGUARDANDO. Commit `feat(kpi): rodizio de carga inteira vira rota executada por outra placa`.

### Task 3: Motivo em texto e nível de confiança

**Files:** Modify `agregacao.ts` (campos novos no detalhe), `gerador-xlsx.ts` (colunas MOTIVO e CONFIANÇA); Test ambos.

- [ ] `motivo`: frase gerada da evidência: "Parada de 17 min a 42 m do cliente", "Parada Unitrac da própria placa de 8 min a 150 m", "Parada de 2 min a 450 m — revisar", "Rota executada pela TOS1H26 — parada de 12 min a 30 m", "Caminhão passou a 140 m sem parar", "Ponto mais próximo do trajeto a 7,8 km", "Placa sem rastreamento no dia", "Coordenada do cliente em outro bairro — conferir cadastro".
- [ ] `confianca`: `CONFIRMADA` (entregue), `REVISAR` (qualquer REVISAR/CONFERIR/passou), `NÃO CONFIRMADO` (não foi/sem confirmação), `SEM BASE` (sem rastreador/placa inválida/aguardando).
- [ ] Testes: um por tipo, coerência motivo × status. Commit `feat(kpi): motivo e confianca por NF`.

### Task 4: Verificação, trava, revisão e deploy (com OK do usuário)

- [ ] Regenerar 22/23/24/25 (24 e 25 com Pão) na cópia; trava 0 com os 4 dias; reportar por dia: confirmadas (taxa), REVISAR, não confirmado, sem base, rodízio (NFs), falsos positivos da equipe restantes, entregas da equipe que viraram REVISAR.
- [ ] Revisão final (modelo mais forte). Pedir OK. Deploy: push definitivo + TEMP, pull/build/restart, regenerar 25/09 em disco e conferir.
