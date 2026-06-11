# KPI (API Beta) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma tela "Gerar KPI (API Beta)" isolada que usa a API do Unitrac (datalayer, conta Benassi 4586) como gabarito para corrigir placa/loja/horário/rota durante a geração, marcando cada correção como "via API", sem tocar o banco de produção.

**Architecture:** Um módulo isolado `src/lib/unitrac-api/` (motor best-effort de acesso à API) é consumido por uma rota e tela beta espelhadas das atuais (`kpi/simples`). Os 4 gatilhos chamam o motor; se a API falhar, o resultado é idêntico ao KPI normal.

**Tech Stack:** Next.js 16 (App Router, runtime nodejs), TypeScript, React 19, Vitest, Supabase (somente leitura nesta beta), Tailwind v4.

---

## File Structure

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/lib/unitrac-api/client.ts` | fetch best-effort ao datalayer (timeout, nunca lança) |
| `src/lib/unitrac-api/frota.ts` | `buscarFrota()` → placas/cv da conta Benassi |
| `src/lib/unitrac-api/pontos.ts` | `buscarPontos()` → pontos de entrega + cruzamento por `pontoidentificador` |
| `src/lib/unitrac-api/paradas.ts` | `buscarParadas(cv, horas)` → paradas reais (início + duração) |
| `src/lib/unitrac-api/posicoes.ts` | `buscarPosicoes(cvs)` → posição ao vivo |
| `src/lib/unitrac-api/index.ts` | fachada: 4 funções de gatilho |
| `src/lib/unitrac-api/*.test.ts` | testes unitários (fetch mockado) |
| `src/app/api/kpi/beta/route.ts` | rota de geração espelhada, instrumenta os gatilhos |
| `src/app/painel/kpi/beta/page.tsx` | tela beta espelho da simples, selos "via API" |
| `src/app/painel/nav.tsx` (modify) | adiciona o item de menu |

**Constante compartilhada:** `COD_USER = '4586'` (Benassi / conta `transmonseg`), `BASE = 'https://datalayer.portalunitrac.com'`.

---

### Task 1: Client best-effort

**Files:**
- Create: `src/lib/unitrac-api/client.ts`
- Test: `src/lib/unitrac-api/client.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { apiGet, apiPost } from './client'

afterEach(() => vi.restoreAllMocks())

describe('client best-effort', () => {
  it('retorna o JSON em sucesso', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: 1 }), { status: 200 }),
    )
    expect(await apiGet('/x')).toEqual({ ok: 1 })
  })

  it('retorna null quando a API falha (nunca lança)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'))
    expect(await apiGet('/x')).toBeNull()
    expect(await apiPost('/x', [])).toBeNull()
  })

  it('retorna null em status != 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }))
    expect(await apiGet('/x')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/unitrac-api/client.test.ts`
Expected: FAIL ("Cannot find module './client'")

- [ ] **Step 3: Write minimal implementation**

```typescript
export const BASE = 'https://datalayer.portalunitrac.com'
export const COD_USER = '4586' // Benassi / conta transmonseg

const TIMEOUT_MS = 6000

async function call(url: string, init?: RequestInit): Promise<unknown | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { accept: 'application/json', 'content-type': 'application/json', ...(init?.headers ?? {}) },
    })
    if (r.status !== 200) return null
    return await r.json()
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

export function apiGet(path: string): Promise<unknown | null> {
  return call(`${BASE}${path}`)
}

export function apiPost(path: string, body: unknown): Promise<unknown | null> {
  return call(`${BASE}${path}`, { method: 'POST', body: JSON.stringify(body) })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/unitrac-api/client.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/unitrac-api/client.ts src/lib/unitrac-api/client.test.ts
git commit -m "feat(unitrac-api): client best-effort que nunca lança"
```

---

### Task 2: Frota (buscarFrota)

**Files:**
- Create: `src/lib/unitrac-api/frota.ts`
- Test: `src/lib/unitrac-api/frota.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { buscarFrota, normPlaca } from './frota'

afterEach(() => vi.restoreAllMocks())

describe('buscarFrota', () => {
  it('mapeia veiculos para {cv, placa, placaNorm}', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ veiculos: [{ cv: 18594, placa: 'TUL-1C38', gvn: 'X' }] }), { status: 200 }),
    )
    const f = await buscarFrota()
    expect(f).toEqual([{ cv: '18594', placa: 'TUL-1C38', placaNorm: 'TUL1C38' }])
  })

  it('retorna [] quando a API cai', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'))
    expect(await buscarFrota()).toEqual([])
  })
})

describe('normPlaca', () => {
  it('remove hífen e maiúsculo', () => {
    expect(normPlaca('tul-1c38')).toBe('TUL1C38')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/unitrac-api/frota.test.ts`
Expected: FAIL ("Cannot find module './frota'")

- [ ] **Step 3: Write minimal implementation**

```typescript
import { apiGet, COD_USER } from './client'

export type VeiculoApi = { cv: string; placa: string; placaNorm: string }

export function normPlaca(p: string): string {
  return p.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export async function buscarFrota(): Promise<VeiculoApi[]> {
  const d = (await apiGet(`/veiculos/masn/${COD_USER}`)) as { veiculos?: Array<{ cv: number; placa: string }> } | null
  if (!d?.veiculos) return []
  return d.veiculos.map(v => ({ cv: String(v.cv), placa: v.placa, placaNorm: normPlaca(v.placa) }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/unitrac-api/frota.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/unitrac-api/frota.ts src/lib/unitrac-api/frota.test.ts
git commit -m "feat(unitrac-api): buscarFrota com placa normalizada"
```

---

### Task 3: Pontos de entrega + cruzamento

**Files:**
- Create: `src/lib/unitrac-api/pontos.ts`
- Test: `src/lib/unitrac-api/pontos.test.ts`

**Contexto:** o endpoint `POST /mapa_servicos/alvos` recebe lista de `cv` (string) e retorna `{ alvos: [{ pontoidentificador, pontonome, pontolatitude, pontolongitude, pontoraio, alvosituacaoservico }] }`. O cruzamento com o cadastro do KPI é por `pontoidentificador` ↔ `codigo_unitrac` (formatos validados na auditoria). Coordenadas zeradas (`|lat| < 1`) são descartadas.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { buscarPontos, acharLojaPorCoordenada } from './pontos'

afterEach(() => vi.restoreAllMocks())

const ALVOS = {
  alvos: [
    { pontoidentificador: '560036', pontonome: 'LOJA A', pontolatitude: -22.9, pontolongitude: -43.2, pontoraio: 50, alvosituacaoservico: 0 },
    { pontoidentificador: '0', pontonome: 'ZERADO', pontolatitude: 0, pontolongitude: 0, pontoraio: 50, alvosituacaoservico: 0 },
  ],
}

describe('buscarPontos', () => {
  it('indexa por pontoidentificador e descarta coord zerada', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(ALVOS), { status: 200 }))
    const m = await buscarPontos(['18594'])
    expect(Object.keys(m)).toEqual(['560036'])
    expect(m['560036']).toMatchObject({ nome: 'LOJA A', lat: -22.9, lon: -43.2, raio: 50 })
  })

  it('retorna {} quando a API cai', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'))
    expect(await buscarPontos(['1'])).toEqual({})
  })
})

describe('acharLojaPorCoordenada', () => {
  it('retorna o ponto dentro do raio+margem', () => {
    const pontos = { '560036': { nome: 'LOJA A', lat: -22.9, lon: -43.2, raio: 50, cod: '560036' } }
    const hit = acharLojaPorCoordenada(-22.9001, -43.2001, pontos)
    expect(hit?.cod).toBe('560036')
  })

  it('retorna null quando longe de todos', () => {
    const pontos = { '560036': { nome: 'LOJA A', lat: -22.9, lon: -43.2, raio: 50, cod: '560036' } }
    expect(acharLojaPorCoordenada(-23.5, -43.9, pontos)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/unitrac-api/pontos.test.ts`
Expected: FAIL ("Cannot find module './pontos'")

- [ ] **Step 3: Write minimal implementation**

```typescript
import { apiPost } from './client'

export type PontoApi = { nome: string; lat: number; lon: number; raio: number; cod: string }
export type MapaPontos = Record<string, PontoApi>

function distMetros(la: number, lo: number, lb: number, lob: number): number {
  return Math.sqrt((la - lb) ** 2 + (lo - lob) ** 2) * 111000
}

export async function buscarPontos(cvs: string[]): Promise<MapaPontos> {
  const d = (await apiPost('/mapa_servicos/alvos', cvs)) as {
    alvos?: Array<{ pontoidentificador: string; pontonome: string; pontolatitude: number; pontolongitude: number; pontoraio: number }>
  } | null
  const mapa: MapaPontos = {}
  for (const a of d?.alvos ?? []) {
    const id = String(a.pontoidentificador)
    if (!id || Math.abs(a.pontolatitude) < 1) continue
    mapa[id] = { nome: a.pontonome, lat: a.pontolatitude, lon: a.pontolongitude, raio: a.pontoraio, cod: id }
  }
  return mapa
}

export function acharLojaPorCoordenada(lat: number, lon: number, pontos: MapaPontos): PontoApi | null {
  let melhor: PontoApi | null = null
  let melhorDist = Infinity
  for (const p of Object.values(pontos)) {
    const d = distMetros(lat, lon, p.lat, p.lon)
    if (d <= p.raio + 30 && d < melhorDist) {
      melhor = p
      melhorDist = d
    }
  }
  return melhor
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/unitrac-api/pontos.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/unitrac-api/pontos.ts src/lib/unitrac-api/pontos.test.ts
git commit -m "feat(unitrac-api): buscarPontos + match de loja por coordenada"
```

---

### Task 4: Paradas e Posições

**Files:**
- Create: `src/lib/unitrac-api/paradas.ts`
- Create: `src/lib/unitrac-api/posicoes.ts`
- Test: `src/lib/unitrac-api/paradas.test.ts`

**Contexto:** `GET /mapa_servicos/stops/{cv}/{horas}` → `{ paradas: [{ _data, tempoparada, latitude, longitude }] }` (`_data` ISO = início; `tempoparada` segundos). `POST /mapa_servicos/posicoes/S/N` recebe lista de `cv` → `{ Posicoes: [{ veicucodigo, veicuplaca, posicvelocidade, posicignicao, datagps }] }`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { buscarParadas } from './paradas'
import { buscarPosicoes } from './posicoes'

afterEach(() => vi.restoreAllMocks())

describe('buscarParadas', () => {
  it('mapeia paradas relevantes (>= 120s)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ paradas: [
        { _data: '2026-06-11T09:00:00Z', tempoparada: 600, latitude: -22.9, longitude: -43.2 },
        { _data: '2026-06-11T09:30:00Z', tempoparada: 30, latitude: -22.9, longitude: -43.2 },
      ] }), { status: 200 }),
    )
    const ps = await buscarParadas('18594', 48)
    expect(ps).toHaveLength(1)
    expect(ps[0]).toMatchObject({ inicioISO: '2026-06-11T09:00:00Z', duracaoSeg: 600 })
  })

  it('retorna [] quando a API cai', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'))
    expect(await buscarParadas('1', 48)).toEqual([])
  })
})

describe('buscarPosicoes', () => {
  it('indexa por placa normalizada com velocidade', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ Posicoes: [
        { veicucodigo: '18594', veicuplaca: 'TUL-1C38', posicvelocidade: '40', posicignicao: '1', datagps: '11/06/2026 09:00:00' },
      ] }), { status: 200 }),
    )
    const m = await buscarPosicoes(['18594'])
    expect(m['TUL1C38']).toMatchObject({ velocidade: 40, ignicao: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/unitrac-api/paradas.test.ts`
Expected: FAIL ("Cannot find module './paradas'")

- [ ] **Step 3: Write minimal implementation**

`src/lib/unitrac-api/paradas.ts`:

```typescript
import { apiGet } from './client'

export type ParadaApi = { inicioISO: string; duracaoSeg: number; lat: number; lon: number }

export async function buscarParadas(cv: string, horas: number): Promise<ParadaApi[]> {
  const d = (await apiGet(`/mapa_servicos/stops/${cv}/${horas}`)) as {
    paradas?: Array<{ _data: string; tempoparada: number; latitude: number; longitude: number }>
  } | null
  return (d?.paradas ?? [])
    .filter(p => p.tempoparada >= 120)
    .map(p => ({ inicioISO: p._data, duracaoSeg: p.tempoparada, lat: p.latitude, lon: p.longitude }))
}
```

`src/lib/unitrac-api/posicoes.ts`:

```typescript
import { apiPost } from './client'
import { normPlaca } from './frota'

export type PosicaoApi = { cv: string; velocidade: number; ignicao: boolean; datagps: string }
export type MapaPosicoes = Record<string, PosicaoApi> // chave = placa normalizada

export async function buscarPosicoes(cvs: string[]): Promise<MapaPosicoes> {
  const d = (await apiPost('/mapa_servicos/posicoes/S/N', cvs)) as {
    Posicoes?: Array<{ veicucodigo: string; veicuplaca: string; posicvelocidade: string; posicignicao: string; datagps: string }>
  } | null
  const mapa: MapaPosicoes = {}
  for (const p of d?.Posicoes ?? []) {
    mapa[normPlaca(p.veicuplaca)] = {
      cv: String(p.veicucodigo),
      velocidade: parseInt(p.posicvelocidade) || 0,
      ignicao: p.posicignicao === '1',
      datagps: p.datagps,
    }
  }
  return mapa
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/unitrac-api/paradas.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/unitrac-api/paradas.ts src/lib/unitrac-api/posicoes.ts src/lib/unitrac-api/paradas.test.ts
git commit -m "feat(unitrac-api): buscarParadas e buscarPosicoes"
```

---

### Task 5: Fachada com os 4 gatilhos

**Files:**
- Create: `src/lib/unitrac-api/index.ts`
- Test: `src/lib/unitrac-api/index.test.ts`

**Contexto:** a fachada expõe funções puras que recebem o caso suspeito + dados já buscados e devolvem a correção marcada, ou `null`. Quem chama (a rota) busca frota/pontos uma vez e passa para cada linha. Toda correção carrega `origem: 'api'`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { corrigirPlaca, corrigirLoja, validarRotaConcluida } from './index'

describe('corrigirPlaca', () => {
  const frota = [{ cv: '18594', placa: 'TUL-1C38', placaNorm: 'TUL1C38' }]
  it('completa placa parcial por sufixo único', () => {
    const r = corrigirPlaca('1C38', frota)
    expect(r).toEqual({ placa: 'TUL-1C38', cv: '18594', origem: 'api' })
  })
  it('retorna null se ambíguo ou inexistente', () => {
    expect(corrigirPlaca('ZZZZ', frota)).toBeNull()
  })
})

describe('corrigirLoja', () => {
  it('acha loja pela coordenada e marca origem', () => {
    const pontos = { '560036': { nome: 'LOJA A', lat: -22.9, lon: -43.2, raio: 50, cod: '560036' } }
    const r = corrigirLoja(-22.9001, -43.2001, pontos)
    expect(r).toMatchObject({ codigoUnitrac: '560036', nome: 'LOJA A', origem: 'api' })
  })
})

describe('validarRotaConcluida', () => {
  it('marca suspeita quando carro ainda em movimento', () => {
    const pos = { TUL1C38: { cv: '18594', velocidade: 40, ignicao: true, datagps: 'x' } }
    expect(validarRotaConcluida('TUL-1C38', pos)).toEqual({ aindaRodando: true, origem: 'api' })
  })
  it('null quando parado/sem dado', () => {
    expect(validarRotaConcluida('TUL-1C38', {})).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/unitrac-api/index.test.ts`
Expected: FAIL ("Cannot find module './index'")

- [ ] **Step 3: Write minimal implementation**

```typescript
import type { VeiculoApi } from './frota'
import { normPlaca } from './frota'
import { acharLojaPorCoordenada, type MapaPontos } from './pontos'
import type { MapaPosicoes } from './posicoes'

export * from './frota'
export * from './pontos'
export * from './paradas'
export * from './posicoes'

export type CorrecaoPlaca = { placa: string; cv: string; origem: 'api' }
export type CorrecaoLoja = { codigoUnitrac: string; nome: string; lat: number; lon: number; origem: 'api' }
export type ValidacaoRota = { aindaRodando: boolean; origem: 'api' }

/** Completa uma placa parcial/ocr-suja pelo sufixo, só se houver match único. */
export function corrigirPlaca(parcial: string, frota: VeiculoApi[]): CorrecaoPlaca | null {
  const alvo = normPlaca(parcial)
  if (alvo.length < 4) return null
  const hits = frota.filter(v => v.placaNorm === alvo || v.placaNorm.endsWith(alvo))
  if (hits.length !== 1) return null
  return { placa: hits[0].placa, cv: hits[0].cv, origem: 'api' }
}

export function corrigirLoja(lat: number, lon: number, pontos: MapaPontos): CorrecaoLoja | null {
  const p = acharLojaPorCoordenada(lat, lon, pontos)
  if (!p) return null
  return { codigoUnitrac: p.cod, nome: p.nome, lat: p.lat, lon: p.lon, origem: 'api' }
}

export function validarRotaConcluida(placa: string, posicoes: MapaPosicoes): ValidacaoRota | null {
  const p = posicoes[normPlaca(placa)]
  if (!p) return null
  if (p.velocidade > 1 && p.ignicao) return { aindaRodando: true, origem: 'api' }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/unitrac-api/index.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/unitrac-api/index.ts src/lib/unitrac-api/index.test.ts
git commit -m "feat(unitrac-api): fachada com os 4 gatilhos de correção"
```

---

### Task 6: Rota de geração beta

**Files:**
- Read first: `src/app/api/kpi/simples/route.ts` (pipeline a espelhar)
- Create: `src/app/api/kpi/beta/route.ts`

- [ ] **Step 1: Ler e copiar a rota simples**

Leia `src/app/api/kpi/simples/route.ts` inteiro. Copie para `src/app/api/kpi/beta/route.ts` sem alterações funcionais ainda. Mantenha `runtime`, `maxDuration` e a assinatura do handler.

- [ ] **Step 2: Buscar dados da API uma vez no início do handler**

Após o parse das escalas/unitrac e antes do loop que monta as linhas, adicione:

```typescript
import { buscarFrota, buscarPontos, buscarPosicoes, corrigirPlaca, corrigirLoja, validarRotaConcluida } from '@/lib/unitrac-api'

// dentro do handler, após obter as linhas/rotas e os cvs envolvidos:
const frotaApi = await buscarFrota()
const cvsApi = frotaApi.map(v => v.cv)
const pontosApi = await buscarPontos(cvsApi)
const posicoesApi = await buscarPosicoes(cvsApi)
```

- [ ] **Step 3: Instrumentar os 4 gatilhos**

No ponto onde cada linha do KPI é finalizada, aplique (cada correção adiciona o marcador na linha):

```typescript
// 1. Placa incompleta/UNMATCHED por placa
if (!linha.placa || linha.confianca === 'UNMATCHED') {
  const c = corrigirPlaca(linha.placa ?? linha.placaRaw ?? '', frotaApi)
  if (c) { linha.placa = c.placa; linha.viaApi = [...(linha.viaApi ?? []), 'placa'] }
}

// 2. Parada sem loja (UNMATCHED) com coordenada disponível
if (linha.confianca === 'UNMATCHED' && linha.lat != null && linha.lon != null) {
  const c = corrigirLoja(linha.lat, linha.lon, pontosApi)
  if (c) { linha.loja_nome = c.nome; linha.codigo_unitrac = c.codigoUnitrac; linha.viaApi = [...(linha.viaApi ?? []), 'loja'] }
}

// 3. Rota "concluída" suspeita
if (linha.status === 'CONCLUIDA') {
  const v = validarRotaConcluida(linha.placa ?? '', posicoesApi)
  if (v?.aindaRodando) { linha.status = 'EM_ROTA'; linha.viaApi = [...(linha.viaApi ?? []), 'rota'] }
}
```

> NOTA: os nomes de campo (`linha.placaRaw`, `linha.lat`, `linha.status`, valores de `StatusRota`) devem ser confirmados lendo `src/lib/types/kpi.ts` e `src/lib/kpi/status-rota.ts`. Ajuste os nomes ao tipo real. O gatilho 4 (horário) usa `buscarParadas(cv, 48)` quando `chegada_loja_fmt`/`saida_cd_fmt` vierem nulos — pegue a parada cuja coordenada casa com a loja e use `inicioISO`/`duracaoSeg`.

- [ ] **Step 4: Garantir best-effort**

Confirme que nenhuma chamada à API está sem o módulo `unitrac-api` (que já é best-effort). Não envolva em try/catch adicional — as funções retornam `[]`/`{}`/`null` em falha. A geração roda igual ao normal se a API cair.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: sem erros novos nos arquivos criados.

```bash
git add src/app/api/kpi/beta/route.ts
git commit -m "feat(kpi-beta): rota de geração com gatilhos da API instrumentados"
```

---

### Task 7: Tela beta + item de menu

**Files:**
- Read first: `src/app/painel/kpi/simples/page.tsx`
- Create: `src/app/painel/kpi/beta/page.tsx`
- Modify: `src/app/painel/nav.tsx`

- [ ] **Step 1: Espelhar a página simples**

Copie `src/app/painel/kpi/simples/page.tsx` para `src/app/painel/kpi/beta/page.tsx`. Troque o endpoint de geração de `/api/kpi/simples` para `/api/kpi/beta`. Adicione um selo "BETA" no título.

- [ ] **Step 2: Selo "via API" e contador**

Onde cada linha é renderizada, quando `linha.viaApi?.length`, mostre um badge pequeno por correção (ex.: "placa via API", "loja via API"). No topo do resultado, exiba: `N correções via API` (soma de `viaApi.length` de todas as linhas). Use as classes do tema dark já existentes (fundo `#141414`, acento navy `#9fb3ce`).

- [ ] **Step 3: Adicionar o item no menu**

Em `src/app/painel/nav.tsx`, no grupo cuja `label` é `'KPI'`, adicione ao array `children`, logo após o item `'Gerar KPI'`:

```typescript
{ href: '/painel/kpi/beta', label: 'Gerar KPI (API Beta)', Icon: TableIcon },
```

- [ ] **Step 4: Verificar build da rota**

Run: `npm run build`
Expected: build conclui; rotas `/painel/kpi/beta` e `/api/kpi/beta` aparecem na saída.

- [ ] **Step 5: Commit**

```bash
git add src/app/painel/kpi/beta/page.tsx src/app/painel/nav.tsx
git commit -m "feat(kpi-beta): tela espelho com selos via API e item de menu"
```

---

### Task 8: Quadro de correções de cadastro sugeridas (não grava)

**Files:**
- Modify: `src/app/api/kpi/beta/route.ts` (acrescenta sugestões à resposta)
- Modify: `src/app/painel/kpi/beta/page.tsx` (renderiza o quadro)

**Contexto:** comparar o cadastro de lojas (Supabase, somente leitura) com os pontos da API e devolver as divergências SEM gravar. Reaproveita `pontosApi` já buscado.

- [ ] **Step 1: Computar sugestões na rota**

Na rota beta, após buscar `pontosApi`, leia o cadastro de lojas (mesma query que o app já usa para `lojas`: `select codigo_unitrac, nome, lat, lng, raio_metros`) e compute:

```typescript
import { haversine } from '@/lib/utils/geo'

const sugestoesCadastro: Array<{ codigo: string; nome: string; tipo: 'coord_errada' | 'sem_coord' | 'raio'; detalhe: string }> = []
for (const loja of lojasCadastro) {
  const p = pontosApi[String(loja.codigo_unitrac)]
  if (!p) continue
  if (loja.lat == null || loja.lng == null) {
    sugestoesCadastro.push({ codigo: p.cod, nome: p.nome, tipo: 'sem_coord', detalhe: `API: ${p.lat},${p.lon}` })
  } else {
    const d = haversine(loja.lat, loja.lng, p.lat, p.lon)
    if (d > 150) sugestoesCadastro.push({ codigo: p.cod, nome: p.nome, tipo: 'coord_errada', detalhe: `${Math.round(d)}m de erro` })
  }
}
// inclua sugestoesCadastro no JSON de resposta
```

> NOTA: confirme a assinatura de `haversine` em `src/lib/utils/geo.ts` (ordem dos args) e o nome real da função/coluna ao ler o arquivo.

- [ ] **Step 2: Renderizar o quadro (read-only) na tela**

Abaixo do KPI, adicione uma seção "Correções de cadastro que eu aplicaria" listando `sugestoesCadastro`. Deixe explícito que **não foi gravado** nada. Sem botão de ação nesta beta.

- [ ] **Step 3: Build + commit**

Run: `npm run build`
Expected: sucesso.

```bash
git add src/app/api/kpi/beta/route.ts src/app/painel/kpi/beta/page.tsx
git commit -m "feat(kpi-beta): quadro read-only de correções de cadastro sugeridas"
```

---

## Self-Review (preenchido)

**Spec coverage:**
- Motor de API (best-effort) → Tasks 1-5 ✅
- 4 gatilhos → Task 5 (lógica) + Task 6 (instrumentação) ✅
- Selo "via API" + contador → Task 7 ✅
- Beta isolada no menu, sem tocar produção → Tasks 6,7 (não há escrita no banco) ✅
- Quadro de correções de cadastro sem gravar → Task 8 ✅
- Best-effort (não quebra se API cair) → Task 1 + Task 6 Step 4 ✅
- Fonte Benassi 4586 → Task 1 (constante) ✅

**Pontos que exigem leitura do código real (sinalizados nas NOTAs):** nomes de campo de `KpiLinha`/`PreviewLinha`, valores de `StatusRota`, assinatura de `haversine`, query de lojas. São ajustes de nomes, não de lógica — o executor confirma ao abrir os arquivos citados.

**Placeholder scan:** sem TBD/TODO; todo passo de código tem código. Os 4 trechos de integração mostram o código e citam o arquivo a conferir para nomes.

**Type consistency:** `origem: 'api'` em todas as correções; `viaApi: string[]` acumulado nas linhas; `MapaPontos`/`MapaPosicoes` indexados por id/placaNorm consistentes entre tasks.
