# Histórico Nutry Max Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada geração dos módulos "Gerar KPI" e "Gerar Romaneio" da Nutry Max passa a ser salva (banco + Storage) e listada numa tela de Histórico, com reabertura navegando de volta pra tela original.

**Architecture:** Tabela única `kpi_nutrimax_geracoes` (coluna `tipo`) + bucket `nutrimax-outputs` com um `cache.json` por geração (mesmo JSON que a rota já devolve hoje). Persistência é best-effort — nunca bloqueia a geração. Reabrir navega pra `/painel/nutrimax/gerar?geracao={id}` ou `/painel/nutrimax/romaneio?geracao={id}`, que busca o cache via uma rota compartilhada e repopula o estado.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + Storage), Vitest.

## Global Constraints

- Sem branches de feature — commits diretos na `main`, um por task, nos dois repos.
- `npx tsc --noEmit` e `npx vitest run` limpos antes de qualquer commit.
- Nunca `git push` sem confirmação explícita via `AskUserQuestion`.
- Nunca apagar/remover telas, rotas ou código existente sem permissão explícita.
- Credenciais do portal Unitrac e a senha do usuário de teste `teste@gmail.com` nunca vão pra memória nem pra arquivo — uso transitório, sempre rotacionadas de volta pra um valor aleatório logo após qualquer smoke test autenticado.
- Dois repos sincronizados a cada commit: `KPI TEMP` (`/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP`, remote `kpi-temporaria`) e `KPI transmonseg` (`/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg`, remote `kpi-transmonseg`) — mesmo projeto Supabase, então a migration só precisa ser aplicada uma vez no banco, mas o arquivo `.sql` e o código precisam ser commitados nos dois.
- Persistência é sempre best-effort: se salvar no banco/Storage falhar, a geração NÃO é bloqueada — o usuário recebe o XLSX normalmente.
- Sem guardar os PDFs originais (só o `cache.json`) — decisão já tomada no spec, não é fallback de reprocessamento.

---

### Task A: Migration + módulo `historico.ts`

**Files:**
- Create: `supabase/migrations/20260717000000_kpi_nutrimax_geracoes.sql`
- Create: `src/lib/kpi-nutrimax/historico.ts`
- Test: `src/lib/kpi-nutrimax/historico.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient` de `@supabase/supabase-js` (já usado em `src/lib/supabase/service.ts`).
- Produces: `salvarGeracao(svc, params): Promise<string | null>` e `buscarGeracao(svc, id): Promise<{ tipo: 'KPI' | 'ROMANEIO'; payload: unknown } | null>` — usados pelo Task B (rotas).

- [ ] **Step 1: Escrever a migration**

```sql
-- Histórico dos módulos "Gerar KPI" e "Gerar Romaneio" da Nutry Max — tabela
-- única com coluna `tipo`, mesma filosofia do kpi_simples do Benassi mas sem
-- granularidade linha-a-linha (a Nutry Max não tem lojas/redes como entidades
-- relacionais). O resultado completo de cada geração fica em Storage
-- (nutrimax-outputs/{id}/cache.json), aqui só o resumo pra listar rápido.
create table kpi_nutrimax_geracoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('KPI', 'ROMANEIO')),
  data date not null,
  filename text not null,
  resumo jsonb not null,
  gerado_por uuid not null references auth.users(id),
  gerado_em timestamptz not null default now()
);

create index kpi_nutrimax_geracoes_gerado_em_idx on kpi_nutrimax_geracoes (gerado_em desc);
create index kpi_nutrimax_geracoes_tipo_data_idx on kpi_nutrimax_geracoes (tipo, data desc);

alter table kpi_nutrimax_geracoes enable row level security;

create policy "kpi_nutrimax_geracoes_read"
  on kpi_nutrimax_geracoes
  for select
  to authenticated
  using (true);

-- Escrita só via service_role (rotas de API) — mesmo padrão de
-- kpi_nutrimax_entradas — sem policy de insert/update/delete pra `authenticated`.
```

- [ ] **Step 2: Escrever os testes de `historico.ts` (falhando)**

```ts
import { describe, it, expect, vi } from 'vitest'
import { salvarGeracao, buscarGeracao } from './historico'
import type { SupabaseClient } from '@supabase/supabase-js'

function fakeSvc(overrides: {
  insertResult?: { data: { id: string } | null; error: unknown }
  selectResult?: { data: { tipo: string } | null; error: unknown }
  downloadResult?: { data: { text: () => Promise<string> } | null; error: unknown }
  throwOnUpload?: boolean
}): SupabaseClient {
  const single = vi.fn(async () => overrides.insertResult ?? { data: { id: 'abc-123' }, error: null })
  const selectAfterInsert = vi.fn(() => ({ single }))
  const insert = vi.fn(() => ({ select: selectAfterInsert }))

  const maybeSingle = vi.fn(async () => overrides.selectResult ?? { data: { tipo: 'KPI' }, error: null })
  const eq = vi.fn(() => ({ maybeSingle }))
  const selectForRead = vi.fn(() => ({ eq }))

  const from = vi.fn((_table: string) => ({ insert, select: selectForRead }))

  const upload = vi.fn(async () => {
    if (overrides.throwOnUpload) throw new Error('upload boom')
    return { error: null }
  })
  const download = vi.fn(async () => overrides.downloadResult ?? { data: null, error: new Error('not found') })
  const storageFrom = vi.fn(() => ({ upload, download }))
  const createBucket = vi.fn(async () => ({ error: null }))

  return { from, storage: { from: storageFrom, createBucket } } as unknown as SupabaseClient
}

describe('salvarGeracao', () => {
  it('insere a linha, sobe o cache.json, devolve o id', async () => {
    const svc = fakeSvc({})
    const id = await salvarGeracao(svc, {
      tipo: 'KPI', data: '2026-07-17', filename: 'KPI-Nutry-Max-2026-07-17.xlsx',
      resumo: { total: 71 }, geradoPor: 'user-1', payload: { resumo: { total: 71 } },
    })
    expect(id).toBe('abc-123')
  })

  it('devolve null quando o insert falha, sem lançar', async () => {
    const svc = fakeSvc({ insertResult: { data: null, error: new Error('insert falhou') } })
    const id = await salvarGeracao(svc, {
      tipo: 'KPI', data: '2026-07-17', filename: 'x.xlsx', resumo: {}, geradoPor: 'user-1', payload: {},
    })
    expect(id).toBeNull()
  })

  it('devolve o id mesmo quando o upload do cache falha (best-effort)', async () => {
    const svc = fakeSvc({ throwOnUpload: true })
    const id = await salvarGeracao(svc, {
      tipo: 'ROMANEIO', data: '2026-07-17', filename: 'x.xlsx', resumo: {}, geradoPor: 'user-1', payload: {},
    })
    expect(id).toBe('abc-123')
  })
})

describe('buscarGeracao', () => {
  it('busca a linha e devolve tipo + payload do cache', async () => {
    const svc = fakeSvc({
      selectResult: { data: { tipo: 'ROMANEIO' }, error: null },
      downloadResult: { data: { text: async () => JSON.stringify({ resumo: { total: 5 } }) }, error: null },
    })
    const geracao = await buscarGeracao(svc, 'abc-123')
    expect(geracao).toEqual({ tipo: 'ROMANEIO', payload: { resumo: { total: 5 } } })
  })

  it('devolve null quando a linha não existe', async () => {
    const svc = fakeSvc({ selectResult: { data: null, error: null } })
    const geracao = await buscarGeracao(svc, 'nao-existe')
    expect(geracao).toBeNull()
  })

  it('devolve null quando o cache.json não existe', async () => {
    const svc = fakeSvc({
      selectResult: { data: { tipo: 'KPI' }, error: null },
      downloadResult: { data: null, error: new Error('not found') },
    })
    const geracao = await buscarGeracao(svc, 'abc-123')
    expect(geracao).toBeNull()
  })
})
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && npx vitest run src/lib/kpi-nutrimax/historico.test.ts`
Expected: FAIL — `Cannot find module './historico'`

- [ ] **Step 4: Criar `historico.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'nutrimax-outputs'

export type TipoGeracaoNutrimax = 'KPI' | 'ROMANEIO'

export type SalvarGeracaoParams = {
  tipo: TipoGeracaoNutrimax
  data: string
  filename: string
  resumo: Record<string, unknown>
  geradoPor: string
  /** Objeto completo salvo no cache.json — o mesmo JSON que a rota devolve
   *  pro browser (resumo + linhas + xlsxBase64 + filename). */
  payload: unknown
}

/** Persiste uma geração (Gerar KPI ou Gerar Romaneio) — best-effort: nunca
 *  lança. Devolve o id da geração, ou null se o INSERT falhar. Se só o
 *  upload do cache falhar, ainda devolve o id (a linha existe no histórico,
 *  só o "reabrir" dessa geração específica não vai funcionar). */
export async function salvarGeracao(
  svc: SupabaseClient,
  params: SalvarGeracaoParams,
): Promise<string | null> {
  const { data: inserted, error } = await svc
    .from('kpi_nutrimax_geracoes')
    .insert({
      tipo: params.tipo,
      data: params.data,
      filename: params.filename,
      resumo: params.resumo,
      gerado_por: params.geradoPor,
    })
    .select('id')
    .single()
  if (error || !inserted) return null
  const id = (inserted as { id: string }).id

  try {
    await svc.storage.createBucket(BUCKET, { public: false }).catch(() => {})
    await svc.storage
      .from(BUCKET)
      .upload(`${id}/cache.json`, Buffer.from(JSON.stringify(params.payload), 'utf-8'), {
        contentType: 'application/json',
        upsert: true,
      })
  } catch (e) {
    console.warn('[kpi-nutrimax/historico] cache upload falhou (best-effort):', e instanceof Error ? e.message : e)
  }
  return id
}

export type GeracaoCarregada = { tipo: TipoGeracaoNutrimax; payload: unknown }

/** Busca uma geração salva pelo id — devolve o tipo (pra tela saber como
 *  interpretar o payload) + o cache.json completo. null se a geração não
 *  existe ou o cache sumiu. */
export async function buscarGeracao(
  svc: SupabaseClient,
  id: string,
): Promise<GeracaoCarregada | null> {
  const { data: row, error } = await svc
    .from('kpi_nutrimax_geracoes')
    .select('tipo')
    .eq('id', id)
    .maybeSingle()
  if (error || !row) return null

  const { data: blob, error: dlErr } = await svc.storage.from(BUCKET).download(`${id}/cache.json`)
  if (dlErr || !blob) return null

  try {
    const payload = JSON.parse(await blob.text())
    return { tipo: (row as { tipo: TipoGeracaoNutrimax }).tipo, payload }
  } catch {
    return null
  }
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/kpi-nutrimax/historico.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 7: Commit**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
git add supabase/migrations/20260717000000_kpi_nutrimax_geracoes.sql src/lib/kpi-nutrimax/historico.ts src/lib/kpi-nutrimax/historico.test.ts
git commit -m "feat(nutrimax): tabela e módulo de persistência do Histórico

kpi_nutrimax_geracoes (tipo KPI/ROMANEIO) + salvarGeracao/buscarGeracao —
salva resumo no banco e o resultado completo (cache.json) no bucket
nutrimax-outputs. Best-effort: nunca bloqueia a geração se falhar."
```

---

### Task B: Rotas salvam a geração + rota de reabrir

**Files:**
- Modify: `src/app/api/kpi/nutrimax/gerar/route.ts` (arquivo inteiro)
- Modify: `src/app/api/kpi/nutrimax/romaneio/route.ts` (arquivo inteiro)
- Create: `src/app/api/kpi/nutrimax/historico/reabrir/route.ts`

**Interfaces:**
- Consumes: `salvarGeracao`, `buscarGeracao` (Task A); `createServiceClient()` de `@/lib/supabase/service` (já existente).
- Produces: as duas rotas de gerar passam a incluir `geracaoId: string | null` na resposta JSON (sem mudar mais nada do formato). A rota nova devolve `{ tipo, resumo, linhas, xlsxBase64, filename }`.

- [ ] **Step 1: Reescrever `gerar/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseEscalaNutrimax } from '@/lib/kpi-nutrimax/parse-escala'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { montaResumoViagemPorPlaca } from '@/lib/kpi-nutrimax/resumo-viagem'
import { montaKpiViagemPorCarga } from '@/lib/kpi-nutrimax/kpi-viagem'
import { gerarKpiViagemXlsx } from '@/lib/kpi-nutrimax/gerador-kpi-viagem'
import { MARCADOR_BASE_NUTRIMAX } from '@/lib/kpi-nutrimax/constants'
import { buscarResumosViagemViaApi, mesclarResumosPdfApi } from '@/lib/kpi-nutrimax/api-paradas'
import { salvarGeracao } from '@/lib/kpi-nutrimax/historico'
import type { ResumoVeiculo } from '@/lib/types/unitrac'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const form = await req.formData()
  const data = String(form.get('data') ?? '')
  const escalaFile = form.get('escala')
  const relatorioFile = form.get('relatorio')
  const modoApi = form.get('modoApi') === 'true'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida (YYYY-MM-DD)', { status: 400 })
  if (!(escalaFile instanceof File)) return new NextResponse('Escala de Rota (PDF) obrigatória', { status: 400 })
  if (!modoApi && !(relatorioFile instanceof File)) {
    return new NextResponse('Relatório Parada e Serviço (PDF) obrigatório', { status: 400 })
  }

  const escalaBuf = Buffer.from(await escalaFile.arrayBuffer())
  const escala = await parseEscalaNutrimax(escalaBuf)
  if (escala.length === 0) {
    return new NextResponse('Nenhuma carga reconhecida na escala — confira se o PDF é a "Escala de Rota".', { status: 422 })
  }

  const placasEscala = new Set(escala.map(e => e.placaNorm).filter(Boolean))

  let resumosVeiculo: ResumoVeiculo[]
  if (modoApi) {
    // Sem PDF pra cair de volta — se a API não trouxer nada, a geração segue
    // e o KPI reflete isso honestamente (tudo "sem_rastreador"), sem bloquear.
    resumosVeiculo = await buscarResumosViagemViaApi(placasEscala, data)
  } else {
    const relatorioBuf = Buffer.from(await (relatorioFile as File).arrayBuffer())
    const pdfResumos = await parseUnitracPdf(relatorioBuf, null, MARCADOR_BASE_NUTRIMAX)
    if (pdfResumos.length === 0) {
      return new NextResponse('Nenhum veículo reconhecido no relatório — confira se o PDF é o "Relatório Parada e Serviço".', { status: 422 })
    }
    try {
      const apiResumos = await buscarResumosViagemViaApi(placasEscala, data)
      resumosVeiculo = apiResumos.length > 0 ? mesclarResumosPdfApi(pdfResumos, apiResumos) : pdfResumos
    } catch (e) {
      console.warn('[/api/kpi/nutrimax/gerar] enriquecimento via API falhou (segue só com o PDF):', e instanceof Error ? e.message : e)
      resumosVeiculo = pdfResumos
    }
  }

  const resumoViagem = montaResumoViagemPorPlaca(resumosVeiculo)
  const kpi = montaKpiViagemPorCarga(escala, resumoViagem)
  const xlsxBuf = await gerarKpiViagemXlsx(kpi, data)

  const resumo = {
    total: kpi.length,
    ok: kpi.filter(k => k.status === 'ok').length,
    incompletos: kpi.filter(k => k.status === 'incompleto').length,
    semRastreador: kpi.filter(k => k.status === 'sem_rastreador').length,
    modoApi,
  }

  const linhas = kpi.map(k => ({
    carga: k.carga,
    placa: k.placaNorm,
    destino: k.destino,
    motorista: k.motorista,
    pesoKg: k.pesoKg,
    entPlanejado: k.entPlanejado,
    qtdParadasReal: k.qtdParadasReal,
    kmPercorrido: k.kmPercorrido,
    inicioViagem: k.inicioViagem,
    fimViagem: k.fimViagem,
    status: k.status,
  }))

  const filename = `KPI-Nutry-Max-${data}.xlsx`
  const resultado = { resumo, linhas, xlsxBase64: xlsxBuf.toString('base64'), filename }

  let geracaoId: string | null = null
  try {
    const svc = createServiceClient()
    geracaoId = await salvarGeracao(svc, {
      tipo: 'KPI',
      data,
      filename,
      resumo,
      geradoPor: user.id,
      payload: resultado,
    })
  } catch (e) {
    console.warn('[/api/kpi/nutrimax/gerar] salvar no histórico falhou (best-effort):', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ ...resultado, geracaoId })
}
```

- [ ] **Step 2: Reescrever `romaneio/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseEscalaNutrimax } from '@/lib/kpi-nutrimax/parse-escala'
import { parseRomaneioNutrimax } from '@/lib/kpi-nutrimax/parse-romaneio'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { montaRelatorioPorPlaca } from '@/lib/kpi-nutrimax/romaneio-conferencia'
import { gerarRomaneioConferencia } from '@/lib/kpi-nutrimax/gerador-romaneio-conferencia'
import { MARCADOR_BASE_NUTRIMAX } from '@/lib/kpi-nutrimax/constants'
import { buscarResumosViagemViaApi, mesclarResumosPdfApi } from '@/lib/kpi-nutrimax/api-paradas'
import { salvarGeracao } from '@/lib/kpi-nutrimax/historico'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const form = await req.formData()
  const data = String(form.get('data') ?? '')
  const escalaFile = form.get('escala')
  const romaneioFile = form.get('romaneio')
  const relatorioFile = form.get('relatorio')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida (YYYY-MM-DD)', { status: 400 })
  if (!(escalaFile instanceof File)) return new NextResponse('Escala de Rota (PDF) obrigatória', { status: 400 })
  if (!(romaneioFile instanceof File)) return new NextResponse('Romaneio de Entrega (PDF) obrigatório', { status: 400 })
  if (!(relatorioFile instanceof File)) return new NextResponse('Relatório Parada e Serviço (PDF) obrigatório', { status: 400 })

  const escalaBuf = Buffer.from(await escalaFile.arrayBuffer())
  const romaneioBuf = Buffer.from(await romaneioFile.arrayBuffer())
  const relatorioBuf = Buffer.from(await relatorioFile.arrayBuffer())

  const escala = await parseEscalaNutrimax(escalaBuf)
  if (escala.length === 0) {
    return new NextResponse('Nenhuma carga reconhecida na escala — confira se o PDF é a "Escala de Rota".', { status: 422 })
  }
  const romaneio = await parseRomaneioNutrimax(romaneioBuf)
  if (romaneio.length === 0) {
    return new NextResponse('Nenhum cliente reconhecido no romaneio — confira se o PDF é o "Romaneio de Entrega".', { status: 422 })
  }
  const pdfResumos = await parseUnitracPdf(relatorioBuf, null, MARCADOR_BASE_NUTRIMAX)
  if (pdfResumos.length === 0) {
    return new NextResponse('Nenhum veículo reconhecido no relatório — confira se o PDF é o "Relatório Parada e Serviço".', { status: 422 })
  }

  let resumosVeiculo = pdfResumos
  try {
    const placasEscala = new Set(escala.map(e => e.placaNorm).filter(Boolean))
    const apiResumos = await buscarResumosViagemViaApi(placasEscala, data)
    if (apiResumos.length > 0) resumosVeiculo = mesclarResumosPdfApi(pdfResumos, apiResumos)
  } catch (e) {
    console.warn('[/api/kpi/nutrimax/romaneio] enriquecimento via API falhou (segue só com o PDF):', e instanceof Error ? e.message : e)
  }

  const relatorio = montaRelatorioPorPlaca(escala, romaneio, resumosVeiculo)
  const xlsxBuf = await gerarRomaneioConferencia(relatorio)

  const resumo = {
    total: relatorio.length,
    ok: relatorio.filter(r => r.status === 'ok').length,
    divergentes: relatorio.filter(r => r.status === 'divergente').length,
    ausentes: relatorio.filter(r => r.status === 'ausente').length,
    pesoTotalKg: relatorio.reduce((acc, r) => acc + (r.pesoKg ?? 0), 0),
  }

  const linhas = relatorio.map(r => ({
    carga: r.carga,
    placa: r.placaNorm,
    destino: r.destino,
    motorista: r.motorista,
    pesoKg: r.pesoKg,
    nfPlanejado: r.nfPlanejado,
    nfRecebido: r.nfRecebido,
    entPlanejado: r.entPlanejado,
    entRecebido: r.entRecebido,
    kmPercorrido: r.kmPercorrido,
    qtdParadasReal: r.qtdParadasReal,
    status: r.status,
  }))

  const filename = `Romaneio-Nutry-${data}.xlsx`
  const resultado = { resumo, linhas, xlsxBase64: xlsxBuf.toString('base64'), filename }

  let geracaoId: string | null = null
  try {
    const svc = createServiceClient()
    geracaoId = await salvarGeracao(svc, {
      tipo: 'ROMANEIO',
      data,
      filename,
      resumo,
      geradoPor: user.id,
      payload: resultado,
    })
  } catch (e) {
    console.warn('[/api/kpi/nutrimax/romaneio] salvar no histórico falhou (best-effort):', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ ...resultado, geracaoId })
}
```

- [ ] **Step 3: Criar a rota de reabrir**

```ts
// src/app/api/kpi/nutrimax/historico/reabrir/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buscarGeracao } from '@/lib/kpi-nutrimax/historico'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const body = await req.json().catch(() => null) as { id?: string } | null
  const id = body?.id
  if (!id) return new NextResponse('"id" obrigatório', { status: 400 })

  const svc = createServiceClient()
  const geracao = await buscarGeracao(svc, id)
  if (!geracao) {
    return new NextResponse('Geração não encontrada ou expirada — gere novamente.', { status: 404 })
  }

  return NextResponse.json({ tipo: geracao.tipo, ...(geracao.payload as Record<string, unknown>) })
}
```

- [ ] **Step 4: Typecheck e suíte completa**

Run: `cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && npx tsc --noEmit && npx vitest run`
Expected: typecheck limpo, todos os testes passando (sem teste de integração pra essas rotas — mesmo padrão do resto do projeto; cobertura via smoke test no Task E).

- [ ] **Step 5: Commit**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
git add src/app/api/kpi/nutrimax/gerar/route.ts src/app/api/kpi/nutrimax/romaneio/route.ts src/app/api/kpi/nutrimax/historico/reabrir/route.ts
git commit -m "feat(nutrimax): rotas de gerar salvam no histórico + rota de reabrir"
```

---

### Task C: Tela de Histórico + nav

**Files:**
- Create: `src/app/painel/nutrimax/historico/page.tsx`
- Modify: `src/app/painel/nav.tsx:44-51`

**Interfaces:**
- Consumes: tabela `kpi_nutrimax_geracoes` (Task A) via `createServiceClient()`.
- Produces: rota `/painel/nutrimax/historico`, linkada pelo nav.

- [ ] **Step 1: Criar a tela de Histórico**

```tsx
import Link from 'next/link'
import { CaretLeft, CaretRight, FileMagnifyingGlass, ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr'
import { createServiceClient } from '@/lib/supabase/service'
import { fmtInstanteBR } from '@/lib/data-br'
import { Badge, cn } from '@/components/ui'

export const metadata = { title: 'Histórico Nutry Max — Transmonseg' }

const PER_PAGE = 25

type ResumoKpi = { total: number; ok: number; incompletos: number; semRastreador: number; modoApi?: boolean }
type ResumoRomaneio = { total: number; ok: number; divergentes: number; ausentes: number; pesoTotalKg: number }
type GeracaoRow = {
  id: string
  tipo: 'KPI' | 'ROMANEIO'
  data: string
  gerado_em: string | null
  resumo: ResumoKpi | ResumoRomaneio
}

async function fetchHistorico(params: { page: number; tipo: string; dataInicio: string; dataFim: string }) {
  const svc = createServiceClient()
  const from = (params.page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  let q = svc
    .from('kpi_nutrimax_geracoes')
    .select('id, tipo, data, gerado_em, resumo', { count: 'exact' })
    .order('gerado_em', { ascending: false })
    .range(from, to)

  if (params.tipo === 'KPI' || params.tipo === 'ROMANEIO') q = q.eq('tipo', params.tipo)
  if (params.dataInicio) q = q.gte('data', params.dataInicio)
  if (params.dataFim) q = q.lte('data', params.dataFim)

  const { data: rows, error, count } = await q
  if (error) throw new Error(error.message)

  const geracoes: GeracaoRow[] = (rows ?? []).map(r => ({
    id: r.id as string,
    tipo: r.tipo as 'KPI' | 'ROMANEIO',
    data: r.data as string,
    gerado_em: r.gerado_em as string | null,
    resumo: r.resumo as ResumoKpi | ResumoRomaneio,
  }))

  return { geracoes, total: count ?? 0 }
}

function formatarData(iso: string): string {
  const [a, m, d] = iso.split('-')
  if (!a || !m || !d) return iso
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  const mi = Number.parseInt(m, 10) - 1
  return `${Number.parseInt(d, 10)} ${meses[mi] ?? m} ${a}`
}

function resumoTexto(g: GeracaoRow): string {
  if (g.tipo === 'KPI') {
    const r = g.resumo as ResumoKpi
    return `${r.total} carga(s) · ${r.ok} OK · ${r.incompletos} incompletos · ${r.semRastreador} sem rastreador${r.modoApi ? ' · via API' : ''}`
  }
  const r = g.resumo as ResumoRomaneio
  return `${r.total} carga(s) · ${r.ok} OK · ${r.divergentes} divergentes · ${r.ausentes} ausentes`
}

function hrefReabrir(g: GeracaoRow): string {
  return g.tipo === 'KPI' ? `/painel/nutrimax/gerar?geracao=${g.id}` : `/painel/nutrimax/romaneio?geracao=${g.id}`
}

const INPUT_CLS =
  'h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[13px] text-[var(--color-fg)] cursor-pointer transition-[border-color,box-shadow] duration-150 hover:border-[var(--color-border-strong)] focus-visible:outline-none focus-visible:border-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/15'

const LABEL_CLS =
  'text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]'

export default async function NutrimaxHistoricoPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tipo?: string; inicio?: string; fim?: string }>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10))
  const tipo = sp.tipo ?? ''
  const dataInicio = sp.inicio ?? ''
  const dataFim = sp.fim ?? ''

  const { geracoes, total } = await fetchHistorico({ page, tipo, dataInicio, dataFim })
  const totalPages = Math.ceil(total / PER_PAGE)

  function buildHref(overrides: Record<string, string | number>) {
    const p = new URLSearchParams({
      page: String(page),
      ...(tipo ? { tipo } : {}),
      ...(dataInicio ? { inicio: dataInicio } : {}),
      ...(dataFim ? { fim: dataFim } : {}),
      ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])),
    })
    return `/painel/nutrimax/historico?${p.toString()}`
  }

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <header className="mb-10 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          <ClockCounterClockwise size={11} weight="bold" className="inline mr-1" />
          Nutry Max
        </span>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-fg)] md:text-[34px]">
          Histórico
        </h1>
        <p className="mt-1 max-w-[55ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Cada geração do Gerar KPI e do Gerar Romaneio fica registrada aqui. Clique numa linha
          pra reabrir e baixar o XLSX de novo, sem re-subir os arquivos.
        </p>
      </header>

      <div className="mb-6 flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-0.5 w-fit">
        {[{ id: '', label: 'Todas' }, { id: 'KPI', label: 'Gerar KPI' }, { id: 'ROMANEIO', label: 'Gerar Romaneio' }].map(o => (
          <Link
            key={o.id}
            href={buildHref({ tipo: o.id, page: 1 })}
            className={cn(
              'rounded-[4px] px-3 py-1 text-[12px] font-medium transition-colors',
              tipo === o.id
                ? 'bg-[var(--color-bg-elevated)] text-[var(--color-fg)] shadow-sm'
                : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
            )}
          >
            {o.label}
          </Link>
        ))}
      </div>

      <form
        method="GET"
        action="/painel/nutrimax/historico"
        className="mb-8 flex flex-wrap items-end gap-4 border-y border-[var(--color-border)] py-6"
      >
        {tipo && <input type="hidden" name="tipo" value={tipo} />}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="hist-inicio" className={LABEL_CLS}>De</label>
          <input id="hist-inicio" type="date" name="inicio" defaultValue={dataInicio} className={INPUT_CLS} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="hist-fim" className={LABEL_CLS}>Até</label>
          <input id="hist-fim" type="date" name="fim" defaultValue={dataFim} className={INPUT_CLS} />
        </div>
        <button
          type="submit"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-navy-700)] px-5 text-[13px] font-medium text-white shadow-soft transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.97] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-6px_rgba(31,56,100,0.45)]"
        >
          Filtrar
        </button>
        {(dataInicio || dataFim) && (
          <Link
            href={buildHref({ inicio: '', fim: '' })}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 text-[12px] font-medium text-[var(--color-fg-muted)] transition-all duration-150 hover:border-[var(--color-fg-muted)] hover:text-[var(--color-fg)] active:scale-[0.97]"
          >
            <span aria-hidden className="text-[14px] leading-none">×</span>
            Limpar
          </Link>
        )}
      </form>

      {geracoes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-6 py-16 text-center">
          <FileMagnifyingGlass size={28} weight="bold" className="text-[var(--color-fg-subtle)]" />
          <p className="text-[14px] text-[var(--color-fg-muted)]">
            Nenhuma geração registrada para os filtros selecionados.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border-y border-[var(--color-border)]">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left">
                <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">Data</th>
                <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">Tipo</th>
                <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">Resumo</th>
                <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">Gerado</th>
              </tr>
            </thead>
            <tbody>
              {geracoes.map(g => {
                const href = hrefReabrir(g)
                return (
                  <tr key={g.id} className="group border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-subtle)] cursor-pointer">
                    <td className="whitespace-nowrap px-4 py-4">
                      <Link href={href} className="flex flex-col">
                        <span className="font-medium text-[var(--color-fg)] group-hover:text-[var(--color-navy-700)]">{formatarData(g.data)}</span>
                        <span className="text-numeric text-[11px] text-[var(--color-fg-subtle)]">{g.data}</span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <Link href={href}>
                        <Badge variant={g.tipo === 'KPI' ? 'info' : 'success'}>{g.tipo === 'KPI' ? 'Gerar KPI' : 'Gerar Romaneio'}</Badge>
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <Link href={href} className="text-[12.5px] text-[var(--color-fg-muted)]">{resumoTexto(g)}</Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <Link href={href}>
                        <span className="text-numeric text-[12px] text-[var(--color-fg-muted)]">{fmtInstanteBR(g.gerado_em)}</span>
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-[12px] text-[var(--color-fg-muted)]">
            <span className="text-numeric font-medium text-[var(--color-fg)]">{total}</span>{' '}
            resultado{total !== 1 ? 's' : ''} · página{' '}
            <span className="text-numeric text-[var(--color-fg)]">{page}</span> de{' '}
            <span className="text-numeric">{totalPages}</span>
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link href={buildHref({ page: page - 1 })} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[12px] font-medium text-[var(--color-fg)] transition-colors active:scale-[0.97] hover:border-[var(--color-fg)]">
                <CaretLeft size={12} weight="bold" />
                Anterior
              </Link>
            ) : (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-[12px] text-[var(--color-fg-subtle)]">
                <CaretLeft size={12} weight="bold" />
                Anterior
              </span>
            )}
            {page < totalPages ? (
              <Link href={buildHref({ page: page + 1 })} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[12px] font-medium text-[var(--color-fg)] transition-colors active:scale-[0.97] hover:border-[var(--color-fg)]">
                Próxima
                <CaretRight size={12} weight="bold" />
              </Link>
            ) : (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-[12px] text-[var(--color-fg-subtle)]">
                Próxima
                <CaretRight size={12} weight="bold" />
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Adicionar o link no nav**

Em `src/app/painel/nav.tsx`, dentro do grupo `'Nutry Max'` (linhas 44-51), adicionar o item de Histórico:

```ts
  {
    label: 'Nutry Max',
    Icon: TableIcon,
    children: [
      { href: '/painel/nutrimax/romaneio', label: 'Gerar Romaneio', Icon: ClipboardText, exact: true },
      { href: '/painel/nutrimax/gerar', label: 'Gerar KPI', Icon: TableIcon },
      { href: '/painel/nutrimax/historico', label: 'Histórico', Icon: ClockCounterClockwise },
    ],
  },
```
(`ClockCounterClockwise` já está importado no topo do arquivo — usado pelo grupo "KPI" do Benassi.)

- [ ] **Step 3: Typecheck**

Run: `cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 4: Commit**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
git add src/app/painel/nutrimax/historico/page.tsx src/app/painel/nav.tsx
git commit -m "feat(nutrimax): tela de Histórico + link no menu"
```

---

### Task D: Reabertura nas telas de Gerar KPI e Gerar Romaneio

**Files:**
- Modify: `src/app/painel/nutrimax/gerar/page.tsx` (arquivo inteiro)
- Modify: `src/app/painel/nutrimax/romaneio/page.tsx` (arquivo inteiro)

**Interfaces:**
- Consumes: `POST /api/kpi/nutrimax/historico/reabrir` (Task B) — `{ id }` → `{ tipo, resumo, linhas, xlsxBase64, filename }`.

- [ ] **Step 1: Adicionar o `useEffect` de reabertura em `gerar/page.tsx`**

Adicionar `useEffect` ao import do React, `Link` e `ClockCounterClockwise` aos imports do topo:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarBlank, WarningCircle, FileArrowDown, Truck, WifiHigh, ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr'
import Link from 'next/link'
import { Badge, cn } from '@/components/ui'
import { FileDropzone } from '@/app/painel/file-dropzone'
```

Adicionar o estado e o efeito logo depois dos `useState` existentes (antes de `pronto`):

```tsx
  const [reabrindoId, setReabrindoId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const id = params.get('geracao')
    if (!id) return
    setReabrindoId(id)
    ;(async () => {
      try {
        const res = await fetch('/api/kpi/nutrimax/historico/reabrir', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id }),
        })
        if (!res.ok) throw new Error(await res.text())
        const json = await res.json() as { resumo: Resumo; linhas: Linha[]; xlsxBase64: string; filename: string }
        setResumo(json.resumo)
        setLinhas(json.linhas)
        setFiltro(json.resumo.incompletos + json.resumo.semRastreador > 0 ? 'problemas' : 'todas')
        setResultado({ xlsxBase64: json.xlsxBase64, filename: json.filename })
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível reabrir essa geração.')
      } finally {
        setReabrindoId(null)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

No `<header>`, adicionar o link pro Histórico ao lado do overline (troca o `<span>` solto por um `<div>` com o link):

```tsx
      <header className="mb-10 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
            KPI Nutry Max
          </span>
          <Link
            href="/painel/nutrimax/historico"
            className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
          >
            <ClockCounterClockwise size={13} weight="bold" />
            Histórico
          </Link>
        </div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-fg)] md:text-[34px]">
          Gerar KPI
        </h1>
        <p className="mt-1 max-w-[55ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Suba a Escala de Rota e o Relatório Parada e Serviço do Unitrac. O sistema cruza o
          planejado com o realizado de verdade (paradas e km reais, por GPS, completado com a
          API ao vivo) e gera o KPI por carga/placa.
        </p>
      </header>
```

Logo depois do `</header>`, adicionar o banner de "reabrindo" (antes da `<div className="mb-4 flex items-center gap-3">` do toggle Modo API):

```tsx
      {reabrindoId && (
        <div className="mb-6 flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-info)]/30 bg-[var(--color-info-soft)] px-5 py-4">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--color-info)] border-t-transparent" />
          <p className="text-[13px] text-[var(--color-info-soft-fg)]">Reabrindo geração #{reabrindoId.slice(0, 8)}…</p>
        </div>
      )}
```

Nenhuma outra parte do arquivo muda — `pronto`, `gerar`, `baixar`, `linhasFiltradas`, o restante do JSX (toggle, uploads, cards, tabela, botão) e as funções auxiliares (`CardResumo`, `FiltroChips`, `StatusBadge`) ficam exatamente como estão hoje.

- [ ] **Step 2: Mesmo padrão em `romaneio/page.tsx`**

Adicionar `useEffect` e `Link`/`ClockCounterClockwise` aos imports:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarBlank, WarningCircle, FileArrowDown, Truck, ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr'
import Link from 'next/link'
import { Badge, cn } from '@/components/ui'
import { FileDropzone } from '@/app/painel/file-dropzone'
```

Estado + efeito (mesmo formato, apontando pro tipo `Linha`/`Resumo` do Romaneio):

```tsx
  const [reabrindoId, setReabrindoId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const id = params.get('geracao')
    if (!id) return
    setReabrindoId(id)
    ;(async () => {
      try {
        const res = await fetch('/api/kpi/nutrimax/historico/reabrir', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id }),
        })
        if (!res.ok) throw new Error(await res.text())
        const json = await res.json() as { resumo: Resumo; linhas: Linha[]; xlsxBase64: string; filename: string }
        setResumo(json.resumo)
        setLinhas(json.linhas)
        setFiltro(json.resumo.divergentes + json.resumo.ausentes > 0 ? 'problemas' : 'todas')
        setResultado({ xlsxBase64: json.xlsxBase64, filename: json.filename })
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível reabrir essa geração.')
      } finally {
        setReabrindoId(null)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

Header com o link pro Histórico:

```tsx
      <header className="mb-10 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
            Nutry Max
          </span>
          <Link
            href="/painel/nutrimax/historico"
            className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
          >
            <ClockCounterClockwise size={13} weight="bold" />
            Histórico
          </Link>
        </div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-fg)] md:text-[34px]">
          Gerar Romaneio
        </h1>
        <p className="mt-1 max-w-[60ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Suba a Escala de Rota, o Romaneio de Entrega e o Relatório Parada e Serviço do
          Unitrac. Confere cada placa da escala contra o romaneio e cruza com o GPS real
          (paradas, km, horários) — devolve um XLSX com uma aba de resumo e uma aba por placa.
        </p>
      </header>

      {reabrindoId && (
        <div className="mb-6 flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-info)]/30 bg-[var(--color-info-soft)] px-5 py-4">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--color-info)] border-t-transparent" />
          <p className="text-[13px] text-[var(--color-info-soft-fg)]">Reabrindo geração #{reabrindoId.slice(0, 8)}…</p>
        </div>
      )}
```

Resto do arquivo (`pronto`, `processar`, `baixar`, uploads, cards, tabela, botão, funções auxiliares) inalterado.

- [ ] **Step 3: Typecheck**

Run: `cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 4: Rodar a suíte completa**

Run: `npx vitest run`
Expected: todos os testes passando

- [ ] **Step 5: Commit**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
git add src/app/painel/nutrimax/gerar/page.tsx src/app/painel/nutrimax/romaneio/page.tsx
git commit -m "feat(nutrimax): telas de gerar reabrem geração salva via ?geracao="
```

---

### Task E: Aplicar migration, smoke test, sincronização e ship

**Files:** nenhum arquivo novo — aplicação da migration no banco real e validação end-to-end.

- [ ] **Step 1: Aplicar a migration no banco**

Mesmo padrão já usado nas migrations anteriores desta sessão (sem Supabase CLI): clonar o cofre de chaves pro scratchpad só pra pegar a connection string, rodar um script Node com `pg`, apagar o clone logo depois.

```bash
git clone https://github.com/Joaquim-Salles/chaves-apis-joaquim.git /private/tmp/claude-501/-Users-joaquimsalles/*/scratchpad/chaves-apis-joaquim
# achar a connection string do Postgres do projeto luhwpsckvbctxynifryk no cofre
```

Rodar a migration via script `pg` (senha URL-encoded, `#`→`%23`), depois:

```bash
rm -rf /private/tmp/claude-501/-Users-joaquimsalles/*/scratchpad/chaves-apis-joaquim
```

- [ ] **Step 2: Suíte completa e typecheck**

Run: `cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && npx tsc --noEmit && npx vitest run`
Expected: typecheck limpo, todos os testes passando.

- [ ] **Step 3: Smoke test autenticado via chrome-devtools-mcp**

1. Setar senha temporária de `teste@gmail.com` via API admin do Supabase (mesmo script dos smoke tests anteriores).
2. `npm run dev` em background.
3. Login como `teste@gmail.com`, gerar um KPI (`/painel/nutrimax/gerar`, Escala + Relatório, data `2026-07-15`) e uma conferência de Romaneio (`/painel/nutrimax/romaneio`, os 3 arquivos).
4. Navegar pra `/painel/nutrimax/historico` — confirmar que as 2 gerações aparecem, com tipo/resumo/data corretos, chips de filtro (Todas/Gerar KPI/Gerar Romaneio) funcionando.
5. Clicar na linha do KPI — confirmar que navega pra `/painel/nutrimax/gerar?geracao=...`, mostra o banner "Reabrindo geração #...", e a tabela/cards/botão de download aparecem sem precisar subir arquivo nenhum.
6. Repetir pra linha do Romaneio, confirmando que abre em `/painel/nutrimax/romaneio?geracao=...`.
7. Checar console (`list_console_messages`) por erros nos dois fluxos.

- [ ] **Step 4: Limpar o ambiente**

```bash
pkill -f "next dev"
```

Rotacionar a senha de `teste@gmail.com` de volta pra um valor aleatório via o script do admin API (não printar a senha).

- [ ] **Step 5: Sincronizar com `KPI transmonseg`**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
git log --oneline origin/main..HEAD   # confirmar os commits das Tasks A-D
git diff origin/main..HEAD > /tmp/nutrimax-historico.patch

cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg"
git status --short     # confirmar working tree limpo antes de aplicar
git apply --check /tmp/nutrimax-historico.patch && git apply /tmp/nutrimax-historico.patch
npx tsc --noEmit && npx vitest run
git add -A
git commit -m "feat(nutrimax): Histórico — salva gerações do Gerar KPI e Gerar Romaneio

Tabela kpi_nutrimax_geracoes + bucket nutrimax-outputs (cache.json por
geração) + tela /painel/nutrimax/historico + reabertura navegando de volta
pras telas de gerar, mesmo padrão do Benassi."
rm -f /tmp/nutrimax-historico.patch
```

(A migration já foi aplicada no banco real no Step 1 — mesmo projeto Supabase pros dois repos, não precisa aplicar de novo.)

- [ ] **Step 6: Confirmar e enviar**

Perguntar ao usuário via `AskUserQuestion` se pode dar `git push` nos dois repos, mostrando o resumo do smoke test (as 2 gerações aparecendo no histórico, reabertura funcionando nos dois fluxos).

## Self-Review

**Cobertura do spec:** tabela única com `tipo` (Task A) ✓, bucket `nutrimax-outputs` sem guardar PDFs originais (Task A, `historico.ts` só grava o `payload` recebido, nunca os arquivos brutos) ✓, persistência best-effort nas duas rotas (Task B) ✓, rota de reabrir compartilhada (Task B) ✓, tela de Histórico com filtro por tipo e data (Task C) ✓, reabertura navegando pras telas de gerar (Task D) ✓, nav (Task C) ✓, smoke test dos dois fluxos (Task E) ✓.

**Consistência de tipos:** `salvarGeracao(svc, params): Promise<string | null>` e `buscarGeracao(svc, id): Promise<GeracaoCarregada | null>` definidos no Task A são usados com a mesma assinatura no Task B. O `payload` salvo em `salvarGeracao` (Task B: `resultado = { resumo, linhas, xlsxBase64, filename }`) é exatamente o formato que a rota de reabrir devolve e que o `useEffect` do Task D espera (`{ resumo, linhas, xlsxBase64, filename }`). Os tipos `Resumo`/`Linha` já existentes em cada tela (Gerar KPI e Gerar Romaneio) não mudam — a reabertura só popula os mesmos estados que a geração normal já usa.
