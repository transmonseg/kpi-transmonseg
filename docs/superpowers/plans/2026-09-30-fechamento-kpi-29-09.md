# Fechamento do KPI de 29/09 (sem sinal seguro, auditoria da Ana, coordenadas, deploy único) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar num único deploy: (1) regra "sem sinal no dia" segura contra falha de consulta; (2) correção dos bugs de relatório que a Ana apontou (resumo×detalhe, placa "21", RQO9H37, horários, denominador); (3) coordenadas verificadas de 29/09 aplicadas no cache e as contestadas revertidas; (4) medição 22–29/09 com trava, revisão independente e deploy.

**Architecture:** Regras opt-in `modoPrecisao` (Nutry Max) em `src/lib/kpi-romaneio/agregacao.ts`, `placas-sem-rastreador.ts`, `gerador-xlsx.ts`; a rota `nutrimax/gerar/route.ts` e `scripts/gerar-nutrimax-real-arquivo.ts` seguem em paridade. Coordenadas via `scripts/aplicar-correcoes-geocode.ts` (backup antes). Monitoramento NÃO é alterado (o commit 19c654b fica sem uso).

**Tech Stack:** TypeScript, Vitest, Python (trava `scripts/verificar-kpi-gabaritos.py`), Postgres/PostgREST self-hosted, pm2 em `transmonseg-vps`.

**Spec:** `~/ClaudeGerado/kpi-regen-0922/conversa-29-09/` (Ana), `auditoria-ana-29-09.md`, `hoje-29/verificacao-{coord,parada,outros}.md`, `verificacao-pendentes-28-09-completa.md`.

## Global Constraints

- Nunca "OUTRA PLACA"/placa compartilhada; rodízio DESLIGADO (`reconhecerRodizio=false`); nenhuma NF confirmada por parada de outro veículo.
- STATUS de NF confirmada começa com 'ENTREGUE'; resumo "NF CONFIRMADAS" == linhas ENTREGUE == numerador da TAXA; contagens do resumo == contagens do detalhe.
- Sem rastreador / não saiu da base ficam FORA da taxa; nunca "aguardando" nem "não foi" para placa sem sinal no dia. Falha de consulta NUNCA conclui "sem sinal".
- Trava obrigatória (22,23,24 + `--dia 25,26,28` + `--gabarito-ana`): exit 0; Ana ≥988/≥1104/≤29; nenhuma 'nao_entregue' da equipe vira ENTREGUE.
- Coordenadas: só confiança alta/média; nunca sobrescrever fonte `manual`; bbox RJ (lat -23.5..-20.7, lng -45.0..-40.9); backup antes; nunca usar parada de outra NF/carga da mesma placa como prova.
- Não enviar mensagem a ninguém (Ana/equipe/grupo); quem envia é o usuário. Deploy único no fim, só com trava 0 e revisão limpa.

## Review Focus

- Consulta de posições com erro/timeout → placa NÃO vira "sem rastreador"; NFs ficam como estavam (Task 1 testa).
- Placa com 0 posições mas com entrega "feita" na Unitrac → não vira sem sinal (Task 1 testa).
- Rótulo do resumo (aba 1) idêntico ao da aba da placa em toda placa (Task 2 testa).
- Coordenada aplicada que contradiz gabarito da equipe (TTM2G02 2394312) → revertida/ausente (Task 3 confere).
- NF do denominador: nenhuma NF "aguardando" em dia encerrado (Task 2/4 conferem).

---

### Task 1: "Sem sinal no dia" seguro contra erro de consulta

**Files:** Modify `src/lib/kpi-romaneio/placas-sem-rastreador.ts` (`placaSemSinalNoDia`), `src/lib/kpi-romaneio/base-horarios.ts` (propagar estado "consulta falhou" por placa, se ainda não existir), `src/app/api/kpi/nutrimax/gerar/route.ts`, `scripts/gerar-nutrimax-real-arquivo.ts`; Test `placas-sem-rastreador.test.ts`.

- [ ] Teste que falha: placa cuja consulta de posições retornou erro/indefinido (distinto de "ponte respondeu sem posições") → `placaSemSinalNoDia` = false. Placa com resposta válida, km null, sem paradas/visitas/entrega feita → true. Ponte fora do ar (nenhuma resposta) → false para todas.
- [ ] Rodar: `npx vitest run src/lib/kpi-romaneio/placas-sem-rastreador.test.ts` → FAIL.
- [ ] Implementar: `buscarHorariosBase` devolve marca `erroConsulta` (ou omite a placa) quando o fetch da placa falha; `placaSemSinalNoDia` exige resposta válida explícita. Paridade route.ts/CLI.
- [ ] `npx vitest run` verde. Commit `fix(kpi): sem sinal no dia nunca conclui quando a consulta de posicoes falha`.

### Task 2: Bugs de relatório apontados pela Ana (auditoria)

**Files:** Modify os arquivos apontados por `~/ClaudeGerado/kpi-regen-0922/auditoria-ana-29-09.md` (PARTE 1: NFs no resumo e ausentes no detalhe; RQO9H37 resumo×detalhe; placa "21" na carga PAO-11; 24 ENTREGUE sem horário; denominador 2.449 vs 2.480); Test nos arquivos de teste correspondentes.

- [ ] Ler a auditoria; para CADA bug real com causa raiz confirmada: teste que falha (fixture mínima do caso real), implementação mínima, `npx vitest run` verde, commit `fix(kpi): <bug>`. Bug que a auditoria classificar como comportamento correto (ex.: exclusão do denominador conforme regra do usuário) NÃO vira código: registrar no ledger e na explicação para o usuário.
- [ ] Teste de consistência global: para uma geração de fixture com todas as categorias, contagens do resumo == contagens das abas de placa.

### Task 3: Coordenadas de 29/09 (aplicar / reverter)

**Files:** `~/ClaudeGerado/kpi-regen-0922/hoje-29/propostas-coord-hoje.csv`, `auditoria-ana-29-09.md` (lista de reversões), `scripts/aplicar-correcoes-geocode.ts` (sem alteração), backup em `/srv/kpi-transmonseg/backup-cache-antes-correcoes-29b.csv` (host `transmonseg-vps`).

- [ ] Montar CSV `endereco;lat;lng;fonte;evidencia` só com propostas de confiança alta/média das 24 de hoje, excluindo as que a auditoria/gabarito contradizem e as INDETERMINADAS; reverter (via backup-cache-antes-correcoes-29.csv, UPDATE em transação filtrado pelo valor atual) as correções de 28/09 que a auditoria mandar reverter.
- [ ] Dry-run do script (nenhuma linha `manual`, todas no bbox); aplicar; SELECT de conferência (confiavel=true, fonte, coords).
- [ ] Commit do CSV aplicado em `scripts/gabaritos/` NÃO é necessário; registrar no ledger.

### Task 4: Medição 22–29/09, revisão final e deploy único

- [ ] Gerar 22/23/24/25/26/28/29 numa cópia com o HEAD (procedimento de `med-0929c`; 29 pelo storage/`kpi_romaneio_geracoes` ou PDFs do dia; nohup+polling), trava exit 0, gabarito Ana no limite, diff NF a NF vs `med-0929c`; reportar taxa por dia e a de 29/09 (baseline 95,8%; Ana 94,64%).
- [ ] Revisão independente (opus) do diff completo desde 6484a4a.
- [ ] Se trava 0 e revisão limpa: push definitivo, espelho no KPI TEMP (cherry-pick sem docs), servidor `transmonseg-vps` `/srv/kpi-transmonseg`: `git pull --ff-only`, build com BUILD_EXIT=0, `pm2 restart kpi-transmonseg`, HTTP 200. Não mexer no cron do geocode noturno nem no monitoramento.
- [ ] Atualizar memória `project_kpi_confirmacao_e_geracao_2026-09-18.md`.
