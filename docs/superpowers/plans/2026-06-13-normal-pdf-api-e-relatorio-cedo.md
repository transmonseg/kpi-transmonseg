# Normal: PDF+API automático + relatório cedo honesto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps usam checkbox.

**Goal:** Fazer o KPI NORMAL (produção) (1) completar-se com a API do Unitrac automaticamente (PDF base + paradas ao vivo da API), e (2) quando o relatório for cedo, mostrar "EM ROTA / NA BASE" em vez de "NÃO FOI" (na tela E no XLSX) + aviso impossível de ignorar.

**Architecture:** Adição no `/api/kpi/simples` (route): merge best-effort das paradas da API no PDF (`mesclarParadas`) + enriquecimento (confirmação por alvo/NF + saída CD pelo início do alvo), tudo em `try/catch` — API fora = PDF puro = comportamento de hoje. E uma flag `relatorio_cedo` que faz `legendaSlot` (XLSX/PDF) e o preview mostrarem "EM ROTA/NA BASE" no lugar de "NÃO FOI", com aviso forte no topo. Reusa libs JÁ testadas (`mesclarParadas`, `consolidaParadasApi`, `confirmaPorAlvo`, `inicioRotaPorAlvo`, `confirmaEntregaViaApi`, `situacaoViva`).

**Tech Stack:** TypeScript, Next.js (nodejs, maxDuration 120), vitest. Concorrência via `mapLimitSettled` (já importado na rota).

---

## Contexto / âncoras (produção)

- `src/app/api/kpi/simples/route.ts`:
  - body destructure `:117`; paradaRows (PDF) construído em `veiculos.flatMap(...)` (procurar `const paradaRows = veiculos.flatMap`); matcher `cruzaEscalaUnitrac(...)`.
  - por-rede: `relatorioCedo = reportMaxHora < janelaFim` `:633`; monta `linhas: LinhaParaKpi[]` `:705` (seta `l.placa_rastreada`, `l.relatorio_parcial` etc); `avisoParcial` `:844`.
  - já importa `mapLimitSettled` (`@/lib/utils/map-limit`).
- `src/lib/types/kpi.ts`: `KpiLinha` tem `placa_rastreada?`, `placa_foi_algum_lugar?`, `placa_saiu_da_base?`, `relatorio_parcial?` (`:74-83`). Vamos add `relatorio_cedo?`.
- `src/lib/kpi/gerador-kpi.ts:178` `legendaSlot(c)` → texto quando sem entrega ("NÃO FOI AO CLIENTE", "SEM RASTREADOR", "MUDOU DE ROTA", "NÃO SAIU DA BASE"). É AQUI que entra "EM ROTA/NA BASE". `gerador-pdf.ts` usa a mesma legenda (conferir e espelhar).
- Preview tela: `src/app/painel/kpi/simples/page.tsx` — `StatusBadge` `:1727`; objeto do preview tem `status`, `revisar`, etc.
- Libs prontas: `@/lib/kpi/merge-paradas` (`mesclarParadas`), `@/lib/unitrac-api` (`buscarFrota,buscarPontos,buscarStopsCru,consolidaParadasApi,buscarAlvos,confirmaPorAlvo,inicioRotaPorAlvo,confirmaEntregaViaApi`), `@/lib/kpi/situacao-viva` (`situacaoViva`).
- **Beta é o gabarito do bloco de enriquecimento:** `src/app/api/kpi/beta/route.ts` — merge PDF+API (procurar `MODO PDF+API`) e bloco de confirmação (`=== KPI BETA: confirmação de PONTO ===`). Copiar com as adaptações indicadas.

**Rodar:** `npx vitest run` ; `npx tsc --noEmit 2>&1 | grep "^src/"`.

---

## Estrutura de arquivos

| Arquivo | Mudança |
|---|---|
| `src/app/api/kpi/simples/route.ts` | merge PDF+API best-effort + enriquecimento; flag `relatorio_cedo`; situacaoViva no preview; aviso forte |
| `src/lib/types/kpi.ts` | `relatorio_cedo?: boolean` em KpiLinha |
| `src/lib/kpi/gerador-kpi.ts` | `legendaSlot`: "EM ROTA / AGUARDANDO BASE" quando `relatorio_cedo` |
| `src/lib/kpi/gerador-kpi.test.ts` (criar se não existir) | TDD do legendaSlot |
| `src/lib/kpi/gerador-pdf.ts` | espelhar a legenda (se gerar o texto separadamente) |
| `src/app/painel/kpi/simples/page.tsx` | badge "em rota/na base" no preview + aviso forte |

---

## Task 1: PDF+API automático na rota normal (best-effort)

**Files:** Modify `src/app/api/kpi/simples/route.ts`

- [ ] **Step 1: imports**

Adicionar no topo:
```ts
import { mesclarParadas } from '@/lib/kpi/merge-paradas'
import { buscarFrota, buscarPontos, buscarStopsCru, consolidaParadasApi, buscarAlvos, confirmaPorAlvo, inicioRotaPorAlvo, confirmaEntregaViaApi } from '@/lib/unitrac-api'
import { situacaoViva, type SituacaoViva } from '@/lib/kpi/situacao-viva'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
```

- [ ] **Step 2: merge das paradas da API no PDF (paralelo, best-effort)**

Localizar `const paradaRows = veiculos.flatMap(...)`. Trocar `const` por `let` e, logo depois do bloco, inserir:
```ts
  // NORMAL: completa o PDF com as paradas ao vivo da API (best-effort). PDF manda
  // onde tem; a API preenche o que um relatório gerado cedo perdeu. API fora do
  // ar → segue só com o PDF (= comportamento de hoje). Paralelo com limite p/ não
  // estourar o tempo da função.
  let alvosApi: import('@/lib/unitrac-api').AlvoApi[] = []
  let pontosApiGlobal: import('@/lib/unitrac-api').MapaPontos = {}
  try {
    const frotaApi = await buscarFrota()
    const cvs = frotaApi.map(v => v.cv)
    const [pontos, alvs] = await Promise.all([buscarPontos(cvs), buscarAlvos(cvs)])
    pontosApiGlobal = pontos; alvosApi = alvs
    const placasEscala = new Set(escalaLinhas.map(l => l.placa_norm).filter(Boolean) as string[])
    const veicEscala = frotaApi.filter(v => placasEscala.has(v.placaNorm))
    // mapLimitSettled(items, limit, fn) → PromiseSettledResult<R>[] (3 args, sem label)
    const settled = await mapLimitSettled(veicEscala, 8, (v) =>
      buscarStopsCru(v.cv, 48).then(ev => consolidaParadasApi(ev, pontos, data, v.placaNorm)))
    const apiRows: UnitracParadaRow[] = []
    for (const r of settled) if (r.status === 'fulfilled') apiRows.push(...r.value)
    paradaRows = mesclarParadas(paradaRows as UnitracParadaRow[], apiRows)
  } catch (e) {
    console.warn('[/api/kpi/simples] merge PDF+API falhou (segue só PDF):', e instanceof Error ? e.message : e)
  }
```

- [ ] **Step 3: tipos**

Run: `npx tsc --noEmit 2>&1 | grep "^src/app/api/kpi/simples"` → vazio. Ajustar tipos do `paradaRows` (anotar `let paradaRows: UnitracParadaRow[] = ...`) se reclamar.

- [ ] **Step 4: suíte**

Run: `npx vitest run` → verde.

- [ ] **Step 5: commit**
```bash
git add src/app/api/kpi/simples/route.ts
git commit -m "feat(kpi): normal completa o PDF com paradas ao vivo da API (best-effort)"
```

---

## Task 2: enriquecimento por alvo/NF + saída CD + situacaoViva (best-effort) no normal

**Files:** Modify `src/app/api/kpi/simples/route.ts`

- [ ] **Step 1: confirmação por alvo + saída CD após o matcher**

Depois das `rotas` computadas (`const rotas = await cruzaEscalaUnitrac(...)`), inserir o bloco (espelha beta — confirmação por alvo/NF + saída CD pelo início do alvo). Usa `alvosApi` já buscado na Task 1:
```ts
  // Confirma/resgata por ALVO+NF e completa a saída CD pelo início do alvo (best-effort).
  if (alvosApi.length > 0) {
    for (const rota of rotas) {
      const esc = escalaMap.get(rota.escala_linha_id)
      if (!esc || !rota.placa_norm) continue
      const esperada = resolverLojaEsperada(esc, lojasParaMatcher)
      if (!esperada?.codigo_unitrac) continue
      const placaAlvo = rota.placa_unitrac ?? rota.placa_norm
      if (!rota.saida_cd) {
        const ini = inicioRotaPorAlvo(placaAlvo, esperada.codigo_unitrac, alvosApi)
        if (ini) rota.saida_cd = new Date(ini + 'Z')
      }
      const c = confirmaPorAlvo(placaAlvo, esperada.codigo_unitrac, alvosApi)
      if (c && !rota.paradas.some(p => p.loja_id === esperada.id)) {
        const t = new Date(c.feitoISO + 'Z')
        rota.paradas = [{ parada_id: null, loja_id: esperada.id, nome: esperada.nome, chegada: t, saida: t, duracao_min: 0, classificacao: 'LOJA' }]
        rota.status = 'ok'
      }
    }
  }
```
> `escalaMap`, `lojasParaMatcher`, `resolverLojaEsperada` já existem na rota (são os mesmos nomes da beta). Conferir.

- [ ] **Step 2: tipos + suíte**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head` → vazio. `npx vitest run` → verde.

- [ ] **Step 3: commit**
```bash
git add src/app/api/kpi/simples/route.ts
git commit -m "feat(kpi): normal confirma por NF e completa saída CD pelo início do alvo"
```

---

## Task 3: flag `relatorio_cedo` no tipo e na rota

**Files:** Modify `src/lib/types/kpi.ts`, `src/app/api/kpi/simples/route.ts`

- [ ] **Step 1: campo no tipo**

Em `src/lib/types/kpi.ts`, na interface `KpiLinha`, perto de `relatorio_parcial?: boolean`, adicionar:
```ts
  /** Relatório gerado cedo (corte << janela da rede): não-entregue vira "em rota/
   *  na base" em vez de "não foi" — não dá pra concluir falha com relatório parcial. */
  relatorio_cedo?: boolean
```

- [ ] **Step 2: setar na rota ao montar as linhas**

No `linhas: LinhaParaKpi[] = sorted.map(...)` (`:705`), onde já seta `l.placa_rastreada` etc, adicionar:
```ts
        l.relatorio_cedo = relatorioCedo
```
> `relatorioCedo` já está no escopo da rede (`:633`).

- [ ] **Step 3: tipos**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head` → vazio.

- [ ] **Step 4: commit**
```bash
git add src/lib/types/kpi.ts src/app/api/kpi/simples/route.ts
git commit -m "feat(kpi): flag relatorio_cedo na linha (corte << janela)"
```

---

## Task 4: legendaSlot mostra "EM ROTA / AGUARDANDO BASE" quando cedo (TDD)

**Files:** Modify `src/lib/kpi/gerador-kpi.ts` ; Create/au­mentar `src/lib/kpi/gerador-kpi.test.ts`

- [ ] **Step 1: teste do legendaSlot**

Criar (ou acrescentar) `src/lib/kpi/gerador-kpi.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { legendaSlot } from './gerador-kpi'
import type { LinhaParaKpi } from './gerador-kpi'

const base = (o: Partial<LinhaParaKpi>): LinhaParaKpi => ({
  rede_id: 'ASSAI', loja: 'X', placa: 'ABC1234', motorista: null, turno: 'MANHA',
  saida_cd: null, chd_loja_1: null, saida_loja_1: null, rota_status: 'sem_entrega',
  placa_rastreada: true, ...o,
} as unknown as LinhaParaKpi)

describe('legendaSlot — relatório cedo', () => {
  it('cedo + placa saiu da base, sem entrega → EM ROTA (não "não foi")', () => {
    expect(legendaSlot(base({ relatorio_cedo: true, placa_saiu_da_base: true, placa_foi_algum_lugar: false }))).toBe('EM ROTA')
  })
  it('cedo + placa não saiu da base → AGUARDANDO BASE', () => {
    expect(legendaSlot(base({ relatorio_cedo: true, placa_saiu_da_base: false }))).toBe('AGUARDANDO BASE')
  })
  it('NÃO cedo, sem entrega, saiu da base → continua NÃO FOI AO CLIENTE', () => {
    expect(legendaSlot(base({ relatorio_cedo: false, placa_saiu_da_base: true, placa_foi_algum_lugar: false }))).toBe('NÃO FOI AO CLIENTE')
  })
  it('com entrega (chd != null) → null (sem legenda)', () => {
    expect(legendaSlot(base({ relatorio_cedo: true, chd_loja_1: 0.25 }))).toBeNull()
  })
})
```

- [ ] **Step 2: rodar e ver falhar**

Run: `npx vitest run src/lib/kpi/gerador-kpi.test.ts`
Expected: FAIL (ainda retorna "NÃO FOI AO CLIENTE").

- [ ] **Step 3: implementar no legendaSlot**

Em `src/lib/kpi/gerador-kpi.ts:178`, no início de `legendaSlot`, logo após `if (c.chd_loja_1 !== null) return null`, inserir o ramo "cedo":
```ts
  // Relatório cedo: não dá pra concluir "não foi" — mostra o ANDAMENTO honesto.
  if (c.relatorio_cedo) {
    if (c.placa_saiu_da_base === false) return 'AGUARDANDO BASE'
    if (c.placa_rastreada === false) return 'SEM RASTREADOR'
    return 'EM ROTA'
  }
```
> Fica ANTES dos returns de "NÃO FOI AO CLIENTE". Mantém o resto da função intacto pro caso não-cedo.

- [ ] **Step 4: rodar e ver passar**

Run: `npx vitest run src/lib/kpi/gerador-kpi.test.ts` → PASS.

- [ ] **Step 5: espelhar no PDF**

Conferir `src/lib/kpi/gerador-pdf.ts`: se ele importa/usa `legendaSlot` de gerador-kpi, nada a fazer (herda). Se tiver lógica própria de legenda, aplicar o mesmo ramo `relatorio_cedo`. Run: `grep -n "legendaSlot\|NÃO FOI AO CLIENTE" src/lib/kpi/gerador-pdf.ts`.

- [ ] **Step 6: commit**
```bash
git add src/lib/kpi/gerador-kpi.ts src/lib/kpi/gerador-kpi.test.ts src/lib/kpi/gerador-pdf.ts
git commit -m "feat(kpi): XLSX/PDF mostram EM ROTA/AGUARDANDO BASE em relatório cedo (TDD)"
```

---

## Task 5: preview da tela — "em rota/na base" (não vermelho) + aviso forte

**Files:** Modify `src/app/api/kpi/simples/route.ts`, `src/app/painel/kpi/simples/page.tsx`

- [ ] **Step 1: rota envia situacaoViva no preview**

No objeto do `preview` (procurar `status: statusInfo.status,`), adicionar:
```ts
          situacaoViva: situacaoViva({
            entregue: statusInfo.status === 'ENTREGUE' || statusInfo.status === 'ENTREGUE_GEO',
            naApi: placaRastreada(rota.placa_norm),
            saiuDaBase: placaSaiuDaBase(rota.placa_norm),
          }),
```
E adicionar `situacaoViva?: SituacaoViva` ao `type PreviewLinha` da rota.

- [ ] **Step 2: tela mostra o badge de andamento quando cedo**

Em `src/app/painel/kpi/simples/page.tsx`: adicionar `situacaoViva?: 'ENTREGUE'|'EM_ROTA'|'NA_BASE'|'SEM_SINAL'` ao `PreviewLinha` do front. No `<td>` de status, quando NÃO entregue e `situacaoViva` for EM_ROTA/NA_BASE, mostrar um selo azul "Em rota" / cinza "Na base" em vez do vermelho (copiar o padrão do `beta/page.tsx`).

- [ ] **Step 3: aviso forte de relatório cedo**

A rota já devolve `avisoParcial` por rede (`:844`). Na tela, exibir esse aviso como um **banner no topo, destacado** (borda + fundo de warning, ícone), antes da tabela — não só uma linha discreta. Se já existe um lugar que mostra `avisoParcial`, reforçar o estilo (borda `--color-warning`, texto forte).

- [ ] **Step 4: tipos + lint + suíte**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head` → vazio.
Run: `npx eslint src/app/api/kpi/simples/route.ts src/app/painel/kpi/simples/page.tsx 2>&1 | grep -E "error" | grep -v warning` → vazio.
Run: `npx vitest run` → verde.

- [ ] **Step 5: commit**
```bash
git add src/app/api/kpi/simples/route.ts src/app/painel/kpi/simples/page.tsx
git commit -m "feat(kpi): preview mostra em rota/na base e aviso forte de relatório cedo"
```

---

## Task 6: Validação — não regredir dia completo + curar dia cedo

**Files:** nenhum (validação).

- [ ] **Step 1: regressão — dia COMPLETO ≈ antes**

Rodar o matcher de produção num dia com relatório completo e conferir que o PDF+API NÃO muda o resultado de forma significativa (a API dedup contra o PDF). Reaproveitar/adaptar `scripts/dev/cmp-normal.mts`. Aceitável: pequenas adições (entregas que o PDF tinha como "não foi" e a API confirma). Inaceitável: queda de entregues ou dupla contagem.

- [ ] **Step 2: cura — dia CEDO (13/06)**

Rodar contra o relatório cedo de 13/06 (em `unitrac-raw/2026-06-13/unitrac.pdf`) + escala do dia, e conferir: (a) entregues sobem muito (a API completa) e (b) os não-entregues que sobraram aparecem como EM ROTA / AGUARDANDO BASE (legendaSlot), não "não foi". Usar `scripts/dev/cmp-3-modos.mts` como base.

- [ ] **Step 3: suíte + isolamento conceitual**

Run: `npx vitest run` → verde. Conferir que o caminho "API fora do ar" (simular: forçar throw no try) cai no PDF puro sem quebrar.

- [ ] **Step 4: finalizar (skill finishing-a-development-branch)**

Merge na main + push.

---

## Notas de risco (PRODUÇÃO — atenção redobrada)

- **Best-effort é a rede de segurança:** todo o bloco API em `try/catch`. API fora → PDF puro = comportamento de hoje. NUNCA deixar a geração quebrar por causa da API.
- **Não regredir dia completo:** a regressão (Task 6 Step 1) é OBRIGATÓRIA antes de mergear. Se o PDF+API mudar pra pior um dia completo, PARAR.
- **Performance:** `mapLimitSettled(…, 8, …)` limita as chamadas `buscarStopsCru` simultâneas pra não estourar `maxDuration=120`. Medir o tempo num dia real.
- **Muda o XLSX do cliente:** "EM ROTA/AGUARDANDO BASE" passam a aparecer no XLSX (decisão do usuário: mais honesto que falso "não foi"). Confirmar com a Tia que o cliente aceita esses rótulos.
- **Dupla contagem:** `mesclarParadas` dedup + anti-dupla do matcher protegem; a Task 6 valida.
