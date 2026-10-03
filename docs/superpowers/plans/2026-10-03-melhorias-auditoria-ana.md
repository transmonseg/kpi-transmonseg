# Melhorias KPI Nutry Max — Auditoria da Ana (02–03/10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a diferença entre o KPI automático (95,3% em 02/10) e a auditoria visual da Ana (97,17%) sem criar falso positivo.

**Architecture:** Regras em `src/lib/kpi-romaneio/agregacao.ts` (confirmação por NF), exclusões da taxa e avisos em `gerador-xlsx.ts`, correção de cadastro via script com backup. Cada regra medida contra o gabarito da Ana (28 NFs de 02/10 + auditoria de 01/10) e a trava 22–29/09.

**Tech Stack:** TypeScript/Next, Vitest, Postgres (`kpi_romaneio_geocode_cache`, `kpi_alvos_snapshot`), trava Python.

**Spec:** conversa 02–03/10 em `~/ClaudeGerado/kpi-regen-0922/msgs-03-10.txt`, `conversa-03-10/arquivos/` (28_NOTAS_VALIDACAO_VISUAL, ERROS_CADASTRO, REVISAO_VISUAL_FINAL), transcrições em `conversa-03-10/transcricoes/todas.txt`.

## Global Constraints

- Nunca confirmar NF por parada de outro veículo; nenhum texto "OUTRA PLACA"/"CARGA TRANSFERIDA" novo.
- Parada próxima 500m–2km NÃO vira entrega automática (Ana, NF 2401807 "não fez").
- Trava `scripts/verificar-kpi-gabaritos.py` 22–29/09 sai 0; casos verificados "não foi" continuam pendentes.
- Rio Quality inalterado. Deploy só com OK do usuário. Mensagem pra Ana/grupo só com OK do usuário.

## Review Focus

- Parada longa (almoço/pernoite) perto do cadastro não pode confirmar (FP RQQ5B81 159 min).
- Placa com só parte das NFs "escala divergente" não pode sair inteira da taxa (25/09: 93 NFs fora).
- Alvo Unitrac situação 98 em compartilhada = continua REVISAR (Rede Loirinho).
- Cadastro duplicado/triplicado do mesmo cliente não pode casar parada de outro cliente.
- Ilha Grande sem acesso rodoviário continua rótulo próprio, fora de distância rodoviária.

---

### Task 1 (feito, local): Compartilhada (horário do vizinho) volta a confirmar
- Ana validou 9/9 em 02/10. Exceção: alvo situação 98 → REVISAR.
- [x] Testes + implementação (`REVISAR_POR_ROTULO_FRACO` condicionado a `SITUACAO_ALVO_OUTRO_DESFECHO`).

### Task 2 (feito, local): Parada única atendendo cliente vizinho
- Parada própria 2–60 min a ≤100 m do cadastro Unitrac, com vizinho da placa a ≤150 m → `ENTREGUE - PARADA COMPARTILHADA COM CLIENTE VIZINHO DA MESMA PLACA`.
- [x] Testes (TOPS 62 m/3 min confirma; 159 min não; >100 m não; sem cadastro não).

### Task 3 (corrigir antes do deploy): Escala divergente fora da taxa só quando a placa inteira não passou
**Files:** `src/lib/kpi-romaneio/gerador-xlsx.ts` (`ehEscalaDivergente`), test em `gerador-xlsx.test.ts`.
- [ ] Teste: placa com 5/5 NFs "PLACA DA ESCALA NÃO PASSOU" → 5 fora da conta; placa com 3/30 → as 3 continuam no denominador.
- [ ] Implementar: `ehEscalaDivergente` exige que TODAS as NFs da mesma carga+placa tenham o rótulo (pré-calcular `Set` de cargas 100% divergentes em `calcularResumoConfirmacao`/`avisosDeFrota`).
- [ ] Medir 25/09: fora da conta cai de 93 para só as cargas inteiras.

### Task 4 (feito, local): Aviso diário de frota
- Aba Avisos lista por placa: sem rastreamento no dia (ex. TTL5J17, LLD4202 placa provisória) e placa da escala divergente.

### Task 5: Corrigir cadastro das NFs que a Ana apontou
**Files:** `scripts/aplicar-correcoes-geocode.ts` (existente), CSV novo em `~/ClaudeGerado/kpi-regen-0922/correcoes-cadastro-02-10.csv`.
- [ ] Para as 9 NFs de ERROS_CADASTRO: coordenada do cliente = cadastro Unitrac quando há parada própria ≥3 min ≤250 m dele (2402141, 2402464, 2402740, 2402751); demais só listar pra operação.
- [ ] Dry-run → backup → aplicar (nunca sobrescreve `manual`/`verificacao_manual`).
- [ ] Relatório pra Ana: duplicados (2402302) e triplicado (2402581) precisam ser unificados no cadastro deles.

### Task 6: Medição final e trava
- [ ] Regenerar 22–29/09, 01 e 02/10 com o HEAD; trava exit 0.
- [ ] Comparar 02/10 com as 28 NFs da Ana: quantas das 25 entregues confirmam, e as 3 pendentes continuam pendentes.
- [ ] Taxa antes/depois por dia.

### Task 7: Revisão independente + deploy (com OK do usuário)
- [ ] Revisor com contexto novo no diff `6759ba6..HEAD`.
- [ ] push → servidor pull/build/restart → HTTP 200 → espelhar no KPI TEMP.

### Fora deste plano (backlog, pedir decisão)
- Histórico de auditoria por NF (status original → regra → evidência → final) — pedido da Ana, precisa de tabela nova.
- Rio Quality via monitoramento ("eles querem tempo parado").
- Treinar mais gente pra gerar (não só a Ana) — operacional.
