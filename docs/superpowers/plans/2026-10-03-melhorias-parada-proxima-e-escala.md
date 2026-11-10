# Melhorias Parada Próxima, Escala SEM RASTRI, Inferência Temporal e Re-geocode Noturno — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recuperar ~2,8–4,0 pp na taxa de confirmação da Nutry Max reduzindo thresholds de parada próxima, excluindo placas SEM RASTRI da escala do denominador, herdando confirmação por proximidade temporal e re-geocodificando coordenadas imprecisas noturnamente.

**Architecture:** Tasks 1, 2 e 4 em `src/lib/kpi-romaneio/agregacao.ts` (constantes e pós-processamento); Task 3 em `agregacao.ts` + `parse-romaneio.ts` (campo de escala); Task 5 em novo script `scripts/regeocode-noturno-imprecisos.ts` seguindo padrão de `correcao-geocode-noturna.ts`. Rio Quality intacto.

**Tech Stack:** TypeScript, Vitest, Python (trava), Supabase self-hosted, cron no servidor.

**Spec:** Análises consolidadas em `~/ClaudeGerado/kpi-regen-0922/melhorias-validada-01-10.md`, `melhorias-analise-nutry-02-10.md`, `melhorias-pendencias-grupo-02-10.md`, `melhorias-relatorios-custos-02-10.md`; conversa grupo KPI AJUSTES 02/10; aprovação explícita do usuário ("monte plano com o superpoderes e pode ir"); restrição explícita: "nao existe carga transferida".

## Global Constraints

- Nenhum texto "OUTRA PLACA" nem "CARGA TRANSFERIDA" em nenhum rótulo, log ou comentário.
- `reconhecerRodizio=false` em produção (mantém).
- Trava obrigatória: `python3 scripts/verificar-kpi-gabaritos.py` com dias 22–29 + `--gabarito-ana` sai 0; gabarito Ana 22/09 ≥988/≥1104/≤29.
- Rio Quality idêntico: nenhuma mudança em `src/lib/kpi-rioquality/`.
- Fuso: convenção existente (BRT-as-UTC no feitoISO; `hojeBR()` para datas).
- Cada tarefa: TDD (teste falha → implementa → `npx vitest run` verde → commit local com rodapé `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
- SEM push/deploy até Task 6.

## Review Focus

- Parada de 2 min a ≤300 m confirma ENTREGUE (Task 1 testa); parada de 1 min não confirma.
- Geo sem fonte + parada de 3 min confirma (Task 2 testa); parada de 2 min não confirma; Alto Grande (RQV3G18) continua bloqueado.
- Placa com status "SEM RASTRI" na escala → NFs fora da taxa com rótulo específico (Task 3 testa); placa normal → nada muda.
- Duas NFs mesmo endereço, uma ENTREGUE outra SEM CONFIRMAÇÃO, horários ±30 min → segunda vira ENTREGUE (Task 4 testa); >30 min ou endereços diferentes → não muda.
- Re-geocode noturno nunca sobrescreve fonte `manual`/`verificacao_manual`/`cadastro_unitrac`; acima do teto não grava nada; backup antes do upsert (Task 5 testa).

---

### Task 1: Reduzir DURACAO_MIN_PARADA_PROXIMA_PROPRIA_MIN de 3→2 min

**Files:** Modify `src/lib/kpi-romaneio/agregacao.ts:750`; Test `src/lib/kpi-romaneio/agregacao.test.ts`.

- [ ] **Step 1: Write failing tests**
  Add to `agregacao.test.ts`:
  ```typescript
  describe('parada próxima própria 2 min', () => {
    it('confirma ENTREGUE quando parada propria tem 2 min a <=300m', () => {
      // fixture: linha com geo confiavel, parada crua da propria placa
      // duracao_seg=120 (2 min), distM=250
      // expected: status starts with 'ENTREGUE'
    })
    it('nao confirma quando parada propria tem 1 min a <=300m', () => {
      // fixture: mesma config mas duracao_seg=60 (1 min)
      // expected: status does NOT start with 'ENTREGUE'
    })
    it('regressao: parada de 5 min a <=300m continua confirmando', () => {
      // fixture: duracao_seg=300, distM=200
      // expected: status starts with 'ENTREGUE'
    })
  })
  ```
- [ ] **Step 2: Run tests to verify they fail**
  Run: `npx vitest run src/lib/kpi-romaneio/agregacao.test.ts -t "parada próxima própria 2 min"`
  Expected: FAIL (threshold still 3 min)
- [ ] **Step 3: Implement**
  Change line 750 in `agregacao.ts`:
  ```typescript
  const DURACAO_MIN_PARADA_PROXIMA_PROPRIA_MIN = 2
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npx vitest run`
  Expected: ALL PASS (including existing tests — no regression)
- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/kpi-romaneio/agregacao.ts src/lib/kpi-romaneio/agregacao.test.ts
  git commit -m "feat(kpi): reduz duracao minima parada proxima propria de 3 para 2 min

  Recupera entregas rapidas legitimas (padarias, lanchonetes) que param
  2-3 min dentro do raio forte. Risco baixo: 2 min ja eh usado em
  DURACAO_MIN_PARADA_UNITRAC_PROPRIA_MIN.

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

### Task 2: Reduzir DURACAO_MIN_PARADA_PROXIMA_GEO_SEM_FONTE_MIN de 5→3 min

**Files:** Modify `src/lib/kpi-romaneio/agregacao.ts:767`; Test `src/lib/kpi-romaneio/agregacao.test.ts`.

- [ ] **Step 1: Write failing tests**
  Add to `agregacao.test.ts`:
  ```typescript
  describe('parada próxima geo sem fonte 3 min', () => {
    it('confirma ENTREGUE quando geoSemFonte=true e parada tem 3 min', () => {
      // fixture: linha com geoSemFonte=true, parada propria 3 min a <=2000m
      // expected: status starts with 'ENTREGUE'
    })
    it('nao confirma quando geoSemFonte=true e parada tem 2 min', () => {
      // fixture: mesma config mas duracao_seg=120 (2 min)
      // expected: status does NOT start with 'ENTREGUE'
    })
    it('Alto Grande (RQV3G18) continua bloqueado', () => {
      // fixture: caso conhecido de FP — geoSemFonte, parada curta,
      // outro cliente a <=150m da parada
      // expected: status does NOT start with 'ENTREGUE'
    })
  })
  ```
- [ ] **Step 2: Run tests to verify they fail**
  Run: `npx vitest run src/lib/kpi-romaneio/agregacao.test.ts -t "parada próxima geo sem fonte 3 min"`
  Expected: FAIL (threshold still 5 min)
- [ ] **Step 3: Implement**
  Change line 767 in `agregacao.ts`:
  ```typescript
  const DURACAO_MIN_PARADA_PROXIMA_GEO_SEM_FONTE_MIN = 3
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npx vitest run`
  Expected: ALL PASS
- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/kpi-romaneio/agregacao.ts src/lib/kpi-romaneio/agregacao.test.ts
  git commit -m "feat(kpi): reduz duracao minima geo sem fonte de 5 para 3 min

  Recupera casos onde geocode esta deslocado mas parada e real.
  Guarda de isolamento (outro cliente a <=150m) mantem Alto Grande
  e outros FPs conhecidos bloqueados.

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

### Task 3: Detecção de placa "SEM RASTRI" na escala

**Files:** Modify `src/lib/kpi-romaneio/parse-romaneio.ts` (extrair campo de status da escala); Modify `src/lib/kpi-romaneio/agregacao.ts` (marcar NFs e excluir da taxa); Test both.

- [ ] **Step 1: Inspect escala PDF parse**
  Read `parse-romaneio.ts` to find where escala fields are extracted. Identify the column/field that contains rastreador status (likely "STATUS" or similar in the escala table). If not currently parsed, add extraction.
- [ ] **Step 2: Write failing tests**
  In `agregacao.test.ts`:
  ```typescript
  describe('placa SEM RASTRI na escala', () => {
    it('NFs de placa com SEM RASTRI na escala ficam fora da taxa', () => {
      // fixture: escala com placa XYZ status="SEM RASTRI"
      // expected: todas as NFs dessa placa tem observacao
      // 'SEM RASTREADOR - PLACA SEM RASTREAMENTO NA ESCALA'
      // e NAO contam no denominador da TAXA
    })
    it('placa normal na escala nao e afetada', () => {
      // fixture: escala com placa ABC status normal
      // expected: NFs processadas normalmente
    })
  })
  ```
- [ ] **Step 3: Run tests to verify they fail**
  Run: `npx vitest run -t "placa SEM RASTRI"`
  Expected: FAIL
- [ ] **Step 4: Implement**
  In `parse-romaneio.ts`: extract `statusRastreador` from escala row per placa.
  In `agregacao.ts`: when `statusRastreador === 'SEM RASTRI'` (or similar), set observacao to `'SEM RASTREADOR - PLACA SEM RASTREAMENTO NA ESCALA - NÃO CONTABILIZADO'` and exclude from TAXA denominator (same pattern as existing `SEM RASTREADOR` labels around lines 1912–2072).
- [ ] **Step 5: Run tests to verify they pass**
  Run: `npx vitest run`
  Expected: ALL PASS
- [ ] **Step 6: Commit**
  ```bash
  git add src/lib/kpi-romaneio/parse-romaneio.ts src/lib/kpi-romaneio/agregacao.ts src/lib/kpi-romaneio/agregacao.test.ts
  git commit -m "feat(kpi): detecta placa SEM RASTRI na escala e exclui da taxa

  Quando a escala marca uma placa como SEM RASTRI, todas as NFs dessa
  placa recebem rotulo especifico e sao excluidas do denominador da
  TAXA. Evita penalizar performance por falha de infraestrutura.

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

### Task 4: Inferência por proximidade temporal para SEM CONFIRMAÇÃO

**Files:** Modify `src/lib/kpi-romaneio/agregacao.ts` (pós-processamento após classificação individual); Test `agregacao.test.ts`.

- [ ] **Step 1: Write failing tests**
  ```typescript
  describe('inferencia temporal SEM CONFIRMACAO', () => {
    it('herda ENTREGUE quando outra NF no mesmo endereco foi confirmada ±30min', () => {
      // fixture: NF A = ENTREGUE com horario 10:00
      //          NF B = SEM CONFIRMAÇÃO, mesmo endereco, horario estimado 10:20
      // expected: NF B vira ENTREGUE
    })
    it('nao herda quando horarios distantes >30min', () => {
      // fixture: NF A = ENTREGUE 10:00, NF B = SEM CONFIRMAÇÃO 11:00
      // expected: NF B continua SEM CONFIRMAÇÃO
    })
    it('nao herda quando enderecos diferentes', () => {
      // fixture: NF A = ENTREGUE endereco X, NF B = SEM CONFIRMAÇÃO endereco Y
      // expected: NF B continua SEM CONFIRMAÇÃO
    })
  })
  ```
- [ ] **Step 2: Run tests to verify they fail**
  Expected: FAIL
- [ ] **Step 3: Implement**
  Add post-processing pass in `montarDetalheEntregas` after individual classification:
  - Group NFs by normalized address (use `chaveCacheEndereco` or similar)
  - For each group with ≥1 ENTREGUE and ≥1 SEM CONFIRMAÇÃO:
    - If SEM CONFIRMAÇÃO has estimated arrival within ±30 min of any ENTREGUE in same group → change to ENTREGUE with observacao `'ENTREGUE - CONFIRMADO POR PROXIMIDADE TEMPORAL COM OUTRA NF NO MESMO ENDEREÇO'`
  - Constants: `JANELA_INFERENCIA_TEMPORAL_MIN = 30`, `DISTANCIA_MAX_INFERENCIA_M = 50`
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npx vitest run`
  Expected: ALL PASS
- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/kpi-romaneio/agregacao.ts src/lib/kpi-romaneio/agregacao.test.ts
  git commit -m "feat(kpi): inferencia temporal para SEM CONFIRMACAO no mesmo endereco

  Quando uma NF esta SEM CONFIRMACAO mas outra NF no mesmo endereco
  (ou <=50m) foi confirmada no mesmo dia com horario ±30min, herda
  a confirmacao. Ganho estimado +0,4 pp.

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

### Task 5: Script noturno de re-geocode para coordenadas imprecisas

**Files:** Create `scripts/regeocode-noturno-imprecisos.ts`; Create `scripts/regeocode-noturno-imprecisos.test.ts`.

- [ ] **Step 1: Study existing pattern**
  Read `scripts/correcao-geocode-noturna.ts` fully. Note: uses `rodarCorrecao` with `aplicar: false` by default; `GEOCODE_NOTURNO_APLICAR=1` enables writes; cap 30/night; backup before upsert; protected sources; coordinates outside RJ skipped.
- [ ] **Step 2: Write failing tests**
  ```typescript
  describe('regeocode noturno imprecisos', () => {
    it('atualiza cache quando geocoder retorna coordenada melhor', () => {
      // mock: geocoder returns coord within 100m of alvo Unitrac
      // expected: cache updated with new coord, fonte='regeocode_noturno'
    })
    it('nao atualiza quando geocoder falha', () => {
      // mock: geocoder returns null
      // expected: cache unchanged
    })
    it('nunca sobrescreve fonte manual/verificacao_manual/cadastro_unitrac', () => {
      // fixture: cache entry with fonte='manual'
      // expected: skipped, logged
    })
    it('respeita teto de 30 correcoes por noite', () => {
      // fixture: 31 candidates
      // expected: nothing written, log says exceeded cap
    })
    it('gera backup antes do primeiro upsert', () => {
      // expected: backup CSV exists with old values
    })
  })
  ```
- [ ] **Step 3: Run tests to verify they fail**
  Expected: FAIL (script doesn't exist)
- [ ] **Step 4: Implement**
  Create `scripts/regeocode-noturno-imprecisos.ts` following `correcao-geocode-noturna.ts` pattern:
  - Query `kpi_romaneio_geocode_cache` for entries with `confiavel=false` OR `motivo LIKE '%imprecisa%'` OR `fonte` is empty/auto
  - For each: try geocoding via bridge API using client name + city (fuzzy), then partial address + nearby CEP
  - Accept new coord only if: within RJ bounding box, closer to alvo Unitrac than current coord, and current fonte is not protected
  - Same guards: cap 30/night, backup before upsert, protected sources, log everything
  - Env var: `REGEOCODE_IMPRECISOS_APLICAR=1` (default: report only)
- [ ] **Step 5: Run tests to verify they pass**
  Run: `npx vitest run scripts/regeocode-noturno-imprecisos.test.ts`
  Expected: ALL PASS
- [ ] **Step 6: Commit**
  ```bash
  git add scripts/regeocode-noturno-imprecisos.ts scripts/regeocode-noturno-imprecisos.test.ts
  git commit -m "feat(kpi): script noturno de re-geocode para coordenadas imprecisas

  Batch noturno que tenta re-geocodificar entradas com coordenada
  imprecisa usando nome do cliente + cidade e endereco parcial.
  Mesmas guardas do correcao-geocode-noturna: teto 30/noite,
  backup, fontes protegidas, bbox RJ.

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

### Task 6: Medição, revisão e deploy

- [ ] Regenerar 22/23/24/25/26/28/29 numa cópia temporária no servidor (`transmonseg-vps`, `/tmp/trava-melhorias-XXXX`, git archive HEAD com .env.production e node_modules symlinked). PDFs do storage `kpi-romaneio-inputs`. Saídas em `~/ClaudeGerado/kpi-regen-0922/trava-melhorias/`.
- [ ] Rodar trava: `python3 scripts/verificar-kpi-gabaritos.py` com os 7 xlsx + `--gabarito-ana`. Exit code deve ser 0. Gabarito Ana: ≥988/≥1104/≤29.
- [ ] Reportar por dia: taxa antes (med-final) vs depois, quantas NFs cada melhoria recuperou (diff por rótulo), quais placas afetadas, zero regressões ENTREGUE→não_entregue.
- [ ] Revisão final opus: diff completo `git diff 6759ba6..HEAD -- src scripts`, verificar que Rio Quality não foi alterado, que nenhum texto "OUTRA PLACA"/"CARGA TRANSFERIDA" existe, que constantes mudadas são as corretas.
- [ ] Deploy se autorizado pelo usuário: `git push origin main`; servidor `transmonseg-vps` `/srv/kpi-transmonseg`: `git pull --ff-only && npm run build && pm2 restart kpi-transmonseg`; HTTP 200 em `:3020`; HEAD = novo commit.
- [ ] Atualizar memória `project_kpi_confirmacao_e_geracao_2026-09-18.md` com as 5 melhorias e hashes dos commits.