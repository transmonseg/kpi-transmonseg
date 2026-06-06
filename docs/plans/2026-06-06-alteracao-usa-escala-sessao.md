# Alteração lê a escala da sessão — Implementation Plan

> Objetivo: na KPI simples, a análise de alteração usa **a escala que o usuário
> acabou de subir na tela** (não o banco) pra inferir quem SAI, montar a escala
> corrigida e cruzar com o Unitrac. Hoje o `analisar-alt` busca `escala_linhas`
> no banco (14 dias) — a GERAL nem está lá, então o SAI fica vazio e nada é
> aplicado.

**Arquitetura:**
- Extrai o auto-detect de parser de escala (hoje inline no `route.ts`) p/ um
  módulo reusável `parseEscalaArquivo(buffer, filename, data)`.
- `analisar-alt` passa a aceitar os arquivos de escala (multipart), parseia com
  esse módulo e infere o SAI **dessas linhas** (fallback: banco).
- A tela manda os arquivos de escala selecionados junto na análise.
- `inferirSaiDaEscala` passa a casar por **carro_ordem** (hoje 2º carro pega o
  SAI do 1º).

**Stack:** Next.js 16 / React 19 / TS strict / vitest.

---

### Task 1 — Extrair `parseEscalaArquivo` reusável
**Files:** Create `src/lib/parsers/escala-arquivo.ts`; Modify `src/app/api/kpi/simples/route.ts`; Test `src/lib/parsers/escala-arquivo.test.ts`
- `export async function parseEscalaArquivo(buffer: ArrayBuffer|Buffer, filename: string, data?: string): Promise<LinhaEscala[]>` — replica o dispatch atual: `.pdf` → Guanabara PDF; senão tenta ZonaSul → ArmazemGrao → Pax → Geral (1ª com ≥3 linhas vence).
- Refatora o loop do `route.ts` (linhas 188-219) pra usar a função.
- Teste: parseia `ESCALA GERAL DE JUNHO 1.xlsx` → ≥150 linhas; reconhece pelo conteúdo.
- Suíte verde. Commit.

### Task 2 — `inferirSaiDaEscala` casa por carro_ordem
**Files:** Modify `src/lib/parsers/inferir-sai.ts`; Test `src/lib/parsers/inferir-sai.test.ts`
- Extrai `carroAlt` da alteração: de `motivo` (/(\d)\s*º?\s*CARRO/i) ou `loja_nome_raw` (/(\d)\s*º?\s*carro/i).
- No match: coleta TODAS as linhas da loja (não dá break na 1ª); escolhe a com `carro_ordem === carroAlt`; se não houver, mantém a 1ª.
- Teste: loja com 1º e 2º carro distintos → alteração "2º CARRO" pega o SAI do 2º carro (não do 1º).
- Suíte verde. Commit.

### Task 3 — `analisar-alt` usa a escala enviada
**Files:** Modify `src/app/api/kpi/simples/analisar-alt/route.ts`
- No ramo multipart, lê `fd.getAll('escala')` (File[]). Se houver, parseia cada um com `parseEscalaArquivo` → `escalaSessao: LinhaEscala[]`.
- Nova função `inferirComEscala(alteracoes, escalaSessao, data, svc)`: se `escalaSessao.length` → `inferirSaiDaEscalaLista(alteracoes, escalaSessao as EscalaLinha[])`; senão cai no `inferirSaiDaEscala` (banco).
- Aplica nos 3 ramos (texto, pdf, txt) — todos viram multipart-capable: aceita `escala` files + (`texto` OU `pdf`).
- tsc verde. Commit.

### Task 4 — Tela manda os arquivos de escala
**Files:** Modify `src/app/painel/kpi/simples/page.tsx`
- `analisarTexto/analisarPdf/analisarTxt` passam a montar `FormData` com os `escalas` (File[]) + o texto/pdf. (texto vira campo `texto` no form; pdf como `pdf`.)
- O componente de alteração recebe `escalas` por prop (já está no estado do pai).
- Conferir visual local. Commit.

### Task 5 — Validação E2E
- `npx vitest run` (todos verdes) · `tsc` 0 · `npm run build` OK.
- E2E real: escala GERAL + PDF alteração 06.06 → os 7 SAI identificados (Carrefour Brigadeiro→Renan sai, Princesa Copa→Wanderson sai, 2º carro distinto do 1º).
- Commit + push (deploy).
