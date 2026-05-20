# KPI Match Rate 70% → 90%+ — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Melhorar a taxa de match do sistema KPI de ~70% para 90%+ usando algoritmo 3 caminhos (exato/alias → fuzzy híbrido → fila de revisão), fallback geo-proximidade para paradas FORA_BASE sem geofence, e loop de aprendizado via Supabase.

**Architecture:** Sem IA — puramente determinístico. Adicionar tabelas `canonical_loja` + `alias_loja` com sistema de confiança no Supabase (pg_trgm + unaccent). Algoritmo 3 caminhos: (1) match exato/alias, (2) score híbrido JW+Levenshtein + pg_trgm batch, (3) fila de revisão com aprendizado. Geo-proximidade como fallback para paradas `FORA_BASE` não geofenciadas (Categoria B, 32 linhas recuperáveis). O matcher.ts recebe um Supabase client opcional para backward compat.

**Tech Stack:** Next.js 16 + Supabase (pg_trgm, unaccent, pg_cron), talisman (JW+Levenshtein), pdfjs-serverless, SheetJS xlsx@0.20.3 (vendor tarball), react-data-grid v7, react-swipeable, Vitest + happy-dom

---

## Impacto Esperado por Fase

| Fase | O que resolve | Linhas recuperadas | Match rate projetado |
|------|--------------|-------------------|---------------------|
| Baseline (atual) | — | 103/149 | 70% |
| Tasks 1-5 (matcher 3-path + trgm) | Fuzzy melhor + alias DB | +7-10 | ~77% |
| Task 6 (geo-fallback) | Categoria B — FORA_BASE sem geofence | +20-28 | ~85% |
| Task 9 (review queue) | Tia Erica resolve ambiguos | +8-12 | ~90%+ |
| Task 7 (pdfjs) | PDF parse edge cases | +2-4 | ~91%+ |

### Categorias de no-match (referencia sessao 18/05)
- **Categoria A** (38 linhas): Placa nao existe no Unitrac — nao tem fix de codigo
- **Categoria B** (32 linhas): Placa OK, sem geofence → Unitrac classifica como FORA_BASE — **resolvivel via lat/lng**
- **Categoria C** (35 linhas): Cross-docking ou cadastro errado Unitrac — matcher rejeita corretamente

---

## Pre-requisitos

```powershell
# Verificar node
node --version   # 18+

# Verificar Supabase CLI
supabase --version

# Confirmar .env.local tem as vars necessarias:
# NEXT_PUBLIC_SUPABASE_URL
# SUPABASE_SERVICE_ROLE_KEY
# NEXT_PUBLIC_SUPABASE_ANON_KEY
```

---

## Mapa de arquivos — criados e modificados

```
C:\Users\media\dev\kpi-transmonseg\
├── src/
│   ├── lib/
│   │   ├── kpi/
│   │   │   ├── matcher.ts              MODIFY: assinatura async + supabase param + resolveStoreName3Path + resolveForaBaseGeo
│   │   │   └── trgm-lookup.ts          CREATE: batchTrgmLookup via RPC
│   │   ├── utils/
│   │   │   ├── score.ts                CREATE: normalizeForScore + hybridScore + isSameStore
│   │   │   └── geo.ts                  MODIFY: confirmar/adicionar haversineKm
│   │   └── parsers/
│   │       ├── unitrac-pdf-pdfjs.ts    CREATE: pdfjs-serverless parser (2-pass atoms)
│   │       ├── unitrac-pdf.ts          MODIFY: feature flag + shadow mode
│   │       └── excel-sheetjs.ts        CREATE: readSheetRows + excelSerialToDate
│   ├── types/
│   │   └── kpi.ts                      MODIFY: MatchMeta type + _matchMeta? em RotaKpi
│   ├── app/
│   │   ├── api/kpi/processar/route.ts  MODIFY: passar supabase ao matcher + inserir na review_queue
│   │   └── revisao/
│   │       └── page.tsx                CREATE: pagina da fila de revisao
│   ├── components/
│   │   ├── FilaRevisao.tsx             CREATE: react-data-grid + optimistic + realtime
│   │   └── ApplyToSimilarSheet.tsx     CREATE: bottom sheet para aprovar em lote
│   └── lib/hooks/
│       ├── useRealtimeQueue.ts         CREATE: subscription postgres_changes
│       └── useGridKeyNav.ts            CREATE: j/k keyboard nav
├── scripts/
│   └── seed-canonical.ts               CREATE: seed canonical_loja das lojas existentes
├── supabase/migrations/
│   ├── 20260519_001_extensions.sql
│   ├── 20260519_002_canonical_loja.sql
│   ├── 20260519_003_alias_loja.sql
│   ├── 20260519_004_review_queue.sql
│   ├── 20260519_005_rpc_batch.sql
│   ├── 20260519_006_rpc_approve.sql
│   └── 20260519_007_cron_decay.sql
├── vendor/
│   └── xlsx-0.20.3.tgz                 DOWNLOAD via Invoke-WebRequest
├── vitest.config.ts                    CREATE
└── package.json                        MODIFY: adicionar deps
```

---

## Task 1: Dev Setup — Vitest + deps + vendor SheetJS

**Files:**
- Create: `vitest.config.ts`
- Create: `vendor/xlsx-0.20.3.tgz` (download)
- Modify: `package.json`

- [ ] **Step 1.1: Instalar dependencias de dev**

```powershell
cd C:\Users\media\dev\kpi-transmonseg
npm install --save-dev vitest @vitest/coverage-v8 happy-dom
```

Expected: `added N packages`

- [ ] **Step 1.2: Instalar deps de runtime**

```powershell
npm install talisman react-data-grid react-swipeable
npm install --save-dev @types/react-swipeable
```

- [ ] **Step 1.3: Criar vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    pool: 'forks',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 1.4: Adicionar scripts de teste no package.json**

No `package.json`, dentro de `"scripts"`, adicionar:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 1.5: Baixar SheetJS vendor tarball**

```powershell
New-Item -ItemType Directory -Path vendor -Force | Out-Null
Invoke-WebRequest -Uri "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz" -OutFile "vendor\xlsx-0.20.3.tgz"
```

Expected: arquivo `vendor\xlsx-0.20.3.tgz` criado (~1.5MB)

- [ ] **Step 1.6: Referenciar tarball no package.json e instalar**

Em `package.json`, adicionar em `"dependencies"`:
```json
"xlsx": "file:vendor/xlsx-0.20.3.tgz"
```

```powershell
npm install
```

Expected: `added 1 package from local tarball`

- [ ] **Step 1.7: Criar smoke test para verificar setup**

Criar `src/lib/utils/score.test.ts` (stub — sera preenchido na Task 4):

```typescript
// src/lib/utils/score.test.ts
import { describe, it, expect } from 'vitest'

describe('score module', () => {
  it('placeholder — setup verification', () => {
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 1.8: Rodar teste**

```powershell
npm test
```

Expected: `1 passed`

- [ ] **Step 1.9: Commit**

```powershell
git add vitest.config.ts package.json package-lock.json vendor/xlsx-0.20.3.tgz
git commit -m "chore: add vitest + talisman + react-data-grid + vendor sheetjs"
```

---

## Task 2: Supabase Schema — canonical_loja + alias_loja + review_queue + RPCs

**Files:**
- Create: `supabase/migrations/20260519_001_extensions.sql` ate `007`

- [ ] **Step 2.1: Migration 001 — extensions**

`supabase/migrations/20260519_001_extensions.sql`:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Wrapper IMMUTABLE necessario para usar unaccent em indice funcional
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$SELECT unaccent($1)$;
```

- [ ] **Step 2.2: Migration 002 — canonical_loja**

`supabase/migrations/20260519_002_canonical_loja.sql`:
```sql
CREATE TABLE IF NOT EXISTS canonical_loja (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  nome_norm   text NOT NULL,
  lat         double precision,
  lng         double precision,
  raio_metros integer DEFAULT 300,
  rede_id     text,
  created_at  timestamptz DEFAULT now()
);

-- GIN trigram no nome normalizado — ativa operador %
CREATE INDEX IF NOT EXISTS idx_canonical_loja_trgm
  ON canonical_loja USING gin (immutable_unaccent(nome_norm) gin_trgm_ops);

ALTER TABLE canonical_loja ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read" ON canonical_loja FOR SELECT TO authenticated USING (true);
CREATE POLICY "service write"      ON canonical_loja FOR ALL    TO service_role  USING (true);
```

- [ ] **Step 2.3: Migration 003 — alias_loja**

`supabase/migrations/20260519_003_alias_loja.sql`:
```sql
CREATE TABLE IF NOT EXISTS alias_loja (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias             text NOT NULL,
  alias_norm        text NOT NULL,
  canonical_loja_id uuid NOT NULL REFERENCES canonical_loja(id) ON DELETE CASCADE,
  confidence        double precision NOT NULL DEFAULT 1.0
                    CHECK (confidence >= 0.1 AND confidence <= 1.0),
  source            text NOT NULL DEFAULT 'manual', -- seed | ocr | manual | review
  confirmacoes      integer NOT NULL DEFAULT 0,
  auto_approve      boolean NOT NULL DEFAULT false,
  last_seen_at      timestamptz DEFAULT now(),
  created_at        timestamptz DEFAULT now(),
  UNIQUE (alias_norm, canonical_loja_id)
);

CREATE INDEX IF NOT EXISTS idx_alias_loja_trgm
  ON alias_loja USING gin (immutable_unaccent(alias_norm) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_alias_loja_norm_exact
  ON alias_loja (alias_norm);

ALTER TABLE alias_loja ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read" ON alias_loja FOR SELECT TO authenticated USING (true);
CREATE POLICY "service write"      ON alias_loja FOR ALL    TO service_role  USING (true);
```

- [ ] **Step 2.4: Migration 004 — review_queue**

`supabase/migrations/20260519_004_review_queue.sql`:
```sql
CREATE TABLE IF NOT EXISTS review_queue (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escala_linha_id   uuid,  -- sem FK pois pode ser null se linha foi deletada
  data              date NOT NULL,
  rede_id           text NOT NULL,
  raw_name          text NOT NULL,
  raw_name_norm     text NOT NULL,
  matched_name      text,
  match_score       double precision,
  algorithm         text,  -- exact | alias | trgm | hybrid | geo | none
  status            text NOT NULL DEFAULT 'pending',
                    -- pending | approved | rejected | skipped
  resolved_name     text,
  resolved_by       text,
  version           integer NOT NULL DEFAULT 0,
  created_at        timestamptz DEFAULT now(),
  resolved_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_review_queue_pending
  ON review_queue (status, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_review_queue_trgm
  ON review_queue USING gin (immutable_unaccent(raw_name_norm) gin_trgm_ops);

CREATE OR REPLACE FUNCTION bump_review_version()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.version = OLD.version + 1; RETURN NEW; END;
$$;

CREATE TRIGGER trg_review_version
  BEFORE UPDATE ON review_queue
  FOR EACH ROW EXECUTE FUNCTION bump_review_version();

ALTER TABLE review_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated all" ON review_queue FOR ALL TO authenticated USING (true);
```

- [ ] **Step 2.5: Migration 005 — RPC batch_trgm_lookup e find_similar_pending**

`supabase/migrations/20260519_005_rpc_batch.sql`:
```sql
-- Batch: N nomes → melhor match de canonical_loja + alias_loja em 1 query
CREATE OR REPLACE FUNCTION batch_trgm_lookup(
  p_names     text[],
  p_threshold float DEFAULT 0.25
)
RETURNS TABLE (
  input_name   text,
  canonical_id uuid,
  canonical_nm text,
  trgm_score   float,
  match_source text
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT DISTINCT ON (t.input_name)
    t.input_name,
    c.id,
    c.name,
    similarity(immutable_unaccent(lower(trim(t.input_name))), c.nome_norm) AS trgm_score,
    'canonical'::text
  FROM unnest(p_names) AS t(input_name)
  JOIN canonical_loja c ON c.nome_norm % immutable_unaccent(lower(trim(t.input_name)))
  WHERE similarity(immutable_unaccent(lower(trim(t.input_name))), c.nome_norm) >= p_threshold

  UNION ALL

  SELECT DISTINCT ON (t.input_name)
    t.input_name,
    a.canonical_loja_id,
    c2.name,
    similarity(immutable_unaccent(lower(trim(t.input_name))), a.alias_norm) AS trgm_score,
    'alias'::text
  FROM unnest(p_names) AS t(input_name)
  JOIN alias_loja a ON a.alias_norm % immutable_unaccent(lower(trim(t.input_name)))
  JOIN canonical_loja c2 ON c2.id = a.canonical_loja_id
  WHERE similarity(immutable_unaccent(lower(trim(t.input_name))), a.alias_norm) >= p_threshold
    AND a.confidence >= 0.5

  ORDER BY input_name, trgm_score DESC
$$;

-- Busca itens pendentes similares para aplicar aprovacao em lote
CREATE OR REPLACE FUNCTION find_similar_pending(
  p_name      text,
  p_row_id    uuid,
  p_threshold float DEFAULT 0.4
)
RETURNS TABLE (id uuid, raw_name text, match_score float)
LANGUAGE sql STABLE AS $$
  SELECT rq.id, rq.raw_name,
    similarity(immutable_unaccent(lower(p_name)), rq.raw_name_norm) AS match_score
  FROM review_queue rq
  WHERE rq.status = 'pending'
    AND rq.id != p_row_id
    AND rq.raw_name_norm % immutable_unaccent(lower(p_name))
    AND similarity(immutable_unaccent(lower(p_name)), rq.raw_name_norm) >= p_threshold
  ORDER BY match_score DESC
  LIMIT 20
$$;
```

- [ ] **Step 2.6: Migration 006 — RPC bulk_approve_rows**

`supabase/migrations/20260519_006_rpc_approve.sql`:
```sql
-- Aprova itens da fila e faz upsert em alias_loja para aprendizado futuro
CREATE OR REPLACE FUNCTION bulk_approve_rows(
  p_ids             uuid[],
  p_resolved_name   text,
  p_expected_version integer DEFAULT NULL
)
RETURNS TABLE (updated_id uuid, conflict boolean)
LANGUAGE plpgsql AS $$
DECLARE
  v_canonical_id uuid;
  v_norm         text;
  v_row          review_queue;
BEGIN
  v_norm := immutable_unaccent(lower(trim(p_resolved_name)));

  SELECT id INTO v_canonical_id FROM canonical_loja WHERE nome_norm = v_norm LIMIT 1;
  IF v_canonical_id IS NULL THEN
    INSERT INTO canonical_loja (name, nome_norm) VALUES (p_resolved_name, v_norm)
    RETURNING id INTO v_canonical_id;
  END IF;

  FOR v_row IN SELECT * FROM review_queue WHERE id = ANY(p_ids) AND status = 'pending' LOOP
    IF p_expected_version IS NOT NULL AND v_row.version != p_expected_version THEN
      RETURN QUERY SELECT v_row.id, true; CONTINUE;
    END IF;

    UPDATE review_queue
    SET status = 'approved', resolved_name = p_resolved_name,
        resolved_by = current_user, resolved_at = now()
    WHERE id = v_row.id;

    -- Upsert alias para aprendizado: confidence aumenta a cada confirmacao
    INSERT INTO alias_loja
      (alias, alias_norm, canonical_loja_id, confidence, source, confirmacoes, auto_approve)
    VALUES (
      v_row.raw_name,
      immutable_unaccent(lower(trim(v_row.raw_name))),
      v_canonical_id, 0.6, 'review', 1, false
    )
    ON CONFLICT (alias_norm, canonical_loja_id) DO UPDATE SET
      confirmacoes  = alias_loja.confirmacoes + 1,
      confidence    = LEAST(1.0, alias_loja.confidence + 0.1),
      auto_approve  = CASE WHEN alias_loja.confirmacoes + 1 >= 5 THEN true
                          ELSE alias_loja.auto_approve END,
      last_seen_at  = now();

    RETURN QUERY SELECT v_row.id, false;
  END LOOP;
END;
$$;
```

- [ ] **Step 2.7: Migration 007 — pg_cron confidence decay**

`supabase/migrations/20260519_007_cron_decay.sql`:
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Roda diariamente as 3h UTC (meia-noite BRT)
-- Aliases nao vistos ha 1+ dia perdem confianca; auto_approve desativado se < 0.5
SELECT cron.schedule(
  'confidence-decay-daily',
  '0 3 * * *',
  $$
    UPDATE alias_loja SET
      confidence = GREATEST(0.1, confidence - (
        0.01 * EXTRACT(EPOCH FROM (now() - last_seen_at)) / 86400.0
      )),
      auto_approve = CASE WHEN confidence < 0.5 THEN false ELSE auto_approve END
    WHERE source != 'seed'
      AND last_seen_at < now() - INTERVAL '1 day'
      AND confidence > 0.1;
  $$
);
```

- [ ] **Step 2.8: Aplicar migrations**

```powershell
cd C:\Users\media\dev\kpi-transmonseg
supabase db push
```

Expected: 7 migrations applied. Se pg_cron der erro de permissao, comentar migration 007 e criar o job manualmente no dashboard Supabase → Database → Extensions → pg_cron.

- [ ] **Step 2.9: Verificar tabelas no Supabase Dashboard**

Abrir Table Editor. Confirmar que `canonical_loja`, `alias_loja`, `review_queue` aparecem com as colunas corretas.

- [ ] **Step 2.10: Commit**

```powershell
git add supabase/migrations/
git commit -m "feat(schema): canonical_loja + alias_loja + review_queue + pg_trgm + RPCs"
```

---

## Task 3: Seed Script — Popular canonical_loja das lojas existentes

**Files:**
- Create: `scripts/seed-canonical.ts`

- [ ] **Step 3.1: Verificar colunas da tabela lojas**

No Supabase Dashboard → Table Editor → `lojas`. Confirmar colunas disponiveis. Esperado: `id`, `name` ou `nome`, `lat`, `lng`, `raio_metros`, `rede_id` (ou variantes). Ajustar o script abaixo de acordo com as colunas reais.

- [ ] **Step 3.2: Criar seed-canonical.ts**

`scripts/seed-canonical.ts`:
```typescript
// npx tsx scripts/seed-canonical.ts --dry-run
// npx tsx scripts/seed-canonical.ts
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const DRY_RUN = process.argv.includes('--dry-run')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function main() {
  // AJUSTAR: verificar nomes reais das colunas na tabela lojas
  const { data: lojas, error } = await supabase
    .from('lojas')
    .select('id, name, lat, lng, raio_metros, rede_id')

  if (error) { console.error(error); process.exit(1) }
  console.log(`Encontradas ${lojas!.length} lojas`)

  const canonicals = lojas!.map((l: any) => ({
    name: l.name,
    nome_norm: normalizeName(l.name),
    lat: l.lat ?? null,
    lng: l.lng ?? null,
    raio_metros: l.raio_metros ?? 300,
    rede_id: l.rede_id ?? null,
  }))

  if (DRY_RUN) {
    console.table(canonicals.slice(0, 5))
    fs.writeFileSync('scripts/seed-preview.json', JSON.stringify(canonicals, null, 2))
    console.log('Preview salvo em scripts/seed-preview.json')
    return
  }

  const { error: e1 } = await supabase
    .from('canonical_loja')
    .upsert(canonicals, { onConflict: 'name' })
  if (e1) { console.error('Erro upsert canonical_loja:', e1); process.exit(1) }

  // Buscar IDs inseridos para criar aliases
  const { data: inserted, error: e2 } = await supabase
    .from('canonical_loja')
    .select('id, name, nome_norm')
  if (e2) { console.error(e2); process.exit(1) }

  // Seed alias = o proprio nome, confidence=1.0, confirmacoes=5, auto_approve=true
  const aliases = inserted!.map((c: any) => ({
    alias: c.name,
    alias_norm: c.nome_norm,
    canonical_loja_id: c.id,
    confidence: 1.0,
    source: 'seed',
    confirmacoes: 5,
    auto_approve: true,
  }))

  const { error: e3 } = await supabase
    .from('alias_loja')
    .upsert(aliases, { onConflict: 'alias_norm,canonical_loja_id' })
  if (e3) { console.error('Erro upsert alias_loja:', e3); process.exit(1) }

  console.log(`Seed completo: ${canonicals.length} canonical_loja, ${aliases.length} aliases`)
}

main().catch(console.error)
```

- [ ] **Step 3.3: Rodar dry-run**

```powershell
npx tsx scripts/seed-canonical.ts --dry-run
```

Expected: tabela impressa com lojas normalizadas. Verificar `scripts/seed-preview.json` e confirmar que os nomes estao corretos.

- [ ] **Step 3.4: Rodar seed real**

```powershell
npx tsx scripts/seed-canonical.ts
```

Expected: "Seed completo: N canonical_loja, N aliases"

- [ ] **Step 3.5: Verificar no Supabase Dashboard**

Abrir `canonical_loja` → deve ter linhas. Abrir `alias_loja` → deve ter o mesmo numero de linhas com `source='seed'`.

- [ ] **Step 3.6: Commit**

```powershell
git add scripts/seed-canonical.ts
git commit -m "feat(seed): populate canonical_loja from existing lojas table"
```

---

## Task 4: Modulo de Score Hibrido (JW + Levenshtein)

**Files:**
- Create: `src/lib/utils/score.ts`
- Modify: `src/lib/utils/score.test.ts` (substituir stub da Task 1)

- [ ] **Step 4.1: Escrever testes (TDD)**

Substituir `src/lib/utils/score.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { normalizeForScore, hybridScore, isSameStore } from './score'

describe('normalizeForScore', () => {
  it('lowercases e remove acentos', () => {
    expect(normalizeForScore('ASSAI')).toBe('assai')
    expect(normalizeForScore('Prezunic')).toBe('prezunic')
  })
  it('remove chars especiais', () => {
    expect(normalizeForScore('Zona Sul #12')).toBe('zona sul 12')
  })
  it('colapsa espacos', () => {
    expect(normalizeForScore('  Pao   de  Acucar  ')).toBe('pao de acucar')
  })
})

describe('hybridScore', () => {
  it('retorna 1.0 para strings identicas', () => {
    expect(hybridScore('assai', 'assai')).toBeCloseTo(1.0)
  })
  it('retorna score alto para variante proxima', () => {
    expect(hybridScore('prezunic', 'pruzenic')).toBeGreaterThan(0.7)
  })
  it('retorna score baixo para nomes diferentes', () => {
    expect(hybridScore('assai', 'princesa')).toBeLessThan(0.4)
  })
  it('lida com nomes truncados', () => {
    expect(hybridScore('zona', 'zona sul')).toBeGreaterThan(0.5)
  })
  it('distingue numeros diferentes', () => {
    expect(hybridScore('zona sul 18', 'zona sul 12')).toBeLessThan(0.9)
    expect(hybridScore('zona sul 18', 'zona sul 18')).toBeCloseTo(1.0)
  })
})

describe('isSameStore', () => {
  it('retorna true para match de alta confianca', () => {
    expect(isSameStore('Prezunic', 'prezunic')).toBe(true)
  })
  it('retorna false para nomes diferentes', () => {
    expect(isSameStore('Assai', 'Sendas')).toBe(false)
  })
})
```

- [ ] **Step 4.2: Rodar para verificar que falha**

```powershell
npm test -- src/lib/utils/score.test.ts
```

Expected: FAIL — `Cannot find module './score'`

- [ ] **Step 4.3: Implementar score.ts**

`src/lib/utils/score.ts`:
```typescript
import jaroWinkler from 'talisman/metrics/jaro-winkler'

export function normalizeForScore(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1])
  return dp[m][n]
}

function levNorm(a: string, b: string): number {
  if (!a || !b) return 0
  const maxLen = Math.max(a.length, b.length)
  return maxLen === 0 ? 1 : 1 - levenshtein(a, b) / maxLen
}

/**
 * Score hibrido: 60% Jaro-Winkler + 40% Levenshtein normalizado.
 * Ambos os inputs devem estar pre-normalizados via normalizeForScore().
 */
export function hybridScore(a: string, b: string): number {
  if (!a || !b) return 0
  return 0.6 * (jaroWinkler(a, b) as number) + 0.4 * levNorm(a, b)
}

/** Retorna true se score hibrido >= 0.8 */
export function isSameStore(a: string, b: string): boolean {
  return hybridScore(normalizeForScore(a), normalizeForScore(b)) >= 0.8
}
```

- [ ] **Step 4.4: Rodar testes**

```powershell
npm test -- src/lib/utils/score.test.ts
```

Expected: all PASS. Se algum teste de threshold falhar, ajustar o valor em `isSameStore` (tipicamente 0.75-0.85 funciona bem).

- [ ] **Step 4.5: Commit**

```powershell
git add src/lib/utils/score.ts src/lib/utils/score.test.ts
git commit -m "feat(utils): hybrid score JW+levenshtein for store name matching"
```

---

## Task 5: Batch trgm lookup + Matcher 3 caminhos

**Files:**
- Create: `src/lib/kpi/trgm-lookup.ts`
- Create: `src/lib/kpi/trgm-lookup.test.ts`
- Modify: `src/lib/types/kpi.ts` (adicionar MatchMeta + _matchMeta)
- Modify: `src/lib/kpi/matcher.ts` (assinatura async + resolveStoreName3Path exportada)
- Create: `src/lib/kpi/matcher.test.ts`
- Modify: `src/app/api/kpi/processar/route.ts`

- [ ] **Step 5.1: Escrever testes para trgm-lookup**

`src/lib/kpi/trgm-lookup.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { batchTrgmLookup } from './trgm-lookup'

const mockRpc = vi.fn()
const mockSupabase = { rpc: mockRpc } as any

describe('batchTrgmLookup', () => {
  it('retorna matches para nomes conhecidos', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ input_name: 'assai', canonical_id: 'abc', canonical_nm: 'Assai', trgm_score: 0.9, match_source: 'canonical' }],
      error: null
    })
    const r = await batchTrgmLookup(mockSupabase, ['assai'])
    expect(r['assai']?.canonical_nm).toBe('Assai')
  })

  it('retorna {} para nome desconhecido', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })
    expect(await batchTrgmLookup(mockSupabase, ['xyzabc'])).toEqual({})
  })

  it('retorna {} quando supabase retorna erro', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })
    expect(await batchTrgmLookup(mockSupabase, ['assai'])).toEqual({})
  })

  it('retorna {} para array vazio', async () => {
    expect(await batchTrgmLookup(mockSupabase, [])).toEqual({})
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 5.2: Rodar para verificar que falha**

```powershell
npm test -- src/lib/kpi/trgm-lookup.test.ts
```

Expected: FAIL — `Cannot find module './trgm-lookup'`

- [ ] **Step 5.3: Implementar trgm-lookup.ts**

`src/lib/kpi/trgm-lookup.ts`:
```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export interface TrgmResult {
  canonical_id: string
  canonical_nm: string
  trgm_score: number
  match_source: 'canonical' | 'alias'
}

/**
 * Batch lookup: N nomes → melhor match cada um em 1 query DB.
 * Retorna mapa: inputName → TrgmResult (usando nome exato como chave).
 */
export async function batchTrgmLookup(
  supabase: SupabaseClient,
  rawNames: string[],
  threshold = 0.25
): Promise<Record<string, TrgmResult>> {
  if (rawNames.length === 0) return {}

  const { data, error } = await supabase.rpc('batch_trgm_lookup', {
    p_names: rawNames,
    p_threshold: threshold,
  })

  if (error || !data) {
    console.error('[trgm-lookup] RPC error:', error)
    return {}
  }

  const result: Record<string, TrgmResult> = {}
  for (const row of data as any[]) {
    result[row.input_name] = {
      canonical_id: row.canonical_id,
      canonical_nm: row.canonical_nm,
      trgm_score: row.trgm_score,
      match_source: row.match_source,
    }
  }
  return result
}
```

- [ ] **Step 5.4: Rodar testes**

```powershell
npm test -- src/lib/kpi/trgm-lookup.test.ts
```

Expected: all PASS

- [ ] **Step 5.5: Adicionar MatchMeta ao kpi.ts**

Abrir `src/lib/types/kpi.ts`. Adicionar ANTES da definicao de `RotaKpi`:

```typescript
export type MatchAlgorithm = 'exact' | 'alias' | 'trgm' | 'hybrid' | 'geo' | 'none'
export type MatchConfidence = 'HIGH' | 'LOW' | 'UNMATCHED'

export interface MatchMeta {
  score: number
  confidence: MatchConfidence
  requiresReview: boolean
  algorithm: MatchAlgorithm
}
```

No tipo `RotaKpi`, adicionar ao final (campo opcional para backward compat):
```typescript
  _matchMeta?: MatchMeta
```

- [ ] **Step 5.6: Escrever testes para resolveStoreName3Path**

`src/lib/kpi/matcher.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { resolveStoreName3Path, type ResolveContext } from './matcher'

describe('resolveStoreName3Path', () => {
  const ctx: ResolveContext = {
    aliases: {
      'assai': { canonical_nm: 'Assai', canonical_id: 'a1', score: 1.0 }
    },
    trgmResults: {
      'zona sul': { canonical_nm: 'Zona Sul', canonical_id: 'z1', trgm_score: 0.85, match_source: 'canonical' as const }
    }
  }

  it('path 1: alias exato retorna HIGH confidence', () => {
    const r = resolveStoreName3Path('assai', ctx)
    expect(r.confidence).toBe('HIGH')
    expect(r.algorithm).toBe('alias')
    expect(r.requiresReview).toBe(false)
  })

  it('path 2: trgm acima de threshold retorna resultado', () => {
    const r = resolveStoreName3Path('zona sul', ctx)
    expect(r.algorithm).toBe('trgm')
    expect(['HIGH', 'LOW']).toContain(r.confidence)
  })

  it('path 3: nome desconhecido retorna UNMATCHED + requiresReview', () => {
    const r = resolveStoreName3Path('xyzloja', ctx)
    expect(r.confidence).toBe('UNMATCHED')
    expect(r.requiresReview).toBe(true)
    expect(r.algorithm).toBe('none')
  })
})
```

- [ ] **Step 5.7: Rodar para verificar que falha**

```powershell
npm test -- src/lib/kpi/matcher.test.ts
```

Expected: FAIL

- [ ] **Step 5.8: Adicionar resolveStoreName3Path no matcher.ts**

Abrir `src/lib/kpi/matcher.ts`. Adicionar no TOPO:
```typescript
import { normalizeForScore } from '@/lib/utils/score'
import type { MatchMeta, MatchAlgorithm, MatchConfidence } from '@/lib/types/kpi'
import { batchTrgmLookup, type TrgmResult } from './trgm-lookup'
import type { SupabaseClient } from '@supabase/supabase-js'
```

Adicionar NO FINAL do arquivo (antes de qualquer export existente):
```typescript
export interface ResolveContext {
  aliases: Record<string, { canonical_nm: string; canonical_id: string; score: number }>
  trgmResults: Record<string, TrgmResult>
}

/**
 * Parte pura do algoritmo 3 caminhos — sem side effects.
 * Path 1: alias exato (HIGH se score >= 0.85, LOW se < 0.85)
 * Path 2: trgm fuzzy >= 0.6 (HIGH se score >= 0.85, LOW senao)
 * Path 3: nenhum match → UNMATCHED + requiresReview=true
 */
export function resolveStoreName3Path(rawName: string, ctx: ResolveContext): MatchMeta {
  const norm = normalizeForScore(rawName)

  // Path 1: alias exato
  const alias = ctx.aliases[norm]
  if (alias) {
    return {
      score: alias.score,
      confidence: alias.score >= 0.85 ? 'HIGH' : 'LOW',
      requiresReview: alias.score < 0.6,
      algorithm: 'alias',
    }
  }

  // Path 2: trgm fuzzy
  const trgm = ctx.trgmResults[rawName] ?? ctx.trgmResults[norm]
  if (trgm && trgm.trgm_score >= 0.6) {
    return {
      score: trgm.trgm_score,
      confidence: trgm.trgm_score >= 0.85 ? 'HIGH' : 'LOW',
      requiresReview: trgm.trgm_score < 0.75,
      algorithm: 'trgm',
    }
  }

  // Path 3: sem match
  return {
    score: trgm?.trgm_score ?? 0,
    confidence: 'UNMATCHED',
    requiresReview: true,
    algorithm: 'none',
  }
}
```

- [ ] **Step 5.9: Rodar testes do matcher**

```powershell
npm test -- src/lib/kpi/matcher.test.ts
```

Expected: all PASS

- [ ] **Step 5.10: Tornar cruzaEscalaUnitrac async com supabase param**

Em `src/lib/kpi/matcher.ts`, localizar a funcao `cruzaEscalaUnitrac`. Ela provavelmente e sincrona hoje. Modificar a assinatura:

```typescript
// Antes (verificar assinatura atual):
export function cruzaEscalaUnitrac(
  escalas: EscalaLinhaRow[],
  paradas: UnitracParadaRow[],
  lojas: LojaRow[]
): RotaKpi[]

// Depois:
export async function cruzaEscalaUnitrac(
  escalas: EscalaLinhaRow[],
  paradas: UnitracParadaRow[],
  lojas: LojaRow[],
  supabase?: SupabaseClient
): Promise<RotaKpi[]>
```

No inicio do corpo da funcao (antes do loop principal), adicionar:
```typescript
// Pre-fetch batch trgm para todos os nomes de loja desta execucao
let trgmResults: Record<string, TrgmResult> = {}
if (supabase) {
  const allNames = [...new Set(escalas.map(e => e.loja_nome).filter(Boolean))] as string[]
  trgmResults = await batchTrgmLookup(supabase, allNames)
}
```

Apos a logica existente de matching (onde `loja_id` pode ficar null), adicionar o fallback trgm. **ATENCAO**: ler as linhas 205-367 de matcher.ts integralmente antes de alterar. Inserir o fallback APENAS onde `loja_id` ou `nome` estiver undefined/null apos o algoritmo existente:

```typescript
// Fallback trgm para paradas sem match
if (!paradaKpi.loja_id && trgmResults[nomeLoja]) {
  const trgm = trgmResults[nomeLoja]
  paradaKpi.loja_id = trgm.canonical_id
  paradaKpi.nome = trgm.canonical_nm
  // Marcar _matchMeta no RotaKpi pai
}
```

- [ ] **Step 5.11: Atualizar chamada em processar/route.ts**

Abrir `src/app/api/kpi/processar/route.ts`. Localizar a chamada de `cruzaEscalaUnitrac` (~linha 102). Passar o supabase client e adicionar await:

```typescript
// Antes:
const rotas = cruzaEscalaUnitrac(escalas, paradas, lojas)
// Depois:
const rotas = await cruzaEscalaUnitrac(escalas, paradas, lojas, supabase)
```

O `supabase` client ja esta disponivel nesta route via `createClient()`.

- [ ] **Step 5.12: Verificar build**

```powershell
npm run build
```

Corrigir qualquer erro TypeScript antes de continuar.

- [ ] **Step 5.13: Commit**

```powershell
git add src/lib/kpi/trgm-lookup.ts src/lib/kpi/trgm-lookup.test.ts src/lib/kpi/matcher.ts src/lib/kpi/matcher.test.ts src/lib/types/kpi.ts src/app/api/kpi/processar/route.ts
git commit -m "feat(matcher): 3-path algorithm + batch pg_trgm lookup + _matchMeta"
```

---

## Task 6: Fallback Geo-Proximidade para FORA_BASE (Categoria B)

A Categoria B sao 32 linhas onde o caminhao chegou na loja mas o Unitrac classificou como FORA_BASE por falta de geofence. Com lat/lng na canonical_loja, recuperamos esses matches.

**Files:**
- Modify: `src/lib/utils/geo.ts` (confirmar/adicionar haversineKm)
- Modify: `src/lib/kpi/matcher.ts` (adicionar resolveForaBaseGeo)
- Modify: `src/lib/kpi/matcher.test.ts` (adicionar testes)

- [ ] **Step 6.1: Verificar geo.ts**

Abrir `src/lib/utils/geo.ts`. Verificar se existe funcao haversine. Se nao existir, adicionar:

```typescript
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
```

- [ ] **Step 6.2: Escrever testes para resolveForaBaseGeo**

Adicionar ao `src/lib/kpi/matcher.test.ts`:
```typescript
import { resolveForaBaseGeo, type GeoStore } from './matcher'

describe('resolveForaBaseGeo', () => {
  const stores: GeoStore[] = [
    { id: 'a1', name: 'Assai Jacarepagua', lat: -22.9503, lng: -43.3650, raio_metros: 300 }
  ]

  it('retorna match para parada dentro do raio', () => {
    // ~50m de distancia
    const r = resolveForaBaseGeo(-22.9500, -43.3648, stores)
    expect(r).not.toBeNull()
    expect(r!.name).toBe('Assai Jacarepagua')
  })

  it('retorna null para parada fora do raio', () => {
    // ~5km de distancia
    const r = resolveForaBaseGeo(-22.9900, -43.4000, stores)
    expect(r).toBeNull()
  })

  it('retorna null quando lojas nao tem lat/lng', () => {
    const noGeo: GeoStore[] = [{ id: 'x', name: 'X', lat: null, lng: null, raio_metros: 300 }]
    expect(resolveForaBaseGeo(-22.9500, -43.3648, noGeo)).toBeNull()
  })
})
```

- [ ] **Step 6.3: Rodar para verificar que falha**

```powershell
npm test -- src/lib/kpi/matcher.test.ts
```

Expected: FAIL — `resolveForaBaseGeo is not exported`

- [ ] **Step 6.4: Implementar resolveForaBaseGeo no matcher.ts**

Adicionar ao final de `src/lib/kpi/matcher.ts`:
```typescript
import { haversineKm } from '@/lib/utils/geo'

export interface GeoStore {
  id: string
  name: string
  lat: number | null
  lng: number | null
  raio_metros: number
}

/**
 * Para uma parada FORA_BASE com coordenadas, encontra a canonical_loja
 * mais proxima dentro do seu raio. Retorna a loja ou null.
 */
export function resolveForaBaseGeo(lat: number, lng: number, stores: GeoStore[]): GeoStore | null {
  let best: GeoStore | null = null
  let bestDist = Infinity

  for (const store of stores) {
    if (store.lat == null || store.lng == null) continue
    const distM = haversineKm(lat, lng, store.lat, store.lng) * 1000
    if (distM <= store.raio_metros && distM < bestDist) {
      best = store
      bestDist = distM
    }
  }
  return best
}
```

- [ ] **Step 6.5: Rodar testes**

```powershell
npm test -- src/lib/kpi/matcher.test.ts
```

Expected: all PASS

- [ ] **Step 6.6: Integrar geo fallback em cruzaEscalaUnitrac**

Em `matcher.ts`, o `cruzaEscalaUnitrac` ja recebe `lojas: LojaRow[]`. Adicionar parametro `geoStores?: GeoStore[]`:

```typescript
export async function cruzaEscalaUnitrac(
  escalas: EscalaLinhaRow[],
  paradas: UnitracParadaRow[],
  lojas: LojaRow[],
  supabase?: SupabaseClient,
  geoStores?: GeoStore[]   // canonical_loja com lat/lng — para fallback FORA_BASE
): Promise<RotaKpi[]>
```

Dentro do loop de matching, apos todas as tentativas de match falharem e `loja_id` ainda for null:
```typescript
// Fallback geo para paradas FORA_BASE
if (!paradaKpi.loja_id && geoStores && paradaFB.lat != null && paradaFB.lng != null) {
  const geoMatch = resolveForaBaseGeo(paradaFB.lat, paradaFB.lng, geoStores)
  if (geoMatch) {
    paradaKpi.loja_id = geoMatch.id
    paradaKpi.nome = geoMatch.name
    // _matchMeta.algorithm = 'geo'
  }
}
```

- [ ] **Step 6.7: Buscar geoStores em processar/route.ts e passar ao matcher**

Em `src/app/api/kpi/processar/route.ts`, adicionar antes de chamar `cruzaEscalaUnitrac`:
```typescript
// Buscar lojas com lat/lng para fallback geo (Categoria B)
const { data: geoStoresRaw } = await supabase
  .from('canonical_loja')
  .select('id, name, lat, lng, raio_metros')
  .not('lat', 'is', null)
  .not('lng', 'is', null)

const geoStores = (geoStoresRaw ?? []).map((g: any) => ({
  id: g.id,
  name: g.name,
  lat: g.lat as number,
  lng: g.lng as number,
  raio_metros: g.raio_metros ?? 300,
}))

const rotas = await cruzaEscalaUnitrac(escalas, paradas, lojas, supabase, geoStores)
```

- [ ] **Step 6.8: TAREFA MANUAL — Preencher lat/lng das lojas Categoria B**

Agendar sessao com Tia Erica para confirmar coordenadas das ~22 lojas com mais falhas FORA_BASE:
- ASSAI: ~10 lojas (verificar enderecos reais)
- ARMAZEM_GRAO: ~4 lojas
- CARREFOUR: ~4 lojas
- PREZUNIC: ~4 lojas

Usar Google Maps para pegar lat/lng exato. Inserir via Supabase Dashboard ou SQL:
```sql
UPDATE canonical_loja
SET lat = -22.XXXX, lng = -43.XXXX, raio_metros = 400
WHERE name ILIKE '%assai%barra%';
-- repetir para cada loja
```

- [ ] **Step 6.9: Verificar build**

```powershell
npm run build
```

- [ ] **Step 6.10: Commit**

```powershell
git add src/lib/kpi/matcher.ts src/lib/kpi/matcher.test.ts src/lib/utils/geo.ts src/app/api/kpi/processar/route.ts
git commit -m "feat(matcher): FORA_BASE geo-proximity fallback for Category B matches"
```

---

## Task 7: pdfjs-serverless para Unitrac PDF

**Files:**
- Create: `src/lib/parsers/unitrac-pdf-pdfjs.ts`
- Create: `src/lib/parsers/unitrac-pdf-pdfjs.test.ts`
- Modify: `src/lib/parsers/unitrac-pdf.ts` (feature flag + shadow mode)

- [ ] **Step 7.1: Instalar pdfjs-serverless**

```powershell
npm install pdfjs-serverless
```

Expected: instalado sem erros

- [ ] **Step 7.2: Verificar estrutura atual de unitrac-pdf.ts**

Abrir `src/lib/parsers/unitrac-pdf.ts`. Anotar:
- Nome da funcao principal exportada (provavel: `parseUnitracPdf`)
- Tipo de retorno (provavel: `UnitracParadaRow[]` ou `Promise<UnitracParadaRow[]>`)
- Importacoes que usa

- [ ] **Step 7.3: Criar teste (necessita fixture PDF)**

`src/lib/parsers/unitrac-pdf-pdfjs.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { parseUnitracPdfJs } from './unitrac-pdf-pdfjs'

const FIXTURE = path.resolve('scripts/fixtures/unitrac-sample.pdf')

describe('parseUnitracPdfJs', () => {
  it('retorna array de paradas de um PDF real', async () => {
    if (!fs.existsSync(FIXTURE)) {
      console.warn('Skip: fixture nao encontrada em', FIXTURE)
      return
    }
    const buf = fs.readFileSync(FIXTURE)
    const result = await parseUnitracPdfJs(buf)
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toHaveProperty('placa')
    expect(result[0]).toHaveProperty('chegada')
  })

  it('retorna [] para buffer vazio', async () => {
    expect(await parseUnitracPdfJs(Buffer.from(''))).toEqual([])
  })
})
```

- [ ] **Step 7.4: Copiar fixture PDF de amostra**

```powershell
New-Item -ItemType Directory -Path scripts\fixtures -Force | Out-Null
# Copiar um PDF do Unitrac que ja foi processado com sucesso:
Copy-Item "caminho\para\unitrac-18-05-2026.pdf" "scripts\fixtures\unitrac-sample.pdf"
```

- [ ] **Step 7.5: Verificar nomes reais das colunas do PDF Unitrac**

Rodar o parser existente com o fixture para ver os nomes das colunas:
```powershell
node -e "
const p = require('./scripts/test-pdf-parser.mjs')
" 
# Ou abrir scripts/test-pdf-parser.mjs e verificar os nomes das colunas esperados
```

Anotar os nomes exatos: `Placa`, `Chegada`, `Saida`, `Local`, `Tipo`, etc.

- [ ] **Step 7.6: Implementar unitrac-pdf-pdfjs.ts**

`src/lib/parsers/unitrac-pdf-pdfjs.ts`:
```typescript
import { getDocument, GlobalWorkerOptions } from 'pdfjs-serverless'
import type { UnitracParadaRow } from '@/lib/types/unitrac'

// pdfjs-serverless inline o worker — sem dependencias externas
;(GlobalWorkerOptions as any).workerSrc = ''

interface Atom { text: string; x: number; y: number }

async function extractAtoms(buffer: Buffer): Promise<Atom[]> {
  if (buffer.length === 0) return []
  const pdf = await getDocument({ data: buffer, useSystemFonts: true }).promise
  const atoms: Atom[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const vp = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const [,,,, x, y] = item.transform
      atoms.push({
        text: item.str.trim(),
        x,
        // PDF: origem bottom-left → converter para top-down + offset de pagina
        y: vp.height - y + (p - 1) * vp.height,
      })
    }
  }
  return atoms
}

function groupRows(atoms: Atom[], tol = 3): Atom[][] {
  const sorted = [...atoms].sort((a, b) => a.y - b.y || a.x - b.x)
  const rows: Atom[][] = []
  let row: Atom[] = [], cy = -Infinity
  for (const a of sorted) {
    if (Math.abs(a.y - cy) > tol) { if (row.length) rows.push(row); row = [a]; cy = a.y }
    else row.push(a)
  }
  if (row.length) rows.push(row)
  return rows
}

function findHeader(rows: Atom[][]): { idx: number; atoms: Atom[] } | null {
  for (let i = 0; i < rows.length; i++) {
    const texts = rows[i].map(a => a.text.toLowerCase())
    if (texts.some(t => t.includes('placa')) && texts.some(t => t.includes('chegada')))
      return { idx: i, atoms: rows[i] }
  }
  return null
}

function assignToColumn(rowAtoms: Atom[], headerAtoms: Atom[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const h of headerAtoms) {
    const closest = rowAtoms.reduce((b, c) =>
      Math.abs(c.x - h.x) < Math.abs(b.x - h.x) ? c : b
    )
    out[h.text] = closest.text
  }
  return out
}

function parseDateTime(s: string): Date | null {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  return new Date(Date.UTC(+m[3], +m[2]-1, +m[1], +m[4], +m[5], +(m[6]??'0')))
}

export async function parseUnitracPdfJs(buffer: Buffer): Promise<UnitracParadaRow[]> {
  if (buffer.length === 0) return []
  const atoms = await extractAtoms(buffer)
  const rows = groupRows(atoms)
  const header = findHeader(rows)
  if (!header) { console.error('[pdfjs] header nao encontrado'); return [] }

  return rows.slice(header.idx + 1)
    .filter(r => r.length >= 3)
    .map(r => assignToColumn(r, header.atoms))
    .flatMap(parsed => {
      // AJUSTAR nomes de colunas conforme PDF real do Unitrac (verificar step 7.5)
      const placa = parsed['Placa'] ?? parsed['PLACA'] ?? ''
      const chegadaStr = parsed['Chegada'] ?? parsed['CHEGADA'] ?? ''
      const saidaStr = parsed['Saida'] ?? parsed['SAIDA'] ?? parsed['Saída'] ?? ''
      const loja = parsed['Local'] ?? parsed['LOCAL'] ?? parsed['Loja'] ?? ''
      const tipo = (parsed['Tipo'] ?? parsed['TIPO'] ?? '').toUpperCase()

      if (!placa || !chegadaStr) return []
      const chegada = parseDateTime(chegadaStr)
      if (!chegada) return []
      const saida = parseDateTime(saidaStr) ?? chegada

      return [{
        parada_id: `${placa}-${chegadaStr}`,
        placa: placa.trim(),
        chegada,
        saida,
        loja_nome: loja.trim(),
        classificacao: tipo.includes('LOJA') ? 'LOJA' as const : 'FORA_BASE' as const,
        lat: null,
        lng: null,
      }]
    })
}
```

- [ ] **Step 7.7: Adicionar feature flag + shadow mode em unitrac-pdf.ts**

Abrir `src/lib/parsers/unitrac-pdf.ts`. Adicionar no topo:
```typescript
import { parseUnitracPdfJs } from './unitrac-pdf-pdfjs'
const USE_PDFJS = process.env.PDF_PARSER_BACKEND === 'pdfjs-serverless'
```

Renomear o corpo da funcao principal para `_parseOriginal` e criar wrapper:
```typescript
export async function parseUnitracPdf(buffer: Buffer): Promise<UnitracParadaRow[]> {
  if (USE_PDFJS) return parseUnitracPdfJs(buffer)

  const original = await _parseOriginal(buffer)

  // Shadow mode: compara resultados sem mudar output
  if (process.env.PDF_SHADOW_MODE === 'true') {
    parseUnitracPdfJs(buffer).then(shadow => {
      if (original.length !== shadow.length)
        console.log(`[pdf-shadow] mismatch: orig=${original.length} pdfjs=${shadow.length}`)
    }).catch(() => {})
  }

  return original
}

async function _parseOriginal(buffer: Buffer): Promise<UnitracParadaRow[]> {
  // ... corpo original da funcao aqui ...
}
```

- [ ] **Step 7.8: Adicionar flags ao .env.local**

```
# Ativar shadow mode (nao muda output, apenas loga diferencas)
PDF_SHADOW_MODE=true

# Para migrar para pdfjs (so depois de shadow mode validar por 3+ dias):
# PDF_PARSER_BACKEND=pdfjs-serverless
```

- [ ] **Step 7.9: Rodar testes**

```powershell
npm test -- src/lib/parsers/unitrac-pdf-pdfjs.test.ts
```

- [ ] **Step 7.10: Verificar build**

```powershell
npm run build
```

Expected: success. pdfjs-serverless e compativel com Next.js 16 (nao precisa de config especial).

- [ ] **Step 7.11: Commit**

```powershell
git add src/lib/parsers/unitrac-pdf-pdfjs.ts src/lib/parsers/unitrac-pdf.ts src/lib/parsers/unitrac-pdf-pdfjs.test.ts .env.local
git commit -m "feat(parsers): pdfjs-serverless + shadow mode + PDF_PARSER_BACKEND flag"
```

---

## Task 8: SheetJS Defensive Excel Parsing

**Files:**
- Create: `src/lib/parsers/excel-sheetjs.ts`
- Create: `src/lib/parsers/excel-sheetjs.test.ts`

- [ ] **Step 8.1: Escrever testes**

`src/lib/parsers/excel-sheetjs.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { readSheetRows, excelSerialToDate } from './excel-sheetjs'
import * as XLSX from 'xlsx'

function makeBuffer(rows: Record<string, any>[]): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

describe('readSheetRows', () => {
  it('le linhas de um xlsx', () => {
    const buf = makeBuffer([{ Placa: 'ABC1D23', Loja: 'Assai' }])
    const rows = readSheetRows(buf, 'Sheet1')
    expect(rows).toHaveLength(1)
    expect(rows[0]['Placa']).toBe('ABC1D23')
  })

  it('retorna [] para planilha vazia', () => {
    expect(readSheetRows(makeBuffer([]), 'Sheet1')).toHaveLength(0)
  })

  it('usa primeira aba quando nome nao especificado', () => {
    expect(readSheetRows(makeBuffer([{ col: 'val' }]))).toHaveLength(1)
  })
})

describe('excelSerialToDate', () => {
  it('converte serial 45797 para 18/05/2025', () => {
    const d = excelSerialToDate(45797)
    expect(d.getUTCFullYear()).toBe(2025)
    expect(d.getUTCMonth()).toBe(4)  // maio = 4
    expect(d.getUTCDate()).toBe(18)
  })
})
```

- [ ] **Step 8.2: Rodar para verificar que falha**

```powershell
npm test -- src/lib/parsers/excel-sheetjs.test.ts
```

Expected: FAIL

- [ ] **Step 8.3: Implementar excel-sheetjs.ts**

`src/lib/parsers/excel-sheetjs.ts`:
```typescript
import * as XLSX from 'xlsx'

/**
 * Le todas as linhas de uma aba Excel como objetos planos.
 * Usa SheetJS 0.20.3 com configuracoes defensivas:
 * - cellDates: false (conversao manual para evitar bugs de timezone)
 * - defval: '' (sem undefined — opcao de sheet_to_json, NAO de XLSX.read)
 */
export function readSheetRows(
  buffer: Buffer,
  sheetName?: string
): Record<string, string | number | null>[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const name = sheetName ?? wb.SheetNames[0]
  const ws = wb.Sheets[name]
  if (!ws) return []

  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false }) as Record<string, string | number | null>[]
}

/**
 * Converte data serial do Excel para Date UTC.
 * Excel serial = dias desde 1899-12-30.
 */
export function excelSerialToDate(serial: number): Date {
  const epoch = new Date(Date.UTC(1899, 11, 30))
  return new Date(epoch.getTime() + Math.round(serial * 86400000))
}
```

- [ ] **Step 8.4: Rodar testes**

```powershell
npm test -- src/lib/parsers/excel-sheetjs.test.ts
```

Expected: all PASS

- [ ] **Step 8.5: Commit**

```powershell
git add src/lib/parsers/excel-sheetjs.ts src/lib/parsers/excel-sheetjs.test.ts
git commit -m "feat(parsers): SheetJS 0.20.3 defensive Excel parser + serial date util"
```

---

## Task 9: Review Queue UI

**Files:**
- Create: `src/app/revisao/page.tsx`
- Create: `src/components/FilaRevisao.tsx`
- Create: `src/components/ApplyToSimilarSheet.tsx`
- Create: `src/lib/hooks/useRealtimeQueue.ts`
- Create: `src/lib/hooks/useGridKeyNav.ts`
- Modify: `src/app/layout.tsx` (importar CSS do react-data-grid)

- [ ] **Step 9.1: Adicionar CSS do react-data-grid ao layout.tsx**

Abrir `src/app/layout.tsx`. Adicionar no topo com os outros imports:
```typescript
import 'react-data-grid/lib/styles.css'
```

- [ ] **Step 9.2: Criar useRealtimeQueue.ts**

`src/lib/hooks/useRealtimeQueue.ts`:
```typescript
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface ReviewQueueRow {
  id: string
  raw_name: string
  matched_name: string | null
  match_score: number | null
  algorithm: string | null
  rede_id: string
  data: string
  status: string
  version: number
}

export function useRealtimeQueue() {
  const [rows, setRows] = useState<ReviewQueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('review_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .then(({ data }) => { setRows(data ?? []); setLoading(false) })

    const channel = supabase
      .channel('review_queue_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'review_queue' }, (payload) => {
        if (payload.eventType === 'INSERT' && (payload.new as ReviewQueueRow).status === 'pending') {
          setRows(prev => [...prev, payload.new as ReviewQueueRow])
        } else if (payload.eventType === 'UPDATE') {
          setRows(prev => prev.filter(r => r.id !== (payload.new as ReviewQueueRow).id)
            .concat((payload.new as ReviewQueueRow).status === 'pending' ? [payload.new as ReviewQueueRow] : []))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return { rows, setRows, loading }
}
```

- [ ] **Step 9.3: Criar useGridKeyNav.ts**

`src/lib/hooks/useGridKeyNav.ts`:
```typescript
import { useEffect } from 'react'

export function useGridKeyNav(onNext: () => void, onPrev: () => void) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'j') { e.preventDefault(); onNext() }
      if (e.key === 'k') { e.preventDefault(); onPrev() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onNext, onPrev])
}
```

- [ ] **Step 9.4: Criar ApplyToSimilarSheet.tsx**

`src/components/ApplyToSimilarSheet.tsx`:
```typescript
'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface SimilarRow { id: string; raw_name: string; match_score: number }

interface Props {
  open: boolean
  onClose: () => void
  resolvedName: string
  currentRowId: string
  onApply: (ids: string[]) => Promise<void>
}

export function ApplyToSimilarSheet({ open, onClose, resolvedName, currentRowId, onApply }: Props) {
  const [similar, setSimilar] = useState<SimilarRow[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (!open) return
    supabase.rpc('find_similar_pending', {
      p_name: resolvedName, p_row_id: currentRowId, p_threshold: 0.4
    }).then(({ data }) => setSimilar(data ?? []))
  }, [open, resolvedName, currentRowId])

  async function handleApply() {
    setLoading(true)
    await onApply([currentRowId, ...Array.from(selected)])
    setLoading(false)
    onClose()
  }

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white',
      padding: 24, boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
      borderRadius: '16px 16px 0 0', zIndex: 100
    }}>
      <h3 style={{ margin: '0 0 16px' }}>Aplicar "{resolvedName}" a linhas similares?</h3>
      {similar.length === 0
        ? <p style={{ color: '#666' }}>Nenhuma linha similar na fila.</p>
        : <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {similar.map(row => (
              <label key={row.id} style={{ display: 'flex', gap: 8, padding: '6px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.has(row.id)}
                  onChange={e => {
                    const next = new Set(selected)
                    e.target.checked ? next.add(row.id) : next.delete(row.id)
                    setSelected(next)
                  }} />
                <span>{row.raw_name}</span>
                <span style={{ marginLeft: 'auto', color: '#999', fontSize: 12 }}>
                  {(row.match_score * 100).toFixed(0)}%
                </span>
              </label>
            ))}
          </div>
      }
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button onClick={onClose}
          style={{ flex: 1, padding: 10, background: '#f5f5f5', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          Cancelar
        </button>
        <button onClick={handleApply} disabled={loading}
          style={{ flex: 2, padding: 10, background: '#10b981', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
          {loading ? 'Aplicando...' : `Aplicar a ${selected.size + 1} linha(s)`}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 9.5: Criar FilaRevisao.tsx**

`src/components/FilaRevisao.tsx`:
```typescript
'use client'
import { useState, useOptimistic, useTransition, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { Column } from 'react-data-grid'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeQueue, type ReviewQueueRow } from '@/lib/hooks/useRealtimeQueue'
import { useGridKeyNav } from '@/lib/hooks/useGridKeyNav'
import { ApplyToSimilarSheet } from './ApplyToSimilarSheet'

const DataGrid = dynamic(() => import('react-data-grid'), { ssr: false })

export function FilaRevisao() {
  const { rows, setRows, loading } = useRealtimeQueue()
  const [optimisticRows, dispatchOptimistic] = useOptimistic(
    rows,
    (state, removedId: string) => state.filter(r => r.id !== removedId)
  )
  const [, startTransition] = useTransition()
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [pending, setPending] = useState<{ id: string; name: string } | null>(null)
  const supabase = createClient()

  const onNext = useCallback(() => setSelectedIdx(i => Math.min(i + 1, optimisticRows.length - 1)), [optimisticRows.length])
  const onPrev = useCallback(() => setSelectedIdx(i => Math.max(i - 1, 0)), [])
  useGridKeyNav(onNext, onPrev)

  async function approve(ids: string[], resolvedName: string) {
    startTransition(async () => {
      ids.forEach(id => dispatchOptimistic(id))
      const { error } = await supabase.rpc('bulk_approve_rows', {
        p_ids: ids, p_resolved_name: resolvedName
      })
      if (error) {
        const { data } = await supabase.from('review_queue').select('*').eq('status', 'pending')
        setRows(data ?? [])
      }
    })
  }

  const columns: Column<ReviewQueueRow>[] = [
    { key: 'raw_name', name: 'Nome Original', width: 250 },
    { key: 'matched_name', name: 'Sugestao', width: 250 },
    {
      key: 'match_score', name: 'Score', width: 80,
      renderCell: ({ row }) => row.match_score ? `${(row.match_score * 100).toFixed(0)}%` : '-'
    },
    { key: 'rede_id', name: 'Rede', width: 120 },
    { key: 'data', name: 'Data', width: 110 },
    {
      key: 'actions', name: 'Acoes', width: 200,
      renderCell: ({ row }) => (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', height: '100%' }}>
          <button onClick={() => { setPending({ id: row.id, name: row.matched_name ?? row.raw_name }); setSheetOpen(true) }}
            style={{ padding: '4px 10px', background: '#10b981', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
            Aprovar
          </button>
          <button onClick={() => approve([row.id], row.raw_name)}
            style={{ padding: '4px 10px', background: '#e5e7eb', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
            Pular
          </button>
        </div>
      )
    }
  ]

  if (loading) return <p>Carregando...</p>
  if (optimisticRows.length === 0)
    return <p style={{ color: '#666', padding: 24 }}>Fila vazia — nenhum item pendente.</p>

  return (
    <>
      <p style={{ marginBottom: 8, fontSize: 14, color: '#666' }}>
        {optimisticRows.length} item(s) pendente(s) · j/k para navegar
      </p>
      <DataGrid
        columns={columns}
        rows={optimisticRows}
        rowHeight={44}
        selectedRows={new Set([optimisticRows[selectedIdx]?.id].filter(Boolean))}
        onSelectedRowsChange={() => {}}
        style={{ height: '60vh' }}
      />
      {pending && (
        <ApplyToSimilarSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          resolvedName={pending.name}
          currentRowId={pending.id}
          onApply={ids => approve(ids, pending.name)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 9.6: Criar pagina de revisao**

`src/app/revisao/page.tsx`:
```typescript
import { FilaRevisao } from '@/components/FilaRevisao'

export default function RevisaoPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 4 }}>Fila de Revisao</h1>
      <p style={{ marginBottom: 24, color: '#666', fontSize: 14 }}>
        Lojas que o sistema nao identificou automaticamente.
        Aprove para treinar o sistema ou pule para revisar depois.
      </p>
      <FilaRevisao />
    </main>
  )
}
```

- [ ] **Step 9.7: Verificar build**

```powershell
npm run build
```

Se erro de `react-data-grid` nao encontrado: `npm install react-data-grid`

- [ ] **Step 9.8: Testar no browser**

```powershell
npm run dev
```

Abrir `http://localhost:3000/revisao`. Verificar:
1. Pagina carrega sem erros no console
2. Tabela aparece (mesmo vazia)
3. Botao "Aprovar" abre o ApplyToSimilarSheet
4. Teclado j/k funciona para navegar linhas

- [ ] **Step 9.9: Commit**

```powershell
git add src/app/revisao/ src/components/FilaRevisao.tsx src/components/ApplyToSimilarSheet.tsx "src/lib/hooks/" src/app/layout.tsx
git commit -m "feat(ui): review queue page with realtime + apply-to-similar"
```

---

## Task 10: Inserir UNMATCHED na review_queue via processar/route.ts

**Files:**
- Modify: `src/app/api/kpi/processar/route.ts`

- [ ] **Step 10.1: Localizar o loop pos-matcher em processar/route.ts**

Abrir `src/app/api/kpi/processar/route.ts`. Localizar onde as `rotas` sao iteradas para salvar em `kpi_rotas` (apos o `await cruzaEscalaUnitrac()`).

- [ ] **Step 10.2: Adicionar import**

No topo do arquivo:
```typescript
import { normalizeForScore } from '@/lib/utils/score'
```

- [ ] **Step 10.3: Adicionar insercao na review_queue**

Apos o loop de upsert de `kpi_rotas`, adicionar:

```typescript
// Inserir rotas sem match na fila de revisao manual
const reviewInserts = rotas
  .filter(r => r._matchMeta?.confidence === 'UNMATCHED' || r._matchMeta?.requiresReview)
  .map(r => ({
    escala_linha_id: r.escala_linha_id,
    data: r.data,
    rede_id: r.rede_id,
    raw_name: r.paradas[0]?.nome ?? 'desconhecido',
    raw_name_norm: normalizeForScore(r.paradas[0]?.nome ?? ''),
    matched_name: r._matchMeta?.score && r._matchMeta.score > 0
      ? r.paradas[0]?.nome ?? null
      : null,
    match_score: r._matchMeta?.score ?? null,
    algorithm: r._matchMeta?.algorithm ?? 'none',
    status: 'pending' as const,
  }))

if (reviewInserts.length > 0) {
  const { error: qErr } = await supabase
    .from('review_queue')
    .upsert(reviewInserts, { onConflict: 'escala_linha_id' })
  if (qErr) console.error('[review_queue] erro:', qErr)
}
```

- [ ] **Step 10.4: Verificar build**

```powershell
npm run build
```

- [ ] **Step 10.5: Testar fluxo completo**

1. Processar um dia via `/api/kpi/processar` (POST com `{ data: '2026-05-18', rede_id: null }`)
2. Verificar no Supabase Dashboard que `review_queue` foi populada
3. Abrir `http://localhost:3000/revisao` e confirmar que os itens aparecem
4. Aprovar um item e verificar que `alias_loja` foi atualizado

- [ ] **Step 10.6: Commit**

```powershell
git add src/app/api/kpi/processar/route.ts
git commit -m "feat(api): populate review_queue for unmatched routes"
```

---

## Validacao Final

Apos todas as tasks implementadas, re-processar o dia 18/05/2026 e comparar com o manual:

```powershell
# 1. Rebuild e start
npm run build && npm start

# 2. Processar dia de referencia
curl -X POST http://localhost:3000/api/kpi/processar \
  -H "Content-Type: application/json" \
  -d '{"data":"2026-05-18"}'

# 3. Comparar com manual
# Esperado: match rate > 85% (antes de preencher lat/lng das lojas Categoria B)
# Esperado: match rate > 90% (apos preencher lat/lng)
```

Referencia: sessao 18/05 obteve 103/149 = 70% sem o novo sistema.

---

## SLOs

| Metrica | Atual | Meta |
|---------|-------|------|
| Match rate geral | 70% | 90%+ |
| Match rate PRINCESA | 92% | 95%+ |
| Latencia /api/kpi/processar (1 dia) | ? | < 30s |
| Itens na review_queue por dia | N/A | < 15 |
| Alias com auto_approve=true | 0 | confirmacoes >= 5 AND confidence >= 0.85 |

---

## Pos-implementacao

1. **Preencher lat/lng das lojas Categoria B**: Sessao com Tia Erica para confirmar coordenadas das ~22 lojas sem geofence Unitrac. Esse passo sozinho recupera ~15-20% de match.

2. **Calibrar thresholds**: Rodar KPI do dia 18/05 com novo sistema. Ajustar `p_threshold` do `batchTrgmLookup` (0.25 default) e threshold do `isSameStore` (0.8 default) conforme falsos positivos/negativos.

3. **Cross-docking (Categoria C)**: Confirmar com Tia Erica quais das 35 linhas sao cross-docking real. Se confirmado, remover do calculo do KPI.

4. **Migrar para pdfjs-serverless**: Apos shadow mode rodar 3-5 dias sem discrepancias, setar `PDF_PARSER_BACKEND=pdfjs-serverless` em producao.

5. **Monitor pg_cron**: Verificar que o job de decay esta rodando:
   ```sql
   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
   ```
