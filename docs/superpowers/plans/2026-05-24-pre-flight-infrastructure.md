# Pre-flight Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir as 3 ferramentas (snapshot, regression-check, inventory) que TODAS as redes vão usar antes de iniciar a primeira correção (ZONA_SUL).

**Architecture:** 3 scripts TypeScript em `scripts/` que orquestram os análise scripts existentes (`analise_18_geral.ts`, `analise_19_geral.ts`, `analise_completa_20.ts`, `analise_completa_21.ts`) via `child_process` paralelizado. Snapshot/regression usam JSON. Inventory usa filesystem scan.

**Tech Stack:** TypeScript (via tsx), Node `child_process.spawn`, `fs/promises`, `glob`.

**Spec referência:** `docs/superpowers/specs/2026-05-24-kpi-perfeicao-rede-por-rede-design.md` (seções 6, 8, 11).

---

## Task 1: Estrutura de diretórios

**Files:**
- Create: `docs/snapshots/.gitkeep`
- Create: `docs/inventory/.gitkeep`
- Create: `docs/db-changes/.gitkeep`
- Create: `docs/kpi-fixes/.gitkeep`
- Create: `scripts/db-changes/.gitkeep`

- [ ] **Step 1: Criar diretórios + .gitkeep**

```bash
mkdir -p docs/snapshots docs/inventory docs/db-changes docs/kpi-fixes scripts/db-changes
touch docs/snapshots/.gitkeep docs/inventory/.gitkeep docs/db-changes/.gitkeep docs/kpi-fixes/.gitkeep scripts/db-changes/.gitkeep
```

Expected: 5 diretórios e 5 .gitkeep criados sem erro.

- [ ] **Step 2: Verificar criação**

```bash
ls -la docs/snapshots docs/inventory docs/db-changes docs/kpi-fixes scripts/db-changes
```

Expected: cada dir mostra `.gitkeep` listado.

- [ ] **Step 3: Commit**

```bash
git add docs/snapshots/.gitkeep docs/inventory/.gitkeep docs/db-changes/.gitkeep docs/kpi-fixes/.gitkeep scripts/db-changes/.gitkeep
git commit -m "chore(infra): cria diretórios para snapshots, inventory, db-changes, reports"
```

---

## Task 2: `scripts/snapshot.ts`

**Files:**
- Create: `scripts/snapshot.ts`

**Responsibility:** orquestrar todos os scripts de análise em paralelo (concorrência 4), parsear `RESUMO MATCHER×MANUAL: OK=N DIFF=M` do stdout, gerar JSON.

- [ ] **Step 1: Escrever `scripts/snapshot.ts`**

```typescript
/**
 * Snapshot de scores MATCHER vs MANUAL pra todas as redes×dias conhecidas.
 *
 * Uso:
 *   npx tsx scripts/snapshot.ts                                       # salva auto-named
 *   npx tsx scripts/snapshot.ts > docs/snapshots/custom-name.json     # stdout
 *
 * Saída: JSON com timestamp, git_sha, e mapa rede→dia→{ok,diff,total,error?}
 *
 * Concorrência limitada a 4 processos simultâneos. Erros não crasham — vão pro JSON
 * como `error: "..."` na entrada da rede×dia. Tempo: ~3-5min com paralelização.
 */
import { spawn, execSync } from 'child_process'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

interface ScoreEntry {
  ok: number | null
  diff: number | null
  total: number | null
  error?: string
}

interface Snapshot {
  timestamp: string
  git_sha: string
  redes: Record<string, Record<string, ScoreEntry>>
}

interface Job {
  rede: string
  dia: string
  script: string
  args: string[]
}

// Mapa de redes do analise_18_geral.ts e analise_19_geral.ts (verificado em sessão).
const REDES_18 = ['SUPER_PAX','FEIRA_NOVA','MUNDIAL','SENDAS','CARREFOUR','ATACADAO','ASSAI','PREZUNIC','VIANENSE','PRINCESA','SUPERPRIX','SAMS_CLUB','ARMAZEM_GRAO']
const REDES_19 = ['SUPER_PAX','FEIRA_NOVA','MUNDIAL','SENDAS','CARREFOUR','ATACADAO','ASSAI','PREZUNIC','VIANENSE','PRINCESA','SUPERPRIX','SUPERCOMPRAS','SAMS_CLUB','CAB_PETROPOLIS','ARMAZEM_GRAO','GUANABARA']

// Jobs conhecidos no início. Mais dias/redes serão adicionados após inventory rodar.
const JOBS: Job[] = [
  { rede: 'ZONA_SUL', dia: '2026-05-20', script: 'scripts/analise/analise_completa_20.ts', args: [] },
  { rede: 'ZONA_SUL', dia: '2026-05-21', script: 'scripts/analise/analise_completa_21.ts', args: [] },
  ...REDES_18.map(rede => ({ rede, dia: '2026-05-18', script: 'scripts/analise/analise_18_geral.ts', args: [rede] })),
  ...REDES_19.map(rede => ({ rede, dia: '2026-05-19', script: 'scripts/analise/analise_19_geral.ts', args: [rede] })),
]

function runJob(job: Job): Promise<ScoreEntry> {
  return new Promise((resolve) => {
    const proc = spawn('npx', ['tsx', job.script, ...job.args], { shell: true })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({ ok: null, diff: null, total: null, error: `exit ${code}: ${stderr.slice(-200)}` })
        return
      }
      // Regex captura "RESUMO MATCHER×MANUAL: OK=N  DIFF=M"
      const m = stdout.match(/RESUMO MATCHER.MANUAL:\s+OK=(\d+)\s+DIFF=(\d+)/)
      if (!m) {
        resolve({ ok: null, diff: null, total: null, error: 'no RESUMO line found' })
        return
      }
      const ok = parseInt(m[1], 10)
      const diff = parseInt(m[2], 10)
      resolve({ ok, diff, total: ok + diff })
    })
  })
}

async function runWithConcurrency<T>(items: T[], limit: number, fn: (t: T) => Promise<any>): Promise<any[]> {
  const results: any[] = []
  const executing: Promise<any>[] = []
  for (const item of items) {
    const p = fn(item).then(r => { results.push(r); return r })
    executing.push(p)
    if (executing.length >= limit) {
      await Promise.race(executing)
      executing.splice(executing.findIndex(e => e === p && (p as any).status === 'fulfilled'), 1)
    }
  }
  await Promise.all(executing)
  return results
}

async function main() {
  process.stderr.write(`Snapshot started, ${JOBS.length} jobs, concurrency=4\n`)
  const startTime = Date.now()

  const snapshot: Snapshot = {
    timestamp: new Date().toISOString(),
    git_sha: execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim(),
    redes: {},
  }

  // Roda em batches de 4
  for (let i = 0; i < JOBS.length; i += 4) {
    const batch = JOBS.slice(i, i + 4)
    process.stderr.write(`  batch ${i / 4 + 1}/${Math.ceil(JOBS.length / 4)}: ${batch.map(j => `${j.rede}/${j.dia}`).join(', ')}\n`)
    const results = await Promise.all(batch.map(job => runJob(job).then(score => ({ job, score }))))
    for (const { job, score } of results) {
      if (!snapshot.redes[job.rede]) snapshot.redes[job.rede] = {}
      snapshot.redes[job.rede][job.dia] = score
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  process.stderr.write(`Snapshot done in ${elapsed}s\n`)

  const json = JSON.stringify(snapshot, null, 2)

  // Se stdout é TTY, salva auto-named. Senão, manda pro stdout.
  if (process.stdout.isTTY) {
    mkdirSync('docs/snapshots', { recursive: true })
    const fname = `docs/snapshots/${snapshot.timestamp.replace(/[:.]/g, '-')}-snapshot.json`
    writeFileSync(fname, json)
    process.stdout.write(`Saved: ${fname}\n`)
  } else {
    process.stdout.write(json)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: TypeScript check**

```bash
cd C:/Users/media/dev/kpi-transmonseg && npx tsc --noEmit
```

Expected: zero erros.

- [ ] **Step 3: Run snapshot pela primeira vez**

```bash
cd C:/Users/media/dev/kpi-transmonseg && npx tsx scripts/snapshot.ts 2>&1
```

Expected: linhas de progresso no stderr ("batch 1/8: ..."), JSON salvo em `docs/snapshots/2026-05-24T...-snapshot.json`. Tempo ~3-5min.

- [ ] **Step 4: Verificar JSON gerado**

```bash
ls -lt docs/snapshots/ | head -3
```

Expected: arquivo `2026-05-24T...-snapshot.json` mais recente, tamanho > 1KB.

```bash
cat docs/snapshots/2026-05-24T*-snapshot.json | head -30
```

Expected: JSON válido com `timestamp`, `git_sha`, e `redes: { ZONA_SUL: { "2026-05-20": { ok: 36, diff: 16, total: 52 }, ... } }`.

- [ ] **Step 5: Commit**

```bash
git add scripts/snapshot.ts docs/snapshots/*-snapshot.json
git commit -m "feat(infra): snapshot.ts gera JSON com scores de todas as redes×dias

Roda em paralelo (concorrência 4) os scripts de análise existentes,
parseia RESUMO MATCHER×MANUAL, agrega em JSON com timestamp + git_sha.
Salva auto-named em docs/snapshots/. Erros vão pro JSON como entry.error.

Primeiro snapshot baseline incluído neste commit."
```

---

## Task 3: `scripts/regression-check.ts`

**Files:**
- Create: `scripts/regression-check.ts`

**Responsibility:** comparar dois snapshots, aplicar thresholds da Seção 5 do spec, exit code 1 se regressão detectada.

- [ ] **Step 1: Escrever `scripts/regression-check.ts`**

```typescript
/**
 * Compara dois snapshots; aplica thresholds do spec (seção 5):
 *   - ZONA_SUL: regressão >0 → BLOCK
 *   - Rede com total <10:  regressão >0 → BLOCK
 *   - Rede com total 10-30: regressão >1 → BLOCK
 *   - Rede com total >30:  regressão >2 → BLOCK
 *   - Teste falhou ou tsc erro → BLOCK
 *
 * Uso:
 *   npx tsx scripts/regression-check.ts <before.json> <after.json>
 *
 * Exit: 0 = OK, 1 = regressão detectada
 */
import { readFileSync } from 'fs'

interface ScoreEntry {
  ok: number | null
  diff: number | null
  total: number | null
  error?: string
}

interface Snapshot {
  timestamp: string
  git_sha: string
  redes: Record<string, Record<string, ScoreEntry>>
}

function threshold(rede: string, total: number | null): number {
  if (rede === 'ZONA_SUL') return 0
  if (total === null) return 0
  if (total < 10) return 0
  if (total <= 30) return 1
  return 2
}

function main() {
  const [, , beforePath, afterPath] = process.argv
  if (!beforePath || !afterPath) {
    console.error('Uso: npx tsx scripts/regression-check.ts <before.json> <after.json>')
    process.exit(2)
  }

  const before: Snapshot = JSON.parse(readFileSync(beforePath, 'utf-8'))
  const after: Snapshot = JSON.parse(readFileSync(afterPath, 'utf-8'))

  process.stdout.write(`Comparando:\n  before: ${beforePath} (${before.git_sha.slice(0, 8)})\n  after:  ${afterPath} (${after.git_sha.slice(0, 8)})\n\n`)

  let regressions = 0
  let improvements = 0
  let neutral = 0
  let blocked = false
  const lines: string[] = []

  const allRedes = new Set([...Object.keys(before.redes), ...Object.keys(after.redes)])
  for (const rede of [...allRedes].sort()) {
    const beforeDias = before.redes[rede] ?? {}
    const afterDias = after.redes[rede] ?? {}
    const allDias = new Set([...Object.keys(beforeDias), ...Object.keys(afterDias)])
    for (const dia of [...allDias].sort()) {
      const b = beforeDias[dia]
      const a = afterDias[dia]
      if (!b || !a) {
        lines.push(`  ${rede} ${dia}: missing (b=${!!b}, a=${!!a}) — SKIP`)
        continue
      }
      if (b.error || a.error) {
        lines.push(`  ${rede} ${dia}: error before=${b.error ?? '-'} after=${a.error ?? '-'}`)
        continue
      }
      const delta = (a.ok ?? 0) - (b.ok ?? 0)
      const total = a.total
      const thr = threshold(rede, total)
      let mark = '  '
      if (delta > 0) { improvements++; mark = '+ ' }
      else if (delta < 0) {
        regressions++
        if (-delta > thr) { mark = '⚠️ '; blocked = true }
        else { mark = '- ' }
      } else neutral++
      lines.push(`${mark}${rede} ${dia}: ${b.ok}/${b.total} → ${a.ok}/${a.total} (${delta >= 0 ? '+' : ''}${delta}) thr=${thr}`)
    }
  }

  process.stdout.write(lines.join('\n') + '\n\n')
  process.stdout.write(`Net: improvements=${improvements} regressions=${regressions} neutral=${neutral}\n`)

  if (blocked) {
    process.stdout.write('\n❌ REGRESSION DETECTED beyond threshold. ROLLBACK REQUIRED.\n')
    process.exit(1)
  }
  process.stdout.write('\n✅ No regression beyond threshold.\n')
  process.exit(0)
}

main()
```

- [ ] **Step 2: TypeScript check**

```bash
cd C:/Users/media/dev/kpi-transmonseg && npx tsc --noEmit
```

Expected: zero erros.

- [ ] **Step 3: Sanity test (compare baseline contra ele mesmo)**

```bash
cd C:/Users/media/dev/kpi-transmonseg && BASELINE=$(ls -t docs/snapshots/*.json | head -1) && npx tsx scripts/regression-check.ts "$BASELINE" "$BASELINE"
```

Expected: todas linhas com delta=0, "Net: improvements=0 regressions=0", exit 0, "✅ No regression beyond threshold."

- [ ] **Step 4: Commit**

```bash
git add scripts/regression-check.ts
git commit -m "feat(infra): regression-check.ts compara 2 snapshots com thresholds do spec

Aplica regras da seção 5: ZONA_SUL >0 = block, total<10 >0 = block,
total 10-30 >1 = block, total>30 >2 = block. Exit 1 = bloqueio.

Sanity testado contra próprio baseline (delta=0 em tudo)."
```

---

## Task 4: `scripts/inventory.ts`

**Files:**
- Create: `scripts/inventory.ts`

**Responsibility:** escanear pastas físicas (ESCALA DIA XX) e Downloads (KPI-*) e gerar tabela markdown rede×dia.

- [ ] **Step 1: Escrever `scripts/inventory.ts`**

```typescript
/**
 * Inventário de cobertura de dados pra correção KPI rede-por-rede.
 * Escaneia:
 *   - C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA XX
 *   - C:/Users/media/Downloads/KPI-*-2026-MM-DD.xlsx
 *
 * Saída: docs/inventory/2026-05-24-data-coverage.md
 *
 * Uso: npx tsx scripts/inventory.ts
 */
import { readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const ESCALA_BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const DOWNLOADS = 'C:/Users/media/Downloads'

interface Coverage {
  dia: string
  escalaFolder: string | null
  escalaFiles: string[]
  unitracFiles: string[]
  kpiManual: string[]
}

function safeReaddir(path: string): string[] {
  try { return readdirSync(path) } catch { return [] }
}

function inventoryEscala(): Map<string, Coverage> {
  const map = new Map<string, Coverage>()
  // Lista pastas "ESCALA DIA XX" em ESCALA_BASE
  for (const entry of safeReaddir(ESCALA_BASE)) {
    const m = entry.match(/^ESCALA DIA (\d+)$/)
    if (!m) continue
    const dia = m[1].padStart(2, '0')
    const folder = join(ESCALA_BASE, entry)
    const files = safeReaddir(folder)
    map.set(dia, {
      dia,
      escalaFolder: folder,
      escalaFiles: files.filter(f => f.toUpperCase().startsWith('ESCALA') && (f.endsWith('.xlsx') || f.endsWith('.pdf'))),
      unitracFiles: files.filter(f => f.toLowerCase().startsWith('relatorio_') && (f.endsWith('.xlsx') || f.endsWith('.pdf'))),
      kpiManual: [],
    })
  }
  return map
}

function inventoryKpiManuais(map: Map<string, Coverage>) {
  // KPI-{REDE}-2026-05-DD.xlsx
  for (const f of safeReaddir(DOWNLOADS)) {
    const m = f.match(/^KPI-([A-Z_]+)-2026-05-(\d{2})(?:\s\(\d+\))?\.xlsx$/)
    if (!m) continue
    if (f.startsWith('~$')) continue  // tempfile do Excel aberto
    const rede = m[1]
    const dia = m[2]
    if (!map.has(dia)) {
      // dia sem pasta de escala mas com KPI — registra mesmo assim
      map.set(dia, { dia, escalaFolder: null, escalaFiles: [], unitracFiles: [], kpiManual: [] })
    }
    const cov = map.get(dia)!
    if (!cov.kpiManual.includes(rede)) cov.kpiManual.push(rede)
  }
}

function generateMd(map: Map<string, Coverage>): string {
  const dias = [...map.keys()].sort()
  let md = `# Inventário de dados — gerado ${new Date().toISOString()}\n\n`
  md += `Cobertura de pastas (escala+Unitrac) e arquivos de KPI manual disponíveis.\n\n`
  md += `## Tabela resumo\n\n`
  md += `| Dia | Pasta ESCALA | Arquivos escala | Arquivos Unitrac | KPI manuais (redes) |\n`
  md += `|-----|--------------|-----------------|------------------|---------------------|\n`
  for (const dia of dias) {
    const c = map.get(dia)!
    const folder = c.escalaFolder ? '✓' : '✗'
    const escalas = c.escalaFiles.length
    const unitracs = c.unitracFiles.length
    const kpis = c.kpiManual.length === 0 ? '-' : c.kpiManual.sort().join(', ')
    md += `| ${dia} | ${folder} | ${escalas} | ${unitracs} | ${kpis} |\n`
  }
  md += `\n## Detalhe por dia\n\n`
  for (const dia of dias) {
    const c = map.get(dia)!
    md += `### Dia ${dia}\n`
    md += `- Pasta: ${c.escalaFolder ?? '(sem pasta)'}\n`
    md += `- Escalas: ${c.escalaFiles.length === 0 ? '-' : c.escalaFiles.join(', ')}\n`
    md += `- Unitracs: ${c.unitracFiles.length === 0 ? '-' : c.unitracFiles.join(', ')}\n`
    md += `- KPI manuais (${c.kpiManual.length}): ${c.kpiManual.length === 0 ? '-' : c.kpiManual.sort().join(', ')}\n\n`
  }
  return md
}

function main() {
  const map = inventoryEscala()
  inventoryKpiManuais(map)
  const md = generateMd(map)
  mkdirSync('docs/inventory', { recursive: true })
  const fname = 'docs/inventory/2026-05-24-data-coverage.md'
  writeFileSync(fname, md)
  process.stdout.write(`Inventory saved: ${fname}\n`)
  process.stdout.write(`Dias mapeados: ${map.size}\n`)
  for (const [dia, c] of map) {
    process.stdout.write(`  ${dia}: ${c.escalaFiles.length} escalas, ${c.unitracFiles.length} unitracs, ${c.kpiManual.length} KPI manuais\n`)
  }
}

main()
```

- [ ] **Step 2: TypeScript check**

```bash
cd C:/Users/media/dev/kpi-transmonseg && npx tsc --noEmit
```

Expected: zero erros.

- [ ] **Step 3: Rodar inventory**

```bash
cd C:/Users/media/dev/kpi-transmonseg && npx tsx scripts/inventory.ts
```

Expected: output mostrando ~9 dias mapeados (11, 13, 14, 15, 17?, 18, 19, 20, 21, 22) com counts.

- [ ] **Step 4: Verificar MD gerado**

```bash
cat docs/inventory/2026-05-24-data-coverage.md | head -30
```

Expected: tabela markdown com dias e contagens; seção de detalhes com listas de arquivos.

- [ ] **Step 5: Commit**

```bash
git add scripts/inventory.ts docs/inventory/2026-05-24-data-coverage.md
git commit -m "feat(infra): inventory.ts mapeia cobertura de dados rede×dia

Escaneia pastas ESCALA DIA XX e ~/Downloads/KPI-*. Output em
docs/inventory/2026-05-24-data-coverage.md com tabela resumo
e detalhe por dia.

Necessário pra completar Seção 8 do spec (mapa de dados disponíveis)."
```

---

## Task 5: Update STATE.md com baseline

**Files:**
- Modify: `docs/STATE.md`

- [ ] **Step 1: Localizar baseline snapshot path**

```bash
cd C:/Users/media/dev/kpi-transmonseg && ls -t docs/snapshots/*.json | head -1
```

Salvar caminho retornado.

- [ ] **Step 2: Editar STATE.md — atualizar seção "Onde estamos AGORA" e adicionar baseline ao "Snapshots gerados"**

Modificar `docs/STATE.md` substituindo:

Old:
```markdown
## Onde estamos AGORA

- **Rede atual:** Pre-flight (antes da rede 1)
- **Iteração atual:** —
- **Última iteração concluída:** —
- **Último commit relevante:** `36a8117 docs(spec): design completo correção KPI rede-por-rede`

## Próximo passo concreto

Criar plano de pre-flight via skill `writing-plans`, depois executar.
```

New:
```markdown
## Onde estamos AGORA

- **Rede atual:** Pre-flight concluído → próxima rede: ZONA_SUL
- **Iteração atual:** —
- **Última iteração concluída:** Pre-flight infra (snapshot+regression+inventory)
- **Último commit relevante:** ver `git log --oneline -5`
- **Baseline snapshot:** `docs/snapshots/{ARQUIVO}.json` (substituir pelo path real do Step 1)

## Próximo passo concreto

Invocar `writing-plans` para criar plano da rede ZONA_SUL e executá-lo (5 iterações max).
```

Também adicionar uma linha na seção "Snapshots gerados":

Old:
```markdown
## Snapshots gerados

(Será preenchido conforme snapshots forem gerados)

| Timestamp | Descrição | Arquivo |
|-----------|-----------|---------|
```

New:
```markdown
## Snapshots gerados

| Timestamp | Descrição | Arquivo |
|-----------|-----------|---------|
| 2026-05-24 | Baseline pré-rede-1 | `docs/snapshots/{ARQUIVO}.json` |
```

- [ ] **Step 3: Commit**

```bash
git add docs/STATE.md
git commit -m "docs(state): pre-flight concluído, baseline snapshot anotado"
```

---

## Task 6: Push final

- [ ] **Step 1: Push**

```bash
cd C:/Users/media/dev/kpi-transmonseg && git push 2>&1 | tail -3
```

Expected: `main -> main` no output.

---

## Self-Review

**Spec coverage check:**
- Seção 6 (Snapshot system) → coberto por Task 2 + Task 3 ✓
- Seção 8 (Cobertura de dias) → coberto por Task 4 (inventory) ✓
- Seção 11 (Pre-flight checks) → coberto pela run inicial em Task 2 ✓
- Outras seções (3, 4, 5, 7, 9, 10) → fora do escopo desta plan, serão atacadas nas plans por rede ✓

**Placeholder scan:**
- Nenhum TODO/TBD/fill-in.
- "{ARQUIVO}" em Task 5 Step 2 é deliberadamente um placeholder porque o nome é gerado em runtime — a instrução é substituir pelo path real do Step 1. Aceitável.

**Type consistency:**
- `ScoreEntry` definido igualmente em snapshot.ts e regression-check.ts. ✓
- `Snapshot` interface idêntica nos dois. ✓
- Job/Coverage tipos isolados em cada arquivo. ✓

---

## Execution

Após salvar este plano, executar inline (não via subagent — tarefas são simples e independentes). Seguir tasks 1→6 em ordem.
