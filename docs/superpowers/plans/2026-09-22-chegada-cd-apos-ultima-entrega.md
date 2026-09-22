# CHEGADA CD = primeira volta à base depois da última entrega — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando o caminhão volta pra base depois da última entrega e sai de novo sem entregar nada, essa saída extra não pode inflar CHEGADA CD, TEMPO OPERAÇÃO e KM PERCORRIDO do KPI.

**Architecture:** O monitoramento (`/api/kpi/base-horarios`) aceita um novo campo opcional `fimRotaPorPlaca` (instante real UTC da última entrega por placa); quando presente para uma placa, `chegadaBase` passa a ser a PRIMEIRA entrada na base a partir desse instante (e o KM é calculado na janela saída→essa chegada). O KPI, depois de montar as visitas, calcula o fim da rota de cada placa (maior entre a saída da última visita GPS e o `feitoISO` dos alvos confirmados); só para as placas em que existe uma parada BASE depois desse fim e antes da `chegadaBase` atual com folga > 30 min, faz uma 2ª chamada leve à ponte com `fimRotaPorPlaca` e substitui saída/chegada/km. Se o caminhão entregou algo depois de voltar (2ª viagem), o fim da rota já inclui essa entrega e nada muda.

**Tech Stack:** TypeScript, Vitest, Next.js route handlers (dois repos: KPI e monitoramento).

**Spec:** conversa de 22/09/2026 com áudios da Ana no grupo KPI AJUSTES: "mesmo que ele tenha saído, ele já regressou da empresa, ele terminou a rota. Então não deveria pegar essa saída como a rota, ou uma possível segunda viagem, caso fosse necessário." Caso real: RBG5G18 21/09 — 2 NFs (última saída da loja 13:59), voltou à base 15:02, saiu 16:28–19:14 sem entrega, KPI marcou CHEGADA CD 19:34 / 13h11 / 88,2 km; certo = 15:02 / 8h39. Medido em 21/09: 1 de 60 placas afetada (>30 min).

## Global Constraints

- Trailer de commit EXATO ao final: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` e `Claude-Session: https://claude.ai/code/session_01ATqZgryoxRsTeXXM3HR8M7`
- Repos: KPI (`/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg`, espelho `KPI TEMP`) e monitoramento (`/Users/joaquimsalles/Projects/Transmonseg/monitoramento/MONITORAMENTO transmonseg`, espelho `MONITORAMENTO TEMP`). Sempre espelhar e dar push nos pares juntos.
- Convenção de horário no KPI: tudo que sai de `buscarHorariosBase` (saidaBase, chegadaBase, paradas, visitas) é "dígitos de Brasília + Z falso" (`paraBrtMascaradoComoUtc`). `feitoISO` da Unitrac também são dígitos de Brasília (parse = dígitos + `Z`). A ponte (monitoramento) trabalha em UTC REAL. Na fronteira: mascarado → real = +3 h.
- Limiar de ajuste: `FOLGA_VOLTA_EXTRA_MIN = 30` minutos.
- Campo novo é OPCIONAL e retrocompatível: chamada sem `fimRotaPorPlaca` devolve exatamente o mesmo de hoje.
- Deploy do monitoramento (`transmonseg-definitivo`, pm2) e do KPI só com OK do usuário; monitoramento ANTES do KPI.

## Review Focus

- Conversão de fuso na fronteira: `fimRota` mascarado enviado sem +3 h procuraria a chegada 3 h antes (achado igual já aconteceu em 22/09). Teste no client (Task 2).
- Placa que NUNCA volta à base depois do fim da rota (dia em andamento, rastreador parou): `chegadaBase` fica null, nunca inventa (Task 1).
- 2ª viagem com entrega: fim da rota depois da volta intermediária → não ajusta (Task 2).
- Ponte falhando na 2ª chamada: mantém os valores da 1ª chamada, nunca zera (Task 3).
- Placa sem nenhuma entrega confirmada (fim da rota null): não ajusta (Task 2).

---

## File Structure

- Monitoramento — Modify `src/app/api/kpi/base-horarios/route.ts` (nova função pura `acharChegadaAposFimRota`, parse de `fimRotaPorPlaca`, uso no loop); Test `src/app/api/kpi/base-horarios/route.test.ts`.
- KPI — Create `src/lib/kpi-romaneio/fim-rota.ts` (+ `.test.ts`): `fimDaRota`, `precisaAjustarChegada`, `FOLGA_VOLTA_EXTRA_MIN`.
- KPI — Modify `src/lib/kpi-romaneio/base-horarios.ts` (+ test): `buscarHorariosBase` ganha 5º parâmetro opcional `fimRotaPorPlaca`.
- KPI — Modify `src/app/api/kpi/nutrimax/gerar/route.ts` e `scripts/gerar-nutrimax-real-arquivo.ts`: 2ª chamada e substituição.

---

### Task 1 (monitoramento): `fimRotaPorPlaca` na rota `/api/kpi/base-horarios`

**Files:**
- Modify: `src/app/api/kpi/base-horarios/route.ts` (perto de `acharSaidaEChegadaBase` ~L58-90, POST ~L622-770)
- Test: `src/app/api/kpi/base-horarios/route.test.ts`

**Interfaces:**
- Produces: `export function acharChegadaAposFimRota(posicoes: Posicao[], basesCentro: BaseCentro[], fimRotaISO: string): string | null` — primeira transição fora→dentro da base com `criado_em >= fimRotaISO` (instante real); `null` se não houver. Body do POST aceita `fimRotaPorPlaca?: Record<string, string>` (chave placa em qualquer formato; normalizar com `normPlaca`; valor ISO com fuso real; entradas inválidas são ignoradas, não 400).

- [ ] **Step 1: Testes falhando** (seguir os helpers existentes do `route.test.ts` para `Posicao`/`BaseCentro`; use uma base em (-22.8167, -43.2777) e pontos fora a ~10 km):
  1. `acharChegadaAposFimRota`: sequência dentro(06:00) → fora(07:00) → dentro(15:02) → fora(16:28) → dentro(19:34), fim `13:59` → devolve o `criado_em` das 15:02.
  2. mesma sequência, fim `15:30` → devolve 19:34 (a saída depois do fim era rota).
  3. fim depois da última entrada na base → `null`.
  4. POST com `fimRotaPorPlaca: { 'RBG-5G18': <fim real> }` para uma placa: `chegadaBase` = primeira entrada após o fim e `kmPercorrido` calculado só até ela (menor que sem o campo); outra placa no mesmo lote sem entrada no mapa → resultado idêntico ao de hoje.
  5. POST com `fimRotaPorPlaca` malformado (`{ 'X': 123 }` ou string inválida) → ignora aquela entrada, 200.
- [ ] **Step 2:** `npx vitest run src/app/api/kpi/base-horarios/route.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** `acharChegadaAposFimRota` usa o mesmo `dentro()` (`RAIO_BASE_M`, `haversineM`) de `acharSaidaEChegadaBase`, varrendo `posicoes` em ordem e retornando o primeiro `p.criado_em` com transição fora→dentro e `Date.parse(p.criado_em) >= Date.parse(fimRotaISO)`. No POST: ler `fimRotaPorPlaca`, montar `Map<placaNorm, string>` só com valores string que `Date.parse` aceita. No loop (hoje `const { saidaBase, chegadaBase } = acharSaidaEChegadaBase(...)`): se houver fim para a placa, `chegadaBase = acharChegadaAposFimRota(posicoes, basesCentro, fim)` e o `kmPercorrido` usa essa `chegadaBase`. Comentário citando o caso RBG5G18 21/09.
- [ ] **Step 4:** `npx vitest run src/app/api/kpi/base-horarios` → PASS; `npx tsc --noEmit` sem erros novos.
- [ ] **Step 5: Commit** `feat(kpi-bridge): chegadaBase apos fim da rota quando o KPI informa a ultima entrega` (+ trailer).

---

### Task 2 (KPI): `fimDaRota`, `precisaAjustarChegada` e o parâmetro novo do client

**Files:**
- Create: `src/lib/kpi-romaneio/fim-rota.ts`, Test: `src/lib/kpi-romaneio/fim-rota.test.ts`
- Modify: `src/lib/kpi-romaneio/base-horarios.ts` (`buscarHorariosBase`, `buscarLote`), Test: `src/lib/kpi-romaneio/base-horarios.test.ts`

**Interfaces:**
- Consumes: `Visita` (`./types`), `AlvoApi` (`@/lib/unitrac-api`), `ParadaBridge` (`./base-horarios`).
- Produces:
```ts
export const FOLGA_VOLTA_EXTRA_MIN = 30
/** Maior instante entre saida das visitas (mascarado) e feitoISO dos alvos situacao=1 (digitos BRT). Retorna ISO mascarado (toISOString) ou null. */
export function fimDaRota(visitas: Iterable<Visita>, alvosDaPlaca: AlvoApi[]): string | null
/** true se ha parada BASE com chegada >= fimRota e (chegadaBase - essa chegada) > FOLGA_VOLTA_EXTRA_MIN. Tudo mascarado. */
export function precisaAjustarChegada(paradas: ParadaBridge[], fimRota: string | null, chegadaBase: string | null): boolean
// base-horarios.ts
export async function buscarHorariosBase(placasNorm: string[], data: string, pontosPorPlaca?: Map<string, PontoEntregaBridge[]>, incluirParadas?: boolean, fimRotaPorPlaca?: Map<string, string>): Promise<Map<string, HorarioBase>>
// fimRotaPorPlaca: valores MASCARADOS; o client converte pra UTC real (+3 h) antes de mandar: body.fimRotaPorPlaca = { [placa]: isoReal }
```

- [ ] **Step 1: Testes falhando** (`fim-rota.test.ts`):
```ts
import { describe, it, expect } from 'vitest'
import { fimDaRota, precisaAjustarChegada } from './fim-rota'
import type { Visita } from './types'
import type { AlvoApi } from '@/lib/unitrac-api'
import type { ParadaBridge } from './base-horarios'

const visita = (saida: string): Visita => ({ nf: 'x', chegada: saida, saida, distanciaMetrosDoPonto: 10 } as Visita)
const alvo = (o: Partial<AlvoApi>): AlvoApi => ({ placaNorm: 'RBG5G18', codigoUnitrac: '1', nome: 'L', situacao: 1, feitoISO: '2026-09-21T13:50:00', documento: '1', inicioISO: null, ordem: 1, rota: 'r', pontoLat: null, pontoLng: null, ...o })
const base = (chegada: string, saida: string): ParadaBridge => ({ chegada, saida, duracaoSeg: 600, lat: -22.81, lng: -43.27, classificacao: 'BASE' })

describe('fimDaRota', () => {
  it('maior entre saida da visita e feitoISO confirmado (mesma convencao mascarada)', () => {
    expect(fimDaRota([visita('2026-09-21T13:59:00.000Z')], [alvo({})])).toBe('2026-09-21T13:59:00.000Z')
    expect(fimDaRota([visita('2026-09-21T10:00:00.000Z')], [alvo({ feitoISO: '2026-09-21T14:10:00' })])).toBe('2026-09-21T14:10:00.000Z')
  })
  it('ignora alvo nao feito e devolve null sem nada', () => {
    expect(fimDaRota([], [alvo({ situacao: 0 })])).toBeNull()
  })
})

describe('precisaAjustarChegada', () => {
  const paradas = [base('2026-09-21T15:02:00.000Z', '2026-09-21T16:07:00.000Z'), base('2026-09-21T19:34:00.000Z', '2026-09-21T22:04:00.000Z')]
  it('RBG5G18: volta 15:02 depois do fim 13:59, chegada atual 19:34 -> ajusta', () => {
    expect(precisaAjustarChegada(paradas, '2026-09-21T13:59:00.000Z', '2026-09-21T19:34:00.000Z')).toBe(true)
  })
  it('2a viagem: fim 18:00 (entregou depois de voltar) -> nao ajusta', () => {
    expect(precisaAjustarChegada(paradas, '2026-09-21T18:00:00.000Z', '2026-09-21T19:34:00.000Z')).toBe(false)
  })
  it('folga de ate 30 min -> nao ajusta', () => {
    expect(precisaAjustarChegada([base('2026-09-21T19:10:00.000Z', '2026-09-21T19:20:00.000Z')], '2026-09-21T13:59:00.000Z', '2026-09-21T19:34:00.000Z')).toBe(false)
  })
  it('fim null ou chegadaBase null -> nao ajusta', () => {
    expect(precisaAjustarChegada(paradas, null, '2026-09-21T19:34:00.000Z')).toBe(false)
    expect(precisaAjustarChegada(paradas, '2026-09-21T13:59:00.000Z', null)).toBe(false)
  })
})
```
E em `base-horarios.test.ts` (seguir o mock de `fetch` existente): chamando `buscarHorariosBase(['RBG5G18'], '2026-09-21', new Map(), false, new Map([['RBG5G18', '2026-09-21T13:59:00.000Z']]))`, o corpo enviado tem `fimRotaPorPlaca: { RBG5G18: '2026-09-21T16:59:00.000Z' }` (+3 h); sem o 5º argumento o corpo NÃO tem a chave `fimRotaPorPlaca`.
- [ ] **Step 2:** `npx vitest run src/lib/kpi-romaneio/fim-rota.test.ts src/lib/kpi-romaneio/base-horarios.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `fim-rota.ts`:
```ts
// Fim da rota = ultima entrega do dia (achado 22/09, RBG5G18 21/09): a
// CHEGADA CD tem que ser a primeira volta a base DEPOIS disso; uma saida
// extra sem entrega nao e' rota. Tudo na convencao mascarada (digitos BRT + Z).
import type { Visita } from './types'
import type { AlvoApi } from '@/lib/unitrac-api'
import type { ParadaBridge } from './base-horarios'

export const FOLGA_VOLTA_EXTRA_MIN = 30

const instante = (isoMascarado: string) => Date.parse(isoMascarado.replace(/(Z|[+-]\d\d:?\d\d)$/, '') + 'Z')

export function fimDaRota(visitas: Iterable<Visita>, alvosDaPlaca: AlvoApi[]): string | null {
  let max = -Infinity
  for (const v of visitas) if (v.saida) max = Math.max(max, instante(v.saida))
  for (const a of alvosDaPlaca) if (a.situacao === 1 && a.feitoISO) max = Math.max(max, instante(a.feitoISO))
  return Number.isFinite(max) ? new Date(max).toISOString() : null
}

export function precisaAjustarChegada(paradas: ParadaBridge[], fimRota: string | null, chegadaBase: string | null): boolean {
  if (!fimRota || !chegadaBase) return false
  const fim = instante(fimRota), chegada = instante(chegadaBase)
  return paradas.some(p => p.classificacao === 'BASE'
    && instante(p.chegada) >= fim
    && (chegada - instante(p.chegada)) / 60_000 > FOLGA_VOLTA_EXTRA_MIN)
}
```
Em `base-horarios.ts`: `buscarHorariosBase` e `buscarLote` recebem `fimRotaPorPlaca?: Map<string, string>`; em `buscarLote`, montar `fimRotaBody` só com as placas do lote presentes no mapa, convertendo `new Date(Date.parse(v) + 3 * 3600_000).toISOString()` (inverso de `paraBrtMascaradoComoUtc`, comentário explicando); incluir `fimRotaPorPlaca: fimRotaBody` no `JSON.stringify` SÓ se tiver alguma entrada.
- [ ] **Step 4:** testes → PASS; `npx tsc --noEmit` (só Buffer conhecidos).
- [ ] **Step 5: Commit** `feat(kpi): fim da rota e ajuste de chegada CD apos ultima entrega` (+ trailer).

---

### Task 3 (KPI): ligar no gerador e no script CLI

**Files:**
- Modify: `src/app/api/kpi/nutrimax/gerar/route.ts` (depois do `mapComLimite` que monta `visitasPorPlaca`, antes de `agregarPorCarga`)
- Modify: `scripts/gerar-nutrimax-real-arquivo.ts` (mesmo ponto)
- Test: `src/app/api/kpi/nutrimax/gerar/route.test.ts`

**Interfaces:**
- Consumes: `fimDaRota`, `precisaAjustarChegada` (Task 2), `buscarHorariosBase(..., fimRotaPorPlaca)` (Task 2), `alvosPorPlaca` (já existe na route).

Lógica (idêntica nos dois arquivos; extrair helper exportado `ajustarChegadaAposUltimaEntrega(placasNorm, data, horarioBasePorPlaca, visitasPorPlaca, alvosPorPlaca): Promise<void>` em `src/lib/kpi-romaneio/fim-rota.ts` para não duplicar):
```ts
const fimPorPlaca = new Map<string, string>()
for (const p of placasNorm) {
  const h = horarioBasePorPlaca.get(p)
  const fim = fimDaRota((visitasPorPlaca.get(p) ?? new Map()).values(), alvosPorPlaca.get(p) ?? [])
  if (h && precisaAjustarChegada(h.paradas ?? [], fim, h.chegadaBase)) fimPorPlaca.set(p, fim as string)
}
if (fimPorPlaca.size > 0) {
  const ajustado = await buscarHorariosBase([...fimPorPlaca.keys()], data, new Map(), false, fimPorPlaca)
  for (const [p, novo] of ajustado) {
    const atual = horarioBasePorPlaca.get(p)
    if (atual && novo.chegadaBase) horarioBasePorPlaca.set(p, { ...atual, saidaBase: novo.saidaBase, chegadaBase: novo.chegadaBase, kmPercorrido: novo.kmPercorrido })
  }
  console.log(`[kpi] chegada CD ajustada apos ultima entrega: ${[...fimPorPlaca.keys()].join(', ')}`)
}
```
(ponte falhando → `buscarHorariosBase` devolve mapa vazio → nada muda.) Mover `alvosPorPlaca` para antes desse bloco na route, se hoje for declarado depois.

- [ ] **Step 1: Teste falhando** em `route.test.ts` (seguir os mocks existentes de `buscarHorariosBase`): placa com visita saída 13:59 (mascarado), paradas BASE 15:02 e 19:34, chegadaBase 19:34 → a 2ª chamada de `buscarHorariosBase` acontece com `fimRotaPorPlaca` contendo a placa, e o resumo da carga usa a chegada da 2ª resposta (15:02). Outro teste: 2ª chamada devolvendo mapa vazio → resumo continua 19:34. Mais um: placa sem volta extra → `buscarHorariosBase` chamado só 1 vez.
- [ ] **Step 2:** `npx vitest run src/app/api/kpi/nutrimax/gerar` → FAIL.
- [ ] **Step 3:** Implementar o helper em `fim-rota.ts` (com teste unitário próprio usando mock de `./base-horarios`) e chamar nos dois arquivos.
- [ ] **Step 4:** `npx vitest run src/lib/kpi-romaneio src/app/api/kpi/nutrimax/gerar` → PASS; `npx tsc --noEmit`; type-check do script com tsconfig temporário.
- [ ] **Step 5: Commit** `feat(kpi): gerador ajusta chegada CD pela ultima entrega (volta extra a base nao e' rota)` (+ trailer). Espelhar KPI TEMP; push nos dois.

---

### Task 4: Rollout (controller, com OK do usuário)

- [ ] **Step 1:** Monitoramento primeiro: espelhar TEMP, push nos dois; no transmonseg-vps `cd /srv/transmonseg/definitivo && git pull && npm run build && pm2 restart transmonseg-definitivo` (checar antes que não há geração de KPI em andamento).
- [ ] **Step 2:** KPI: `cd /srv/kpi-transmonseg && git pull && npm run build && pm2 restart kpi-transmonseg`.
- [ ] **Step 3: Verificação:** regerar 21/09 pelo histórico (ou script CLI com o romaneio/escala de 21/09) → RBG5G18 com CHEGADA CD 15:02, TEMPO OPERAÇÃO 8h39, KM menor que 88,2; as outras 59 placas com CHEGADA CD idêntica à geração anterior (log só lista RBG5G18).

## Self-review

- Cobertura: regra no lado que conhece a base (T1), fim da rota com confirmações do KPI + limiar (T2), ligação e fail-open (T3), deploy e verificação no caso real (T4).
- Review Focus mapeado: fuso na fronteira (T2 teste de corpo +3 h), nunca volta (T1 teste 3), 2ª viagem (T2), ponte falhando (T3), sem entrega (T2).
- Nomes consistentes: `acharChegadaAposFimRota`, `fimRotaPorPlaca`, `fimDaRota`, `precisaAjustarChegada`, `FOLGA_VOLTA_EXTRA_MIN`, `ajustarChegadaAposUltimaEntrega`.
