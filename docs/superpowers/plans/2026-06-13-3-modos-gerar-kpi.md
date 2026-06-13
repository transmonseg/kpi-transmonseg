# 3 Modos de Geração de KPI (PDF / PDF+API / só API) Implementation Plan

> **PIVOT (13/06):** por decisão do usuário, o NORMAL (`/api/kpi/simples`) fica
> INTOCÁVEL (só mexer pra corrigir bug dele). Os 3 modos foram implementados no
> **BETA** (`/api/kpi/beta` + `/painel/kpi/beta`), não na produção. As Tasks abaixo
> descrevem a abordagem de produção (não executada); a versão real ficou no beta,
> que já tinha 2 modos — só virou 3 (gate do 'pdf' puro sem API + seletor de 3 pills).


> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps usam checkbox.

**Goal:** Na tela "Gerar KPI" de PRODUÇÃO, o operador escolhe a fonte das paradas — Só PDF (atual) / PDF + API (PDF base + API confirma/completa) / Só API (sem PDF) — pra comparar e usar o que funciona melhor, sem regredir o fluxo atual.

**Architecture:** Adição na rota `/api/kpi/simples` e na tela `simples/page.tsx` de um param `fonte: 'pdf' | 'pdf_api' | 'api'` (default `'pdf'` = comportamento byte-idêntico ao atual). Os modos `pdf_api`/`api` reusam as libs JÁ testadas do beta (`consolidaParadasApi`, `confirmaEntregaViaApi`, `confirmaPorAlvo`, `inicioRotaPorAlvo`, `situacaoViva`). A persistência de produção (`kpi_simples`, `escala_linhas`) é mantida (ao contrário do beta). Tudo guardado atrás de `if (fonte !== 'pdf')` — `'pdf'` puro não faz nenhuma chamada de rede nova.

**Tech Stack:** TypeScript, Next.js (nodejs runtime, maxDuration 120), vitest. Libs: `@/lib/unitrac-api`, `@/lib/kpi/situacao-viva`.

---

## Contexto e referência (a beta É o gabarito do código)

Os agentes confirmaram por diff: `src/app/api/kpi/beta/route.ts` é `src/app/api/kpi/simples/route.ts` + adições aditivas. O plano TRAZ essas adições pra produção, sob guards, e MANTÉM a persistência que a beta removeu. Onde o passo diz "espelhar beta:X-Y", copiar o bloco da beta com as diferenças indicadas — é referência exata, não placeholder.

**Âncoras na produção (`src/app/api/kpi/simples/route.ts`):**
- Body destructure: `:117`
- Guard unitrac obrigatório: `:134` ; guard PDF obrigatório: `:140-141`
- Montagem `veiculosMap` (PDF): `:305-306` (`const veiculosMap = new Map<...>()` + `for (const unitracPath of unitracPaths)`)
- Persistência `escala_linhas`: `:227,265` ; `kpi_simples`: `:910-941` (MANTER)
- Retorno do preview (última prop `saida_loja_fmt`): `:823`

**Libs prontas e testadas (NÃO reescrever):**
- `consolidaParadasApi`, `buscarStopsCru`, `buscarFrota`, `buscarPontos`, `buscarPosicoes`, `buscarAlvos`, `confirmaEntregaViaApi`, `confirmaPorAlvo`, `inicioRotaPorAlvo`, `validarRotaConcluida`, tipos `MapaPontos/MapaPosicoes/AlvoApi` — todos de `@/lib/unitrac-api`.
- `situacaoViva` de `@/lib/kpi/situacao-viva`.
- `ResumoVeiculo`, `ClassificacaoParada` de `@/lib/types/unitrac`.

**Rodar:** `npx vitest run` ; tipos `npx tsc --noEmit 2>&1 | grep "^src/"`.

---

## Estrutura de arquivos

| Arquivo | Mudança |
|---|---|
| `src/app/api/kpi/simples/route.ts` | param `fonte`; montagem API; bloco de enriquecimento sob guard; persistir `fonte`; campos extras no preview |
| `src/app/painel/kpi/simples/page.tsx` | seletor de 3 modos; envia `fonte`; afrouxa exigência de PDF em `api`; esconde modos online no desktop |

> Escopo: SÓ os 3 modos. Os 2 guard-rails de segurança (relatório-parcial e validação de escala) são planos separados.

---

## Task 1: Rota — param `fonte` + validações relaxadas (guard inerte)

**Files:** Modify `src/app/api/kpi/simples/route.ts`

- [ ] **Step 1: ler `fonte` no body**

Em `:117`, a desestruturação do body. Adicionar `fonte = 'pdf'` e o tipo:
```ts
  const { escalaBucketPath, escalaBucketPaths, unitracBucketPath, unitracBucketPaths, data, alteracoes = [], lineEdits = [], skipSave = false, fonte = 'pdf' } = body as {
```
E no bloco de tipos do `body as { ... }` (logo abaixo), adicionar a linha:
```ts
    fonte?: 'pdf' | 'pdf_api' | 'api'
```

- [ ] **Step 2: relaxar exigência de Unitrac/PDF só no modo `api`**

`:134` — trocar:
```ts
  if (rawUnitracPaths.length === 0) return new NextResponse('"unitracBucketPath" ou "unitracBucketPaths" obrigatório.', { status: 400 })
```
por:
```ts
  if (fonte !== 'api' && rawUnitracPaths.length === 0) return new NextResponse('"unitracBucketPath" ou "unitracBucketPaths" obrigatório.', { status: 400 })
```
`:140-141` — trocar `if (!temPdf) {` por:
```ts
  if (fonte !== 'api' && !temPdf) {
```

- [ ] **Step 3: imports das libs API (topo do arquivo)**

Adicionar após os imports existentes:
```ts
import { buscarFrota, buscarPontos, buscarPosicoes, buscarStopsCru, consolidaParadasApi, buscarAlvos, confirmaEntregaViaApi, confirmaPorAlvo, inicioRotaPorAlvo, validarRotaConcluida, type MapaPontos, type MapaPosicoes, type AlvoApi } from '@/lib/unitrac-api'
import { situacaoViva, type SituacaoViva } from '@/lib/kpi/situacao-viva'
import type { ResumoVeiculo, ClassificacaoParada } from '@/lib/types/unitrac'
```

- [ ] **Step 4: tipos**

Run: `npx tsc --noEmit 2>&1 | grep "^src/app/api/kpi/simples"` → vazio (imports não usados ainda geram warning de lint, não erro de tsc; serão usados nas Tasks 2-3).

- [ ] **Step 5: commit**
```bash
git add src/app/api/kpi/simples/route.ts
git commit -m "feat(kpi): rota aceita param fonte (pdf|pdf_api|api), default pdf inerte"
```

---

## Task 2: Rota — montar paradas pela API quando `fonte==='api'`

**Files:** Modify `src/app/api/kpi/simples/route.ts`

- [ ] **Step 1: bifurcar a montagem de `veiculosMap`**

Em `:305-306`, o trecho atual:
```ts
  const veiculosMap = new Map<string, import('@/lib/types/unitrac').ResumoVeiculo>()
  for (const unitracPath of unitracPaths) {
```
Envolver assim (espelhar beta `:317-403`, mas declarar `veiculosMap` UMA vez antes do `if`):
```ts
  const veiculosMap = new Map<string, ResumoVeiculo>()
  if (fonte === 'api') {
    const frotaApi = await buscarFrota()
    const pontosApiVeic = await buscarPontos(frotaApi.map(vv => vv.cv))
    const placasEscala = new Set(escalaLinhas.map(l => l.placa_norm).filter(Boolean) as string[])
    for (const vv of frotaApi) {
      if (!placasEscala.has(vv.placaNorm)) continue
      const paradas = consolidaParadasApi(await buscarStopsCru(vv.cv, 48), pontosApiVeic, data, vv.placaNorm)
      if (paradas.length === 0) continue
      veiculosMap.set(vv.placaNorm, {
        placa_norm: vv.placaNorm, placa_raw: vv.placa, inicio_viagem: null, fim_viagem: null,
        qtd_paradas: paradas.length, saida_cd: null,
        paradas: paradas.map(p => ({
          placa_norm: vv.placaNorm, chegada: new Date(p.chegada), saida: new Date(p.saida!),
          duracao_seg: p.duracao_seg ?? 0, distancia_km: null, endereco: p.endereco ?? null,
          lat: p.lat, lng: p.lng, local_parada: p.local_parada, codigo_loja: p.codigo_loja,
          nome_loja: p.nome_loja, classificacao: p.classificacao as ClassificacaoParada, ordem: p.ordem,
        })),
      })
    }
  } else {
  for (const unitracPath of unitracPaths) {
```
> Mantém o `for` do PDF dentro do `else`. O corpo do `for` NÃO muda.

- [ ] **Step 2: fechar o `else`**

Localizar o fim do loop `for (const unitracPath...)` (o `}` que o fecha, logo antes de `const veiculos = Array.from(veiculosMap.values())`, ~`:355`) e adicionar mais um `}` pra fechar o `else`. Conferir que `const veiculos = Array.from(veiculosMap.values())` continua logo depois.

- [ ] **Step 3: tipos**

Run: `npx tsc --noEmit 2>&1 | grep "^src/app/api/kpi/simples"` → vazio. Se `ResumoVeiculo`/`ClassificacaoParada` reclamarem, conferir a shape em `src/lib/types/unitrac.ts` (os campos usados acima são os exigidos).

- [ ] **Step 4: suíte (nada quebrou)**

Run: `npx vitest run` → tudo verde.

- [ ] **Step 5: commit**
```bash
git add src/app/api/kpi/simples/route.ts
git commit -m "feat(kpi): fonte 'api' monta paradas via consolidação (sem PDF)"
```

---

## Task 3: Rota — enriquecimento por API (só quando `fonte !== 'pdf'`) + preview + persistir fonte

**Files:** Modify `src/app/api/kpi/simples/route.ts`

- [ ] **Step 1: campos extras no `PreviewLinha`**

No `type PreviewLinha = { ... }` (perto de `:24`), adicionar antes do `}`:
```ts
  viaApi?: string[]
  notasFiscais?: string[]
  situacaoViva?: SituacaoViva
```

- [ ] **Step 2: bloco de enriquecimento API (geofence + alvo/NF + saída CD + situacaoViva)**

Localizar onde as `rotas` já estão computadas e ANTES da montagem do `redeMap`/preview (na beta isso é o bloco `:654-752`). Inserir, na produção, o MESMO bloco da beta `:654-752`, com 3 diferenças:
1. Envolver TODO o bloco em `if (fonte !== 'pdf') { ... }` (em `'pdf'` puro nada disso roda).
2. Manter os `Map` auxiliares (`confirmacoesApi`, `notasPorLinha`) declarados — eles alimentam o preview.
3. Incluir o fallback de saída CD por alvo (beta já tem: `inicioRotaPorAlvo`) e a `situacaoViva` no preview.

Copiar verbatim da beta:
- `const confirmacoesApi = new Map<string, string[]>()` + `notasPorLinha` + `let pontosApi/posicoesApi/alvosApi` (beta `:655-661`)
- O `try { ... } catch` inteiro de confirmação (beta `:662-752`), que já faz: confirmação por geofence (`confirmaEntregaViaApi`), saída CD por `inicioRotaPorAlvo`, confirmação/resgate por `confirmaPorAlvo`.

> Como `escalaMap`, `lojasParaMatcher`, `placaRastreada`, `placaSaiuDaBase`, `variantesPlaca`, `resolverLojaEsperada`, `fmtHoraBRT` existem iguais nas duas rotas (núcleo idêntico), o bloco compila sem ajustes além do guard.

- [ ] **Step 3: anexar campos ao objeto do preview**

No `return { ordem, ..., saida_loja_fmt: fmtHoraBRT(saidaLoja) }` do preview (`:823`), adicionar:
```ts
          viaApi: confirmacoesApi.get(rota.escala_linha_id),
          notasFiscais: notasPorLinha.get(rota.escala_linha_id),
          situacaoViva: situacaoViva({
            entregue: statusInfo.status === 'ENTREGUE' || statusInfo.status === 'ENTREGUE_GEO',
            naApi: placaRastreada(rota.placa_norm),
            saiuDaBase: placaSaiuDaBase(rota.placa_norm),
          }),
```
> `confirmacoesApi`/`notasPorLinha` em modo `'pdf'` ficam vazios → `viaApi/notasFiscais` `undefined`, `situacaoViva` calcula normal (com `naApi=false` no pdf, pois `placaRastreada` no pdf reflete o relatório). Em `'pdf'` esses campos não atrapalham o XLSX/PDF (são só do preview).

- [ ] **Step 4: persistir `fonte` (auditoria) — MANTER a persistência**

No insert de `kpi_simples` (`:911`), adicionar o campo `fonte` ao objeto inserido:
```ts
        fonte,
```
> Se a coluna `fonte` não existir na tabela, o insert FALHA. Para evitar DDL: NÃO adicionar à tabela; em vez disso, guardar no JSON `redes`/summary se já houver um campo livre, OU pular este step (auditoria de fonte é nice-to-have). Decisão segura: **pular o Step 4** (não persistir fonte) pra não exigir migration. Marcar como feito sem alterar o insert.

- [ ] **Step 5: tipos + suíte**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head` → vazio.
Run: `npx vitest run` → verde.

- [ ] **Step 6: commit**
```bash
git add src/app/api/kpi/simples/route.ts
git commit -m "feat(kpi): enriquecimento API (geofence/alvo/NF/saída CD/situação) sob fonte!=pdf"
```

---

## Task 4: UI — seletor de 3 modos na tela de produção

**Files:** Modify `src/app/painel/kpi/simples/page.tsx`

- [ ] **Step 1: estado do modo**

Perto dos `useState` do componente principal (`KpiSimplesPage`), adicionar:
```tsx
  const [fonte, setFonte] = useState<'pdf' | 'pdf_api' | 'api'>('pdf')
```

- [ ] **Step 2: enviar `fonte` no fetch de `processar`**

No `processar()`, no `fetch('/api/kpi/simples', { ... body: JSON.stringify({ escalaBucketPaths, unitracBucketPaths, data, alteracoes }) })`, incluir `fonte`:
```tsx
          body: JSON.stringify({ escalaBucketPaths, unitracBucketPaths, data, alteracoes, fonte }),
```
E no upload paralelo, não exigir unitrac no modo `api`:
```tsx
        const [escalaBucketPaths, unitracBucketPaths] = await Promise.all([
          Promise.all(escalas.map(f => uploadComPresign(f, false))),
          fonte === 'api' ? Promise.resolve([] as string[]) : Promise.all(unitracFiles.map(f => uploadComPresign(f, true))),
        ])
```
E no `regenerar()` (se mandar body), incluir `fonte` também.

- [ ] **Step 3: afrouxar validações de PDF e o `pronto`**

No `processar()`, a checagem de PDF obrigatório: envolver em `if (fonte !== 'api')`. O `const pronto = escalas.length>0 && temUnitracPdf && !!data` vira:
```tsx
  const pronto = escalas.length > 0 && !!data && (fonte === 'api' || temUnitracPdf)
```

- [ ] **Step 4: renderizar o seletor (3 pills) antes do CTA Gerar**

Antes do bloco do CTA hero (botão "Gerar KPIs"), adicionar:
```tsx
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">Fonte das paradas</span>
          {([['pdf','Só PDF'],['pdf_api','PDF + API'],['api','Só API']] as const).map(([v, lbl]) => (
            <button key={v} type="button" onClick={() => setFonte(v)}
              className={cn('px-2.5 py-1 rounded text-xs font-medium border transition-colors',
                fonte === v ? 'border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success-soft-fg)]' : 'border-[var(--color-border-strong)] text-[var(--color-fg-muted)]')}>
              {lbl}
            </button>
          ))}
        </div>
```
> `cn` já é importado em `page.tsx` (usado em todo o arquivo).

- [ ] **Step 5: esconder modos online no desktop offline**

Onde define o seletor, condicionar: se `deveGerarOffline()` (função módulo em `page.tsx`), forçar `fonte='pdf'` e não renderizar os pills de API. Adicionar no topo do render do seletor:
```tsx
        {!deveGerarOffline() && (
```
e fechar `)}` após o `</div>` do seletor. (No desktop offline só PDF.)

- [ ] **Step 6: tipos + lint**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head` → vazio.
Run: `npx eslint src/app/painel/kpi/simples/page.tsx 2>&1 | grep -E "error" | grep -v warning` → vazio.

- [ ] **Step 7: commit**
```bash
git add src/app/painel/kpi/simples/page.tsx
git commit -m "feat(kpi): seletor de 3 modos (PDF / PDF+API / só API) na tela de geração"
```

---

## Task 5: UI — exibir selos da API no preview de produção

**Files:** Modify `src/app/painel/kpi/simples/page.tsx`

- [ ] **Step 1: tipo do preview no front**

No `type PreviewLinha` do front (em `page.tsx`), adicionar:
```tsx
  viaApi?: string[]
  notasFiscais?: string[]
  situacaoViva?: 'ENTREGUE' | 'EM_ROTA' | 'NA_BASE' | 'SEM_SINAL'
```

- [ ] **Step 2: renderizar selo de confiança / andamento**

Copiar do `beta/page.tsx` o bloco de render do status que já mostra: selo de confiança (CheckCircle + NF/API/geo) quando entregue+sem revisão, e o "Em rota / Na base / Sem sinal" quando não entregue. Localizar na beta o `<td>` do status (o IIFE com `linha.viaApi`/`linha.situacaoViva`) e replicar no `simples/page.tsx` no `<td>` de status correspondente.
> Verificar se `CheckCircle` (phosphor) está importado no `simples/page.tsx`; se não, adicionar ao import de `@phosphor-icons/react`.

- [ ] **Step 3: tipos + lint + suíte**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head` → vazio.
Run: `npx eslint src/app/painel/kpi/simples/page.tsx 2>&1 | grep -E "error" | grep -v warning` → vazio.
Run: `npx vitest run` → verde.

- [ ] **Step 4: commit**
```bash
git add src/app/painel/kpi/simples/page.tsx
git commit -m "feat(kpi): preview de produção exibe selos da API (NF/ponto/andamento)"
```

---

## Task 6: Validação — provar que `fonte='pdf'` é byte-idêntico + os 3 modos funcionam

**Files:** nenhum (validação).

- [ ] **Step 1: regressão do modo PDF (idêntico ao atual)**

Criar `scripts/dev/cmp-fonte-pdf.mts` que roda o pipeline de produção com `fonte` ausente e com `fonte='pdf'` pro dia 12 e compara o breakdown de status (devem ser idênticos). Reaproveitar o padrão de `scripts/dev/cmp-normal.mts` (já existe). Rodar:
`NODE_OPTIONS="--max-old-space-size=8192" npx tsx scripts/dev/cmp-fonte-pdf.mts`
Expected: mesmo número de ENTREGUE/MUDOU/etc com e sem `fonte` (o `'pdf'` não pode mudar nada).

- [ ] **Step 2: os 3 modos rodam sem erro (dia coberto pela API, ex 2026-06-13)**

Subir o dev (`npm run dev`), abrir `/painel/kpi/simples`, e gerar nos 3 modos com a escala do dia: `Só PDF` (com o PDF), `PDF + API` (com PDF), `Só API` (sem PDF). Conferir: PDF gera igual hoje; PDF+API mostra selos de NF/ponto + saída CD preenchida; Só API gera sem PDF com "em rota/na base".

- [ ] **Step 3: isolamento + suíte**

Run: `npx vitest run` → verde.
Run: `git diff --name-only main...HEAD | grep -vE "^docs|^scripts/dev"` → só `simples/route.ts` e `simples/page.tsx` (produção, intencional — é o objetivo desta feature).

- [ ] **Step 4: finalizar (skill finishing-a-development-branch)**

Merge na main + push. PR opcional.

---

## Notas de risco

- **Default inerte:** `fonte = 'pdf'` no body + guard `if (fonte !== 'pdf')` no enriquecimento + `if (fonte !== 'api')` nas validações ⇒ requisição atual (sem `fonte`, incl. `regerar` e desktop) = comportamento byte-idêntico. ESSA é a garantia de não regredir.
- **Persistência mantida** (diferente do beta): `kpi_simples` + `escala_linhas` continuam. NÃO copiar a remoção de persistência da beta.
- **Performance:** modo `api`/`pdf_api` faz `buscarStopsCru` por placa em série; com frota grande pode chegar perto de `maxDuration=120`. Se estourar, paralelizar (fase futura).
- **Desktop offline** não tem API → seletor força `pdf`.
- **Esta feature TOCA a produção de propósito** (é o pedido). Os guards garantem que o caminho `pdf` não muda. Os 2 guard-rails de segurança (relatório-parcial, validação-escala) ficam em planos separados.
