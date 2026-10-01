# Rio Quality — aplicar aprendizados da Nutry Max — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o KPI da Rio Quality confiável como o da Nutry Max: consulta Unitrac sem falha silenciosa, SEM RASTREADOR / SEM SINAL / NÃO SAIU DA BASE fora da taxa, linha de TAXA com denominador, resumo = detalhe, carga sem placa visível, avisos, snapshot noturno de paradas e guarda territorial no formato novo.

**Architecture:** Mudanças em `src/lib/kpi-rioquality/` (pipeline.ts, parse-planilhas.ts, consolida/unitrac) e opções da `agregacao.ts` compartilhada; Nutry Max NÃO pode mudar (trava 22–29/09 exit 0, xlsx idênticos). Rota `src/app/api/kpi/rioquality/gerar` e `scripts/gerar-rioquality-real-arquivo.ts` em paridade (mesma `pipeline.ts`).

**Tech Stack:** TypeScript, Vitest, Unitrac API (`/stops` 48 h), PostgREST self-hosted, pm2 em `transmonseg-vps`.

**Spec:** `~/ClaudeGerado/kpi-regen-0922/rioquality-aplicar-aprendizados.md` (estudo regra a regra, arquivo:linha) + memória `project_rio_quality_kpi.md`.

## Global Constraints

- Nutry Max inalterada: `npx vitest run` verde e trava `scripts/verificar-kpi-gabaritos.py` (22,23,24 + `--dia 25,26,28,29` + `--gabarito-ana`) exit 0 com xlsx iguais à medição `med-0930f`.
- Rio Quality não usa alvos/cadastro Unitrac em produção (princípio do usuário); só GPS (`/stops` e rastro).
- Nunca confirmar por parada de outro veículo; rodízio desligado.
- Vizinhança ≤800 m e faixa 500–800 m da RQ continuam ENTREGUE (sem decisão nova do usuário); `modoPrecisao` NÃO é ligado na RQ.
- Erro/timeout de consulta Unitrac nunca conclui "sem rastreador"/"sem sinal".
- Medição nunca grava cache de geocode, cache negativo ou snapshot (cópia ou flag).
- Não enviar mensagem a ninguém; deploy único no fim, com trava NM exit 0 e revisão independente limpa.

## Review Focus

- Unitrac respondendo erro/timeout para algumas placas → placas ficam "CONSULTA FALHOU - CONFERIR" (fora das conclusões), aviso na aba Avisos; nenhuma vira SEM RASTREADOR (Task 1 testa).
- Placa com CV e `/stops` 200 vazio + rastro <2 pontos → SEM RASTREADOR - SEM SINAL NO DIA (fora da taxa); trava: >25% da frota do dia (≥10 placas) nessa condição → ninguém concluído + aviso (Task 3 testa).
- Linha de Entregas sem placa → aparece como CARGA SEM PLACA, fora da taxa (Task 2 testa).
- Resumo (aba 1) == detalhe em toda placa, inclusive placas sem CV e sem sinal (Task 2 testa).
- Opção nova `naoSaiuDaBase` desligada na NM por padrão do jeito que ela já é chamada → NM idêntica (Task 3 testa).

---

### Task 1: Consulta Unitrac robusta (erro ≠ vazio)

**Files:** Modify `src/lib/kpi-rioquality/pipeline.ts:231-237`, `src/lib/unitrac-api/client.ts` / `consolida.ts` (ou wrapper novo em `kpi-rioquality/unitrac.ts`), `agregacao.ts` só se precisar de rótulo novo; Test `src/lib/kpi-rioquality/pipeline.test.ts`.

- [ ] Teste que falha: com 3 placas, uma com `/stops` erro (null/timeout), uma com 200 vazio, uma com paradas → a de erro sai com estado `consultaOk=false` e NFs com STATUS `CONSULTA AO RASTREADOR FALHOU - CONFERIR` (fora das conclusões: não ENTREGUE, não SEM RASTREADOR); concorrência máxima 6 (`mapComLimite`); 1 retry antes de concluir erro.
- [ ] Implementar mínimo; aviso por placa com erro devolvido pela pipeline. `npx vitest run` verde. Commit `fix(kpi-rq): consulta unitrac com limite, retry e erro distinto de vazio`.

### Task 2: Pacote de relatório (sem rastreador, TAXA, resumo=detalhe, carga sem placa)

**Files:** Modify `pipeline.ts:245-322`, `parse-planilhas.ts:72,178`, `src/lib/kpi-rioquality/regressao-sem-cv.test.ts`; Test `pipeline.test.ts`, `parse-planilhas.test.ts`.

- [ ] Testes que falham: placa sem CV → `SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO` (opção `tratarSemRastreadorNoDia=true`), fora da taxa; xlsx com linha `TAXA DE CONFIRMAÇÃO` (`resumoConfirmacao: true`) e denominador; `contarConfirmadasPorCarga` usado no resumo (resumo NF CONFIRMADAS == linhas ENTREGUE); linha sem placa mantida com `placa: ''` → CARGA SEM PLACA fora da taxa (formato antigo e novo).
- [ ] Atualizar `regressao-sem-cv.test.ts` (mudança intencional, comentário com a decisão do usuário). Implementar. Verde. Commit `feat(kpi-rq): sem rastreador, taxa, resumo=detalhe e carga sem placa`.

### Task 3: Sem sinal pela Unitrac + NÃO SAIU DA BASE por flag própria

**Files:** Modify `src/lib/kpi-romaneio/placas-sem-rastreador.ts` (variante sem ponte), `agregacao.ts:1926-1943` (nova opção `naoSaiuDaBase`, NM passa `modoPrecisao` e continua igual), `pipeline.ts`; Test `placas-sem-rastreador.test.ts`, `agregacao.test.ts`, `pipeline.test.ts`.

- [ ] Testes que falham: CV com consulta OK, 0 paradas fora da base e rastro <2 pontos → SEM RASTREADOR - SEM SINAL NO DIA; com 20 de 40 placas nessa condição → nenhuma concluída + aviso; consulta falhou → nunca sem sinal; km conhecido <2 e sem parada fora da base → VEÍCULO NÃO SAIU DA BASE (fora da taxa) com `naoSaiuDaBase=true`; NM com as opções atuais → saída idêntica (teste existente "NM intacta").
- [ ] Implementar. Verde. Commit `feat(kpi-rq): sem sinal pela unitrac e nao saiu da base`.

### Task 4: Avisos e snapshot noturno de paradas da RQ

**Files:** Modify `pipeline.ts` (avisos → `gerarKpiRomaneioXlsx`), `scripts/snapshot-paradas-noturno.ts` (ou o script real do snapshot de paradas; incluir CVs de `kpi_rioquality_frota` com `empresa='rioquality'`), leitura de snapshot na pipeline RQ (`paradasEfetivas`) para dia >48 h; Test correspondentes.

- [ ] Testes que falham: aba Avisos com "placa sem rota no Custos", "rota sem entregas", "placa sem CV na frota", "consulta Unitrac falhou (N placas)", "trava sem sinal"; snapshot grava/lê paradas RQ por CV com empresa `rioquality`; pipeline usa snapshot quando o dia está fora das 48 h.
- [ ] Implementar. Verde. Commit `feat(kpi-rq): avisos e snapshot noturno de paradas`.

### Task 5: Guarda territorial no formato novo

**Files:** Modify `pipeline.ts:139-146`; Test `pipeline.test.ts`.

- [ ] Teste que falha: formato novo chama `geocodificarEnderecos(..., { validarTerritorio: true })` e propaga `confiavel/motivo/fonte` para as linhas (endereço em outro município → `ENDEREÇO COM COORDENADA IMPRECISA ...`, não NÃO FOI).
- [ ] Implementar. Verde. Commit `feat(kpi-rq): guarda territorial no formato novo`.

### Task 6: Medição, revisão e deploy único

- [ ] Script `gerar-rioquality-real-arquivo.ts` com flag `--sem-gravar-cache` (ou env) que desliga gravações de cache/negativo/snapshot; teste.
- [ ] Medir o relatório de 30/09 (dados salvos em `~/ClaudeGerado/kpi-regen-0922/rioquality-med-3009/`) antes/depois; NM: regenerar 22–29/09 e trava exit 0 com xlsx iguais a `med-0930f`.
- [ ] Revisão independente (opus) do diff desde 729413d.
- [ ] Deploy: push definitivo + espelho KPI TEMP, servidor pull/build/restart, HTTP 200; snapshot noturno RQ entra no cron existente (conferir `crontab -l`). Atualizar memória `project_rio_quality_kpi.md` (frota 119 CVs, formato novo, ponte sem RQ, regras novas).
