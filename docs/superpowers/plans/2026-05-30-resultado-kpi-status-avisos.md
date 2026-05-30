# Resultado do KPI: status, colunas e avisos de revisão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar à tela de resultado do KPI gerado um status claro por rota, as colunas operacionais que faltam, um painel de avisos de revisão e destaque das linhas problemáticas — tudo só na tela, sem tocar no XLSX/PDF.

**Architecture:** A lógica de status vira uma função pura testável em `src/lib/kpi/status-rota.ts`. O backend (`src/app/api/kpi/simples/route.ts`) chama essa função ao montar cada `PreviewLinha` e adiciona os campos novos. O frontend (`src/app/painel/kpi/simples/page.tsx`) só exibe: coluna de status, colunas extras, destaque e um painel de avisos.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, vitest. Sem libs novas.

**Restrições:** Não mexer no XLSX/PDF gerados. NÃO fazer push/deploy pro Vercel — validar local (`npm run dev`). Português correto, sem travessão.

---

## File Structure

- `src/lib/kpi/status-rota.ts` (criar) — tipo `StatusRota` + `derivarStatus()` puro.
- `src/lib/kpi/status-rota.test.ts` (criar) — testes dos 4 status + flag de revisão.
- `src/app/api/kpi/simples/route.ts` (modificar ~21-33 tipo + ~637-651 montagem do preview) — enriquecer `PreviewLinha`.
- `src/app/painel/kpi/simples/page.tsx` (modificar ~41-54 tipo, ~1227-1257 tabela, ~1259+ `PreviewRow`, e adicionar painel de avisos) — exibição.

---

### Task 1: Função pura `derivarStatus` (TDD)

**Files:**
- Create: `src/lib/kpi/status-rota.ts`
- Test: `src/lib/kpi/status-rota.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/kpi/status-rota.test.ts
import { describe, it, expect } from 'vitest'
import { derivarStatus } from './status-rota'

const base = { temGps: true, ficouNaBase: false, paradas: [] as { classificacao: string; loja_id: string | null }[] }

describe('derivarStatus', () => {
  it('SEM_RASTREADOR quando não tem GPS', () => {
    expect(derivarStatus({ ...base, temGps: false })).toEqual({ status: 'SEM_RASTREADOR', revisar: false, motivoRevisao: null })
  })

  it('NAO_FOI_AO_CLIENTE quando tem GPS mas ficou na base', () => {
    expect(derivarStatus({ ...base, ficouNaBase: true })).toEqual({ status: 'NAO_FOI_AO_CLIENTE', revisar: false, motivoRevisao: null })
  })

  it('FORA_DE_BASE quando parou fora da base sem loja e não visitou loja, e marca revisão', () => {
    const r = derivarStatus({ ...base, paradas: [{ classificacao: 'FORA_BASE', loja_id: null }] })
    expect(r.status).toBe('FORA_DE_BASE')
    expect(r.revisar).toBe(true)
    expect(r.motivoRevisao).toBeTruthy()
  })

  it('ENTREGUE quando visitou a loja, mesmo havendo parada fora de base', () => {
    const r = derivarStatus({ ...base, paradas: [{ classificacao: 'LOJA', loja_id: 'l1' }, { classificacao: 'FORA_BASE', loja_id: null }] })
    expect(r).toEqual({ status: 'ENTREGUE', revisar: false, motivoRevisao: null })
  })

  it('SEM_RASTREADOR tem precedência sobre ficouNaBase', () => {
    expect(derivarStatus({ ...base, temGps: false, ficouNaBase: true }).status).toBe('SEM_RASTREADOR')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/kpi/status-rota.test.ts`
Expected: FAIL — "Failed to resolve import './status-rota'".

- [ ] **Step 3: Implementar a função mínima**

```ts
// src/lib/kpi/status-rota.ts
export type StatusRota = 'ENTREGUE' | 'SEM_RASTREADOR' | 'NAO_FOI_AO_CLIENTE' | 'FORA_DE_BASE'

export interface DadosStatusRota {
  temGps: boolean
  ficouNaBase: boolean
  paradas: ReadonlyArray<{ classificacao: string; loja_id: string | null }>
}

export interface ResultadoStatus {
  status: StatusRota
  revisar: boolean
  motivoRevisao: string | null
}

/** Deriva o status de uma rota a partir do que o motor já computa. Ordem importa. */
export function derivarStatus(d: DadosStatusRota): ResultadoStatus {
  if (!d.temGps) return { status: 'SEM_RASTREADOR', revisar: false, motivoRevisao: null }
  if (d.ficouNaBase) return { status: 'NAO_FOI_AO_CLIENTE', revisar: false, motivoRevisao: null }

  const visitouLoja = d.paradas.some(p => p.classificacao === 'LOJA')
  const foraDeBase = d.paradas.some(p => p.classificacao === 'FORA_BASE' && !p.loja_id)
  if (foraDeBase && !visitouLoja) {
    return { status: 'FORA_DE_BASE', revisar: true, motivoRevisao: 'Parou fora de base; conferir se houve entrega.' }
  }
  return { status: 'ENTREGUE', revisar: false, motivoRevisao: null }
}

/** Rótulo legível pra UI. */
export const STATUS_LABEL: Record<StatusRota, string> = {
  ENTREGUE: 'Entregue',
  SEM_RASTREADOR: 'Sem rastreador',
  NAO_FOI_AO_CLIENTE: 'Não foi ao cliente',
  FORA_DE_BASE: 'Fora de base',
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/kpi/status-rota.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi/status-rota.ts src/lib/kpi/status-rota.test.ts
git commit -m "feat(kpi): função pura derivarStatus para status da rota"
```

---

### Task 2: Enriquecer o preview no backend

**Files:**
- Modify: `src/app/api/kpi/simples/route.ts` (tipo `PreviewLinha` ~21-33; montagem do `preview` ~637-651)

Contexto: a montagem atual (linha 637) já calcula `tem_gps` e `ficou_na_base` e tem `rota.paradas` (cada parada com `classificacao`; o `loja_id`/`codigo_loja` está disponível na parada — confirmar o nome do campo lendo o objeto `rota.paradas[n]` no arquivo). A saída da loja = chegada da parada da loja + duração.

- [ ] **Step 1: Adicionar os campos ao tipo `PreviewLinha` do route.ts**

No tipo `PreviewLinha` (~linha 21-33), adicionar:

```ts
  status: import('@/lib/kpi/status-rota').StatusRota
  revisar: boolean
  motivoRevisao: string | null
  saida_loja_fmt: string | null
```

(ou importar `StatusRota` no topo do arquivo: `import { derivarStatus, type StatusRota } from '@/lib/kpi/status-rota'`.)

- [ ] **Step 2: Importar `derivarStatus` no topo do route.ts**

```ts
import { derivarStatus } from '@/lib/kpi/status-rota'
```

- [ ] **Step 3: Calcular status e saída da loja na montagem do preview**

Dentro do `.map(({ rota, esc }, idx) => { ... })` que monta `preview` (~637), antes do `return`, computar:

```ts
        const p0 = rota.paradas[0]
        const statusInfo = derivarStatus({
          temGps: !!(rota.saida_cd || rota.paradas.length > 0),
          ficouNaBase: rota.status === 'sem_entrega' && !!esc.placa_norm,
          // Mapear paradas pro shape esperado (classificacao + loja_id). Conferir
          // o nome do campo de loja na parada (codigo_loja ou loja_id) ao ler o objeto.
          paradas: rota.paradas.map(p => ({ classificacao: p.classificacao, loja_id: (p.codigo_loja ?? p.loja_id) ?? null })),
        })
        const saidaLoja = p0?.chegada && p0?.duracao_min != null
          ? new Date(p0.chegada.getTime() + p0.duracao_min * 60_000)
          : null
```

E no objeto retornado (junto com os campos existentes), adicionar:

```ts
        status: statusInfo.status,
        revisar: statusInfo.revisar,
        motivoRevisao: statusInfo.motivoRevisao,
        saida_loja_fmt: fmtHoraBRT(saidaLoja),
```

> NOTA: converter o `.map` de arrow-implícito para corpo com `{ ... return ... }` se ainda for arrow de expressão.

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: zero erros. (Se acusar `p.loja_id`/`p.codigo_loja` inexistente, abrir a definição de `rota.paradas[n]` e usar o campo correto que contém o código/id da loja.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/kpi/simples/route.ts
git commit -m "feat(kpi): preview enriquecido com status, revisão e saída da loja"
```

---

### Task 3: Tipo + coluna de Status + Saída da Loja na tela

**Files:**
- Modify: `src/app/painel/kpi/simples/page.tsx` (tipo `PreviewLinha` ~41-54; `StatusBadge` novo; cabeçalho da tabela ~1230-1241; `PreviewRow` ~1259+)

- [ ] **Step 1: Atualizar o tipo `PreviewLinha` no page.tsx**

Adicionar os campos (espelhando o backend):

```ts
  status: import('@/lib/kpi/status-rota').StatusRota
  revisar: boolean
  motivoRevisao: string | null
  saida_loja_fmt: string | null
```

(ou `import { STATUS_LABEL, type StatusRota } from '@/lib/kpi/status-rota'` no topo.)

- [ ] **Step 2: Criar o componente `StatusBadge`**

Perto dos outros helpers de `page.tsx`:

```tsx
const STATUS_TOM: Record<StatusRota, { bg: string; fg: string }> = {
  ENTREGUE:           { bg: 'var(--color-success-soft)', fg: 'var(--color-success-soft-fg)' },
  SEM_RASTREADOR:     { bg: 'var(--color-danger-soft)',  fg: 'var(--color-danger-soft-fg)' },
  NAO_FOI_AO_CLIENTE: { bg: 'var(--color-warning-soft)', fg: 'var(--color-warning-soft-fg)' },
  FORA_DE_BASE:       { bg: 'var(--color-info-soft)',    fg: 'var(--color-info-soft-fg)' },
}

function StatusBadge({ status }: { status: StatusRota }) {
  const t = STATUS_TOM[status]
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap"
      style={{ background: t.bg, color: t.fg }}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}
```

- [ ] **Step 3: Adicionar os cabeçalhos "Status" e "Saída Loja" na tabela**

No `<thead>` da tabela (~1230-1241), após o `<th>` de "Loja", inserir um `<th>` "Status"; e após "Ch. Loja", inserir "Saída Loja" (seguindo o padrão `hidden md:table-cell` das colunas de horário):

```tsx
<th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">Status</th>
```
e
```tsx
<th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] hidden md:table-cell">Saída Loja</th>
```

- [ ] **Step 4: Renderizar `StatusBadge` e a saída da loja no `PreviewRow`**

No `PreviewRow` (~1259+), adicionar uma `<td>` com `<StatusBadge status={linha.status} />` na posição correspondente (logo após a célula de Loja) e uma `<td className="... hidden md:table-cell">{linha.saida_loja_fmt ?? '—'}</td>` na posição da nova coluna. Manter alinhamento com a ordem dos `<th>`.

- [ ] **Step 5: Verificar tipos e build**

Run: `npx tsc --noEmit && npm run build`
Expected: zero erros; build compila.

- [ ] **Step 6: Commit**

```bash
git add src/app/painel/kpi/simples/page.tsx
git commit -m "feat(kpi): coluna de Status e Saída da Loja no resultado"
```

---

### Task 4: Destaque das linhas a revisar

**Files:**
- Modify: `src/app/painel/kpi/simples/page.tsx` (`PreviewRow` ~1259+)

- [ ] **Step 1: Computar a flag de "precisa revisão" da linha**

No `PreviewRow`, no início do componente:

```tsx
  const precisaRevisao = linha.revisar || linha.confianca === 'UNMATCHED' || !linha.placa || linha.anomalias.length > 0
```

- [ ] **Step 2: Aplicar realce na `<tr>` quando precisa revisão**

Na `<tr>` do `PreviewRow`, compor a className com (usando `cn`):

```tsx
  className={cn(
    'transition-colors',
    precisaRevisao
      ? 'bg-[var(--color-warning-soft)]/40 border-l-2 border-l-[var(--color-warning)]'
      : 'hover:bg-[var(--color-bg-subtle)]',
  )}
```

E na primeira `<td>` (a do `#`), quando `precisaRevisao`, mostrar um ícone de alerta antes do número:

```tsx
  {precisaRevisao && <WarningCircle size={12} weight="fill" className="mr-1 inline align-middle text-[var(--color-warning)]" />}
```

(`WarningCircle` já é importado no arquivo.)

- [ ] **Step 3: Verificar tipos e build**

Run: `npx tsc --noEmit && npm run build`
Expected: zero erros; build compila.

- [ ] **Step 4: Commit**

```bash
git add src/app/painel/kpi/simples/page.tsx
git commit -m "feat(kpi): destaque visual das linhas que precisam revisão"
```

---

### Task 5: Painel de "Avisos de revisão" por rede

**Files:**
- Modify: `src/app/painel/kpi/simples/page.tsx` (novo componente `AvisosRevisao`; usar dentro de `RedePreviewSection` ~1155, logo abaixo do header da rede)

- [ ] **Step 1: Criar o componente `AvisosRevisao`**

```tsx
function AvisosRevisao({ linhas }: { linhas: PreviewLinha[] }) {
  const semPlaca = linhas.filter(l => !l.placa).length
  const baixaConfianca = linhas.filter(l => l.confianca === 'LOW' || l.confianca === 'UNMATCHED').length
  const comAnomalia = linhas.filter(l => l.anomalias.length > 0).length
  const foraDeBase = linhas.filter(l => l.status === 'FORA_DE_BASE').length

  const itens = [
    { n: semPlaca, txt: 'sem placa' },
    { n: baixaConfianca, txt: 'baixa confiança / não casada' },
    { n: comAnomalia, txt: 'com anomalia' },
    { n: foraDeBase, txt: 'fora de base' },
  ].filter(i => i.n > 0)

  if (itens.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--color-border)] bg-[var(--color-warning-soft)]/40 px-5 py-2.5 text-[12px]">
      <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--color-warning-soft-fg)]">
        <WarningCircle size={14} weight="fill" /> Revisar:
      </span>
      {itens.map((i, k) => (
        <span key={k} className="text-[var(--color-fg-muted)]">
          <span className="text-numeric font-semibold text-[var(--color-fg)]">{i.n}</span> {i.txt}{k < itens.length - 1 ? ' ·' : ''}
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Renderizar o painel dentro de `RedePreviewSection`**

Logo após o bloco do header da rede e a barra de cobertura (antes da `<div className="overflow-x-auto">` da tabela, ~1227), inserir:

```tsx
      <AvisosRevisao linhas={rede.preview} />
```

- [ ] **Step 3: Verificar tipos e build**

Run: `npx tsc --noEmit && npm run build`
Expected: zero erros; build compila.

- [ ] **Step 4: Commit**

```bash
git add src/app/painel/kpi/simples/page.tsx
git commit -m "feat(kpi): painel de avisos de revisão por rede"
```

---

### Task 6: Validação final (sem push)

- [ ] **Step 1: Suíte completa**

Run: `npx tsc --noEmit && npm run build && npx vitest run`
Expected: tsc zero erros; build compila; todos os testes passam (incluindo os 5 novos de `status-rota`).

- [ ] **Step 2: NÃO fazer push/deploy**

Não rodar `git push` nem merge pra `main`. A validação visual será local via `npm run dev` (o assistente liga o servidor quando o usuário pedir).

---

## Self-Review

**Spec coverage:** (1) status por rota → Task 1+2+3; (2) "não foi ao cliente" / "fora de base" + revisão → Task 1; (3) só na tela → Tasks 2/3 não tocam gerador-kpi/pdf; (4) coluna Status → Task 3; (5) colunas que faltam → Task 3 (Saída Loja; tempo de operação/chegada base ficam de fora por estarem atrás de flag não lançada no gerador — registrar como follow-up se o usuário quiser); (6) avisos → Task 5; (7) destaque → Task 4.

**Placeholder scan:** nenhum TBD; código presente em cada passo. O único ponto a confirmar no código (nome do campo de loja na parada) está explicitado com instrução de fallback.

**Type consistency:** `StatusRota`, `derivarStatus`, `STATUS_LABEL` usados consistentemente entre `status-rota.ts`, `route.ts` e `page.tsx`. Campos novos da `PreviewLinha` (`status`, `revisar`, `motivoRevisao`, `saida_loja_fmt`) idênticos nos dois tipos (backend e frontend).

**Gap consciente:** "tempo de operação" e "chegada na base" não entram agora porque o gerador marca essas colunas como "ainda não lançadas" (flag desligada). Saída da Loja entra. Se o usuário quiser as outras duas, abrir follow-up que liga o cálculo no motor primeiro.
