# Match por Endereço/Geo de paradas FORA_BASE — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans pra implementar task-a-task. Steps usam checkbox (`- [ ]`).

**Goal:** Quando uma parada do Unitrac está classificada **FORA_BASE** e **não casa por código**, mas sua localização bate com o **cadastro autoritativo de Pontos de Interesse** (endereço + coordenada de uma loja registrada), o sistema deve atribuir essa parada à loja, gerar o KPI normalmente e **sinalizar na pré-KPI que o match foi por endereço/geo** (não por código), para revisão do operador.

**Architecture:** O matcher (`src/lib/kpi/matcher.ts`, `cruzaEscalaUnitrac`) hoje roda em modo `SEM_GEO=true` em produção, que desliga TODOS os 4 caminhos de match por GPS. Existe uma regra de produto explícita da Tia Érica (27/05): *"FORA_BASE nunca é entrega"* — o geo-fallback foi restringido a paradas já classificadas `LOJA` porque aceitar `FORA_BASE` por proximidade frouxa (raio da loja) gerou falsos positivos em massa. Esta feature NÃO reabre o geo frouxo: introduz uma estratégia **nova, de alta precisão**, casando a parada FORA_BASE contra o **registro de Pontos de Interesse do Unitrac** (arquivo `unitrac_pontointeresse_consulta.xls` — 369 pontos com `IDENTIFICADOR`=codigo_unitrac, ENDEREÇO, BAIRRO, MUNICÍPIO, LAT/LNG, RAIO). O match exige confirmação dupla (coordenada dentro de raio+folga **E** mesmo município/bairro, OU endereço textual idêntico) e é sempre marcado `algorithm:'geo'` + `requiresReview:true`. A estratégia roda mesmo sob SEM_GEO, mas é passada **explicitamente por parâmetro** (`{ geoEndereco: true }`), nunca pelo global `SEM_GEO` (que tem race condition conhecida).

**Tech Stack:** TypeScript, vitest, Supabase (Postgres + migrations), SheetJS (vendor `vendor/xlsx-0.20.3.tgz`) pra ler o `.xls` legado (ExcelJS NÃO lê BIFF), ExcelJS/pdf-lib pro KPI.

---

## Estado atual (o que já existe e o que falta)

| Peça | Hoje | Precisa |
|---|---|---|
| Tabela `lojas` | `lat/lng/raio_metros/codigo_unitrac` mas **sem endereço** e **sem migration de schema** | + colunas `endereco/bairro/municipio/numero`; schema versionado; enriquecer lat/lng/raio do registro |
| `ParadaUnitrac` | `endereco`, `lat`, `lng`, `classificacao` — populados **tanto no XLSX quanto no PDF** (`unitrac.ts:296`, `unitrac-pdf.ts:312/324`, `unitrac-pdf-coord.ts:283`) | já basta; não precisa mexer em parser |
| Matcher geo | `buscaPorProximidade` (haversine) existe; geo-fallback gated `!SEM_GEO` e restrito a `LOJA` | nova estratégia `matchGeoEndereco` p/ FORA_BASE, alta precisão, fora do global SEM_GEO |
| `MatchAlgorithm` | já tem `'geo'`; `MatchMeta{algorithm, requiresReview}` | propagar até a UI |
| `derivarStatus` | FORA_BASE+sem loja_id → `FORA_DE_BASE/revisar` | FORA_BASE casado por geo → `ENTREGUE` com flag `via_geo`/revisar |
| Preview (`/api/kpi/preview`) | buckets ok_full/parcial/sem_rastreador; **não expõe estratégia de match** | expor lojas "localizadas por endereço" + badge |
| Pré-KPI UI (`kpi/simples/page.tsx`) | preview enriquecido com status | badge "📍 endereço (confira)" nas lojas geo |

**Gate de não-regressão (CRÍTICO):** esta feature reverte parcialmente a regra "FORA_BASE nunca é entrega". O risco é reintroduzir falsos positivos. Usar o harness de auditoria do dia 19/20 como gate: a métrica **`Inventou` não pode passar de 2** e as redes ≥88% não podem cair. Rodar antes e depois de cada task de matcher.

---

## Decisões (revisadas 2026-06-01 APÓS validação com dados reais)

> **Validação empírica (relatório dia 20, 554 paradas FORA_BASE — script `_tmp_valida_geo.ts`):**
> - Match por RUA isolada: **2/554** (falha). Unitrac grava endereço completo geocodificado; cadastro tem só a rua; ruas grandes são ambíguas (Av. das Américas = 17 lojas).
> - Match por COORDENADA: ≤50m=49, ≤100m=41, ≤150m=30, ≤250m=38, ≤500m=67, >500m=329. Abismo natural em ~150m separa loja real de ruído. Exemplos ≤150m batem o cenário do fundador (Rua Dias Ferreira 29m→ZS Leblon, etc).
> **Conclusão:** coordenada é a chave; rua/bairro é confirmação anti-FP.

- **D1 — Match por COORDENADA, rua confirma.** Chave = `haversine(parada, ponto_cadastrado)`. Rua/bairro entram como **confirmação** (não como chave). Só FORA_BASE sem `codigo_loja`.
- **D2 — Faixas de distância:** `≤100m` casa direto; `100–250m` casa **só se a rua OU bairro do cadastro aparecer no endereço da parada**; `>250m` não casa. (Thresholds parametrizados — ajustáveis após auditoria.)
- **D3 — Mostra `ENTREGUE (GEO)` em amarelo.** Conta como entregue (preenche horário), com `requiresReview:true`. Rótulo de status dedicado `ENTREGUE_GEO` → "Entregue (geo)" em âmbar na pré-KPI.

> **D4 (resolvido):** PDF e XLSX populam `endereco` + `lat`/`lng` (100% das paradas no teste). Mesma estratégia pros dois formatos.

---

## File Structure

- `supabase/migrations/2026060112????_lojas_schema_e_endereco.sql` — versiona `lojas` + colunas de endereço.
- `scripts/db-changes/importar-pontos-interesse.ts` — lê o `.xls`, faz dry-run e upsert por `codigo_unitrac`. (segue padrão de `scripts/db-changes/` existente: snapshot antes, --apply pra gravar)
- `src/lib/lojas/catalogo.ts` — `LojaRow` ganha `endereco/bairro/municipio`; nova fn `matchGeoEndereco`.
- `src/lib/lojas/match-geo-endereco.ts` — função pura + testes (novo).
- `src/lib/kpi/matcher.ts` — novo passo (atrás de flag explícita), marca `algorithm:'geo'`.
- `src/lib/kpi/status-rota.ts` — status de FORA_BASE casado por geo.
- `src/app/api/kpi/preview/route.ts` + `kpi/simples/route.ts` — SELECT das colunas novas + expor estratégia.
- `src/app/painel/kpi/simples/page.tsx` — badge na revisão.

---

## Task 1: Versionar schema de `lojas` + colunas de endereço (migration)

**Files:** Create `supabase/migrations/<ts>_lojas_schema_e_endereco.sql`

- [ ] **Step 1:** Capturar o schema REAL atual da tabela `lojas` no Supabase (via MCP `list_tables` ou `\d lojas`) e escrever `CREATE TABLE IF NOT EXISTS` idempotente refletindo o estado + `ALTER TABLE ADD COLUMN IF NOT EXISTS` para `endereco text`, `bairro text`, `municipio text`, `numero text`. Manter RLS já existente.
- [ ] **Step 2:** Index `create index if not exists idx_lojas_municipio on lojas (municipio)` (filtro do match).
- [ ] **Step 3:** Aplicar em branch/staging do Supabase, confirmar `select count(*) from lojas` intacto.
- [ ] **Step 4:** `git add supabase/migrations && git commit -m "feat(db): versiona schema lojas + colunas de endereco"`

## Task 2: Importar Pontos de Interesse pro cadastro (endereço + lat/lng/raio)

**Files:** Create `scripts/db-changes/importar-pontos-interesse.ts`

- [ ] **Step 1:** Script que lê `C:/Users/media/Downloads/unitrac_pontointeresse_consulta (6).xls` com SheetJS (extrair vendor tarball ou usar import do projeto), mapeia colunas `IDENTIFICADOR→codigo_unitrac`, `ENDEREÇO→endereco`, `BAIRRO`, `MUNICÍPIO`, `NÚMERO`, `LATITUDE/LONGITUDE`, `RAIO (m)→raio_metros`.
- [ ] **Step 2:** **Dry-run default**: para cada ponto, casar com `lojas` por `codigo_unitrac`. Reportar: quantas lojas serão enriquecidas, quantos pontos NÃO têm loja correspondente (não cadastrar — só listar), conflitos de coordenada (>500 m de diferença do que já existe = avisar, não sobrescrever cego). Salvar snapshot `docs/db-changes/<ts>-pontos-import-preview.json`.
- [ ] **Step 3:** `--apply`: UPDATE só nas colunas de endereço + lat/lng/raio onde estavam nulas OU confirmadas no preview. Nunca cria loja nova (regra: loja só entra após cruzar com escala — [[feedback_kpi_validar_loja_na_escala]]).
- [ ] **Step 4:** Rodar dry-run, revisar o JSON, depois `--apply`. Commit do script + snapshot.

## Task 3: `LojaRow` + SELECTs carregam endereço

**Files:** `src/lib/lojas/catalogo.ts`, `src/app/api/kpi/preview/route.ts`, `src/app/api/kpi/simples/route.ts`

- [ ] **Step 1:** Add `endereco/bairro/municipio: string | null` ao type `LojaRow`.
- [ ] **Step 2:** Incluir essas colunas nos 3 `.select(...)` de lojas (preview, simples, e onde mais carregar). Typecheck.
- [ ] **Step 3:** `npx vitest run` + `npx tsc --noEmit`. Commit.

## Task 4: Função pura `matchGeoEndereco` (TDD) — alta precisão

**Files:** Create `src/lib/lojas/match-geo-endereco.ts` + `.test.ts`

- [ ] **Step 1 (teste primeiro):** Casos (match por COORD + confirmação rua, D1/D2):
  1. FORA_BASE a 29m de ZS Leblon, endereco contém "DIAS FERREIRA" → casa (`via:'coord'`).
  2. FORA_BASE a 200m mas rua/bairro do cadastro aparece no endereço → casa (`via:'coord+rua'`).
  3. FORA_BASE a 200m e rua NÃO confirma → NÃO casa.
  4. FORA_BASE a 600m → NÃO casa (ruído).
  5. parada sem lat/lng → não casa (sem chave).
  6. parada com `codigo_loja` → função não é chamada (call-site só p/ FORA_BASE sem código).
- [ ] **Step 2:** Implementar assinatura pura:
```typescript
export function matchGeoEndereco(
  parada: { lat: number|null; lng: number|null; endereco: string|null; classificacao: string; codigo_loja: string|null },
  lojasRede: LojaRow[],
  opts?: { hardMetros?: number; confirmMetros?: number }  // default 100 / 250
): { loja: LojaRow; via: 'coord'|'coord+rua'; distancia: number } | null
```
Regra (D2): só FORA_BASE sem `codigo_loja` e com lat/lng. Acha loja mais próxima por `haversine`. Se `dist ≤ hardMetros(100)` → casa (`coord`). Se `hardMetros < dist ≤ confirmMetros(250)` → casa **só se** `normRua(loja.endereco)` ou `normalizaNome(loja.bairro)` aparece em `normRua(parada.endereco)` (`coord+rua`). Senão null. Helper `normRua` = upper+sem-acento, remove prefixo RUA/AV/ESTR/ROD/TRAV e números (validado no `_tmp_valida_geo.ts`).
- [ ] **Step 3:** Rodar testes → PASS. Commit `feat(lojas): matchGeoEndereco pra FORA_BASE com registro de pontos`.

## Task 5: Plugar no matcher como passo explícito (não via SEM_GEO global)

**Files:** `src/lib/kpi/matcher.ts`

- [ ] **Step 1 (teste de regressão primeiro):** teste em `matcher.test.ts`: placa com 1 linha de escala sem código casado, Unitrac só com 1 parada FORA_BASE a 120 m da loja cadastrada → `cruzaEscalaUnitrac(..., { geoEndereco: true })` casa e a parada vem com `_matchMeta.algorithm==='geo'` e `requiresReview===true`. Sob `{ geoEndereco: false }` (default), continua vazio.
- [ ] **Step 2:** Adicionar parâmetro de options explícito em `cruzaEscalaUnitrac(escala, paradas, lojas, opts?: { geoEndereco?: boolean })`. NÃO usar o global `SEM_GEO` pra isso. Default `false` (mantém comportamento atual em todos os testes existentes).
- [ ] **Step 3:** Após o passo de match por código/nome (e antes de retornar), para cada linha ainda sem match com paradas FORA_BASE livres da placa, chamar `matchGeoEndereco`. Se casar: marcar parada `usada`, anexar à rota, setar `_matchMeta = { algorithm:'geo', confidence:'LOW', requiresReview:true, score:dist }`. Respeitar redes fungíveis.
- [ ] **Step 4:** `npx vitest run src/lib/kpi/matcher.test.ts` — todos passam (existentes + novo).
- [ ] **Step 5:** Ligar a flag nas rotas: em `preview/route.ts` e `simples/route.ts`, chamar `cruzaEscalaUnitrac(..., { geoEndereco: true })` (mantendo `setSemGeo(true)`).
- [ ] **Step 6 (GATE):** rodar auditoria dia 19/20 (`scripts/analise/...`) → **`Inventou` ≤ 2**, redes boas não caem. Se subir FP, apertar folga/guardas (D2). Commit.

## Task 6: Status e rótulo do match por geo

**Files:** `src/lib/kpi/status-rota.ts` (+ test), tipos em `src/lib/types/kpi.ts`

- [ ] **Step 1 (teste):** rota cujo único match veio por endereço → `derivarStatus` retorna `status:'ENTREGUE_GEO'`, `revisar:true`, `motivoRevisao:"Localizado pelo endereço cadastrado, não pelo código — confira."`.
- [ ] **Step 2:** Add `'ENTREGUE_GEO'` ao type `StatusRota` e `STATUS_LABEL['ENTREGUE_GEO']='Entregue (geo)'`. Propagar sinal `via_geo` (paradas carregam `algorithm==='geo'`) até `derivarStatus`: FORA_BASE com `loja_id` resolvido por endereço conta como entrega mas vira `ENTREGUE_GEO` (não `FORA_DE_BASE`, não `ENTREGUE` puro), sempre `revisar:true`.
- [ ] **Step 3:** Testes + commit.

## Task 7: Expor no preview + badge na pré-KPI

**Files:** `src/app/api/kpi/preview/route.ts`, `src/app/painel/kpi/simples/page.tsx`

- [ ] **Step 1:** No preview, ao montar `lojas_casadas`, marcar quais vieram por `algorithm==='geo'`. Adicionar campo `lojas_por_endereco: string[]` no bucket da placa (ou um objeto `{ nome, via }`).
- [ ] **Step 2:** Na UI da revisão, renderizar o status **`ENTREGUE (GEO)` em amarelo/âmbar** ao lado da loja (não verde como o entregue normal). Tooltip: "Localizada pelo endereço cadastrado, não pelo código do Unitrac. Confira antes de gerar."
- [ ] **Step 3:** Validar manualmente com `npm run dev` num dia real que tenha caso FORA_BASE-na-rua-da-loja (ex.: dia 19/20). Screenshot no doc. Commit.

## Task 8: Sinalizar no KPI gerado (opcional — depende de D3)

**Files:** `src/lib/kpi/gerador-kpi.ts` / `gerador-pdf.ts`

- [ ] **Step 1:** Se D3 = "conta como entregue", adicionar marcador discreto na `observacao` da linha (ex.: "loc. por endereço") pra rastreabilidade, sem quebrar o layout byte-fiel do template. Decidir com o fundador se aparece no XLSX da Tia ou só na tela.
- [ ] **Step 2:** Teste do gerador + commit.

## Task 9: Re-auditoria final e doc

- [ ] **Step 1:** Rodar auditoria dia 19 e 20 antes/depois; documentar quantas paradas FORA_BASE passaram a casar por endereço e o impacto em `Inventou`.
- [ ] **Step 2:** Escrever `docs/conversas-tia-erica/MATCH-GEO-ENDERECO.md` com antes/depois. Commit.

---

## Self-Review

**Spec coverage:** FORA_BASE sem código + endereço/coord bate → casa (Tasks 4-5) · indica na pré-KPI que foi por geo (Task 7) · entra no KPI gerado (Tasks 5/8) · não reintroduz FP (gate Task 5/9).

**Riscos:** (1) reverter a regra "FORA_BASE nunca entrega" — mitigado por alta precisão (coord+município/bairro) + flag revisar + gate `Inventou≤2`. (2) `SEM_GEO` global com race — mitigado passando flag explícita, sem tocar no global. (3) Pontos sem loja cadastrada — não cria loja ([[feedback_kpi_validar_loja_na_escala]]). (Endereço+coord existem em PDF e XLSX — sem ressalva por formato.)

**Aberto:** D1-D4 (decisões do fundador) antes de Task 4.
