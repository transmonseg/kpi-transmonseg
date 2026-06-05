# KPI Melhorias de Robustez — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Três melhorias no KPI TransMonSeg: banner forte de relatório parcial, parser de texto livre das alterações (sem IA) e relatório de faxina de cadastro.

**Architecture:** #2 é tweak de limiar (backend) + banner (frontend). #3 é uma nova função pura de parsing heurístico ancorada na placa, integrada ao endpoint `analisar-alt` mesclando com o parser de prosa atual. #4 é um relatório gerado offline (sem mudança de produção).

**Tech Stack:** Next.js 16, TypeScript, Vitest, Supabase. Design: `docs/plans/2026-06-05-kpi-melhorias-robustez-design.md`.

---

## #2 — Banner forte de relatório parcial

### Task 1: Baixar limiar do avisoParcial (5 → 3)

**Files:**
- Modify: `src/app/api/kpi/simples/route.ts` (~linha 839)

**Step 1:** Trocar `rastreados.length >= 5` por `rastreados.length >= 3` na condição do `avisoParcial`.

**Step 2:** `npx tsc --noEmit` → OK.

**Step 3:** Commit `feat(kpi): aviso parcial pega rede pequena (limiar 5→3)`.

### Task 2: Banner agregado no topo do resultado

**Files:**
- Modify: `src/app/painel/kpi/simples/page.tsx` (acima da `<section>` que lista as redes, ~linha 1080)

**Step 1:** Antes da lista de redes, calcular `const parciais = redes.filter(r => r.avisoParcial)` e renderizar quando `parciais.length > 0`:

```tsx
{redes && redes.some(r => r.avisoParcial) && (
  <div className="mb-4 flex items-start gap-2 rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-4 py-3">
    <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-warning)]" />
    <div className="text-sm">
      <p className="font-semibold text-[var(--color-warning)]">
        {redes.filter(r => r.avisoParcial).length} de {redes.length} rede(s) parecem geradas cedo demais
      </p>
      <p className="text-[var(--color-fg-muted)]">As entregas dessas redes ainda não terminaram — gere o KPI de novo depois da janela pra não mandar dado parcial pro cliente.</p>
    </div>
  </div>
)}
```

**Step 2:** `npx tsc --noEmit` + `npm run build` → OK.

**Step 3:** Commit `feat(ui): banner forte de relatório parcial no topo`.

---

## #3 — Parser de texto livre das alterações (heurística, sem IA)

### Task 3: Teste — extrair de UMA frase solta

**Files:**
- Create: `src/lib/parsers/alteracao-texto-livre.ts`
- Test: `src/lib/parsers/alteracao-texto-livre.test.ts`

**Step 1 (failing test):**

```ts
import { describe, it, expect } from 'vitest'
import { parseAlteracaoTextoLivre } from './alteracao-texto-livre'
import type { ParseContext } from './alteracoes-v2.types'

const ctx: ParseContext = {
  associacoes: [],
  lojas: [{ rede_id: 'PREZUNIC', nome: 'Prezunic - Barra da Tijuca', nome_norm: 'PREZUNIC BARRA DA TIJUCA', codigo_escala: null }],
}

it('extrai loja + placa + motorista de uma frase solta', () => {
  const r = parseAlteracaoTextoLivre('na Prezunic Barra hoje vai o Simão placa LSN-6172', ctx)
  expect(r).toHaveLength(1)
  expect(r[0].rede_id).toBe('PREZUNIC')
  expect(r[0].entra?.placa_norm).toBe('LSN6172')
  expect(r[0].entra?.motorista_nome?.toUpperCase()).toContain('SIMÃO'.toUpperCase())
})
```

**Step 2:** Rodar `npx vitest run src/lib/parsers/alteracao-texto-livre.test.ts` → FAIL (função não existe).

**Step 3 (implementação mínima):** criar `alteracao-texto-livre.ts`:

```ts
import type { ParseContext } from './alteracoes-v2.types'
import type { AlteracaoParsed } from './alteracao-text'
import { normalizaPlaca } from '@/lib/utils/placa'

const PLACA_RE = /[A-Z]{3}[-\s]?\d[A-Z0-9]\d{2}/gi
const COD_RE = /\b(\d{2,7})\b/

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Casa o trecho contra as lojas do ctx: melhor sobreposição de tokens fortes (≥4 chars).
function casaLoja(trecho: string, ctx: ParseContext): ParseContext['lojas'][number] | null {
  const t = norm(trecho)
  let best: ParseContext['lojas'][number] | null = null, bestScore = 0
  for (const l of ctx.lojas) {
    const toks = l.nome_norm.split(' ').filter(w => w.length >= 4)
    const hit = toks.filter(w => t.includes(w)).length
    if (hit > bestScore) { bestScore = hit; best = l }
  }
  return bestScore > 0 ? best : null
}

export function parseAlteracaoTextoLivre(texto: string, ctx: ParseContext): AlteracaoParsed[] {
  const out: AlteracaoParsed[] = []
  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  for (const linha of linhas) {
    const placas = linha.match(PLACA_RE)
    if (!placas) continue
    for (const placaRaw of placas) {
      const placa_norm = normalizaPlaca(placaRaw)
      // remove a placa do trecho pra achar código/loja/motorista
      const semPlaca = linha.replace(placaRaw, ' ')
      const loja = casaLoja(semPlaca, ctx)
      const codM = semPlaca.match(COD_RE)
      const codigo = codM ? parseInt(codM[1], 10) : null
      // motorista: tokens com letra que não são da loja (heurística simples)
      const lojaToks = new Set(loja ? loja.nome_norm.split(' ') : [])
      const motorista = norm(semPlaca).split(' ')
        .filter(w => /^[A-ZÀ-Ý]{3,}$/i.test(w) && !lojaToks.has(w) && !/^\d+$/.test(w))
        .slice(0, 3).join(' ') || null
      out.push({
        tipo: 'SUBSTITUICAO',
        rede_id: loja?.rede_id ?? null,
        loja_nome_raw: loja?.nome ?? null,
        entra: { motorista_nome: motorista, motorista_codigo: codigo, placa_raw: placaRaw.toUpperCase(), placa_norm },
        sai: null,
        motivo: null,
        texto_original: linha,
        confianca: loja && placa_norm ? 'alta' : placa_norm ? 'media' : 'baixa',
      })
    }
  }
  return out
}
```

**Step 4:** Rodar o teste → PASS. **Step 5:** Commit `feat(alteracao): parser de texto livre — frase solta`.

### Task 4: Teste — VÁRIAS alterações num paste

**Step 1 (test):** texto com 2 linhas (2 lojas/placas) → `expect(r).toHaveLength(2)`. **Step 2:** rodar → já deve passar (split por linha). Se não, ajustar. **Step 3:** Commit.

### Task 5: Teste — texto grudado/tabular

**Step 1 (test):** linha tipo `Prezunic Barra Simão LSN-6172` (sem "placa") → extrai placa+loja. Ajustar regex/heurística se falhar. **Step 2:** rodar → PASS. **Step 3:** Commit.

### Task 6: Integrar no endpoint analisar-alt (mesclar + dedupe)

**Files:**
- Modify: `src/app/api/kpi/simples/analisar-alt/route.ts` (função `parseTextoV2`, ~linha 17)

**Step 1:** No caminho de texto, rodar TAMBÉM `parseAlteracaoTextoLivre` e mesclar com `parseAlteracoesV2`, dedupe por `loja_nome_raw + entra.placa_norm`:

```ts
function parseTextoV2(texto: string, ctx: ParseContext): AlteracaoParsed[] {
  const prosa = parseAlteracoesV2(texto, ctx).filter(b => b.entra || b.sai).map(blocoToParsed)
  const livre = parseAlteracaoTextoLivre(texto, ctx)
  const seen = new Set(prosa.map(a => `${a.loja_nome_raw}|${a.entra?.placa_norm}`))
  const extra = livre.filter(a => !seen.has(`${a.loja_nome_raw}|${a.entra?.placa_norm}`))
  return [...prosa, ...extra]
}
```

**Step 2:** `npx tsc --noEmit` → OK. **Step 3:** Commit `feat(alteracao): integra parser de texto livre no analisar-alt`.

### Task 7: Suíte completa

**Step 1:** `npx vitest run` → todos passam. **Step 2:** `npm run build` → OK.

---

## #4 — Faxina de cadastro (relatório, sem mexer em produção)

### Task 8: Gerar relatório categorizado das lojas sem código

**Files:**
- Create (temporário): script que pula as ~57 lojas `codigo_unitrac is null` e cruza com o export oficial do Unitrac por coordenada (≤80m, mesma rede), classificando em (a) gêmea clara, (b) coord ambígua, (c) sem ponto.

**Step 1:** Rodar o script (REST + xls do Unitrac) → produz `docs/faxina-cadastro-null-codes.md` com as 3 listas.

**Step 2:** Entregar ao Joaquim. NÃO migrar nada sem aprovação das (a).

---

## Execução
Ordem: #2 → #3 → #4. Commits frequentes. Validar tsc + suíte + build antes de cada merge. Nada vai pra `main` sem o "pode mergear" do Joaquim.
