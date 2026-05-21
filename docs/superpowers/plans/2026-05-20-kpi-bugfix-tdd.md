# KPI Bugfix TDD — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir 5 bugs no pipeline KPI usando TDD (RED → GREEN por bug), com cobertura de testes em cada ponto de falha.

**Architecture:** Cada bug tem: teste que demonstra o comportamento errado, fix mínimo, confirmação com `npx vitest run`. Bugs 2–4 exigem extração de funções puras para permitir teste unitário. Bugs 1 e 5 adicionam casos ao `anomalia.test.ts` existente.

**Tech Stack:** TypeScript, Vitest, Next.js App Router, Supabase

---

## Mapa de arquivos

| Arquivo | Ação | Bug |
|---------|------|-----|
| `src/lib/kpi/anomalia.ts` | Modificar | 1, 5 |
| `src/lib/kpi/anomalia.test.ts` | Adicionar casos | 1, 5 |
| `src/lib/kpi/merge-alteracoes.ts` | Criar (função pura extraída) | 2 |
| `src/lib/kpi/merge-alteracoes.test.ts` | Criar | 2 |
| `src/app/api/kpi/simples/route.ts` | Modificar (usar merge-alteracoes) | 2 |
| `src/lib/parsers/escala-pax.ts` | Exportar `tabToDate` | 3 |
| `src/lib/parsers/escala-pax.test.ts` | Criar | 3 |
| `src/lib/parsers/escala-zona-sul.ts` | Exportar `normalizaFilialCod` | 4 |
| `src/lib/parsers/escala-zona-sul.test.ts` | Criar | 4 |

---

## Task 1: ANOM-01 — GPS existe mas nenhuma parada casou (UNMATCHED silencioso)

**Arquivo alvo:** `src/lib/kpi/anomalia.ts` linhas 70-98
**Arquivo de teste:** `src/lib/kpi/anomalia.test.ts`

### Contexto
Quando o Unitrac tem dados de uma placa mas o matcher não conseguiu casar nenhuma parada com a escala, `rota.paradas` fica vazio E `paradasIndex.has(placa)` é verdadeiro. O bloco atual só emite ANOM-01 quando o GPS está ausente — o caso UNMATCHED+GPS ficava sem anomalia.

- [ ] **Step 1.1: Adicionar teste RED (ANOM-01 com GPS presente mas unmatched)**

Abrir `src/lib/kpi/anomalia.test.ts` e adicionar ao final do `describe('ANOM-01...')`:

```typescript
it('dispara com tem_gps:true quando placa tem GPS mas paradas=[] (UNMATCHED)', () => {
  const rota = makeRota({ paradas: [], status: 'ok' })
  // paradasIndex TEM a placa (GPS existe) mas rota.paradas está vazio (matcher falhou)
  const paradasIndex = new Map<string, []>([['ABC1234', []]])
  const result = detectaAnomalias({
    rotas: [rota],
    escalaLinhas: [makeEscalaLinha()],
    paradasIndex,
    janelasRede: new Map(),
    data: '2026-05-18',
  })
  const anom = result.filter((a) => a.codigo === 'ANOM-01')
  expect(anom).toHaveLength(1)
  expect(anom[0].severidade).toBe('HIGH')
  expect(anom[0].payload).toMatchObject({ tem_gps: true })
})
```

- [ ] **Step 1.2: Rodar o teste para confirmar RED ou GREEN**

```
cd C:\Users\media\dev\kpi-transmonseg
npx vitest run src/lib/kpi/anomalia.test.ts
```

Se PASSAR: o fix já está no código (feito anteriormente). Marque como verificado e avance.
Se FALHAR com "expected 0 to be 1": prossiga para Step 1.3.

- [ ] **Step 1.3: Implementar o fix em `anomalia.ts` (se RED)**

Localizar o bloco ANOM-01 (~linha 70) e adicionar o `else` após `if (!temParadas)`:

```typescript
// ANOM-01: placa com escala mas sem paradas GPS
if (rota.placa_norm && rota.paradas.length === 0 && rota.status !== 'sem_entrega') {
  const temParadas = paradasIndex.has(rota.placa_norm)
  if (!temParadas) {
    anomalias.push({
      kpi_rota_id: rotaId,
      parada_id: null,
      data,
      codigo: 'ANOM-01',
      severidade: 'HIGH',
      descricao: `Placa ${rota.placa_norm} está na escala mas não possui nenhum dado GPS no Unitrac para ${data}.`,
      sugestao: 'Verificar se o rastreador estava ativo ou se a placa está correta na escala.',
      payload: { placa: rota.placa_norm, escala_linha_id: rota.escala_linha_id },
    })
  } else {
    // GPS existe mas nenhuma parada casou (UNMATCHED com GPS disponível)
    anomalias.push({
      kpi_rota_id: rotaId,
      parada_id: null,
      data,
      codigo: 'ANOM-01',
      severidade: 'HIGH',
      descricao: `Placa ${rota.placa_norm} possui dados GPS no Unitrac mas nenhuma parada pôde ser associada à escala para ${data}.`,
      sugestao: 'Verificar nomes de lojas na escala vs. Unitrac — possível divergência de nome ou código.',
      payload: { placa: rota.placa_norm, escala_linha_id: rota.escala_linha_id, tem_gps: true },
    })
  }
}
```

- [ ] **Step 1.4: Confirmar GREEN**

```
npx vitest run src/lib/kpi/anomalia.test.ts
```

Saída esperada: todos os testes de anomalia passando (incluindo o novo).

- [ ] **Step 1.5: Rodar suite completa para checar regressões**

```
npx vitest run
```

Esperado: todos os testes passando.

- [ ] **Step 1.6: Commit**

```
git add src/lib/kpi/anomalia.ts src/lib/kpi/anomalia.test.ts
git commit -m "fix(anomalia): ANOM-01 dispara quando GPS existe mas nenhuma parada casou"
```

---

## Task 2: Deduplicação de alterações sem placa aplica 2x

**Arquivo atual:** `src/app/api/kpi/simples/route.ts` linhas 267-289
**Novo arquivo:** `src/lib/kpi/merge-alteracoes.ts`
**Novo teste:** `src/lib/kpi/merge-alteracoes.test.ts`

### Contexto
A lógica de dedup está inline na rota POST. Alterações que identificam motoristas sem placa (ex: "JOAO entrou em lugar de PEDRO, sem troca de carro") nunca eram deduplicas — se estivessem tanto no body inline quanto no banco, seriam aplicadas duas vezes.

- [ ] **Step 2.1: Criar `src/lib/kpi/merge-alteracoes.ts`**

```typescript
// Tipo AltConfirmada — espelho do type em route.ts (sem depender do arquivo de rota)
export type AltSlot = {
  motorista_nome: string | null
  motorista_codigo: number | null
  placa_raw: string | null
  placa_norm: string | null
} | null

export type AltEntry = {
  tipo: string
  rede_id: string | null
  loja_raw: string | null
  entra: AltSlot
  sai: { motorista_nome: string | null; placa_norm: string | null } | null
}

/**
 * Mergea alterações inline (do request body) com alterações do banco.
 * Remove duplicatas: inline prevalece; banco é ignorado se já existe equivalente.
 * Chave principal: placa entra+sai. Fallback: motorista entra+sai+rede_id.
 */
export function mergeAlteracoes(inline: AltEntry[], db: AltEntry[]): AltEntry[] {
  const resultado = [...inline]
  for (const dbAlt of db) {
    const dup = resultado.some(a => {
      const entraPlaca = a.entra?.placa_norm
      const dbEntraPlaca = dbAlt.entra?.placa_norm
      const saiPlaca = a.sai?.placa_norm
      const dbSaiPlaca = dbAlt.sai?.placa_norm

      // Chave por placa (mais confiável): exige que ambos tenham placa_norm
      if (entraPlaca && dbEntraPlaca) {
        return entraPlaca === dbEntraPlaca && saiPlaca === dbSaiPlaca
      }

      // Fallback por motorista quando sem placa: exige motorista + rede para evitar
      // falso-positivo entre redes diferentes (dois PEDRO em redes distintas)
      const entraMot = a.entra?.motorista_nome?.toLowerCase().trim()
      const dbEntraMot = dbAlt.entra?.motorista_nome?.toLowerCase().trim()
      const saiMot = a.sai?.motorista_nome?.toLowerCase().trim()
      const dbSaiMot = dbAlt.sai?.motorista_nome?.toLowerCase().trim()
      if (!entraMot || !dbEntraMot) return false
      return entraMot === dbEntraMot && saiMot === dbSaiMot && a.rede_id === dbAlt.rede_id
    })
    if (!dup) resultado.push(dbAlt)
  }
  return resultado
}
```

- [ ] **Step 2.2: Criar `src/lib/kpi/merge-alteracoes.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { mergeAlteracoes, type AltEntry } from './merge-alteracoes'

function altComPlaca(placa: string, sai: string | null = null, rede = 'ASSAI'): AltEntry {
  return {
    tipo: 'SUBSTITUICAO',
    rede_id: rede,
    loja_raw: null,
    entra: { motorista_nome: null, motorista_codigo: null, placa_raw: placa, placa_norm: placa },
    sai: sai ? { motorista_nome: null, placa_norm: sai } : null,
  }
}

function altSemPlaca(motorista: string, sai: string | null, rede: string): AltEntry {
  return {
    tipo: 'SUBSTITUICAO',
    rede_id: rede,
    loja_raw: null,
    entra: { motorista_nome: motorista, motorista_codigo: null, placa_raw: null, placa_norm: null },
    sai: sai ? { motorista_nome: sai, placa_norm: null } : null,
  }
}

describe('mergeAlteracoes', () => {
  it('adiciona alteração do banco que não existe no inline', () => {
    const inline = [altComPlaca('ABC1234')]
    const db = [altComPlaca('XYZ5678')]
    expect(mergeAlteracoes(inline, db)).toHaveLength(2)
  })

  it('deduplica por placa: mesma placa entra+sai → 1 entrada', () => {
    const inline = [altComPlaca('ABC1234', 'LKV5067')]
    const db = [altComPlaca('ABC1234', 'LKV5067')]
    expect(mergeAlteracoes(inline, db)).toHaveLength(1)
  })

  it('não deduplica quando placas diferentes na mesma rede', () => {
    const inline = [altComPlaca('ABC1234', 'LKV5067')]
    const db = [altComPlaca('XYZ5678', 'LKV5067')]
    expect(mergeAlteracoes(inline, db)).toHaveLength(2)
  })

  it('deduplica por motorista quando sem placa (mesmo motorista + rede)', () => {
    const inline = [altSemPlaca('joao', 'pedro', 'ASSAI')]
    const db = [altSemPlaca('JOAO', 'PEDRO', 'ASSAI')]  // case-insensitive
    expect(mergeAlteracoes(inline, db)).toHaveLength(1)
  })

  it('NÃO deduplica sem placa quando redes são diferentes', () => {
    const inline = [altSemPlaca('joao', 'pedro', 'ASSAI')]
    const db = [altSemPlaca('joao', 'pedro', 'ZONA_SUL')]
    expect(mergeAlteracoes(inline, db)).toHaveLength(2)
  })

  it('inline sempre prevalece sobre banco (posição 0)', () => {
    const inline = [altComPlaca('ABC1234')]
    const db = [altComPlaca('ABC1234')]
    const result = mergeAlteracoes(inline, db)
    expect(result[0]).toBe(inline[0])  // mesmo objeto, não o do banco
  })
})
```

- [ ] **Step 2.3: Rodar testes RED**

```
npx vitest run src/lib/kpi/merge-alteracoes.test.ts
```

Esperado: FALHA com "Cannot find module './merge-alteracoes'" até o arquivo ser criado.
Se `merge-alteracoes.ts` já foi criado no Step 2.1, esperado: 6 passed.

- [ ] **Step 2.4: Atualizar `route.ts` para usar `mergeAlteracoes`**

No topo de `src/app/api/kpi/simples/route.ts`, adicionar import (manter o type local `AltConfirmada` — ele tem a mesma shape que `AltEntry`):

```typescript
import { mergeAlteracoes } from '@/lib/kpi/merge-alteracoes'
```

Localizar o bloco de dedup inline (linhas ~267-289, o loop `for (const dbAlt of altsFromDb)`) e substituir **todo** o bloco por:

```typescript
// Mergea: inline prevalece; banco deduplica por placa (ou motorista+rede como fallback)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const altsFinal = mergeAlteracoes(alteracoes as any[], altsFromDb as any[]) as AltConfirmada[]
```

O cast `as any[]` é necessário porque `AltConfirmada` é um type local com a mesma shape que `AltEntry` — TypeScript não infere equivalência structural entre tipos de módulos diferentes sem cast explícito.

Remover as linhas antigas:
```typescript
const altsFinal = [...alteracoes]
for (const dbAlt of altsFromDb) {
  const dup = altsFinal.some(a => { ... })
  if (!dup) altsFinal.push(dbAlt)
}
```

- [ ] **Step 2.5: Confirmar GREEN**

```
npx vitest run
```

Esperado: todos os testes passando (incluindo os 6 novos de merge-alteracoes).

- [ ] **Step 2.6: Commit**

```
git add src/lib/kpi/merge-alteracoes.ts src/lib/kpi/merge-alteracoes.test.ts src/app/api/kpi/simples/route.ts
git commit -m "fix(route): extrair mergeAlteracoes como função pura e deduplicar por motorista quando sem placa"
```

---

## Task 3: tabToDate defaults hardcoded (ano=2026, mes=5)

**Arquivo alvo:** `src/lib/parsers/escala-pax.ts` linha 114
**Novo teste:** `src/lib/parsers/escala-pax.test.ts`

### Contexto
`tabToDate('15', 2026, 5)` retorna `'2026-05-15'`. Mas se chamada sem os 2 últimos parâmetros (defaults antigos), usaria 2026 e maio mesmo em outro mês/ano. O fix é tornar os parâmetros obrigatórios — `detectYearMonth` já tem fallback `new Date()`.

- [ ] **Step 3.1: Exportar `tabToDate` para permitir teste unitário**

Em `src/lib/parsers/escala-pax.ts`, linha 114, mudar:

```typescript
// ANTES
function tabToDate(tabName: string, ano: number, mes: number): string {

// DEPOIS
export function tabToDate(tabName: string, ano: number, mes: number): string {
```

- [ ] **Step 3.2: Criar `src/lib/parsers/escala-pax.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { tabToDate } from './escala-pax'

describe('tabToDate', () => {
  it('converte dia "15" com ano 2025 e mês 3 → "2025-03-15"', () => {
    expect(tabToDate('15', 2025, 3)).toBe('2025-03-15')
  })

  it('converte dia "05" com ano 2024 e mês 12 → "2024-12-05"', () => {
    expect(tabToDate('05', 2024, 12)).toBe('2024-12-05')
  })

  it('converte dia "1" (sem zero) com ano 2026 e mês 1 → "2026-01-01"', () => {
    expect(tabToDate('1', 2026, 1)).toBe('2026-01-01')
  })

  it('retorna string vazia para tab não numérica', () => {
    expect(tabToDate('MATRIZ', 2026, 5)).toBe('')
  })

  it('retorna string vazia para tab "Plan1"', () => {
    expect(tabToDate('Plan1', 2026, 5)).toBe('')
  })
})
```

- [ ] **Step 3.3: Rodar testes RED**

```
npx vitest run src/lib/parsers/escala-pax.test.ts
```

Se FALHAR com "tabToDate is not exported": confirmar que o Step 3.1 foi feito corretamente.
Se FALHAR com teste de comportamento: confirmar lógica da função.

- [ ] **Step 3.4: Verificar que parâmetros são obrigatórios (sem defaults)**

Em `escala-pax.ts`, confirmar que a assinatura é:
```typescript
export function tabToDate(tabName: string, ano: number, mes: number): string {
```
e NÃO tem `= 2026` ou `= 5` após os tipos.

- [ ] **Step 3.5: Confirmar GREEN**

```
npx vitest run src/lib/parsers/escala-pax.test.ts
```

Esperado: 5 passed.

- [ ] **Step 3.6: Rodar suite completa**

```
npx vitest run
```

- [ ] **Step 3.7: Commit**

```
git add src/lib/parsers/escala-pax.ts src/lib/parsers/escala-pax.test.ts
git commit -m "fix(escala-pax): tabToDate com parametros obrigatorios, sem defaults hardcoded"
```

---

## Task 4: loja_codigo_raw sem zero-pad no formato MATRIZ

**Arquivo alvo:** `src/lib/parsers/escala-zona-sul.ts`
**Novo teste:** `src/lib/parsers/escala-zona-sul.test.ts`

### Contexto
O formato compacto (Plan1) armazena `loja_codigo_raw: d1Key` onde `d1Key` é sempre zero-padded ("04"). O formato MATRIZ armazenava `loja_codigo_raw: loja` onde `loja` vinha diretamente da célula ("4"). O matcher falha ao comparar "4" com "04" em `scorePair`.

- [ ] **Step 4.1: Exportar `normalizaFilialCod` de `escala-zona-sul.ts`**

Em `src/lib/parsers/escala-zona-sul.ts`, adicionar antes das funções de parse:

```typescript
/** Normaliza código de filial: "4" → "04", "04" → "04", "33" → "33" */
export function normalizaFilialCod(cod: string): string {
  const t = cod.trim()
  return /^\d$/.test(t) ? `0${t}` : t
}
```

E garantir que o formato MATRIZ usa esta função ao atribuir `loja_codigo_raw`. Localizar onde `loja_codigo_raw: loja` aparece (~linha 309) e substituir por:

```typescript
loja_codigo_raw: normalizaFilialCod(loja),
```

- [ ] **Step 4.2: Criar `src/lib/parsers/escala-zona-sul.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { normalizaFilialCod } from './escala-zona-sul'

describe('normalizaFilialCod', () => {
  it('"4" vira "04"', () => {
    expect(normalizaFilialCod('4')).toBe('04')
  })

  it('"04" permanece "04"', () => {
    expect(normalizaFilialCod('04')).toBe('04')
  })

  it('"33" permanece "33" (2 dígitos, sem padding)', () => {
    expect(normalizaFilialCod('33')).toBe('33')
  })

  it('"7" vira "07"', () => {
    expect(normalizaFilialCod('7')).toBe('07')
  })

  it('código com espaço é trimado antes', () => {
    expect(normalizaFilialCod(' 4 ')).toBe('04')
  })
})
```

- [ ] **Step 4.3: Rodar testes RED**

```
npx vitest run src/lib/parsers/escala-zona-sul.test.ts
```

Se FALHAR "normalizaFilialCod is not exported": confirmar Step 4.1.

- [ ] **Step 4.4: Confirmar GREEN**

```
npx vitest run src/lib/parsers/escala-zona-sul.test.ts
```

Esperado: 5 passed.

- [ ] **Step 4.5: Rodar suite completa**

```
npx vitest run
```

- [ ] **Step 4.6: Commit**

```
git add src/lib/parsers/escala-zona-sul.ts src/lib/parsers/escala-zona-sul.test.ts
git commit -m "fix(escala-zona-sul): loja_codigo_raw sempre zero-padded no formato MATRIZ"
```

---

## Task 5: ANOM-04 — duração zero não detectada

**Arquivo alvo:** `src/lib/kpi/anomalia.ts` linhas 121-154
**Arquivo de teste:** `src/lib/kpi/anomalia.test.ts`

### Contexto
Quando `matched.saida` é null no Unitrac, `route.ts` define `parada.saida = parada.chegada` e `duracao_min = 0`. `parada.saida < parada.chegada` nunca é verdadeiro neste caso (são iguais), então ANOM-04 nunca dispara para esses dados incompletos.

- [ ] **Step 5.1: Adicionar teste RED para duração zero**

Em `src/lib/kpi/anomalia.test.ts`, adicionar novo `describe` no final:

```typescript
// ---------------------------------------------------------------------------
// ANOM-04: tempo negativo ou duração zero
// ---------------------------------------------------------------------------

describe('ANOM-04: tempo inconsistente ou duração zero', () => {
  it('dispara HIGH quando saida < chegada (GPS corrompido)', () => {
    const chegada = new Date('2026-05-18T10:00:00.000Z')
    const saida = new Date('2026-05-18T09:00:00.000Z')  // antes da chegada
    const parada = makeParada({ chegada, saida, duracao_min: -60 })
    const rota = makeRota({ paradas: [parada] })
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha()],
      paradasIndex: new Map([['ABC1234', []]]),
      janelasRede: new Map(),
      data: '2026-05-18',
    })
    const anom = result.filter((a) => a.codigo === 'ANOM-04')
    expect(anom).toHaveLength(1)
    expect(anom[0].severidade).toBe('HIGH')
  })

  it('dispara MEDIUM quando saida === chegada e duracao_min === 0 (saida null no Unitrac)', () => {
    const ts = new Date('2026-05-18T09:00:00.000Z')
    const parada = makeParada({ chegada: ts, saida: ts, duracao_min: 0 })
    const rota = makeRota({ paradas: [parada] })
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha()],
      paradasIndex: new Map([['ABC1234', []]]),
      janelasRede: new Map(),
      data: '2026-05-18',
    })
    const anom = result.filter((a) => a.codigo === 'ANOM-04')
    expect(anom).toHaveLength(1)
    expect(anom[0].severidade).toBe('MEDIUM')
  })

  it('NÃO dispara para parada normal com duracao_min > 0', () => {
    const rota = makeRota({ paradas: [makeParada({ duracao_min: 30 })] })
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha()],
      paradasIndex: new Map([['ABC1234', []]]),
      janelasRede: new Map(),
      data: '2026-05-18',
    })
    expect(result.filter((a) => a.codigo === 'ANOM-04')).toHaveLength(0)
  })
})
```

- [ ] **Step 5.2: Rodar testes RED**

```
npx vitest run src/lib/kpi/anomalia.test.ts
```

Se o teste "dispara MEDIUM quando saida === chegada" PASSAR: o fix já está no código. Avance.
Se FALHAR: prossiga para Step 5.3.

- [ ] **Step 5.3: Implementar fix em `anomalia.ts` (se RED)**

Localizar o bloco ANOM-04 (~linha 121) e adicionar `else if` após o `if (parada.saida < parada.chegada)`:

```typescript
// ANOM-04: tempo negativo (saida < chegada) ou duração zero (saida nula no Unitrac → saida=chegada)
for (const parada of rota.paradas) {
  if (parada.saida < parada.chegada) {
    anomalias.push({
      kpi_rota_id: rotaId,
      parada_id: parada.parada_id,
      data,
      codigo: 'ANOM-04',
      severidade: 'HIGH',
      descricao: `Parada em "${parada.nome}" (placa ${rota.placa_norm}) com saída anterior à chegada — dado GPS inconsistente.`,
      sugestao: 'Verificar dados brutos no Unitrac para esta parada.',
      payload: {
        placa: rota.placa_norm,
        nome_parada: parada.nome,
        chegada: parada.chegada.toISOString(),
        saida: parada.saida.toISOString(),
      },
    })
  } else if (parada.duracao_min === 0 && parada.saida.getTime() === parada.chegada.getTime()) {
    // saida era null no Unitrac — route.ts definiu saida=chegada, duracao_min=0
    anomalias.push({
      kpi_rota_id: rotaId,
      parada_id: parada.parada_id,
      data,
      codigo: 'ANOM-04',
      severidade: 'MEDIUM',
      descricao: `Parada em "${parada.nome}" (placa ${rota.placa_norm}) sem saída registrada no Unitrac — duração zero.`,
      sugestao: 'Verificar se o rastreador fechou a parada corretamente.',
      payload: {
        placa: rota.placa_norm,
        nome_parada: parada.nome,
        chegada: parada.chegada.toISOString(),
        saida: parada.saida.toISOString(),
      },
    })
  }
}
```

- [ ] **Step 5.4: Confirmar GREEN**

```
npx vitest run src/lib/kpi/anomalia.test.ts
```

Esperado: todos os testes de anomalia passando.

- [ ] **Step 5.5: Rodar suite completa**

```
npx vitest run
```

Esperado: todos os testes passando (sem regressões).

- [ ] **Step 5.6: Commit final**

```
git add src/lib/kpi/anomalia.ts src/lib/kpi/anomalia.test.ts
git commit -m "fix(anomalia): ANOM-04 detecta parada com duracao zero (saida=chegada no Unitrac)"
```

---

## Critério de conclusão

- [ ] Todos os 5 commits criados
- [ ] `npx vitest run` → zero falhas
- [ ] Nenhum teste existente quebrado
- [ ] Novos testes cobrem o comportamento correto de cada bug
