# KPI Perfeição — Correção Rede-por-Rede

**Data:** 2026-05-24
**Autor:** Claude + Joaquim
**Status:** Design para aprovação

---

## 1. Resumo executivo

**Objetivo:** Levar o `cruzaEscalaUnitrac` (matcher) a produzir KPI idêntico ao manual da Tia Érica para TODAS as redes em TODOS os dias disponíveis, ou documentar com triangulação que o restante é fisicamente impossível.

**Escopo:** 17 redes × até 9 dias (11, 13, 14, 15, 18, 19, 20, 21, 22) onde houver KPI manual + escala + Unitrac. Estimativa: ~80-100 combinações rede×dia.

**Não-escopo:**
- Mudanças em UI/frontend.
- Refatoração do matcher além do necessário para correção.
- Suporte a dias anteriores a 11/05/2026.

**Critério de sucesso global:**
- Cada rede atinge MATCHER ≥ GERADO em todos os dias avaliados.
- Todo DIFF restante após 5 iterações está triangulado (escala + Unitrac + manual) e categorizado.
- Zero regressão em ZONA_SUL (rede principal/canário).
- 263 testes vitest continuam passando.

---

## 2. Arquitetura geral

### Decomposição

Cada **rede vira um sub-projeto independente** com ciclo próprio:

```
brainstorm rede X → spec rede X → plan rede X → execute (loop) → review → commit → próxima rede
```

### Loop de execução (dentro de cada rede)

```
┌─→ ITERAÇÃO N
│   ├─ 1. Snapshot scores (todas as redes, antes do fix)
│   ├─ 2. Analisar rede X em todos os dias com dados
│   ├─ 3. Triangular cada DIFF (manual + escala + Unitrac + DB)
│   ├─ 4. Categorizar DIFFs (ver Seção 3 — Taxonomia)
│   ├─ 5. Escolher fix (código OU Supabase) por categoria
│   ├─ 6. Aplicar fix
│   ├─ 7. Vitest run (263 testes)
│   ├─ 8. Snapshot scores (todas as redes, depois do fix)
│   ├─ 9. Comparar snapshots: regressão? (ver Seção 5)
│   │     └─ SIM → rollback fix, tentar abordagem diferente
│   ├─ 10. Commit (código + DB log)
│   └─ 11. DIFFs restantes? E iteração < 5? → loop
└── DIFFs restantes E iteração = 5 → triangular um a um, documentar
```

### Triangulação de fontes (regra de ouro)

Toda decisão sobre "quem está errado" usa 3 fontes:

| Fonte | Onde | Verdade sobre |
|-------|------|---------------|
| **Manual KPI** | `~/Downloads/KPI-{REDE}-{DATA}.xlsx` | O que o operador anotou (pode ter erro humano) |
| **Escala** | `~/OneDrive/.../ESCALA DIA XX/*.xlsx` | Quem deveria entregar onde (verdade do plano) |
| **Unitrac** | `~/OneDrive/.../ESCALA DIA XX/relatorio_*.xlsx` | O que aconteceu no GPS (verdade física) |
| **+ DB lojas** | Supabase tabela `lojas` | Geofence, codigo_unitrac, raio |

**Regra de decisão:**
- Escala + Unitrac concordam, manual diverge → **manual errado** (flag, não tentar match)
- Escala + manual concordam, Unitrac diverge → veículo não foi (NAO_FOI legítimo) ou troca de placa
- Manual + Unitrac concordam, escala diverge → escala desatualizada (rara, mas existe)
- Todos divergem → análise individual

---

## 3. Taxonomia de causa raiz (10 categorias)

Toda DIFF deve cair em uma destas categorias após triangulação:

### 3.1 — `SC-CONVENTION-ANTIGA`

**Detecção:** GERADO + MANUAL concordam, MATCHER difere apenas em SC, e SC do MATCHER é *posterior* ao do MANUAL.

**Causa:** Manual antigo (dias 18 e anteriores) preenchido com convenção "SC = primeira saída do dia da BASE". Código atual usa T16 ("SC = última saída de BASE antes desta entrega").

**Frequência (esta sessão):** SUPER_PAX dia 18 (8 entradas), FEIRA_NOVA dia 18 (10), SAMS_CLUB dia 18 (3), partial ASSAI dia 18, partial PRINCESA dia 18.

**Exemplo:**
```
MATCHER: 5:14 / 5:50 / 8:00   (SC = saída antes da PRINCESA Catete)
GERADO : 5:14 / 5:50 / 8:00   (sistema também usa T16 quando gerou)
MANUAL : 4:30 / 5:50 / 8:00   (escreveu primeira saída do dia)
```

### 3.2 — `PARADA-ERRADA-MATCHED`

**Detecção:** CHD e/ou SL do MATCHER diferem do MANUAL; ambos têm timestamps; o veículo tem múltiplas paradas LOJA na mesma loja ao longo do dia.

**Sub-causas:**
- **Multi-trip:** Veículo entrega 2× na mesma loja (manhã/noite), matcher pegou a errada.
- **Cross-rede:** Veículo entrega em A→B→A; matcher pegou parada errada quando ordenou.
- **Time-slot mismatch:** Manual referencia entrega da tarde, matcher pegou a da manhã.

**Frequência:** SENDAS Campos dos Goytacazes dia 18 (4:12 vs 9:23), ASSAI Caxias I dia 18, muitos PREZUNIC.

### 3.3 — `T18-FALSO-POSITIVO`

**Detecção:** MATCHER tem CHD/SL via `match=geo(0.X)`, MANUAL = `NAO_FOI` ou `SEM`.

**Causa:** Algoritmo T18 (geo fallback de FORA_BASE quando vehicle não tem LOJA na rota) encontrou uma parada perto da loja, mas o veículo realmente não foi.

**Frequência:** PREZUNIC tem muitos (Barra da Tijuca, etc), ASSAI dia 18 Barra I.

### 3.4 — `GPS-SEM-LOJA-VERDADEIRO`

**Detecção:** `GPS:SIM [Np | 0L ...]` — veículo rastreado, zero paradas classificadas como LOJA pelo parser. Match=none ou geo.

**Sub-causas:**
- Veículo realmente não entregou (deveria ser NAO_FOI).
- Parser falhou em classificar (geofence faltando no DB).
- Loja existe no DB mas sem `codigo_unitrac` → não casa via geofence.

**Frequência:** PREZUNIC Barra da Tijuca, ASSAI Bangu II.

### 3.5 — `CROSS-REDE-CONTAMINATION`

**Detecção:** Linha escala de rede A foi atribuída a uma parada cujo `codigo_loja` mapeia para loja de rede B.

**Causa:** `findMatchByPlaca` ou T18 está cruzando redes (já tem guards parciais mas furam em casos específicos).

**Exemplo:** ABASTECEDORA GRÃO DA SERRA (ARMAZEM_GRAO) matcheando para PRINCESA MARICÁ 1.

### 3.6 — `T16-C-FALSO-POSITIVO`

**Detecção:** Veículo com `0 BASE pura`, mas paradas LOJA têm `'BASE BENASSI'` no `local_parada` (geofence sobreposto). T16-C trata como BASE exit → SC fica preenchido quando manual=---.

**Frequência:** ARMAZEM_GRAO REGINA lojas (4 entradas dia 18).

### 3.7 — `DB-LOJA-INCOMPLETA`

**Detecção:** Query `lojas` retorna loja sem `codigo_unitrac`, `lat`, `lng`, ou `raio_metros`. Match fica impossível ou usa fallbacks fracos (nome fuzzy).

**Frequência:** A descobrir via auditoria de DB.

### 3.8 — `GPS-NAO-RASTREADOR`

**Detecção:** `l.placa_norm` existe na escala, mas `gpsByPlaca.get(placa) = []` (zero paradas no Unitrac).

**Causa:** Veículo sem rastreador instalado ou rastreador offline o dia inteiro.

**Fix possível:** Nenhum no matcher. Manual = `SEM` é correto. MATCHER=`---` casa com `SEM` via `arrEq` quando `noData('SEM')=true`.

**Não-bug:** Se manual = `SEM` e MATCHER = `---`, é OK.

### 3.9 — `MANUAL-ERRADO`

**Detecção:** Escala + Unitrac (+ GERADO se disponível) concordam, manual diverge isoladamente.

**Sub-tipos:**
- Typo de horário (`5:03` em vez de `5:30`).
- Loja errada (anotou entrega errada).
- Esqueceu de preencher (deixou em branco quando deveria ter timestamp).
- Marcou `NAO_FOI` quando GPS mostra que foi.

**Ação:** Flaggar para revisão humana. Não tentar "matchar" um manual errado.

### 3.10 — `GERADO-STALE`

**Detecção:** GERADO×MANUAL = ruim, MATCHER×MANUAL = bom (ou similar), e MATCHER produz resultado claramente correto pelo Unitrac.

**Causa:** KPI armazenado em `kpis` foi gerado por código antigo (pré-bugfixes desta semana). DB tem dados desatualizados.

**Ação:** Regenerar KPI via `processar_kpi` ou UPDATE direto da row.

---

## 4. Estratégia de fix por categoria

| # | Categoria | Tipo de fix | Arquivo/Tabela | Risco | Critério rollback |
|---|-----------|-------------|----------------|-------|-------------------|
| 3.1 | SC-convention-antiga | Rede-config: campo `sc_convention` em `redes_config.ts` | `src/lib/kpi/redes-config.ts` (novo) + matcher | Médio | Score cai em qualquer rede com conv. nova |
| 3.2 | Parada-errada-matched | Refinar scoring de paradas (priorizar duração, slot horário) | `src/lib/kpi/matcher.ts` | **Alto** | Regressão >2 em qualquer rede |
| 3.3 | T18-falso-positivo | Adicionar guards (raio máximo, duração mínima, exclusão por rede vazia) | `matcher.ts` T18 logic | Médio | Regressão >2 em alguma rede |
| 3.4 | GPS-SEM-LOJA | Investigar via Unitrac raw: parser bug? geofence faltando? | `parsers/unitrac.ts` + DB `lojas` | Médio | Teste quebra |
| 3.5 | Cross-rede-contamination | Tightening de rede check no match | `matcher.ts` | **Alto** | Regressão >2 |
| 3.6 | T16-C-FP | Restringir predicado isBase em `computeSaidaCdParaParada` (talvez per-rede config) | `matcher.ts:280-300` | **Alto** | ZONA_SUL regride |
| 3.7 | DB-loja-incompleta | UPDATE `lojas` com `codigo_unitrac`, `lat`, `lng`, `raio_metros` | Supabase `lojas` | Baixo | Constraint violation |
| 3.8 | GPS-NAO-RASTREADOR | None (não tem fix) | — | — | — |
| 3.9 | Manual-errado | Flag em relatório final | `docs/kpi-fixes/...md` | — | — |
| 3.10 | GERADO-stale | UPDATE `kpis` ou re-rodar `processar_kpi` | Supabase `kpis` | Baixo | — |

**Princípio:** Fix de baixo risco primeiro (DB updates), depois código, evitando categorias 3.2, 3.5, 3.6 sem necessidade absoluta.

---

## 5. Protocolo de rollback

### Triggers de rollback

| Trigger | Threshold | Ação |
|---------|-----------|------|
| `vitest` falha em qualquer teste | 1+ teste | **Rollback imediato** |
| TypeScript erro (`tsc --noEmit`) | 1+ erro | **Rollback imediato** |
| Regressão em rede sendo trabalhada | >2 entradas | Rollback |
| Regressão em rede DIFERENTE | >0 entradas se rede tem <10 entries; >1 se 10-30; >2 se >30 | Rollback |
| Regressão em ZONA_SUL (canário) | >0 | **Rollback obrigatório** |
| Fix não melhora nem piora | — | Manter se semanticamente correto, descartar senão |
| Improvement liquido (rede X +N, rede Y -M onde N>M+1) | — | **Manter** se N ≥ M+2 |

### Mecanismos

**Git rollback:**
- Cada fix vira um commit atômico.
- `git revert <sha>` desfaz mantendo histórico.
- `git reset --hard HEAD~1` apenas se commit não foi pushed e fix ficou local.

**DB rollback:**
- Cada UPDATE Supabase é precedido por SELECT do estado anterior.
- Estado anterior gravado em `docs/db-changes/{date}-{rede}-{iter}.md` com SQL reverso.
- Script de rollback: `scripts/db-rollback/{date}-{rede}-{iter}.ts` — executa o reverso.

**Rollback condicional:**
Se o fix tem efeito misto (resolve A, quebra B), avaliar:
- Existe variante que resolve A sem quebrar B? Tenta.
- Não existe? Rede-config (escopa o fix à rede específica).
- Rede-config impraticável? Mantém estado pré-fix e documenta como "limitação".

---

## 6. Detecção de regressão cross-rede

### Sistema de snapshot

**`scripts/snapshot.ts`** (novo): roda todas as análises e gera JSON.

```typescript
// scripts/snapshot.ts
// Uso: npx tsx scripts/snapshot.ts > docs/snapshots/2026-05-24T15-30-pre-fix-prezunic.json
{
  "timestamp": "2026-05-24T15:30:00Z",
  "git_sha": "abc123",
  "redes": {
    "ZONA_SUL": {
      "2026-05-20": { "ok": 36, "diff": 16, "total": 52 },
      "2026-05-21": { "ok": 35, "diff": 17, "total": 52 }
    },
    "PREZUNIC": {
      "2026-05-18": { "ok": 5, "diff": 35, "total": 40 },
      "2026-05-19": { "ok": 8, "diff": 50, "total": 58 }
    },
    "...": {}
  },
  "tests": { "passed": 263, "failed": 0 },
  "tsc": "ok"
}
```

### Comparação automática

**`scripts/regression-check.ts`** (novo): compara dois snapshots.

```typescript
// Uso: npx tsx scripts/regression-check.ts <snapshot-before.json> <snapshot-after.json>
// Output:
// ZONA_SUL 2026-05-20: 36 → 36  (no change)
// PREZUNIC 2026-05-19: 8 → 15  (+7, IMPROVED)
// ARMAZEM_GRAO 2026-05-18: 5 → 4  (-1, REGRESSION ⚠️)
// 
// Net: +7, -1
// REGRESSION DETECTED in ARMAZEM_GRAO (>0 entries). ROLLBACK REQUIRED.
// Exit code: 1
```

### Paralelização

Análises rodam em paralelo via `Promise.all`. Cada análise leva 20-30s; 17 redes × 4 dias seriam ~30min sequencial → ~3-5min paralelo (limite concorrência: 4).

### Quando rodar

- **Antes da primeira iteração** de cada rede: snapshot baseline.
- **Após cada fix** dentro do loop: snapshot pós-fix, compara, rollback se regressão.
- **Antes de commit final** de cada rede: snapshot final, compara com baseline.

### Snapshots versionados

Salvos em `docs/snapshots/{timestamp}-{descricao}.json`. Mantém últimos 50, mais antigos pruned.

---

## 7. Trilha de auditoria Supabase

### Estrutura de log

Por sessão de mudanças (cada iteração que mexe no DB):

**`docs/db-changes/2026-05-24-{REDE_ID}-iter{N}.md`:**

```markdown
# DB Changes — REDE_ID iteração N — 2026-05-24

## UPDATE 1: lojas — adicionar codigo_unitrac para PRINCESA Catete

### Antes (SELECT)
| id | nome | codigo_unitrac | lat | lng | raio_metros |
|----|------|----------------|-----|-----|-------------|
| abc-123 | PRINCESA CATETE | NULL | -22.92 | -43.18 | 200 |

### Depois (UPDATE)
| id | nome | codigo_unitrac | lat | lng | raio_metros |
|----|------|----------------|-----|-----|-------------|
| abc-123 | PRINCESA CATETE | 8590120 | -22.92 | -43.18 | 200 |

### Justificativa
DIFF: PRINCESA Catete dia 18 → MATCHER `---/---/---`, MANUAL tem timestamps.
Investigação: Unitrac mostra parada com `codigo_loja=8590120` para esta lat/lng.
DB tinha `codigo_unitrac=NULL` → matcher caía em fallback fraco.

### SQL aplicado
```sql
UPDATE lojas
SET codigo_unitrac = '8590120'
WHERE id = 'abc-123' AND codigo_unitrac IS NULL;
```

### SQL de rollback
```sql
UPDATE lojas
SET codigo_unitrac = NULL
WHERE id = 'abc-123';
```
```

### Script de mutation com rollback

**`scripts/db-changes/2026-05-24-{REDE_ID}-iter{N}.ts`:**

```typescript
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Change {
  table: string
  id: string
  before: Record<string, any>
  after: Record<string, any>
}

const CHANGES: Change[] = [
  {
    table: 'lojas',
    id: 'abc-123',
    before: { codigo_unitrac: null },
    after: { codigo_unitrac: '8590120' },
  },
  // ... mais mudanças
]

async function apply() {
  for (const c of CHANGES) {
    // 1. Verifica estado atual === before
    const { data: current } = await supabase.from(c.table).select().eq('id', c.id).single()
    for (const k of Object.keys(c.before)) {
      if (current[k] !== c.before[k]) {
        throw new Error(`Drift: ${c.table}.${c.id}.${k} = ${current[k]}, expected ${c.before[k]}`)
      }
    }
    // 2. Aplica update
    await supabase.from(c.table).update(c.after).eq('id', c.id)
  }
}

async function rollback() {
  for (const c of CHANGES) {
    await supabase.from(c.table).update(c.before).eq('id', c.id)
  }
}

if (process.argv[2] === 'rollback') {
  rollback().then(() => console.log('Rollback OK'))
} else {
  apply().then(() => console.log('Apply OK'))
}
```

### Integridade

- Toda UPDATE precedida de SELECT (verifica que estado é o esperado).
- Se `current[k] !== before[k]`, **abort** (alguém mudou o DB entre planning e apply).
- Tabelas tocadas: principalmente `lojas`. `kpis` apenas se categoria 3.10 (regenerar via `processar_kpi`).

---

## 8. Cobertura de dias por rede

### Mapa de dados disponíveis (parcial — completado em pre-flight)

Dados confirmados em `~/OneDrive/.../CONVERSAS COM ERICA/` (pastas existem):

| Dia | Escala+Unitrac | KPI manuais conhecidos |
|-----|---|---|
| 11 | sim | inventariar em pre-flight |
| 13 | sim | inventariar em pre-flight |
| 14 | sim | inventariar em pre-flight |
| 15 | sim | 17 redes: ARMAZEM_GRAO, ASSAI, ATACADAO, CAB_PETROPOLIS, CARREFOUR, EMANUEL, FEIRA_NOVA, GUANABARA, MUNDIAL, PREZUNIC, PRINCESA, SAMS_CLUB, SENDAS, SUPER_PAX, SUPERPRIX, VIANENSE, ZONA_SUL |
| 17 | inventariar | ZONA_SUL |
| 18 | sim | 15 redes (sem CAB_PETROPOLIS, GUANABARA, SUPERCOMPRAS) |
| 19 | sim | 17 redes (todas) |
| 20 | sim | 17 redes (todas) |
| 21 | sim | ZONA_SUL apenas |
| 22 | sim | 17 redes (completo) |
| 23 | inventariar | GUANABARA |

**Pre-flight obrigatório:** primeiro passo do pipeline gera `docs/inventory/2026-05-24-data-coverage.md` com tabela completa rede×dia×fontes. Sem isso, não inicia rede 1.

### Estratégia por cobertura

- **Dias com KPI manual:** triangulação completa (manual + escala + Unitrac).
- **Dias sem KPI manual (ex: PREZUNIC dia 21):** comparação MATCHER vs *escala expectations* — toda linha da escala deve ter `paradas[0]` com timestamps coerentes (no horário comercial, com duração razoável). Anomalias são flaggadas.
- **Dia 11/13/14:** descobrir cobertura primeiro (pre-flight check), incluir se aplicável.

### Por que múltiplos dias?

Um fix validado em 1 dia pode regredir em outro. Cobertura multi-dia detecta:
- Bugs ligados a comportamento sazonal (peso de carga, multi-trip).
- Manuais com convenções antigas (dias mais velhos) vs novas.
- Falhas raras (1× por semana) que 1 dia não pega.

---

## 9. Budget de iterações

### Cap: 5 iterações por rede

| Iteração | Foco esperado |
|----------|---------------|
| 1 | Baseline + fix da maior categoria de DIFF (impacto >50%) |
| 2 | Validar fix 1 + atacar 2ª maior categoria |
| 3 | Edge cases + DB fixes |
| 4 | Limpeza + last attempts em DIFFs estruturais |
| 5 | Última tentativa; documentar triangulação dos sobreviventes |

### Tempo por iteração

| Etapa | Tempo |
|-------|-------|
| Snapshot baseline | 3-5min |
| Análise rede × dias | 1-3min |
| Triangulação de DIFFs | 10-30min (depende do nº) |
| Aplicar fix | 5-30min |
| Vitest | 1-2min |
| Snapshot pós-fix | 3-5min |
| Regression check | 1min |
| Commit + log | 5min |
| **Total** | **~30-90min/iter** |

### Tempo por rede

5 iter × 30-90min = **~2.5h-7.5h por rede**. Redes grandes (ZONA_SUL, PREZUNIC) ficarão no topo. Redes pequenas (MUNDIAL: 1 entrada) provavelmente terminam em 1 iteração.

### Tempo total estimado

17 redes × média 4h = **~68h de trabalho**. Significativamente menos para redes pequenas (~30min) e mais para grandes (~8h). Não tem prazo — qualidade > velocidade.

### Quando abortar prematuramente

Antes de 5 iterações, se:
- 2 iterações seguidas sem melhoria em DIFF count.
- Toda regressão tentada com >3 abordagens diferentes sem sucesso.
- Documentar como "limitação estrutural" e mover para próxima rede.

---

## 10. Deliverables por rede

Para cada rede, ao final do ciclo, devem existir:

```
docs/superpowers/specs/2026-05-24-rede-{REDE_ID}-design.md
docs/superpowers/plans/2026-05-24-rede-{REDE_ID}.md
docs/kpi-fixes/2026-05-24-rede-{REDE_ID}-report.md
docs/db-changes/2026-05-24-{REDE_ID}-iter1.md (se DB mudou)
docs/db-changes/2026-05-24-{REDE_ID}-iter2.md (se DB mudou)
...
scripts/db-changes/2026-05-24-{REDE_ID}-iter1.ts (mutation + rollback)
docs/snapshots/{ts}-pre-{REDE_ID}.json
docs/snapshots/{ts}-post-{REDE_ID}.json
```

### `report.md` — formato

```markdown
# Relatório: Correção REDE_ID — 2026-05-24

## Sumário
- Baseline: OK=X DIFF=Y total=Z (somando dias)
- Final: OK=X' DIFF=Y' total=Z'
- Iterações: N (de 5 cap)
- Mudanças código: M commits
- Mudanças DB: P UPDATEs

## Fixes aplicados
1. **Iter 1 — categoria 3.7 (DB-loja-incompleta):** 5 lojas sem codigo_unitrac corrigidas. Impacto: +8 OK.
2. **Iter 2 — categoria 3.3 (T18 FP):** guard de raio max=300m adicionado. Impacto: +3 OK.

## DIFFs restantes triangulados
| Loja | Dia | Categoria | Por que sobrou |
|------|-----|-----------|----------------|
| Princesa Catete | 18 | 3.9 Manual-errado | GPS+escala batem 5:11; manual escreveu 4:30 (typo provável) |
| Princesa Buzios 1 | 18 | 3.8 GPS-NAO-RASTREADOR | Placa não tem GPS no dia |
```

---

## 11. Pre-flight checks

Antes de iniciar qualquer rede:

### Setup environment
- [ ] `npx vitest run` → 263 passed
- [ ] `npx tsc --noEmit` → zero errors
- [ ] Supabase connection OK (test query em `lojas`)
- [ ] Branch `main` clean (`git status`)
- [ ] Snapshot inicial gerado (`docs/snapshots/{ts}-master-baseline.json`)

### Per rede check
- [ ] Existe KPI manual para essa rede em pelo menos 1 dia (em `~/Downloads/KPI-*`)
- [ ] Existe escala para os dias relevantes (`~/OneDrive/.../ESCALA DIA XX/`)
- [ ] Existe Unitrac `relatorio_*.xlsx` para os dias relevantes
- [ ] Existe entrada da rede no DB `lojas` (rede_id válido)

### Per dia check (dentro da rede)
- [ ] Arquivos físicos presentes
- [ ] Parser correspondente existe e tem teste passando
- [ ] DB `lojas` tem entradas para esse rede_id

---

## 12. Ordem definitiva das redes

Por volume total (somando todos os dias) — usuário escolheu "Maior volume primeiro":

| # | Rede | Volume estimado (entradas × dias) | Status atual |
|---|------|-----------------------------------|--------------|
| 1 | **ZONA_SUL** | ~52 × 4 dias = ~208 | 67-69% (já bom, polir para 95%+) |
| 2 | **PREZUNIC** | ~58 × 4 dias = ~232 | 12-14% (terrível, maior oportunidade) |
| 3 | **ASSAI** | ~40 × 4 dias = ~160 | 17-70% (misto) |
| 4 | **GUANABARA** | ~37 × 3 dias = ~111 | 51% (médio) |
| 5 | **PRINCESA** | ~26 × 4 dias = ~104 | 4-92% (dia 18 péssimo) |
| 6 | **SUPER_PAX** | ~12 × 4 = ~48 | 23-33% (SC convention antiga) |
| 7 | **FEIRA_NOVA** | ~13 × 4 = ~52 | 0-17% |
| 8 | **SENDAS** | ~10 × 4 = ~40 | 33-60% |
| 9 | **CARREFOUR** | ~10 × 4 = ~40 | 12-70% |
| 10 | **ARMAZEM_GRAO** | ~14 × 4 = ~56 | 36% (T16-C issues) |
| 11 | **SAMS_CLUB** | ~3 × 4 = ~12 | 0-100% |
| 12 | **VIANENSE** | ~4 × 4 = ~16 | 0% |
| 13 | **EMANUEL** | inventariar em pre-flight | inventariar em pre-flight |
| 14 | **ATACADAO** | ~2 × 4 = ~8 | 50% |
| 15 | **SUPERCOMPRAS** | inventariar em pre-flight | inventariar em pre-flight |
| 16 | **SUPERPRIX** | ~9 × 4 = ~36 | 0% (convention SC_2=SL_1) |
| 17 | **MUNDIAL** | ~1 × 4 = ~4 | 100% |
| 18 | **CAB_PETROPOLIS** | ~1 × 3 = ~3 | 0% |

### Por que ZONA_SUL primeiro

Maior volume, é a rede principal/canário do projeto, e qualquer regressão em ZONA_SUL bloqueia outros fixes. Estabilizar ZONA_SUL no topo garante baseline sólido.

### Justificativa por que essa ordem

Pure volume rank com regra: redes >50 volume primeiro, depois <50 em ordem de complexidade (simples primeiro).

---

## 13. Métricas de sucesso

### Por rede

- **Mínimo aceitável:** MATCHER ≥ GERADO em todos os dias.
- **Ideal:** MATCHER ≥ 90% em todos os dias.
- **Excelente:** MATCHER ≥ 95% em todos os dias.

### Global

- Zero regressão em ZONA_SUL durante toda a execução.
- 263+ testes vitest passando ao fim.
- Todo DIFF documentado com categoria.

---

## 14. Riscos e mitigações

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Fix em rede X regride rede Y | Alta | Snapshot system + rollback automático |
| DB modificado vira ruim | Média | Logs reversíveis + script rollback |
| Iterações infinitas | Média | Cap 5 + "2 iters sem melhoria → próxima rede" |
| Manual realmente é truth e código está certo | Alta | Triangulação 3 fontes + flag em report |
| Refatoração necessária trava progresso | Baixa | Mantenha matcher core estável; mude apenas o necessário |
| Sessão acaba antes de finalizar uma rede | Alta | Cada iter é commit; retomar via TaskList |

---

## 15. Out of scope

Pra deixar claro o que NÃO está no plano:

- **Refatoração arquitetural do matcher** além do necessário para fixes específicos.
- **Mudanças no schema do DB** (criar tabelas, colunas) — apenas dados.
- **Performance optimization** — código atual é rápido o suficiente para escopo.
- **UI changes** — frontend não é tocado.
- **Mudanças no pipeline MCP** além do necessário (já refatorado).
- **Suporte a novas redes** — apenas fix das 17 atuais.
- **Mudanças nas regras de negócio** — manual + escala atuais são a verdade.
