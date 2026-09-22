# Corrigir normalização do cadastro manual de geocode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer `normalizarEndereco` (usado por `scripts/cadastrar-endereco-manual.ts`) gravar exatamente a mesma chave que `geocode.ts` usa pra ler o cache, pra uma correção manual nunca mais virar uma linha órfã que a geração real nunca lê.

**Architecture:** `buscarNoCache`/`salvarNoCache` em `src/lib/kpi-romaneio/geocode.ts` usam o `endereco` CRU, sem nenhuma normalização (nem trim, nem uppercase, nem colapso de espaço) — é a string exata que `parse-romaneio.ts`/`parse-escala.ts` produzem a partir do PDF, que às vezes tem espaço duplo (campo vazio concatenado). `normalizarEndereco` hoje colapsa espaço interno (`replace(/\s+/g, ' ')`), então um endereço com espaço duplo grava numa chave DIFERENTE da que a geração usa — a correção nunca é vista. Achado real 22/09: "AVENIDA MASCARENHAS DE MORAIS...LOTE  28  QUADRA  24" (espaço duplo) virou uma linha órfã "LOTE 28 QUADRA 24" (espaço simples) que a geração ignorou. Fix: `normalizarEndereco` só faz `trim()` (tira espaço nas pontas) — nunca mexe no meio da string.

**Tech Stack:** TypeScript, Vitest.

**Spec:** conversa de 22/09/2026 (achado ao corrigir 10 endereços do KPI Nutry Max na produção — ver memória da sessão).

## Global Constraints

- Trailer de commit EXATO ao final: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` e `Claude-Session: https://claude.ai/code/session_01ATqZgryoxRsTeXXM3HR8M7`
- Espelhar em KPI TEMP (`/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP`) e push nos dois repos juntos.
- `montarPayloadCadastroManual` continua sempre marcando `confiavel: true, motivo: null` (comportamento já correto, não mexer).
- Sem mudança em `geocode.ts` — ele já está certo (não normaliza); é `cadastrar-endereco-manual.ts` que precisa acompanhar.

---

## File Structure

- Modify `scripts/cadastrar-endereco-manual.ts` — `normalizarEndereco` só faz `trim()`.
- Modify `scripts/cadastrar-endereco-manual.test.ts` — os dois testes existentes passam a esperar o espaço interno preservado.

Interfaces (sem mudança de assinatura):
- `normalizarEndereco(enderecoBruto: string): string` — antes: trim+uppercase+colapsa espaço. Depois: trim+uppercase, SEM colapsar espaço interno.
- `montarPayloadCadastroManual(enderecoBruto: string, lat: number, lng: number): { endereco, lat, lng, confiavel: true, motivo: null }` — usa `normalizarEndereco` por baixo, sem mudança de campo.

---

### Task 1: `normalizarEndereco` só faz trim, nunca colapsa espaço interno

**Files:**
- Modify: `scripts/cadastrar-endereco-manual.ts`
- Modify: `scripts/cadastrar-endereco-manual.test.ts`

- [ ] **Step 1: Atualizar os testes existentes pro comportamento novo**

```ts
import { describe, it, expect } from 'vitest'
import { montarPayloadCadastroManual, normalizarEndereco } from './cadastrar-endereco-manual'

// Finding 1 (fix wave 12/09): o cadastro manual e' o UNICO jeito de corrigir
// uma coordenada que a guarda territorial marcou confiavel=false. Sem
// resetar confiavel/motivo aqui, a marca fica pra sempre mesmo depois da
// correcao -- ver comentario em cadastrar-endereco-manual.ts.
describe('montarPayloadCadastroManual', () => {
  it('sempre marca confiavel=true e motivo=null -- humano corrigindo a mao vence a guarda automatica', () => {
    const payload = montarPayloadCadastroManual('rua x,  10 - centro', -22.9, -43.2)
    expect(payload).toEqual({
      endereco: 'RUA X,  10 - CENTRO',
      lat: -22.9,
      lng: -43.2,
      confiavel: true,
      motivo: null,
    })
  })

  // Achado real 22/09: geocode.ts (buscarNoCache/salvarNoCache) NAO colapsa
  // espaco interno -- usa a string crua que parse-romaneio.ts produz, que
  // as vezes tem espaco duplo (campo vazio concatenado, ex. "LOTE  28
  // QUADRA  24"). normalizarEndereco colapsando esse espaco grava numa
  // chave DIFERENTE da que a geracao real le -- a correcao manual vira uma
  // linha orfa que nunca e' vista. So' trim (tira espaco das pontas) +
  // uppercase; nunca mexe no meio da string.
  it('so trim + uppercase -- NUNCA colapsa espaco interno (teria que bater a mesma chave que geocode.ts le, que nao normaliza)', () => {
    expect(normalizarEndereco('  Rua   Das Flores, 1 - Centro  ')).toBe('RUA   DAS FLORES, 1 - CENTRO')
  })

  it('espaco duplo no meio do endereco e preservado, nao colapsado pra simples', () => {
    expect(normalizarEndereco('AVENIDA MASCARENHAS DE MORAIS, SN - CHACARA RIO PETROPOLIS, DUQUE DE CAXIAS - LOTE  28  QUADRA  24'))
      .toBe('AVENIDA MASCARENHAS DE MORAIS, SN - CHACARA RIO PETROPOLIS, DUQUE DE CAXIAS - LOTE  28  QUADRA  24')
  })
})
```

- [ ] **Step 2: Rodar** `npx vitest run scripts/cadastrar-endereco-manual.test.ts` → FAIL (o código antigo ainda colapsa espaço).

- [ ] **Step 3: Implementar** — trocar em `scripts/cadastrar-endereco-manual.ts`:

```ts
export function normalizarEndereco(enderecoBruto: string): string {
  return enderecoBruto.trim().toUpperCase()
}
```

(era `enderecoBruto.trim().toUpperCase().replace(/\s+/g, ' ')` — remove só o `.replace(...)`, mantém trim+uppercase.)

Também atualizar o comentário do arquivo que hoje diz "mesma logica de buscarNoCache/salvarNoCache em geocode.ts" — trocar por uma nota explícita de que `geocode.ts` não normaliza nada, e por isso aqui também não pode normalizar além de trim/uppercase.

- [ ] **Step 4:** Rodar `npx vitest run scripts/cadastrar-endereco-manual.test.ts` → PASS (3/3). Rodar `npx vitest run scripts/` e `npx tsc --noEmit` (erros de Buffer em `gerador-xlsx.test.ts` são conhecidos/pré-existentes) pra garantir que nada mais depende do colapso de espaço.
- [ ] **Step 5: Commit** `fix(kpi): cadastro manual de geocode nao colapsa mais espaco interno do endereco` (+ trailer). Espelhar em TEMP; push nos dois.

## Self-review

- Cobertura: o único requisito (chave do cadastro manual bater com a chave real de leitura) tem teste direto com o caso real que causou o bug (Mascarenhas de Morais, espaço duplo).
- Sem placeholder, sem mudança de assinatura, sem tocar em `geocode.ts` (que já está correto).
- Risco residual (fora de escopo desta correção): se algum dia `parse-romaneio.ts`/`parse-escala.ts` passar a normalizar espaço na extração, os dois lados precisam mudar juntos — não é o caso hoje.
