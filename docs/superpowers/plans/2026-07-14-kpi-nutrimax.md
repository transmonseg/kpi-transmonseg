# KPI Nutrimax Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar e persistir o KPI diário do cliente Nutrimax (distribuidora, 1 cliente só, N
rotas/dia por placa) a partir do PDF "Romaneio de Entrega" + status já calculado pelo Unitrac
(conta separada, `codUser=4096`), seguindo o mesmo fluxo operacional do Benassi (gera → baixa
XLSX → sobe manual pro dashboard).

**Arquitetura:** Novo módulo `src/lib/kpi-nutrimax/` paralelo ao pipeline do Benassi (mesmo
padrão estrutural do módulo `cozinha`, que já isola um domínio de cliente diferente). Parser
lê o Romaneio (única fonte de entrada — a Escala de Rota tem colunas concatenadas sem
separador, não confiável por regex; ver spec). Matcher cruza cada cliente do romaneio contra
`/mapa_servicos/alvos` do Unitrac (mesma API já usada pro Benassi, só troca o `codUser`) — o
Unitrac já geocodifica e calcula status por cliente, então não tem motor de inferência de
status novo pra escrever. Gera XLSX simples (ExcelJS, sem template fixo), sobe de volta via
upload que reparsa esse XLSX pra uma tabela nova `kpi_nutrimax_entradas`. Dashboard novo lê
dessa tabela, agrupado por carga/placa (não existe "rede" no Nutrimax).

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres/Storage), `pdf-parse`
1.1.1, `exceljs`, Vitest.

## Global Constraints

- Sem placeholder: todo código deste plano é real, testável, sem "implementar depois".
- `codUser` do Nutrimax (`4096`) é uma constante no código, não segredo/env var — mesmo padrão
  do `COD_USER` do Benassi hoje em `src/lib/unitrac-api/client.ts`.
- Tabela nova (`kpi_nutrimax_entradas`) não reusa `kpi_manual_entradas` — schemas incompatíveis
  (aqui é por carga/cliente/NF, lá é por rede/loja).
- Upload é por **dia único** (não por mês) — cada Romaneio é de um dia específico, então
  regenerar um dia é sempre "apaga esse dia, insere de novo" (sem risco de perder outros dias,
  diferente do bug do upload mensal do Benassi).
- Toda escrita em `kpi_nutrimax_entradas` passa pelo service client (RLS só libera leitura pra
  `authenticated`), mesmo padrão de `kpi_manual_entradas`.

---

## Estrutura de arquivos

```
src/lib/unitrac-api/client.ts        (modificar: + COD_USER_NUTRIMAX)
src/lib/unitrac-api/frota.ts         (modificar: buscarFrota aceita codUser)
src/lib/unitrac-api/frota.test.ts    (criar)

src/lib/kpi-nutrimax/types.ts               (criar)
src/lib/kpi-nutrimax/parse-romaneio.ts      (criar)
src/lib/kpi-nutrimax/parse-romaneio.test.ts (criar)
src/lib/kpi-nutrimax/matcher.ts             (criar)
src/lib/kpi-nutrimax/matcher.test.ts        (criar)
src/lib/kpi-nutrimax/gerador.ts             (criar)
src/lib/kpi-nutrimax/parse-xlsx.ts          (criar)
src/lib/kpi-nutrimax/roundtrip.test.ts      (criar — testa gerador + parse-xlsx juntos)

supabase/migrations/20260714010000_kpi_nutrimax_entradas.sql (criar)

src/app/api/kpi/nutrimax/gerar/route.ts     (criar)
src/app/api/kpi-nutrimax/upload/route.ts    (criar)

src/app/painel/nutrimax/gerar/page.tsx      (criar)
src/app/painel/nutrimax/inserir/page.tsx    (criar)
src/app/painel/nutrimax/dashboard/page.tsx  (criar)
src/app/painel/nav.tsx                      (modificar: + grupo Nutrimax)
```

---

### Task 1: Unitrac API — parametrizar `buscarFrota` por conta

**Files:**
- Modify: `src/lib/unitrac-api/client.ts`
- Modify: `src/lib/unitrac-api/frota.ts`
- Create: `src/lib/unitrac-api/frota.test.ts`

**Interfaces:**
- Produces: `COD_USER_NUTRIMAX: string` (client.ts), `buscarFrota(codUser?: string): Promise<VeiculoApi[]>` (frota.ts, `VeiculoApi = { cv: string; placa: string; placaNorm: string }`), `normPlaca(p: string): string`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/unitrac-api/frota.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiGetMock = vi.fn()
vi.mock('./client', () => ({
  apiGet: (path: string) => apiGetMock(path),
  COD_USER: '4586',
  COD_USER_NUTRIMAX: '4096',
}))

import { buscarFrota, normPlaca } from './frota'

describe('normPlaca', () => {
  it('remove hífen e deixa maiúsculo', () => {
    expect(normPlaca('ttk-4d14')).toBe('TTK4D14')
  })
})

describe('buscarFrota', () => {
  beforeEach(() => apiGetMock.mockReset())

  it('sem argumento, consulta a frota do Benassi (COD_USER)', async () => {
    apiGetMock.mockResolvedValue({ veiculos: [{ cv: 1, placa: 'ABC-1D23' }] })
    const r = await buscarFrota()
    expect(apiGetMock).toHaveBeenCalledWith('/veiculos/masn/4586')
    expect(r).toEqual([{ cv: '1', placa: 'ABC-1D23', placaNorm: 'ABC1D23' }])
  })

  it('com codUser explícito, consulta a conta certa', async () => {
    apiGetMock.mockResolvedValue({ veiculos: [{ cv: 18870, placa: 'TTL-7D40' }] })
    const r = await buscarFrota('4096')
    expect(apiGetMock).toHaveBeenCalledWith('/veiculos/masn/4096')
    expect(r).toEqual([{ cv: '18870', placa: 'TTL-7D40', placaNorm: 'TTL7D40' }])
  })

  it('resposta nula/sem veiculos → array vazio', async () => {
    apiGetMock.mockResolvedValue(null)
    expect(await buscarFrota()).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/unitrac-api/frota.test.ts`
Expected: FAIL — `buscarFrota` hoje não aceita argumento, e `COD_USER_NUTRIMAX` não existe em `client.ts`.

- [ ] **Step 3: Adicionar `COD_USER_NUTRIMAX` em `client.ts`**

Abrir `src/lib/unitrac-api/client.ts` e adicionar logo depois de `export const COD_USER = '4586' // Benassi / conta transmonseg`:

```ts
export const COD_USER_NUTRIMAX = '4096' // Nutrimax / conta erica.rastreamento
```

- [ ] **Step 4: Parametrizar `buscarFrota` em `frota.ts`**

Trocar a assinatura de `buscarFrota` (arquivo inteiro fica assim):

```ts
import { apiGet, COD_USER } from './client'

export type VeiculoApi = { cv: string; placa: string; placaNorm: string }

export function normPlaca(p: string): string {
  return p.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export async function buscarFrota(codUser: string = COD_USER): Promise<VeiculoApi[]> {
  const d = (await apiGet(`/veiculos/masn/${codUser}`)) as { veiculos?: Array<{ cv: number; placa: string }> } | null
  if (!d?.veiculos) return []
  return d.veiculos.map(v => ({ cv: String(v.cv), placa: v.placa, placaNorm: normPlaca(v.placa) }))
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/unitrac-api/frota.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 6: Rodar a suíte inteira pra garantir que nada quebrou**

Run: `npx vitest run`
Expected: todos os testes existentes continuam passando (chamadas antigas a `buscarFrota()` sem argumento continuam funcionando por causa do default `= COD_USER`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/unitrac-api/client.ts src/lib/unitrac-api/frota.ts src/lib/unitrac-api/frota.test.ts
git commit -m "feat(unitrac): parametriza buscarFrota por codUser, adiciona conta Nutrimax"
```

---

### Task 2: Tipos compartilhados

**Files:**
- Create: `src/lib/kpi-nutrimax/types.ts`

**Interfaces:**
- Produces: `LinhaRomaneioNutrimax`, `EntradaNutrimax` (usados pelas Tasks 3, 4, 5, 6).

- [ ] **Step 1: Criar o arquivo de tipos (não precisa de teste — só type, sem lógica)**

```ts
// src/lib/kpi-nutrimax/types.ts

/** Uma linha do Romaneio de Entrega — um cliente dentro de uma carga/placa. */
export type LinhaRomaneioNutrimax = {
  carga: string
  destino: string
  placa: string
  motorista: string
  ajudantes: string[]
  nf: string
  clienteCodigo: string
  clienteNome: string
  endereco: string
}

/** Uma linha pronta pra persistir em kpi_nutrimax_entradas — já cruzada com o Unitrac. */
export type EntradaNutrimax = {
  data: string // YYYY-MM-DD
  carga: string
  destino: string
  placa: string
  motorista: string | null
  nf: string
  cliente_codigo: string | null
  cliente_nome: string
  endereco: string | null
  status: 'entregue' | 'pendente'
  hora_realizado: string | null // ISO, null quando pendente
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/kpi-nutrimax/types.ts
git commit -m "feat(kpi-nutrimax): tipos LinhaRomaneioNutrimax e EntradaNutrimax"
```

---

### Task 3: Parser do Romaneio de Entrega

O Romaneio (`8012 - Romaneio de Entrega`) tem blocos delimitados assim (texto real extraído
via `pdf-parse` do PDF de exemplo, uma linha por elemento):

```
PLACA/MOTORISTA:TUL1C38 / JOSE ROBERTO MACHADO SALESCARGA/DESTINO:92591 / NATIVIDADE
AJUDANTE(S):,
2249581 / 137038 - CHICAGO'S MERCEARIA
RUA MONSENHOR MIGUEL DOS REIS MELLO, 20 - NOSSA SENHORA DO ROSARIO, NATIVIDADE - *
NF / CLIENTE:
2249582 / 137744 -  SURPERMERCADO  SANSAO
AV AMARAL PEIXOTO, 37 - CENTRO, NATIVIDADE - LOJA B
NF / CLIENTE:
...
Total de 27 clientes
```

Quando uma carga tem clientes demais pra uma página, o cabeçalho `PLACA/MOTORISTA:...
CARGA/DESTINO:...` **repete** no topo da página seguinte, continuando a mesma carga (não é uma
carga nova) — confirmado no PDF de exemplo (carga 92593/CAMPOS, 36 clientes, span de 2
páginas). O parser trata isso naturalmente: cada ocorrência do cabeçalho só atualiza o
"contexto atual" (placa/motorista/carga/destino), sem resetar a lista acumulada.

**Files:**
- Create: `src/lib/kpi-nutrimax/parse-romaneio.ts`
- Create: `src/lib/kpi-nutrimax/parse-romaneio.test.ts`

**Interfaces:**
- Consumes: `LinhaRomaneioNutrimax` (Task 2).
- Produces: `parseRomaneioTexto(texto: string): LinhaRomaneioNutrimax[]` (função pura, testável
  sem PDF real), `parseRomaneioNutrimax(buffer: Buffer): Promise<LinhaRomaneioNutrimax[]>`
  (wrapper que chama `pdf-parse` e delega pra `parseRomaneioTexto`).

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/kpi-nutrimax/parse-romaneio.test.ts
import { describe, it, expect } from 'vitest'
import { parseRomaneioTexto } from './parse-romaneio'

// Texto real extraído via pdf-parse do PDF "Romaneio 01-07.pdf" (carga 92591/NATIVIDADE,
// 2 clientes, sem ajudante) — cola exatamente como o pdf-parse devolve, uma linha por item.
const TEXTO_BASICO = `
8012 - Romaneio de Entrega
01/07/2026 06:30
PLACA/MOTORISTA:TUL1C38 / JOSE ROBERTO MACHADO SALESCARGA/DESTINO:92591 / NATIVIDADE
AJUDANTE(S):,
2249581 / 137038 - CHICAGO'S MERCEARIA
RUA MONSENHOR MIGUEL DOS REIS MELLO, 20 - NOSSA SENHORA DO ROSARIO, NATIVIDADE - *
NF / CLIENTE:
2249582 / 137744 -  SURPERMERCADO  SANSAO
AV AMARAL PEIXOTO, 37 - CENTRO, NATIVIDADE - LOJA B
NF / CLIENTE:
Total de 2 clientes
`

describe('parseRomaneioTexto', () => {
  it('extrai carga, placa, motorista, destino e os clientes do bloco', () => {
    const linhas = parseRomaneioTexto(TEXTO_BASICO)
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toEqual({
      carga: '92591',
      destino: 'NATIVIDADE',
      placa: 'TUL1C38',
      motorista: 'JOSE ROBERTO MACHADO SALES',
      ajudantes: [],
      nf: '2249581',
      clienteCodigo: '137038',
      clienteNome: "CHICAGO'S MERCEARIA",
      endereco: 'RUA MONSENHOR MIGUEL DOS REIS MELLO, 20 - NOSSA SENHORA DO ROSARIO, NATIVIDADE - *',
    })
    expect(linhas[1].nf).toBe('2249582')
    expect(linhas[1].clienteNome).toBe('SURPERMERCADO  SANSAO')
  })

  it('lê ajudante(s) quando presente, separando por vírgula', () => {
    const texto = `
PLACA/MOTORISTA:TTL7D40 / LUAN VIANA AREAS RIBEIROCARGA/DESTINO:92593 / CAMPOS
AJUDANTE(S):LEANDRO DA HORA BATISTA ,
2249517 / 133553 - SUPERMERCADO NELIO FILHO
AV JOSE LISANDRO ALBERNAZ, S/N - BARCELOS, SAO JOAO DA BAR - 6 DISTRITO
NF / CLIENTE:
Total de 1 clientes
`
    const linhas = parseRomaneioTexto(texto)
    expect(linhas).toHaveLength(1)
    expect(linhas[0].ajudantes).toEqual(['LEANDRO DA HORA BATISTA'])
  })

  it('carga que continua em outra página (cabeçalho repete) acumula na mesma carga', () => {
    const texto = `
PLACA/MOTORISTA:TTL7D40 / LUAN VIANA AREAS RIBEIROCARGA/DESTINO:92593 / CAMPOS
AJUDANTE(S):LEANDRO DA HORA BATISTA ,
2249517 / 133553 - SUPERMERCADO NELIO FILHO
AV JOSE LISANDRO ALBERNAZ, S/N - BARCELOS, SAO JOAO DA BAR - 6 DISTRITO
NF / CLIENTE:

8012 - Romaneio de Entrega
01/07/2026 06:30
PLACA/MOTORISTA:TTL7D40 / LUAN VIANA AREAS RIBEIROCARGA/DESTINO:92593 / CAMPOS
AJUDANTE(S):LEANDRO DA HORA BATISTA ,
2249531 / 160992 - LANCHONETE DO VITOR
ESTRADA AZEITONA, S/N - AZEITONA, SAO JOAO DA BAR - *
NF / CLIENTE:
Total de 2 clientes
`
    const linhas = parseRomaneioTexto(texto)
    expect(linhas).toHaveLength(2)
    expect(linhas.every(l => l.carga === '92593')).toBe(true)
    expect(linhas.map(l => l.nf)).toEqual(['2249517', '2249531'])
  })

  it('texto sem nenhum bloco reconhecido → array vazio', () => {
    expect(parseRomaneioTexto('lixo qualquer\nsem estrutura nenhuma')).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/kpi-nutrimax/parse-romaneio.test.ts`
Expected: FAIL — módulo `./parse-romaneio` não existe ainda.

- [ ] **Step 3: Implementar o parser**

```ts
// src/lib/kpi-nutrimax/parse-romaneio.ts
import type { LinhaRomaneioNutrimax } from './types'

const HEADER_RE = /^PLACA\/MOTORISTA:(.+?)\s*\/\s*(.+?)CARGA\/DESTINO:(\d+)\s*\/\s*(.+)$/
const AJUDANTE_RE = /^AJUDANTE\(S\):(.*)$/
const NF_CLIENTE_RE = /^(\d+)\s*\/\s*(\d+)\s*-\s*(.+)$/
const FIM_CLIENTE_RE = /^NF\s*\/\s*CLIENTE:\s*$/
const TOTAL_RE = /^Total de \d+ clientes?$/i

type Contexto = { carga: string; destino: string; placa: string; motorista: string; ajudantes: string[] }

/**
 * Parser puro — recebe o texto já extraído (ex: por pdf-parse) e devolve as linhas.
 * Separado do I/O de PDF pra ser testável sem precisar de um binário de PDF real.
 */
export function parseRomaneioTexto(texto: string): LinhaRomaneioNutrimax[] {
  const linhas: LinhaRomaneioNutrimax[] = []
  let ctx: Contexto | null = null
  let pendente: { nf: string; codigo: string; nome: string } | null = null

  for (const raw of texto.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    const h = line.match(HEADER_RE)
    if (h) {
      ctx = { placa: h[1].trim(), motorista: h[2].trim(), carga: h[3], destino: h[4].trim(), ajudantes: [] }
      pendente = null
      continue
    }
    if (!ctx) continue

    const aj = line.match(AJUDANTE_RE)
    if (aj) {
      ctx.ajudantes = aj[1].split(',').map(s => s.trim()).filter(Boolean)
      continue
    }
    if (TOTAL_RE.test(line) || FIM_CLIENTE_RE.test(line)) {
      pendente = null
      continue
    }

    const nfM = line.match(NF_CLIENTE_RE)
    if (nfM && !pendente) {
      pendente = { nf: nfM[1], codigo: nfM[2], nome: nfM[3].trim() }
      continue
    }
    if (pendente) {
      linhas.push({
        carga: ctx.carga,
        destino: ctx.destino,
        placa: ctx.placa,
        motorista: ctx.motorista,
        ajudantes: ctx.ajudantes,
        nf: pendente.nf,
        clienteCodigo: pendente.codigo,
        clienteNome: pendente.nome,
        endereco: line,
      })
      pendente = null
    }
  }
  return linhas
}

export async function parseRomaneioNutrimax(buffer: Buffer): Promise<LinhaRomaneioNutrimax[]> {
  // pdf-parse v1.1.1 — default export é função (buf) => Promise<{text}>. Mesmo padrão
  // usado em src/lib/parsers/escala-guanabara-pdf.ts.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
  const { text } = await pdfParse(buffer)
  return parseRomaneioTexto(text)
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/kpi-nutrimax/parse-romaneio.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Validar contra o PDF real (smoke test manual, não faz parte da suíte)**

Rodar isso uma vez, manualmente, apontando pro PDF real que o usuário mandou, só pra
confirmar que o parser lida com o arquivo inteiro (não só os fixtures do teste):

```bash
node -e "
const { parseRomaneioNutrimax } = require('./src/lib/kpi-nutrimax/parse-romaneio.ts')
" 2>&1 || echo "rodar via tsx se node puro não entender TS"
npx tsx -e "
import { parseRomaneioNutrimax } from './src/lib/kpi-nutrimax/parse-romaneio'
import fs from 'fs'
const buf = fs.readFileSync('/Users/joaquimsalles/Downloads/Romaneio 01-07.pdf')
parseRomaneioNutrimax(buf).then(linhas => {
  console.log('total de linhas:', linhas.length)
  console.log('cargas distintas:', new Set(linhas.map(l => l.carga)).size)
  console.log('primeira linha:', linhas[0])
})
"
```

Expected: `total de linhas` na casa de milhares (o romaneio tinha ~6800 linhas de texto pra
~70 cargas), `cargas distintas` perto de 70, sem exceção lançada.

- [ ] **Step 6: Commit**

```bash
git add src/lib/kpi-nutrimax/parse-romaneio.ts src/lib/kpi-nutrimax/parse-romaneio.test.ts
git commit -m "feat(kpi-nutrimax): parser do Romaneio de Entrega"
```

---

### Task 4: Matcher — cruza Romaneio com Unitrac

**Files:**
- Create: `src/lib/kpi-nutrimax/matcher.ts`
- Create: `src/lib/kpi-nutrimax/matcher.test.ts`

**Interfaces:**
- Consumes: `LinhaRomaneioNutrimax`, `EntradaNutrimax` (Task 2); `buscarFrota(codUser?: string): Promise<VeiculoApi[]>`, `normPlaca(p: string): string` (Task 1, `src/lib/unitrac-api/frota.ts`); `buscarAlvos(cvs: string[]): Promise<AlvoApi[]>` (`src/lib/unitrac-api/alvos.ts`, já existe — `AlvoApi = { placaNorm, codigoUnitrac, nome, situacao, feitoISO, inicioISO, documento, ordem, rota }`).
- Produces: `COD_USER_NUTRIMAX_MATCHER` (reexport da constante), `cruzaRomaneioAlvosNutrimax(linhas: LinhaRomaneioNutrimax[], data: string): Promise<EntradaNutrimax[]>`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/kpi-nutrimax/matcher.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/unitrac-api/frota', () => ({
  buscarFrota: vi.fn(async () => [{ cv: '18870', placa: 'TTL-7D40', placaNorm: 'TTL7D40' }]),
  normPlaca: (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, ''),
}))
vi.mock('@/lib/unitrac-api/alvos', () => ({
  buscarAlvos: vi.fn(async () => [
    {
      placaNorm: 'TTL7D40', codigoUnitrac: '165049', nome: 'ANDRE LUIS SILVA VELASCO',
      situacao: 1, feitoISO: '2026-07-14T09:58:18.48', inicioISO: '2026-07-14T07:00:00',
      documento: '2270025', ordem: 0, rota: '93496',
    },
    {
      placaNorm: 'TTL7D40', codigoUnitrac: '139854', nome: 'M A SARDINHA',
      situacao: 0, feitoISO: null, inicioISO: '2026-07-14T07:00:00',
      documento: '2270014', ordem: 0, rota: '93496',
    },
  ]),
}))

import { cruzaRomaneioAlvosNutrimax } from './matcher'
import type { LinhaRomaneioNutrimax } from './types'

const linhas: LinhaRomaneioNutrimax[] = [
  {
    carga: '92593', destino: 'CAMPOS', placa: 'TTL-7D40', motorista: 'LUAN VIANA AREAS RIBEIRO',
    ajudantes: [], nf: '2270025', clienteCodigo: '165049', clienteNome: 'ANDRE LUIS SILVA VELASCO',
    endereco: 'RUA X, 1 - BAIRRO, CAMPOS - *',
  },
  {
    carga: '92593', destino: 'CAMPOS', placa: 'TTL-7D40', motorista: 'LUAN VIANA AREAS RIBEIRO',
    ajudantes: [], nf: '2270014', clienteCodigo: '139854', clienteNome: 'M A SARDINHA',
    endereco: 'RUA Y, 2 - BAIRRO, CAMPOS - *',
  },
  {
    // NF sem alvo correspondente no Unitrac → deve virar "pendente" mesmo assim
    carga: '92593', destino: 'CAMPOS', placa: 'TTL-7D40', motorista: 'LUAN VIANA AREAS RIBEIRO',
    ajudantes: [], nf: '9999999', clienteCodigo: '000000', clienteNome: 'CLIENTE SEM ALVO',
    endereco: 'RUA Z, 3 - BAIRRO, CAMPOS - *',
  },
]

describe('cruzaRomaneioAlvosNutrimax', () => {
  it('marca entregue quando o alvo tem situacao=1, pendente caso contrário', async () => {
    const entradas = await cruzaRomaneioAlvosNutrimax(linhas, '2026-07-14')
    expect(entradas).toHaveLength(3)
    expect(entradas[0]).toMatchObject({ nf: '2270025', status: 'entregue', hora_realizado: '2026-07-14T09:58:18.48' })
    expect(entradas[1]).toMatchObject({ nf: '2270014', status: 'pendente', hora_realizado: null })
    expect(entradas[2]).toMatchObject({ nf: '9999999', status: 'pendente', hora_realizado: null })
    expect(entradas[0].data).toBe('2026-07-14')
    expect(entradas[0].placa).toBe('TTL7D40')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/kpi-nutrimax/matcher.test.ts`
Expected: FAIL — `./matcher` não existe.

- [ ] **Step 3: Implementar o matcher**

```ts
// src/lib/kpi-nutrimax/matcher.ts
import { buscarFrota, normPlaca } from '@/lib/unitrac-api/frota'
import { buscarAlvos } from '@/lib/unitrac-api/alvos'
import { COD_USER_NUTRIMAX } from '@/lib/unitrac-api/client'
import type { LinhaRomaneioNutrimax, EntradaNutrimax } from './types'

export async function cruzaRomaneioAlvosNutrimax(
  linhas: LinhaRomaneioNutrimax[],
  data: string,
): Promise<EntradaNutrimax[]> {
  const frota = await buscarFrota(COD_USER_NUTRIMAX)
  const cvs = frota.map(v => v.cv)
  const alvos = cvs.length > 0 ? await buscarAlvos(cvs) : []

  // índice (placaNorm + documento/NF) -> alvo, pra achar o status calculado pelo Unitrac
  const porPlacaNf = new Map(
    alvos.filter(a => a.documento).map(a => [`${a.placaNorm}:${a.documento}`, a]),
  )

  return linhas.map((l): EntradaNutrimax => {
    const placaNorm = normPlaca(l.placa)
    const alvo = porPlacaNf.get(`${placaNorm}:${l.nf}`)
    return {
      data,
      carga: l.carga,
      destino: l.destino,
      placa: placaNorm,
      motorista: l.motorista || null,
      nf: l.nf,
      cliente_codigo: l.clienteCodigo || null,
      cliente_nome: l.clienteNome,
      endereco: l.endereco || null,
      status: alvo?.situacao === 1 ? 'entregue' : 'pendente',
      hora_realizado: alvo?.feitoISO ?? null,
    }
  })
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/kpi-nutrimax/matcher.test.ts`
Expected: PASS (1 teste).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-nutrimax/matcher.ts src/lib/kpi-nutrimax/matcher.test.ts
git commit -m "feat(kpi-nutrimax): cruza clientes do romaneio com status do Unitrac (alvos)"
```

---

### Task 5: Gerador de XLSX + reparser (ida e volta)

Sem template fixo (diferente do Benassi) — planilha simples com cabeçalho + 1 linha por
cliente. O reparser lê pelo **nome da coluna**, não pela posição, pra ser resiliente a reordenar
colunas manualmente na planilha.

**Files:**
- Create: `src/lib/kpi-nutrimax/gerador.ts`
- Create: `src/lib/kpi-nutrimax/parse-xlsx.ts`
- Create: `src/lib/kpi-nutrimax/roundtrip.test.ts`

**Interfaces:**
- Consumes: `EntradaNutrimax` (Task 2).
- Produces: `gerarKpiNutrimax(entradas: EntradaNutrimax[]): Promise<Buffer>`, `parseKpiNutrimaxXlsx(buffer: Buffer, data: string): Promise<EntradaNutrimax[]>`.

- [ ] **Step 1: Escrever o teste que falha (ida e volta)**

```ts
// src/lib/kpi-nutrimax/roundtrip.test.ts
import { describe, it, expect } from 'vitest'
import { gerarKpiNutrimax } from './gerador'
import { parseKpiNutrimaxXlsx } from './parse-xlsx'
import type { EntradaNutrimax } from './types'

const entradas: EntradaNutrimax[] = [
  {
    data: '2026-07-14', carga: '92593', destino: 'CAMPOS', placa: 'TTL7D40', motorista: 'LUAN VIANA',
    nf: '2270025', cliente_codigo: '165049', cliente_nome: 'ANDRE LUIS SILVA VELASCO',
    endereco: 'RUA X, 1 - BAIRRO, CAMPOS - *', status: 'entregue', hora_realizado: '2026-07-14T09:58:18.480Z',
  },
  {
    data: '2026-07-14', carga: '92593', destino: 'CAMPOS', placa: 'TTL7D40', motorista: 'LUAN VIANA',
    nf: '2270014', cliente_codigo: '139854', cliente_nome: 'M A SARDINHA',
    endereco: 'RUA Y, 2 - BAIRRO, CAMPOS - *', status: 'pendente', hora_realizado: null,
  },
]

describe('gerarKpiNutrimax + parseKpiNutrimaxXlsx', () => {
  it('gera um XLSX e relê exatamente as mesmas entradas', async () => {
    const buf = await gerarKpiNutrimax(entradas)
    expect(buf.length).toBeGreaterThan(0)

    const relidas = await parseKpiNutrimaxXlsx(buf, '2026-07-14')
    expect(relidas).toHaveLength(2)
    expect(relidas[0]).toMatchObject({
      carga: '92593', destino: 'CAMPOS', placa: 'TTL7D40', nf: '2270025',
      cliente_nome: 'ANDRE LUIS SILVA VELASCO', status: 'entregue',
    })
    expect(relidas[1]).toMatchObject({ nf: '2270014', status: 'pendente' })
  })

  it('planilha vazia → array vazio', async () => {
    const buf = await gerarKpiNutrimax([])
    expect(await parseKpiNutrimaxXlsx(buf, '2026-07-14')).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/kpi-nutrimax/roundtrip.test.ts`
Expected: FAIL — nenhum dos dois módulos existe ainda.

- [ ] **Step 3: Implementar o gerador**

```ts
// src/lib/kpi-nutrimax/gerador.ts
import ExcelJS from 'exceljs'
import type { EntradaNutrimax } from './types'

export const COLUNAS_KPI_NUTRIMAX = [
  'CARGA', 'DESTINO', 'PLACA', 'MOTORISTA', 'NF', 'CLIENTE', 'ENDEREÇO', 'STATUS', 'HORA REALIZADO',
] as const

export async function gerarKpiNutrimax(entradas: EntradaNutrimax[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('KPI Nutrimax')
  ws.addRow([...COLUNAS_KPI_NUTRIMAX])
  for (const e of entradas) {
    ws.addRow([
      e.carga, e.destino, e.placa, e.motorista ?? '', e.nf, e.cliente_nome,
      e.endereco ?? '', e.status, e.hora_realizado ?? '',
    ])
  }
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
```

- [ ] **Step 4: Implementar o reparser**

```ts
// src/lib/kpi-nutrimax/parse-xlsx.ts
import ExcelJS from 'exceljs'
import type { EntradaNutrimax } from './types'

export async function parseKpiNutrimaxXlsx(buffer: Buffer, data: string): Promise<EntradaNutrimax[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  const ws = wb.worksheets[0]
  if (!ws) return []

  const header = (ws.getRow(1).values as unknown[]).map(v => String(v ?? '').trim().toUpperCase())
  const idx = (nome: string) => header.indexOf(nome)
  const iCarga = idx('CARGA')
  const iDestino = idx('DESTINO')
  const iPlaca = idx('PLACA')
  const iMotorista = idx('MOTORISTA')
  const iNf = idx('NF')
  const iCliente = idx('CLIENTE')
  const iEndereco = idx('ENDEREÇO')
  const iStatus = idx('STATUS')
  const iHora = idx('HORA REALIZADO')

  const entradas: EntradaNutrimax[] = []
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const vals = row.values as unknown[]
    const nf = String(vals[iNf] ?? '').trim()
    if (!nf) return
    const hora = String(vals[iHora] ?? '').trim()
    entradas.push({
      data,
      carga: String(vals[iCarga] ?? '').trim(),
      destino: String(vals[iDestino] ?? '').trim(),
      placa: String(vals[iPlaca] ?? '').trim(),
      motorista: String(vals[iMotorista] ?? '').trim() || null,
      nf,
      cliente_codigo: null,
      cliente_nome: String(vals[iCliente] ?? '').trim(),
      endereco: String(vals[iEndereco] ?? '').trim() || null,
      status: String(vals[iStatus] ?? '').trim() === 'entregue' ? 'entregue' : 'pendente',
      hora_realizado: hora || null,
    })
  })
  return entradas
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/kpi-nutrimax/roundtrip.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 6: Commit**

```bash
git add src/lib/kpi-nutrimax/gerador.ts src/lib/kpi-nutrimax/parse-xlsx.ts src/lib/kpi-nutrimax/roundtrip.test.ts
git commit -m "feat(kpi-nutrimax): gera XLSX simples e relê pelo nome da coluna"
```

---

### Task 6: Migration — tabela `kpi_nutrimax_entradas`

**Files:**
- Create: `supabase/migrations/20260714010000_kpi_nutrimax_entradas.sql`

**Interfaces:**
- Produces: tabela `kpi_nutrimax_entradas` com RLS de leitura pra `authenticated`.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/20260714010000_kpi_nutrimax_entradas.sql
-- KPI Nutrimax: granularidade cliente/NF (não tem "rede" nem "loja" — cliente único,
-- N rotas/dia identificadas por carga+placa). Upload é por dia (não por mês, como o
-- Benassi) — cada Romaneio processado é de um dia específico.

create table if not exists kpi_nutrimax_entradas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  carga text not null,
  destino text not null,
  placa text not null,
  motorista text,
  nf text not null,
  cliente_codigo text,
  cliente_nome text not null,
  endereco text,
  status text not null check (status in ('entregue', 'pendente')),
  hora_realizado timestamptz,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_kpi_nutrimax_data on kpi_nutrimax_entradas(data);
create index if not exists idx_kpi_nutrimax_placa on kpi_nutrimax_entradas(placa);
create index if not exists idx_kpi_nutrimax_carga on kpi_nutrimax_entradas(carga);

alter table kpi_nutrimax_entradas enable row level security;

create policy "kpi_nutrimax_read"
  on kpi_nutrimax_entradas
  for select
  to authenticated
  using (true);

-- Escrita só via service_role (rotas de API), mesmo padrão de kpi_manual_entradas —
-- sem policy de insert/update/delete pra `authenticated`.
```

- [ ] **Step 2: Aplicar a migration no banco**

Seguir o mesmo processo usado nas migrations anteriores desta sessão (sem Supabase CLI
instalado neste ambiente): rodar via `pg` do Node com a connection string do vault
(`sistema-kpi/chaves.md`, seção "Senha direta do Postgres"), com a senha URL-encoded
(o `#` vira `%23`).

```bash
mkdir -p /tmp/pg-runner-nutrimax && cd /tmp/pg-runner-nutrimax && npm init -y >/dev/null 2>&1 && npm install pg --silent
cat > run-migration.js <<'EOF'
const { Client } = require('pg')
const fs = require('fs')
const client = new Client({ connectionString: process.env.PG_CONN, ssl: { rejectUnauthorized: false } })
;(async () => {
  await client.connect()
  await client.query(fs.readFileSync(process.argv[2], 'utf8'))
  console.log('OK: migration aplicada.')
  await client.end()
})().catch(e => { console.error('ERRO:', e.message); process.exit(1) })
EOF
PG_CONN='postgresql://postgres:<SENHA_URL_ENCODED>@db.luhwpsckvbctxynifryk.supabase.co:5432/postgres' \
  node run-migration.js "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP/supabase/migrations/20260714010000_kpi_nutrimax_entradas.sql"
rm -rf /tmp/pg-runner-nutrimax
```

Expected: `OK: migration aplicada.`

- [ ] **Step 3: Confirmar a tabela via REST**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
source <(grep -v '^#' .env.local | sed 's/^/export /')
curl -s "https://luhwpsckvbctxynifryk.supabase.co/rest/v1/kpi_nutrimax_entradas?select=*&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: `[]` (tabela existe, vazia — não erro 404/undefined table).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260714010000_kpi_nutrimax_entradas.sql
git commit -m "feat(db): tabela kpi_nutrimax_entradas"
```

---

### Task 7: API route — gerar KPI (recebe Romaneio, devolve XLSX)

**Files:**
- Create: `src/app/api/kpi/nutrimax/gerar/route.ts`

**Interfaces:**
- Consumes: `parseRomaneioNutrimax` (Task 3), `cruzaRomaneioAlvosNutrimax` (Task 4), `gerarKpiNutrimax` (Task 5).

- [ ] **Step 1: Implementar a rota**

Sem teste automatizado aqui (rota HTTP fina, orquestra funções já testadas nas Tasks 3-5) —
verificação é o smoke test manual do Step 2.

```ts
// src/app/api/kpi/nutrimax/gerar/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseRomaneioNutrimax } from '@/lib/kpi-nutrimax/parse-romaneio'
import { cruzaRomaneioAlvosNutrimax } from '@/lib/kpi-nutrimax/matcher'
import { gerarKpiNutrimax } from '@/lib/kpi-nutrimax/gerador'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const form = await req.formData()
  const data = String(form.get('data') ?? '')
  const file = form.get('file')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida (YYYY-MM-DD)', { status: 400 })
  if (!(file instanceof File)) return new NextResponse('Romaneio (PDF) obrigatório', { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const linhas = await parseRomaneioNutrimax(buf)
  if (linhas.length === 0) {
    return new NextResponse('Nenhum cliente reconhecido no romaneio — confira se o PDF é o "Romaneio de Entrega".', { status: 422 })
  }

  const entradas = await cruzaRomaneioAlvosNutrimax(linhas, data)
  const xlsxBuf = await gerarKpiNutrimax(entradas)

  return new NextResponse(xlsxBuf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="KPI-Nutrimax-${data}.xlsx"`,
    },
  })
}
```

- [ ] **Step 2: Smoke test manual com o PDF real**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && npm run dev &
sleep 3
# precisa de uma sessão autenticada real pra passar do 401 — testar via navegador
# (chrome-devtools) logado como admin é mais confiável que curl aqui, já que a rota
# usa createClient() (cookies), não aceita Bearer token solto.
```

Testar de verdade via navegador (chrome-devtools-mcp), logado como admin: ir em
`/painel/nutrimax/gerar` (só vai existir depois da Task 10 — por ora, testar via um
formulário HTML mínimo ou adiar esse smoke test pro final da Task 10, quando a UI existir).
Anotar isso e seguir — o teste manual fim-a-fim acontece no fechamento da Task 10.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/kpi/nutrimax/gerar/route.ts"
git commit -m "feat(kpi-nutrimax): rota de geração — romaneio PDF -> XLSX"
```

---

### Task 8: API route — subir XLSX pro dashboard

**Files:**
- Create: `src/app/api/kpi-nutrimax/upload/route.ts`

**Interfaces:**
- Consumes: `parseKpiNutrimaxXlsx` (Task 5).

- [ ] **Step 1: Implementar a rota**

```ts
// src/app/api/kpi-nutrimax/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseKpiNutrimaxXlsx } from '@/lib/kpi-nutrimax/parse-xlsx'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const form = await req.formData()
  const data = String(form.get('data') ?? '')
  const file = form.get('file')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida (YYYY-MM-DD)', { status: 400 })
  if (!(file instanceof File)) return new NextResponse('Arquivo obrigatório', { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const entradas = await parseKpiNutrimaxXlsx(buf, data)
  if (entradas.length === 0) {
    return new NextResponse('Nenhum cliente reconhecido na planilha (confira se é o XLSX gerado em "Gerar KPI").', { status: 422 })
  }

  const svc = createServiceClient()
  // Upload é por dia único — apaga e reinsere só esse dia (sem risco de perder outros
  // dias, diferente do upload mensal do Benassi).
  const { error: delError } = await svc.from('kpi_nutrimax_entradas').delete().eq('data', data)
  if (delError) return new NextResponse(delError.message, { status: 500 })

  const { error } = await svc
    .from('kpi_nutrimax_entradas')
    .insert(entradas.map(e => ({ ...e, uploaded_by: user.id })))
  if (error) return new NextResponse(error.message, { status: 500 })

  return NextResponse.json({ ok: true, data, inseridas: entradas.length })
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/api/kpi-nutrimax/upload/route.ts"
git commit -m "feat(kpi-nutrimax): rota de upload — XLSX -> kpi_nutrimax_entradas"
```

---

### Task 9: UI — tela "Gerar KPI" do Nutrimax

**Files:**
- Create: `src/app/painel/nutrimax/gerar/page.tsx`

**Interfaces:**
- Consumes: `POST /api/kpi/nutrimax/gerar` (Task 7).

- [ ] **Step 1: Implementar a página**

```tsx
// src/app/painel/nutrimax/gerar/page.tsx
'use client'

import { useState } from 'react'

export default function NutrimaxGerarPage() {
  const [file, setFile] = useState<File | null>(null)
  const [data, setData] = useState('')
  const [pending, setPending] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function gerar() {
    if (!file || !data) return
    setPending(true)
    setErro(null)
    try {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('data', data)
      const res = await fetch('/api/kpi/nutrimax/gerar', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `KPI-Nutrimax-${data}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[640px] space-y-6 px-5 py-8">
      <header>
        <span className="text-overline">Nutrimax</span>
        <h1 className="mt-1 text-display text-[28px] leading-none text-[var(--color-fg)]">Gerar KPI</h1>
        <p className="mt-2 text-[13px] text-[var(--color-fg-muted)]">
          Suba o Romaneio de Entrega do dia. O sistema cruza cada cliente com o status já
          calculado pelo Unitrac e gera a planilha pra revisão.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <label className="text-overline" htmlFor="data">Data</label>
        <input
          id="data" type="date" value={data} onChange={e => setData(e.target.value)}
          className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-[13px] text-[var(--color-fg)] outline-none"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-overline" htmlFor="romaneio">Romaneio de Entrega (PDF)</label>
        <input
          id="romaneio" type="file" accept=".pdf"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="text-[13px]"
        />
      </div>

      {erro && (
        <p role="alert" className="rounded-md border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-3 py-2 text-[12px] text-[var(--color-danger-soft-fg)]">
          {erro}
        </p>
      )}

      <button
        type="button"
        onClick={gerar}
        disabled={!file || !data || pending}
        className="h-10 rounded-full bg-[var(--color-navy-700)] px-6 text-[13px] font-medium text-white transition-opacity disabled:opacity-40"
      >
        {pending ? 'Gerando…' : 'Gerar e baixar XLSX'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/app/painel/nutrimax/gerar/page.tsx
git commit -m "feat(kpi-nutrimax): tela de geração de KPI"
```

---

### Task 10: UI — tela "Inserir KPI" (upload de volta) + nav + smoke test fim-a-fim

**Files:**
- Create: `src/app/painel/nutrimax/inserir/page.tsx`
- Modify: `src/app/painel/nav.tsx`

**Interfaces:**
- Consumes: `POST /api/kpi-nutrimax/upload` (Task 8).

- [ ] **Step 1: Implementar a página de upload**

```tsx
// src/app/painel/nutrimax/inserir/page.tsx
'use client'

import { useState } from 'react'

export default function NutrimaxInserirPage() {
  const [file, setFile] = useState<File | null>(null)
  const [data, setData] = useState('')
  const [pending, setPending] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar() {
    if (!file || !data) return
    setPending(true)
    setErro(null)
    setMsg(null)
    try {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('data', data)
      const res = await fetch('/api/kpi-nutrimax/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json() as { inseridas: number }
      setMsg(`${json.inseridas} clientes inseridos pra ${data}.`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao subir.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[640px] space-y-6 px-5 py-8">
      <header>
        <span className="text-overline">Nutrimax</span>
        <h1 className="mt-1 text-display text-[28px] leading-none text-[var(--color-fg)]">Inserir KPI</h1>
        <p className="mt-2 text-[13px] text-[var(--color-fg-muted)]">
          Suba de volta o mesmo XLSX baixado em &quot;Gerar KPI&quot; pra ele aparecer no Dashboard.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <label className="text-overline" htmlFor="data">Data</label>
        <input
          id="data" type="date" value={data} onChange={e => setData(e.target.value)}
          className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-[13px] text-[var(--color-fg)] outline-none"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-overline" htmlFor="xlsx">XLSX gerado</label>
        <input
          id="xlsx" type="file" accept=".xlsx"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="text-[13px]"
        />
      </div>

      {erro && (
        <p role="alert" className="rounded-md border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-3 py-2 text-[12px] text-[var(--color-danger-soft-fg)]">
          {erro}
        </p>
      )}
      {msg && (
        <p role="status" className="rounded-md border border-[var(--color-success)]/30 bg-[var(--color-success-soft)] px-3 py-2 text-[12px] text-[var(--color-success-soft-fg)]">
          {msg}
        </p>
      )}

      <button
        type="button"
        onClick={enviar}
        disabled={!file || !data || pending}
        className="h-10 rounded-full bg-[var(--color-navy-700)] px-6 text-[13px] font-medium text-white transition-opacity disabled:opacity-40"
      >
        {pending ? 'Enviando…' : 'Subir pro Dashboard'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Adicionar o grupo "Nutrimax" na navegação**

Abrir `src/app/painel/nav.tsx`. Localizar o array `GROUPS: Group[]` (tem hoje os grupos
`KPI` e `Cozinha`) e adicionar um novo grupo logo depois do grupo `KPI`, reusando os ícones
`TableIcon` e `ChartBar` que já estão importados no arquivo (mesmos usados no grupo `KPI`):

```ts
  {
    label: 'Nutrimax',
    Icon: TableIcon,
    children: [
      { href: '/painel/nutrimax/gerar', label: 'Gerar KPI', Icon: TableIcon },
      { href: '/painel/nutrimax/inserir', label: 'Inserir KPI', Icon: TableIcon },
      { href: '/painel/nutrimax/dashboard', label: 'Dashboard', Icon: ChartBar },
    ],
  },
```

- [ ] **Step 3: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos. Se `TableIcon`/`ChartBar` não existirem com esses nomes exatos em
`nav.tsx`, ajustar pro nome real do import já presente no arquivo (conferir o import no topo
do arquivo antes de aplicar o Step 2).

- [ ] **Step 4: Smoke test fim-a-fim com o PDF real, via navegador**

Servidor de dev já deve estar rodando (`npm run dev`). Usar chrome-devtools-mcp logado como
admin (mesmo processo já usado nesta sessão pra testar a feature de RBAC):

1. Navegar pra `/painel/nutrimax/gerar`.
2. Preencher data `2026-07-01`, subir `/Users/joaquimsalles/Downloads/Romaneio 01-07.pdf`.
3. Clicar "Gerar e baixar XLSX" — confirmar que baixa um arquivo sem erro 422/500.
4. Navegar pra `/painel/nutrimax/inserir`, subir o XLSX baixado no passo 3, mesma data.
5. Confirmar mensagem "N clientes inseridos pra 2026-07-01".
6. Verificar direto no banco:

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
source <(grep -v '^#' .env.local | sed 's/^/export /')
curl -s -I "https://luhwpsckvbctxynifryk.supabase.co/rest/v1/kpi_nutrimax_entradas?select=id&data=eq.2026-07-01" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Prefer: count=exact" -H "Range: 0-0" | grep -i content-range
```

Expected: `content-range: 0-999/N` com N > 0 (bate com o total de clientes do romaneio de
01/07 — na inspeção anterior desse PDF, na casa de milhares de linhas de NF, um número por
aí de clientes distintos).

7. **Limpeza**: apagar os dados de teste depois de confirmar (é dado de smoke test, não real):

```bash
curl -s -X DELETE "https://luhwpsckvbctxynifryk.supabase.co/rest/v1/kpi_nutrimax_entradas?data=eq.2026-07-01" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Prefer: return=minimal" -w "\nHTTP status: %{http_code}\n"
```

- [ ] **Step 5: Commit**

```bash
git add src/app/painel/nutrimax/inserir/page.tsx src/app/painel/nav.tsx
git commit -m "feat(kpi-nutrimax): tela de upload + navegação"
```

---

### Task 11: UI — Dashboard Nutrimax

**Files:**
- Create: `src/app/painel/nutrimax/dashboard/page.tsx`

**Interfaces:**
- Consumes: tabela `kpi_nutrimax_entradas` (Task 6), `createServiceClient` (`src/lib/supabase/service.ts`, já existe).

- [ ] **Step 1: Implementar o dashboard (v1 — visão geral + tabela por carga)**

Replica as seções centrais do dashboard do Benassi (taxa de entrega, total, ranking) trocando
a dimensão rede→loja por carga→placa. Gráficos mais ricos do Benassi (heatmap dia×rede, mapa
de risco, evolução temporal) ficam de fora deste v1 — anotar como próximo passo, não bloqueia
o uso do dashboard.

```tsx
// src/app/painel/nutrimax/dashboard/page.tsx
import { createServiceClient } from '@/lib/supabase/service'

function hojeBR(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

type LinhaBanco = {
  carga: string
  destino: string
  placa: string
  motorista: string | null
  nf: string
  cliente_nome: string
  status: 'entregue' | 'pendente'
}

export default async function NutrimaxDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>
}) {
  const sp = await searchParams
  const data = sp.data && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : hojeBR()

  const svc = createServiceClient()
  const { data: entradas } = await svc
    .from('kpi_nutrimax_entradas')
    .select('carga, destino, placa, motorista, nf, cliente_nome, status')
    .eq('data', data)

  const linhas = (entradas ?? []) as LinhaBanco[]
  const total = linhas.length
  const entregues = linhas.filter(l => l.status === 'entregue').length
  const pct = total > 0 ? Math.round((entregues / total) * 100) : 0

  const porCarga = new Map<string, { destino: string; placa: string; motorista: string | null; total: number; entregues: number }>()
  for (const l of linhas) {
    const atual = porCarga.get(l.carga) ?? { destino: l.destino, placa: l.placa, motorista: l.motorista, total: 0, entregues: 0 }
    atual.total += 1
    if (l.status === 'entregue') atual.entregues += 1
    porCarga.set(l.carga, atual)
  }
  const cargasOrdenadas = [...porCarga.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-8 px-5 py-8">
      <header>
        <span className="text-overline">Nutrimax</span>
        <h1 className="mt-1 text-display text-[28px] leading-none text-[var(--color-fg)]">Dashboard</h1>
      </header>

      <form className="flex items-center gap-2">
        <input
          type="date" name="data" defaultValue={data}
          className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-[13px] text-[var(--color-fg)] outline-none"
        />
        <button type="submit" className="h-9 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 text-[13px]">
          Ver
        </button>
      </form>

      {total === 0 ? (
        <p className="text-[13px] text-[var(--color-fg-muted)]">
          Nenhum dado pra {data}. Gere e suba o KPI em &quot;Gerar KPI&quot; → &quot;Inserir KPI&quot;.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <p className="text-overline">Taxa de entrega</p>
              <p className="mt-1 text-[28px] font-semibold text-[var(--color-fg)]">{pct}%</p>
            </div>
            <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <p className="text-overline">Total de clientes</p>
              <p className="mt-1 text-[28px] font-semibold text-[var(--color-fg)]">{total}</p>
            </div>
            <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <p className="text-overline">Rotas no dia</p>
              <p className="mt-1 text-[28px] font-semibold text-[var(--color-fg)]">{porCarga.size}</p>
            </div>
          </div>

          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wide text-[var(--color-fg-subtle)]">
                <th className="py-2 pr-3">Carga</th>
                <th className="pr-3">Destino</th>
                <th className="pr-3">Placa</th>
                <th className="pr-3">Motorista</th>
                <th className="pr-3">Entregues</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {cargasOrdenadas.map(([carga, r]) => (
                <tr key={carga} className="border-b border-[var(--color-border)] text-[var(--color-fg)]">
                  <td className="py-2 pr-3 text-numeric">{carga}</td>
                  <td className="pr-3">{r.destino}</td>
                  <td className="pr-3 text-numeric">{r.placa}</td>
                  <td className="pr-3">{r.motorista ?? '—'}</td>
                  <td className="pr-3 text-numeric">{r.entregues}/{r.total}</td>
                  <td className="text-numeric">{r.total > 0 ? Math.round((r.entregues / r.total) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Smoke test manual**

Repetir o upload de teste da Task 10 (Steps 4-6, mesmo PDF/data), navegar pra
`/painel/nutrimax/dashboard?data=2026-07-01` e conferir visualmente: cards com taxa/total/
rotas preenchidos, tabela com uma linha por carga. Depois, limpar de novo com o mesmo DELETE
da Task 10.

- [ ] **Step 4: Commit**

```bash
git add src/app/painel/nutrimax/dashboard/page.tsx
git commit -m "feat(kpi-nutrimax): dashboard v1 (visão geral + tabela por rota)"
```

---

## Divergências da spec que valem uma segunda checada

1. **"Mesma tela" vs. seção separada**: a spec dizia "mesma tela, eu jogo lá a escala, o
   sistema identifica o que é". Esse plano implementa uma seção `/painel/nutrimax/*` separada
   (mesmo padrão do módulo `Cozinha`, que já é o precedente do repo pra domínio de cliente
   diferente) em vez de detectar o formato do arquivo dentro de `/painel/kpi/simples`. Motivo:
   os pipelines são completamente diferentes por baixo (tabelas diferentes, sem conceito de
   rede/loja, sem template de escala) — forçar os dois fluxos numa tela só criaria uma
   ramificação de lógica grande dentro de um arquivo que já tem 2000 linhas
   (`kpi/simples/page.tsx`). Se ainda assim preferir uma tela só, é um ajuste de UI puro (troca
   os `Create` das Tasks 9/10 por edições em `kpi/simples/page.tsx` com detecção de formato) —
   o motor (Tasks 1-8) não muda.
2. **Sem tabela de histórico de gerações** (`kpi_nutrimax_geracoes`, cogitada na spec): cortada
   do v1 porque nada consome ainda — pode ser adicionada depois sem migração destrutiva.

## Fora de escopo deste plano (próximos passos, não bloqueiam o v1)

- Parser da Escala de Rota (peso/ENT/NF por carga) — hoje não é lido; o cross-check de
  "cobertura" (quantas cargas do dia realmente entraram no romaneio) fica pra uma iteração
  futura, seguindo o mesmo espírito do bug corrigido no Benassi (avisar quando faltar dado).
- Gráficos mais ricos no dashboard (heatmap dia×rota, evolução temporal, ranking de motorista,
  mapa de risco) — o v1 cobre taxa de entrega + tabela por carga, que já é suficiente pra
  operar.
- Sync do repo definitivo (`KPI transmonseg`) — aplicar o mesmo diff lá ao final, do jeito que
  já foi feito nas features anteriores desta sessão (os dois repos estão no mesmo commit).
