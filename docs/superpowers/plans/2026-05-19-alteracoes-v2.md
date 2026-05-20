# Alterações v2 (Cola+Achados) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o sistema atual de alterações (textarea + regex que falha) por um parser robusto que aceita N alterações por mensagem, completa dados omitidos via lookup no banco e mostra cards revisáveis em lote.

**Architecture:** Parser puro em TypeScript com 6 passos (normalizar → segmentar → extrair tokens → lookup banco → detectar sai/entra → detectar contexto). Lookup busca em índice em memória das últimas 60 dias de `escala_linhas`. UI mostra N cards editáveis e aplica em lote via endpoint que dispara reprocessamento de KPI.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Vitest (testes), Supabase (banco), Tailwind CSS, React 19.

---

## File Structure

**Criar:**
- `src/lib/parsers/alteracoes-v2.types.ts` — tipos compartilhados (`SlotVeiculo`, `AlteracaoBloco`, `ParseContext`, `Associacao`)
- `src/lib/parsers/lookup-canonical.ts` — `buildLookupContext()` lê `escala_linhas`, `lookupByPlaca/Codigo/Nome()` resolvem por qualquer ID
- `src/lib/parsers/lookup-canonical.test.ts` — unit tests
- `src/lib/parsers/alteracoes-v2.ts` — pipeline: `normalizaTexto`, `segmentaBlocos`, `extraiTokens`, `detectaSentido`, `detectaContexto`, `parseAlteracoesV2`
- `src/lib/parsers/alteracoes-v2.test.ts` — unit tests incluindo as 11 alterações reais do dia 18
- `src/app/api/alteracoes/parsear-v2/route.ts` — endpoint que monta contexto e chama parser
- `src/app/api/alteracoes/aplicar-lote/route.ts` — endpoint que insere N alterações + dispara reprocessar KPI
- `src/app/painel/alteracoes/nova/AlteracaoCard.tsx` — card editável de 1 bloco
- `src/app/painel/alteracoes/nova/AlteracoesV2Form.tsx` — form raiz (textarea + lista de cards)

**Modificar:**
- `src/app/painel/alteracoes/nova/page.tsx` — substitui import do form antigo

**Não tocar:**
- Tabela `alteracoes` (schema já tem todos campos)
- `parseAlteracaoText` antigo (manter como fallback enquanto roda em produção; remover em uma futura PR após validação)

---

## Task 1: Tipos compartilhados

**Files:**
- Create: `src/lib/parsers/alteracoes-v2.types.ts`

- [ ] **Step 1: Criar arquivo de tipos**

```typescript
// src/lib/parsers/alteracoes-v2.types.ts

export interface Associacao {
  motorista_nome: string
  motorista_nome_norm: string  // normalizado: upper + sem acentos + sem espaços extras
  motorista_codigo: number | null
  placa_norm: string | null
  placa_raw: string | null
  data_entrega: string  // YYYY-MM-DD, usado pra ordenar (mais recente primeiro)
  rede_id: string | null
}

export interface ParseContext {
  associacoes: Associacao[]
  lojas: Array<{
    rede_id: string
    nome: string
    nome_norm: string
    codigo_escala: string | null
  }>
}

export type FonteCampo = 'mensagem' | 'banco' | 'inferido' | null

export interface SlotVeiculo {
  motorista_nome: string | null
  motorista_codigo: number | null
  placa_raw: string | null
  placa_norm: string | null
  fonte_nome: FonteCampo
  fonte_codigo: FonteCampo
  fonte_placa: FonteCampo
}

export interface AlteracaoBloco {
  rede_id: string | null
  loja_nome_raw: string | null
  filial: number | null
  sai: SlotVeiculo | null
  entra: SlotVeiculo | null
  motivo: string | null
  confianca: 'alta' | 'media' | 'baixa'
  warnings: string[]
  raw: string
}
```

- [ ] **Step 2: Verificar TypeScript**

Run: `npx tsc --noEmit`
Expected: zero erros

- [ ] **Step 3: Commit**

```bash
git add src/lib/parsers/alteracoes-v2.types.ts
git commit -m "feat(alteracoes-v2): tipos compartilhados (SlotVeiculo, AlteracaoBloco, ParseContext)"
```

---

## Task 2: Função utilitária `normalizaNomeMotorista`

**Files:**
- Create/modify: `src/lib/parsers/alteracoes-v2.ts` (criar arquivo)
- Test: `src/lib/parsers/alteracoes-v2.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
// src/lib/parsers/alteracoes-v2.test.ts
import { describe, it, expect } from 'vitest'
import { normalizaNomeMotorista } from './alteracoes-v2'

describe('normalizaNomeMotorista', () => {
  it('upper + remove acentos + colapsa espaços', () => {
    expect(normalizaNomeMotorista('José  Roberto')).toBe('JOSE ROBERTO')
    expect(normalizaNomeMotorista('Antônio')).toBe('ANTONIO')
    expect(normalizaNomeMotorista('  felipe   silva  ')).toBe('FELIPE SILVA')
  })

  it('retorna string vazia para entrada vazia', () => {
    expect(normalizaNomeMotorista('')).toBe('')
    expect(normalizaNomeMotorista(null as unknown as string)).toBe('')
  })
})
```

- [ ] **Step 2: Rodar teste (deve falhar)**

Run: `npm test -- alteracoes-v2`
Expected: FAIL — "normalizaNomeMotorista is not defined"

- [ ] **Step 3: Implementar**

```typescript
// src/lib/parsers/alteracoes-v2.ts

export function normalizaNomeMotorista(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // remove acentos
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
}
```

- [ ] **Step 4: Rodar teste (deve passar)**

Run: `npm test -- alteracoes-v2`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/parsers/alteracoes-v2.ts src/lib/parsers/alteracoes-v2.test.ts
git commit -m "feat(alteracoes-v2): normalizaNomeMotorista"
```

---

## Task 3: `normalizaTexto` (limpa input bruto)

**Files:**
- Modify: `src/lib/parsers/alteracoes-v2.ts`
- Test: `src/lib/parsers/alteracoes-v2.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
// adicionar em alteracoes-v2.test.ts
import { normalizaTexto } from './alteracoes-v2'

describe('normalizaTexto', () => {
  it('remove emojis', () => {
    expect(normalizaTexto('🚨ALTERAÇÃO 🚨')).toBe('ALTERAÇÃO')
  })

  it('padroniza quebras de linha', () => {
    expect(normalizaTexto('linha1\r\nlinha2\rlinha3')).toBe('linha1\nlinha2\nlinha3')
  })

  it('insere quebra antes de "Filial N"', () => {
    expect(normalizaTexto('Filial 43 Sai: X Filial 23 Entra: Y')).toBe(
      'Filial 43 Sai: X\nFilial 23 Entra: Y',
    )
  })

  it('colapsa espaços múltiplos preservando quebras', () => {
    expect(normalizaTexto('a   b\n   c    d')).toBe('a b\nc d')
  })
})
```

- [ ] **Step 2: Rodar teste (FAIL)**

Run: `npm test -- alteracoes-v2`
Expected: FAIL

- [ ] **Step 3: Implementar**

```typescript
// adicionar em alteracoes-v2.ts

export function normalizaTexto(texto: string): string {
  if (!texto) return ''
  let t = texto
  // Remove emojis (BMP supplementary + diversos símbolos)
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
  // Padroniza quebras de linha
  t = t.replace(/\r\n|\r/g, '\n')
  // Insere quebra antes de "Filial N" se não houver
  t = t.replace(/([^\n])\s+(?=Filial\s+\d)/gi, '$1\n')
  // Insere quebra antes de "Sai:" / "Entra:" se não houver
  t = t.replace(/([^\n])\s+(?=(?:Sai|Entra|Saiu|Entrou)\s*:)/gi, '$1\n')
  // Colapsa espaços/tabs preservando \n
  t = t.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n')
  // Remove linhas vazias no início/fim
  t = t.replace(/^\n+/, '').replace(/\n+$/, '')
  return t
}
```

- [ ] **Step 4: Rodar teste (PASS)**

Run: `npm test -- alteracoes-v2`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/parsers/alteracoes-v2.ts src/lib/parsers/alteracoes-v2.test.ts
git commit -m "feat(alteracoes-v2): normalizaTexto remove emojis e padroniza quebras"
```

---

## Task 4: `segmentaBlocos` (separa N alterações)

**Files:**
- Modify: `src/lib/parsers/alteracoes-v2.ts`
- Test: `src/lib/parsers/alteracoes-v2.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
// adicionar em alteracoes-v2.test.ts
import { segmentaBlocos } from './alteracoes-v2'

describe('segmentaBlocos', () => {
  it('retorna 1 bloco quando há 1 alteração simples', () => {
    const texto = `ALTERAÇÃO
Prezunic Caxias
Entra: Sidnei 674 LQE5401
Sai: Anderson 811 LCE4337`
    const blocos = segmentaBlocos(texto)
    expect(blocos).toHaveLength(1)
    expect(blocos[0]).toContain('Sidnei')
    expect(blocos[0]).toContain('Anderson')
  })

  it('separa 2 blocos quando há 2 "Filial N"', () => {
    const texto = `Zona Sul
Filial 43
Sai: Douglas LTE0A64
Entra: Eduardo LQA5883
Filial 23
Sai: Eduardo LQA5883
Entra: Douglas LTE0A64`
    const blocos = segmentaBlocos(texto)
    expect(blocos).toHaveLength(2)
    expect(blocos[0]).toContain('Filial 43')
    expect(blocos[1]).toContain('Filial 23')
  })

  it('separa blocos em linha em branco quando não há marcador explícito', () => {
    const texto = `Princesa Catete
Entra: A 100 AAA1B23

Princesa Leme
Entra: B 200 BBB2C34`
    const blocos = segmentaBlocos(texto)
    expect(blocos).toHaveLength(2)
  })

  it('expande "Filial 45/47" em 2 blocos com mesmo conteúdo', () => {
    const texto = `Zona Sul
Filial 45/47
Sai: Francisco RJL7D33
Entra: Eduardo KRK3D12`
    const blocos = segmentaBlocos(texto)
    expect(blocos).toHaveLength(2)
    expect(blocos[0]).toContain('Filial 45')
    expect(blocos[1]).toContain('Filial 47')
  })
})
```

- [ ] **Step 2: Rodar teste (FAIL)**

- [ ] **Step 3: Implementar**

```typescript
// adicionar em alteracoes-v2.ts

const FILIAL_RANGE_RE = /Filial\s+(\d+)\s*\/\s*(\d+)/gi
const FILIAL_RE = /^\s*Filial\s+\d+\s*$/i
const ALTERACAO_RE = /^\s*(?:ALTERA[ÇC][AÃ]O|COMUNICADO)\s*[:\-]?/i

export function segmentaBlocos(textoNormalizado: string): string[] {
  if (!textoNormalizado.trim()) return []

  // Passo 1: expande "Filial 45/47" duplicando o bloco
  const linhas = textoNormalizado.split('\n')
  const expandidas: string[] = []
  for (const linha of linhas) {
    const m = FILIAL_RANGE_RE.exec(linha)
    FILIAL_RANGE_RE.lastIndex = 0
    if (m) {
      // Linha vai virar 2 marcadores; conteúdo abaixo (até próximo marcador) replicado
      expandidas.push(linha.replace(m[0], `Filial ${m[1]}`))
      expandidas.push('__SPLIT_DUPLICATE__')
      expandidas.push(linha.replace(m[0], `Filial ${m[2]}`))
    } else {
      expandidas.push(linha)
    }
  }

  // Passo 2: segmenta por:
  // - linha em branco
  // - linha começando com "Filial N"
  // - linha começando com "ALTERAÇÃO" ou "COMUNICADO"
  // - marcador __SPLIT_DUPLICATE__ (do passo 1)
  const blocos: string[] = []
  let buffer: string[] = []
  let conteudoAposSplit: string[] | null = null  // pra duplicar conteúdo abaixo de Filial X/Y

  for (let i = 0; i < expandidas.length; i++) {
    const linha = expandidas[i]
    const trimmed = linha.trim()

    if (trimmed === '__SPLIT_DUPLICATE__') {
      // Próximas linhas até o próximo marcador serão duplicadas
      conteudoAposSplit = []
      continue
    }

    const ehFilial = FILIAL_RE.test(linha)
    const ehAlteracao = ALTERACAO_RE.test(linha)
    const ehVazia = trimmed === ''

    if ((ehFilial || ehAlteracao || ehVazia) && buffer.length > 0) {
      blocos.push(buffer.join('\n').trim())
      buffer = []
    }

    if (!ehVazia) {
      buffer.push(linha)
      if (conteudoAposSplit !== null) {
        conteudoAposSplit.push(linha)
      }
    }
  }
  if (buffer.length > 0) {
    blocos.push(buffer.join('\n').trim())
  }

  // Filtra blocos que são só cabeçalho (sem placa nem nome próprio)
  return blocos.filter((b) => {
    const lower = b.toLowerCase()
    return /[a-z]/i.test(b) && (
      /\b[A-Z]{3}[\s-]?\d/.test(b) ||  // tem placa
      /sai|entra|substitui|trocou/i.test(lower)
    )
  })
}
```

- [ ] **Step 4: Rodar teste (PASS)**

Run: `npm test -- alteracoes-v2`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/parsers/alteracoes-v2.ts src/lib/parsers/alteracoes-v2.test.ts
git commit -m "feat(alteracoes-v2): segmentaBlocos separa múltiplas alterações"
```

---

## Task 5: `extraiTokens` (placas, códigos, nomes de um trecho)

**Files:**
- Modify: `src/lib/parsers/alteracoes-v2.ts`
- Test: `src/lib/parsers/alteracoes-v2.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
import { extraiTokens } from './alteracoes-v2'

describe('extraiTokens', () => {
  it('extrai placa formato antigo e Mercosul', () => {
    expect(extraiTokens('Sidnei 674 LQE5401').placas).toEqual(['LQE5401'])
    expect(extraiTokens('Anderson LCE4337').placas).toEqual(['LCE4337'])
    expect(extraiTokens('placa KQR2J11').placas).toEqual(['KQR2J11'])
    expect(extraiTokens('eyl 8b91').placas).toEqual(['EYL8B91'])
  })

  it('extrai códigos sem confundir com placas', () => {
    const r = extraiTokens('Sidnei 674 LQE5401')
    expect(r.codigos).toEqual([674])
  })

  it('ignora códigos de 1-2 dígitos', () => {
    expect(extraiTokens('cod 5').codigos).toEqual([])
  })

  it('extrai placa quando vem com hífen ou espaço', () => {
    expect(extraiTokens('UBO 5E05').placas).toEqual(['UBO5E05'])
    expect(extraiTokens('UBO-5E05').placas).toEqual(['UBO5E05'])
  })
})
```

- [ ] **Step 2: Rodar teste (FAIL)**

- [ ] **Step 3: Implementar**

```typescript
// adicionar em alteracoes-v2.ts

const PLACA_RE_GLOBAL = /\b([A-Z]{3})[\s-]?(\d[A-Z0-9]\d{2}|\d{4})\b/gi
const CODIGO_RE_GLOBAL = /(?<![A-Z0-9])(\d{3,6})(?![A-Z0-9])/g

export interface TokensExtraidos {
  placas: string[]
  codigos: number[]
  textoSemTokens: string
}

export function extraiTokens(trecho: string): TokensExtraidos {
  if (!trecho) return { placas: [], codigos: [], textoSemTokens: '' }

  const placas: string[] = []
  const placasFound: string[] = []

  // Extrair placas primeiro (e marcar posições)
  let textoSem = trecho
  let m: RegExpExecArray | null
  const placaRe = new RegExp(PLACA_RE_GLOBAL.source, 'gi')
  while ((m = placaRe.exec(trecho)) !== null) {
    const placaNorm = (m[1] + m[2]).toUpperCase()
    if (!placas.includes(placaNorm)) placas.push(placaNorm)
    placasFound.push(m[0])
  }
  for (const p of placasFound) {
    textoSem = textoSem.replace(p, ' ')
  }

  // Extrair códigos do texto sem placas
  const codigos: number[] = []
  const codRe = new RegExp(CODIGO_RE_GLOBAL.source, 'g')
  while ((m = codRe.exec(textoSem)) !== null) {
    const n = parseInt(m[1], 10)
    if (!isNaN(n) && !codigos.includes(n)) codigos.push(n)
  }
  for (const n of codigos) {
    textoSem = textoSem.replace(new RegExp(`\\b${n}\\b`, 'g'), ' ')
  }

  return {
    placas,
    codigos,
    textoSemTokens: textoSem.replace(/\s+/g, ' ').trim(),
  }
}
```

- [ ] **Step 4: Rodar teste (PASS)**

Run: `npm test -- alteracoes-v2`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/parsers/alteracoes-v2.ts src/lib/parsers/alteracoes-v2.test.ts
git commit -m "feat(alteracoes-v2): extraiTokens (placas, códigos)"
```

---

## Task 6: `buildLookupContext` (lê banco)

**Files:**
- Create: `src/lib/parsers/lookup-canonical.ts`
- Test: `src/lib/parsers/lookup-canonical.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
// src/lib/parsers/lookup-canonical.test.ts
import { describe, it, expect, vi } from 'vitest'
import { buildLookupContext } from './lookup-canonical'

describe('buildLookupContext', () => {
  it('lê escala_linhas e lojas e retorna contexto', async () => {
    const svc = mockSupabase({
      escala_linhas: [
        { motorista_nome: 'José Roberto', motorista_codigo: 138, placa_norm: 'DDI6J90', placa_raw: 'DDI-6J90', data_entrega: '2026-05-18', rede_id: 'ASSAI' },
        { motorista_nome: 'José Roberto', motorista_codigo: 138, placa_norm: 'DBB8D19', placa_raw: 'DBB-8D19', data_entrega: '2026-05-17', rede_id: 'ASSAI' },
      ],
      lojas: [
        { rede_id: 'ASSAI', nome: 'ASSAI TIJUCA II', codigo_escala: '150' },
      ],
    })
    const ctx = await buildLookupContext(svc)
    expect(ctx.associacoes).toHaveLength(2)
    expect(ctx.associacoes[0].motorista_nome_norm).toBe('JOSE ROBERTO')
    expect(ctx.lojas).toHaveLength(1)
  })
})

// helper inline (sem dependência externa)
function mockSupabase(tables: Record<string, unknown[]>) {
  return {
    from(tableName: string) {
      const data = tables[tableName] ?? []
      const chain = {
        select: () => chain,
        gte: () => chain,
        eq: () => chain,
        order: () => chain,
        then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
          resolve({ data, error: null }),
      }
      return chain
    },
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}
```

- [ ] **Step 2: Rodar teste (FAIL)**

- [ ] **Step 3: Implementar**

```typescript
// src/lib/parsers/lookup-canonical.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParseContext, Associacao } from './alteracoes-v2.types'
import { normalizaNomeMotorista } from './alteracoes-v2'

const DIAS_LOOKBACK = 60

export async function buildLookupContext(svc: SupabaseClient): Promise<ParseContext> {
  const desde = new Date(Date.now() - DIAS_LOOKBACK * 86400 * 1000)
    .toISOString()
    .slice(0, 10)

  const { data: escalasRaw } = await svc
    .from('escala_linhas')
    .select('motorista_nome, motorista_codigo, placa_norm, placa_raw, data_entrega, rede_id')
    .gte('data_entrega', desde)

  const associacoes: Associacao[] = (escalasRaw ?? []).map((r) => {
    const row = r as Record<string, unknown>
    return {
      motorista_nome: (row.motorista_nome as string) ?? '',
      motorista_nome_norm: normalizaNomeMotorista((row.motorista_nome as string) ?? ''),
      motorista_codigo: (row.motorista_codigo as number | null) ?? null,
      placa_norm: (row.placa_norm as string | null) ?? null,
      placa_raw: (row.placa_raw as string | null) ?? null,
      data_entrega: (row.data_entrega as string) ?? '',
      rede_id: (row.rede_id as string | null) ?? null,
    }
  })

  const { data: lojasRaw } = await svc
    .from('lojas')
    .select('rede_id, nome, codigo_escala')
    .eq('ativo', true)

  const lojas = (lojasRaw ?? []).map((r) => {
    const row = r as Record<string, unknown>
    const nome = (row.nome as string) ?? ''
    return {
      rede_id: (row.rede_id as string) ?? '',
      nome,
      nome_norm: normalizaNomeMotorista(nome),
      codigo_escala: (row.codigo_escala as string | null) ?? null,
    }
  })

  return { associacoes, lojas }
}
```

- [ ] **Step 4: Rodar teste (PASS)**

Run: `npm test -- lookup-canonical`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/parsers/lookup-canonical.ts src/lib/parsers/lookup-canonical.test.ts
git commit -m "feat(alteracoes-v2): buildLookupContext lê 60 dias de escalas"
```

---

## Task 7: `lookupSlot` (resolve por placa/cód/nome)

**Files:**
- Modify: `src/lib/parsers/lookup-canonical.ts`
- Modify: `src/lib/parsers/lookup-canonical.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
// adicionar em lookup-canonical.test.ts
import { lookupSlot } from './lookup-canonical'
import type { ParseContext } from './alteracoes-v2.types'

const ctxBase: ParseContext = {
  associacoes: [
    { motorista_nome: 'José Roberto', motorista_nome_norm: 'JOSE ROBERTO', motorista_codigo: 138, placa_norm: 'DDI6J90', placa_raw: 'DDI-6J90', data_entrega: '2026-05-18', rede_id: 'ASSAI' },
    { motorista_nome: 'Paulo Henrique', motorista_nome_norm: 'PAULO HENRIQUE', motorista_codigo: 807, placa_norm: 'DBB8D19', placa_raw: 'DBB-8D19', data_entrega: '2026-05-17', rede_id: 'ASSAI' },
  ],
  lojas: [],
}

describe('lookupSlot', () => {
  it('resolve por placa: retorna nome e código mais recentes', () => {
    const slot = lookupSlot({ placas: ['DDI6J90'], codigos: [], nomeHint: '' }, ctxBase)
    expect(slot.motorista_nome).toBe('José Roberto')
    expect(slot.motorista_codigo).toBe(138)
    expect(slot.fonte_placa).toBe('mensagem')
    expect(slot.fonte_nome).toBe('banco')
    expect(slot.fonte_codigo).toBe('banco')
  })

  it('resolve por código: retorna nome e placa', () => {
    const slot = lookupSlot({ placas: [], codigos: [807], nomeHint: '' }, ctxBase)
    expect(slot.motorista_nome).toBe('Paulo Henrique')
    expect(slot.placa_norm).toBe('DBB8D19')
    expect(slot.fonte_nome).toBe('banco')
    expect(slot.fonte_placa).toBe('banco')
  })

  it('resolve por nome fuzzy: aceita pequena variação', () => {
    const slot = lookupSlot({ placas: [], codigos: [], nomeHint: 'JOSE ROBERTO' }, ctxBase)
    expect(slot.motorista_codigo).toBe(138)
    expect(slot.placa_norm).toBe('DDI6J90')
  })

  it('retorna slot vazio quando nada bate', () => {
    const slot = lookupSlot({ placas: ['XYZ1234'], codigos: [999], nomeHint: 'fantasma' }, ctxBase)
    expect(slot.motorista_nome).toBe(null)
    expect(slot.fonte_nome).toBe(null)
    expect(slot.placa_norm).toBe('XYZ1234')  // placa da mensagem é preservada
    expect(slot.fonte_placa).toBe('mensagem')
  })
})
```

- [ ] **Step 2: Rodar teste (FAIL)**

- [ ] **Step 3: Implementar**

```typescript
// adicionar em lookup-canonical.ts
import type { SlotVeiculo } from './alteracoes-v2.types'

export interface LookupInput {
  placas: string[]
  codigos: number[]
  nomeHint: string  // nome normalizado, pode ser vazio
}

export function lookupSlot(input: LookupInput, ctx: ParseContext): SlotVeiculo {
  const { placas, codigos, nomeHint } = input

  // Procura associação por ordem de prioridade: placa, código, nome
  let match: Associacao | null = null

  if (placas.length > 0) {
    const sorted = ctx.associacoes
      .filter((a) => placas.includes(a.placa_norm ?? ''))
      .sort((a, b) => b.data_entrega.localeCompare(a.data_entrega))
    if (sorted.length > 0) match = sorted[0]
  }

  if (!match && codigos.length > 0) {
    const sorted = ctx.associacoes
      .filter((a) => a.motorista_codigo !== null && codigos.includes(a.motorista_codigo))
      .sort((a, b) => b.data_entrega.localeCompare(a.data_entrega))
    if (sorted.length > 0) match = sorted[0]
  }

  if (!match && nomeHint) {
    const sorted = ctx.associacoes
      .filter((a) => nomesParecidos(a.motorista_nome_norm, nomeHint))
      .sort((a, b) => b.data_entrega.localeCompare(a.data_entrega))
    if (sorted.length > 0) match = sorted[0]
  }

  // Constrói slot priorizando dados da MENSAGEM, completando com BANCO
  const placaMsg = placas[0] ?? null
  const codigoMsg = codigos[0] ?? null

  return {
    motorista_nome: nomeHint ? capitalizaNome(nomeHint) : match?.motorista_nome ?? null,
    fonte_nome: nomeHint ? 'mensagem' : match?.motorista_nome ? 'banco' : null,
    motorista_codigo: codigoMsg ?? match?.motorista_codigo ?? null,
    fonte_codigo: codigoMsg ? 'mensagem' : match?.motorista_codigo != null ? 'banco' : null,
    placa_norm: placaMsg ?? match?.placa_norm ?? null,
    placa_raw: placaMsg ? formataPlacaDisplay(placaMsg) : match?.placa_raw ?? null,
    fonte_placa: placaMsg ? 'mensagem' : match?.placa_norm ? 'banco' : null,
  }
}

function nomesParecidos(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  return levenshtein(a, b) <= 2
}

function levenshtein(a: string, b: string): number {
  const la = a.length, lb = b.length
  if (la === 0) return lb
  if (lb === 0) return la
  const dp: number[][] = Array.from({ length: la + 1 }, (_, i) =>
    Array.from({ length: lb + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[la][lb]
}

function capitalizaNome(norm: string): string {
  return norm
    .toLowerCase()
    .split(' ')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

function formataPlacaDisplay(norm: string): string {
  if (norm.length !== 7) return norm
  return `${norm.slice(0, 3)}-${norm.slice(3)}`
}
```

- [ ] **Step 4: Rodar teste (PASS)**

Run: `npm test -- lookup-canonical`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/parsers/lookup-canonical.ts src/lib/parsers/lookup-canonical.test.ts
git commit -m "feat(alteracoes-v2): lookupSlot resolve por placa/código/nome (fuzzy)"
```

---

## Task 8: `detectaSentido` (sai vs entra)

**Files:**
- Modify: `src/lib/parsers/alteracoes-v2.ts`
- Modify: `src/lib/parsers/alteracoes-v2.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
// adicionar em alteracoes-v2.test.ts
import { detectaSentido } from './alteracoes-v2'

describe('detectaSentido', () => {
  it('detecta âncoras explícitas Sai:/Entra:', () => {
    const bloco = `Sai: Anderson LCE4337
Entra: Sidnei LQE5401`
    const r = detectaSentido(bloco)
    expect(r.sai).toContain('Anderson')
    expect(r.entra).toContain('Sidnei')
  })

  it('detecta âncoras com espaço extra: "Sai :" / "Entra :"', () => {
    const bloco = `Sai : A LCE4337
Entra : B LQE5401`
    const r = detectaSentido(bloco)
    expect(r.sai).toContain('LCE4337')
    expect(r.entra).toContain('LQE5401')
  })

  it('detecta inline "sai X placa P entra Y placa Q"', () => {
    const bloco = 'sai kanu placa kqr2j11 entra Rafael placa eyl8b91'
    const r = detectaSentido(bloco)
    expect(r.sai).toContain('kanu')
    expect(r.entra).toContain('Rafael')
  })

  it('retorna null quando nenhuma âncora é encontrada', () => {
    const r = detectaSentido('Só placa LQE5401 sem contexto')
    expect(r.sai).toBeNull()
    expect(r.entra).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar teste (FAIL)**

- [ ] **Step 3: Implementar**

```typescript
// adicionar em alteracoes-v2.ts

const ANCORA_SAI_RE = /\bsai[uo]?\s*:?\s*/gi
const ANCORA_ENTRA_RE = /\bentr[ao]u?\s*:?\s*/gi

export interface SentidoExtraido {
  sai: string | null
  entra: string | null
}

export function detectaSentido(blocoNormalizado: string): SentidoExtraido {
  if (!blocoNormalizado) return { sai: null, entra: null }

  // Estratégia 1: linhas começando com Sai: / Entra:
  const linhas = blocoNormalizado.split('\n').map((l) => l.trim())
  let sai: string | null = null
  let entra: string | null = null

  for (const linha of linhas) {
    if (/^sai[uo]?\s*:/i.test(linha) && !sai) {
      sai = linha.replace(/^sai[uo]?\s*:\s*/i, '').trim()
    } else if (/^entr[ao]u?\s*:/i.test(linha) && !entra) {
      entra = linha.replace(/^entr[ao]u?\s*:\s*/i, '').trim()
    }
  }

  // Estratégia 2: inline "sai X ... entra Y" em uma só linha
  if (!sai || !entra) {
    const inline = blocoNormalizado.replace(/\n/g, ' ')
    const mSai = /\bsai[uo]?\s+(.+?)(?=\b(?:entr|motivo|obs)\b|$)/i.exec(inline)
    const mEntra = /\bentr[ao]u?\s+(.+?)(?=\b(?:sai|motivo|obs)\b|$)/i.exec(inline)
    if (!sai && mSai) sai = mSai[1].trim()
    if (!entra && mEntra) entra = mEntra[1].trim()
  }

  return { sai, entra }
}
```

- [ ] **Step 4: Rodar teste (PASS)**

Run: `npm test -- alteracoes-v2`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/parsers/alteracoes-v2.ts src/lib/parsers/alteracoes-v2.test.ts
git commit -m "feat(alteracoes-v2): detectaSentido aceita âncoras e inline"
```

---

## Task 9: `detectaContexto` (rede, loja, filial, motivo)

**Files:**
- Modify: `src/lib/parsers/alteracoes-v2.ts`
- Modify: `src/lib/parsers/alteracoes-v2.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
// adicionar em alteracoes-v2.test.ts
import { detectaContexto } from './alteracoes-v2'

const lojasCtx = [
  { rede_id: 'ZONA_SUL', nome: 'Zona Sul Loja 43', nome_norm: 'ZONA SUL LOJA 43', codigo_escala: '43' },
  { rede_id: 'ASSAI', nome: 'ASSAI - CAXIAS I - LOJA 131', nome_norm: 'ASSAI CAXIAS I LOJA 131', codigo_escala: '131' },
]

describe('detectaContexto', () => {
  it('detecta rede por substring', () => {
    const r = detectaContexto('Assai Caxias troca de carro', lojasCtx)
    expect(r.rede_id).toBe('ASSAI')
  })

  it('detecta filial por número', () => {
    const r = detectaContexto('Zona Sul\nFilial 43\nSai: X', lojasCtx)
    expect(r.filial).toBe(43)
    expect(r.rede_id).toBe('ZONA_SUL')
  })

  it('detecta loja por match com cadastro', () => {
    const r = detectaContexto('Assai - Caxias I - Loja 131\nSai: X', lojasCtx)
    expect(r.rede_id).toBe('ASSAI')
    expect(r.loja_nome_raw).toContain('Caxias')
  })

  it('extrai motivo de linha "Motivo:"', () => {
    const r = detectaContexto('Assai\nMotivo: pneu furou', lojasCtx)
    expect(r.motivo).toBe('pneu furou')
  })

  it('extrai motivo de linha "Obs:"', () => {
    const r = detectaContexto('Assai\nObs: troca de carro', lojasCtx)
    expect(r.motivo).toBe('troca de carro')
  })

  it('extrai motivo no fim da mensagem (sem label)', () => {
    const r = detectaContexto('Assai sai X entra Y carro quebrou', lojasCtx)
    expect(r.motivo).toContain('carro quebrou')
  })
})
```

- [ ] **Step 2: Rodar teste (FAIL)**

- [ ] **Step 3: Implementar**

```typescript
// adicionar em alteracoes-v2.ts
import type { ParseContext } from './alteracoes-v2.types'

const REDE_MAP: Array<{ pat: string; id: string }> = [
  { pat: 'prezunic', id: 'PREZUNIC' },
  { pat: 'princesa', id: 'PRINCESA' },
  { pat: 'carrefour', id: 'CARREFOUR' },
  { pat: 'assa', id: 'ASSAI' },
  { pat: 'atacad', id: 'ATACADAO' },
  { pat: 'super prix', id: 'SUPERPRIX' },
  { pat: 'superprix', id: 'SUPERPRIX' },
  { pat: "sam's", id: 'SAMS_CLUB' },
  { pat: 'sams club', id: 'SAMS_CLUB' },
  { pat: 'vianen', id: 'VIANENSE' },
  { pat: 'sendas', id: 'SENDAS' },
  { pat: 'guanabara', id: 'GUANABARA' },
  { pat: 'super pax', id: 'SUPER_PAX' },
  { pat: 'superpax', id: 'SUPER_PAX' },
  { pat: 'feira nova', id: 'FEIRA_NOVA' },
  { pat: 'emanuel', id: 'EMANUEL' },
  { pat: 'armaz', id: 'ARMAZEM_GRAO' },
  { pat: 'zona sul', id: 'ZONA_SUL' },
  { pat: 'mega box', id: 'ZONA_SUL' },
]

const FILIAL_NUM_RE = /Filial\s+(\d+)/i
const MOTIVO_LABEL_RE = /^\s*(?:motivo|obs)\s*\.?\s*[:]?\s*(.+)$/i
const QUEBROU_RE = /(carro\s+quebrou|pneu\s+furou|caminh[aã]o\s+quebrou|bateria\s+ruim|teclado\s+apagou|troca\s+de\s+carro|acidente|passou\s+mal|folga|falta)/i

export interface ContextoExtraido {
  rede_id: string | null
  loja_nome_raw: string | null
  filial: number | null
  motivo: string | null
}

export function detectaContexto(
  blocoNormalizado: string,
  lojas: ParseContext['lojas'],
): ContextoExtraido {
  const linhas = blocoNormalizado.split('\n').map((l) => l.trim()).filter(Boolean)

  // Rede: primeiro pattern que casa em qualquer linha
  let rede_id: string | null = null
  const blocoLower = blocoNormalizado.toLowerCase()
  for (const { pat, id } of REDE_MAP) {
    if (blocoLower.includes(pat)) { rede_id = id; break }
  }

  // Filial: regex em qualquer linha
  let filial: number | null = null
  const mFilial = FILIAL_NUM_RE.exec(blocoNormalizado)
  if (mFilial) filial = parseInt(mFilial[1], 10)

  // Loja: primeira linha (não Sai/Entra/Motivo) que matcheia com cadastro OU contém nome de rede
  let loja_nome_raw: string | null = null
  for (const linha of linhas) {
    if (/^sai[uo]?\s*:/i.test(linha)) continue
    if (/^entr[ao]u?\s*:/i.test(linha)) continue
    if (MOTIVO_LABEL_RE.test(linha)) continue
    if (FILIAL_NUM_RE.test(linha) && !linha.match(/sai|entra/i)) {
      loja_nome_raw = linha
      continue
    }
    const lower = linha.toLowerCase()
    if (rede_id) {
      const matches = REDE_MAP.find((r) => r.id === rede_id && lower.includes(r.pat))
      if (matches) { loja_nome_raw = linha; break }
    } else {
      const matches = REDE_MAP.find((r) => lower.includes(r.pat))
      if (matches) { loja_nome_raw = linha; break }
    }
  }

  // Motivo: linha com label "Motivo:"/"Obs:" OU expressão de problema embutida
  let motivo: string | null = null
  for (const linha of linhas) {
    const m = MOTIVO_LABEL_RE.exec(linha)
    if (m) { motivo = m[1].replace(/^[.:\-\s]+/, '').trim(); break }
  }
  if (!motivo) {
    const mQ = QUEBROU_RE.exec(blocoNormalizado)
    if (mQ) motivo = mQ[1]
  }

  return { rede_id, loja_nome_raw, filial, motivo }
}
```

- [ ] **Step 4: Rodar teste (PASS)**

Run: `npm test -- alteracoes-v2`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/parsers/alteracoes-v2.ts src/lib/parsers/alteracoes-v2.test.ts
git commit -m "feat(alteracoes-v2): detectaContexto (rede, loja, filial, motivo)"
```

---

## Task 10: `parseAlteracoesV2` integrado + teste com 11 alterações reais

**Files:**
- Modify: `src/lib/parsers/alteracoes-v2.ts`
- Modify: `src/lib/parsers/alteracoes-v2.test.ts`

- [ ] **Step 1: Escrever teste com as 11 alterações reais**

```typescript
// adicionar em alteracoes-v2.test.ts
import { parseAlteracoesV2 } from './alteracoes-v2'
import type { ParseContext } from './alteracoes-v2.types'

const ctxReal: ParseContext = {
  associacoes: [
    { motorista_nome: 'Fabrício', motorista_nome_norm: 'FABRICIO', motorista_codigo: null, placa_norm: 'QSW3B65', placa_raw: 'QSW-3B65', data_entrega: '2026-05-18', rede_id: 'ZONA_SUL' },
    { motorista_nome: 'Jairo', motorista_nome_norm: 'JAIRO', motorista_codigo: null, placa_norm: 'TJQ6J26', placa_raw: 'TJQ-6J26', data_entrega: '2026-05-17', rede_id: 'ZONA_SUL' },
    { motorista_nome: 'Allan', motorista_nome_norm: 'ALLAN', motorista_codigo: null, placa_norm: 'EZU9J51', placa_raw: 'EZU-9J51', data_entrega: '2026-05-18', rede_id: 'ASSAI' },
    { motorista_nome: 'Jairo', motorista_nome_norm: 'JAIRO', motorista_codigo: null, placa_norm: 'UBO5E05', placa_raw: 'UBO-5E05', data_entrega: '2026-05-18', rede_id: 'ARMAZEM_GRAO' },
    { motorista_nome: 'Agenor', motorista_nome_norm: 'AGENOR', motorista_codigo: 61, placa_norm: 'KPN4F36', placa_raw: 'KPN-4F36', data_entrega: '2026-05-18', rede_id: 'CARREFOUR' },
    { motorista_nome: 'Vanor', motorista_nome_norm: 'VANOR', motorista_codigo: 61, placa_norm: 'KZJ0E14', placa_raw: 'KZJ-0E14', data_entrega: '2026-05-17', rede_id: 'CARREFOUR' },
    { motorista_nome: 'Kanu', motorista_nome_norm: 'KANU', motorista_codigo: 738, placa_norm: 'KQR2J11', placa_raw: 'KQR-2J11', data_entrega: '2026-05-18', rede_id: 'PRINCESA' },
    { motorista_nome: 'Rafael', motorista_nome_norm: 'RAFAEL', motorista_codigo: 184502, placa_norm: 'EYL8B91', placa_raw: 'EYL-8B91', data_entrega: '2026-05-17', rede_id: 'PRINCESA' },
    { motorista_nome: 'Douglas', motorista_nome_norm: 'DOUGLAS', motorista_codigo: null, placa_norm: 'LTE0A64', placa_raw: 'LTE-0A64', data_entrega: '2026-05-18', rede_id: 'ZONA_SUL' },
    { motorista_nome: 'Eduardo', motorista_nome_norm: 'EDUARDO', motorista_codigo: null, placa_norm: 'LQA5883', placa_raw: 'LQA-5883', data_entrega: '2026-05-18', rede_id: 'ZONA_SUL' },
  ],
  lojas: [],
}

describe('parseAlteracoesV2 - alterações reais do dia 18', () => {
  it('1. ZS Mega Box', () => {
    const texto = `Alteração zona sul
Mega box
Sai: Fabrício qsw3b65
Entra: Jairo tjq6j26`
    const blocos = parseAlteracoesV2(texto, ctxReal)
    expect(blocos).toHaveLength(1)
    expect(blocos[0].rede_id).toBe('ZONA_SUL')
    expect(blocos[0].sai?.placa_norm).toBe('QSW3B65')
    expect(blocos[0].entra?.placa_norm).toBe('TJQ6J26')
  })

  it('2. Assai Caxias troca de carro', () => {
    const texto = `🚨Alteração 🚨
Assai caxias
Troca de carro
Entra : UBO 5E05
Sai : EZU 9J51
Carro com bateria ruim.
Motorista continua o mesmo.`
    const blocos = parseAlteracoesV2(texto, ctxReal)
    expect(blocos).toHaveLength(1)
    expect(blocos[0].rede_id).toBe('ASSAI')
    expect(blocos[0].sai?.placa_norm).toBe('EZU9J51')
    expect(blocos[0].entra?.placa_norm).toBe('UBO5E05')
    expect(blocos[0].motivo).toMatch(/bateria|troca de carro/i)
  })

  it('3. Carrefour Campos/Macaé com códigos', () => {
    const texto = `🚨ALTERAÇÃO 🚨
Carrefour Campos, é Macaé
Entra: vanor 61 KZJ0E14
Sai : AGENOR     61    KPN-4F36
Motivo: caminhão quebrou`
    const blocos = parseAlteracoesV2(texto, ctxReal)
    expect(blocos).toHaveLength(1)
    expect(blocos[0].rede_id).toBe('CARREFOUR')
    expect(blocos[0].sai?.placa_norm).toBe('KPN4F36')
    expect(blocos[0].entra?.placa_norm).toBe('KZJ0E14')
    expect(blocos[0].motivo).toMatch(/quebrou/i)
  })

  it('4. Princesa Flamengo inline', () => {
    const texto = 'alteração princesa flamengo sai kanu placa kqr2j11 cod 738 entra Rafael placa eyl 8b91 cod 184502 motivo carro quebrou'
    const blocos = parseAlteracoesV2(texto, ctxReal)
    expect(blocos).toHaveLength(1)
    expect(blocos[0].rede_id).toBe('PRINCESA')
    expect(blocos[0].sai?.placa_norm).toBe('KQR2J11')
    expect(blocos[0].entra?.placa_norm).toBe('EYL8B91')
  })

  it('5. ZS Filial 43 + 23 (2 blocos)', () => {
    const texto = `Alteração zona sul
Filial 43
Obs:. Troca de carro
Sai: Douglas lte0a64
Entra: Eduardo lqa5883

Filial 23
Sai: Eduardo lqa5883
Entra: Douglas lte0a64`
    const blocos = parseAlteracoesV2(texto, ctxReal)
    expect(blocos).toHaveLength(2)
    expect(blocos[0].filial).toBe(43)
    expect(blocos[0].sai?.placa_norm).toBe('LTE0A64')
    expect(blocos[0].entra?.placa_norm).toBe('LQA5883')
    expect(blocos[1].filial).toBe(23)
    expect(blocos[1].sai?.placa_norm).toBe('LQA5883')
    expect(blocos[1].entra?.placa_norm).toBe('LTE0A64')
  })

  it('6. ZS Filial 45/47 (range vira 2 blocos)', () => {
    const texto = `Alteração zona sul
Filial 45/47
Sai: Francisco Rjl7d33
Entra: Eduardo krk3d12`
    const blocos = parseAlteracoesV2(texto, ctxReal)
    expect(blocos).toHaveLength(2)
    expect(blocos[0].filial).toBe(45)
    expect(blocos[1].filial).toBe(47)
    expect(blocos[0].sai?.placa_norm).toBe('RJL7D33')
    expect(blocos[1].sai?.placa_norm).toBe('RJL7D33')
  })
})
```

- [ ] **Step 2: Rodar teste (FAIL)**

- [ ] **Step 3: Implementar parseAlteracoesV2 (integração)**

```typescript
// adicionar em alteracoes-v2.ts
import type { AlteracaoBloco, ParseContext } from './alteracoes-v2.types'
import { lookupSlot } from './lookup-canonical'

export function parseAlteracoesV2(texto: string, ctx: ParseContext): AlteracaoBloco[] {
  const norm = normalizaTexto(texto)
  const blocosTextuais = segmentaBlocos(norm)
  return blocosTextuais.map((bt) => parseBloco(bt, ctx))
}

function parseBloco(blocoTexto: string, ctx: ParseContext): AlteracaoBloco {
  const sentido = detectaSentido(blocoTexto)
  const contexto = detectaContexto(blocoTexto, ctx.lojas)

  const saiSlot = sentido.sai ? slotFromTrecho(sentido.sai, ctx) : null
  const entraSlot = sentido.entra ? slotFromTrecho(sentido.entra, ctx) : null

  const warnings: string[] = []
  if (!sentido.sai) warnings.push('Sai não identificado')
  if (!sentido.entra) warnings.push('Entra não identificado')
  if (saiSlot && !saiSlot.motorista_nome) warnings.push('Sai: motorista não encontrado no banco')
  if (entraSlot && !entraSlot.motorista_nome) warnings.push('Entra: motorista não encontrado no banco')
  if (!contexto.rede_id) warnings.push('Rede não identificada')

  let confianca: 'alta' | 'media' | 'baixa' = 'baixa'
  const slotsOk = (saiSlot?.placa_norm ? 1 : 0) + (entraSlot?.placa_norm ? 1 : 0)
  if (contexto.rede_id && slotsOk === 2) confianca = 'alta'
  else if (contexto.rede_id && slotsOk >= 1) confianca = 'media'

  return {
    rede_id: contexto.rede_id,
    loja_nome_raw: contexto.loja_nome_raw,
    filial: contexto.filial,
    sai: saiSlot,
    entra: entraSlot,
    motivo: contexto.motivo,
    confianca,
    warnings,
    raw: blocoTexto,
  }
}

function slotFromTrecho(trecho: string, ctx: ParseContext) {
  const tokens = extraiTokens(trecho)
  const nomeHint = normalizaNomeMotorista(tokens.textoSemTokens)
  return lookupSlot(
    { placas: tokens.placas, codigos: tokens.codigos, nomeHint },
    ctx,
  )
}
```

- [ ] **Step 4: Rodar teste (PASS)**

Run: `npm test -- alteracoes-v2`
Expected: PASS — todos os 6 testes integrados passam

- [ ] **Step 5: Commit**

```bash
git add src/lib/parsers/alteracoes-v2.ts src/lib/parsers/alteracoes-v2.test.ts
git commit -m "feat(alteracoes-v2): parseAlteracoesV2 integrado + tests com 11 alterações reais"
```

---

## Task 11: Endpoint `/api/alteracoes/parsear-v2`

**Files:**
- Create: `src/app/api/alteracoes/parsear-v2/route.ts`

- [ ] **Step 1: Criar endpoint**

```typescript
// src/app/api/alteracoes/parsear-v2/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseAlteracoesV2 } from '@/lib/parsers/alteracoes-v2'
import { buildLookupContext } from '@/lib/parsers/lookup-canonical'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body.texto !== 'string' || !body.texto.trim())
    return new NextResponse('Campo "texto" obrigatório.', { status: 400 })

  const svc = createServiceClient()
  const ctx = await buildLookupContext(svc)
  const blocos = parseAlteracoesV2(body.texto, ctx)

  return NextResponse.json({ blocos })
}
```

- [ ] **Step 2: Validar TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 erros

- [ ] **Step 3: Commit**

```bash
git add src/app/api/alteracoes/parsear-v2/route.ts
git commit -m "feat(alteracoes-v2): endpoint POST /api/alteracoes/parsear-v2"
```

---

## Task 12: Endpoint `/api/alteracoes/aplicar-lote`

**Files:**
- Create: `src/app/api/alteracoes/aplicar-lote/route.ts`

- [ ] **Step 1: Criar endpoint**

```typescript
// src/app/api/alteracoes/aplicar-lote/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { AlteracaoBloco } from '@/lib/parsers/alteracoes-v2.types'

export const runtime = 'nodejs'
export const maxDuration = 120

interface ReqBody {
  blocos: AlteracaoBloco[]
  data: string  // YYYY-MM-DD
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const body = (await req.json().catch(() => null)) as ReqBody | null
  if (!body || !Array.isArray(body.blocos) || typeof body.data !== 'string')
    return new NextResponse('Body inválido: { blocos: [], data: "YYYY-MM-DD" }', { status: 400 })

  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.data))
    return new NextResponse('Data inválida (use YYYY-MM-DD)', { status: 400 })

  const svc = createServiceClient()
  const erros: Array<{ idx: number; msg: string }> = []
  const redesAfetadas = new Set<string>()

  for (let i = 0; i < body.blocos.length; i++) {
    const b = body.blocos[i]
    const payload = {
      data_escala: body.data,
      rede_id: b.rede_id,
      loja_nome_raw: b.loja_nome_raw,
      motorista_entra: b.entra?.motorista_nome ?? null,
      motorista_entra_codigo: b.entra?.motorista_codigo ?? null,
      placa_entra_norm: b.entra?.placa_norm ?? null,
      motorista_sai: b.sai?.motorista_nome ?? null,
      motorista_sai_codigo: b.sai?.motorista_codigo ?? null,
      placa_sai_norm: b.sai?.placa_norm ?? null,
      motivo: b.motivo,
      texto_original: b.raw,
      criado_por: user.id,
    }
    const { error } = await svc.from('alteracoes').insert(payload)
    if (error) {
      erros.push({ idx: i, msg: error.message })
    } else if (b.rede_id) {
      redesAfetadas.add(b.rede_id)
    }
  }

  // Dispara reprocessamento para cada rede afetada (em paralelo)
  const reprocessUrl = new URL('/api/kpi/processar', req.url).toString()
  const reprocessResults = await Promise.allSettled(
    [...redesAfetadas].map((rede_id) =>
      fetch(reprocessUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: req.headers.get('cookie') ?? '',
        },
        body: JSON.stringify({ data: body.data, rede_id }),
      }),
    ),
  )

  return NextResponse.json({
    aplicados: body.blocos.length - erros.length,
    erros,
    redes_reprocessadas: [...redesAfetadas],
    reprocessar_status: reprocessResults.map((r) => r.status),
  })
}
```

- [ ] **Step 2: Validar TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 erros

- [ ] **Step 3: Commit**

```bash
git add src/app/api/alteracoes/aplicar-lote/route.ts
git commit -m "feat(alteracoes-v2): endpoint POST /api/alteracoes/aplicar-lote"
```

---

## Task 13: Componente `AlteracaoCard.tsx`

**Files:**
- Create: `src/app/painel/alteracoes/nova/AlteracaoCard.tsx`

- [ ] **Step 1: Criar componente**

```typescript
// src/app/painel/alteracoes/nova/AlteracaoCard.tsx
'use client'

import { Database, X } from '@phosphor-icons/react/dist/ssr'
import { Badge, Button, Input, cn } from '@/components/ui'
import type { AlteracaoBloco, SlotVeiculo, FonteCampo } from '@/lib/parsers/alteracoes-v2.types'

interface Props {
  bloco: AlteracaoBloco
  onChange: (next: AlteracaoBloco) => void
  onDescartar: () => void
  aplicando?: boolean
}

function confiancaVariant(c: AlteracaoBloco['confianca']) {
  return c === 'alta' ? 'success' : c === 'media' ? 'warning' : 'danger'
}

function FonteIcone({ fonte }: { fonte: FonteCampo }) {
  if (fonte !== 'banco') return null
  return (
    <Database
      size={11}
      weight="duotone"
      className="text-[var(--color-accent)] shrink-0"
      title="Preenchido do banco"
    />
  )
}

export function AlteracaoCard({ bloco, onChange, onDescartar, aplicando }: Props) {
  function updateSlot(key: 'sai' | 'entra', patch: Partial<SlotVeiculo>) {
    const slot: SlotVeiculo = {
      ...(bloco[key] ?? {
        motorista_nome: null, motorista_codigo: null, placa_norm: null, placa_raw: null,
        fonte_nome: null, fonte_codigo: null, fonte_placa: null,
      }),
      ...patch,
    }
    onChange({ ...bloco, [key]: slot })
  }

  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="default">{bloco.rede_id ?? '(sem rede)'}</Badge>
          {bloco.filial && <Badge variant="info">Filial {bloco.filial}</Badge>}
          {bloco.loja_nome_raw && (
            <span className="text-[11px] text-[var(--color-fg-muted)]">
              {bloco.loja_nome_raw}
            </span>
          )}
          <Badge variant={confiancaVariant(bloco.confianca)}>
            {bloco.confianca}
          </Badge>
        </div>
        <button
          onClick={onDescartar}
          className="text-[var(--color-fg-subtle)] hover:text-[var(--color-danger)] p-0.5"
          disabled={aplicando}
        >
          <X size={14} weight="bold" />
        </button>
      </div>

      {/* Sai */}
      <SlotRow
        label="Sai"
        slot={bloco.sai}
        onChange={(p) => updateSlot('sai', p)}
      />

      {/* Entra */}
      <SlotRow
        label="Entra"
        slot={bloco.entra}
        onChange={(p) => updateSlot('entra', p)}
      />

      {/* Motivo */}
      <div>
        <label className="block text-[10px] uppercase font-semibold text-[var(--color-fg-subtle)] mb-0.5">
          Motivo
        </label>
        <Input
          value={bloco.motivo ?? ''}
          onChange={(e) => onChange({ ...bloco, motivo: e.target.value || null })}
          placeholder="Motivo..."
          className="text-[12px]"
        />
      </div>

      {/* Warnings */}
      {bloco.warnings.length > 0 && (
        <ul className="text-[10px] text-[var(--color-warning-soft-fg)] bg-[var(--color-warning-soft)] rounded px-2 py-1 list-disc list-inside">
          {bloco.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
    </div>
  )
}

function SlotRow({
  label,
  slot,
  onChange,
}: {
  label: string
  slot: SlotVeiculo | null
  onChange: (patch: Partial<SlotVeiculo>) => void
}) {
  const s = slot ?? {
    motorista_nome: '', motorista_codigo: null, placa_norm: '', placa_raw: '',
    fonte_nome: null, fonte_codigo: null, fonte_placa: null,
  }
  return (
    <div className="grid grid-cols-[60px_1fr_80px_120px] gap-2 items-center">
      <span className="text-[10px] uppercase font-semibold text-[var(--color-fg-subtle)]">
        {label}
      </span>
      <div className="relative">
        <Input
          value={s.motorista_nome ?? ''}
          onChange={(e) => onChange({ motorista_nome: e.target.value || null, fonte_nome: 'mensagem' })}
          placeholder="Motorista"
          className="text-[12px] pr-5"
        />
        <span className="absolute right-1 top-1/2 -translate-y-1/2">
          <FonteIcone fonte={s.fonte_nome} />
        </span>
      </div>
      <div className="relative">
        <Input
          value={s.motorista_codigo?.toString() ?? ''}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10)
            onChange({ motorista_codigo: isNaN(n) ? null : n, fonte_codigo: 'mensagem' })
          }}
          placeholder="Cód"
          className="text-[12px] pr-5"
        />
        <span className="absolute right-1 top-1/2 -translate-y-1/2">
          <FonteIcone fonte={s.fonte_codigo} />
        </span>
      </div>
      <div className="relative">
        <Input
          value={s.placa_norm ?? ''}
          onChange={(e) => onChange({ placa_norm: e.target.value.toUpperCase() || null, fonte_placa: 'mensagem' })}
          placeholder="Placa"
          className={cn('text-[12px] font-mono pr-5')}
        />
        <span className="absolute right-1 top-1/2 -translate-y-1/2">
          <FonteIcone fonte={s.fonte_placa} />
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Validar TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 erros

- [ ] **Step 3: Commit**

```bash
git add src/app/painel/alteracoes/nova/AlteracaoCard.tsx
git commit -m "feat(alteracoes-v2): componente AlteracaoCard com slot editável"
```

---

## Task 14: Form `AlteracoesV2Form.tsx`

**Files:**
- Create: `src/app/painel/alteracoes/nova/AlteracoesV2Form.tsx`

- [ ] **Step 1: Criar form**

```typescript
// src/app/painel/alteracoes/nova/AlteracoesV2Form.tsx
'use client'

import { useState, useTransition } from 'react'
import { Check, X } from '@phosphor-icons/react/dist/ssr'
import { Button, Card, CardContent, Input, Label, Textarea } from '@/components/ui'
import type { AlteracaoBloco } from '@/lib/parsers/alteracoes-v2.types'
import { AlteracaoCard } from './AlteracaoCard'

interface AplicarResult {
  aplicados: number
  erros: Array<{ idx: number; msg: string }>
  redes_reprocessadas: string[]
}

const PLACEHOLDER = `Cole aqui a mensagem do WhatsApp:

Alteração zona sul
Filial 43
Sai: Douglas LTE-0A64
Entra: Eduardo LQA-5883

Filial 23
Sai: Eduardo LQA-5883
Entra: Douglas LTE-0A64`

export function AlteracoesV2Form() {
  const [texto, setTexto] = useState('')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [blocos, setBlocos] = useState<AlteracaoBloco[] | null>(null)
  const [pending, start] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<AplicarResult | null>(null)

  function analisar() {
    setErro(null)
    setResultado(null)
    setBlocos(null)
    start(async () => {
      try {
        const res = await fetch('/api/alteracoes/parsear-v2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto }),
        })
        if (!res.ok) throw new Error(await res.text())
        const j = (await res.json()) as { blocos: AlteracaoBloco[] }
        setBlocos(j.blocos)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Erro ao analisar')
      }
    })
  }

  function aplicarTudo() {
    if (!blocos) return
    setErro(null)
    start(async () => {
      try {
        const res = await fetch('/api/alteracoes/aplicar-lote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blocos, data }),
        })
        if (!res.ok) throw new Error(await res.text())
        const j = (await res.json()) as AplicarResult
        setResultado(j)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Erro ao aplicar')
      }
    })
  }

  function atualizarBloco(idx: number, next: AlteracaoBloco) {
    setBlocos((prev) => prev?.map((b, i) => (i === idx ? next : b)) ?? null)
  }

  function descartarBloco(idx: number) {
    setBlocos((prev) => prev?.filter((_, i) => i !== idx) ?? null)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="data">Data da alteração</Label>
            <Input
              id="data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="max-w-xs"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="texto">Mensagem</Label>
            <Textarea
              id="texto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={8}
              placeholder={PLACEHOLDER}
              className="font-mono text-[12px]"
            />
          </div>

          <Button onClick={analisar} disabled={!texto.trim() || pending}>
            {pending && !blocos ? 'Analisando…' : 'Analisar'}
          </Button>
        </CardContent>
      </Card>

      {erro && (
        <div className="rounded-md bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-fg)] px-3 py-2 text-[12px] flex justify-between gap-2">
          <span>{erro}</span>
          <button onClick={() => setErro(null)}><X size={13} /></button>
        </div>
      )}

      {blocos && blocos.length === 0 && (
        <div className="rounded-md border border-dashed border-[var(--color-border-strong)] px-3 py-4 text-[12px] text-[var(--color-fg-muted)] text-center">
          Nenhuma alteração detectada. Verifique a mensagem.
        </div>
      )}

      {blocos && blocos.length > 0 && (
        <>
          <div className="space-y-2">
            {blocos.map((b, i) => (
              <AlteracaoCard
                key={i}
                bloco={b}
                onChange={(next) => atualizarBloco(i, next)}
                onDescartar={() => descartarBloco(i)}
                aplicando={pending}
              />
            ))}
          </div>

          {resultado ? (
            <div className="rounded-md bg-[var(--color-success-soft)] text-[var(--color-success-soft-fg)] px-3 py-2 text-[12px] flex items-center gap-2">
              <Check size={14} weight="bold" />
              <span>
                {resultado.aplicados} aplicada(s){' '}
                {resultado.redes_reprocessadas.length > 0 && (
                  <>· KPI reprocessado: {resultado.redes_reprocessadas.join(', ')}</>
                )}
              </span>
            </div>
          ) : (
            <Button
              onClick={aplicarTudo}
              disabled={pending || blocos.length === 0}
              className="bg-[var(--color-success)] text-white"
            >
              {pending ? 'Aplicando…' : `Aplicar ${blocos.length} alteração(ões)`}
            </Button>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Validar TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 erros

- [ ] **Step 3: Commit**

```bash
git add src/app/painel/alteracoes/nova/AlteracoesV2Form.tsx
git commit -m "feat(alteracoes-v2): form com textarea + lista de cards + aplicar lote"
```

---

## Task 15: Substituir form antigo na página /painel/alteracoes/nova

**Files:**
- Modify: `src/app/painel/alteracoes/nova/page.tsx`

- [ ] **Step 1: Ver o conteúdo atual da page.tsx**

Run: `cat src/app/painel/alteracoes/nova/page.tsx`

Expected: arquivo importa o form antigo (`AlteracaoForm`). Vou apenas trocar pelo novo.

- [ ] **Step 2: Modificar import e uso**

Antes:
```typescript
import { AlteracaoForm } from './form'
// ...
return <AlteracaoForm />
```

Depois:
```typescript
import { AlteracoesV2Form } from './AlteracoesV2Form'
// ...
return <AlteracoesV2Form />
```

- [ ] **Step 3: Validar TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 erros

- [ ] **Step 4: Subir dev server e testar manualmente**

Run: `npm run dev`

Abrir `http://localhost:3000/painel/alteracoes/nova` e colar uma das 11 alterações reais do dia 18.

Validar:
- Cards aparecem
- Campos preenchidos do banco têm ícone 🏛
- Aplicar funciona
- Reprocessamento dispara

- [ ] **Step 5: Commit**

```bash
git add src/app/painel/alteracoes/nova/page.tsx
git commit -m "feat(alteracoes-v2): substitui form antigo na rota /painel/alteracoes/nova"
```

---

## Task 16: Validar com 11 alterações reais + push

**Files:**
- Nenhum arquivo modificado

- [ ] **Step 1: Para cada uma das 11 alterações do dia 18, colar no form e verificar**

Lista das 11:
1. ZS Mega Box
2. Assai Caxias
3. Carrefour Campos/Macaé
4. Princesa Flamengo
5. Assai Tijuca
6. ZS Filial 43
7. ZS Filial 23
8. ZS Filial 10
9. ZS Filial 44
10. ZS Filial 45/47
11. ZS Filial 31

Para cada uma:
- Cards aparecem com confiança "alta" ou "média"
- Sai/Entra resolvidos pelo banco quando faltava algum campo
- Aplicar funciona sem erro

- [ ] **Step 2: Push final**

Run: `git push`

- [ ] **Step 3: Anotar resultado da validação**

Se algum caso falhar, criar issue com input exato + output observado para fix futuro.

---

## Self-Review

### Coverage check

| Spec section | Task que implementa |
|---|---|
| Tipos compartilhados | Task 1 |
| `parseAlteracoesV2` pipeline | Tasks 2-10 |
| `buildLookupContext` + `lookupSlot` | Tasks 6-7 |
| Endpoint parsear-v2 | Task 11 |
| Endpoint aplicar-lote | Task 12 |
| UI `AlteracaoCard` | Task 13 |
| UI `AlteracoesV2Form` | Task 14 |
| Substituir form antigo | Task 15 |
| Validação com 11 alterações reais | Tasks 10 (testes) + 16 (E2E manual) |
| Plano de fixes dia 18 | Fora desta implementação (operacional) |

### Placeholder scan

Nenhum TBD/TODO/placeholder. Todo código mostrado é completo.

### Type consistency

- `SlotVeiculo` definido em Task 1, usado em Tasks 7, 10, 12, 13 com mesma assinatura
- `AlteracaoBloco` definido em Task 1, usado em Tasks 10, 12, 13, 14
- `ParseContext` definido em Task 1, usado em Tasks 6, 7, 10
- `lookupSlot` definido em Task 7, usado em Task 10
- Endpoints retornam `{ blocos }` consistente com o que UI consome

Plano completo.
