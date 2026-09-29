# Rodízio sobre "sem movimento" + guardar o arquivo do Pão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Fazer o reconhecimento de rodízio de carga prevalecer sobre `VEÍCULO SEM MOVIMENTO` (28/09: carga 98837 da RQU6E83, 30 NFs, foi rodada pela RBI0J25; taxa 91,0% → ~94,3%). (2) Guardar o PDF do Pão junto com escala e romaneio, para poder regenerar dias com Pão.

**Architecture:** Task 1 só em `src/lib/kpi-romaneio/agregacao.ts` (+ testes), opt-in Nutry Max já existente (`reconhecerRodizio`). Task 2 em `src/app/api/kpi/nutrimax/gerar/route.ts`, lib de gerações, migration nova e CLI. Sem mudança de layout do xlsx.

**Tech Stack:** TypeScript, Vitest, Postgres/PostgREST self-hosted.

**Spec:** `~/ClaudeGerado/kpi-regen-0922/medicao-28-09.md` (achado: "sem movimento" passa na frente do rodízio); regra do usuário 29/09 ("vc quem sabe"); rodízio já aceito: "ROTA EXECUTADA" sai como `ENTREGUE` (sem texto de outra placa).

## Global Constraints

- Nenhum texto "OUTRA PLACA" no xlsx da Nutry Max; NF do rodízio sai `ENTREGUE`.
- "Sem movimento" continua valendo quando NENHUM veículo cobre ≥80% da carga (TTP0H36, RQU3F71 de 28/09 continuam `VEÍCULO SEM MOVIMENTO`).
- Trava (`scripts/verificar-kpi-gabaritos.py` com os dias 22–26 e 28) sai 0; gabarito Ana 22/09 ≥988/≥1104/≤29.
- Rio Quality idêntico. Migration nova só é aplicada no deploy, com backup do que existir; falha ao guardar o Pão nunca derruba a geração.

## Review Focus

- Carga inteira feita por outro veículo e placa da escala parada (RQU6E83 ← RBI0J25): NFs `ENTREGUE`, sem "sem movimento" (Task 1 testa).
- Placa parada e NENHUM outro veículo cobre ≥80% (TTP0H36): continua `VEÍCULO SEM MOVIMENTO` (Task 1 testa).
- Dois veículos dividem a carga (nenhum ≥80%): não reconhece; continua `VEÍCULO SEM MOVIMENTO` (Task 1 testa).
- Regeneração de geração antiga sem Pão guardado: funciona como antes (Task 2 testa).
- Regeneração de geração nova com Pão: reconstrói o Pão e o resultado é idêntico ao da geração original (Task 2 testa).

---

### Task 1: Rodízio prevalece sobre "sem movimento"

**Files:** Modify `src/lib/kpi-romaneio/agregacao.ts` (ordem no bloco de classificação: `semMovimento` × `escalaDivergente`/`reconhecerRodizio`, e a detecção de carga divergente para placa parada); Test `src/lib/kpi-romaneio/agregacao.test.ts`. NÃO mexer em route.ts/CLI salvo se estritamente necessário (outra frente edita route.ts).

- [ ] Testes que falham: (a) carga de 6 NFs, placa da escala com km<2 e sem paradas fora da base, outro veículo X com parada ≥2 min a ≤300 m de 5 dos 6 clientes (≥80%) → as NFs com parada de X saem `ENTREGUE` (STATUS sem texto de placa), a NF sem parada de X sai `PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA`; (b) mesma placa parada, nenhum veículo cobre ≥80% → todas `VEÍCULO SEM MOVIMENTO NO DIA…`; (c) dois veículos cobrem 50% cada → `VEÍCULO SEM MOVIMENTO`; (d) carga pequena (<5 NFs) → não reconhece (limite atual de ≥5 NFs da escala divergente permanece); (e) opção desligada → nada muda.
- [ ] Implementar: quando `semMovimento` seria a observação, primeiro verificar o rodízio da carga (mesmos critérios já existentes: ≥5 NFs, um único veículo cobrindo ≥80%, parada forte do executor por NF). Reaproveitar `detectarEscalaDivergente`/`reconhecerRodizio` sem duplicar lógica.
- [ ] `npx vitest run` verde. Commit `fix(kpi): rodizio de carga prevalece sobre veiculo sem movimento`.

### Task 2: Guardar o PDF do Pão

**Files:** Create `supabase/migrations/20260929000000_kpi_geracoes_pao.sql` (`alter table kpi_romaneio_geracoes add column if not exists pao_storage_path text;`); Modify `src/app/api/kpi/nutrimax/gerar/route.ts` (upload junto com os outros PDFs; regenerar baixa e usa), lib de gerações (`salvarGeracao`, `buscarGeracaoParaRegenerar`, tipos), `scripts/gerar-nutrimax-real-arquivo.ts` só se precisar para paridade; Test dos helpers.

- [ ] Testes que falham: `salvarGeracao` grava `pao_storage_path` quando existe e `null` quando não; `buscarGeracaoParaRegenerar` devolve o campo; a regeneração de geração sem `pao_storage_path` segue idêntica; com `pao_storage_path` baixa o PDF e passa ao parse do Pão.
- [ ] Implementar. Falha no upload/download do Pão: log e segue (upload) / regenera sem Pão com aviso (download). Prefixo `${prefixo}-pao.pdf`. Não aplicar a migration em produção aqui (só no deploy).
- [ ] `npx vitest run` verde. Commit `feat(kpi): guarda o PDF do pao junto com escala e romaneio`.

### Task 3: Medição, revisão e deploy (com as 3 regras já prontas)

- [ ] Gerar 22/23/24/25/26/28 numa cópia (PDFs 22–25 em `/tmp/kd/` no servidor; 26 e 28 pelo storage/`kpi_romaneio_geracoes`); trava com os dias (22–26 + 28) → 0; reportar 28/09 antes (91,0%) e depois; 25/09 (RQU7G48). Sem falso positivo novo.
- [ ] Revisão final. Deploy autorizado pelo usuário em 29/09 ("vc quem sabe") se trava 0 e revisão limpa: push definitivo + TEMP, pull/build/restart, aplicar a migration da Task 2, HTTP 200; incluir as 3 regras já commitadas (67ded9f, d4f7697, f0a3cb3, 6db4802) e a trava (4a897d3).
