# Rede ZONA_SUL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar ZONA_SUL de 71/104 (68%) para ≥90% match em todos os dias disponíveis (18-22), com zero regressão nas outras 16 redes.

**Architecture:** Loop iterativo (max 5 iterações). Cada iteração: snapshot pré → análise+triangulação → fix → vitest+tsc → snapshot pós → regression-check → commit → STATE.md. Fixes seguem a taxonomia da Seção 3 do spec; estratégia segue tabela da Seção 4.

**Tech Stack:** TypeScript (tsx), Vitest, Supabase (DB direto via service role), git.

**Spec referência:** `docs/superpowers/specs/2026-05-24-kpi-perfeicao-rede-por-rede-design.md`
**Baseline pré-rede:** `docs/snapshots/2026-05-24-baseline.json` (ZONA_SUL: 71/104, dias 20+21)

---

## Task 1: `scripts/analise/analise_zonasul.ts` (analyzer genérico por data)

**Files:**
- Create: `scripts/analise/analise_zonasul.ts`

**Responsibility:** rodar comparação MATCHER×MANUAL para ZONA_SUL em qualquer data, auto-descobrindo escala/Unitrac/KPI manual. Unifica `analise_completa_20.ts` e `analise_completa_21.ts` num único entry-point parametrizado.

- [ ] **Step 1: Escrever `scripts/analise/analise_zonasul.ts`**

```typescript
/**
 * Análise ZONA_SUL para qualquer data (auto-descobre arquivos).
 *
 * Uso: npx tsx scripts/analise/analise_zonasul.ts 2026-05-18
 *
 * Auto-descobre:
 *   - Pasta:  C:/Users/media/OneDrive/.../ESCALA DIA {DD}/
 *   - Escala: arquivo começando com "ESCALA ZONA SUL"
 *   - Unitrac: arquivo começando com "relatorio_" .xlsx
 *   - KPI manual: C:/Users/media/Downloads/KPI-ZONA_SUL-{DATA}.xlsx
 */
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { config } from 'dotenv'
config({ path: '.env.local' })
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { cruzaEscalaUnitrac, type EscalaLinhaRow, type UnitracParadaRow, type LojaRow } from '@/lib/kpi/matcher'
import type { LinhaEscala } from '@/lib/types/escala'
import type { ParadaUnitrac } from '@/lib/types/unitrac'

const ESCALA_BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const DOWNLOADS = 'C:/Users/media/Downloads'

function findFiles(data: string): { escalaPath: string; unitracPath: string; kpiPath: string } {
  const dia = data.slice(-2)
  const folder = join(ESCALA_BASE, `ESCALA DIA ${dia}`)
  const files = readdirSync(folder)
  const escalaName = files.find(f => f.toUpperCase().startsWith('ESCALA ZONA SUL') && f.endsWith('.xlsx'))
  const unitracName = files.find(f => f.toLowerCase().startsWith('relatorio_') && f.endsWith('.xlsx'))
  if (!escalaName) throw new Error(`Escala ZONA SUL não encontrada em ${folder}`)
  if (!unitracName) throw new Error(`Unitrac não encontrado em ${folder}`)
  const kpiName = `KPI-ZONA_SUL-${data}.xlsx`
  return {
    escalaPath: join(folder, escalaName),
    unitracPath: join(folder, unitracName),
    kpiPath: join(DOWNLOADS, kpiName),
  }
}

function toHHMM(iso: string | Date | null | undefined): string {
  if (!iso) return '---'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.getUTCHours() + ':' + String(d.getUTCMinutes()).padStart(2, '0')
}

function fmtKpiCell(v: unknown): string {
  if (!v) return '---'
  if (typeof v === 'object' && v !== null && 'result' in v) return fmtKpiCell((v as any).result)
  if (v instanceof Date) return toHHMM(v)
  if (typeof v === 'number') {
    const s = Math.round(v * 86400)
    return Math.floor(s / 3600) + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  }
  if (typeof v === 'string') {
    if (v.includes('SEM')) return 'SEM'
    if (v.includes('NÃO') || v.includes('NAO')) return 'NAO_FOI'
  }
  return '---'
}

function cvCell(cell: ExcelJS.Cell): string {
  const v = cell?.value
  if (!v && v !== 0) return ''
  if (typeof v === 'object' && v !== null && 'richText' in v) return (v as any).richText.map((r: any) => r.text).join('').trim()
  if (typeof v === 'object' && v !== null && 'text' in v) return String((v as any).text).trim()
  return String(v).trim()
}

interface KpiLinha {
  placa1: string; mot1: string; sc1: string; chd1: string; sl1: string
  placa2: string; mot2: string; sc2: string; chd2: string; sl2: string
}

async function lerKpi(path: string): Promise<Map<string, KpiLinha>> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.worksheets[0]
  const map = new Map<string, KpiLinha>()
  for (let r = 5; r <= 70; r++) {
    const row = ws.getRow(r)
    const loja = cvCell(row.getCell(1))
    if (!loja) continue
    map.set(loja, {
      placa1: cvCell(row.getCell(4)), mot1: cvCell(row.getCell(2)),
      sc1: fmtKpiCell(row.getCell(5).value), chd1: fmtKpiCell(row.getCell(6).value), sl1: fmtKpiCell(row.getCell(7).value),
      placa2: cvCell(row.getCell(10)), mot2: cvCell(row.getCell(8)),
      sc2: fmtKpiCell(row.getCell(11).value), chd2: fmtKpiCell(row.getCell(12).value), sl2: fmtKpiCell(row.getCell(13).value),
    })
  }
  return map
}

function toEscalaRow(l: LinhaEscala, idx: number): EscalaLinhaRow {
  return {
    id: `fake-${idx}`,
    rede_id: l.rede_id,
    placa_norm: l.placa_norm,
    loja_nome_raw: l.loja_nome_raw,
    loja_codigo_raw: l.loja_codigo_raw,
    motorista_nome: l.motorista_nome,
    carro_ordem: l.carro_ordem,
    data_entrega: l.data_entrega,
    sub_rede: l.sub_rede ?? null,
  }
}

function toParadaRow(p: ParadaUnitrac, idx: number): UnitracParadaRow {
  return {
    id: `p-${idx}`,
    placa_norm: p.placa_norm,
    chegada: p.chegada instanceof Date ? p.chegada.toISOString() : String(p.chegada),
    saida: p.saida instanceof Date ? p.saida.toISOString() : (p.saida ? String(p.saida) : null),
    duracao_seg: p.duracao_seg ?? null,
    local_parada: p.local_parada ?? '',
    codigo_loja: p.codigo_loja ?? null,
    nome_loja: p.nome_loja ?? null,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    classificacao: p.classificacao,
    ordem: p.ordem,
  }
}

async function main() {
  const data = process.argv[2]
  if (!data || !/^2026-05-\d{2}$/.test(data)) {
    console.error('Uso: npx tsx scripts/analise/analise_zonasul.ts 2026-05-DD')
    process.exit(2)
  }

  const { escalaPath, unitracPath, kpiPath } = findFiles(data)
  process.stdout.write(`Carregando escala ZONA_SUL ${data}...\n`)
  const escalaRaw = await parseEscalaZonaSul(readFileSync(escalaPath), data)
  const escala = escalaRaw.map(toEscalaRow)
  process.stdout.write(`  ${escala.length} linhas\n`)

  process.stdout.write('Carregando Unitrac...\n')
  const veiculos = await parseUnitrac(readFileSync(unitracPath))
  const paradasRaw: ParadaUnitrac[] = veiculos.flatMap(v => v.paradas)
  const paradas = paradasRaw.map(toParadaRow)
  process.stdout.write(`  ${veiculos.length} veículos, ${paradas.length} paradas\n`)

  process.stdout.write('Carregando lojas do DB...\n')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { data: lojasRaw, error: lojasErr } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)
  if (lojasErr) throw new Error(`lojas: ${lojasErr.message}`)
  const lojas: LojaRow[] = (lojasRaw ?? []) as LojaRow[]
  process.stdout.write(`  ${lojas.length} lojas\n`)

  process.stdout.write('Cruzando...\n')
  const rotas = await cruzaEscalaUnitrac(escala, paradas, lojas)
  process.stdout.write(`  ${rotas.length} rotas geradas\n\n`)

  const rotaById = new Map(rotas.map(r => [r.escala_linha_id, r]))
  const gpsByPlaca = new Map<string, UnitracParadaRow[]>()
  for (const p of paradas) {
    const arr = gpsByPlaca.get(p.placa_norm) ?? []
    arr.push(p)
    gpsByPlaca.set(p.placa_norm, arr)
  }

  let kpiM: Map<string, KpiLinha>
  try {
    kpiM = await lerKpi(kpiPath)
  } catch (e) {
    process.stdout.write(`AVISO: KPI manual não disponível em ${kpiPath} (${(e as Error).message})\n`)
    kpiM = new Map()
  }

  const lojaMap = new Map<string, EscalaLinhaRow[]>()
  for (const l of escala) {
    const arr = lojaMap.get(l.loja_nome_raw) ?? []
    arr.push(l)
    lojaMap.set(l.loja_nome_raw, arr)
  }

  process.stdout.write(`=== ANÁLISE ZONA_SUL — ${data} ===\nSC=SaídaCD  CHD=ChegadaLoja  SL=SaídaLoja\n\n`)

  function noData(v: string): boolean { return v === '---' || v.startsWith('SEM') }
  function arrEq(a: string[], b: string[]): boolean {
    return a.every((v, i) => (noData(v) && noData(b[i])) || v === b[i])
  }

  let nOk = 0, nDiff = 0

  for (const [loja, slots] of lojaMap) {
    const km = kpiM.get(loja)

    for (const l of slots) {
      const rota = rotaById.get(l.id)
      const slot = l.carro_ordem
      const ps = gpsByPlaca.get(l.placa_norm ?? '') ?? []
      const pBase = ps.filter(p => p.classificacao === 'BASE')
      const pLoja = ps.filter(p => p.classificacao === 'LOJA')
      const pFora = ps.filter(p => p.classificacao === 'FORA_BASE')

      const matchSc  = rota?.saida_cd ? toHHMM(rota.saida_cd) : '---'
      const matchChd = rota?.paradas[0] ? toHHMM(rota.paradas[0].chegada) : '---'
      const matchSl  = rota?.paradas[0] ? toHHMM(rota.paradas[0].saida)   : '---'
      const matchArr = [matchSc, matchChd, matchSl]

      const mArr = slot === 1
        ? [km?.sc1 ?? '---', km?.chd1 ?? '---', km?.sl1 ?? '---']
        : [km?.sc2 ?? '---', km?.chd2 ?? '---', km?.sl2 ?? '---']

      const matchDiff = kpiM.size > 0 && !arrEq(matchArr, mArr)
      if (matchDiff) nDiff++; else nOk++

      const tag = matchDiff ? '[DIFF]' : '[OK]  '
      const algo = rota?._matchMeta?.algorithm ?? 'none'
      const score = rota?._matchMeta?.score ?? '?'
      const gpsTag = !l.placa_norm ? 'GPS:NAO-PLACA'
        : ps.length === 0 ? 'GPS:NAO'
        : `GPS:SIM [${ps.length}p | ${pBase.length}B ${pLoja.length}L ${pFora.length}F]`

      process.stdout.write(`\n${tag} [c${slot}] ${loja}\n`)
      process.stdout.write(`       ${l.motorista_nome ?? '?'} | ${l.placa_norm ?? '?'} | ${gpsTag} | match=${algo}(${score})\n`)

      for (const p of pBase.filter(x => x.saida).slice(-2)) {
        const dur = Math.round((p.duracao_seg ?? 0) / 60)
        process.stdout.write(`       BASE  chg:${toHHMM(p.chegada)} → sai:${toHHMM(p.saida)}  ${dur}min\n`)
      }
      for (const p of pLoja) {
        const dur = p.duracao_seg ? Math.round(p.duracao_seg / 60) + 'min' : '?'
        const matched = rota?.paradas.some(rp => rp.parada_id === p.id) ? ' ◄MATCHED' : ''
        process.stdout.write(`       LOJA  ${toHHMM(p.chegada)}-${toHHMM(p.saida)}  ${dur}  cod:${p.codigo_loja ?? '?'}  ${(p.nome_loja ?? p.local_parada ?? '').slice(0, 50)}${matched}\n`)
      }
      if (l.placa_norm && ps.length > 0 && pLoja.length === 0) {
        process.stdout.write(`       !! SEM LOJA — ${pFora.length}xFB ${pBase.length}xB\n`)
        for (const p of pFora.slice(0, 3)) {
          process.stdout.write(`       FB    ${toHHMM(p.chegada)}-${toHHMM(p.saida)}  ${(p.local_parada ?? '').slice(0, 50)}\n`)
        }
      }
      process.stdout.write(`       MATCHER: ${matchSc} / ${matchChd} / ${matchSl}\n`)
      if (kpiM.size > 0) process.stdout.write(`       MANUAL : ${mArr.join(' / ')}\n`)
    }
  }

  process.stdout.write('\n══════════════════════════════════════════\n')
  if (kpiM.size > 0) {
    process.stdout.write(`RESUMO MATCHER×MANUAL: OK=${nOk}  DIFF=${nDiff}  ← código atual\n`)
  } else {
    process.stdout.write(`RESUMO: ${escala.length} linhas analisadas (sem KPI manual para comparar)\n`)
  }
  process.stdout.write('══════════════════════════════════════════\n')
}

main().catch(e => { console.error('ERRO:', e.stack); process.exit(1) })
```

- [ ] **Step 2: TypeScript check**

```bash
cd C:/Users/media/dev/kpi-transmonseg && npx tsc --noEmit
```

Expected: zero erros.

- [ ] **Step 3: Smoke test — dia 20 (deve dar mesma resposta que analise_completa_20.ts)**

```bash
cd C:/Users/media/dev/kpi-transmonseg && npx tsx scripts/analise/analise_zonasul.ts 2026-05-20 2>&1 | tail -5
```

Expected: `RESUMO MATCHER×MANUAL: OK=36 DIFF=16` (mesmo do baseline para dia 20).

- [ ] **Step 4: Smoke test — dia 18 (novo)**

```bash
cd C:/Users/media/dev/kpi-transmonseg && npx tsx scripts/analise/analise_zonasul.ts 2026-05-18 2>&1 | tail -5
```

Expected: roda sem crash; mostra RESUMO ou AVISO sobre KPI manual ausente.

- [ ] **Step 5: Commit**

```bash
git add scripts/analise/analise_zonasul.ts
git commit -m "feat(analise): analise_zonasul.ts genérico por data

Unifica analise_completa_20.ts e _21.ts num único entry-point
parametrizado por DATA. Auto-descobre escala/unitrac/KPI manual
das pastas conhecidas. Tolera ausência de KPI manual."
```

---

## Task 2: Estender `scripts/snapshot.ts` com ZONA_SUL todos os dias

**Files:**
- Modify: `scripts/snapshot.ts`

- [ ] **Step 1: Editar `scripts/snapshot.ts` para usar analise_zonasul.ts em todos os dias ZONA_SUL**

Substituir:

Old:
```typescript
const JOBS: Job[] = [
  { rede: 'ZONA_SUL', dia: '2026-05-20', script: 'scripts/analise/analise_completa_20.ts', args: [] },
  { rede: 'ZONA_SUL', dia: '2026-05-21', script: 'scripts/analise/analise_completa_21.ts', args: [] },
  ...REDES_18.map(rede => ({ rede, dia: '2026-05-18', script: 'scripts/analise/analise_18_geral.ts', args: [rede] })),
  ...REDES_19.map(rede => ({ rede, dia: '2026-05-19', script: 'scripts/analise/analise_19_geral.ts', args: [rede] })),
]
```

New:
```typescript
const ZONA_SUL_DIAS = ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22']

const JOBS: Job[] = [
  ...ZONA_SUL_DIAS.map(dia => ({ rede: 'ZONA_SUL', dia, script: 'scripts/analise/analise_zonasul.ts', args: [dia] })),
  ...REDES_18.map(rede => ({ rede, dia: '2026-05-18', script: 'scripts/analise/analise_18_geral.ts', args: [rede] })),
  ...REDES_19.map(rede => ({ rede, dia: '2026-05-19', script: 'scripts/analise/analise_19_geral.ts', args: [rede] })),
]
```

- [ ] **Step 2: TypeScript check**

```bash
cd C:/Users/media/dev/kpi-transmonseg && npx tsc --noEmit
```

- [ ] **Step 3: Rodar snapshot novo (cobertura expandida)**

```bash
cd C:/Users/media/dev/kpi-transmonseg && npx tsx scripts/snapshot.ts docs/snapshots/2026-05-24-zona_sul-baseline.json 2>&1 | tail -5
```

Expected: saída "Saved: docs/snapshots/2026-05-24-zona_sul-baseline.json" após ~3-5min. JSON contém ZONA_SUL com 5 dias.

- [ ] **Step 4: Sanity check do snapshot**

```bash
cat docs/snapshots/2026-05-24-zona_sul-baseline.json | python -c "import sys, json; d=json.load(sys.stdin); print('ZONA_SUL dias:', list(d['redes']['ZONA_SUL'].keys()))"
```

Expected: `ZONA_SUL dias: ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22']` (ou subconjunto se algum dia falhar).

- [ ] **Step 5: Commit**

```bash
git add scripts/snapshot.ts docs/snapshots/2026-05-24-zona_sul-baseline.json
git commit -m "feat(snapshot): cobrir ZONA_SUL todos os dias 18-22 via analise_zonasul.ts"
```

---

## Task 3 (Iteração N — TEMPLATE)

> Este task é REPETIDO 1-5 vezes. Cada execução substitui {N} pelo número da iteração. Pare antes de 5 se: (a) DIFFs zerados, (b) 2 iterações seguidas sem melhoria, ou (c) sem categoria fixível restante.

**Files (varia por iteração):**
- Possivelmente: `src/lib/kpi/matcher.ts`
- Possivelmente: `src/lib/parsers/escala-zona-sul.ts`
- Possivelmente: Supabase `lojas`
- Sempre: `docs/STATE.md`, `docs/kpi-fixes/2026-05-24-rede-ZONA_SUL-report.md`

- [ ] **Step 1: Snapshot pré-iteração**

```bash
cd C:/Users/media/dev/kpi-transmonseg && npx tsx scripts/snapshot.ts docs/snapshots/2026-05-24-zona_sul-iter{N}-pre.json 2>&1 | tail -3
```

Expected: arquivo salvo. Anotar contagem ZONA_SUL atual.

- [ ] **Step 2: Analisar ZONA_SUL todos os dias**

```bash
cd C:/Users/media/dev/kpi-transmonseg && for D in 18 19 20 21 22; do echo "=== Dia $D ==="; npx tsx scripts/analise/analise_zonasul.ts 2026-05-$D 2>&1 | grep -E "RESUMO|^\[DIFF\]" | head -20; done > /tmp/zona_sul_iter{N}.txt 2>&1
cat /tmp/zona_sul_iter{N}.txt | head -100
```

Expected: lista de RESUMO por dia + primeiros 20 DIFFs de cada dia.

- [ ] **Step 3: Triangulação — escolher TOP 5 DIFFs por padrão recorrente**

Procurar padrões repetidos no output:
- Mesma loja em múltiplos dias → categoria 3.2 (parada-errada) ou 3.7 (DB-incompleta)
- `match=geo(0.X)` com MANUAL=NAO_FOI → categoria 3.3 (T18 FP)
- `GPS:SIM [Np | 0L Y F]` → categoria 3.4 (GPS-SEM-LOJA)
- SC presente em MATCHER mas `---` em MANUAL → categoria 3.6 (T16-C FP) ou 3.1 (convenção)
- Mesmo veículo com paradas LOJA mas matcher pegou errada → 3.2 multi-trip

Documentar a categoria escolhida em scratch:

```bash
echo "ITER {N} CATEGORIA: 3.X — descrição curta" > /tmp/zona_sul_iter{N}_categoria.txt
echo "Exemplos:" >> /tmp/zona_sul_iter{N}_categoria.txt
echo "  - LOJA X dia 18: ..." >> /tmp/zona_sul_iter{N}_categoria.txt
echo "  - LOJA Y dia 20: ..." >> /tmp/zona_sul_iter{N}_categoria.txt
cat /tmp/zona_sul_iter{N}_categoria.txt
```

- [ ] **Step 4: Aplicar fix segundo Seção 4 do spec**

Decisão baseada na categoria identificada em Step 3:

**Se categoria 3.1 (SC convention antiga):**
Pular — convenção velha do manual, código atual é "correto". Marcar como "verified limitation" no final.

**Se categoria 3.2 (parada errada):**
Investigar scoring em `src/lib/kpi/matcher.ts`. Geralmente envolve afinar `findMatchByPlaca` ou `consolidarParadasMesmoCliente`. Aplicar via `Edit` tool.

**Se categoria 3.3 (T18 FP):**
Editar guards do T18 em `src/lib/kpi/matcher.ts`. Geralmente adicionar threshold de raio ou duração mínima.

**Se categoria 3.4 (GPS-SEM-LOJA):**
- Sub-caso A: parser não classificou — investigar `parseUnitrac` em `src/lib/parsers/unitrac.ts`.
- Sub-caso B: geofence faltando — UPDATE em `lojas` (criar `scripts/db-changes/2026-05-24-ZONA_SUL-iter{N}.ts` + log MD).

**Se categoria 3.5 (cross-rede):**
Tighten check em `matcher.ts` (`findMatchByPlaca` rede check).

**Se categoria 3.6 (T16-C FP):**
Editar predicado isBase em `computeSaidaCdParaParada` (matcher.ts:280-300).

**Se categoria 3.7 (DB-loja-incompleta):**
1. Identificar lojas afetadas via Supabase query
2. Criar `scripts/db-changes/2026-05-24-ZONA_SUL-iter{N}.ts` com mutações + rollback (template do spec Seção 7)
3. Criar `docs/db-changes/2026-05-24-ZONA_SUL-iter{N}.md` com tabela BEFORE/AFTER + justificativa
4. Executar: `npx tsx scripts/db-changes/2026-05-24-ZONA_SUL-iter{N}.ts`

**Se categoria 3.9 (Manual errado):**
Pular fix de código. Documentar em report final.

- [ ] **Step 5: Validar com testes**

```bash
cd C:/Users/media/dev/kpi-transmonseg && npx tsc --noEmit && npx vitest run 2>&1 | tail -5
```

Expected: zero TS errors, 263+ tests passed.

Se falhar: REVERTER fix via `git checkout -- <arquivo>` ou `npx tsx scripts/db-changes/2026-05-24-ZONA_SUL-iter{N}.ts rollback`. Voltar ao Step 3 com categoria diferente.

- [ ] **Step 6: Snapshot pós-iteração**

```bash
cd C:/Users/media/dev/kpi-transmonseg && npx tsx scripts/snapshot.ts docs/snapshots/2026-05-24-zona_sul-iter{N}-post.json 2>&1 | tail -3
```

- [ ] **Step 7: Regression check**

```bash
cd C:/Users/media/dev/kpi-transmonseg && npx tsx scripts/regression-check.ts docs/snapshots/2026-05-24-zona_sul-iter{N}-pre.json docs/snapshots/2026-05-24-zona_sul-iter{N}-post.json
```

Expected: "No regression beyond threshold." Exit 0.

Se "REGRESSION DETECTED": REVERTER (git checkout / db rollback). Voltar ao Step 3 com abordagem diferente.

- [ ] **Step 8: Commit + push**

```bash
cd C:/Users/media/dev/kpi-transmonseg && git add -A && git commit -m "fix(matcher|db|parser): ZONA_SUL iter {N} — categoria 3.X — <descrição curta>

ZONA_SUL pré: X/104 → pós: Y/104 (+Z)
Outras redes: zero regressão (validado via regression-check)
Categoria do spec: 3.X
Fix: <1-2 linhas descrevendo o que mudou>" && git push 2>&1 | tail -3
```

- [ ] **Step 9: Atualizar STATE.md**

Editar `docs/STATE.md` substituindo a seção "Onde estamos AGORA":

```markdown
## Onde estamos AGORA

- **Rede atual:** ZONA_SUL
- **Iteração atual:** {N+1} (se vai continuar) OU "concluído" (se vai parar)
- **Última iteração concluída:** {N}
- **Último snapshot:** `docs/snapshots/2026-05-24-zona_sul-iter{N}-post.json`
- **Último commit:** ver `git log --oneline -3`

### ZONA_SUL progress
| Iter | OK pré | OK pós | Δ | Categoria |
|------|--------|--------|---|-----------|
| 1    | 71     | XX     | + | 3.X       |
| 2    | ...    | ...    | . | ...       |
```

Commit STATE.md:

```bash
git add docs/STATE.md && git commit -m "docs(state): ZONA_SUL iter {N} concluído (+Z entries)" && git push
```

- [ ] **Step 10: Decidir se continua ou para**

Continuar para iter {N+1} se TODAS verdadeiras:
- {N} < 5
- DIFFs ainda existem
- Última iter teve melhoria > 0
- Tem categoria fixível identificada para próxima

Senão: pular para Task 4 (Final Report).

---

## Task 4: Final Report

**Files:**
- Create: `docs/kpi-fixes/2026-05-24-rede-ZONA_SUL-report.md`

- [ ] **Step 1: Compilar tabelas de progresso**

```bash
cd C:/Users/media/dev/kpi-transmonseg && for f in docs/snapshots/2026-05-24-zona_sul-iter*-post.json; do echo "=== $f ==="; cat "$f" | python -c "import sys, json; d=json.load(sys.stdin); zs=d['redes']['ZONA_SUL']; print('Total OK:', sum(v.get('ok',0) or 0 for v in zs.values()), '/ ', sum(v.get('total',0) or 0 for v in zs.values())); [print(f'  {k}: {v[\"ok\"]}/{v[\"total\"]}') for k,v in zs.items()]"; done
```

- [ ] **Step 2: Rodar análise final e extrair DIFFs restantes**

```bash
cd C:/Users/media/dev/kpi-transmonseg && for D in 18 19 20 21 22; do npx tsx scripts/analise/analise_zonasul.ts 2026-05-$D 2>&1 | grep -B1 -A2 "^\[DIFF\]" | head -100 > /tmp/zona_sul_final_dia$D.txt; done && wc -l /tmp/zona_sul_final_dia*.txt
```

- [ ] **Step 3: Escrever report**

Criar `docs/kpi-fixes/2026-05-24-rede-ZONA_SUL-report.md`:

```markdown
# Relatório ZONA_SUL — 2026-05-24

## Sumário
- **Baseline:** 71/104 (68%) — dias 20+21 medidos no snapshot inicial
- **Pós-expansão:** XXX/YYY (após Task 2 incluir dias 18-22)
- **Final:** AA/BB (CC%)
- **Iterações:** N de 5 (cap)
- **Mudanças código:** [list commits]
- **Mudanças DB:** [list db-changes files]

## Histórico de iterações

| # | Pré | Pós | Δ | Categoria | Fix |
|---|-----|-----|---|-----------|-----|
| 1 | ... | ... | + | 3.X       | ... |
| 2 | ... | ... | + | 3.Y       | ... |

## DIFFs restantes (categorizados)

| Dia | Loja | Categoria | Por que sobrou |
|-----|------|-----------|----------------|
| ... | ... | 3.8 GPS-SEM-RASTREADOR | placa sem GPS |
| ... | ... | 3.9 Manual-errado | typo provável |

## Mudanças aplicadas

### Código
- `src/lib/kpi/matcher.ts:XXX` — descrição
- `src/lib/parsers/...` — descrição

### Supabase
- `docs/db-changes/2026-05-24-ZONA_SUL-iter1.md` — N UPDATEs em lojas
- ...

## Verificação de não-regressão

Comparação `docs/snapshots/2026-05-24-baseline.json` vs `docs/snapshots/2026-05-24-zona_sul-iter{N}-post.json`:

```
<output do regression-check>
```

ZONA_SUL: +Z, outras redes: zero regressão acima de threshold.
```

- [ ] **Step 4: Atualizar STATE.md tabela "Histórico de redes processadas"**

Editar a tabela em STATE.md:

```markdown
| Rede | Iterações | Antes | Depois | Commit final | Report |
|------|-----------|-------|--------|--------------|--------|
| ZONA_SUL | N | 71/104 | XX/YY | abc123 | docs/kpi-fixes/2026-05-24-rede-ZONA_SUL-report.md |
```

E "Onde estamos AGORA":

```markdown
- **Rede atual:** ZONA_SUL concluído → próxima: PREZUNIC
- **Iteração atual:** —
- **Última iteração concluída:** ZONA_SUL final
```

E "Próximo passo concreto":

```markdown
Invocar writing-plans para criar `docs/superpowers/plans/2026-05-24-rede-PREZUNIC.md`.
```

- [ ] **Step 5: Commit final + push**

```bash
cd C:/Users/media/dev/kpi-transmonseg && git add docs/kpi-fixes/2026-05-24-rede-ZONA_SUL-report.md docs/STATE.md && git commit -m "docs: ZONA_SUL concluído — relatório final + STATE.md atualizado" && git push 2>&1 | tail -3
```

---

## Self-Review

**Spec coverage check:**
- Seção 2 (arquitetura) → Task 3 implementa o loop iterativo ✓
- Seção 3 (taxonomia) → Task 3 Step 3 referencia 10 categorias ✓
- Seção 4 (estratégia de fix) → Task 3 Step 4 ramifica por categoria ✓
- Seção 5 (rollback) → Task 3 Step 5 (vitest) e Step 7 (regression-check) ✓
- Seção 6 (snapshot system) → Task 3 Steps 1 e 6 ✓
- Seção 7 (auditoria DB) → Task 3 Step 4 sub-3.7 referencia templates ✓
- Seção 8 (cobertura de dias) → Task 1 (analyzer genérico) + Task 2 (snapshot expandido) ✓
- Seção 9 (budget) → Task 3 Step 10 (decisão continuar/parar) + cap 5 ✓
- Seção 10 (deliverables) → Task 4 ✓
- Seção 11 (pre-flight) → assumido feito (Plan 0 concluído) ✓

**Placeholder scan:**
- `{N}` em Task 3 é deliberado: é placeholder de iteração que será substituído em runtime (1, 2, 3, 4, 5). Aceitável.
- `3.X` em mensagens de commit é deliberado: a categoria escolhida em Step 3 substitui isso. Aceitável.
- "XX", "YY", "AA", "BB" em Step 9 e Task 4 Step 3 são números a preencher conforme runtime. Aceitável.
- Nenhum TODO/TBD/"add validation" real.

**Type consistency:**
- `findFiles` return shape consistente. ✓
- `analise_zonasul.ts` reusa tipos de `matcher.ts` (EscalaLinhaRow, UnitracParadaRow, LojaRow). ✓

---

## Execution

Após salvar este plano, executar **inline** (não subagent): a iteração precisa de decisões contextuais que dependem do output da análise (categoria escolhida varia). Subagent não tem o contexto cumulativo.
