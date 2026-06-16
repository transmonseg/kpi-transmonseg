# Funil placa-por-placa + saída em rota + horário exato — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Usar a API do Unitrac como gabarito por placa para (1) mostrar a saída de base mesmo "em rota", (2) distinguir "sem rastreador" de "desatualizado", e (3) corrigir horários que o PDF erra (drive-by).

**Architecture:** Três funções puras testáveis (classificação de placa, saída de base conhecida, horário-gabarito) + um novo status `DESATUALIZADO`, fiados na rota `/api/kpi/simples` e no `dashboard-api-fonte.ts` de forma best-effort (API fora = comportamento de hoje). Tela + XLSX + dashboard ficam coerentes.

**Tech Stack:** Next.js (custom), TypeScript, Vitest, exceljs. API Unitrac via `src/lib/unitrac-api/`.

## Global Constraints

- API SEMPRE best-effort: todo acesso à API em try/catch + guarda por vazio. API fora do ar = funil não roda, KPI sai pelo PDF como hoje. Nenhum caminho de API derruba a geração.
- Convenção de tempo: BRT mascarado como UTC (`Date.UTC` / `getUTCHours`). Nunca `getHours` local.
- "Tem rastreador" = placa na frota da API (`buscarFrota`). "Sem rastreador" = NÃO está na frota da API. Nunca chamar desatualizado de "sem rastreador".
- XLSX reaproveita o modelo oficial (`gerador-kpi.ts`), nunca remonta.
- Sem travessão (—) em código/legenda do cliente.
- Limiar inicial de "desatualizado": último GPS não é do dia da geração (sem transmitir hoje). Tunável via constante.

---

### Task 1: `classificarPlacaViaApi` (função pura)

Classifica uma placa que NÃO apareceu no relatório Unitrac, usando frota + posições da API.

**Files:**
- Create: `src/lib/unitrac-api/classificar-placa.ts`
- Test: `src/lib/unitrac-api/classificar-placa.test.ts`

**Interfaces:**
- Consumes: `MapaPosicoes` de `./posicoes` (`{ [placaNorm]: { atraso, datagps, ... } }`), `FrotaVeiculo[]` de `./frota` (`{ placaNorm }`).
- Produces: `classificarPlacaViaApi(placaNorm: string, frotaPlacas: Set<string>, posicoes: MapaPosicoes, dataRef: string): ClassificacaoPlaca` onde `ClassificacaoPlaca = 'sem_rastreador' | 'desatualizado' | 'rastreado'`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { classificarPlacaViaApi } from './classificar-placa'

const pos = (datagps: string, atraso = 0) => ({ cv: '1', velocidade: 0, ignicao: false, datagps, atraso })

describe('classificarPlacaViaApi', () => {
  const data = '2026-06-16'
  it('não está na frota da API → sem_rastreador', () => {
    expect(classificarPlacaViaApi('ABC1D23', new Set(), {}, data)).toBe('sem_rastreador')
  })
  it('na frota + transmitiu hoje → rastreado', () => {
    const frota = new Set(['ABC1D23'])
    expect(classificarPlacaViaApi('ABC1D23', frota, { ABC1D23: pos('16/06/2026 08:10:00') }, data)).toBe('rastreado')
  })
  it('na frota + último GPS de outro dia → desatualizado', () => {
    const frota = new Set(['ABC1D23'])
    expect(classificarPlacaViaApi('ABC1D23', frota, { ABC1D23: pos('10/06/2026 08:10:00') }, data)).toBe('desatualizado')
  })
  it('na frota + sem posição nenhuma → desatualizado (não transmite)', () => {
    expect(classificarPlacaViaApi('ABC1D23', new Set(['ABC1D23']), {}, data)).toBe('desatualizado')
  })
  it('usa variantes Mercosul/OCR pra achar na frota', () => {
    // placa antiga na escala, Mercosul na frota
    const frota = new Set(['FTV6F42'])
    expect(classificarPlacaViaApi('FTV6542', frota, { FTV6F42: pos('16/06/2026 08:00:00') }, data)).toBe('rastreado')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/unitrac-api/classificar-placa.test.ts`
Expected: FAIL ("classificarPlacaViaApi is not a function").

- [ ] **Step 3: Write minimal implementation**

```ts
import type { MapaPosicoes } from './posicoes'
import { variantesPlaca } from '@/lib/kpi/matcher'

export type ClassificacaoPlaca = 'sem_rastreador' | 'desatualizado' | 'rastreado'

/** Data BR "DD/MM/YYYY HH:MM:SS" → "YYYY-MM-DD" (parte da data). */
function diaDoDatagps(datagps: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(datagps.trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/**
 * Classifica uma placa da escala que NÃO foi achada no relatório Unitrac:
 *  - não está na frota da API → SEM RASTREADOR (não tem equipamento)
 *  - está na frota + sem transmitir no dia (última posição de outro dia ou ausente)
 *    → DESATUALIZADO (tem equipamento, precisa manutenção)
 *  - está na frota + transmitiu no dia → RASTREADO (tem rastreador ok, cai no status normal)
 * Usa variantes (Mercosul/OCR) pra casar placa antiga da escala com a da frota.
 */
export function classificarPlacaViaApi(
  placaNorm: string,
  frotaPlacas: Set<string>,
  posicoes: MapaPosicoes,
  dataRef: string,
): ClassificacaoPlaca {
  const variantes = [placaNorm, ...variantesPlaca(placaNorm)]
  const naFrota = variantes.some(v => frotaPlacas.has(v))
  if (!naFrota) return 'sem_rastreador'
  const pos = variantes.map(v => posicoes[v]).find(Boolean)
  if (!pos || !pos.datagps) return 'desatualizado'
  const dia = diaDoDatagps(pos.datagps)
  return dia === dataRef ? 'rastreado' : 'desatualizado'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/unitrac-api/classificar-placa.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Export from the barrel**

Modify `src/lib/unitrac-api/index.ts`: add `export * from './classificar-placa'` after the other `export *` lines.

- [ ] **Step 6: Commit**

```bash
git add src/lib/unitrac-api/classificar-placa.ts src/lib/unitrac-api/classificar-placa.test.ts src/lib/unitrac-api/index.ts
git commit -m "feat(unitrac-api): classificarPlacaViaApi (sem rastreador x desatualizado x rastreado)"
```

---

### Task 2: Status `DESATUALIZADO` em `status-rota.ts`

Novo status + sinal `placaDesatualizadaApi` que o `derivarStatus` consome quando a placa não está no relatório mas a API diz que é desatualizada.

**Files:**
- Modify: `src/lib/kpi/status-rota.ts`
- Test: `src/lib/kpi/status-rota.test.ts` (adicionar describe)

**Interfaces:**
- Consumes: nada novo (sinal booleano no `DadosStatusRota`).
- Produces: `StatusRota` ganha `'DESATUALIZADO'`; `DadosStatusRota` ganha `placaDesatualizadaApi?: boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// em src/lib/kpi/status-rota.test.ts
import { derivarStatus, STATUS_LABEL, TIER_DE_STATUS } from './status-rota'

describe('DESATUALIZADO', () => {
  const baseSemGps = { temGps: false, ficouNaBase: false, paradas: [] as any[] }
  it('placa fora do relatório + desatualizada na API → DESATUALIZADO', () => {
    const r = derivarStatus({ ...baseSemGps, placaDesatualizadaApi: true })
    expect(r.status).toBe('DESATUALIZADO')
  })
  it('placa fora do relatório sem sinal de API → continua SEM_RASTREADOR', () => {
    const r = derivarStatus({ ...baseSemGps })
    expect(r.status).toBe('SEM_RASTREADOR')
  })
  it('tem label e tier', () => {
    expect(STATUS_LABEL.DESATUALIZADO).toBe('Desatualizado')
    expect(TIER_DE_STATUS.DESATUALIZADO).toBe('conferir')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/kpi/status-rota.test.ts -t DESATUALIZADO`
Expected: FAIL (status `SEM_RASTREADOR`, e propriedades faltando).

- [ ] **Step 3: Implement**

Em `src/lib/kpi/status-rota.ts`:

1. Linha 1, adicionar `'DESATUALIZADO'` ao union:
```ts
export type StatusRota = 'ENTREGUE' | 'ENTREGUE_GEO' | 'MUDOU_DE_ROTA' | 'SEM_RASTREADOR' | 'DESATUALIZADO' | 'NAO_SAIU_DA_BASE' | 'NAO_FOI_AO_CLIENTE' | 'FORA_DE_BASE'
```

2. No `DadosStatusRota` (antes do fechamento `}` na linha ~73), adicionar:
```ts
  /** A placa não está no relatório Unitrac, mas a API diz que ela TEM rastreador
   *  e está sem transmitir (último GPS não é de hoje) → desatualizado, precisa
   *  manutenção. Não é "sem rastreador" (que é não ter equipamento). */
  placaDesatualizadaApi?: boolean
```

3. Em `derivarStatusBase`, dentro do bloco `if (!d.temGps) {` (linha 89), ANTES do `if (d.placaDivergeUnitrac)`:
```ts
    // A placa não está no relatório, mas a API confirma que TEM rastreador e está
    // sem transmitir hoje → desatualizado/manutenção (não é "sem rastreador").
    if (d.placaDesatualizadaApi) {
      return { status: 'DESATUALIZADO', revisar: true, motivoRevisao: 'Tem rastreador na frota do Unitrac, mas está sem transmitir hoje (último GPS de outro dia). Solicitar manutenção do rastreador.' }
    }
```

4. `NATUREZA_DE_STATUS` (linha 181): adicionar `DESATUALIZADO: 'dado',`.

5. `STATUS_LABEL` (linha 256): adicionar `DESATUALIZADO: 'Desatualizado',`.

6. `TIER_DE_STATUS` (linha 273): adicionar `DESATUALIZADO: 'conferir',`.

7. `MOTIVO_CURTO` (linha 305): adicionar `DESATUALIZADO: 'Tem rastreador, mas sem transmitir hoje — precisa manutenção.',`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/kpi/status-rota.test.ts`
Expected: PASS (todo o arquivo, incl. os novos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi/status-rota.ts src/lib/kpi/status-rota.test.ts
git commit -m "feat(kpi): status DESATUALIZADO (tem rastreador, sem transmitir hoje)"
```

---

### Task 3: `saidaBaseConhecida` — em rota mostra a saída (caso FHO)

A `saidaBaseSeEmRota` atual ainda zera a saída quando a última BASE foi <15min antes do corte e não há parada depois (caso FHO: BASE 07:55→08:20, relatório cortou 08:30). Para EXIBIÇÃO de linha "em rota", queremos a saída da última BASE sempre que a placa comprovadamente operou no dia.

**Files:**
- Modify: `src/lib/kpi/gerar-kpi-local.ts`
- Test: `src/lib/kpi/gerar-kpi-local.test.ts`

**Interfaces:**
- Produces: `saidaBaseConhecida(paradas: ReadonlyArray<{ classificacao: string; chegada: Date; saida: Date | null }>): Date | null` — saída da última parada BASE, se a placa tem qualquer parada FORA_BASE/LOJA no dia (prova de operação). Sem guard de corte.

- [ ] **Step 1: Write the failing test**

```ts
// em src/lib/kpi/gerar-kpi-local.test.ts, importar saidaBaseConhecida
import { saidaBaseConhecida } from './gerar-kpi-local'

describe('saidaBaseConhecida (FHO: em rota mostra a saída)', () => {
  const d = (h: number, m: number) => new Date(Date.UTC(2026, 5, 16, h, m))
  it('FHO: operou (LOJA 06:01), voltou e saiu de novo 08:20 → 08:20 mesmo perto do corte', () => {
    const paradas = [
      { classificacao: 'BASE', chegada: d(4, 38), saida: d(5, 10) },
      { classificacao: 'LOJA', chegada: d(6, 1), saida: d(6, 59) },
      { classificacao: 'BASE', chegada: d(7, 55), saida: d(8, 20) },
    ]
    expect(saidaBaseConhecida(paradas)).toEqual(d(8, 20))
  })
  it('só ficou na base o dia todo → null (não operou)', () => {
    const paradas = [{ classificacao: 'BASE', chegada: d(0, 5), saida: d(8, 20) }]
    expect(saidaBaseConhecida(paradas)).toBeNull()
  })
  it('sem parada nenhuma → null', () => {
    expect(saidaBaseConhecida([])).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/kpi/gerar-kpi-local.test.ts -t saidaBaseConhecida`
Expected: FAIL ("saidaBaseConhecida is not a function").

- [ ] **Step 3: Implement**

Em `src/lib/kpi/gerar-kpi-local.ts`, logo após `saidaBaseSeEmRota`:

```ts
/**
 * Saída de base CONHECIDA pra exibição de linha "em rota": saída da última parada
 * BASE, desde que a placa tenha QUALQUER parada FORA_BASE/LOJA no dia (prova de que
 * operou). Sem guard de corte — regra do operador: "em rota mostra tudo que já sabe".
 * Caso FHO-5F88: relatório cortou logo após a saída de base, mas ela é fato.
 */
export function saidaBaseConhecida(
  paradas: ReadonlyArray<{ classificacao: string; chegada: Date; saida: Date | null }>,
): Date | null {
  if (paradas.length === 0) return null
  const operou = paradas.some(p => p.classificacao === 'FORA_BASE' || p.classificacao === 'LOJA')
  if (!operou) return null
  const bases = paradas.filter(p => p.classificacao === 'BASE').sort((a, b) => a.chegada.getTime() - b.chegada.getTime())
  const u = bases[bases.length - 1]
  return u ? (u.saida ?? u.chegada) : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/kpi/gerar-kpi-local.test.ts`
Expected: PASS (todo o arquivo).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi/gerar-kpi-local.ts src/lib/kpi/gerar-kpi-local.test.ts
git commit -m "feat(kpi): saidaBaseConhecida — em rota mostra a saída de base (caso FHO)"
```

---

### Task 4: `horarioEntregaGabarito` — corrige drive-by do PDF

Quando a API confirma a entrega na mesma loja e o horário do PDF diverge muito (drive-by), usa o horário da parada consolidada da API.

**Files:**
- Create: `src/lib/kpi/horario-gabarito.ts`
- Test: `src/lib/kpi/horario-gabarito.test.ts`

**Interfaces:**
- Produces: `horarioEntregaGabarito(chegadaPdf: Date, chegadaApi: Date | null, toleranciaMin = 15): Date` — devolve a chegada da API quando ela existe E diverge mais que `toleranciaMin` do PDF; senão a do PDF.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { horarioEntregaGabarito } from './horario-gabarito'

const d = (h: number, m: number) => new Date(Date.UTC(2026, 5, 16, h, m))

describe('horarioEntregaGabarito', () => {
  it('divergência grande (drive-by) → usa a API', () => {
    // BBH1C94: PDF 05:34 vs API 06:54
    expect(horarioEntregaGabarito(d(5, 34), d(6, 54))).toEqual(d(6, 54))
  })
  it('divergência pequena (≤15min) → mantém o PDF', () => {
    expect(horarioEntregaGabarito(d(7, 25), d(7, 18))).toEqual(d(7, 25))
  })
  it('sem horário da API → mantém o PDF', () => {
    expect(horarioEntregaGabarito(d(5, 34), null)).toEqual(d(5, 34))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/kpi/horario-gabarito.test.ts`
Expected: FAIL ("horarioEntregaGabarito is not a function").

- [ ] **Step 3: Implement**

```ts
/**
 * Horário de entrega pelo GABARITO da API. O relatório Unitrac (PDF) às vezes marca
 * uma passagem rápida (drive-by) perto da loja como "chegada", em vez da parada real
 * de entrega. Quando a API confirma a entrega na mesma loja e o horário diverge mais
 * que `toleranciaMin`, a API ganha (parada consolidada por geofence + duração).
 * Divergência pequena → mantém o PDF (fonte primária da Tia Érica).
 */
export function horarioEntregaGabarito(chegadaPdf: Date, chegadaApi: Date | null, toleranciaMin = 15): Date {
  if (!chegadaApi) return chegadaPdf
  const diffMin = Math.abs(chegadaApi.getTime() - chegadaPdf.getTime()) / 60_000
  return diffMin > toleranciaMin ? chegadaApi : chegadaPdf
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/kpi/horario-gabarito.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi/horario-gabarito.ts src/lib/kpi/horario-gabarito.test.ts
git commit -m "feat(kpi): horarioEntregaGabarito — usa horário da API quando PDF marca drive-by"
```

---

### Task 5: Fiar o funil na rota `/api/kpi/simples`

Classifica placas não-achadas, marca `placaDesatualizadaApi`, usa `saidaBaseConhecida` pra saída em rota, e `horarioEntregaGabarito` pra corrigir a chegada quando a API confirma.

**Files:**
- Modify: `src/app/api/kpi/simples/route.ts`

**Interfaces:**
- Consumes: `classificarPlacaViaApi`, `saidaBaseConhecida`, `horarioEntregaGabarito` (Tasks 1, 3, 4); `buscarFrota`, `buscarPosicoes`, `posicoesApi` (já existem).

- [ ] **Step 1: Importes**

No topo de `route.ts`, adicionar aos imports de `@/lib/unitrac-api`: `classificarPlacaViaApi`. De `@/lib/kpi/gerar-kpi-local`: `saidaBaseConhecida`. Criar import `import { horarioEntregaGabarito } from '@/lib/kpi/horario-gabarito'`.

- [ ] **Step 2: Set da frota da API**

No bloco try do merge (onde `frotaApi` é montado, ~linha 409), depois de `pontosApi = pontos`, guardar o set de placas da frota num `let frotaApiPlacas = new Set<string>()` hoistado junto de `pontosApi`/`posicoesApi`, preenchendo `frotaApiPlacas = new Set(frotaApi.map(v => v.placaNorm))`.

- [ ] **Step 3: Classificar e marcar desatualizado**

No loop que monta o `preview` (onde `derivarStatus` é chamado), antes de chamar `derivarStatus`, calcular:
```ts
const semParada = rota.paradas.length === 0 && !placaRastreada(rota.placa_norm)
const classApi = semParada && rota.placa_norm
  ? classificarPlacaViaApi(rota.placa_norm, frotaApiPlacas, posicoesApi, data)
  : 'rastreado'
```
e passar `placaDesatualizadaApi: classApi === 'desatualizado'` no objeto do `derivarStatus`.

- [ ] **Step 4: Saída em rota (FHO)**

No mesmo loop, onde hoje calcula `saidaParcialPreview`/`saida_cd_fmt`, trocar a fonte da saída quando em rota por `saidaBaseConhecida`. Construir a lista de paradas da placa a partir do `paradasIndex` (já existe) e usar:
```ts
const saidaEmRota = saidaBaseConhecida(paradasIndex.get(rota.placa_unitrac ?? rota.placa_norm ?? '') ?? [])
```
No `saida_cd_fmt`, usar `fmtHoraBRT(rota.saida_cd) ?? fmtHoraBRT(saidaEmRota) ?? (saidaParcialPreview ? fmtHoraBRT(saidaParcialPreview) : null)`. Aplicar a mesma saída na linha do XLSX (`l.saida_cd`) quando não houver entrega e a linha for relatório cedo.

- [ ] **Step 5: Horário-gabarito na entrega**

No bloco de confirmação por coordenada (Task de hoje, `confirmaEntregaViaApi`) e quando há parada do PDF + parada da API na mesma loja, ajustar a `chegada` da parada casada com `horarioEntregaGabarito(chegadaPdf, chegadaApi)`. Aplicar onde a rota recebe `rota.paradas[0].chegada`.

- [ ] **Step 6: Verificar tipos e teste**

Run: `npx tsc --noEmit -p tsconfig.json` (esperado: exit 0, ignorar `.next`).
Run: `npx vitest run` (esperado: 100% verde).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/kpi/simples/route.ts
git commit -m "feat(kpi): funil via API na rota normal (desatualizado, saída em rota, horário-gabarito)"
```

---

### Task 6: Legenda `DESATUALIZADO` no XLSX do cliente

`legendaSlot` passa a devolver "DESATUALIZADO" quando o status é `DESATUALIZADO`.

**Files:**
- Modify: `src/lib/kpi/gerador-kpi.ts` (função `legendaSlot`, ~linha 178)
- Test: `src/lib/kpi/gerador-kpi.test.ts`

**Interfaces:**
- Consumes: `KpiLinha` ganha (se ainda não tiver) o status efetivo. `legendaSlot` lê os flags já existentes; adicionar leitura do novo status via um flag `placa_desatualizada?: boolean` em `KpiLinha`.

- [ ] **Step 1: Adicionar flag em KpiLinha**

Em `src/lib/types/kpi.ts`, adicionar `placa_desatualizada?: boolean` à interface `KpiLinha` (e `LinhaParaKpi`, se forem distintas).

- [ ] **Step 2: Write the failing test**

```ts
// em gerador-kpi.test.ts
import { legendaSlot } from './gerador-kpi'
it('placa desatualizada → DESATUALIZADO (não SEM RASTREADOR)', () => {
  const linha = { chd_loja_1: null, placa_rastreada: false, placa_desatualizada: true } as any
  expect(legendaSlot(linha)).toBe('DESATUALIZADO')
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/kpi/gerador-kpi.test.ts -t desatualizada`
Expected: FAIL (volta "SEM RASTREADOR").

- [ ] **Step 4: Implement**

Em `legendaSlot` (gerador-kpi.ts), logo no começo (depois de `if (c.chd_loja_1 !== null) return null`):
```ts
  if (c.placa_desatualizada) return 'DESATUALIZADO'
```

- [ ] **Step 5: Setar o flag na rota**

Em `route.ts`, no map de `linhas` (LinhaParaKpi), setar `l.placa_desatualizada = classApi === 'desatualizado'` (reusar o `classApi` da Task 5; computar por linha).

- [ ] **Step 6: Run test + tsc**

Run: `npx vitest run src/lib/kpi/gerador-kpi.test.ts` (esperado: PASS).
Run: `npx tsc --noEmit -p tsconfig.json` (esperado: exit 0).

- [ ] **Step 7: Commit**

```bash
git add src/lib/kpi/gerador-kpi.ts src/lib/types/kpi.ts src/app/api/kpi/simples/route.ts src/lib/kpi/gerador-kpi.test.ts
git commit -m "feat(kpi): legenda DESATUALIZADO no XLSX do cliente"
```

---

### Task 7: Tela (preview) — badge DESATUALIZADO + saída em rota

**Files:**
- Modify: `src/app/painel/kpi/simples/page.tsx`

**Interfaces:**
- Consumes: `PreviewLinha.status` agora pode ser `'DESATUALIZADO'`; o route já manda `saida_cd_fmt` preenchido em rota.

- [ ] **Step 1: Tipo**

No `type PreviewLinha` da page, garantir que `status: StatusRota` cobre `DESATUALIZADO` (vem do import de `status-rota`, então automático). Nada a mudar se usa o tipo importado.

- [ ] **Step 2: Badge**

No status cell (onde hoje trata `semComunicacaoMin` e `situacaoViva`), adicionar antes do `StatusBadge` fallback: quando `linha.status === 'DESATUALIZADO'`, renderizar badge âmbar "Desatualizado · manutenção" com tooltip "Tem rastreador na frota do Unitrac, mas sem transmitir hoje. Solicitar manutenção." O `StatusBadge` já pega a cor pelo tier (conferir) via `tierEfetivo`, então pode bastar deixar o `StatusBadge` cuidar; conferir visualmente.

- [ ] **Step 3: Ver rodando**

Run: `npm run build` (esperado: exit 0, rota `/painel/kpi/simples` na lista).
Abrir `/painel/kpi/simples`, gerar com a escala+relatório do dia, confirmar visual: FHO mostra "Em rota · 8:20"; placa desatualizada mostra "Desatualizado", não "Sem rastreador".

- [ ] **Step 4: Commit**

```bash
git add src/app/painel/kpi/simples/page.tsx
git commit -m "feat(kpi): preview mostra Desatualizado e saída em rota"
```

---

### Task 8: Dashboard — categoria desatualizado

O `dashboard-api-fonte.ts` reusa `derivarStatus`; precisa receber o sinal `placaDesatualizadaApi` igual à rota, e o dashboard contar "sem rastreador" só pra quem não está na frota da API.

**Files:**
- Modify: `src/lib/kpi/dashboard-api-fonte.ts`

- [ ] **Step 1: Classificar no dashboard**

No loop de `rotas` do `gerarDiaApi` (onde chama `derivarStatus`), reusar `classificarPlacaViaApi` (importar de `@/lib/unitrac-api`) com a frota/posições já buscadas, e passar `placaDesatualizadaApi`.

- [ ] **Step 2: tsc + teste**

Run: `npx tsc --noEmit -p tsconfig.json` (exit 0).
Run: `npx vitest run` (verde).

- [ ] **Step 3: Commit**

```bash
git add src/lib/kpi/dashboard-api-fonte.ts
git commit -m "feat(dashboard): categoria desatualizado via funil da API"
```

---

### Task 9: Verificação E2E nos casos reais

Prova que os 3 bugs sumiram nos dados reais (FHO, BBH1C94, placa desatualizada) e que a API caída não quebra.

**Files:**
- Modify: `scripts/dev/e2e-verif.mts` (estender) ou criar `scripts/dev/verif-funil.mts`

- [ ] **Step 1: Rodar o E2E (API no ar + caída)**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsx scripts/dev/e2e-verif.mts`
Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsx scripts/dev/e2e-verif.mts --apidown`
Expected: os dois "PASS: gerou tudo sem erro".

- [ ] **Step 2: Conferir os casos**

Confirmar (via diag-manha.mts ou script novo, corte da manhã): FHO mostra saída 8:20; BBH1C94/CEJ3426/GBG5C11 com chegada batendo a API (±5min); placas fora da frota = sem rastreador; na frota sem transmitir = desatualizado.

- [ ] **Step 3: Suíte + build final**

Run: `npx vitest run` (100% verde).
Run: `npm run build` (exit 0).

- [ ] **Step 4: Commit**

```bash
git add scripts/dev/
git commit -m "test(kpi): verificação E2E do funil placa-por-placa + horários"
```

---

## Self-Review

**Spec coverage:** funil (Tasks 1,2,5,8) ✓; em-rota saída/FHO (Tasks 3,5,7) ✓; horário-gabarito (Tasks 4,5) ✓; XLSX (Task 6) ✓; tela (Task 7) ✓; dashboard (Task 8) ✓; resiliência (best-effort mantido nas Tasks 5/8 + Task 9 --apidown) ✓; critérios de aceite (Task 9) ✓.

**Placeholders:** Task 5 e 7 descrevem modificações em arquivos grandes existentes sem repetir o arquivo todo; os pontos de inserção estão referenciados por âncora (nome de variável/função) por serem edições em código já lido nesta sessão. Código novo (Tasks 1-4, 6) está completo.

**Type consistency:** `ClassificacaoPlaca` ('sem_rastreador'|'desatualizado'|'rastreado'), `placaDesatualizadaApi` (DadosStatusRota), `placa_desatualizada` (KpiLinha), `DESATUALIZADO` (StatusRota) — consistentes entre tasks.
