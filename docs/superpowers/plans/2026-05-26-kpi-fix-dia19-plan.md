# KPI Fix Dia 19 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver 7 padrões de bug do dia 19/05/2026, atingindo ≥90% de aceitável (vs 78.5% baseline), sem regressão nos dias 20/21.

**Architecture:** Correções pontuais no matcher (`src/lib/kpi/matcher.ts`) e parsers (`src/lib/parsers/*.ts`). Cada bug em branch isolada via worktree, com teste vitest failing→passing, code review por subagent, commit atômico.

**Tech Stack:** TypeScript + Vitest + ExcelJS + Supabase. Skills: `superpowers:*`, `mattpocock:diagnose`, `mattpocock:grill-me`, `anthropics:pdf`, `anthropics:xlsx`.

---

## Pré-requisitos (1x antes de qualquer bug)

### Task 0: Estabelecer baseline

**Files:**
- Read: `docs/auditoria/dia-19-todas-redes/00-bugs-consolidados.md`

- [ ] **Step 0.1: Confirmar working tree limpa**

Run: `git status --short`
Expected: vazio ou só `FLUXO-ATIVO.md` modificado

- [ ] **Step 0.2: Confirmar baseline 282 testes passando**

Run: `npx vitest run --reporter=dot 2>&1 | tail -5`
Expected: `Test Files 16 passed (16) | Tests 282 passed (282)`

- [ ] **Step 0.3: Confirmar typecheck zero**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: vazio (zero erros)

- [ ] **Step 0.4: Snapshot baseline regerar_local dia 19**

Run: `npx tsx scripts/analise/regerar_local.ts 19 2>&1 > /tmp/baseline-dia19.txt; cat /tmp/baseline-dia19.txt | tail -15`
Expected: TOTAL DIA 19 com ~190/242 (78.5%)

- [ ] **Step 0.5: Commit baseline snapshot**

```bash
cp /tmp/baseline-dia19.txt docs/auditoria/dia-19-reanalise/baseline.txt
git add docs/auditoria/dia-19-reanalise/baseline.txt
git commit -m "chore(baseline): snapshot dia 19 antes dos fixes"
```

---

## Bug 1 — Alteração PDF propagada (Padrão 3, 4 lojas ASSAI)

**Spec:** `docs/superpowers/specs/2026-05-26-kpi-fix-dia19/bug-1-pdf-alteracao.md`

### Task 1: Investigação + reprodução

**Files:**
- Read: `src/lib/parsers/alteracao-pdf-tabular.ts`
- Read: `src/lib/kpi/aplicar-alteracoes.ts`
- Read: `docs/auditoria/dia-19-todas-redes/01-assai.md` (BUG A1)

- [ ] **Step 1.1: Criar worktree isolada**

Run:
```bash
cd /c/Users/media/dev/kpi-transmonseg
git worktree add ../kpi-bug-1 -b fix/pdf-alteracao
cd ../kpi-bug-1
```

- [ ] **Step 1.2: Extrair PDF dia 19 com skill `pdf` (pdfplumber)**

Invocar skill: `anthropics:pdf` com input
`C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19/ALTERACOES/ALTERACAO DE ESCALA GERAL 19.05 (3).pdf`

Pedir: dump das células da tabela com coordenadas (x, y, texto). Salvar em `docs/auditoria/dia-19-reanalise/pdf-alteracao-19.txt`.

Expected: ver `Assaí - São Gonçalo Camil - Loja 211` como linha única com `MESSIAS / 141 / AMW-3424` na mesma row, NÃO espalhado.

- [ ] **Step 1.3: Rodar parser TS atual no mesmo PDF**

Run:
```bash
npx tsx -e "
import { parseAlteracaoPdfTabular } from './src/lib/parsers/alteracao-pdf-tabular'
import { readFileSync } from 'fs'
const buf = readFileSync('C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19/ALTERACOES/ALTERACAO DE ESCALA GERAL 19.05 (3).pdf')
const r = await parseAlteracaoPdfTabular(buf)
console.log(JSON.stringify(r, null, 2))
" 2>&1 | head -80
```

Expected: ver objetos `AlteracaoParsed` com `loja_nome_raw`. Verificar se vem GENÉRICO (só "Assaí") ou ESPECÍFICO (com nome completo).

- [ ] **Step 1.4: Identificar discrepância PDF vs parser**

Comparar output do Step 1.2 (pdfplumber, verdade) com Step 1.3 (nosso parser). Documentar achado em `docs/auditoria/dia-19-reanalise/bug-1-discrepancia.md`.

Resultados esperados (uma das duas hipóteses):
- **H1:** Parser TS retorna `loja_nome_raw="Assaí"` (genérico) → bug no parser
- **H2:** Parser TS retorna `loja_nome_raw="Assaí - São Gonçalo Camil - Loja 211"` (correto) → bug no `aplicarAlteracoes`

### Task 2: Fix por hipótese identificada

#### Se H1 (parser PDF retorna genérico)

**Files:**
- Modify: `src/lib/parsers/alteracao-pdf-tabular.ts:244` (build da AlteracaoParsed)

- [ ] **Step 2H1.1: Adicionar teste failing**

Criar `src/lib/parsers/alteracao-pdf-tabular.test.ts` (ou expandir se já existe):

```typescript
import { describe, it, expect } from 'vitest'
import { parseAlteracaoPdfTabular } from './alteracao-pdf-tabular'
import { readFileSync } from 'fs'

describe('parseAlteracaoPdfTabular — dia 19 não-propagação', () => {
  it('loja_nome_raw inclui nome especifico da loja (Loja 211 Camil)', async () => {
    const buf = readFileSync('C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19/ALTERACOES/ALTERACAO DE ESCALA GERAL 19.05 (3).pdf')
    const alts = await parseAlteracaoPdfTabular(buf)
    const messias = alts.find(a => a.entra?.placa_norm === 'AMW3424')
    expect(messias).toBeDefined()
    expect(messias!.loja_nome_raw).toMatch(/S.o Gon.alo Camil/i)
    expect(messias!.loja_nome_raw).toMatch(/211/)
  })
})
```

- [ ] **Step 2H1.2: Rodar teste e ver falhar**

Run: `npx vitest run src/lib/parsers/alteracao-pdf-tabular.test.ts -t "loja_nome_raw inclui" 2>&1 | tail -10`
Expected: FAIL (loja_nome_raw é genérico ou null)

- [ ] **Step 2H1.3: Implementar fix no parser**

No `alteracao-pdf-tabular.ts:244`, garantir que `redesCel` (linha 246 do build) usa a string da CÉLULA REDES/FILIAIS da linha em si, não cabeçalho ou rótulo geral. Verificar `celula(lin, 'redes', schema.colunas)` retorna o texto completo da célula (inclui "Loja X").

Se necessário, ajustar `montaSchema` (linha 200+) pra detectar a coluna REDES com largura suficiente pra capturar nome completo.

- [ ] **Step 2H1.4: Teste passing + full suite**

Run:
```bash
npx vitest run src/lib/parsers/alteracao-pdf-tabular.test.ts 2>&1 | tail -5
npx vitest run --reporter=dot 2>&1 | tail -5
npx tsc --noEmit 2>&1 | head -3
```
Expected: tests pass, 283+/283+, typecheck OK

#### Se H2 (aplicar-alteracoes espalha mesmo com nome certo)

**Files:**
- Read: `src/lib/kpi/aplicar-alteracoes.test.ts`
- Modify: `src/lib/kpi/aplicar-alteracoes.ts:56-83`

- [ ] **Step 2H2.1: Adicionar teste failing**

Em `src/lib/kpi/aplicar-alteracoes.test.ts`:

```typescript
it('alteracao INCLUSAO com loja especifica nao espalha pra outras lojas mesma rede', () => {
  const linhas: LinhaEscala[] = [
    { id: 'l1', rede_id: 'ASSAI', loja_nome_raw: 'Assaí - Alcântara II - Loja 293', loja_codigo_raw: '293', placa_norm: 'FQN6J72', motorista_nome: 'LUIZ CARLOS', ...stub } as any,
    { id: 'l2', rede_id: 'ASSAI', loja_nome_raw: 'Assaí - São Gonçalo Camil - Loja 211', loja_codigo_raw: '211', placa_norm: 'OLD1234', motorista_nome: 'OLD MOT', ...stub } as any,
  ]
  const alts: AltConfirmada[] = [
    {
      tipo: 'INCLUSAO',
      rede_id: 'ASSAI',
      loja_raw: 'Assaí - São Gonçalo Camil - Loja 211',
      sai: null,
      entra: { motorista_nome: 'MESSIAS', motorista_codigo: 141, placa_raw: 'AMW-3424', placa_norm: 'AMW3424' },
    },
  ]
  const out = aplicarAlteracoes(linhas, alts)
  expect(out.find(l => l.id === 'l1')!.placa_norm).toBe('FQN6J72') // NÃO mudou
  expect(out.find(l => l.id === 'l2')!.placa_norm).toBe('AMW3424') // mudou só Loja 211
})
```

- [ ] **Step 2H2.2: Rodar teste e ver falhar**

Run: `npx vitest run src/lib/kpi/aplicar-alteracoes.test.ts -t "nao espalha" 2>&1 | tail -10`
Expected: FAIL (Alcântara II viraria AMW3424 também)

- [ ] **Step 2H2.3: Investigar matcher de filial com `diagnose`**

Em `src/lib/kpi/aplicar-alteracoes.ts:56-64`:
```typescript
const filialM = alt.loja_raw.match(/\b(\d{1,3})\b/)
```

Bug potencial: `Loja 211` casa com `211`. Mas `Loja 293` ALSO casa com `293`. Não deveria propagar...

Mas pode ser que o regex em outra alteração casou número errado. Adicionar log temporário e re-rodar pra ver match real.

- [ ] **Step 2H2.4: Implementar fix mínimo**

Possíveis fixes (escolher baseado no diagnóstico):

(a) Match por filial deve usar `\d{2,3}` (mínimo 2 dígitos) pra evitar match em "1" genérico
(b) Fallback de tokens deve exigir 2+ tokens (não 1 só), evitando que "ASSAI" sozinho case várias
(c) Adicionar match estrito de nome inteiro normalizado

Aplicar fix em `src/lib/kpi/aplicar-alteracoes.ts:56-83`.

- [ ] **Step 2H2.5: Teste passing**

Run: `npx vitest run src/lib/kpi/aplicar-alteracoes.test.ts 2>&1 | tail -5`
Expected: 11/11 passing (10 antigos + 1 novo)

### Task 3: Verificação real + merge

- [ ] **Step 3.1: Verificação real dia 19**

Run:
```bash
npx tsx scripts/analise/regerar_local.ts 19 ASSAI -v 2>&1 | head -20
```
Expected: linha Alcântara II com FQN6J72 (manual placa), não AMW-3424.

- [ ] **Step 3.2: Verificação não-regressão dia 20**

Run: `npx tsx scripts/analise/regerar_local.ts 20 2>&1 | tail -10`
Expected: TOTAL DIA 20 ≥ baseline anterior.

- [ ] **Step 3.3: Code review subagent**

Invocar Agent `superpowers:code-reviewer` com:
"Review do fix bug-1 (PDF alteração propagada). Diff: `git diff main...fix/pdf-alteracao`. Critérios: cobertura do caso AMW-3424 ASSAI 4 lojas, não-regressão, qualidade do teste."

Esperar LGTM ou aplicar feedback.

- [ ] **Step 3.4: Commit + merge + push**

Run:
```bash
git add -A
git commit -m "fix(parser/aplicar-alteracoes): bug-1 — PDF alteração não propaga (4 ASSAI dia 19)

Fix detalhado em docs/superpowers/specs/2026-05-26-kpi-fix-dia19/bug-1-pdf-alteracao.md.
Hipotese aplicada: <H1 ou H2 conforme investigação>.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git checkout main
git pull
git merge fix/pdf-alteracao --no-ff
git push origin main
git worktree remove ../kpi-bug-1
```

- [ ] **Step 3.5: Atualizar FLUXO-ATIVO.md**

Em `docs/auditoria/dia-19-reanalise/FLUXO-ATIVO.md`, marcar Bug 1 ✅, próximo = Bug 2.

---

## Bug 2 — Placa trocada / parser nome ARTHUR (Padrão 8, 10 lojas)

**Spec:** `docs/superpowers/specs/2026-05-26-kpi-fix-dia19/bug-2-placa-trocada.md`

### Task 4: Worktree + diagnose sub-caso 2B (parser nome)

**Files:**
- Read: `src/lib/parsers/escala-guanabara-pdf.ts`
- Read: `src/lib/utils/placa.ts`

- [ ] **Step 4.1: Worktree fix/placa-parser-nome**

```bash
cd /c/Users/media/dev/kpi-transmonseg
git worktree add ../kpi-bug-2 -b fix/placa-parser-nome
cd ../kpi-bug-2
```

- [ ] **Step 4.2: Reproduzir bug GUANABARA Campo Grande F.10**

Run:
```bash
npx tsx -e "
import { parseEscalaGuanabaraPdf } from './src/lib/parsers/escala-guanabara-pdf'
import { readFileSync } from 'fs'
const buf = readFileSync('C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19/ESCALA 19.05.pdf')
const r = await parseEscalaGuanabaraPdf(buf, '2026-05-19')
const cg = r.find(l => /Campo Grande/i.test(l.loja_nome_raw || ''))
console.log(JSON.stringify(cg, null, 2))
" 2>&1
```
Expected: ver `motorista_nome` e `placa_norm` — confirmar se "ARTHUR" virou "ART" + placa "HUR-1841"

- [ ] **Step 4.3: Adicionar teste failing**

```typescript
it('escala GUANABARA dia 19 — ARTHUR Campo Grande F.10 placa correta', async () => {
  const buf = readFileSync('.../ESCALA 19.05.pdf')
  const linhas = await parseEscalaGuanabaraPdf(buf, '2026-05-19')
  const cg = linhas.find(l => /Campo Grande/i.test(l.loja_nome_raw || '') && l.loja_codigo_raw === '10')
  expect(cg).toBeDefined()
  expect(cg!.motorista_nome).toMatch(/ARTHUR/i)
  expect(cg!.placa_norm).toBe('KNI8942')
})
```

- [ ] **Step 4.4: Rodar e ver falhar**

Run: `npx vitest run -t "ARTHUR Campo Grande" 2>&1 | tail -10`
Expected: FAIL

- [ ] **Step 4.5: Investigar parser PDF GUANABARA + regex placa**

Olhar `src/lib/utils/placa.ts` ou regex equivalente. Provavelmente faz `match(/[A-Z]{3}[-\s]?\d/)` que casa "HUR-1841" (HUR é início, 1841 é número).

Fix: exigir 3+ letras consecutivas seguidas de número (Mercosul 7 chars exatos), e não casar tokens curtos.

- [ ] **Step 4.6: Implementar fix**

Em `src/lib/utils/placa.ts` ou no parser GUANABARA, validar:
- Placa Mercosul: 7 caracteres exatos `^[A-Z]{3}\d[A-Z\d]\d{2}$`
- Após normalização (remover hífen)
- Rejeitar "HUR1841" (1841 são 4 dígitos, formato antigo, mas posição 4 e 5 sugerem Mercosul wannabe)

- [ ] **Step 4.7: Teste passing**

Run: `npx vitest run -t "ARTHUR Campo Grande" 2>&1 | tail -5`
Expected: PASS

### Task 5: Diagnose sub-caso 2A (T18 plate-swap atribui errado)

**Files:**
- Read: `src/lib/kpi/matcher.ts:1306-1456` (T18)

- [ ] **Step 5.1: Reproduzir ZS Loja 33 dia 19 (BBH-1C94 vs LCO-0978)**

Já investigado em auditoria. Manual diz Loja 33 = BBH-1C94 (JOSUE), gerado diz LCO-0978 sem dado.

Skill: invocar `diagnose` pra construir feedback loop.

- [ ] **Step 5.2: Adicionar teste failing**

Caso minimal: escala ZS Loja 33 com placa_norm=LCO0978 (ausente Unitrac), GPS tem BBH1C94 com parada Loja 33.

Esperado: T18 plate-swap deveria pegar BBH1C94. Atualmente não.

```typescript
it('T18 — Loja 33 placa-swap BBH-1C94 substitui LCO-0978 ausente', async () => {
  // ... setup escala + GPS
  const rotas = await cruzaEscalaUnitrac(linhas, paradas, lojas)
  const l33 = rotas.find(r => r.escala_linha_id === 'l33')
  expect(l33?.paradas[0]?.parada_id).toMatch(/BBH/)
})
```

- [ ] **Step 5.3: Rodar e ver falhar, implementar fix**

Investigar T18 guards (T18-D, T18-R, T18-X). Pode ser que o fix T18-X (de `95e2f43`) esteja sendo restritivo demais agora.

- [ ] **Step 5.4: Teste passing + verificação**

Run: full suite + regerar_local 19 ZONA_SUL.

### Task 6: Verificação + merge bug 2

- [ ] **Step 6.1: Verificação real**

Run:
```bash
npx tsx scripts/analise/regerar_local.ts 19 GUANABARA -v 2>&1 | grep -i "campo grande"
npx tsx scripts/analise/regerar_local.ts 19 ZONA_SUL -v 2>&1 | grep "Loja 33\|Loja 21\|Loja 07"
```

- [ ] **Step 6.2: Code review subagent**

Mesmo padrão Bug 1.

- [ ] **Step 6.3: Commit + merge + push**

```bash
git commit -m "fix(parsers/matcher): bug-2 — placa trocada GUANABARA + ZS T18 (10 lojas dia 19)"
git checkout main && git pull && git merge fix/placa-parser-nome --no-ff && git push origin main
git worktree remove ../kpi-bug-2
```

- [ ] **Step 6.4: Atualizar FLUXO-ATIVO.md** — Bug 2 ✅, próximo Bug 3.

---

## Bug 3 — Multi-trip parada errada (Padrão 1, 17 lojas)

**Spec:** `docs/superpowers/specs/2026-05-26-kpi-fix-dia19/bug-3-multi-trip.md`

### Task 7: Worktree + investigação assignment

**Files:**
- Read: `src/lib/kpi/matcher.ts:728-790` (DFS assignment)

- [ ] **Step 7.1: Worktree fix/multi-trip**

```bash
git worktree add ../kpi-bug-3 -b fix/multi-trip
cd ../kpi-bug-3
```

- [ ] **Step 7.2: Reproduzir ZS Loja 47 Catete dia 19 (sys 11:09 vs man 19:40)**

Run:
```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const { data } = await sb.from('escala_linhas').select('id, placa_norm, loja_nome_raw').eq('rede_id','ZONA_SUL').eq('data_entrega','2026-05-19').ilike('loja_nome_raw','%47%')
console.log(data)
" 2>&1
```

Esperado: ver placa de Loja 47 dia 19. Depois rodar GPS dessa placa e ver TODAS as paradas.

- [ ] **Step 7.3: Adicionar teste failing — multi-trip cronologia**

```typescript
it('multi-trip: 2 paradas LOJA mesma rede preferem cronologia', async () => {
  // placa P fez Loja A 11:00 (manhã) E Loja B 19:00 (noite)
  // escala tem A com turno=MANHA e B com turno=TARDE
  // matcher deve atribuir A→11:00 e B→19:00, não cruzado
  ...
})
```

- [ ] **Step 7.4: Rodar e ver falhar**

- [ ] **Step 7.5: Investigar assignment matricial (`dfsAssign` linha 749+)**

Aplicar `diagnose` rigorosa. Hipótese: o `scoreComRede` retorna mesmo valor pra ambas paradas (geofence bate em ambas). Algoritmo escolhe combinação errada pq total iguais.

- [ ] **Step 7.6: Implementar fix — adicionar tiebreak por proximidade temporal**

Em `scoreComRede` ou no `dfsAssign`, quando empate de score, preferir parada cronologicamente próxima da ordem da linha na escala.

Estratégia: se escala tem N linhas pra mesma rede em ordem cronológica (carro_ordem ou turno), assignment respeita essa ordem.

- [ ] **Step 7.7: Teste passing + não-regressão**

Run: `npx vitest run --reporter=dot 2>&1 | tail -5`
Expected: 282+ passing.

### Task 8: Verificação + merge bug 3

- [ ] **Step 8.1: Verificação real — 17 lojas afetadas**

Run:
```bash
npx tsx scripts/analise/regerar_local.ts 19 -v 2>&1 | grep -E "Loja (22|25|47).*sys" | head -5
```
Expected: nenhuma das 17 lojas com Δ>30min.

- [ ] **Step 8.2: Não-regressão dias 20/21**

Run: `npx tsx scripts/analise/regerar_local.ts 20 2>&1 | tail -3; npx tsx scripts/analise/regerar_local.ts 21 2>&1 | tail -3`

- [ ] **Step 8.3: Code review + commit + merge**

```bash
git commit -m "fix(matcher): bug-3 — multi-trip respeita cronologia (17 lojas dia 19)"
git checkout main && git pull && git merge fix/multi-trip --no-ff && git push origin main
git worktree remove ../kpi-bug-3
```

- [ ] **Step 8.4: Atualizar FLUXO-ATIVO.md.**

---

## Bug 4 — Lojas faltando no gerado (Padrão 6, 13 lojas)

**Spec:** `docs/superpowers/specs/2026-05-26-kpi-fix-dia19/bug-4-lojas-faltando.md`

### Task 9: Triagem por sub-causa

Sub-causas 4A (placa ausente), 4B (multi-row), 4C (T18 não dispara).

- [ ] **Step 9.1: Worktree fix/lojas-faltando**

```bash
git worktree add ../kpi-bug-4 -b fix/lojas-faltando
cd ../kpi-bug-4
```

- [ ] **Step 9.2: Pra cada uma das 13 lojas, identificar sub-causa**

Tabela em `docs/auditoria/dia-19-reanalise/bug-4-tabela-subcausa.md`:

```markdown
| Loja | Placa | Manual | Sub-causa observada |
|------|-------|--------|---------------------|
| ZS 07 2ª | KQR-2J11 | 15:00/16:10 | 4B (placa também faz Loja 11 1ª) |
| ASSAI Ceasa | EZU-9325 | 05:55/07:30 | 4A (verificar GPS) |
| ... | ... | ... | ... |
```

Pra cada loja, rodar `_tmp_*` script que dump GPS da placa e confirma sub-causa.

- [ ] **Step 9.3: Adicionar teste failing por sub-causa principal**

Foco: 4B (multi-row). Caso minimal: 1 placa, 2 paradas LOJA, 2 linhas escala mesma loja → 2 rotas emitidas.

- [ ] **Step 9.4: Implementar fix multi-row**

Em `matcher.ts`, garantir que `escalaByPlaca` itera por linha, não por placa-única, e que `dfsAssign` distribui paradas a TODAS as linhas (não consolida).

- [ ] **Step 9.5: Teste passing**

### Task 10: Verificação + merge bug 4

- [ ] **Step 10.1: Verificação**

13 lojas emergem com tempo ou SEM (não vazio). Pelo menos 10/13 com Δ≤10min.

- [ ] **Step 10.2: Code review + merge + push**

```bash
git commit -m "fix(matcher): bug-4 — lojas multi-row emergem (13 lojas dia 19)"
git checkout main && git pull && git merge fix/lojas-faltando --no-ff && git push origin main
git worktree remove ../kpi-bug-4
```

---

## Bug 5 — Carro 2º faltando (Padrão 4, 5 lojas)

**Spec:** `docs/superpowers/specs/2026-05-26-kpi-fix-dia19/bug-5-carro-2.md`

### Task 11: Investigação gerar-kpi-xlsx

**Files:**
- Read: arquivo que gera xlsx (procurar `gerar.*kpi|xlsx.*kpi` na pasta `src/`)

- [ ] **Step 11.1: Worktree + identificar arquivo**

```bash
git worktree add ../kpi-bug-5 -b fix/carro-2
cd ../kpi-bug-5
grep -rn "2º CARRO\|2º carro\|carro_ordem.*2" src/ | head -10
```

- [ ] **Step 11.2: Reproduzir CARREFOUR Campo Grande 1º + 2º carro dia 19**

Manual: 1º=SIMÃO/LSN-6I72, 2º=RENAN/KRW-8E86.
Gerado: 1º=SIMÃO, 2º=SIMÃO duplicado.

Olhar como o output xlsx é construído. Bug provavelmente em loop que itera linhas escala mas perde `carro_ordem`.

- [ ] **Step 11.3: Adicionar teste failing**

```typescript
it('gerar_kpi xlsx — 2 carros mesma loja preservam motoristas distintos', () => {
  // ... mock escala com carro_ordem=1 e carro_ordem=2 mesma loja
  // verificar output xlsx tem ambas colunas (1º carro + 2º carro) preenchidas
})
```

- [ ] **Step 11.4: Rodar e ver falhar, implementar fix**

- [ ] **Step 11.5: Teste passing**

### Task 12: Verificação + merge

- [ ] **Step 12.1: 5 lojas com 2º carro preenchido**

Run: `npx tsx scripts/analise/regerar_local.ts 19 -v 2>&1 | grep -E "Vila Isabel|Tijuca|Campo Grande|MEGA BOX 2"`

- [ ] **Step 12.2: Commit + merge + push**

```bash
git commit -m "fix(gerar-kpi-xlsx): bug-5 — 2º carro preservado (5 lojas dia 19)"
git checkout main && git pull && git merge fix/carro-2 --no-ff && git push origin main
git worktree remove ../kpi-bug-5
```

---

## Bug 6 — SL muito curta (Padrão 2, 10 lojas)

**Spec:** `docs/superpowers/specs/2026-05-26-kpi-fix-dia19/bug-6-sl-curta.md`

### Task 13: Estender estendeSaidaPorForaBase

**Files:**
- Modify: `src/lib/kpi/matcher.ts:340` (`estendeSaidaPorForaBase`)

- [ ] **Step 13.1: Worktree fix/sl-curta**

```bash
git worktree add ../kpi-bug-6 -b fix/sl-curta
cd ../kpi-bug-6
```

- [ ] **Step 13.2: Coletar dados crus dos 10 casos com skill `xlsx` ou `pdf`**

Pra cada caso (Loja 43 ZS, Manilha ATACADAO, Bento Ribeiro GUANABARA etc.), rodar:

```bash
npx tsx -e "<script que dumpa GPS da placa do dia 19 da loja X>"
```

Anotar:
- LOJA dur=?
- FORA_BASE seguinte? dur=? dist=?
- LOJA seguinte? mesma loja?

- [ ] **Step 13.3: Identificar pattern comum**

Tabela em `docs/auditoria/dia-19-reanalise/bug-6-dados.md`:
```markdown
| Loja | LOJA dur | Próx classif | Próx dur | dist | Gap |
|------|----------|--------------|----------|------|-----|
| ZS 43 | 11min | FORA_BASE | ?min | ?m | ? |
...
```

- [ ] **Step 13.4: Ajustar critérios `estendeSaidaPorForaBase`**

Baseado nos dados, decidir:
- Aumentar `matchedDurSeg` de 15min pra 30min? Não — quebra Fonseca (4min)
- Aumentar dist de 300m pra 500m? Talvez
- Seguir cadeia (FORA_BASE seguido de FORA_BASE)? Talvez

- [ ] **Step 13.5: Adicionar testes failing + passing**

Pra CADA caso real, adicionar teste em `src/lib/kpi/matcher.test.ts` que reproduz o GPS e verifica SL.

- [ ] **Step 13.6: Implementação**

- [ ] **Step 13.7: Não-regressão**

PREZUNIC Fonseca dia 20 continua com SL=09:28.

### Task 14: Verificação + merge bug 6

- [ ] **Step 14.1: Verificação** — 6/10 lojas com Δ SL ≤15min.

- [ ] **Step 14.2: Commit + merge + push**

---

## Bug 7 — Falso positivo (Padrão 5, 8 lojas)

**Spec:** `docs/superpowers/specs/2026-05-26-kpi-fix-dia19/bug-7-falso-positivo.md`

### Task 15: Classificar 7A/7B/7C cada um dos 8 casos

- [ ] **Step 15.1: Worktree fix/falso-positivo**

- [ ] **Step 15.2: Pra cada caso, rodar diagnóstico**

Tabela classificando em `docs/auditoria/dia-19-reanalise/bug-7-classificacao.md`.

- [ ] **Step 15.3: 7A (sys certo, manual errado) — documentar**

Criar `docs/auditoria/manual-discrepancias-dia19.md` com lista dos casos 7A pra Tia Érica revisar.

- [ ] **Step 15.4: 7B (sys errado) — fix matcher**

Se houver casos 7B confirmados, adicionar teste failing e fix.

- [ ] **Step 15.5: Code review + commit + merge + push**

---

## Validação final

### Task 16: Re-rodar dia 19 completo

- [ ] **Step 16.1: regerar_local dia 19**

Run: `npx tsx scripts/analise/regerar_local.ts 19 2>&1 > /tmp/depois-dia19.txt; cat /tmp/depois-dia19.txt | tail -15`
Expected: TOTAL DIA 19 ≥ 218/242 (≥90%)

- [ ] **Step 16.2: Comparação antes/depois**

```bash
diff docs/auditoria/dia-19-reanalise/baseline.txt /tmp/depois-dia19.txt
```

- [ ] **Step 16.3: Não-regressão dias 20 e 21**

Run:
```bash
npx tsx scripts/analise/regerar_local.ts 20 2>&1 | tail -5
npx tsx scripts/analise/regerar_local.ts 21 2>&1 | tail -5
```
Expected: dia 20 ≥ baseline (47), dia 21 ≥ baseline (29).

### Task 17: Atualizar STATE.md + FLUXO-ATIVO

- [ ] **Step 17.1: STATE.md** — registrar sessão com tabela antes/depois.

- [ ] **Step 17.2: FLUXO-ATIVO.md** — marcar todas etapas ✅, status final.

- [ ] **Step 17.3: Commit doc final**

```bash
git add docs/STATE.md docs/auditoria/dia-19-reanalise/FLUXO-ATIVO.md
git commit -m "docs(STATE): registrar sessão completa kpi-fix-dia19 (78.5% → ?%)"
git push origin main
```

### Task 18: Code review macro

- [ ] **Step 18.1: Agent code-reviewer macro**

Invocar Agent com diff completo `git log --since="2026-05-26 19:00" --oneline` e pedir review macro.

- [ ] **Step 18.2: Aplicar feedback** se houver.

### Task 19: User testa no Vercel

- [ ] **Step 19.1: User regera KPIs no Vercel** e baixa.

- [ ] **Step 19.2: User compara contra manuais.**

- [ ] **Step 19.3: Aprovação ou nova rodada.**

---

## Self-Review

Verificações antes de handoff:

**Spec coverage:**
- ✅ Bug 1 → Task 1-3
- ✅ Bug 2 → Task 4-6
- ✅ Bug 3 → Task 7-8
- ✅ Bug 4 → Task 9-10
- ✅ Bug 5 → Task 11-12
- ✅ Bug 6 → Task 13-14
- ✅ Bug 7 → Task 15
- ✅ Validação → Task 16-19

**Placeholders:** alguns "..." em testes vitest que precisam de stub completo na hora — aceitável pois é exemplo de fixture e tem estrutura clara.

**Type consistency:** AltConfirmada/LinhaEscala usados consistentemente.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-26-kpi-fix-dia19-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch fresh subagent per task (1-19), review entre tasks, fast iteration. Bom pra plano longo como esse.

**2. Inline Execution** — Executar nesta sessão usando `executing-plans`, com checkpoints. Mais simples mas usa muito contexto.

Qual abordagem?
