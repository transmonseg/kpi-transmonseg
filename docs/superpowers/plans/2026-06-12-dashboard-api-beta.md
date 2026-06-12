# Dashboard API beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um dashboard beta que puxa cada dia da API (escala + alvos/NF + GPS), acumula num bucket de Storage (1 JSON/dia) e agrega dia→mês com o MESMO motor de métricas — tudo isolado, sem tocar o dashboard normal.

**Architecture:** Fonte de dados nova (`dashboard-api-fonte.ts`) que orquestra as libs já estáveis (consolida/matcher/alvos/status) e lê/grava no bucket `kpi-api-dash`. Rota `/api/dashboard/beta` (POST puxa+salva o dia, GET agrega o período). UI reusa `DashboardClient` via prop opcional `endpoint` (default preserva o normal) + uma página `/painel/dashboard/beta` com o botão "puxar dia". Storage em vez de tabela (DDL é não-confiável aqui; Storage foi provado).

**Tech Stack:** TypeScript, Next.js (nodejs runtime), vitest, Supabase Storage, libs internas `@/lib/unitrac-api`, `@/lib/kpi/matcher`, `@/lib/kpi/status-rota`, `@/lib/kpi/dashboard-metricas`.

---

## Contexto pra quem nunca viu o código

- **Formato das linhas** (`src/lib/kpi/parse-kpi-manual.ts`):
  ```ts
  export type StatusManual = 'entregue' | 'nao_foi' | 'sem_rastreador'
  export interface EntradaManual {
    rede_id: string; data: string; loja: string; placa: string | null
    motorista: string | null; status: StatusManual
    saida_cd: string | null; chd: string | null; sai: string | null; volta_base: string | null
  }
  ```
- **Motor de métricas** (`src/lib/kpi/dashboard-metricas.ts`): `calcularMetricas(EntradaManual[])` e `filtrar(ents, { redes })`. NÃO mexer.
- **Intervalos** (`src/lib/kpi/dashboard-query.ts`): `intervaloPeriodo(periodo, ref)` e `intervaloAnterior(periodo, ref)` devolvem `[ini, fim]` em `YYYY-MM-DD`. Reusar.
- **Rota normal espelho** (`src/app/api/dashboard/route.ts`): GET lê `carregarEntradasManuais` e devolve `{ periodo, ref, intervalo, redes, metricas, metricasAnterior }`. A beta GET espelha isso, mas lendo do Storage.
- **Hora BRT**: o sistema grava BRT mascarado como UTC; formata com `getUTCHours()/getUTCMinutes()` → `HH:MM`. Datas da API (`feitoISO`, paradas) já vêm nessa convenção (ver consolida.ts).
- **Pipeline pronto (reusar, não reescrever):**
  - `consolidaParadasApi(eventos, pontos, data, placa)` + `buscarStopsCru(cv, horas)` (`@/lib/unitrac-api`)
  - `cruzaEscalaUnitrac(escalaRows, paradaRows, lojas, svc, geoStores, { geoEndereco: true })` + `setSemGeo(true)` + `resolverLojaEsperada` (`@/lib/kpi/matcher`)
  - `confirmaPorAlvo(placaNorm, codigoUnitrac, alvos)` + `buscarAlvos(cvs)` (`@/lib/unitrac-api`)
  - `derivarStatus(dados)` → `{ status, ... }` (`@/lib/kpi/status-rota`)
  - Padrão de e2e validado em `scripts/dev/e2e-api-mode.mts` (apagado) e `sweep-api-testavel.mts`.
- **escala_linhas** (persistida pela geração de KPI): colunas `rede_id, loja_nome_raw, loja_codigo_raw, placa_norm, motorista_nome, carro_ordem, data_entrega, raw_json`. `.eq('data_entrega', data)`.
- **Bucket `kpi-api-dash`**: já criado no probe. `svc.storage.from('kpi-api-dash').upload('{data}.json', blob, { upsert: true })` / `.download('{data}.json')`.
- **Rodar testes:** `npx vitest run src/lib/kpi/dashboard-api-fonte.test.ts`. Tudo: `npx vitest run`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/kpi/dashboard-api-fonte.ts` (criar) | mapper status, rota→EntradaManual, gravar/ler dia no Storage, orquestrar pipeline do dia |
| `src/lib/kpi/dashboard-api-fonte.test.ts` (criar) | TDD das funções puras (mapper + rotaParaEntrada) |
| `src/app/api/dashboard/beta/route.ts` (criar) | POST puxa+salva dia · GET agrega período |
| `src/app/painel/dashboard/dashboard-client.tsx` (modificar) | prop opcional `endpoint` (default `/api/dashboard`) |
| `src/app/painel/dashboard/beta/page.tsx` (criar) | painel "puxar dia" + `<DashboardClient endpoint="/api/dashboard/beta" />` + link p/ normal |
| `src/app/api/dashboard/beta/puxar/route.ts` — (NÃO; o POST fica em beta/route.ts) | — |
| `src/app/painel/nav.tsx` (modificar) | item de menu "Dashboard (API beta)" |

---

## Task 1: Mapper de status + rota→EntradaManual (puro, TDD)

**Files:**
- Create: `src/lib/kpi/dashboard-api-fonte.ts`
- Test: `src/lib/kpi/dashboard-api-fonte.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/lib/kpi/dashboard-api-fonte.test.ts
import { describe, it, expect } from 'vitest'
import { statusRotaParaDashboard, rotaParaEntrada } from './dashboard-api-fonte'

describe('statusRotaParaDashboard', () => {
  it('ENTREGUE e ENTREGUE_GEO → entregue', () => {
    expect(statusRotaParaDashboard('ENTREGUE')).toBe('entregue')
    expect(statusRotaParaDashboard('ENTREGUE_GEO')).toBe('entregue')
  })
  it('SEM_RASTREADOR → sem_rastreador', () => {
    expect(statusRotaParaDashboard('SEM_RASTREADOR')).toBe('sem_rastreador')
  })
  it('demais → nao_foi', () => {
    for (const s of ['MUDOU_DE_ROTA', 'FORA_DE_BASE', 'NAO_SAIU_DA_BASE', 'NAO_FOI_AO_CLIENTE'] as const)
      expect(statusRotaParaDashboard(s)).toBe('nao_foi')
  })
})

describe('rotaParaEntrada', () => {
  const esc = { rede_id: 'PRINCESA', loja_nome_raw: 'Princesa - Fonseca', motorista_nome: 'JOAO' }
  const rota = {
    placa_norm: 'RJN9F68',
    saida_cd: new Date('2026-06-12T05:03:00Z'),
    chegada_base: new Date('2026-06-12T07:40:00Z'),
    paradas: [{ chegada: new Date('2026-06-12T05:44:00Z'), duracao_min: 92 }],
  }
  it('mapeia campos e formata horários HH:MM', () => {
    const e = rotaParaEntrada(rota as any, esc as any, 'ENTREGUE', '2026-06-12')
    expect(e.data).toBe('2026-06-12')
    expect(e.rede_id).toBe('PRINCESA')
    expect(e.loja).toBe('Princesa - Fonseca')
    expect(e.placa).toBe('RJN9F68')
    expect(e.motorista).toBe('JOAO')
    expect(e.status).toBe('entregue')
    expect(e.saida_cd).toBe('05:03')
    expect(e.chd).toBe('05:44')
    expect(e.sai).toBe('07:16')      // chegada + 92min
    expect(e.volta_base).toBe('07:40')
  })
  it('sem parada → horários null, status preservado', () => {
    const e = rotaParaEntrada({ placa_norm: 'X', saida_cd: null, chegada_base: null, paradas: [] } as any, esc as any, 'NAO_FOI_AO_CLIENTE', '2026-06-12')
    expect(e.status).toBe('nao_foi')
    expect(e.chd).toBeNull(); expect(e.sai).toBeNull(); expect(e.saida_cd).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/kpi/dashboard-api-fonte.test.ts`
Expected: FAIL — funções não existem.

- [ ] **Step 3: Implementar as funções puras**

```ts
// src/lib/kpi/dashboard-api-fonte.ts
import type { StatusRota } from './status-rota'
import type { StatusManual, EntradaManual } from './parse-kpi-manual'
import type { RotaKpi } from '@/lib/types/kpi'
import type { LinhaEscala } from '@/lib/types/escala'

/** HH:MM em BRT (convenção do sistema: BRT mascarado como UTC). */
function fmtHora(d: Date | null | undefined): string | null {
  if (!d) return null
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export function statusRotaParaDashboard(status: StatusRota): StatusManual {
  if (status === 'ENTREGUE' || status === 'ENTREGUE_GEO') return 'entregue'
  if (status === 'SEM_RASTREADOR') return 'sem_rastreador'
  return 'nao_foi'
}

/** Converte uma rota+linha de escala+status numa linha do dashboard. */
export function rotaParaEntrada(
  rota: Pick<RotaKpi, 'placa_norm' | 'saida_cd' | 'chegada_base' | 'paradas'>,
  esc: Pick<LinhaEscala, 'rede_id' | 'loja_nome_raw' | 'motorista_nome'>,
  status: StatusRota,
  data: string,
): EntradaManual {
  const p0 = rota.paradas[0]
  const chegada = p0?.chegada ?? null
  const saida = chegada && p0?.duracao_min != null
    ? new Date(chegada.getTime() + p0.duracao_min * 60_000)
    : null
  return {
    data,
    rede_id: esc.rede_id,
    loja: esc.loja_nome_raw ?? '',
    placa: rota.placa_norm ?? null,
    motorista: esc.motorista_nome ?? null,
    status: statusRotaParaDashboard(status),
    saida_cd: fmtHora(rota.saida_cd ? new Date(rota.saida_cd) : null),
    chd: fmtHora(chegada),
    sai: fmtHora(saida),
    volta_base: fmtHora(rota.chegada_base ? new Date(rota.chegada_base) : null),
  }
}
```

> Nota: `rota.saida_cd`/`chegada_base` podem ser `Date` ou ISO string conforme a
> origem; `new Date(x)` normaliza ambos. `paradas[0].chegada` é `Date` (vem do
> matcher). O teste usa `Date` direto — por isso `new Date(rota.saida_cd)` aceita Date.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/kpi/dashboard-api-fonte.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi/dashboard-api-fonte.ts src/lib/kpi/dashboard-api-fonte.test.ts
git commit -m "feat(dashboard-api): mapper status + rota->EntradaManual (puro, TDD)"
```

---

## Task 2: Storage do dia (gravar/ler JSON no bucket)

**Files:**
- Modify: `src/lib/kpi/dashboard-api-fonte.ts`

> I/O com Storage — sem teste unitário (precisa de Supabase). Funções finas e diretas.

- [ ] **Step 1: Adicionar as funções de Storage**

Acrescentar em `src/lib/kpi/dashboard-api-fonte.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export const BUCKET_API_DASH = 'kpi-api-dash'

/** Grava (upsert) as linhas de UM dia no bucket: {data}.json. */
export async function salvarDiaApi(svc: SupabaseClient, data: string, entradas: EntradaManual[]): Promise<void> {
  const blob = new Blob([JSON.stringify(entradas)], { type: 'application/json' })
  const { error } = await svc.storage.from(BUCKET_API_DASH).upload(`${data}.json`, blob, { upsert: true })
  if (error) throw new Error(`Falha ao salvar dia ${data}: ${error.message}`)
}

/** Enumera as datas YYYY-MM-DD de ini..fim (inclusive). */
export function datasNoIntervalo(ini: string, fim: string): string[] {
  const out: string[] = []
  const d = new Date(`${ini}T00:00:00Z`)
  const end = new Date(`${fim}T00:00:00Z`)
  while (d.getTime() <= end.getTime()) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/** Lê e concatena as linhas dos dias do intervalo (ignora dias sem arquivo). */
export async function carregarEntradasApi(svc: SupabaseClient, ini: string, fim: string): Promise<EntradaManual[]> {
  const datas = datasNoIntervalo(ini, fim)
  const lotes = await Promise.all(datas.map(async (dt) => {
    const { data: blob, error } = await svc.storage.from(BUCKET_API_DASH).download(`${dt}.json`)
    if (error || !blob) return [] as EntradaManual[]
    try { return JSON.parse(await blob.text()) as EntradaManual[] } catch { return [] }
  }))
  return lotes.flat()
}
```

- [ ] **Step 2: Adicionar teste de datasNoIntervalo (puro)**

Acrescentar no `dashboard-api-fonte.test.ts`:

```ts
import { datasNoIntervalo } from './dashboard-api-fonte'

describe('datasNoIntervalo', () => {
  it('enumera inclusive', () => {
    expect(datasNoIntervalo('2026-06-10', '2026-06-12')).toEqual(['2026-06-10', '2026-06-11', '2026-06-12'])
  })
  it('um único dia', () => {
    expect(datasNoIntervalo('2026-06-12', '2026-06-12')).toEqual(['2026-06-12'])
  })
})
```

- [ ] **Step 3: Rodar e ver passar**

Run: `npx vitest run src/lib/kpi/dashboard-api-fonte.test.ts`
Expected: PASS (todos).

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head`
Expected: sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi/dashboard-api-fonte.ts src/lib/kpi/dashboard-api-fonte.test.ts
git commit -m "feat(dashboard-api): storage do dia (salvar/ler JSON) + datasNoIntervalo"
```

---

## Task 3: Orquestrador do dia (escala + API → EntradaManual[])

**Files:**
- Modify: `src/lib/kpi/dashboard-api-fonte.ts`

> Orquestra as libs estáveis. Sem unit test (precisa API+DB); validado pela rota e
> pelo teste manual da Task 6.

- [ ] **Step 1: Adicionar `gerarDiaApi`**

Acrescentar em `src/lib/kpi/dashboard-api-fonte.ts`:

```ts
import { buscarFrota, buscarPontos, buscarStopsCru, consolidaParadasApi, buscarAlvos, confirmaPorAlvo } from '@/lib/unitrac-api'
import { cruzaEscalaUnitrac, setSemGeo, resolverLojaEsperada, type EscalaLinhaRow, type LojaRow, type GeoStore } from '@/lib/kpi/matcher'
import { derivarStatus } from './status-rota'

export type EscalaParaDia = Pick<EscalaLinhaRow, 'rede_id' | 'placa_norm' | 'loja_nome_raw' | 'loja_codigo_raw' | 'motorista_nome' | 'carro_ordem' | 'data_entrega'>

/** Calcula as linhas do dashboard de UM dia 100% pela API (paradas consolidadas +
 *  confirmação por alvo/NF), reusando o matcher de produção. */
export async function gerarDiaApi(
  svc: SupabaseClient,
  data: string,
  escala: EscalaParaDia[],
  lojas: LojaRow[],
  geoStores: GeoStore[],
): Promise<EntradaManual[]> {
  const escalaRows: EscalaLinhaRow[] = escala.map((l, i) => ({
    id: `e${i}`, rede_id: l.rede_id, placa_norm: l.placa_norm || null,
    loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw,
    motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega ?? data,
  }))
  const escMap = new Map(escalaRows.map((e, i) => [e.id, escala[i]]))

  const frota = await buscarFrota()
  const cvs = frota.map(v => v.cv)
  const [pontos, alvos] = await Promise.all([buscarPontos(cvs), buscarAlvos(cvs)])
  const placas = new Set(escalaRows.map(e => e.placa_norm).filter(Boolean) as string[])
  const paradaRows: import('@/lib/kpi/matcher').UnitracParadaRow[] = []
  for (const v of frota) {
    if (!placas.has(v.placaNorm)) continue
    const ps = consolidaParadasApi(await buscarStopsCru(v.cv, 48), pontos, data, v.placaNorm)
    paradaRows.push(...ps)
  }

  setSemGeo(true)
  const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, lojas, svc, geoStores, { geoEndereco: true })

  // "saiu da base" por placa (pra derivarStatus)
  const porPlaca = new Map<string, typeof paradaRows>()
  for (const p of paradaRows) { const a = porPlaca.get(p.placa_norm) ?? []; a.push(p); porPlaca.set(p.placa_norm, a) }
  const saiu = (pl: string | null) => !!pl && (porPlaca.get(pl) ?? []).some(p => p.classificacao === 'LOJA' || p.classificacao === 'FORA_BASE')

  const out: EntradaManual[] = []
  for (const rota of rotas) {
    const esc = escMap.get(rota.escala_linha_id)
    if (!esc) continue
    // Confirmação por alvo/NF: resgata entrega que o GPS perdeu.
    const esperada = resolverLojaEsperada({ rede_id: esc.rede_id, loja_codigo_raw: esc.loja_codigo_raw, loja_nome_raw: esc.loja_nome_raw }, lojas)
    if (esperada?.codigo_unitrac && rota.placa_norm) {
      const c = confirmaPorAlvo(rota.placa_unitrac ?? rota.placa_norm, esperada.codigo_unitrac, alvos)
      if (c && !rota.paradas.some(p => p.loja_id === esperada.id)) {
        const t = new Date(c.feitoISO + 'Z')
        rota.paradas = [{ parada_id: null, loja_id: esperada.id, nome: esperada.nome, chegada: t, saida: t, duracao_min: 0, classificacao: 'LOJA' }]
      }
    }
    const placaUni = rota.placa_unitrac ?? rota.placa_norm
    const st = derivarStatus({
      temGps: rota.paradas.length > 0 || porPlaca.has(placaUni ?? ''),
      ficouNaBase: rota.status === 'sem_entrega' && !!rota.placa_norm,
      paradas: rota.paradas.map(p => ({ classificacao: p.classificacao, loja_id: p.loja_id ?? null })),
      viaGeo: rota._matchMeta?.algorithm === 'geo', viaTroca: rota._matchMeta?.algorithm === 'troca',
      geoConfiavel: rota.geo_confiavel ?? false, placaFoiAlgumLugar: saiu(placaUni), placaSaiuDaBase: saiu(placaUni),
    })
    out.push(rotaParaEntrada(rota, esc, st.status, data))
  }
  return out
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head`
Expected: sem saída. Se `GeoStore`/`UnitracParadaRow`/`EscalaLinhaRow` não forem exportados de `@/lib/kpi/matcher`, conferir o export real e ajustar o import (todos são exportados — ver matcher.ts).

- [ ] **Step 3: Commit**

```bash
git add src/lib/kpi/dashboard-api-fonte.ts
git commit -m "feat(dashboard-api): orquestrador gerarDiaApi (escala+alvo/NF+GPS -> linhas)"
```

---

## Task 4: Rota `/api/dashboard/beta` (POST puxa+salva, GET agrega)

**Files:**
- Create: `src/app/api/dashboard/beta/route.ts`

- [ ] **Step 1: Escrever a rota**

```ts
// src/app/api/dashboard/beta/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { calcularMetricas, filtrar } from '@/lib/kpi/dashboard-metricas'
import { intervaloPeriodo, intervaloAnterior } from '@/lib/kpi/dashboard-query'
import { hojeBR } from '@/lib/data-br'
import { parseEscalaArquivo } from '@/lib/parsers/escala-arquivo'
import { gerarDiaApi, salvarDiaApi, carregarEntradasApi, type EscalaParaDia } from '@/lib/kpi/dashboard-api-fonte'
import type { LojaRow, GeoStore } from '@/lib/kpi/matcher'

export const runtime = 'nodejs'
export const maxDuration = 120

async function carregarLojasEGeo(svc: ReturnType<typeof createServiceClient>): Promise<{ lojas: LojaRow[]; geoStores: GeoStore[] }> {
  const [lojasRes, canonRes] = await Promise.all([
    svc.from('lojas').select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros, endereco, bairro, municipio, numero').eq('ativo', true).order('id'),
    svc.from('canonical_loja').select('id, name, lat, lng, raio_metros').not('lat', 'is', null).not('lng', 'is', null),
  ])
  const lojas = (lojasRes.data ?? []).map((l) => ({ ...l, raio_metros: (l.raio_metros as number | null) ?? 150 })) as unknown as LojaRow[]
  const geoStores = (canonRes.data ?? []).map((c) => ({ id: c.id as string, name: c.name as string, lat: c.lat as number, lng: c.lng as number, raio_metros: (c.raio_metros as number | null) ?? 150 })) as GeoStore[]
  return { lojas, geoStores }
}

/** Escala do dia: 1º das escala_linhas persistidas (via escala_uploads do dia);
 *  senão dos arquivos enviados. Duas queries (sem join — mais robusto que !inner). */
async function escalaDoDia(svc: ReturnType<typeof createServiceClient>, data: string, escalaPaths: string[]): Promise<EscalaParaDia[]> {
  const { data: ups } = await svc.from('escala_uploads').select('id').eq('data_escala', data)
  const ids = (ups ?? []).map((u) => u.id as string)
  if (ids.length > 0) {
    const { data: rows } = await svc.from('escala_linhas')
      .select('rede_id, loja_nome_raw, loja_codigo_raw, placa_norm, motorista_nome, carro_ordem, data_entrega')
      .in('escala_upload_id', ids)
    if (rows && rows.length > 0) {
      return rows.map((r) => ({
        rede_id: r.rede_id as string, placa_norm: (r.placa_norm as string | null) ?? null,
        loja_nome_raw: r.loja_nome_raw as string, loja_codigo_raw: (r.loja_codigo_raw as string | null) ?? null,
        motorista_nome: (r.motorista_nome as string | null) ?? null, carro_ordem: (r.carro_ordem as 1 | 2) ?? 1,
        data_entrega: (r.data_entrega as string | null) ?? data,
      }))
    }
  }
  const out: EscalaParaDia[] = []
  for (const p of escalaPaths) {
    const { data: blob } = await svc.storage.from('escalas-raw').download(p)
    if (!blob) continue
    const linhas = await parseEscalaArquivo(await blob.arrayBuffer(), p, data)
    for (const l of linhas) out.push({ rede_id: l.rede_id, placa_norm: l.placa_norm || null, loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw, motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega ?? data })
  }
  return out
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })
  const body = await req.json().catch(() => null)
  const data: string = body?.data
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida (YYYY-MM-DD).', { status: 400 })
  const escalaPaths: string[] = Array.isArray(body?.escalaPaths) ? body.escalaPaths : []

  const svc = createServiceClient()
  const escala = await escalaDoDia(svc, data, escalaPaths)
  if (escala.length === 0) return new NextResponse('Sem escala pra esse dia. Gere o KPI do dia ou envie a escala.', { status: 400 })

  const { lojas, geoStores } = await carregarLojasEGeo(svc)
  const entradas = await gerarDiaApi(svc, data, escala, lojas, geoStores)
  await salvarDiaApi(svc, data, entradas)
  const entregues = entradas.filter(e => e.status === 'entregue').length
  return NextResponse.json({ data, total: entradas.length, entregues })
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })
  const u = new URL(req.url)
  const periodo = u.searchParams.get('periodo') ?? 'dia'
  const ref = u.searchParams.get('data') ?? hojeBR()
  const [ini, fim] = periodo === 'custom'
    ? [u.searchParams.get('de') ?? ref, u.searchParams.get('ate') ?? ref]
    : intervaloPeriodo(periodo, ref)
  const redes = (u.searchParams.get('redes') ?? '').split(',').filter(Boolean)

  const svc = createServiceClient()
  const linhas = await carregarEntradasApi(svc, ini, fim)
  const filt = filtrar(linhas, { redes })
  let metricasAnterior = null
  if (periodo !== 'custom') {
    try {
      const [aIni, aFim] = intervaloAnterior(periodo, ref)
      const ant = filtrar(await carregarEntradasApi(svc, aIni, aFim), { redes })
      if (ant.length) metricasAnterior = calcularMetricas(ant)
    } catch { metricasAnterior = null }
  }
  return NextResponse.json({ periodo, ref, intervalo: [ini, fim], redes, metricas: calcularMetricas(filt), metricasAnterior })
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit 2>&1 | grep "^src/app/api/dashboard/beta" | head`
Expected: sem saída. Se o join `escala_uploads!inner(data_escala)` reclamar de tipo, simplificar: buscar `escala_uploads` (id por `data_escala=data`) e depois `escala_linhas` por `escala_upload_id in (...)` em duas queries.

- [ ] **Step 3: Suíte completa (nada quebrou)**

Run: `npx vitest run`
Expected: tudo passa (a rota não tem teste; garante que libs seguem ok).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/dashboard/beta/route.ts
git commit -m "feat(dashboard-api): rota /api/dashboard/beta (POST puxa+salva dia, GET agrega)"
```

---

## Task 5: UI — prop `endpoint` no DashboardClient + página beta + nav

**Files:**
- Modify: `src/app/painel/dashboard/dashboard-client.tsx`
- Create: `src/app/painel/dashboard/beta/page.tsx`
- Modify: `src/app/painel/nav.tsx`

- [ ] **Step 1: Adicionar prop `endpoint` (aditivo, default preserva normal)**

Em `src/app/painel/dashboard/dashboard-client.tsx`:

Trocar a assinatura (linha ~51):
```tsx
export default function DashboardClient({ resumo, tabInicial = 'geral', endpoint = '/api/dashboard' }: { resumo?: ResumoOperacaoData; tabInicial?: Tab; endpoint?: string }) {
```

Trocar a linha do fetch (~83) `fetch(`/api/dashboard?${qs}`)` por:
```tsx
    fetch(`${endpoint}?${qs}`)
```

> Só isso. O default `'/api/dashboard'` mantém o normal 100% idêntico. Os links de
> relatório/export que apontam pra `/api/dashboard/...` continuam — no beta eles
> referenciam o normal (aceitável; não são o foco do beta).

- [ ] **Step 2: Criar a página beta**

```tsx
// src/app/painel/dashboard/beta/page.tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import DashboardClient from '../dashboard-client'

export default function DashboardBetaPage() {
  const [data, setData] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [puxando, setPuxando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  async function puxarDia() {
    setPuxando(true); setMsg(null)
    try {
      const res = await fetch('/api/dashboard/beta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) })
      const txt = await res.text()
      if (!res.ok) throw new Error(txt)
      const j = JSON.parse(txt) as { total: number; entregues: number }
      setMsg(`Dia ${data}: ${j.entregues}/${j.total} entregues. Painel atualizado.`)
      setNonce(n => n + 1) // força o DashboardClient a refazer o fetch
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao puxar o dia.')
    } finally { setPuxando(false) }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-[12px] text-[var(--color-warning-soft-fg)]">
        <span className="font-semibold">🛰️ Dashboard API beta</span>
        <span>Puxa o dia da API (últimos ~4 dias) e acumula. Não substitui o normal.</span>
        <Link href="/painel" className="ml-auto underline">← Dashboard normal</Link>
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-[var(--color-fg-muted)]">Dia
          <input type="date" value={data} onChange={e => setData(e.target.value)} className="mt-1 rounded border border-[var(--color-border-strong)] bg-transparent px-2 py-1 text-sm text-[var(--color-fg)]" />
        </label>
        <button type="button" onClick={puxarDia} disabled={puxando}
          className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
          {puxando ? 'Puxando…' : '🛰️ Puxar dia pela API'}
        </button>
        {msg && <span className="text-xs text-[var(--color-fg-muted)]">{msg}</span>}
      </div>
      <DashboardClient key={nonce} endpoint="/api/dashboard/beta" />
    </div>
  )
}
```

> Se `--color-accent` não existir no tema, usar `--color-success` (existe — visto no
> KPI beta). Conferir rápido em `src/app/globals.css` e ajustar a classe do botão.

- [ ] **Step 3: Adicionar item no menu**

Em `src/app/painel/nav.tsx`, no grupo KPI (após a leaf do KPI beta, linha ~29), adicionar:
```tsx
      { href: '/painel/dashboard/beta', label: 'Dashboard (API beta)', Icon: ChartBar },
```

> `ChartBar` já é importado (usado em `DASHBOARD`). Se o lint reclamar de import
> não usado, ele já está em uso — sem mudança de import.

- [ ] **Step 4: Verificar tipos e lint**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head` → sem saída.
Run: `npx eslint src/app/painel/dashboard/dashboard-client.tsx src/app/painel/dashboard/beta/page.tsx src/app/painel/nav.tsx 2>&1 | grep -E "error" | grep -v warning | head` → sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/app/painel/dashboard/dashboard-client.tsx src/app/painel/dashboard/beta/page.tsx src/app/painel/nav.tsx
git commit -m "feat(dashboard-api): página /painel/dashboard/beta + prop endpoint + item de menu"
```

---

## Task 6: Validação ponta a ponta

**Files:** nenhum (validação).

- [ ] **Step 1: Validar via script (puxar um dia coberto + ler de volta)**

Criar `scripts/dev/e2e-dash-api.mts`:
```ts
import { config } from 'dotenv'; config({ path: '.env.local' })
import { createServiceClient } from '../../src/lib/supabase/service.ts'
import { gerarDiaApi, salvarDiaApi, carregarEntradasApi } from '../../src/lib/kpi/dashboard-api-fonte.ts'
import { calcularMetricas } from '../../src/lib/kpi/dashboard-metricas.ts'
const svc = createServiceClient()
const data = process.argv[2] ?? '2026-06-12'
// escala persistida do dia
const { data: ups } = await svc.from('escala_uploads').select('id').eq('data_escala', data)
const ids = (ups ?? []).map((u: any) => u.id)
const { data: rows } = await svc.from('escala_linhas').select('rede_id,loja_nome_raw,loja_codigo_raw,placa_norm,motorista_nome,carro_ordem,data_entrega').in('escala_upload_id', ids)
const escala = (rows ?? []).map((r: any) => ({ ...r, placa_norm: r.placa_norm || null }))
console.log(`escala do dia: ${escala.length} linhas`)
const [lojasRes, canonRes] = await Promise.all([
  svc.from('lojas').select('id,rede_id,nome,nome_normalizado,codigo_escala,codigo_unitrac,nome_unitrac,lat,lng,raio_metros,endereco,bairro,municipio,numero').eq('ativo', true).order('id'),
  svc.from('canonical_loja').select('id,name,lat,lng,raio_metros').not('lat','is',null).not('lng','is',null),
])
const lojas = (lojasRes.data ?? []).map((l: any) => ({ ...l, raio_metros: l.raio_metros ?? 150 }))
const geo = (canonRes.data ?? []).map((c: any) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, raio_metros: c.raio_metros ?? 150 }))
const ent = await gerarDiaApi(svc as any, data, escala as any, lojas as any, geo as any)
await salvarDiaApi(svc as any, data, ent)
const lido = await carregarEntradasApi(svc as any, data, data)
console.log(`gerado: ${ent.length} | relido do bucket: ${lido.length}`)
console.log('métricas:', JSON.stringify({ ...calcularMetricas(lido) }).slice(0, 300))
```

Run: `NODE_OPTIONS="--max-old-space-size=8192" npx tsx scripts/dev/e2e-dash-api.mts 2026-06-12`
Expected: imprime nº de linhas, relê do bucket o mesmo nº, e métricas com `entregue > 0`. Se a escala do dia não existir no banco, rodar com um dia em que a Tia já gerou KPI.

- [ ] **Step 2: Validar a tela (manual)**

`npm run dev` → abrir `/painel/dashboard/beta` → escolher o dia → "Puxar dia pela API" → conferir que o painel preenche (cards entregue/não foi/sem rastreador, por rede). Trocar período pra "mês" e ver o acúmulo.

- [ ] **Step 3: Commit do script + push + PR**

```bash
git add scripts/dev/e2e-dash-api.mts
git commit -m "test(dashboard-api): e2e puxar dia + reler do bucket"
git push -u origin feat/dashboard-api-beta
gh pr create --title "feat(dashboard): Dashboard API beta (acumula dia->mês via Storage)" --body "Dashboard beta que puxa o dia da API (escala+alvo/NF+GPS), acumula em bucket kpi-api-dash (1 JSON/dia) e agrega dia/semana/mês com o mesmo motor. Isolado: não toca kpi_manual_entradas, /api/dashboard, nem o pipeline de produção. Acesso por item de menu novo."
```

---

## Notas de risco / isolamento

- **Normal intocado:** dashboard normal lê `kpi_manual_entradas`; a beta lê o bucket
  `kpi-api-dash`. O único toque em arquivo do normal é o prop `endpoint` aditivo no
  `DashboardClient` (default = comportamento idêntico) e uma leaf no `nav.tsx`.
- **DDL evitado:** Storage em vez de tabela (DDL não-confiável aqui).
- **Janela da API:** só ~4 dias dão pra puxar; o histórico cresce por acúmulo.
- **Performance:** GET de um mês baixa até 31 JSONs pequenos em paralelo — ok pro beta.
