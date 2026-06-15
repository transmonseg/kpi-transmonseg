# Escala Universal + Bug Formato Loja — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Corrigir o bug onde `local_parada` no formato `CÓDIGO Cidade-UF NOME` é perdido como FORA_BASE em vez de LOJA; (2) Fazer o sistema identificar qualquer escala XLSX independente de formato, cor de fundo ou quantidade de redes.

**Architecture:** Extrai duas funções compartilhadas (`extraiLojaLocal` e `inferRedeFromLoja`) para módulos próprios, aplica em todos os 5 pontos do bug de formato, e pluga o `escala-universal.ts` como último fallback na cascata do `/kpi/simples`.

**Tech Stack:** TypeScript, ExcelJS, Vitest, Next.js App Router. Todos os comandos de teste: `npx vitest run <arquivo>`. Suite completa: `npx vitest run`.

---

## Mapa de Arquivos

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `src/lib/parsers/extrai-loja-local.ts` | **Criar** | `extraiLojaLocal()` + `temLojaLocal()` — tolera endereço entre código e nome |
| `src/lib/parsers/extrai-loja-local.test.ts` | **Criar** | Testes unitários dos 4 casos reais do bug + regressões |
| `src/lib/parsers/infer-rede.ts` | **Criar** | `inferRedeFromLoja()` extraída de escala-geral |
| `src/lib/parsers/infer-rede.test.ts` | **Criar** | Testes da inferência de rede por nome de loja |
| `src/lib/parsers/unitrac-pdf.ts` | **Modificar** | Substituir regex de `temLojaConcatenada` e `extraiLoja` por `temLojaLocal`/`extraiLojaLocal` |
| `src/lib/parsers/unitrac.ts` | **Modificar** | Substituir `LOJA_GF_RE` em `findLojaGeofence` e `extraiLoja` por `temLojaLocal`/`extraiLojaLocal` |
| `src/lib/kpi/matcher.ts` | **Modificar** | Substituir regex `/^(\d{4,})\s*-\s*(.+)/` no fallback ~linha 741 por `extraiLojaLocal` |
| `src/lib/parsers/escala-geral.ts` | **Modificar** | Importar `inferRedeFromLoja` de `infer-rede.ts` em vez de definir localmente |
| `src/lib/parsers/escala-universal.ts` | **Modificar** | Usar `inferRedeFromLoja`, corrigir `carro_ordem`, exportar `parseEscalaUniversal` |
| `src/lib/parsers/escala-universal.test.ts` | **Criar** | Testes: sem header, header variável, sem cor, rede única, cozinha |
| `src/app/api/kpi/simples/route.ts` | **Modificar** | Plugar `parseEscalaUniversal` na cascata com `minLinhas=1` |

---

## Task 1: Criar `extrai-loja-local.ts` com testes (Bug principal)

**Contexto:** O bug ocorre em 5 pontos do codebase porque todos usam `/^\d+\s*-\s*/` que exige o ` - ` colado ao código. Quando o Unitrac injeta `Cidade - UF` entre o código e o nome (ex: `7000730 Niterói - RJ PREZUNIC ICARAÍ`), todos falham. Esta task cria a função correta uma única vez.

**Files:**
- Create: `src/lib/parsers/extrai-loja-local.ts`
- Create: `src/lib/parsers/extrai-loja-local.test.ts`

- [ ] **Step 1: Criar o arquivo de testes (falha esperada)**

```typescript
// src/lib/parsers/extrai-loja-local.test.ts
import { describe, it, expect } from 'vitest'
import { extraiLojaLocal, temLojaLocal } from './extrai-loja-local'

describe('extraiLojaLocal — formato padrão (regressão)', () => {
  it('7000730 - PREZUNIC ICARAÍ', () => {
    expect(extraiLojaLocal('7000730 - PREZUNIC ICARAÍ')).toEqual({
      codigo_loja: '7000730',
      nome_loja: 'PREZUNIC ICARAÍ',
    })
  })

  it('9039124 - ZONA SUL BARRA', () => {
    expect(extraiLojaLocal('9039124 - ZONA SUL BARRA')).toEqual({
      codigo_loja: '9039124',
      nome_loja: 'ZONA SUL BARRA',
    })
  })

  it('código sem prefixo de rede + formato padrão ainda extrai', () => {
    const r = extraiLojaLocal('12345 - LOJA QUALQUER')
    expect(r.codigo_loja).toBe('12345')
    expect(r.nome_loja).toBe('LOJA QUALQUER')
  })
})

describe('extraiLojaLocal — formato com endereço interposto (bug confirmado)', () => {
  it('7000730 Niterói - RJ PREZUNIC ICARAÍ', () => {
    const r = extraiLojaLocal('7000730 Niterói - RJ PREZUNIC ICARAÍ')
    expect(r.codigo_loja).toBe('7000730')
    expect(r.nome_loja).toMatch(/PREZUNIC ICARAÍ/)
  })

  it('8590573 com endereço completo — PRINCESA ITABORAÍ', () => {
    const r = extraiLojaLocal(
      '8590573 26-40, NOVA CIDADE, ITABORAI, RJ, BRASIL, 50, 40, CEP 25665133 PRINCESA ITABORAÍ',
    )
    expect(r.codigo_loja).toBe('8590573')
    expect(r.nome_loja).toMatch(/PRINCESA ITABORAÍ/)
  })

  it('202006 com CEP — PAX MADUREIRA', () => {
    const r = extraiLojaLocal(
      '202006 Janeiro, Rio de Janeiro, Brasil, CEP 21351-900 PAX MADUREIRA',
    )
    expect(r.codigo_loja).toBe('202006')
    expect(r.nome_loja).toMatch(/PAX MADUREIRA/)
  })

  it('5353005 com cidade — ARMAZEM DO GRÃO (CAPELA)', () => {
    const r = extraiLojaLocal(
      '5353005 PETROPOLIS, RJ, BRASIL, 70, 60, CEP 25665133 ARMAZEM DO GRÃO (CAPELA)',
    )
    expect(r.codigo_loja).toBe('5353005')
    expect(r.nome_loja).toMatch(/ARMAZEM/)
  })
})

describe('extraiLojaLocal — não é loja', () => {
  it('BASE BENASSI retorna null', () => {
    expect(extraiLojaLocal('BASE BENASSI - BASE BENASSI')).toEqual({
      codigo_loja: null,
      nome_loja: null,
    })
  })

  it('FORA DE BASE retorna null', () => {
    expect(extraiLojaLocal('FORA DE BASE E LOCAL DE SERVIÇO')).toEqual({
      codigo_loja: null,
      nome_loja: null,
    })
  })

  it('código sem prefixo de rede + sem " - " retorna null', () => {
    // 12345 não tem prefixo de rede → não arrisca extrair
    const r = extraiLojaLocal('12345 Cidade RJ LUGAR QUALQUER')
    expect(r.codigo_loja).toBeNull()
  })
})

describe('temLojaLocal', () => {
  it('true para formato padrão', () =>
    expect(temLojaLocal('7000730 - PREZUNIC ICARAÍ')).toBe(true))

  it('true para formato com cidade-UF', () =>
    expect(temLojaLocal('7000730 Niterói - RJ PREZUNIC ICARAÍ')).toBe(true))

  it('true para formato com endereço completo', () =>
    expect(temLojaLocal('8590573 26-40, NOVA CIDADE, RJ, CEP 25665133 PRINCESA ITABORAÍ')).toBe(true))

  it('false para BASE BENASSI', () =>
    expect(temLojaLocal('BASE BENASSI - BASE BENASSI')).toBe(false))

  it('false para FORA DE BASE', () =>
    expect(temLojaLocal('FORA DE BASE E LOCAL DE SERVIÇO')).toBe(false))

  it('false para código sem prefixo + sem separador imediato', () =>
    expect(temLojaLocal('12345 cidade RJ LUGAR')).toBe(false))
})
```

- [ ] **Step 2: Rodar testes para confirmar que falham**

```
npx vitest run src/lib/parsers/extrai-loja-local.test.ts
```
Esperado: FAIL com `Cannot find module './extrai-loja-local'`

- [ ] **Step 3: Criar implementação**

```typescript
// src/lib/parsers/extrai-loja-local.ts

/**
 * Prefixos numéricos de códigos de loja por rede conhecida.
 * Mesma constante de matcher.ts e unitrac-pdf.ts — fonte única a partir daqui.
 */
export const REDE_CODIGO_PREFIX_RE =
  /^(9039|3030|7000|8590|5353|5790|9006|710[0-3]|5600|11623|17659|2384|7012|202)/

const BASE_LOCAL_SHORT = 'BASE BENASSI'
const FORA_LOCAL_SHORT = 'FORA DE BASE'

/** Remove padrões de endereço comuns que o Unitrac injeta entre código e nome da loja */
function stripEnderecoNoise(s: string): string {
  return s
    .replace(/\bCEP\s*\d{5}[-]?\d{0,3}\b/gi, '')          // "CEP 21530-900" ou "CEP 21530"
    .replace(/\b\d{5}-\d{3}\b/g, '')                        // CEP formato 12345-678
    .replace(/\b(RJ|SP|MG|RN|BA|PE|CE|GO|DF|PR|RS|SC|ES|AM|PA|MT|MS|TO)\b/g, '') // UFs
    .replace(/\b(BRASIL|BRAZIL)\b/gi, '')
    .replace(/\b\d+\b/g, '')                                 // números soltos
    .replace(/[,;]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Extrai {codigo_loja, nome_loja} de um segmento de local_parada.
 *
 * Suporta dois formatos:
 *  Formato 1: "CÓDIGO - NOME"                  (padrão Unitrac — sem ruído)
 *  Formato 2: "CÓDIGO Cidade - UF NOME"        (cidade-UF interposta)
 *  Formato 3: "CÓDIGO endereço, CEP NOME"      (endereço completo interposto)
 *
 * Segurança: Formato 2/3 só ativa quando o código bate REDE_CODIGO_PREFIX_RE,
 * evitando falsos positivos com números aleatórios.
 */
export function extraiLojaLocal(
  texto: string,
): { codigo_loja: string | null; nome_loja: string | null } {
  const t = texto.trim()

  // Rejeita marcadores que nunca são lojas
  if (t.startsWith(BASE_LOCAL_SHORT) || t.startsWith(FORA_LOCAL_SHORT)) {
    return { codigo_loja: null, nome_loja: null }
  }

  // Formato 1: "CÓDIGO - NOME" (padrão, retro-compatível)
  const exact = t.match(/^(\d+)\s*-\s*(.+)$/)
  if (exact) {
    return { codigo_loja: exact[1], nome_loja: exact[2].trim() || null }
  }

  // Formato 2/3: código no início com prefixo de rede conhecido, nome no fim
  const codeMatch = t.match(/^(\d{4,})/)
  if (!codeMatch || !REDE_CODIGO_PREFIX_RE.test(codeMatch[1])) {
    return { codigo_loja: null, nome_loja: null }
  }
  const codigo = codeMatch[1]
  const resto = t.slice(codigo.length)
  const semEndereco = stripEnderecoNoise(resto)
  if (!semEndereco || !/[A-Za-zÀ-ý]{3}/.test(semEndereco)) {
    return { codigo_loja: codigo, nome_loja: null }
  }
  return { codigo_loja: codigo, nome_loja: semEndereco }
}

/**
 * Retorna true se o segmento contém uma loja real (código + nome),
 * tolerando endereço interposto.
 * Substitui: /^\d+\s*-\s*\S/.test(p) && /[A-Za-zÀ-Ýà-ý]/.test(p)
 */
export function temLojaLocal(texto: string): boolean {
  const { codigo_loja, nome_loja } = extraiLojaLocal(texto)
  return codigo_loja !== null && nome_loja !== null
}
```

- [ ] **Step 4: Rodar testes**

```
npx vitest run src/lib/parsers/extrai-loja-local.test.ts
```
Esperado: todos PASS

- [ ] **Step 5: Commit**

```
git add src/lib/parsers/extrai-loja-local.ts src/lib/parsers/extrai-loja-local.test.ts
git commit -m "feat(parser): extrai-loja-local tolerante a endereço interposto"
```

---

## Task 2: Aplicar em `unitrac-pdf.ts`

**Contexto:** Dois pontos neste arquivo usam a regex antiga: `temLojaConcatenada` (linha ~54) e `extraiLoja` (linha ~114). A função `REDE_CODIGO_PREFIX_RE` está definida localmente e pode ser removida (Task 1 a exporta).

**Files:**
- Modify: `src/lib/parsers/unitrac-pdf.ts`

- [ ] **Step 1: Escrever teste de regressão no arquivo existente**

Abrir `src/lib/parsers/unitrac-pdf-pdfjs.test.ts` e adicionar ao final:

```typescript
// Adicionar import no topo do arquivo (junto com os outros imports):
// import { parseUnitracPdfJs } from './unitrac-pdf-pdfjs'

describe('Bug: local_parada com Cidade-UF interposta (formato 2)', () => {
  it('classifica como LOJA quando código tem prefixo de rede + nome após endereço', () => {
    // Simula o texto bruto que chegaria do PDF para GAJ-6H51 no relatorio_10202
    // "7000730 Niterói - RJ PREZUNIC ICARAÍ" deve virar classificacao=LOJA
    // Testamos a função pura indiretamente via temLojaConcatenada (que será refatorada)
    // Para isso, importamos diretamente:
    const { temLojaLocal } = require('./extrai-loja-local')
    expect(temLojaLocal('7000730 Niterói - RJ PREZUNIC ICARAÍ')).toBe(true)
    expect(temLojaLocal('8590573 26-40, NOVA CIDADE, RJ, CEP 25665133 PRINCESA ITABORAÍ')).toBe(true)
    expect(temLojaLocal('BASE BENASSI - BASE BENASSI')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar para confirmar PASS (já deve passar — Task 1 foi feita)**

```
npx vitest run src/lib/parsers/unitrac-pdf-pdfjs.test.ts
```
Esperado: PASS

- [ ] **Step 3: Aplicar substituições em `unitrac-pdf.ts`**

**3a. Adicionar import no topo** (após os imports existentes):
```typescript
import { temLojaLocal, extraiLojaLocal, REDE_CODIGO_PREFIX_RE as _REDE_PREFIX } from './extrai-loja-local'
```

**3b. Remover a constante local `REDE_CODIGO_PREFIX_RE`** (linha ~88 — era duplicata):
```typescript
// REMOVER esta linha:
const REDE_CODIGO_PREFIX_RE = /^(9039|3030|7000|8590|5353|5790|9006|710[0-3]|5600|11623|17659|2384|7012|202)/
```

**3c. Substituir o corpo de `temLojaConcatenada`** (linhas ~45-60):

Antes:
```typescript
function temLojaConcatenada(local: string): boolean {
  const partes = local.split(',').map(s => s.trim())
  for (const p of partes) {
    if (p.startsWith(BASE_LOCAL_SHORT) || p.startsWith(FORA_LOCAL_SHORT)) continue
    if (ROTA_GENERICA_RE.test(p)) continue
    if (!/^\d+\s*-\s*\S/.test(p)) continue
    if (!/[A-Za-zÀ-Ýà-ý]/.test(p)) continue
    return true
  }
  return false
}
```

Depois:
```typescript
function temLojaConcatenada(local: string): boolean {
  const partes = local.split(',').map(s => s.trim())
  for (const p of partes) {
    if (p.startsWith(BASE_LOCAL_SHORT) || p.startsWith(FORA_LOCAL_SHORT)) continue
    if (ROTA_GENERICA_RE.test(p)) continue
    if (temLojaLocal(p)) return true
  }
  return false
}
```

**3d. Substituir `extraiLoja`** (linhas ~94-160 — a função que itera partes por vírgula):

Localizar o loop `for (const parte of partes)` dentro de `extraiLoja`. Substituir o bloco que extrai código/nome de cada parte:

Antes (dentro do for):
```typescript
    const m = parte.match(PAR_LOJA)
    if (!m) continue
    const codigo = m[1]
    const nome = m[2].trim() || null
    if (REDE_CODIGO_PREFIX_RE.test(codigo)) return { codigo_loja: codigo, nome_loja: nome }
    if (!fallback) fallback = { codigo_loja: codigo, nome_loja: nome }
```

Depois:
```typescript
    const { codigo_loja: codigo, nome_loja: nome } = extraiLojaLocal(parte)
    if (!codigo) continue
    if (_REDE_PREFIX.test(codigo)) return { codigo_loja: codigo, nome_loja: nome }
    if (!fallback) fallback = { codigo_loja: codigo, nome_loja: nome }
```

Também remover a declaração `const PAR_LOJA = /^(\d+)\s+-\s+(.+)$/` se não for mais usada em outro lugar do arquivo.

- [ ] **Step 4: Rodar suite completa**

```
npx vitest run
```
Esperado: todos os testes existentes PASS (zero regressão)

- [ ] **Step 5: Commit**

```
git add src/lib/parsers/unitrac-pdf.ts src/lib/parsers/unitrac-pdf-pdfjs.test.ts
git commit -m "fix(parser): unitrac-pdf usa extraiLojaLocal tolerante a endereço interposto"
```

---

## Task 3: Aplicar em `unitrac.ts`

**Contexto:** Dois pontos: `findLojaGeofence` usa `LOJA_GF_RE = /^\d{4,}\s*-\s*\S/` e `extraiLoja` usa `target.indexOf(' - ')` sem validar dígitos.

**Files:**
- Modify: `src/lib/parsers/unitrac.ts`

- [ ] **Step 1: Adicionar import**

No topo de `unitrac.ts`, após imports existentes:
```typescript
import { temLojaLocal, extraiLojaLocal } from './extrai-loja-local'
```

- [ ] **Step 2: Substituir `LOJA_GF_RE` em `findLojaGeofence`**

Antes:
```typescript
const LOJA_GF_RE = /^\d{4,}\s*-\s*\S/

function findLojaGeofence(local: string): string | null {
  const parts = (local ?? '').split(',').map(p => p.trim())
  for (const p of parts) {
    if (LOJA_GF_RE.test(p) && !p.startsWith('BASE BENASSI') && !p.startsWith('FORA DE BASE')) {
      if (!/^\d+\s*-\s*ROTA\s/i.test(p)) return p
    }
  }
  return null
}
```

Depois:
```typescript
function findLojaGeofence(local: string): string | null {
  const parts = (local ?? '').split(',').map(p => p.trim())
  for (const p of parts) {
    if (p.startsWith('BASE BENASSI') || p.startsWith('FORA DE BASE')) continue
    if (/^\d+\s*-\s*ROTA\s/i.test(p)) continue
    if (temLojaLocal(p)) return p
  }
  return null
}
```

- [ ] **Step 3: Substituir `extraiLoja`**

Antes:
```typescript
function extraiLoja(local: string): { codigo_loja: string | null; nome_loja: string | null } {
  const target = findLojaGeofence(local) ?? primaryLocal(local)
  if (/^\d+\s*-\s*ROTA\s/i.test(target)) return { codigo_loja: null, nome_loja: null }
  const idx = target.indexOf(' - ')
  if (idx === -1) return { codigo_loja: null, nome_loja: null }
  const codigo = target.slice(0, idx).trim()
  const nome = target.slice(idx + 3).trim() || null
  return { codigo_loja: codigo || null, nome_loja: nome }
}
```

Depois:
```typescript
function extraiLoja(local: string): { codigo_loja: string | null; nome_loja: string | null } {
  const target = findLojaGeofence(local) ?? primaryLocal(local)
  if (/^\d+\s*-\s*ROTA\s/i.test(target)) return { codigo_loja: null, nome_loja: null }
  return extraiLojaLocal(target)
}
```

- [ ] **Step 4: Rodar suite completa**

```
npx vitest run
```
Esperado: todos PASS

- [ ] **Step 5: Commit**

```
git add src/lib/parsers/unitrac.ts
git commit -m "fix(parser): unitrac XLSX usa extraiLojaLocal (mesmo fix do PDF)"
```

---

## Task 4: Aplicar em `matcher.ts`

**Contexto:** O fallback de score na linha ~741 usa `/^(\d{4,})\s*-\s*(.+)/` para extrair código e nome do `local_parada`. Precisa tolerar o mesmo formato com endereço.

**Files:**
- Modify: `src/lib/kpi/matcher.ts`

- [ ] **Step 1: Adicionar import**

No topo de `matcher.ts`, após os imports existentes:
```typescript
import { extraiLojaLocal } from '@/lib/parsers/extrai-loja-local'
```

- [ ] **Step 2: Substituir o bloco de parsing do local_parada no fallback (~linha 741)**

Antes:
```typescript
    for (const parte of partes) {
      const m = parte.match(/^(\d{4,})\s*-\s*(.+)/)
      if (m) {
        const codP2 = m[1]
        const nomePart = m[2].trim()
        // ...
      } else {
        // ...
      }
    }
```

Depois (substituir apenas o `const m = ...` e as duas linhas seguintes, mantendo o resto igual):
```typescript
    for (const parte of partes) {
      const { codigo_loja: codP2Raw, nome_loja: nomePartRaw } = extraiLojaLocal(parte)
      if (codP2Raw) {
        const codP2 = codP2Raw
        const nomePart = nomePartRaw ?? ''
        // (o restante do bloco if permanece idêntico)
        const codBloqueado = isRotaGigante(codP2) && !lineCitaRota
        if (!codBloqueado && line.loja_codigo_raw && codCasa(line.loja_codigo_raw, codP2)) {
          s = 0
          break
        }
        const nomeScore = matchScore(line.loja_nome_raw, nomePart)
        if (nomeScore < s) s = nomeScore
      } else {
        // T13: Parte sem prefixo numérico — match direto por nome.
        const nomeScore = matchScore(line.loja_nome_raw, parte)
        if (nomeScore < s) s = nomeScore
      }
    }
```

- [ ] **Step 3: Rodar suite completa**

```
npx vitest run
```
Esperado: todos PASS, incluindo `matcher.test.ts` e `v21.test.ts`

- [ ] **Step 4: Commit**

```
git add src/lib/kpi/matcher.ts
git commit -m "fix(matcher): fallback de score usa extraiLojaLocal (5/5 pontos do bug)"
```

---

## Task 5: Criar `infer-rede.ts` e extrair de `escala-geral.ts`

**Contexto:** `inferRedeFromLoja` está em `escala-geral.ts` como função privada. O `escala-universal.ts` precisa dela para definir `rede_id` em vez de `DESCONHECIDO`.

**Files:**
- Create: `src/lib/parsers/infer-rede.ts`
- Create: `src/lib/parsers/infer-rede.test.ts`
- Modify: `src/lib/parsers/escala-geral.ts`

- [ ] **Step 1: Criar testes**

```typescript
// src/lib/parsers/infer-rede.test.ts
import { describe, it, expect } from 'vitest'
import { inferRedeFromLoja } from './infer-rede'

describe('inferRedeFromLoja', () => {
  it('Assaí - Ceasa - Loja 42 → ASSAI', () =>
    expect(inferRedeFromLoja('Assaí - Ceasa - Loja 42')).toBe('ASSAI'))

  it('Prezunic - Icaraí → PREZUNIC', () =>
    expect(inferRedeFromLoja('Prezunic - Icaraí')).toBe('PREZUNIC'))

  it('Princesa - Itaboraí (2ª Entrega) → PRINCESA', () =>
    expect(inferRedeFromLoja('Princesa - Itaboraí (2ª Entrega)')).toBe('PRINCESA'))

  it('Super Prix - Icaraí - Loja 10 → SUPERPRIX', () =>
    expect(inferRedeFromLoja('Super Prix - Icaraí - Loja 10')).toBe('SUPERPRIX'))

  it('Guanabara - Madureira → GUANABARA', () =>
    expect(inferRedeFromLoja('Guanabara - Madureira')).toBe('GUANABARA'))

  it('Armazém do Grão - Petrópolis → ARMAZEM_GRAO', () =>
    expect(inferRedeFromLoja('Armazém do Grão - Petrópolis')).toBe('ARMAZEM_GRAO'))

  it('Atacadão Belford Roxo → ATACADAO', () =>
    expect(inferRedeFromLoja('Atacadão Belford Roxo')).toBe('ATACADAO'))

  it('loja desconhecida → DESCONHECIDO', () =>
    expect(inferRedeFromLoja('Empório Barra Tower')).toBe('DESCONHECIDO'))

  it('string vazia → DESCONHECIDO', () =>
    expect(inferRedeFromLoja('')).toBe('DESCONHECIDO'))
})
```

- [ ] **Step 2: Rodar para confirmar falha**

```
npx vitest run src/lib/parsers/infer-rede.test.ts
```
Esperado: FAIL com `Cannot find module './infer-rede'`

- [ ] **Step 3: Criar `infer-rede.ts`** — copiar a lógica de `escala-geral.ts:120-140`

```typescript
// src/lib/parsers/infer-rede.ts

function normText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
}

/**
 * Infere rede_id a partir do nome da loja (texto livre da escala).
 * Retorna 'DESCONHECIDO' quando não reconhece.
 */
export function inferRedeFromLoja(nome: string): string {
  const n = normText(nome)
  if (n.includes('ASSAI') || n.includes('ASSAÍ')) return 'ASSAI'
  if (n.includes('ATACADAO') || n.includes('ATACADÃO')) return 'ATACADAO'
  if (n.includes('CARREFOUR')) return 'CARREFOUR'
  if (n.includes('PREZUNIC')) return 'PREZUNIC'
  if (n.includes('PRINCESA')) return 'PRINCESA'
  if (n.includes('GUANABARA')) return 'GUANABARA'
  if (n.includes("SAM'S") || n.includes('SAMS')) return 'SAMS_CLUB'
  if (n.includes('VIANENSE')) return 'VIANENSE'
  if (n.includes('CAB') && n.includes('PETROPOLIS')) return 'CAB_PETROPOLIS'
  if (n.includes('SENDAS')) return 'SENDAS'
  if (n.includes('FEIRA NOVA')) return 'FEIRA_NOVA'
  if (n.includes('EMANUEL')) return 'EMANUEL'
  if ((n.includes('ARMAZEM') || n.includes('ARMAZÉM')) && (n.includes('GRAO') || n.includes('GRÃO'))) return 'ARMAZEM_GRAO'
  if (n.includes('SUPER PAX') || n.includes('SUPERPAX')) return 'SUPER_PAX'
  if (n.includes('SUPERCOMPRAS')) return 'SUPERCOMPRAS'
  if (n.includes('SUPER PRIX') || n.includes('SUPERPRIX')) return 'SUPERPRIX'
  if (n.includes('MUNDIAL')) return 'MUNDIAL'
  if (n.includes('ZONA SUL') || n.includes('ZONA_SUL')) return 'ZONA_SUL'
  return 'DESCONHECIDO'
}
```

- [ ] **Step 4: Rodar testes**

```
npx vitest run src/lib/parsers/infer-rede.test.ts
```
Esperado: todos PASS

- [ ] **Step 5: Atualizar `escala-geral.ts` para importar em vez de redefinir**

Adicionar no topo de `escala-geral.ts`:
```typescript
import { inferRedeFromLoja } from './infer-rede'
```

Deletar a função local `inferRedeFromLoja` (linhas 120-140 de `escala-geral.ts`).

- [ ] **Step 6: Rodar suite completa**

```
npx vitest run
```
Esperado: todos PASS

- [ ] **Step 7: Commit**

```
git add src/lib/parsers/infer-rede.ts src/lib/parsers/infer-rede.test.ts src/lib/parsers/escala-geral.ts
git commit -m "refactor(parser): extrai inferRedeFromLoja para módulo compartilhado"
```

---

## Task 6: Melhorar `escala-universal.ts`

**Contexto:** Atualmente o parser universal sempre produz `rede_id: 'DESCONHECIDO'` e `carro_ordem: 1`. Com `inferRedeFromLoja` disponível, dá para resolver os dois.

**Files:**
- Modify: `src/lib/parsers/escala-universal.ts`
- Create: `src/lib/parsers/escala-universal.test.ts`

- [ ] **Step 1: Criar testes**

```typescript
// src/lib/parsers/escala-universal.test.ts
import ExcelJS from 'exceljs'
import { describe, it, expect } from 'vitest'
import { parseEscalaUniversal } from './escala-universal'

/** Constrói XLSX em memória com as linhas fornecidas */
async function buildXlsx(rows: Array<Record<string, string | number | null>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Planilha1')
  if (rows.length === 0) return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
  // Header a partir das chaves do primeiro objeto
  const headers = Object.keys(rows[0])
  ws.addRow(headers)
  for (const row of rows) ws.addRow(headers.map(h => row[h] ?? null))
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}

describe('parseEscalaUniversal — detecção por cabeçalho', () => {
  it('detecta colunas PLACA e LOJA e infere rede', async () => {
    const buf = await buildXlsx([
      { PLACA: 'GAJ-6H51', LOJA: 'Prezunic - Icaraí', MOTORISTA: 'ESTELITA' },
      { PLACA: 'EZU-9325', LOJA: 'Assaí - Ceasa - Loja 42', MOTORISTA: 'ANTONIO CARLOS' },
    ])
    const linhas = await parseEscalaUniversal(buf, '2026-06-10')
    expect(linhas).toHaveLength(2)
    expect(linhas[0].placa_norm).toBe('GAJ6H51')
    expect(linhas[0].rede_id).toBe('PREZUNIC')
    expect(linhas[1].rede_id).toBe('ASSAI')
  })

  it('aceita cabeçalho VEÍCULO em vez de PLACA', async () => {
    const buf = await buildXlsx([
      { VEÍCULO: 'KZC-4D39', LOJA: 'Super Prix - Icaraí', MOTORISTA: 'RODRIGO' },
    ])
    const linhas = await parseEscalaUniversal(buf, '2026-06-10')
    expect(linhas[0].placa_norm).toBe('KZC4D39')
    expect(linhas[0].rede_id).toBe('SUPERPRIX')
  })

  it('aceita cabeçalho ROTA em vez de LOJA', async () => {
    const buf = await buildXlsx([
      { PLACA: 'ABC1234', ROTA: 'Guanabara - Bonsucesso', MOTORISTA: 'JOSE' },
    ])
    const linhas = await parseEscalaUniversal(buf, '2026-06-10')
    expect(linhas[0].rede_id).toBe('GUANABARA')
  })
})

describe('parseEscalaUniversal — sem cabeçalho (detecção por padrão de placa)', () => {
  it('acha coluna de placa por regex e infere loja da coluna adjacente', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Planilha1')
    // Sem linha de cabeçalho — col 1=loja, col 2=placa
    ws.addRow(['Atacadão Belford Roxo', 'LSN-6I73'])
    ws.addRow(['Prezunic - Icaraí', 'GAJ-6H51'])
    const buf = Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
    const linhas = await parseEscalaUniversal(buf, '2026-06-10')
    expect(linhas.length).toBeGreaterThanOrEqual(1)
    const gaj = linhas.find(l => l.placa_norm === 'GAJ6H51')
    expect(gaj?.rede_id).toBe('PREZUNIC')
  })
})

describe('parseEscalaUniversal — carro_ordem', () => {
  it('segunda linha da mesma loja recebe carro_ordem=2', async () => {
    const buf = await buildXlsx([
      { PLACA: 'ABC1234', LOJA: 'Assaí - Barra II', MOTORISTA: 'JOAO' },
      { PLACA: 'DEF5678', LOJA: 'Assaí - Barra II', MOTORISTA: 'PEDRO' },
      { PLACA: 'GHI9012', LOJA: 'Prezunic - Botafogo', MOTORISTA: 'CARLOS' },
    ])
    const linhas = await parseEscalaUniversal(buf, '2026-06-10')
    expect(linhas[0].carro_ordem).toBe(1)
    expect(linhas[1].carro_ordem).toBe(2)
    expect(linhas[2].carro_ordem).toBe(1)
  })
})

describe('parseEscalaUniversal — rede única (caso ela filtrar a escala)', () => {
  it('retorna linhas quando só há uma rede na planilha', async () => {
    const buf = await buildXlsx([
      { PLACA: 'ABC1234', LOJA: 'Assaí - Ceasa - Loja 42', MOTORISTA: 'ANTONIO CARLOS' },
    ])
    const linhas = await parseEscalaUniversal(buf, '2026-06-10')
    expect(linhas).toHaveLength(1)
    expect(linhas[0].rede_id).toBe('ASSAI')
  })
})
```

- [ ] **Step 2: Rodar para confirmar falha**

```
npx vitest run src/lib/parsers/escala-universal.test.ts
```
Esperado: FAIL (rede_id=DESCONHECIDO, carro_ordem sempre 1)

- [ ] **Step 3: Atualizar `escala-universal.ts`**

Adicionar import no topo:
```typescript
import { inferRedeFromLoja } from './infer-rede'
```

Substituir a função `parsearAbaXlsx` inteira:

```typescript
function parsearAbaXlsx(sheet: ExcelJS.Worksheet, dataAlvo?: string): LinhaEscala[] {
  const data = extrairData(sheet, dataAlvo)
  if (!data) return []

  const cabecalho = detectarCabecalho(sheet)
  const colMap = cabecalho?.colMap ?? detectarColunaPorPadrao(sheet)
  if (colMap.size === 0) return []

  const startRow = cabecalho ? cabecalho.rowIdx + 1 : 1
  const linhas: LinhaEscala[] = []

  // Contador de carro_ordem por nome de loja normalizado
  const contagemLoja = new Map<string, number>()

  sheet.eachRow((row, rIdx) => {
    if (rIdx < startRow) return

    const get = (f: FieldKey) => {
      const col = colMap.get(f)
      return col ? String(row.getCell(col).value ?? '').trim() : ''
    }

    const placaRaw = get('placa')
    const lojaRaw = get('loja')
    const motoristaRaw = get('motorista')

    if (!placaRaw && !lojaRaw && !motoristaRaw) return

    const placaNorm = placaValida(placaRaw) ? normalizaPlaca(placaRaw) : ''
    const redeId = inferRedeFromLoja(lojaRaw)

    // carro_ordem: conta quantas vezes essa loja já apareceu
    const lojaKey = lojaRaw.toUpperCase().trim()
    const ordemAtual = (contagemLoja.get(lojaKey) ?? 0) + 1
    contagemLoja.set(lojaKey, ordemAtual)
    const carro_ordem: 1 | 2 = ordemAtual >= 2 ? 2 : 1

    linhas.push({
      data,
      data_entrega: data,
      rede_id: redeId,
      loja_nome_raw: lojaRaw || '',
      loja_codigo_raw: get('codigo') || null,
      placa_norm: placaNorm,
      placa_raw: placaRaw || null,
      motorista_nome: motoristaRaw || null,
      motorista_codigo: null,
      tipo_carro: get('carro') || null,
      carro_ordem,
      turno: 'MANHA',
      tipo_emissao: 'NORMAL',
      obs: null,
      restricao: null,
      peso_kg: null,
      paletes: null,
      raw_row_num: rIdx,
    })
  })

  return linhas
}
```

- [ ] **Step 4: Rodar testes**

```
npx vitest run src/lib/parsers/escala-universal.test.ts
```
Esperado: todos PASS

- [ ] **Step 5: Rodar suite completa**

```
npx vitest run
```
Esperado: todos PASS

- [ ] **Step 6: Commit**

```
git add src/lib/parsers/escala-universal.ts src/lib/parsers/escala-universal.test.ts
git commit -m "feat(parser): escala-universal infere rede_id e carro_ordem corretamente"
```

---

## Task 7: Plugar `escala-universal` na cascata do `/kpi/simples`

**Contexto:** O `escala-universal.ts` está pronto mas nunca é tentado. Aqui o plugamos como último fallback com `minLinhas=1` (em vez de `MIN=3`), resolvendo: escala com rede única, escala sem cor, escala cozinha, qualquer planilha nova.

**Files:**
- Modify: `src/app/api/kpi/simples/route.ts`

- [ ] **Step 1: Adicionar import**

No topo de `route.ts`, junto com os outros imports de parser:
```typescript
import { parseEscalaUniversal } from '@/lib/parsers/escala-universal'
```

- [ ] **Step 2: Substituir a cascata de tentativas**

Localizar o bloco (linha ~195):
```typescript
        const tentativas: Array<() => Promise<LinhaEscala[]>> = [
          () => parseEscalaZonaSul(escalaBuffer, data),
          () => parseEscalaArmazemGrao(escalaBuffer, data),
          () => parseEscalaPax(escalaBuffer, data),
          () => parseEscalaGeral(escalaBuffer, data),
        ]
        for (const fn of tentativas) {
          try {
            const r = await fn()
            if (r.length >= MIN) { linhasDoArquivo = r; break }
          } catch { /* próximo */ }
        }
```

Substituir por:
```typescript
        const tentativas: Array<{ fn: () => Promise<LinhaEscala[]>; min: number }> = [
          { fn: () => parseEscalaZonaSul(escalaBuffer, data),     min: MIN },
          { fn: () => parseEscalaArmazemGrao(escalaBuffer, data), min: MIN },
          { fn: () => parseEscalaPax(escalaBuffer, data),         min: MIN },
          { fn: () => parseEscalaGeral(escalaBuffer, data),       min: MIN },
          { fn: () => parseEscalaUniversal(escalaBuffer, data),   min: 1   },
        ]
        for (const { fn, min } of tentativas) {
          try {
            const r = await fn()
            if (r.length >= min) { linhasDoArquivo = r; break }
          } catch { /* próximo */ }
        }
```

- [ ] **Step 3: Rodar typecheck**

```
npx tsc --noEmit
```
Esperado: 0 erros

- [ ] **Step 4: Rodar suite completa**

```
npx vitest run
```
Esperado: todos PASS (344+)

- [ ] **Step 5: Commit**

```
git add src/app/api/kpi/simples/route.ts
git commit -m "feat(kpi): escala-universal como fallback final na cascata (suporta qualquer formato)"
```

---

## Self-Review

### Cobertura do spec

| Requisito | Task que implementa |
|-----------|-------------------|
| Escala sem cor de fundo funciona | Task 7 — universal não lê cor |
| Escala com uma rede só funciona | Task 7 — `min: 1` para universal |
| Escala cozinha vai no fluxo KPI | Task 7 — universal como fallback |
| `CÓDIGO Cidade-UF NOME` vira LOJA | Tasks 1-4 — 5 pontos corrigidos |
| `carro_ordem` correto no universal | Task 6 — contador por loja |
| `rede_id` correto no universal | Tasks 5-6 — `inferRedeFromLoja` |

### Scan de placeholders

Nenhum TBD, TODO, ou "implementar depois" nas tasks acima.

### Consistência de tipos

- `extraiLojaLocal` retorna `{ codigo_loja: string | null; nome_loja: string | null }` — mesmo shape de `extraiLoja` existente em unitrac-pdf.ts e unitrac.ts. Compatível com os callsites.
- `inferRedeFromLoja(nome: string): string` — igual à assinatura atual privada em escala-geral.ts.
- `parseEscalaUniversal(buffer, dataAlvo?)` — assinatura existente, não muda.
- `carro_ordem: 1 | 2` — tipo correto de `LinhaEscala`.
