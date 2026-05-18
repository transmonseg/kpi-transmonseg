# KPI Pipeline Robusto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o pipeline KPI resiliente a variações de formato de escala e a diferenças de 1 caractere em placas, eliminando perda silenciosa de dados.

**Architecture:** Duas mudanças independentes: (1) fuzzy matching de placas em `matcher.ts`+`placa.ts` com ANOM-12; (2) refatoração dos parsers para `canParse()` score-based com `registry.ts`, substituindo o loop try-each-parser. Ambas protegidas por logging estruturado em `pipeline-log.ts`.

**Tech Stack:** TypeScript, ExcelJS, Vitest (a ser instalado), Next.js App Router

---

## Mapa de Arquivos

| Ação | Arquivo | Responsabilidade |
|------|---------|-----------------|
| Criar | `vitest.config.ts` | Configuração de testes com alias `@/` |
| Criar | `src/lib/utils/pipeline-log.ts` | Logging estruturado no pipeline |
| Criar | `src/lib/parsers/registry.ts` | Seleção de parser por score |
| Criar | `src/lib/utils/__tests__/placa.test.ts` | Testes de fuzzy matching |
| Criar | `src/lib/parsers/__tests__/registry.test.ts` | Testes do registry |
| Modificar | `src/lib/utils/placa.ts` | Adicionar `CONFUSAO` + `matchFuzzyPlaca()` |
| Modificar | `src/lib/types/kpi.ts` | Adicionar `placa_fuzzy?: string \| null` em `RotaKpi` |
| Modificar | `src/lib/kpi/matcher.ts` | Integrar fuzzy match, avisar no `.slice(0,10)` |
| Modificar | `src/lib/kpi/anomalia.ts` | Adicionar ANOM-12, suprimir ANOM-01 em fuzzy |
| Modificar | `src/lib/parsers/escala-zona-sul.ts` | Adicionar `canParse()` + aviso em resultado vazio |
| Modificar | `src/lib/parsers/escala-pax.ts` | Adicionar `canParse()` |
| Modificar | `src/lib/parsers/escala-armazem-grao.ts` | Adicionar `canParse()` |
| Modificar | `src/lib/parsers/escala-geral.ts` | Adicionar `canParse()` + fallback date scan |
| Modificar | `src/lib/parsers/escala-guanabara-pdf.ts` | Adicionar `canParse()` |
| Modificar | `src/app/api/escalas/upload/route.ts` | Usar registry no modo AUTO |
| Modificar | `package.json` | Adicionar vitest |

---

## Task 0: Instalar Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Instalar dependências**

```bash
npm install -D vitest @vitest/runner
```

- [ ] **Step 2: Criar `vitest.config.ts` na raiz do projeto**

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 3: Adicionar script `test` no `package.json`**

No `package.json`, dentro de `"scripts"`, adicionar:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verificar que o runner funciona**

```bash
npx vitest run --reporter=verbose
```

Esperado: `No test files found` (zero testes, zero falhas — é sucesso).

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add vitest"
```

---

## Task 1: Fuzzy Matching de Placas

**Files:**
- Modify: `src/lib/utils/placa.ts`
- Create: `src/lib/utils/__tests__/placa.test.ts`

### Por que fazer isso

O sistema usa `Map.get(placa_norm)` em `matcher.ts:148`. Quando escala tem `LQE5401` e Unitrac tem `LQE5E01` (formato antigo vs Mercosul — posição 4 diferente), o resultado é `[]` silencioso. A rota fica `status: 'pendente'` e `paradas: []`, indistinguível de "aguardando revisão".

### Mapa de confusões

Letras que se parecem com dígitos (OCR, digitação, formato antigo vs Mercosul):

- E ↔ 3, 4 (muito comum na posição Mercosul: `4` vira `E`)
- A ↔ 4
- O ↔ 0
- I, L ↔ 1
- B ↔ 8
- G ↔ 6
- S ↔ 5
- Z ↔ 2

- [ ] **Step 1: Escrever o teste antes de implementar**

Criar `src/lib/utils/__tests__/placa.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { matchFuzzyPlaca } from '@/lib/utils/placa'

describe('matchFuzzyPlaca', () => {
  it('retorna null quando não há candidatos', () => {
    expect(matchFuzzyPlaca('LQE5401', new Set())).toBeNull()
  })

  it('retorna null quando há match exato (fuzzy não deve substituir exact)', () => {
    // exact match é responsabilidade do caller; fuzzy só é chamado quando exact falha
    // mas se passado, deve reconhecer como match total e não retornar null
    const result = matchFuzzyPlaca('LQE5401', new Set(['LQE5401']))
    expect(result).not.toBeNull()
    expect(result!.score).toBe(1.0)
  })

  it('detecta confusão E/4 na posição Mercosul (índice 4)', () => {
    // LQE5401 (escala, antigo) vs LQE5E01 (unitrac, Mercosul): posição 4 é '4' vs 'E'
    const result = matchFuzzyPlaca('LQE5401', new Set(['LQE5E01']))
    expect(result).not.toBeNull()
    expect(result!.placa).toBe('LQE5E01')
    expect(result!.score).toBeGreaterThanOrEqual(0.9)
  })

  it('detecta confusão O/0', () => {
    const result = matchFuzzyPlaca('ABC1O23', new Set(['ABC1023']))
    expect(result).not.toBeNull()
    expect(result!.placa).toBe('ABC1023')
  })

  it('detecta confusão I/1', () => {
    const result = matchFuzzyPlaca('ABC1I23', new Set(['ABC1123']))
    expect(result).not.toBeNull()
  })

  it('retorna null quando há 2 candidatos fuzzy (ambiguidade)', () => {
    // Dois candidatos com 1 diferença confusa: não podemos escolher
    const result = matchFuzzyPlaca('LQE5401', new Set(['LQE5E01', 'LQE5A01']))
    expect(result).toBeNull()
  })

  it('retorna null quando a diferença é não-confusa (char completamente diferente)', () => {
    // X → Y não é confusão documentada
    const result = matchFuzzyPlaca('LQE5401', new Set(['LQE5X01']))
    expect(result).toBeNull()
  })

  it('retorna null quando há 2 caracteres diferentes', () => {
    // Tolerância máxima: 1 diferença
    const result = matchFuzzyPlaca('LQE5401', new Set(['LQE5E11']))
    expect(result).toBeNull()
  })

  it('retorna null quando tamanhos são diferentes', () => {
    const result = matchFuzzyPlaca('LQE5401', new Set(['LQE540']))
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Executar o teste e verificar que falha**

```bash
npx vitest run src/lib/utils/__tests__/placa.test.ts --reporter=verbose
```

Esperado: `FAIL — matchFuzzyPlaca is not a function`

- [ ] **Step 3: Implementar `matchFuzzyPlaca` em `placa.ts`**

Abrir `src/lib/utils/placa.ts` e adicionar após as linhas existentes:

```typescript
const CONFUSAO: Record<string, string[]> = {
  'E': ['3', '4'],
  'A': ['4'],
  'O': ['0'],
  'I': ['1'],
  'L': ['1'],
  'B': ['8'],
  'G': ['6'],
  'S': ['5'],
  'Z': ['2'],
  '4': ['A', 'E'],
  '0': ['O'],
  '1': ['I', 'L'],
  '8': ['B'],
  '3': ['E'],
  '6': ['G'],
  '5': ['S'],
  '2': ['Z'],
}

export function matchFuzzyPlaca(
  alvo: string,
  candidatos: Set<string>,
): { placa: string; score: number } | null {
  const matches: { placa: string; score: number }[] = []

  for (const cand of candidatos) {
    if (cand.length !== alvo.length) continue

    let diferencas = 0
    let score = 1.0

    for (let i = 0; i < alvo.length; i++) {
      if (alvo[i] === cand[i]) continue
      diferencas++
      if (diferencas > 1) break

      const confusos = CONFUSAO[alvo[i]] ?? []
      if (confusos.includes(cand[i])) {
        // Posição 4 (índice) é a posição da letra Mercosul — confusão muito documentada
        score -= (i === 4) ? 0.05 : 0.15
      } else {
        score -= 0.5
      }
    }

    if (diferencas <= 1 && score >= 0.8) {
      matches.push({ placa: cand, score })
    }
  }

  // Só aceita match único — ambiguidade = null (segurança anti-falso-positivo)
  return matches.length === 1 ? matches[0] : null
}
```

- [ ] **Step 4: Executar o teste e verificar que passa**

```bash
npx vitest run src/lib/utils/__tests__/placa.test.ts --reporter=verbose
```

Esperado: todos os testes `PASS`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/placa.ts src/lib/utils/__tests__/placa.test.ts
git commit -m "feat: add matchFuzzyPlaca with visual confusion map"
```

---

## Task 2: Integrar Fuzzy Match no Matcher

**Files:**
- Modify: `src/lib/types/kpi.ts` — adicionar campo `placa_fuzzy`
- Modify: `src/lib/kpi/matcher.ts` — usar matchFuzzyPlaca quando exact falha

### Contexto

`cruzaEscalaUnitrac` em `matcher.ts:148` faz `paradaByPlaca.get(linha.placa_norm) ?? []`. Quando retorna `[]`, a rota vai para `status: 'pendente'` sem paradas. Vamos tentar fuzzy quando exact falha, e registrar a placa fuzzy no campo `placa_fuzzy` para que `detectaAnomalias` possa gerar ANOM-12.

- [ ] **Step 1: Adicionar `placa_fuzzy` ao tipo `RotaKpi`**

Em `src/lib/types/kpi.ts`, modificar `RotaKpi`:

```typescript
export type RotaKpi = {
  escala_linha_id: string
  data: string
  rede_id: string
  placa_norm: string | null
  placa_fuzzy?: string | null      // placa Unitrac quando match foi aproximado
  saida_cd: Date | null
  paradas: ParadaKpi[]
  anomalias_codigos: string[]
  status: RotaStatus
}
```

- [ ] **Step 2: Importar `matchFuzzyPlaca` no matcher**

Em `src/lib/kpi/matcher.ts`, adicionar ao bloco de imports (primeira linha):

```typescript
import { matchFuzzyPlaca } from '@/lib/utils/placa'
import { pipelineLog } from '@/lib/utils/pipeline-log'
```

_(O `pipeline-log.ts` será criado na Task 4 — por enquanto, pode criar um stub ou aplicar ambas as tasks juntas)_

- [ ] **Step 3: Construir `Set` de placas Unitrac no início de `cruzaEscalaUnitrac`**

Em `cruzaEscalaUnitrac`, logo após a construção do `paradaByPlaca` (após linha `paradaByPlaca.set(placa, ...)`), adicionar:

```typescript
  // Set de todas as placas com dados GPS — necessário para fuzzy matching
  const placasUnitrac = new Set(paradaByPlaca.keys())
```

- [ ] **Step 4: Aplicar fuzzy quando exact falha**

Substituir no bloco `for (const linha of escalaLinhas)`, a linha:

```typescript
    const todasParadas = paradaByPlaca.get(linha.placa_norm) ?? []
```

Por:

```typescript
    let todasParadas = paradaByPlaca.get(linha.placa_norm) ?? []
    let placaFuzzy: string | null = null

    if (todasParadas.length === 0 && linha.placa_norm) {
      const fuzzy = matchFuzzyPlaca(linha.placa_norm, placasUnitrac)
      if (fuzzy) {
        todasParadas = paradaByPlaca.get(fuzzy.placa) ?? []
        placaFuzzy = fuzzy.placa
        pipelineLog('match', 'warn', 'fuzzy_placa', {
          escala: linha.placa_norm,
          unitrac: fuzzy.placa,
          score: fuzzy.score,
          rede_id: linha.rede_id,
        })
      }
    }
```

- [ ] **Step 5: Propagar `placa_fuzzy` no objeto `RotaKpi` retornado**

No `rotas.push({ ... })` ao final do `for (const linha of escalaLinhas)`:

```typescript
    rotas.push({
      escala_linha_id: linha.id,
      data: linha.data_entrega,
      rede_id: linha.rede_id,
      placa_norm: linha.placa_norm,
      placa_fuzzy: placaFuzzy,        // null quando exact match ou sem dados GPS
      saida_cd,
      paradas,
      anomalias_codigos: [],
      status: 'pendente',
    })
```

- [ ] **Step 6: Verificar que o TypeScript compila sem erros**

```bash
npx tsc --noEmit
```

Esperado: zero erros.

- [ ] **Step 7: Commit**

```bash
git add src/lib/types/kpi.ts src/lib/kpi/matcher.ts
git commit -m "feat: integrate fuzzy plate matching in cruzaEscalaUnitrac"
```

---

## Task 3: ANOM-12 e Supressão do ANOM-01

**Files:**
- Modify: `src/lib/kpi/anomalia.ts`

### Contexto

`detectaAnomalias` gera ANOM-01 (HIGH) quando `rota.paradas.length === 0` e `!paradasIndex.has(rota.placa_norm)`. Quando fuzzy match foi usado, isso é falso-positivo: a rota tem paradas (via placa fuzzy) mas ANOM-01 ainda dispara. Vamos:
1. Suprimir ANOM-01 quando `rota.placa_fuzzy` está preenchido (fuzzy funcionou)
2. Gerar ANOM-12 (MEDIUM, requer revisão) quando fuzzy foi usado

- [ ] **Step 1: Suprimir ANOM-01 para rotas com match fuzzy**

Em `anomalia.ts`, localizar o bloco ANOM-01 (linhas 70–84):

```typescript
    // ANOM-01: placa com escala mas sem paradas GPS
    if (rota.placa_norm && rota.paradas.length === 0 && rota.status !== 'sem_entrega') {
      const temParadas = paradasIndex.has(rota.placa_norm)
      if (!temParadas) {
        anomalias.push({ ... codigo: 'ANOM-01' ... })
      }
    }
```

Adicionar condição `&& !rota.placa_fuzzy`:

```typescript
    // ANOM-01: placa com escala mas sem paradas GPS
    // Não dispara quando fuzzy match foi usado (ANOM-12 é gerado em vez disso)
    if (rota.placa_norm && !rota.placa_fuzzy && rota.paradas.length === 0 && rota.status !== 'sem_entrega') {
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
      }
    }
```

- [ ] **Step 2: Gerar ANOM-12 para rotas com match fuzzy**

Após o bloco ANOM-01 (mas ainda dentro do `for (const rota of rotas)`), adicionar:

```typescript
    // ANOM-12: casamento aproximado de placa (diferença de 1 caractere, confusão visual)
    if (rota.placa_norm && rota.placa_fuzzy) {
      anomalias.push({
        kpi_rota_id: rotaId,
        parada_id: null,
        data,
        codigo: 'ANOM-12',
        severidade: 'MEDIUM',
        descricao: `Placa da escala "${rota.placa_norm}" não encontrada no Unitrac — match aproximado com "${rota.placa_fuzzy}" (diferença de 1 caractere, possível confusão de formato antigo/Mercosul). Rota incluída no KPI com dados do match aproximado.`,
        sugestao: 'Confirmar qual é a placa correta na escala e no rastreador. Corrigir o que estiver errado para evitar match fuzzy recorrente.',
        payload: {
          placa_escala: rota.placa_norm,
          placa_unitrac: rota.placa_fuzzy,
        },
      })
    }
```

- [ ] **Step 3: Verificar que o TypeScript compila sem erros**

```bash
npx tsc --noEmit
```

Esperado: zero erros. Se `rota.placa_fuzzy` der erro de tipo, confirme que o campo foi adicionado em `RotaKpi` na Task 2.

- [ ] **Step 4: Commit**

```bash
git add src/lib/kpi/anomalia.ts
git commit -m "feat: add ANOM-12 (fuzzy plate match), suppress ANOM-01 when fuzzy succeeds"
```

---

## Task 4: Pipeline Log Utility

**Files:**
- Create: `src/lib/utils/pipeline-log.ts`

Este módulo centraliza todos os logs do pipeline KPI. Usa `console.warn`/`console.error` com JSON estruturado — sem biblioteca externa. Os logs aparecem no Vercel Log Explorer e podem ser buscados por campo.

- [ ] **Step 1: Criar `src/lib/utils/pipeline-log.ts`**

```typescript
type PipelineStage = 'parse' | 'match' | 'kpi'
type PipelineLevel = 'info' | 'warn' | 'error'

export function pipelineLog(
  stage: PipelineStage,
  level: PipelineLevel,
  event: string,
  data?: Record<string, unknown>,
): void {
  const entry = {
    ts: new Date().toISOString(),
    stage,
    event,
    ...data,
  }
  const line = `[KPI] ${JSON.stringify(entry)}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}
```

- [ ] **Step 2: Verificar que o import em `matcher.ts` (Task 2) compila**

```bash
npx tsc --noEmit
```

Esperado: zero erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/utils/pipeline-log.ts
git commit -m "feat: add pipelineLog structured logger"
```

---

## Task 5: Avisar quando `.slice(0, 10)` trunca paradas

**Files:**
- Modify: `src/lib/kpi/matcher.ts`

### Contexto

Em `matcher.ts:167`:
```typescript
const nonBaseParadas = consolidarParadasMesmoCliente(nonBaseParadasRaw).slice(0, 10)
```

Se uma rota tem >10 paradas depois de consolidação, as extras são descartadas silenciosamente. O limite de 10 é operacionalmente razoável (rotas de entrega raramente têm >10 lojas), mas o descarte silencioso é um problema. Vamos adicionar um aviso de log.

- [ ] **Step 1: Importar `pipelineLog` no matcher (se ainda não importado da Task 2)**

Confirmar que a linha de import já está presente:

```typescript
import { pipelineLog } from '@/lib/utils/pipeline-log'
```

- [ ] **Step 2: Adicionar aviso antes do `.slice(0, 10)`**

Substituir a linha `matcher.ts:167`:

```typescript
    const nonBaseParadas = consolidarParadasMesmoCliente(nonBaseParadasRaw).slice(0, 10)
```

Por:

```typescript
    const consolidadas = consolidarParadasMesmoCliente(nonBaseParadasRaw)
    if (consolidadas.length > 10) {
      pipelineLog('match', 'warn', 'paradas_truncadas', {
        placa: linha.placa_norm,
        rede_id: linha.rede_id,
        total: consolidadas.length,
        descartadas: consolidadas.length - 10,
      })
    }
    const nonBaseParadas = consolidadas.slice(0, 10)
```

- [ ] **Step 3: Verificar compilação**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/kpi/matcher.ts
git commit -m "fix: log warning when paradas are truncated at limit of 10"
```

---

## Task 6: Fallback de Data no Parser Geral (P3)

**Files:**
- Modify: `src/lib/parsers/escala-geral.ts`

### Contexto

`extractDateFromWorksheet` só lê a célula M1 (coluna 13, linha 1). Se a célula estiver vazia ou a data estiver em outra coluna, retorna `null` e o parser usa `dataAlvo`. O problema: se `dataAlvo` também não for passado, a data fica errada. Vamos escanear as primeiras 5 linhas e as colunas vizinhas (11–15) buscando uma data válida.

- [ ] **Step 1: Substituir `extractDateFromWorksheet` em `escala-geral.ts`**

Localizar a função atual (linhas 114–128):

```typescript
function extractDateFromWorksheet(ws: ExcelJS.Worksheet): Date | null {
  const row1 = ws.getRow(1)
  const v = cellVal(row1.getCell(13))
  if (v instanceof Date) {
    return new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())
  }
  if (typeof v === 'string') {
    const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})/)
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
    const m2 = v.match(/(\d{4})-(\d{2})-(\d{2})/)
    if (m2) return new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]))
  }
  return null
}
```

Substituir por:

```typescript
function parseValueAsDate(v: unknown): Date | null {
  if (v instanceof Date) {
    return new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())
  }
  if (typeof v === 'string') {
    const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})/)
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
    const m2 = v.match(/(\d{4})-(\d{2})-(\d{2})/)
    if (m2) return new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]))
  }
  return null
}

function extractDateFromWorksheet(ws: ExcelJS.Worksheet): Date | null {
  // Tenta M1 primeiro (coluna 13 — posição original)
  const primary = parseValueAsDate(cellVal(ws.getRow(1).getCell(13)))
  if (primary) return primary

  // Fallback: varre colunas 11–15 nas primeiras 5 linhas
  for (let row = 1; row <= Math.min(5, ws.rowCount); row++) {
    for (let col = 11; col <= 15; col++) {
      const d = parseValueAsDate(cellVal(ws.getRow(row).getCell(col)))
      if (d && d.getFullYear() >= 2020) return d
    }
  }

  return null
}
```

- [ ] **Step 2: Verificar compilação**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/parsers/escala-geral.ts
git commit -m "fix: scan cols 11-15 rows 1-5 when date not found in M1 (escala-geral)"
```

---

## Task 7: Aviso em ZONA_SUL com Resultado Vazio (P6)

**Files:**
- Modify: `src/lib/parsers/escala-zona-sul.ts`

### Contexto

Em `escala-zona-sul.ts:256`: `if (dataAlvo && dataISO !== dataAlvo) return`. Se o arquivo tem linhas mas nenhuma coincide com a `dataAlvo`, o parser retorna `[]`. O sistema de detecção AUTO (`upload/route.ts`) interpreta isso como "parser não reconhece o formato" e tenta o próximo — que pode retornar dados errados.

A correção certa está na Task 9 (registry com `canParse()` separado de `parse()`). Esta task apenas adiciona um log para diagnóstico imediato.

- [ ] **Step 1: Adicionar import de `pipelineLog` no `escala-zona-sul.ts`**

Na primeira linha do arquivo, adicionar:

```typescript
import { pipelineLog } from '@/lib/utils/pipeline-log'
```

- [ ] **Step 2: Adicionar log após o loop `ws.eachRow` quando resultado vazio**

Em `parseEscalaZonaSul`, após o `ws.eachRow((row, rowNumber) => { ... })`, antes do `return results`:

```typescript
  if (results.length === 0 && dataAlvo) {
    pipelineLog('parse', 'warn', 'zona_sul_vazio_data_alvo', {
      dataAlvo,
      mensagem: 'Arquivo ZONA_SUL parseado mas nenhuma linha coincide com dataAlvo. Verifique se a data está correta.',
    })
  }
```

Fazer o mesmo no bloco da aba MATRIZ (antes do `return results` no final de `parseEscalaZonaSul`).

- [ ] **Step 3: Verificar compilação**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/parsers/escala-zona-sul.ts
git commit -m "fix: log warning when ZONA_SUL returns empty due to dataAlvo mismatch"
```

---

## Task 8: `canParse()` em Cada Parser

**Files:**
- Modify: `src/lib/parsers/escala-zona-sul.ts`
- Modify: `src/lib/parsers/escala-pax.ts`
- Modify: `src/lib/parsers/escala-armazem-grao.ts`
- Modify: `src/lib/parsers/escala-geral.ts`
- Modify: `src/lib/parsers/escala-guanabara-pdf.ts`

### Arquitetura

Cada parser exporta `canParse(buffer: Buffer): Promise<number>` retornando score 0.0–1.0. O score é calculado lendo apenas a estrutura do arquivo (cabeçalhos, nomes de abas, células-chave) sem fazer parse completo. O registry (Task 9) usa esses scores para selecionar o parser correto.

Regra de scores:
- `0.95`: parser detecta sinal muito específico (nome de aba + célula marcadora)
- `0.90`: sinal claro mas um pouco mais genérico
- `0.60`: parser de último recurso (GERAL)
- `0.0`: o arquivo é explicitamente incompatível (ex: PDF num parser XLSX)

### ZONA_SUL

- [ ] **Step 1: Adicionar `canParse` ao `escala-zona-sul.ts`**

Antes da função `parseEscalaZonaSul`, adicionar:

```typescript
export async function canParse(buffer: Buffer): Promise<number> {
  try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as Parameters<typeof wb.xlsx.load>[0])

    const matriz = wb.getWorksheet('MATRIZ')
    if (matriz) {
      // Verificar marcador específico da aba MATRIZ
      let found = false
      matriz.eachRow((row) => {
        if (found) return
        const v = cellVal(row.getCell(10))
        if (v === 'CARREGAMENTO DIÁRIO') found = true
      })
      return found ? 0.95 : 0.5
    }

    const firstWs = wb.worksheets[0]
    if (firstWs && detectaFormatoCompacto(firstWs)) return 0.90

    return 0.0
  } catch {
    return 0.0
  }
}
```

### PAX

- [ ] **Step 2: Verificar estrutura do arquivo PAX**

Ler `src/lib/parsers/escala-pax.ts` para identificar o sinal de detecção (nome de aba, célula marcadora):

```bash
head -60 src/lib/parsers/escala-pax.ts
```

Com base no que você encontrar, adicionar `canParse` com o sinal mais específico possível. Padrão esperado: a aba "ESCALA" ou similar + célula com "MOTORISTA" ou "PLACA".

Exemplo (ajustar conforme o arquivo real):

```typescript
export async function canParse(buffer: Buffer): Promise<number> {
  try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as Parameters<typeof wb.xlsx.load>[0])

    // PAX usa aba "ESCALA" com cabeçalho específico
    const ws = wb.getWorksheet('ESCALA') ?? wb.worksheets[0]
    if (!ws) return 0.0

    // Verificar presença de "MOTORISTA" nas primeiras 3 linhas
    for (let r = 1; r <= 3; r++) {
      const row = ws.getRow(r)
      for (let c = 1; c <= 10; c++) {
        const v = cellVal(row.getCell(c))
        if (typeof v === 'string' && v.toUpperCase().includes('MOTORISTA')) return 0.95
      }
    }
    return 0.0
  } catch {
    return 0.0
  }
}
```

### ARMAZEM_GRAO

- [ ] **Step 3: Adicionar `canParse` ao `escala-armazem-grao.ts`**

Seguir o mesmo padrão: ler o nome da aba e o marcador característico deste parser. Se o parser usa uma aba com nome específico (ex: "CARGAS"), usar esse nome como sinal principal.

```typescript
export async function canParse(buffer: Buffer): Promise<number> {
  try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as Parameters<typeof wb.xlsx.load>[0])

    // Adaptar conforme o nome real da aba e marcador
    const ws = wb.getWorksheet('CARGAS') ?? wb.getWorksheet('GRÃO')
    if (ws) return 0.90

    return 0.0
  } catch {
    return 0.0
  }
}
```

_(Ajustar o nome da aba lendo o arquivo real antes de implementar)_

### GERAL (fallback)

- [ ] **Step 4: Adicionar `canParse` ao `escala-geral.ts`**

O GERAL sempre aceita, mas com score baixo (fallback):

```typescript
export async function canParse(buffer: Buffer): Promise<number> {
  try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as Parameters<typeof wb.xlsx.load>[0])

    const ws = wb.worksheets[0]
    if (!ws || ws.rowCount < 3) return 0.0

    return 0.60  // aceita tudo com score baixo — parser de último recurso
  } catch {
    return 0.0
  }
}
```

### GUANABARA (PDF)

- [ ] **Step 5: Adicionar `canParse` ao `escala-guanabara-pdf.ts`**

PDFs começam com os bytes `25 50 44 46` (`%PDF`). Não precisamos carregar o ExcelJS:

```typescript
export async function canParse(buffer: Buffer): Promise<number> {
  // PDF magic bytes: %PDF
  if (buffer.length < 4) return 0.0
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 1.0  // certeza absoluta — é PDF
  }
  return 0.0
}
```

- [ ] **Step 6: Verificar compilação**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/parsers/
git commit -m "feat: add canParse() score function to all escala parsers"
```

---

## Task 9: Parser Registry com Score-Based Selection

**Files:**
- Create: `src/lib/parsers/registry.ts`
- Create: `src/lib/parsers/__tests__/registry.test.ts`

### Contexto

Substituir o loop try-each-parser em `upload/route.ts` (AUTO mode) por um sistema que chama `canParse()` em paralelo e seleciona o vencedor por score. Isso resolve:
- Conflito PAX vs GERAL (ambos aceitavam qualquer sheet numérica)
- Mensagem de erro sem diagnóstico quando nenhum parser funciona
- ZONA_SUL retornando `[]` sendo interpretado como "não reconheceu"

### Erro Personalizado

```typescript
// src/lib/parsers/registry.ts

import ExcelJS from 'exceljs'
import { pipelineLog } from '@/lib/utils/pipeline-log'
import type { LinhaEscala } from '@/lib/types/escala'

import * as ZonaSul from './escala-zona-sul'
import * as Pax from './escala-pax'
import * as ArmazemGrao from './escala-armazem-grao'
import * as Geral from './escala-geral'
import * as Guanabara from './escala-guanabara-pdf'

type ParserModule = {
  rede_id: string
  canParse: (buffer: Buffer) => Promise<number>
  parse: (buffer: Buffer, dataAlvo?: string) => Promise<LinhaEscala[]>
}

const PARSERS: ParserModule[] = [
  { rede_id: 'ZONA_SUL',     canParse: ZonaSul.canParse,     parse: (b, d) => ZonaSul.parseEscalaZonaSul(b, d) },
  { rede_id: 'PAX',          canParse: Pax.canParse,          parse: (b, d) => Pax.parseEscalaPax(b, d) },
  { rede_id: 'ARMAZEM_GRAO', canParse: ArmazemGrao.canParse, parse: (b, d) => ArmazemGrao.parseEscalaArmazemGrao(b, d) },
  { rede_id: 'GUANABARA',    canParse: Guanabara.canParse,   parse: (b, d) => Guanabara.parseEscalaGuanabaraPdf(b, d) },
  { rede_id: 'GERAL',        canParse: Geral.canParse,        parse: (b, d) => Geral.parseEscalaGeral(b, d) },
]

const MIN_SCORE = 0.3
const MIN_SCORE_GAP = 0.1  // vencedor deve superar o segundo por pelo menos 10%

export class EscalaFormatoDesconhecidoError extends Error {
  scores: { rede_id: string; score: number }[]
  constructor(scores: { rede_id: string; score: number }[]) {
    const linhas = scores.map(s => `  ${s.rede_id}: ${s.score.toFixed(2)}`).join('\n')
    super(`Formato da escala não reconhecido. Scores:\n${linhas}`)
    this.scores = scores
    this.name = 'EscalaFormatoDesconhecidoError'
  }
}

export class EscalaAmbiguoError extends Error {
  constructor(a: { rede_id: string; score: number }, b: { rede_id: string; score: number }) {
    super(
      `Formato ambíguo: ${a.rede_id} (${a.score.toFixed(2)}) e ${b.rede_id} (${b.score.toFixed(2)}) têm scores muito próximos. Especifique o tipo manualmente.`
    )
    this.name = 'EscalaAmbiguoError'
  }
}

export async function detectAndParse(
  buffer: Buffer,
  dataAlvo?: string,
): Promise<{ linhas: LinhaEscala[]; rede_id: string }> {
  const scoreResults = await Promise.all(
    PARSERS.map(async (p) => ({ parser: p, score: await p.canParse(buffer) }))
  )
  scoreResults.sort((a, b) => b.score - a.score)

  pipelineLog('parse', 'info', 'parser_scores', {
    scores: scoreResults.map(r => ({ rede_id: r.parser.rede_id, score: r.score })),
  })

  const [first, second] = scoreResults

  if (first.score < MIN_SCORE) {
    throw new EscalaFormatoDesconhecidoError(
      scoreResults.map(r => ({ rede_id: r.parser.rede_id, score: r.score }))
    )
  }

  if (second && first.score - second.score < MIN_SCORE_GAP) {
    throw new EscalaAmbiguoError(
      { rede_id: first.parser.rede_id, score: first.score },
      { rede_id: second.parser.rede_id, score: second.score },
    )
  }

  const linhas = await first.parser.parse(buffer, dataAlvo)
  return { linhas, rede_id: first.parser.rede_id }
}
```

- [ ] **Step 1: Criar `src/lib/parsers/registry.ts`** com o código acima

- [ ] **Step 2: Escrever teste de integração do registry**

Criar `src/lib/parsers/__tests__/registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { detectAndParse, EscalaFormatoDesconhecidoError } from '@/lib/parsers/registry'

describe('detectAndParse', () => {
  it('lança EscalaFormatoDesconhecidoError para buffer vazio', async () => {
    await expect(detectAndParse(Buffer.alloc(0))).rejects.toThrow(EscalaFormatoDesconhecidoError)
  })

  it('lança EscalaFormatoDesconhecidoError com scores no erro', async () => {
    try {
      await detectAndParse(Buffer.from('conteudo invalido'))
      expect.fail('deve lançar')
    } catch (e) {
      expect(e).toBeInstanceOf(EscalaFormatoDesconhecidoError)
      const err = e as EscalaFormatoDesconhecidoError
      expect(err.scores).toHaveLength(5)  // um por parser
      expect(err.message).toContain('ZONA_SUL')
    }
  })

  it('detecta PDF pelo magic byte', async () => {
    // %PDF magic bytes
    const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E])
    // Vai passar no canParse do Guanabara mas falhar no parse real — só testamos canParse aqui
    const { canParse } = await import('@/lib/parsers/escala-guanabara-pdf')
    const score = await canParse(pdfBuffer)
    expect(score).toBe(1.0)
  })
})
```

- [ ] **Step 3: Executar testes**

```bash
npx vitest run src/lib/parsers/__tests__/registry.test.ts --reporter=verbose
```

Esperado: todos passam.

- [ ] **Step 4: Verificar compilação**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/parsers/registry.ts src/lib/parsers/__tests__/registry.test.ts
git commit -m "feat: add parser registry with canParse() score-based selection"
```

---

## Task 10: Atualizar `upload/route.ts` para Usar o Registry

**Files:**
- Modify: `src/app/api/escalas/upload/route.ts`

### O que muda

No modo `AUTO`, substituir o loop `for (const { t, fn } of tentativas)` por uma chamada a `detectAndParse`. Os erros `EscalaFormatoDesconhecidoError` e `EscalaAmbiguoError` devem virar resposta HTTP 400 com mensagem diagnóstica.

- [ ] **Step 1: Adicionar import do registry**

Em `route.ts`, adicionar no topo dos imports:

```typescript
import { detectAndParse, EscalaFormatoDesconhecidoError, EscalaAmbiguoError } from '@/lib/parsers/registry'
```

- [ ] **Step 2: Substituir o bloco AUTO**

Localizar o bloco `if (tipo === 'AUTO')` (linhas 100–132). Substituir por:

```typescript
    if (tipo === 'AUTO') {
      try {
        const result = await detectAndParse(Buffer.from(arrayBuffer), data)
        linhas = result.linhas
        tipoDetectado = result.rede_id as TipoEscala
      } catch (e) {
        if (e instanceof EscalaFormatoDesconhecidoError || e instanceof EscalaAmbiguoError) {
          return new NextResponse(e.message, { status: 400 })
        }
        throw e
      }

      if (linhas.length === 0)
        return new NextResponse(
          'Arquivo reconhecido mas sem linhas encontradas. Confirme que a data está correta.',
          { status: 400 },
        )
    } else if (tipo === 'GERAL' && formato === 'xlsx') {
```

_(O restante do bloco `else if` permanece igual)_

- [ ] **Step 3: Remover imports de parsers que só eram usados no bloco AUTO**

Verificar se `parseEscalaZonaSul`, `parseEscalaArmazemGrao`, `parseEscalaPax`, `parseEscalaGeral` ainda são usados fora do bloco AUTO (nos blocos `else if tipo === 'ZONA_SUL'` etc.). Se sim, manter. Se não, remover.

Provavelmente você precisará manter todos os imports pois os blocos `else if` de tipo explícito ainda os usam diretamente.

- [ ] **Step 4: Verificar compilação**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Testar manualmente com arquivo de escala real**

Se tiver acesso a um arquivo de escala local:
```bash
# No projeto, iniciar o servidor de dev
npm run dev
# Em outro terminal, simular upload via curl (ajustar path e data)
# O endpoint requer auth, então testar via UI do painel é mais prático
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/escalas/upload/route.ts
git commit -m "feat: replace try-each-parser loop with score-based registry in AUTO mode"
```

---

## Task 11: Validação Final e Push

- [ ] **Step 1: Rodar todos os testes**

```bash
npx vitest run --reporter=verbose
```

Esperado: todos passam.

- [ ] **Step 2: Verificar compilação final**

```bash
npx tsc --noEmit
```

Esperado: zero erros.

- [ ] **Step 3: Push para GitHub**

```bash
git push
```

---

## Self-Review

### Cobertura do Spec

| Requisito do Spec | Task |
|-------------------|------|
| Fuzzy plate matching + CONFUSAO map | Task 1 |
| `placa_fuzzy` no RotaKpi | Task 2 |
| ANOM-12 + supressão ANOM-01 | Task 3 |
| P4 (slice(0,10) silencioso) | Task 5 |
| P3 (extractDateFromWorksheet fallback) | Task 6 |
| P6 (ZONA_SUL vazio com dataAlvo) | Task 7 |
| canParse() por parser | Task 8 |
| Parser registry com scores | Task 9 |
| Upload AUTO usa registry | Task 10 |
| pipelineLog estruturado | Task 4 |

### Itens do Spec Descartados
- P9 (Guanabara regex `/g`): análise confirmou que `lastIndex = 0` já é resetado na linha 130 do arquivo. Código correto, nada a mudar.
- P5 (BASE_LOCAL/FORA_LOCAL): já são constantes em `unitrac.ts` e `unitrac-pdf.ts`. A "perda silenciosa" é o fallthrough para `'ENTREGA'` padrão quando nenhuma string casa — baixíssimo impacto prático, omitido do plano.

### Verificação de Consistência de Tipos

- `matchFuzzyPlaca(alvo: string, candidatos: Set<string>)` — chamada em `matcher.ts` com `linha.placa_norm` (string | null). Precisa do guard `linha.placa_norm &&` antes da chamada (já incluído na Task 2).
- `RotaKpi.placa_fuzzy?: string | null` — `rota.placa_fuzzy` verificado em `anomalia.ts` com `rota.placa_fuzzy` (undefined/null são ambos falsy, funciona corretamente).
- `canParse(buffer: Buffer)` — chamado com `Buffer.from(arrayBuffer)` em `registry.ts`. O tipo `Buffer` é subclasse de `Uint8Array`, compatível com todos os parsers que aceitam `ArrayBuffer | Buffer`.
- `detectAndParse` retorna `rede_id: string` — cast para `TipoEscala` em `route.ts`. Seguro pois os `rede_id` dos parsers são exatamente os mesmos valores de `TipoEscala`.
