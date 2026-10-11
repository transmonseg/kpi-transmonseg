# Fusion → KPI Rio Quality (Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Puxar o manifesto+gabarito de entregas da Rio Quality direto da API da Fusion DMS e alimentar o "ao vivo" do KPI, sem o upload manual do XLSX — mantendo o upload como fallback.

**Architecture:** Novo cliente HTTP da Fusion (`src/lib/fusion/`, molde = `src/lib/kpi-portefrio/ravex-auth.ts` + `src/lib/unitrac-api/client.ts`), autenticado por cookie `PHPSESSID`. Um adaptador (`src/lib/kpi-rioquality/fonte-fusion.ts`) transforma as linhas da Fusion em `EntregaRioQualityCompleta[]` — exatamente o tipo que o `parseEntregasCompletas` do XLSX já produz — então reusa o caminho existente `guardarDiaAoVivo → kpi_ao_vivo_dia → calcularAoVivo`. GPS continua vindo da Unitrac. Nada do pipeline de cálculo muda.

**Tech Stack:** Next.js 16 (App Router, route handlers), TypeScript strict, Vitest, Postgres self-hosted (`kpi_transmonseg`), cron por OS crontab (`scripts/kpi-ao-vivo-tick.ts`).

**Spec:** `/Users/joaquimsalles/Projects/Transmonseg/fusion-integracao-plano.md` (+ API em `fusion-dms-api.md`, amostra em `scratch/fusion-entregas-amostra.json`).

## Global Constraints

- **Segredos fora do git:** `FUSION_USER`, `FUSION_PASS`, `FUSION_BASE=https://fusiondms.com.br` em `.env`/`.env.example` (só placeholders no example). PHPSESSID nunca hardcoded; capturado em runtime.
- **Só Rio Quality (`cliente='rioquality'`, empresa Fusion 271).** Nenhum outro cliente muda de fonte.
- **Fallback obrigatório:** o upload manual (`POST /api/kpi/ao-vivo/romaneio`, campo `completo`) continua funcionando. Se a Fusion falhar, cair pro fluxo atual — nunca fabricar entrega.
- **Não inventar dado:** erro de auth/HTTP lança (não vira "sem entregas" silencioso); dia sem resposta da Fusion = não sobrescreve o que já existe.
- **Duas cópias do repo** (`KPI transmonseg` + `KPI TEMP`): aplicar e empurrar nas duas (regra do usuário).
- **Deploy manual:** `deploy.sh` (git pull + gate Python + build + `pm2 restart`). `git push` não atualiza produção.
- **Formato Fusion:** respostas vêm como `text/html` com corpo JSON → parsear como JSON. Datagrid `{total, rows:[...]}`. POST `application/x-www-form-urlencoded`, header `X-Requested-With: XMLHttpRequest`.

## Review Focus

- **Sessão expirada no meio do dia:** a Fusion devolve HTML de login (302/200) em vez de `{rows}` → o cliente deve detectar "não é JSON de dado" e re-logar uma vez; se persistir, lançar (não gravar dia vazio). Coberto na Task 2.
- **Dia sem romaneios / resposta vazia:** `get_grid_romaneios` com `total:0` não pode zerar um `kpi_ao_vivo_dia` já preenchido por upload → o orquestrador retorna `[]` e o chamador trata como "sem dados da Fusion", não como "dia vazio". Coberto na Task 5 e Task 6.
- **Devolução/adiamento:** linha com `data_devolucao`/`data_adiado` preenchido e `t32_status`≠7 deve virar gabarito de não-entrega (não "entregue"). Coberto na Task 4.
- **NF ausente:** o grid traz `t32_seq_pedido_erp`, não a NF; o mapeamento usa pedido ERP como id e NF sintética `<placa>-<seq>` quando não houver NF real (mesmo comportamento do parser XLSX). Coberto na Task 4.
- **Caractere/acentos e números com vírgula:** `t32_valor` vem como string `"1521.3"`; placas e nomes com acento/espaço extra → normalizar placa e número no mapeamento. Coberto na Task 4.

---

## File Structure

- `src/lib/fusion/auth.ts` — login + cache de `PHPSESSID`, re-login.
- `src/lib/fusion/client.ts` — `fusionGet`/`fusionPost`, injeta cookie+headers, detecta sessão morta, parseia `{total,rows}`.
- `src/lib/fusion/tipos.ts` — tipos crus (`RomaneioFusion`, `EntregaFusionRaw`).
- `src/lib/fusion/entregas.ts` — `buscarRomaneiosDoDia`, `buscarEntregasDoRomaneio`, `buscarEntregasDoDia`.
- `src/lib/kpi-rioquality/fonte-fusion.ts` — `mapearEntregasFusion` + `buscarDiaRioQualityFusion` → `EntregaRioQualityCompleta[]`.
- `src/app/api/kpi/ao-vivo/fusion/route.ts` — endpoint POST que puxa da Fusion e grava o dia (reusa `guardarDiaAoVivo`).
- `src/app/painel/ao-vivo/subir-romaneio.tsx` — botão "Puxar da Fusion" (Rio Quality), fallback mantido.
- `scripts/kpi-ao-vivo-tick.ts` — antes de `calcularAoVivo` para `rioquality`, tentar puxar da Fusion.
- `supabase/migrations/20261011000000_kpi_ao_vivo_fonte.sql` — coluna `fonte` em `kpi_ao_vivo_dia`.
- Fixtures: `src/lib/fusion/__fixtures__/entregas.json`, `romaneios.json` (da amostra capturada).

---

### Task 1: Fixtures a partir da captura real

**Files:**
- Create: `src/lib/fusion/__fixtures__/romaneios.json`
- Create: `src/lib/fusion/__fixtures__/entregas.json`

**Interfaces:**
- Produces: dois JSON com o shape exato de `get_grid_romaneios.php` e `get_grid_entregas_realizadas.php` (ver `scratch/fusion-entregas-amostra.json`), usados pelos testes das Tasks 3–5.

- [ ] **Step 1: Copiar a amostra real pra fixture de entregas**

`entregas.json` = o objeto `{total, rows}` de `get_grid_entregas_realizadas.php` (romaneio 1163924). Usar as 3 linhas salvas em `scratch/fusion-entregas-amostra.json` + adicionar 1 linha sintética de devolução para cobrir o caminho não-entregue:

```json
{"total": 4, "rows": [
  {"t10_id":"1163924","t32_id":"29902909","t16_fantasia":"RQ MAIS","t16_razSocial":"BANG 2024 REST E LANC LTDA","t32_seq_pedido_erp":"6052562","t32_status":"7","t32_data_pedido":"2026-10-09 09:20:01","t12_data_real_entrega":"2026-10-10 10:15:03","t32_cidade":"RIO DE JANEIRO","t32_endereco":"RUA GUSTAVO SAMPAIO","t32_valor":"1521.3","t22_nome":"CARLA EDUARDO","data_entrega":"2026-10-10 10:15:03","data_adiado":null,"data_devolucao":null,"data_chegada":"2026-10-10 10:14:44"},
  {"t10_id":"1163924","t32_id":"29903597","t16_fantasia":"RQ B","t16_razSocial":"PIZZARIA VENEZIANA LIMITADA","t32_seq_pedido_erp":"6052697","t32_status":"7","t32_cidade":"RIO DE JANEIRO","t32_endereco":"RUA GUSTAVO SAMPAIO","t32_valor":"497.1","t22_nome":"ELIZABETE BORGE","data_entrega":"2026-10-10 10:13:41","data_adiado":null,"data_devolucao":null,"data_chegada":"2026-10-10 10:13:07"},
  {"t10_id":"1163924","t32_id":"29904395","t16_fantasia":"RQ MAIS","t16_razSocial":"RIO ATLANTICA HOTEL S A","t32_seq_pedido_erp":"6052863","t32_status":"7","t32_cidade":"RIO DE JANEIRO","t32_endereco":"AVENIDA PRINCESA ISABEL","t32_valor":"1559.85","t22_nome":"JOELMA","data_entrega":"2026-10-10 10:18:05","data_adiado":null,"data_devolucao":null,"data_chegada":"2026-10-10 10:17:38"},
  {"t10_id":"1163924","t32_id":"29999999","t16_fantasia":"RQ C","t16_razSocial":"CLIENTE DEVOLVIDO LTDA","t32_seq_pedido_erp":"6059999","t32_status":"9","t32_cidade":"RIO DE JANEIRO","t32_endereco":"RUA TESTE","t32_valor":"100.0","t22_nome":"FULANO","data_entrega":null,"data_adiado":null,"data_devolucao":"2026-10-10 11:00:00","data_chegada":"2026-10-10 10:55:00"}
]}
```

- [ ] **Step 2: Criar a fixture de romaneios**

`romaneios.json` = 1 linha do `get_grid_romaneios.php` casando o `t10_id` 1163924:

```json
{"total": 1, "rows": [
  {"t10_id":"1163924","t05_nome":"DAVIDSON MESQUITA SILVA","t06_placa":"KOB3H38","t06_descricao":"CEREBRO - KOB3H38","t10_carga_formada_erp":"1467825","t10_destino":"CEREBRO - ZONA SUL/CARRO PQ 10/10","peso_entregas":"507.49","valor_entregas":"9673.90","qtd_entregas":"12","qtd_clientes":"12"}
]}
```

- [ ] **Step 3: Commit**

```bash
git add "src/lib/fusion/__fixtures__/romaneios.json" "src/lib/fusion/__fixtures__/entregas.json"
git commit -m "test(fusion): fixtures reais de romaneios e entregas da Rio Quality"
```

---

### Task 2: Cliente Fusion — auth + fetch com re-login

**Files:**
- Create: `src/lib/fusion/auth.ts`
- Create: `src/lib/fusion/client.ts`
- Test: `src/lib/fusion/client.test.ts`
- Modify: `.env.example` (add `FUSION_USER=`, `FUSION_PASS=`, `FUSION_BASE=https://fusiondms.com.br`)

**Interfaces:**
- Produces:
  - `loginFusion(): Promise<string>` — faz login, devolve `PHPSESSID`, cacheia em memória.
  - `invalidarSessaoFusion(): void` — limpa o cache (força re-login).
  - `fusionPost<T>(path: string, body?: Record<string,string>): Promise<T>` — POST url-encoded, cookie+`X-Requested-With`, parseia JSON; em "sessão morta" re-loga uma vez e repete; se ainda falhar, lança.
  - `fusionGet<T>(path: string, query?: Record<string,string>): Promise<T>` — idem GET.

- [ ] **Step 1: Escrever o teste de sessão-morta → re-login**

```ts
// src/lib/fusion/client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('fusionPost', () => {
  beforeEach(() => { vi.resetModules(); process.env.FUSION_USER='u'; process.env.FUSION_PASS='p'; process.env.FUSION_BASE='https://fusiondms.com.br' })

  it('re-loga uma vez quando a resposta é a tela de login e depois devolve o JSON', async () => {
    const fetchMock = vi.fn()
      // 1) login inicial
      .mockResolvedValueOnce(new Response('ok', { headers: { 'set-cookie': 'PHPSESSID=sess1; path=/' } }))
      // 2) chamada de dado: sessão morta (HTML de login)
      .mockResolvedValueOnce(new Response('<html><form id="login">', { status: 200, headers: { 'content-type': 'text/html' } }))
      // 3) re-login
      .mockResolvedValueOnce(new Response('ok', { headers: { 'set-cookie': 'PHPSESSID=sess2; path=/' } }))
      // 4) retry com dado real
      .mockResolvedValueOnce(new Response(JSON.stringify({ total: 1, rows: [{ a: 1 }] }), { status: 200, headers: { 'content-type': 'text/html' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { fusionPost } = await import('./client')
    const r = await fusionPost<{ total: number }>('/php/x.php', { k: 'v' })
    expect(r.total).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('lança se a sessão continua morta após re-login', async () => {
    const html = new Response('<html><form id="login">', { status: 200, headers: { 'content-type': 'text/html' } })
    const login = new Response('ok', { headers: { 'set-cookie': 'PHPSESSID=s; path=/' } })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(login).mockResolvedValueOnce(html.clone())
      .mockResolvedValueOnce(login).mockResolvedValueOnce(html.clone())
    vi.stubGlobal('fetch', fetchMock)
    const { fusionPost } = await import('./client')
    await expect(fusionPost('/php/x.php')).rejects.toThrow(/sess/i)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/fusion/client.test.ts`
Expected: FAIL ("Cannot find module './client'").

- [ ] **Step 3: Implementar `auth.ts`**

```ts
// src/lib/fusion/auth.ts
const BASE = () => process.env.FUSION_BASE ?? 'https://fusiondms.com.br'
let sessao: string | null = null

export function invalidarSessaoFusion() { sessao = null }

export async function loginFusion(): Promise<string> {
  if (sessao) return sessao
  const user = process.env.FUSION_USER, pass = process.env.FUSION_PASS
  if (!user || !pass) throw new Error('FUSION_USER/FUSION_PASS ausentes')
  const body = new URLSearchParams({ login: user, senha: pass, usuario: user, password: pass })
  const res = await fetch(`${BASE()}/login.html`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest' },
    body: body.toString(),
  })
  const cookie = res.headers.get('set-cookie') ?? ''
  const m = cookie.match(/PHPSESSID=([^;]+)/)
  if (!m) throw new Error('Login Fusion: PHPSESSID não retornado (sessão)')
  sessao = m[1]
  return sessao
}
```

> Nota de implementação: confirmar os nomes exatos dos campos do form de login (`login`/`senha`) na captura; o `URLSearchParams` acima manda as variações comuns e o servidor ignora as extras.

- [ ] **Step 4: Implementar `client.ts`**

```ts
// src/lib/fusion/client.ts
import { loginFusion, invalidarSessaoFusion } from './auth'
const BASE = () => process.env.FUSION_BASE ?? 'https://fusiondms.com.br'

function pareceLogin(texto: string): boolean {
  return /id="login"|name="senha"|login\.html/i.test(texto) && !texto.trimStart().startsWith('{') && !texto.trimStart().startsWith('[')
}

async function chamar(path: string, init: RequestInit): Promise<string> {
  const sess = await loginFusion()
  const res = await fetch(`${BASE()}${path}`, {
    ...init,
    redirect: 'manual',
    headers: {
      ...(init.headers ?? {}),
      'x-requested-with': 'XMLHttpRequest',
      cookie: `PHPSESSID=${sess}`,
    },
  })
  return await res.text()
}

async function comRetry<T>(path: string, init: RequestInit): Promise<T> {
  let texto = await chamar(path, init)
  if (pareceLogin(texto)) {
    invalidarSessaoFusion()
    texto = await chamar(path, init)
    if (pareceLogin(texto)) throw new Error(`Fusion: sessão inválida após re-login em ${path}`)
  }
  try { return JSON.parse(texto) as T } catch { throw new Error(`Fusion: resposta não-JSON em ${path}`) }
}

export function fusionPost<T>(path: string, body: Record<string, string> = {}): Promise<T> {
  return comRetry<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams(body).toString(),
  })
}

export function fusionGet<T>(path: string, query: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(query).toString()
  return comRetry<T>(qs ? `${path}?${qs}` : path, { method: 'GET' })
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/lib/fusion/client.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 6: Commit**

```bash
git add src/lib/fusion/auth.ts src/lib/fusion/client.ts src/lib/fusion/client.test.ts .env.example
git commit -m "feat(fusion): cliente HTTP com auth PHPSESSID e re-login"
```

---

### Task 3: Buscar romaneios e entregas do dia

**Files:**
- Create: `src/lib/fusion/tipos.ts`
- Create: `src/lib/fusion/entregas.ts`
- Test: `src/lib/fusion/entregas.test.ts`

**Interfaces:**
- Consumes: `fusionPost` (Task 2), fixtures (Task 1).
- Produces:
  - `type RomaneioFusion` e `type EntregaFusionRaw` (campos crus confirmados na captura).
  - `buscarRomaneiosDoDia(data: string): Promise<RomaneioFusion[]>` — POST `get_grid_romaneios.php` com `data_inicial=data`, `data_final=data`.
  - `buscarEntregasDoRomaneio(romaneioId: string): Promise<EntregaFusionRaw[]>` — POST `get_grid_entregas_realizadas.php` com `romaneio_id`.
  - `buscarEntregasDoDia(data: string): Promise<{ romaneios: RomaneioFusion[]; entregas: EntregaFusionRaw[] }>` — busca romaneios, depois entregas de cada um (sequencial, sem martelar).

- [ ] **Step 1: Escrever o teste (mockando `fusionPost` com as fixtures)**

```ts
// src/lib/fusion/entregas.test.ts
import { describe, it, expect, vi } from 'vitest'
import romaneios from './__fixtures__/romaneios.json'
import entregas from './__fixtures__/entregas.json'

vi.mock('./client', () => ({
  fusionPost: vi.fn(async (path: string) =>
    path.includes('get_grid_romaneios') ? romaneios : entregas),
  fusionGet: vi.fn(),
}))

describe('buscarEntregasDoDia', () => {
  it('casa romaneios com suas entregas', async () => {
    const { buscarEntregasDoDia } = await import('./entregas')
    const r = await buscarEntregasDoDia('2026-10-10')
    expect(r.romaneios).toHaveLength(1)
    expect(r.entregas).toHaveLength(4)
    expect(r.entregas[0].t10_id).toBe('1163924')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/fusion/entregas.test.ts`
Expected: FAIL ("Cannot find module './entregas'").

- [ ] **Step 3: Implementar `tipos.ts` e `entregas.ts`**

```ts
// src/lib/fusion/tipos.ts
export type RomaneioFusion = {
  t10_id: string; t05_nome: string; t06_placa: string; t06_descricao: string
  t10_carga_formada_erp: string; t10_destino: string
  peso_entregas: string; valor_entregas: string; qtd_entregas: string; qtd_clientes: string
}
export type EntregaFusionRaw = {
  t10_id: string; t32_id: string; t16_fantasia: string; t16_razSocial: string
  t32_seq_pedido_erp: string; t32_status: string
  t32_data_pedido?: string; t12_data_real_entrega?: string | null
  t32_cidade: string; t32_endereco: string; t32_valor: string; t22_nome?: string
  data_entrega: string | null; data_adiado: string | null; data_devolucao: string | null; data_chegada: string | null
}
```

```ts
// src/lib/fusion/entregas.ts
import { fusionPost } from './client'
import type { RomaneioFusion, EntregaFusionRaw } from './tipos'

type Grid<T> = { total: number | string; rows: T[] }
const PARAMS = (data: string) => ({ data_inicial: data, data_final: data, romaneio_id: '', carga_erp_id: '', pedidos_faturados: '0' })

export async function buscarRomaneiosDoDia(data: string): Promise<RomaneioFusion[]> {
  const g = await fusionPost<Grid<RomaneioFusion>>('/php/dashboard/dashreentregas/get_grid_romaneios.php', PARAMS(data))
  return g.rows ?? []
}

export async function buscarEntregasDoRomaneio(romaneioId: string): Promise<EntregaFusionRaw[]> {
  const g = await fusionPost<Grid<EntregaFusionRaw>>('/php/dashboard/dashreentregas/get_grid_entregas_realizadas.php', { romaneio_id: romaneioId })
  return g.rows ?? []
}

export async function buscarEntregasDoDia(data: string) {
  const romaneios = await buscarRomaneiosDoDia(data)
  const entregas: EntregaFusionRaw[] = []
  for (const r of romaneios) entregas.push(...await buscarEntregasDoRomaneio(r.t10_id))
  return { romaneios, entregas }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/fusion/entregas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fusion/tipos.ts src/lib/fusion/entregas.ts src/lib/fusion/entregas.test.ts
git commit -m "feat(fusion): buscar romaneios e entregas do dia"
```

---

### Task 4: Mapear Fusion → `EntregaRioQualityCompleta`

**Files:**
- Create: `src/lib/kpi-rioquality/fonte-fusion.ts`
- Test: `src/lib/kpi-rioquality/fonte-fusion.test.ts`
- Read (não modificar): `src/lib/kpi-rioquality/parse-planilhas.ts` (para casar os nomes dos campos de `EntregaRioQualityCompleta` e `GabaritoEntregaRioQuality`).

**Interfaces:**
- Consumes: `RomaneioFusion`, `EntregaFusionRaw` (Task 3); tipos `EntregaRioQualityCompleta`/`GabaritoEntregaRioQuality` de `parse-planilhas.ts`.
- Produces: `mapearEntregasFusion(romaneios: RomaneioFusion[], entregas: EntregaFusionRaw[]): EntregaRioQualityCompleta[]`.

- [ ] **Step 1: Confirmar os nomes dos campos do tipo alvo**

Run: `grep -n "EntregaRioQualityCompleta\|GabaritoEntregaRioQuality\|placaNorm\|motivoDevolucao" "src/lib/kpi-rioquality/parse-planilhas.ts"`
Expected: imprime a definição dos dois tipos. Usar EXATAMENTE esses nomes de campo no mapeamento (o plano assume `placaNorm, clienteNome, cidade, uf, destino, motorista, rua, bairro, nf?, clienteCodigo?, romaneio?, rota?, gabarito{status,checkIn,checkOut,dataCheckIn,dataCheckOut,motivoDevolucao}` — ajustar se o grep divergir).

- [ ] **Step 2: Escrever o teste de mapeamento**

```ts
// src/lib/kpi-rioquality/fonte-fusion.test.ts
import { describe, it, expect } from 'vitest'
import romaneios from '../fusion/__fixtures__/romaneios.json'
import entregas from '../fusion/__fixtures__/entregas.json'
import { mapearEntregasFusion } from './fonte-fusion'
import type { RomaneioFusion } from '../fusion/tipos'
import type { EntregaFusionRaw } from '../fusion/tipos'

describe('mapearEntregasFusion', () => {
  const linhas = mapearEntregasFusion(romaneios.rows as RomaneioFusion[], entregas.rows as EntregaFusionRaw[])

  it('produz uma linha por entrega', () => expect(linhas).toHaveLength(4))

  it('casa romaneio → placa/motorista/rota', () => {
    const l = linhas[0]
    expect(l.placaNorm).toBe('KOB3H38')
    expect(l.motorista).toBe('DAVIDSON MESQUITA SILVA')
    expect(l.clienteNome).toBe('BANG 2024 REST E LANC LTDA')
    expect(l.cidade).toBe('RIO DE JANEIRO')
  })

  it('entregue → gabarito status entregue com check-in/out', () => {
    expect(linhas[0].gabarito?.status).toMatch(/entreg/i)
    expect(linhas[0].gabarito?.checkIn).toBe('2026-10-10 10:14:44')
    expect(linhas[0].gabarito?.checkOut).toBe('2026-10-10 10:15:03')
  })

  it('devolução → gabarito não-entregue', () => {
    const dev = linhas.find(l => l.clienteNome.includes('DEVOLVIDO'))!
    expect(dev.gabarito?.status).toMatch(/devolu/i)
    expect(dev.gabarito?.checkOut).toBeNull()
  })
})
```

- [ ] **Step 3: Implementar `fonte-fusion.ts` (mapeamento)**

```ts
// src/lib/kpi-rioquality/fonte-fusion.ts
import type { RomaneioFusion, EntregaFusionRaw } from '../fusion/tipos'
import type { EntregaRioQualityCompleta } from './parse-planilhas'

const normPlaca = (p: string) => (p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

function statusFusion(e: EntregaFusionRaw): { status: string; checkOut: string | null } {
  if (e.data_devolucao) return { status: 'DEVOLVIDO', checkOut: null }
  if (e.data_adiado) return { status: 'ADIADO', checkOut: null }
  if (e.data_entrega || e.t32_status === '7') return { status: 'ENTREGUE', checkOut: e.data_entrega ?? e.t12_data_real_entrega ?? null }
  return { status: 'PENDENTE', checkOut: null }
}

export function mapearEntregasFusion(romaneios: RomaneioFusion[], entregas: EntregaFusionRaw[]): EntregaRioQualityCompleta[] {
  const porId = new Map(romaneios.map(r => [r.t10_id, r]))
  return entregas.map((e, i) => {
    const rom = porId.get(e.t10_id)
    const { status, checkOut } = statusFusion(e)
    const placaNorm = normPlaca(rom?.t06_placa ?? '')
    return {
      placaNorm,
      clienteNome: e.t16_razSocial,
      cidade: e.t32_cidade,
      uf: 'RJ',
      destino: rom?.t10_destino ?? '',
      motorista: rom?.t05_nome ?? '',
      rua: e.t32_endereco,
      bairro: '',
      nf: `${placaNorm}-${e.t32_seq_pedido_erp || i + 1}`, // NF sintética (grid não traz NF; ver follow-up)
      clienteCodigo: e.t32_seq_pedido_erp,
      romaneio: e.t10_id,
      rota: rom?.t10_destino ?? '',
      gabarito: {
        status,
        checkIn: e.data_chegada,
        checkOut,
        dataCheckIn: e.data_chegada,
        dataCheckOut: checkOut,
        motivoDevolucao: e.data_devolucao ? 'DEVOLUCAO' : null,
      },
    } as EntregaRioQualityCompleta
  })
}
```

> Follow-up registrado (não bloqueia): achar o endpoint/campo da NF real na Fusion e trocar a NF sintética. Enquanto isso, o KPI já funciona com NF sintética (mesmo comportamento do parser XLSX quando a planilha não traz NF).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/kpi-rioquality/fonte-fusion.test.ts`
Expected: PASS (4 testes). Se algum campo divergir do grep do Step 1, ajustar nomes e repetir.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-rioquality/fonte-fusion.ts src/lib/kpi-rioquality/fonte-fusion.test.ts
git commit -m "feat(fusion): mapear entregas Fusion para EntregaRioQualityCompleta"
```

---

### Task 5: Orquestrador do dia

**Files:**
- Modify: `src/lib/kpi-rioquality/fonte-fusion.ts` (adicionar `buscarDiaRioQualityFusion`)
- Test: `src/lib/kpi-rioquality/fonte-fusion.test.ts` (adicionar caso)

**Interfaces:**
- Consumes: `buscarEntregasDoDia` (Task 3), `mapearEntregasFusion` (Task 4).
- Produces: `buscarDiaRioQualityFusion(data: string): Promise<EntregaRioQualityCompleta[]>` — `[]` quando a Fusion não tem romaneios (sinal de "sem dados", não "dia vazio").

- [ ] **Step 1: Escrever o teste (mockando `./fusion/entregas`)**

```ts
// adicionar em fonte-fusion.test.ts
import { vi } from 'vitest'
it('dia sem romaneios devolve lista vazia', async () => {
  vi.doMock('../fusion/entregas', () => ({ buscarEntregasDoDia: vi.fn(async () => ({ romaneios: [], entregas: [] })) }))
  const { buscarDiaRioQualityFusion } = await import('./fonte-fusion')
  expect(await buscarDiaRioQualityFusion('2026-10-10')).toEqual([])
  vi.doUnmock('../fusion/entregas')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/kpi-rioquality/fonte-fusion.test.ts -t "dia sem romaneios"`
Expected: FAIL (`buscarDiaRioQualityFusion` não existe).

- [ ] **Step 3: Implementar**

```ts
// adicionar em fonte-fusion.ts
import { buscarEntregasDoDia } from '../fusion/entregas'

export async function buscarDiaRioQualityFusion(data: string): Promise<EntregaRioQualityCompleta[]> {
  const { romaneios, entregas } = await buscarEntregasDoDia(data)
  if (romaneios.length === 0) return []
  return mapearEntregasFusion(romaneios, entregas)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/kpi-rioquality/fonte-fusion.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-rioquality/fonte-fusion.ts src/lib/kpi-rioquality/fonte-fusion.test.ts
git commit -m "feat(fusion): orquestrador buscarDiaRioQualityFusion"
```

---

### Task 6: Migration `fonte` + rota `/api/kpi/ao-vivo/fusion`

**Files:**
- Create: `supabase/migrations/20261011000000_kpi_ao_vivo_fonte.sql`
- Create: `src/app/api/kpi/ao-vivo/fusion/route.ts`
- Test: `src/app/api/kpi/ao-vivo/fusion/route.test.ts`
- Read: `src/app/api/kpi/ao-vivo/romaneio/route.ts` (para reusar `acessoAoVivo`, `guardarDiaAoVivo`, `calcularAoVivo` e o disparo em background).

**Interfaces:**
- Consumes: `buscarDiaRioQualityFusion` (Task 5), `acessoAoVivo` (`../acesso`), `guardarDiaAoVivo`/`calcularAoVivo` (`src/lib/kpi-romaneio/ao-vivo-servico.ts`).
- Produces: `POST /api/kpi/ao-vivo/fusion?cliente=rioquality&data=YYYY-MM-DD` → `{ ok, nfs, placas, fonte:'fusion' }` ou 409 `{ ok:false, motivo:'sem_dados_fusion' }` sem sobrescrever o dia.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/20261011000000_kpi_ao_vivo_fonte.sql
alter table kpi_ao_vivo_dia add column if not exists fonte text not null default 'manual';
comment on column kpi_ao_vivo_dia.fonte is 'manual | fusion — origem do manifesto do dia';
```

- [ ] **Step 2: Escrever o teste da rota (feliz + sem dados)**

```ts
// src/app/api/kpi/ao-vivo/fusion/route.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../acesso', () => ({ acessoAoVivo: vi.fn(async () => ({ ok: true, cliente: 'rioquality', email: 't@t', clientes: ['rioquality'] })) }))
vi.mock('@/lib/kpi-rioquality/fonte-fusion', () => ({ buscarDiaRioQualityFusion: vi.fn() }))
const guardar = vi.fn(async () => {})
const calcular = vi.fn(async () => {})
vi.mock('@/lib/kpi-romaneio/ao-vivo-servico', () => ({ guardarDiaAoVivo: (...a:unknown[]) => guardar(...a), calcularAoVivo: (...a:unknown[]) => calcular(...a) }))

describe('POST /api/kpi/ao-vivo/fusion', () => {
  it('grava o dia quando a Fusion retorna entregas', async () => {
    const { buscarDiaRioQualityFusion } = await import('@/lib/kpi-rioquality/fonte-fusion')
    ;(buscarDiaRioQualityFusion as any).mockResolvedValue([{ placaNorm: 'ABC1D23', nf: 'ABC1D23-1', clienteNome: 'X' }])
    const { POST } = await import('./route')
    const res = await POST(new Request('http://x/api/kpi/ao-vivo/fusion?cliente=rioquality&data=2026-10-10', { method: 'POST' }))
    expect(res.status).toBe(200)
    expect(guardar).toHaveBeenCalled()
  })

  it('não grava e devolve 409 quando a Fusion não tem dados', async () => {
    const { buscarDiaRioQualityFusion } = await import('@/lib/kpi-rioquality/fonte-fusion')
    ;(buscarDiaRioQualityFusion as any).mockResolvedValue([])
    guardar.mockClear()
    const { POST } = await import('./route')
    const res = await POST(new Request('http://x/api/kpi/ao-vivo/fusion?cliente=rioquality&data=2026-10-10', { method: 'POST' }))
    expect(res.status).toBe(409)
    expect(guardar).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/app/api/kpi/ao-vivo/fusion/route.test.ts`
Expected: FAIL ("Cannot find module './route'").

- [ ] **Step 4: Implementar a rota**

```ts
// src/app/api/kpi/ao-vivo/fusion/route.ts
import { NextResponse } from 'next/server'
import { acessoAoVivo } from '../acesso'
import { buscarDiaRioQualityFusion } from '@/lib/kpi-rioquality/fonte-fusion'
import { guardarDiaAoVivo, calcularAoVivo } from '@/lib/kpi-romaneio/ao-vivo-servico'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const url = new URL(req.url)
  const cliente = url.searchParams.get('cliente')
  const data = url.searchParams.get('data') ?? new Date().toISOString().slice(0, 10)
  const acc = await acessoAoVivo(cliente)
  if (!acc.ok) return acc.resp
  if (acc.cliente !== 'rioquality') return NextResponse.json({ ok: false, motivo: 'fonte_fusion_so_rioquality' }, { status: 400 })

  let linhas
  try { linhas = await buscarDiaRioQualityFusion(data) }
  catch (e) { return NextResponse.json({ ok: false, motivo: 'erro_fusion', detalhe: String(e) }, { status: 502 }) }

  if (linhas.length === 0) return NextResponse.json({ ok: false, motivo: 'sem_dados_fusion' }, { status: 409 })

  await guardarDiaAoVivo({ cliente: acc.cliente, data, romaneio: linhas, escala: [], escalaEnviada: false, paoEnviado: false, enviadoPor: acc.email, fonte: 'fusion' } as never)
  void calcularAoVivo(acc.cliente, data)
  const placas = new Set(linhas.map(l => l.placaNorm)).size
  return NextResponse.json({ ok: true, nfs: linhas.length, placas, fonte: 'fusion' })
}
```

> Nota: `guardarDiaAoVivo` ganha o parâmetro opcional `fonte` — adicionar o campo na assinatura em `ao-vivo-servico.ts` e no upsert (`fonte: fonte ?? 'manual'`). Se o tipo reclamar, estender o objeto de args lá. Verificar a assinatura real antes (o cast `as never` é só pro teste; no código use o tipo certo).

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/app/api/kpi/ao-vivo/fusion/route.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 6: Aplicar a migration no banco de dev e commit**

```bash
sudo -u postgres psql -d kpi_transmonseg -f supabase/migrations/20261011000000_kpi_ao_vivo_fonte.sql
git add supabase/migrations/20261011000000_kpi_ao_vivo_fonte.sql src/app/api/kpi/ao-vivo/fusion/route.ts src/app/api/kpi/ao-vivo/fusion/route.test.ts src/lib/kpi-romaneio/ao-vivo-servico.ts
git commit -m "feat(fusion): rota /api/kpi/ao-vivo/fusion + coluna fonte"
```

---

### Task 7: Botão "Puxar da Fusion" na tela (fallback mantido)

**Files:**
- Modify: `src/app/painel/ao-vivo/subir-romaneio.tsx`
- Test: `src/app/painel/ao-vivo/subir-romaneio.test.tsx` (se não existir, criar com React Testing Library já usado no projeto; se o projeto não testa componentes, pular o teste e validar manualmente no Step 3).

**Interfaces:**
- Consumes: `POST /api/kpi/ao-vivo/fusion` (Task 6).
- Produces: para `cliente==='rioquality'`, um botão que faz o POST e mostra resultado; o upload manual continua visível.

- [ ] **Step 1: Escrever o teste (só Rio Quality mostra o botão)**

```tsx
// subir-romaneio.test.tsx
import { render, screen } from '@testing-library/react'
import SubirRomaneio from './subir-romaneio'
it('mostra "Puxar da Fusion" só para rioquality', () => {
  const { rerender } = render(<SubirRomaneio cliente="nutrimax" data="2026-10-10" onPronto={() => {}} />)
  expect(screen.queryByText(/Puxar da Fusion/i)).toBeNull()
  rerender(<SubirRomaneio cliente="rioquality" data="2026-10-10" onPronto={() => {}} />)
  expect(screen.getByText(/Puxar da Fusion/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/painel/ao-vivo/subir-romaneio.test.tsx`
Expected: FAIL (texto não encontrado).

- [ ] **Step 3: Implementar o botão (adicionar, não remover o upload)**

```tsx
// dentro de subir-romaneio.tsx, no bloco do rioquality, acima do input de upload:
{cliente === 'rioquality' && (
  <button type="button" className="btn-fusion" disabled={carregando}
    onClick={async () => {
      setCarregando(true)
      try {
        const r = await fetch(`/api/kpi/ao-vivo/fusion?cliente=rioquality&data=${data}`, { method: 'POST' })
        const j = await r.json()
        if (!r.ok) setMsg(j.motivo === 'sem_dados_fusion' ? 'Fusion ainda sem romaneio do dia — use o upload.' : `Falha na Fusion: ${j.motivo}`)
        else { setMsg(`Puxado da Fusion: ${j.nfs} entregas, ${j.placas} placas.`); onPronto?.() }
      } finally { setCarregando(false) }
    }}>
    Puxar da Fusion
  </button>
)}
```

> Usar os nomes reais de estado/props do componente (ver o topo do arquivo); `setCarregando/setMsg/onPronto` acima são ilustrativos — casar com o que já existe.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/app/painel/ao-vivo/subir-romaneio.test.tsx`
Expected: PASS. (Se o projeto não roda teste de componente, validar no app com `npm run dev` e confirmar o botão só na Rio Quality.)

- [ ] **Step 5: Commit**

```bash
git add src/app/painel/ao-vivo/subir-romaneio.tsx src/app/painel/ao-vivo/subir-romaneio.test.tsx
git commit -m "feat(fusion): botão Puxar da Fusion na tela ao vivo (Rio Quality)"
```

---

### Task 8: Cron tick puxa da Fusion antes de calcular (Rio Quality)

**Files:**
- Modify: `scripts/kpi-ao-vivo-tick.ts`
- Test: `scripts/kpi-ao-vivo-tick.fusion.test.ts` (unit da função extraída)

**Interfaces:**
- Consumes: `buscarDiaRioQualityFusion` (Task 5), `guardarDiaAoVivo` (serviço).
- Produces: função `sincronizarFusionRioQuality(data: string): Promise<'ok'|'sem_dados'|'erro'>` chamada no loop do tick, antes de `calcularAoVivo`, só para `rioquality`. Nunca derruba o tick (try/catch → `'erro'` e segue pro cálculo com o que houver).

- [ ] **Step 1: Escrever o teste da função de sync**

```ts
// scripts/kpi-ao-vivo-tick.fusion.test.ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/kpi-rioquality/fonte-fusion', () => ({ buscarDiaRioQualityFusion: vi.fn() }))
const guardar = vi.fn(async () => {})
vi.mock('@/lib/kpi-romaneio/ao-vivo-servico', () => ({ guardarDiaAoVivo: (...a:unknown[]) => guardar(...a) }))

describe('sincronizarFusionRioQuality', () => {
  it('erro na Fusion não derruba o tick', async () => {
    const { buscarDiaRioQualityFusion } = await import('@/lib/kpi-rioquality/fonte-fusion')
    ;(buscarDiaRioQualityFusion as any).mockRejectedValue(new Error('timeout'))
    const { sincronizarFusionRioQuality } = await import('./kpi-ao-vivo-tick')
    expect(await sincronizarFusionRioQuality('2026-10-10')).toBe('erro')
  })
  it('sem dados → sem_dados e não grava', async () => {
    const { buscarDiaRioQualityFusion } = await import('@/lib/kpi-rioquality/fonte-fusion')
    ;(buscarDiaRioQualityFusion as any).mockResolvedValue([]); guardar.mockClear()
    const { sincronizarFusionRioQuality } = await import('./kpi-ao-vivo-tick')
    expect(await sincronizarFusionRioQuality('2026-10-10')).toBe('sem_dados')
    expect(guardar).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run scripts/kpi-ao-vivo-tick.fusion.test.ts`
Expected: FAIL (`sincronizarFusionRioQuality` não exportado).

- [ ] **Step 3: Implementar e exportar a função; chamar no loop**

```ts
// em scripts/kpi-ao-vivo-tick.ts
import { buscarDiaRioQualityFusion } from '@/lib/kpi-rioquality/fonte-fusion'
import { guardarDiaAoVivo } from '@/lib/kpi-romaneio/ao-vivo-servico'

export async function sincronizarFusionRioQuality(data: string): Promise<'ok'|'sem_dados'|'erro'> {
  try {
    const linhas = await buscarDiaRioQualityFusion(data)
    if (linhas.length === 0) return 'sem_dados'
    await guardarDiaAoVivo({ cliente: 'rioquality', data, romaneio: linhas, escala: [], escalaEnviada: false, paoEnviado: false, enviadoPor: 'cron-fusion', fonte: 'fusion' } as never)
    return 'ok'
  } catch (e) { console.error('[tick] Fusion RQ falhou:', e); return 'erro' }
}

// no loop existente, dentro do laço de CLIENTES_AO_VIVO, antes de calcularAoVivo:
// if (cliente === 'rioquality') await sincronizarFusionRioQuality(data)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run scripts/kpi-ao-vivo-tick.fusion.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Build + commit**

```bash
npm run build
git add scripts/kpi-ao-vivo-tick.ts scripts/kpi-ao-vivo-tick.fusion.test.ts
git commit -m "feat(fusion): cron tick puxa Rio Quality da Fusion antes de calcular"
```

---

### Task 9: Validação end-to-end com dado real + sincronizar as duas cópias

**Files:**
- Nenhum novo (validação).

- [ ] **Step 1: Suite completa**

Run: `npx vitest run src/lib/fusion src/lib/kpi-rioquality/fonte-fusion.test.ts src/app/api/kpi/ao-vivo/fusion`
Expected: tudo PASS.

- [ ] **Step 2: Smoke real contra a Fusion (com `.env` preenchido)**

Run: `npx tsx --env-file=.env -e "import('./src/lib/kpi-rioquality/fonte-fusion').then(m=>m.buscarDiaRioQualityFusion('2026-10-10')).then(r=>console.log(r.length, r[0]))"`
Expected: imprime nº de entregas e a 1ª linha mapeada (confere com o Dashboard Entregas da Fusion no mesmo dia).

- [ ] **Step 3: Validar na tela**

Run: `npm run dev` → `/painel/ao-vivo`, cliente Rio Quality, clicar "Puxar da Fusion", confirmar que o KPI calcula e os números batem com o relatório da Fusion. Testar o fallback: com `.env` sem `FUSION_*`, o botão falha com mensagem amigável e o upload manual ainda funciona.

- [ ] **Step 4: Espelhar no `KPI TEMP` e commitar lá também**

Replicar os arquivos criados/alterados em `../KPI TEMP/` (mesmos caminhos), rodar os testes lá, commit. (Regra: TEMP + definitivo sempre juntos.)

- [ ] **Step 5: Deploy**

Run: `./deploy.sh` (aplica no servidor via pm2; `git push` sozinho não atualiza produção). Aplicar a migration da Task 6 no banco de produção antes/junto. Validar a Rio Quality ao vivo em produção.

---

## Notas de follow-up (fora da Fase 1)
- **NF real:** achar o endpoint/campo da nota fiscal na Fusion e trocar a NF sintética da Task 4.
- **Fases 2–4** (manifesto no monitoramento, geometria de rota, validação cruzada de desvio): planos próprios depois que a Fase 1 estabilizar.
