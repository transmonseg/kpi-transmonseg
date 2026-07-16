# Modo API no Gerar KPI Nutry Max Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O "Gerar KPI" da Nutry Max passa a sempre completar as paradas do PDF com dados ao vivo da API do Unitrac (best-effort), e ganha um toggle "Modo API" que dispensa o PDF inteiramente.

**Architecture:** Módulo novo `api-paradas.ts` busca e consolida paradas ao vivo via `buscarStopsCru`+`consolidaParadasApi` (já existentes, do Benassi) e as converte pro formato `ResumoVeiculo[]` que o pipeline da Nutry Max já consome — nenhum módulo existente (`montaResumoViagemPorPlaca`, `montaKpiViagemPorCarga`, gerador) muda. A rota decide a origem das paradas (PDF+API mesclado, ou só API) e a tela ganha o toggle.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest, módulo `@/lib/unitrac-api` (já existente, usado pelo Benassi).

## Global Constraints

- Sem branches de feature — commits diretos na `main`, um por task, nos dois repos.
- `npx tsc --noEmit` e `npx vitest run` limpos antes de qualquer commit.
- Nunca `git push` sem confirmação explícita via `AskUserQuestion`.
- Nunca apagar/remover telas, rotas ou código existente sem permissão explícita.
- Credenciais do portal Unitrac e a senha do usuário de teste `teste@gmail.com` nunca vão pra memória nem pra arquivo — uso transitório, sempre rotacionadas de volta pra um valor aleatório logo após qualquer smoke test autenticado.
- Dois repos sincronizados a cada commit: `KPI TEMP` (`/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP`, remote `kpi-temporaria`) e `KPI transmonseg` (`/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg`, remote `kpi-transmonseg`) — mesmo projeto Supabase, sem migration nova nesta feature.
- API ao vivo não devolve km por parada — `distancia_km` sempre `null` pras paradas vindas da API (honesto, não inventa).
- `MARCADOR_BASE_NUTRIMAX` e o parâmetro `marcadorBase` de `parseUnitracPdf` já existem (commit `a13331c`) — não recriar.

---

### Task A: Módulo `api-paradas.ts` (busca + merge)

**Files:**
- Modify: `src/lib/kpi-nutrimax/constants.ts`
- Create: `src/lib/kpi-nutrimax/api-paradas.ts`
- Test: `src/lib/kpi-nutrimax/api-paradas.test.ts`

**Interfaces:**
- Consumes: `buscarFrota(codUser?: string): Promise<VeiculoApi[]>` (`@/lib/unitrac-api/frota`), `buscarPontos(cvs: string[]): Promise<MapaPontos>` (`@/lib/unitrac-api/pontos`), `buscarStopsCru(cv: string, horas: number): Promise<StopApiCru[]>` + `consolidaParadasApi(eventos, pontos, data, placaNorm, baseCoord?): UnitracParadaRow[]` (`@/lib/unitrac-api/consolida`), `COD_USER_NUTRIMAX: string` (`@/lib/unitrac-api/client`), `mesclarParadas(pdf: UnitracParadaRow[], api: UnitracParadaRow[]): UnitracParadaRow[]` (`@/lib/kpi/merge-paradas`), `mapLimitSettled<T,R>(items, limit, fn): Promise<PromiseSettledResult<R>[]>` (`@/lib/utils/map-limit`), tipo `UnitracParadaRow` (`@/lib/kpi/matcher`), tipos `ResumoVeiculo`/`ParadaUnitrac`/`ClassificacaoParada` (`@/lib/types/unitrac`).
- Produces: `buscarResumosViagemViaApi(placasEscala: ReadonlySet<string>, data: string): Promise<ResumoVeiculo[]>` e `mesclarResumosPdfApi(pdfResumos: ResumoVeiculo[], apiResumos: ResumoVeiculo[]): ResumoVeiculo[]` — usados pelo Task B (rota).

- [ ] **Step 1: Adicionar a coordenada da base em `constants.ts`**

Ler o arquivo atual primeiro (`src/lib/kpi-nutrimax/constants.ts` já tem `MARCADOR_BASE_NUTRIMAX`). Adicionar ao fim:

```ts

/** Coordenada do CD/garagem da Nutry Max — derivada de 48 paradas reais
 *  classificadas BASE após o fix do marcador (commit a13331c), média das
 *  coordenadas (todas a poucos metros uma da outra). Usada por
 *  `consolidaParadasApi` pra classificar paradas via API como BASE (raio
 *  de 500m em volta). */
export const BASE_COORD_NUTRIMAX = { lat: -22.816007, lng: -43.277827 }
```

- [ ] **Step 2: Escrever os testes de `api-paradas.ts` (falhando)**

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/unitrac-api/frota', () => ({
  buscarFrota: vi.fn(async () => [
    { cv: '111', placa: 'TTL-7D40', placaNorm: 'TTL7D40' },
    { cv: '222', placa: 'ZZZ-9Z99', placaNorm: 'ZZZ9Z99' }, // não está na escala do teste
  ]),
}))
vi.mock('@/lib/unitrac-api/pontos', () => ({
  buscarPontos: vi.fn(async () => ({})),
}))
vi.mock('@/lib/unitrac-api/consolida', () => ({
  buscarStopsCru: vi.fn(async () => []),
  consolidaParadasApi: vi.fn((_eventos: unknown, _pontos: unknown, _data: string, placaNorm: string) => {
    if (placaNorm !== 'TTL7D40') return []
    return [{
      id: 'TTL7D40-api-1', placa_norm: 'TTL7D40',
      chegada: '2026-07-15T10:00:00.000Z', saida: '2026-07-15T10:20:00.000Z',
      duracao_seg: 1200, local_parada: '165049 - CLIENTE TESTE',
      codigo_loja: '165049', nome_loja: 'CLIENTE TESTE',
      lat: -22.9, lng: -43.2, endereco: null, classificacao: 'LOJA', ordem: 1,
    }]
  }),
}))

import { buscarResumosViagemViaApi, mesclarResumosPdfApi } from './api-paradas'
import type { ResumoVeiculo, ParadaUnitrac } from '@/lib/types/unitrac'

function parada(overrides: Partial<ParadaUnitrac> = {}): ParadaUnitrac {
  return {
    placa_norm: 'TTL7D40',
    chegada: new Date('2026-07-15T10:00:00.000Z'),
    saida: new Date('2026-07-15T10:20:00.000Z'),
    duracao_seg: 1200,
    distancia_km: 12.5,
    endereco: null,
    lat: -22.9,
    lng: -43.2,
    local_parada: '165049 - CLIENTE TESTE',
    codigo_loja: '165049',
    nome_loja: 'CLIENTE TESTE',
    classificacao: 'LOJA',
    ordem: 1,
    ...overrides,
  }
}

function resumoVeiculo(overrides: Partial<ResumoVeiculo> = {}): ResumoVeiculo {
  return {
    placa_norm: 'TTL7D40',
    placa_raw: 'TTL7D40',
    inicio_viagem: new Date('2026-07-15T08:00:00.000Z'),
    fim_viagem: new Date('2026-07-15T16:00:00.000Z'),
    qtd_paradas: 1,
    saida_cd: null,
    paradas: [parada()],
    ...overrides,
  }
}

describe('buscarResumosViagemViaApi', () => {
  it('filtra pelas placas da escala e ignora as que não estão nela', async () => {
    const resumos = await buscarResumosViagemViaApi(new Set(['TTL7D40']), '2026-07-15')
    expect(resumos).toHaveLength(1)
    expect(resumos[0].placa_norm).toBe('TTL7D40')
  })

  it('distancia_km sempre null (API ao vivo não devolve km por parada)', async () => {
    const resumos = await buscarResumosViagemViaApi(new Set(['TTL7D40']), '2026-07-15')
    expect(resumos[0].paradas.every(p => p.distancia_km === null)).toBe(true)
  })

  it('retorna [] quando nenhuma placa da frota está na escala', async () => {
    const resumos = await buscarResumosViagemViaApi(new Set(['XXX0000']), '2026-07-15')
    expect(resumos).toEqual([])
  })
})

describe('mesclarResumosPdfApi', () => {
  it('parada da API duplicada (mesma coordenada e horário do PDF) é descartada — mantém o dado do PDF', () => {
    const pdf = [resumoVeiculo()]
    const api = [resumoVeiculo({ paradas: [parada({ distancia_km: null })] })] // mesma coordenada/horário, sem km (como a API real)
    const out = mesclarResumosPdfApi(pdf, api)
    expect(out).toHaveLength(1)
    expect(out[0].paradas).toHaveLength(1)
    expect(out[0].paradas[0].distancia_km).toBe(12.5)
  })

  it('parada só-API (fora da janela do PDF) é mantida', () => {
    const pdf = [resumoVeiculo()]
    const api = [resumoVeiculo({
      paradas: [parada({
        chegada: new Date('2026-07-15T14:00:00.000Z'), saida: new Date('2026-07-15T14:20:00.000Z'),
        lat: -22.95, lng: -43.25, codigo_loja: '999999', nome_loja: 'OUTRO CLIENTE', distancia_km: null,
      })],
    })]
    const out = mesclarResumosPdfApi(pdf, api)
    expect(out[0].paradas).toHaveLength(2)
    expect(out[0].qtd_paradas).toBe(2)
  })

  it('placa que só aparece na API entra como está', () => {
    const api = [resumoVeiculo({ placa_norm: 'ZZZ9Z99', paradas: [parada({ placa_norm: 'ZZZ9Z99' })] })]
    const out = mesclarResumosPdfApi([], api)
    expect(out).toHaveLength(1)
    expect(out[0].placa_norm).toBe('ZZZ9Z99')
  })

  it('placa que só aparece no PDF fica igual (sem API pra essa placa)', () => {
    const pdf = [resumoVeiculo()]
    const out = mesclarResumosPdfApi(pdf, [])
    expect(out).toEqual(pdf)
  })
})
```

- [ ] **Step 3: Rodar os testes e confirmar que falham (módulo não existe ainda)**

Run: `cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && npx vitest run src/lib/kpi-nutrimax/api-paradas.test.ts`
Expected: FAIL — `Cannot find module './api-paradas'`

- [ ] **Step 4: Criar `api-paradas.ts`**

```ts
import { buscarFrota } from '@/lib/unitrac-api/frota'
import { buscarPontos } from '@/lib/unitrac-api/pontos'
import { buscarStopsCru, consolidaParadasApi } from '@/lib/unitrac-api/consolida'
import { COD_USER_NUTRIMAX } from '@/lib/unitrac-api/client'
import { mesclarParadas } from '@/lib/kpi/merge-paradas'
import { mapLimitSettled } from '@/lib/utils/map-limit'
import type { ResumoVeiculo, ParadaUnitrac, ClassificacaoParada } from '@/lib/types/unitrac'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { BASE_COORD_NUTRIMAX, MARCADOR_BASE_NUTRIMAX } from './constants'

const HORAS_JANELA = 48
const CONCORRENCIA = 8

function unitracRowToParada(row: UnitracParadaRow): ParadaUnitrac {
  return {
    placa_norm: row.placa_norm,
    chegada: new Date(row.chegada),
    saida: row.saida ? new Date(row.saida) : new Date(row.chegada),
    duracao_seg: row.duracao_seg ?? 0,
    // API ao vivo não devolve distância por parada — só o PDF tem esse dado.
    distancia_km: null,
    endereco: row.endereco ?? null,
    lat: row.lat,
    lng: row.lng,
    // consolidaParadasApi grava "BASE BENASSI - BASE BENASSI" pra paradas BASE
    // (hardcoded lá, módulo compartilhado com o Benassi) — corrige aqui na borda
    // pra não vazar o nome errado no output da Nutry Max.
    local_parada: row.classificacao === 'BASE' ? MARCADOR_BASE_NUTRIMAX : row.local_parada,
    codigo_loja: row.codigo_loja,
    nome_loja: row.nome_loja,
    classificacao: row.classificacao as ClassificacaoParada,
    ordem: row.ordem,
  }
}

function paradaToUnitracRow(p: ParadaUnitrac, idx: number): UnitracParadaRow {
  return {
    id: `${p.placa_norm}-${idx}`,
    placa_norm: p.placa_norm,
    chegada: p.chegada.toISOString(),
    saida: p.saida.toISOString(),
    duracao_seg: p.duracao_seg,
    local_parada: p.local_parada,
    codigo_loja: p.codigo_loja,
    nome_loja: p.nome_loja,
    lat: p.lat,
    lng: p.lng,
    endereco: p.endereco,
    classificacao: p.classificacao,
    ordem: p.ordem,
  }
}

function agrupaResumosPorPlaca(rows: UnitracParadaRow[]): ResumoVeiculo[] {
  const porPlaca = new Map<string, UnitracParadaRow[]>()
  for (const r of rows) {
    const arr = porPlaca.get(r.placa_norm) ?? []
    arr.push(r)
    porPlaca.set(r.placa_norm, arr)
  }
  const out: ResumoVeiculo[] = []
  for (const [placa_norm, group] of porPlaca) {
    const ordenado = [...group].sort((a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime())
    const paradas = ordenado.map((r, i) => ({ ...unitracRowToParada(r), ordem: i + 1 }))
    out.push({
      placa_norm,
      placa_raw: placa_norm,
      inicio_viagem: paradas.length > 0 ? paradas[0].chegada : null,
      fim_viagem: paradas.length > 0 ? paradas[paradas.length - 1].saida : null,
      qtd_paradas: paradas.length,
      saida_cd: null,
      paradas,
    })
  }
  return out
}

/** Busca as paradas ao vivo da API do Unitrac pras placas da escala, no
 *  mesmo formato ResumoVeiculo[] que parseUnitracPdf produz — o resto do
 *  pipeline da Nutry Max (montaResumoViagemPorPlaca, montaKpiViagemPorCarga)
 *  não precisa saber de onde os dados vieram. */
export async function buscarResumosViagemViaApi(
  placasEscala: ReadonlySet<string>,
  data: string,
): Promise<ResumoVeiculo[]> {
  const frota = await buscarFrota(COD_USER_NUTRIMAX)
  const veiculosEscala = frota.filter(v => placasEscala.has(v.placaNorm))
  if (veiculosEscala.length === 0) return []

  const cvs = veiculosEscala.map(v => v.cv)
  const pontos = await buscarPontos(cvs)

  const settled = await mapLimitSettled(veiculosEscala, CONCORRENCIA, (v) =>
    buscarStopsCru(v.cv, HORAS_JANELA).then(eventos =>
      consolidaParadasApi(eventos, pontos, data, v.placaNorm, BASE_COORD_NUTRIMAX)))

  const rows: UnitracParadaRow[] = []
  for (const r of settled) if (r.status === 'fulfilled') rows.push(...r.value)

  return agrupaResumosPorPlaca(rows)
}

/** Mescla paradas do PDF (autoritativas) com as da API (ao vivo), igual ao
 *  Benassi: só adiciona da API o que o PDF ainda não tem (dedup por
 *  coordenada+janela de tempo, via mesclarParadas). */
export function mesclarResumosPdfApi(
  pdfResumos: ResumoVeiculo[],
  apiResumos: ResumoVeiculo[],
): ResumoVeiculo[] {
  const apiPorPlaca = new Map(apiResumos.map(r => [r.placa_norm, r]))
  const usadas = new Set<string>()

  const out: ResumoVeiculo[] = pdfResumos.map(pdfR => {
    const apiR = apiPorPlaca.get(pdfR.placa_norm)
    if (!apiR) return pdfR
    usadas.add(pdfR.placa_norm)

    const pdfRows = pdfR.paradas.map((p, i) => paradaToUnitracRow(p, i))
    const apiRows = apiR.paradas.map((p, i) => paradaToUnitracRow(p, i))
    const mescladas = mesclarParadas(pdfRows, apiRows)
    const paradas = mescladas
      .map(r => unitracRowToParada(r))
      .sort((a, b) => a.chegada.getTime() - b.chegada.getTime())
      .map((p, i) => ({ ...p, ordem: i + 1 }))

    return { ...pdfR, paradas, qtd_paradas: paradas.length }
  })

  for (const apiR of apiResumos) {
    if (!usadas.has(apiR.placa_norm)) out.push(apiR)
  }
  return out
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && npx vitest run src/lib/kpi-nutrimax/api-paradas.test.ts`
Expected: PASS (8 testes)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 7: Commit**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
git add src/lib/kpi-nutrimax/constants.ts src/lib/kpi-nutrimax/api-paradas.ts src/lib/kpi-nutrimax/api-paradas.test.ts
git commit -m "feat(nutrimax): busca e mescla paradas ao vivo da API Unitrac

buscarResumosViagemViaApi (buscarStopsCru+consolidaParadasApi, mesma
mecânica do modo API do Benassi) e mesclarResumosPdfApi (dedup PDF+API por
coordenada+tempo, via mesclarParadas já existente). Devolvem ResumoVeiculo[]
— o mesmo formato de parseUnitracPdf, então o resto do pipeline da Nutry
Max não muda."
```

---

### Task B: Rota — modo normal completa com API, toggle pula o PDF

**Files:**
- Modify: `src/app/api/kpi/nutrimax/gerar/route.ts` (arquivo inteiro)

**Interfaces:**
- Consumes: `buscarResumosViagemViaApi`, `mesclarResumosPdfApi` (Task A).
- Produces: resposta JSON inalterada na forma (`{ resumo, linhas, xlsxBase64, filename }`) — consumida pelo Task C.

- [ ] **Step 1: Reescrever `route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseEscalaNutrimax } from '@/lib/kpi-nutrimax/parse-escala'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { montaResumoViagemPorPlaca } from '@/lib/kpi-nutrimax/resumo-viagem'
import { montaKpiViagemPorCarga } from '@/lib/kpi-nutrimax/kpi-viagem'
import { gerarKpiViagemXlsx } from '@/lib/kpi-nutrimax/gerador-kpi-viagem'
import { MARCADOR_BASE_NUTRIMAX } from '@/lib/kpi-nutrimax/constants'
import { buscarResumosViagemViaApi, mesclarResumosPdfApi } from '@/lib/kpi-nutrimax/api-paradas'
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
  const xlsxBuf = await gerarKpiViagemXlsx(kpi)

  const resumo = {
    total: kpi.length,
    ok: kpi.filter(k => k.status === 'ok').length,
    incompletos: kpi.filter(k => k.status === 'incompleto').length,
    semRastreador: kpi.filter(k => k.status === 'sem_rastreador').length,
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
    status: k.status,
  }))

  return NextResponse.json({
    resumo,
    linhas,
    xlsxBase64: xlsxBuf.toString('base64'),
    filename: `KPI-Nutry-Max-${data}.xlsx`,
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 3: Rodar a suíte completa**

Run: `npx vitest run`
Expected: todos os testes passam (sem teste de integração pra rota — mesmo padrão do resto do projeto; cobertura via smoke test manual no Task D)

- [ ] **Step 4: Commit**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
git add src/app/api/kpi/nutrimax/gerar/route.ts
git commit -m "feat(nutrimax): Gerar KPI completa com API ao vivo; modo API dispensa o PDF"
```

---

### Task C: Tela — toggle "Modo API"

**Files:**
- Modify: `src/app/painel/nutrimax/gerar/page.tsx` (arquivo inteiro)

**Interfaces:**
- Consumes: rota do Task B (aceita `modoApi` no FormData; `relatorio` vira opcional quando `modoApi=true`).

- [ ] **Step 1: Reescrever `page.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { ArrowRight, CalendarBlank, WarningCircle, FileArrowDown, Truck, WifiHigh } from '@phosphor-icons/react/dist/ssr'
import { Badge, cn } from '@/components/ui'
import { FileDropzone } from '@/app/painel/file-dropzone'

type Resumo = { total: number; ok: number; incompletos: number; semRastreador: number }
type Tone = 'default' | 'success' | 'warning' | 'danger'
type StatusLinha = 'ok' | 'incompleto' | 'sem_rastreador'
type Linha = {
  carga: string
  placa: string
  destino: string
  motorista: string
  pesoKg: number | null
  entPlanejado: number | null
  qtdParadasReal: number
  kmPercorrido: number | null
  status: StatusLinha
}
type Filtro = 'todas' | 'problemas' | 'ok'

export default function NutrimaxGerarPage() {
  const [escala, setEscala] = useState<File[]>([])
  const [relatorio, setRelatorio] = useState<File[]>([])
  const [modoApi, setModoApi] = useState(false)
  const [data, setData] = useState('')
  const [pending, setPending] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [filtro, setFiltro] = useState<Filtro>('problemas')
  const [resultado, setResultado] = useState<{ xlsxBase64: string; filename: string } | null>(null)

  const pronto = escala.length > 0 && (modoApi || relatorio.length > 0) && !!data

  async function gerar() {
    if (!pronto) return
    setPending(true)
    setErro(null)
    setResumo(null)
    setLinhas([])
    setResultado(null)
    try {
      const fd = new FormData()
      fd.set('escala', escala[0])
      if (!modoApi) fd.set('relatorio', relatorio[0])
      fd.set('data', data)
      if (modoApi) fd.set('modoApi', 'true')
      const res = await fetch('/api/kpi/nutrimax/gerar', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json() as { resumo: Resumo; linhas: Linha[]; xlsxBase64: string; filename: string }
      setResumo(json.resumo)
      setLinhas(json.linhas)
      setFiltro(json.resumo.incompletos + json.resumo.semRastreador > 0 ? 'problemas' : 'todas')
      setResultado({ xlsxBase64: json.xlsxBase64, filename: json.filename })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado.')
    } finally {
      setPending(false)
    }
  }

  function baixar() {
    if (!resultado) return
    const bin = atob(resultado.xlsxBase64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = resultado.filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const linhasFiltradas = useMemo(() => {
    if (filtro === 'todas') return linhas
    if (filtro === 'ok') return linhas.filter(l => l.status === 'ok')
    return linhas.filter(l => l.status !== 'ok')
  }, [linhas, filtro])

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <header className="mb-10 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          KPI Nutry Max
        </span>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-fg)] md:text-[34px]">
          Gerar KPI
        </h1>
        <p className="mt-1 max-w-[55ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Suba a Escala de Rota e o Relatório Parada e Serviço do Unitrac. O sistema cruza o
          planejado com o realizado de verdade (paradas e km reais, por GPS, completado com a
          API ao vivo) e gera o KPI por carga/placa.
        </p>
      </header>

      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={modoApi}
          onClick={() => setModoApi(v => !v)}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200',
            modoApi ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border-strong)]',
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200',
              modoApi ? 'translate-x-4' : 'translate-x-0.5',
            )}
          />
        </button>
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold text-[var(--color-fg)]">Modo API</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider rounded-full px-1.5 py-0.5 bg-[var(--color-info-soft)] text-[var(--color-info-soft-fg)]">Beta</span>
          <span className="text-[12px] text-[var(--color-fg-muted)]">
            {modoApi ? 'Paradas puxadas direto da API Unitrac — sem PDF necessário' : 'Ativar para gerar KPI só com a escala (sem PDF do Unitrac)'}
          </span>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="col-span-1 lg:col-span-7">
          <FileDropzone
            eyebrow="Passo 1"
            label="Escala de Rota"
            hint="PDF · o planejado (placa, destino, clientes previstos)"
            accept=".pdf"
            files={escala}
            onAdd={files => setEscala(files.slice(0, 1))}
            onRemove={() => setEscala([])}
          />
        </div>

        <div className="col-span-1 flex flex-col gap-4 lg:col-span-5">
          {modoApi ? (
            <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-success)]/40 bg-[var(--color-success)]/5 p-5">
              <div className="flex items-center gap-2">
                <WifiHigh size={16} weight="bold" className="text-[var(--color-success)]" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-success)]">API Unitrac · Passo 2 automático</span>
              </div>
              <p className="text-[13px] text-[var(--color-fg-muted)]">
                As paradas serão puxadas direto da API Unitrac em tempo real. Nenhum arquivo necessário.
              </p>
            </div>
          ) : (
            <FileDropzone
              eyebrow="Passo 2"
              label="Relatório Parada e Serviço"
              hint="PDF do Unitrac · paradas e km reais por placa"
              accept=".pdf"
              files={relatorio}
              onAdd={files => setRelatorio(files.slice(0, 1))}
              onRemove={() => setRelatorio([])}
            />
          )}

          <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
              <CalendarBlank size={12} weight="bold" />
              Passo 3 · Data de referência
            </div>
            <input
              id="data"
              type="date"
              value={data}
              onChange={e => setData(e.target.value)}
              className="mt-1 w-full bg-transparent text-[24px] font-medium tracking-tight text-[var(--color-fg)] outline-none [color-scheme:light] dark:[color-scheme:dark]"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>
        </div>
      </section>

      {erro && (
        <div className="mt-6 flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-5 py-4">
          <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
          <p className="text-[13px] leading-relaxed text-[var(--color-danger-soft-fg)]">{erro}</p>
        </div>
      )}

      {resumo && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CardResumo label="Total de cargas" valor={resumo.total} tone="default" />
          <CardResumo label="OK" valor={resumo.ok} tone="success" />
          <CardResumo label="Incompletos" valor={resumo.incompletos} tone="warning" />
          <CardResumo label="Sem rastreador" valor={resumo.semRastreador} tone="danger" />
        </div>
      )}

      {resumo && (
        <div className="mt-6 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-3">
            <div className="flex items-center gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-fg)]">
                <Truck size={16} weight="fill" className="text-[var(--color-accent)]" />
                Cargas
              </h2>
              <FiltroChips filtro={filtro} setFiltro={setFiltro} resumo={resumo} />
            </div>
            {resultado && (
              <button
                type="button"
                onClick={baixar}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-navy-700)] px-4 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
              >
                <FileArrowDown size={14} weight="bold" />
                Baixar XLSX
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] text-left">
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Carga</th>
                  <th className="w-32 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Placa</th>
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Destino</th>
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Motorista</th>
                  <th className="w-24 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Paradas</th>
                  <th className="w-24 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Km</th>
                  <th className="w-36 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Status</th>
                </tr>
              </thead>
              <tbody>
                {linhasFiltradas.map(l => (
                  <tr
                    key={`${l.carga}-${l.placa}`}
                    className={cn(
                      'border-b border-[var(--color-border)] last:border-0',
                      l.status !== 'ok' && 'bg-[var(--color-warning-soft)]/20',
                    )}
                  >
                    <td className="px-4 py-1.5 text-numeric font-medium text-[var(--color-fg)]">{l.carga}</td>
                    <td className="px-4 py-1.5 text-numeric text-[var(--color-fg)]">{l.placa}</td>
                    <td className="px-4 py-1.5 text-[var(--color-fg)]">{l.destino}</td>
                    <td className="px-4 py-1.5 text-[var(--color-fg-muted)]">{l.motorista}</td>
                    <td className="px-4 py-1.5 text-center text-numeric text-[var(--color-fg-muted)]">
                      {l.qtdParadasReal}{l.entPlanejado != null ? `/${l.entPlanejado}` : ''}
                    </td>
                    <td className="px-4 py-1.5 text-center text-numeric text-[var(--color-fg-muted)]">
                      {l.kmPercorrido != null ? l.kmPercorrido.toLocaleString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-1.5 text-center">
                      <StatusBadge status={l.status} />
                    </td>
                  </tr>
                ))}
                {linhasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--color-fg-subtle)]">
                      Nenhuma carga nesse filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={gerar}
        disabled={pending || !pronto}
        className={cn(
          'group relative mt-8 flex w-full items-center justify-between gap-4 overflow-hidden rounded-[var(--radius-card)] px-7 py-5 text-left transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.99]',
          pronto && !pending
            ? 'bg-[var(--color-navy-700)] text-white shadow-soft hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-10px_rgba(31,56,100,0.55)]'
            : pending
              ? 'bg-[var(--color-navy-700)] text-white'
              : 'cursor-not-allowed bg-[var(--color-bg-subtle)] border border-[var(--color-border)] text-[var(--color-fg-muted)]'
        )}
      >
        {pending && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 h-[3px] w-1/4 bg-white/80 animate-progress-sweep"
            style={{ filter: 'blur(0.3px)' }}
          />
        )}
        <div className="flex flex-col gap-1">
          <span className={cn('text-[11px] font-medium uppercase tracking-[0.18em]', pronto || pending ? 'text-white/60' : 'text-[var(--color-fg-muted)]')}>
            {pending ? 'Processando' : 'Gerar KPI'}
          </span>
          <span className="text-[18px] font-semibold tracking-tight">
            {pending ? (modoApi ? 'Puxando paradas da API…' : 'Cruzando escala com o relatório…') : pronto ? 'Gerar agora' : 'Aguardando arquivos'}
          </span>
        </div>
        {!pending && pronto && (
          <ArrowRight size={22} weight="bold" className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
        )}
        {pending && (
          <span className="flex items-center gap-1.5" aria-hidden>
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-dot" style={{ animationDelay: '0ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-dot" style={{ animationDelay: '180ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-dot" style={{ animationDelay: '360ms' }} />
          </span>
        )}
      </button>
    </div>
  )
}

function CardResumo({ label, valor, tone }: { label: string; valor: number; tone: Tone }) {
  const toneCls: Record<Tone, string> = {
    default: 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)]',
    success: 'border-transparent bg-[var(--color-success-soft)] text-[var(--color-success-soft-fg)]',
    warning: 'border-transparent bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-fg)]',
    danger: 'border-transparent bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-fg)]',
  }
  return (
    <div className={cn('rounded-xl border px-4 py-3 transition-colors', toneCls[tone])}>
      <div className="text-[22px] font-semibold leading-tight tracking-tight">{valor}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider opacity-80">{label}</div>
    </div>
  )
}

function FiltroChips({ filtro, setFiltro, resumo }: { filtro: Filtro; setFiltro: (f: Filtro) => void; resumo: Resumo }) {
  const opts: { id: Filtro; label: string; count: number }[] = [
    { id: 'todas', label: 'Todas', count: resumo.total },
    { id: 'problemas', label: 'Com problema', count: resumo.incompletos + resumo.semRastreador },
    { id: 'ok', label: 'OK', count: resumo.ok },
  ]
  return (
    <div className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-0.5">
      {opts.map(o => {
        const active = filtro === o.id
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => setFiltro(o.id)}
            className={cn(
              'rounded-[4px] px-2 py-0.5 text-[11px] font-medium transition-colors',
              active
                ? 'bg-[var(--color-bg-elevated)] text-[var(--color-fg)] shadow-sm'
                : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
            )}
          >
            {o.label} <span className="text-[var(--color-fg-subtle)]">({o.count})</span>
          </button>
        )
      })}
    </div>
  )
}

function StatusBadge({ status }: { status: StatusLinha }) {
  const cfg: Record<StatusLinha, { label: string; variant: 'success' | 'warning' | 'danger' }> = {
    ok: { label: 'OK', variant: 'success' },
    incompleto: { label: 'INCOMPLETO', variant: 'warning' },
    sem_rastreador: { label: 'SEM RASTREADOR', variant: 'danger' },
  }
  const c = cfg[status]
  return <Badge variant={c.variant}>{c.label}</Badge>
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
git add src/app/painel/nutrimax/gerar/page.tsx
git commit -m "feat(nutrimax): toggle Modo API na tela do Gerar KPI (igual ao Benassi)"
```

---

### Task D: Smoke test, sincronização e ship

**Files:** nenhum arquivo novo — validação end-to-end e sincronização com o repo `KPI transmonseg`.

- [ ] **Step 1: Suíte completa e typecheck no `KPI TEMP`**

Run: `cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && npx tsc --noEmit && npx vitest run`
Expected: typecheck limpo, todos os testes passando.

- [ ] **Step 2: Smoke test autenticado via chrome-devtools-mcp**

1. Setar senha temporária de `teste@gmail.com` via API admin do Supabase (`.env.local`, mesmo script já usado nos smoke tests anteriores).
2. `npm run dev` em background.
3. Login como `teste@gmail.com`, navegar pra `/painel/nutrimax/gerar`.
4. **Modo normal**: confirmar via `take_snapshot` que o toggle "Modo API" aparece desligado, upload de `Escala 01-07.pdf` + `relatorio_50655.pdf`, data `2026-07-15` (mesmo dia do relatório — usar a Escala 01-07 mesmo sendo de outro dia é aceitável só pra teste técnico, já usado antes nesta sessão). Gerar, confirmar `200` via `list_network_requests`. Checar console (`list_console_messages`) — como a API do Unitrac é chamada de verdade aqui (ao vivo), aceitável ela falhar/retornar vazio (rede de teste, fora do horário real) contanto que o fallback "segue só com PDF" funcione sem erro 500.
5. **Modo API**: ativar o toggle, confirmar que o dropzone do Relatório vira o card verde "API Unitrac · Passo 2 automático" e que o botão libera só com Escala + data. Gerar, confirmar que a rota responde (200 mesmo que os resultados venham todos "sem rastreador" — a rede de teste da API pode não ter dados pra essa data; o importante é não dar 500 nem travar).
6. Baixar o XLSX do modo normal, inspecionar via script Node/ExcelJS (mesmo padrão anterior): confirma que a aba tem KM Percorrido preenchido pra quem tem PDF.

- [ ] **Step 3: Limpar o ambiente**

```bash
rm -f ~/Downloads/KPI-Nutry-Max-*.xlsx
pkill -f "next dev"
```

Rotacionar a senha de `teste@gmail.com` de volta pra um valor aleatório via o script do admin API (não printar a senha).

- [ ] **Step 4: Sincronizar com `KPI transmonseg`**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
git log --oneline -8   # confirmar os commits desde a última sincronização (d117631)
git diff d117631..HEAD > /tmp/nutrimax-modo-api.patch

cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg"
git status --short     # confirmar working tree limpo antes de aplicar
git apply --check /tmp/nutrimax-modo-api.patch && git apply /tmp/nutrimax-modo-api.patch
npx tsc --noEmit && npx vitest run
git add -A
git commit -m "feat(nutrimax): modo API no Gerar KPI + fix do marcador de BASE

Gerar KPI passa a sempre completar as paradas do PDF com dados ao vivo da
API do Unitrac (best-effort), e ganha um toggle 'Modo API' que dispensa o
PDF inteiramente — mesmo mecanismo do Benassi (buscarStopsCru +
consolidaParadasApi), adaptado pro modelo por carga/placa da Nutry Max.
Inclui o fix do marcador de BASE parametrizado por cliente."
rm -f /tmp/nutrimax-modo-api.patch
```

- [ ] **Step 5: Confirmar e enviar**

Perguntar ao usuário via `AskUserQuestion` se pode dar `git push` nos dois repos, mostrando o resumo do smoke test (modo normal + modo API testados, typecheck e suíte completa passando nos dois repos).

## Self-Review

**Cobertura do spec:** módulo `api-paradas.ts` (Task A) ✓, rota com os 2 modos (Task B) ✓, toggle na tela (Task C) ✓, limitação de km documentada no código e na tela (Task A comentário + spec) ✓, fora de escopo (Romaneio, gabarito por loja) — não implementado, conforme decidido ✓, smoke test dos 2 modos (Task D) ✓.

**Consistência de tipos:** `buscarResumosViagemViaApi(placasEscala: ReadonlySet<string>, data: string): Promise<ResumoVeiculo[]>` e `mesclarResumosPdfApi(pdf: ResumoVeiculo[], api: ResumoVeiculo[]): ResumoVeiculo[]` definidos no Task A são usados com a mesma assinatura no Task B. `MARCADOR_BASE_NUTRIMAX`/`BASE_COORD_NUTRIMAX` de `constants.ts` usados consistentemente nos Tasks A e B.
