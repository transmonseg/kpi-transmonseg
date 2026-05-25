# KPI Zona Sul — Redução de 24 DIFFs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir de 24 para ~2 os DIFFs entre KPI gerado automaticamente e o manual de Tia Érica para Zona Sul 20/05/2026.

**Architecture:** Três mudanças cirúrgicas em `src/lib/kpi/matcher.ts`. Primeiro corrigi os testes obsoletos deixados por patches anteriores (bugs 1–4 do plano adaptive-strolling-perlis.md já foram aplicados ao código mas não aos testes). Depois aplica dois fixes novos: (1) T18-N guard de 03h para 07h — elimina 11 falsos positivos de madrugada; (2) `deduplicarPorCodigo` multi-trip — preserva dois trips separados por >2h do mesmo veículo ao mesmo loja, corrigindo 5 casos de veículos de dois turnos.

**Tech Stack:** TypeScript, Vitest, ExcelJS. Sem DB, sem rede — tudo local.

---

## Contexto imprescindível

- **BRT armazenado como UTC**: `new Date(p.chegada).getUTCHours()` retorna hora BRT diretamente. `NOITE_H = 3` significa "antes das 03:00 BRT".
- **T18** (Plate-swap fallback, linha ~969): para escala sem match próprio, busca parada LOJA em qualquer placa que corresponda ao nome/código/GPS da loja esperada.
- **T18-N guard** (linha ~1020): filtra paradas de T18 cujo `chegada < 03:00 BRT` — detecta estacionamentos noturnos. Mas falsos positivos têm chegada entre 04:00–07:00 BRT, que passa o guard atual.
- **deduplicarPorCodigo** (linha ~320): para cada placa, garante ≤1 parada por `codigo_loja`. Veículos de dois turnos têm 2 trips para a mesma loja → a segunda trip é descartada → segunda linha escala fica sem match.
- **6 testes obsoletos**: patches anteriores mudaram o código sem atualizar os testes. Todos 6 têm assertions que testam o comportamento antigo (pré-fix). Precisam ser corrigidos **antes** de qualquer nova feature.

## Distribuição dos 24 DIFFs

| Categoria | Qtd | Fix |
|-----------|-----|-----|
| T18 falsos positivos (parada madrugada de outro veículo) | 11 | Task 2 |
| Dois turnos (sistema pega trip errada) | 5 | Task 3 |
| GPS não achou loja (loja sem coordenadas cadastradas) | 6 | fora de escopo (dados) |
| SC leve diferença | 2 | provavelmente resolve junto |

---

## Mapa de Arquivos

| Arquivo | Mudança |
|---------|---------|
| `src/lib/kpi/matcher.ts:320-356` | `deduplicarPorCodigo` — suporte a multi-trip |
| `src/lib/kpi/matcher.ts:1020` | T18-N guard: `< 3` → `< 7` |
| `src/lib/kpi/matcher.test.ts:290-310` | Corrigir teste Bug B obsoleto (saida_cd null) |
| `src/lib/kpi/matcher.test.ts:454-460` | Corrigir teste I↔8 obsoleto (3 variantes) |
| `src/lib/kpi/matcher.test.ts:1272-1399` | Corrigir 3 testes T9 ARMAZEM_GRAO obsoletos |
| `src/lib/kpi/matcher.test.ts:1522-1538` | Corrigir teste T16 obsoleto (saida_cd null) |

---

## Task 1: Corrigir 6 testes obsoletos (pre-condição para tudo)

> Os patches bugs 1–4 modificaram o comportamento do matcher mas não atualizaram os testes.
> `npx vitest run src/lib/kpi/matcher.test.ts` mostra 6 FAILs antes de qualquer mudança nova.
> Estes testes precisam ser corrigidos para que a suite passe "verde" como baseline.

**Files:**
- Modify: `src/lib/kpi/matcher.test.ts`

- [ ] **Step 1: Confirmar que há exatamente 6 FAILs (baseline)**

```bash
cd C:\Users\media\dev\kpi-transmonseg
npx vitest run src/lib/kpi/matcher.test.ts 2>&1 | grep -E "Tests|FAIL"
```

Expected output:
```
Tests  6 failed | 94 passed (100)
```

- [ ] **Step 2: Corrigir teste Bug B — saida_cd sem BASE agora retorna null**

Localizar em `src/lib/kpi/matcher.test.ts` o teste:
```
it('rota com GPS mas SEM parada BASE -> saida_cd = chegada da 1a loja'
```
(está por volta da linha 290)

Substituir o bloco inteiro por:

```typescript
  it('rota com GPS mas SEM parada BASE -> saida_cd = null', async () => {
    // Bug 2 fix: sem BASE, saida_cd retorna null em vez de fallback para chegada do alvo.
    // Blank no Excel é preferível a timestamp impossível (saida_cd = CHD = 0 min viagem).
    const paradas: UnitracParadaRow[] = [
      {
        id: 'pa',
        placa_norm: 'XYZ9876',
        chegada: '2026-05-20T08:30:00.000Z',
        saida: '2026-05-20T10:00:00.000Z',
        duracao_seg: 5400,
        local_parada: '7777 - CLIENTE FOO',
        codigo_loja: '7777',
        nome_loja: 'CLIENTE FOO',
        lat: null,
        lng: null,
        classificacao: 'LOJA',
        ordem: 1,
      },
    ]
    const rotas = await cruzaEscalaUnitrac([linha], paradas, lojas)
    expect(rotas).toHaveLength(1)
    // Sem parada BASE antes da LOJA → saida_cd = null (não usa chegada como fallback)
    expect(rotas[0].saida_cd).toBeNull()
  })
```

- [ ] **Step 3: Corrigir teste I↔8 — 'I' agora gera 3 variantes (8 e 1)**

Localizar em `src/lib/kpi/matcher.test.ts` o teste:
```
it('I↔8: placa com "I" na pos 4 gera variante com "8"'
```
(está por volta da linha 454)

Substituir por:

```typescript
  it('I↔8 e I↔1: placa com "I" na pos 4 gera variantes com "8" e "1"', () => {
    // "LMN2I45": pos 4 = 'I' → OCR confunde com '8' e com '1'
    // OCR_PARES: 'I': ['8', '1']
    const v = variantesOcr('LMN2I45')
    expect(v).toContain('LMN2I45')
    expect(v).toContain('LMN2845')
    expect(v).toContain('LMN2145')
    expect(v).toHaveLength(3)
  })
```

- [ ] **Step 4: Corrigir teste T9 "cross-docking ARMAZEM_GRAO" — ARMAZEM_GRAO removido de REDES_CROSSDOCK**

Localizar em `src/lib/kpi/matcher.test.ts` o teste:
```
it('T9 — cross-docking ARMAZEM_GRAO pega carona em paradas Princesa'
```
(por volta da linha 1272)

O comportamento correto agora: ARMAZEM_GRAO foi removido de `REDES_CROSSDOCK` (ver comentário no código, linhas 924–927: "entrega à tarde em rota própria, não é cross-dock real"). As linhas ag1/ag2/ag3 ficam UNMATCHED.

Substituir as assertions finais (manter o setup de dados igual):

```typescript
    // Princesas continuam casando (Hungarian + cadastro)
    expect(rotas.find(r => r.escala_linha_id === 'pr1')?.paradas[0]?.parada_id).toBe('pp1')
    expect(rotas.find(r => r.escala_linha_id === 'pr2')?.paradas[0]?.parada_id).toBe('pp2')
    expect(rotas.find(r => r.escala_linha_id === 'pr3')?.paradas[0]?.parada_id).toBe('pp3')
    // ARMAZEM_GRAO removido de REDES_CROSSDOCK (entrega própria em Petrópolis/Itaipava,
    // não pega carona). T9 não atua → ficam UNMATCHED (sem parada atribuída).
    expect(rotas.find(r => r.escala_linha_id === 'ag1')?.paradas).toHaveLength(0)
    expect(rotas.find(r => r.escala_linha_id === 'ag2')?.paradas).toHaveLength(0)
    expect(rotas.find(r => r.escala_linha_id === 'ag3')?.paradas).toHaveLength(0)
```

- [ ] **Step 5: Corrigir teste T9 "clamp: 4 ARMAZEMs" — mesmo motivo**

Localizar:
```
it('T9 — clamp: 4 ARMAZEMs órfãos vs 2 paradas Princesa reusam a última'
```
(por volta da linha 1351)

Substituir as assertions (manter setup de dados):

```typescript
    // Princesas casam
    expect(rotas.find(r => r.escala_linha_id === 'pr1')?.paradas[0]?.parada_id).toBe('pp1')
    expect(rotas.find(r => r.escala_linha_id === 'pr2')?.paradas[0]?.parada_id).toBe('pp2')
    // ARMAZEM_GRAO não está em REDES_CROSSDOCK → todos ficam UNMATCHED
    expect(rotas.find(r => r.escala_linha_id === 'ag1')?.paradas).toHaveLength(0)
    expect(rotas.find(r => r.escala_linha_id === 'ag2')?.paradas).toHaveLength(0)
    expect(rotas.find(r => r.escala_linha_id === 'ag3')?.paradas).toHaveLength(0)
    expect(rotas.find(r => r.escala_linha_id === 'ag4')?.paradas).toHaveLength(0)
```

- [ ] **Step 6: Corrigir teste T9 "match crossdock recebe confidence=LOW" — ARMAZEM_GRAO fica UNMATCHED**

Localizar:
```
it('T9 — match crossdock recebe confidence=LOW + requiresReview'
```
(por volta da linha 1380)

Substituir as assertions finais:

```typescript
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    // PRINCESA continua HIGH via Hungarian
    const pr = rotas.find(r => r.escala_linha_id === 'pr')
    expect(pr?._matchMeta?.confidence).toBe('HIGH')
    // ARMAZEM_GRAO não está em REDES_CROSSDOCK → UNMATCHED (algorithm='none')
    const ag = rotas.find(r => r.escala_linha_id === 'ag')
    expect(ag?.paradas).toHaveLength(0)
    expect(ag?._matchMeta?.algorithm).toBe('none')
```

- [ ] **Step 7: Corrigir teste T16 "BASE com saida=null é IGNORADA" — fallback removido**

Localizar:
```
it('T16 — BASE com saida=null é IGNORADA (cai no fallback)'
```
(por volta da linha 1522)

O comentário dentro do teste diz "fallback = chegada da parada-alvo". Esse fallback foi removido pelo Bug 2 fix. Substituir:

```typescript
  it('T16 — BASE com saida=null é IGNORADA → saida_cd fica null', async () => {
    // Predicado exige `p.saida` truthy. BASE com saída null é parada em aberto
    // (caminhão ainda parado), não conta como anchor.
    // Bug 2 fix: sem BASE válida, saida_cd = null (não usa chegada como fallback).
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'l1', rede_id: 'PRINCESA', placa_norm: 'NNN', loja_nome_raw: 'L1', loja_codigo_raw: '1', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-20' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'b', placa_norm: 'NNN', chegada: '2026-05-20T03:00:00Z', saida: null, duracao_seg: null, local_parada: 'BASE BENASSI - BASE BENASSI', codigo_loja: null, nome_loja: null, lat: null, lng: null, classificacao: 'BASE', ordem: 1 },
      { id: 'pp', placa_norm: 'NNN', chegada: '2026-05-20T05:00:00Z', saida: '2026-05-20T06:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA L1', codigo_loja: '8590001', nome_loja: 'PRINCESA L1', lat: null, lng: null, classificacao: 'LOJA', ordem: 2 },
    ]
    const lojas: LojaRow[] = [
      { id: 'l1c', rede_id: 'PRINCESA', nome: 'L1', nome_normalizado: 'l1', codigo_escala: '1', codigo_unitrac: '8590001', nome_unitrac: 'PRINCESA L1', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    // BASE sem saída → ignorada. Sem outra âncora → saida_cd = null
    expect(rotas.find(r => r.escala_linha_id === 'l1')?.saida_cd).toBeNull()
  })
```

- [ ] **Step 8: Verificar que os testes passam**

```bash
npx vitest run src/lib/kpi/matcher.test.ts 2>&1 | grep -E "Tests|FAIL"
```

Expected:
```
Tests  100 passed (100)
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/kpi/matcher.test.ts
git commit -m "test(matcher): atualiza 6 testes obsoletos pós-patches bugs 1-4

- Bug B: saida_cd sem BASE → null (não mais chegada-do-alvo como fallback)
- T16: mesmo — BASE com saida=null ignorada → saida_cd null
- I↔8: OCR_PARES I agora mapeia para ['8','1'] → 3 variantes, não 2
- T9 x3: ARMAZEM_GRAO removido de REDES_CROSSDOCK → linhas ficam UNMATCHED"
```

---

## Task 2: T18-N guard — bloquear paradas antes das 07:00 BRT no fallback T18

> **Impacto esperado: ~11 DIFFs → 0**
>
> T18 (plate-swap) usa qualquer placa para tentar achar a loja. Veículos de outras redes
> (ex: LQE-5401 rota manhã PREZUNIC) estavam parando perto de lojas Zona Sul às 04–06h BRT.
> O guard atual (`< 3`) deixa passar. Zona Sul não começa entregas antes das 07:00.

**Files:**
- Modify: `src/lib/kpi/matcher.ts:1019-1020`
- Modify: `src/lib/kpi/matcher.test.ts` (novo describe)

- [ ] **Step 1: Escrever teste FAILING para o novo comportamento**

Adicionar no final de `src/lib/kpi/matcher.test.ts`, antes do último `}` do arquivo:

```typescript
// --- T18-N: guard noturno no fallback T18 ---
//
// T18 (plate-swap) não deve usar paradas de madrugada (04–06h BRT) de outros veículos.
// Zona Sul não tem entregas antes das 07:00. Guard atual < 3 deixava passar 04-06h.
describe('T18 — T18-N guard 07:00 BRT', () => {
  it('T18 REJEITA parada de outra placa chegando às 05:00 BRT (abaixo do guard)', async () => {
    // Escala: placa ABC não tem GPS. Outra placa XYZ tem parada LOJA às 05:00 BRT.
    // T18-N guard < 7 deve rejeitar 05:00 → linha ABC fica UNMATCHED.
    const linhas: EscalaLinhaRow[] = [
      { id: 'l1', rede_id: 'ZONA_SUL', placa_norm: 'ABC1234', loja_nome_raw: 'ZONA SUL LOJA 30', loja_codigo_raw: '30', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-20' },
    ]
    const paradas: UnitracParadaRow[] = [
      // placa ABC sem parada nenhuma
      // placa XYZ com parada ZONA SUL LOJA 30 às 05:00 BRT (5h UTC = 5h BRT aqui, pois xlsx usa UTC=BRT)
      { id: 'px', placa_norm: 'XYZ9999', chegada: '2026-05-20T05:00:00.000Z', saida: '2026-05-20T06:30:00.000Z', duracao_seg: 5400, local_parada: '9039030 - ZONA SUL LOJA 30', codigo_loja: '9039030', nome_loja: 'ZONA SUL LOJA 30', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    const rotas = await cruzaEscalaUnitrac(linhas, paradas, [])
    // T18-N guard < 7 rejeita 05:00 → l1 fica sem parada
    expect(rotas.find(r => r.escala_linha_id === 'l1')?.paradas).toHaveLength(0)
  })

  it('T18 ACEITA parada de outra placa chegando às 07:00 BRT (acima do guard)', async () => {
    // Mesma configuração mas parada às 07:00 BRT — deve ser aceita.
    const linhas: EscalaLinhaRow[] = [
      { id: 'l2', rede_id: 'ZONA_SUL', placa_norm: 'ABC1234', loja_nome_raw: 'ZONA SUL LOJA 30', loja_codigo_raw: '30', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-20' },
    ]
    const paradas: UnitracParadaRow[] = [
      { id: 'py', placa_norm: 'XYZ9999', chegada: '2026-05-20T07:00:00.000Z', saida: '2026-05-20T08:30:00.000Z', duracao_seg: 5400, local_parada: '9039030 - ZONA SUL LOJA 30', codigo_loja: '9039030', nome_loja: 'ZONA SUL LOJA 30', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    const rotas = await cruzaEscalaUnitrac(linhas, paradas, [])
    // 07:00 >= 7 → passa o guard → l2 recebe parada via T18
    expect(rotas.find(r => r.escala_linha_id === 'l2')?.paradas).toHaveLength(1)
    expect(rotas.find(r => r.escala_linha_id === 'l2')?.paradas[0].parada_id).toBe('py')
  })
})
```

- [ ] **Step 2: Confirmar que o novo teste falha (T18 aceita 05:00 quando não deveria)**

```bash
npx vitest run src/lib/kpi/matcher.test.ts -t "T18-N guard" 2>&1 | grep -E "FAIL|PASS|Tests"
```

Expected: `1 failed | 1 passed` (o primeiro falha, o segundo passa)

- [ ] **Step 3: Aplicar o fix — mudar T18-N guard de `< 3` para `< 7`**

Em `src/lib/kpi/matcher.ts`, por volta da linha 1019–1020, localizar:

```typescript
          // T18-N: rejeita paradas antes das 03:00 BRT — estacionamento noturno, não entrega.
          if (new Date(p.chegada).getUTCHours() < 3) return false
```

Substituir por:

```typescript
          // T18-N: rejeita paradas antes das 07:00 BRT no plate-swap — veículos de outras
          // redes estacionados perto de lojas Zona Sul na madrugada não são entregas ZS.
          // (Match direto por placa não passa por aqui; este guard só afeta T18.)
          if (new Date(p.chegada).getUTCHours() < 7) return false
```

- [ ] **Step 4: Confirmar que ambos os testes passam agora**

```bash
npx vitest run src/lib/kpi/matcher.test.ts 2>&1 | grep -E "Tests|FAIL"
```

Expected:
```
Tests  102 passed (102)
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi/matcher.ts src/lib/kpi/matcher.test.ts
git commit -m "fix(matcher): eleva T18-N guard de 03:00 para 07:00 BRT

Falsos positivos: veículos de outras redes (LQE-5401, LQU-5546 rota manhã)
estavam sendo atribuídos a lojas Zona Sul via T18 porque a parada LOJA estava
entre 04:00 e 06:59 BRT, passando o guard antigo (< 3h). Zona Sul não tem
entregas antes das 07:00 — elevar para < 7 elimina ~11 DIFFs."
```

---

## Task 3: deduplicarPorCodigo — preservar dois trips do mesmo veículo na mesma loja

> **Impacto esperado: ~5 DIFFs → 0**
>
> `deduplicarPorCodigo` mantém apenas 1 parada por `codigo_loja`. Veículos como LQU-5546,
> LQE-5401, EFU-5704 fazem rota manhã + rota tarde: visitam a mesma loja código "30" às 08h
> e novamente às 14h. Após dedup, só uma parada sobrevive. A segunda linha da escala
> (`carro_ordem=2`) fica sem match.
>
> Fix: se duas paradas para o mesmo `codigo_loja` estão separadas por >2h, tratá-las como
> trips independentes e preservar ambas. Para duas paradas ≤2h de distância (check-in curto +
> entrega real), continua deduplicando (mantém maior duração como hoje).

**Files:**
- Modify: `src/lib/kpi/matcher.ts:320-356`
- Modify: `src/lib/kpi/matcher.test.ts` (novo describe)

- [ ] **Step 1: Escrever testes FAILING para o novo comportamento**

Adicionar no final de `src/lib/kpi/matcher.test.ts`, dentro do arquivo (antes do EOF):

```typescript
// --- deduplicarPorCodigo multi-trip ---
//
// Veículos que fazem dois turnos (manhã + tarde) visitam a mesma loja duas vezes
// em um mesmo dia. O dedup original descartava uma das paradas, deixando a segunda
// escala linha sem match. Fix: se gap entre paradas > 2h, preservar ambas.
describe('cruzaEscalaUnitrac — deduplicarPorCodigo preserva dois trips', () => {
  it('dois trips para a mesma loja (gap 6h) → ambas escala linhas casam', async () => {
    // Veículo LQU com loja 30. Trip manhã às 08:00 → carro_ordem=1. Trip tarde às 14:00 → carro_ordem=2.
    const linhas: EscalaLinhaRow[] = [
      { id: 'c1', rede_id: 'ZONA_SUL', placa_norm: 'LQU1234', loja_nome_raw: 'ZONA SUL LOJA 30', loja_codigo_raw: '30', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-20' },
      { id: 'c2', rede_id: 'ZONA_SUL', placa_norm: 'LQU1234', loja_nome_raw: 'ZONA SUL LOJA 30', loja_codigo_raw: '30', motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-20' },
    ]
    const paradas: UnitracParadaRow[] = [
      { id: 'trip1', placa_norm: 'LQU1234', chegada: '2026-05-20T08:00:00.000Z', saida: '2026-05-20T09:30:00.000Z', duracao_seg: 5400, local_parada: '9039030 - ZONA SUL LOJA 30', codigo_loja: '9039030', nome_loja: 'ZONA SUL LOJA 30', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
      { id: 'trip2', placa_norm: 'LQU1234', chegada: '2026-05-20T14:00:00.000Z', saida: '2026-05-20T15:30:00.000Z', duracao_seg: 5400, local_parada: '9039030 - ZONA SUL LOJA 30', codigo_loja: '9039030', nome_loja: 'ZONA SUL LOJA 30', lat: null, lng: null, classificacao: 'LOJA', ordem: 2 },
    ]
    const rotas = await cruzaEscalaUnitrac(linhas, paradas, [])
    // Ambas as linhas devem ter paradas (não apenas a primeira)
    expect(rotas.find(r => r.escala_linha_id === 'c1')?.paradas).toHaveLength(1)
    expect(rotas.find(r => r.escala_linha_id === 'c2')?.paradas).toHaveLength(1)
    // carro_ordem=1 → trip de manhã (08h); carro_ordem=2 → trip da tarde (14h)
    expect(rotas.find(r => r.escala_linha_id === 'c1')?.paradas[0].parada_id).toBe('trip1')
    expect(rotas.find(r => r.escala_linha_id === 'c2')?.paradas[0].parada_id).toBe('trip2')
  })

  it('check-in curto + entrega real (gap 15min) → dedup preserva apenas a maior duração', async () => {
    // Check-in de 7min às 09:00, entrega real de 90min às 09:15. Gap < 2h → dedup mantém só a maior.
    const linhas: EscalaLinhaRow[] = [
      { id: 'd1', rede_id: 'ZONA_SUL', placa_norm: 'XYZ4321', loja_nome_raw: 'ZONA SUL LOJA 21', loja_codigo_raw: '21', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-20' },
    ]
    const paradas: UnitracParadaRow[] = [
      { id: 'checkin', placa_norm: 'XYZ4321', chegada: '2026-05-20T09:00:00.000Z', saida: '2026-05-20T09:07:00.000Z', duracao_seg: 420, local_parada: '9039021 - ZONA SUL LOJA 21', codigo_loja: '9039021', nome_loja: 'ZONA SUL LOJA 21', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
      { id: 'entrega', placa_norm: 'XYZ4321', chegada: '2026-05-20T09:15:00.000Z', saida: '2026-05-20T10:45:00.000Z', duracao_seg: 5400, local_parada: '9039021 - ZONA SUL LOJA 21', codigo_loja: '9039021', nome_loja: 'ZONA SUL LOJA 21', lat: null, lng: null, classificacao: 'LOJA', ordem: 2 },
    ]
    const rotas = await cruzaEscalaUnitrac(linhas, paradas, [])
    // Apenas 1 linha → só 1 parada. O dedup mantém a de maior duração (entrega, 90min).
    expect(rotas.find(r => r.escala_linha_id === 'd1')?.paradas).toHaveLength(1)
    expect(rotas.find(r => r.escala_linha_id === 'd1')?.paradas[0].parada_id).toBe('entrega')
  })
})
```

- [ ] **Step 2: Confirmar que o primeiro teste falha (c2 fica sem match hoje)**

```bash
npx vitest run src/lib/kpi/matcher.test.ts -t "deduplicarPorCodigo" 2>&1 | grep -E "FAIL|PASS|Tests"
```

Expected: `1 failed | 1 passed`

- [ ] **Step 3: Implementar o fix em `deduplicarPorCodigo`**

Em `src/lib/kpi/matcher.ts`, localizar a função `deduplicarPorCodigo` (por volta da linha 320).

Substituir o **corpo inteiro** da função pelo seguinte (mantendo a assinatura):

```typescript
function deduplicarPorCodigo(paradas: UnitracParadaRow[]): UnitracParadaRow[] {
  // ExcelJS parseia serials do xlsx como UTC → BRT fica armazenado no campo UTC.
  // getUTCHours() devolve a hora BRT diretamente (sem ajuste de fuso).
  const NOITE_H = 3  // 03:00 BRT
  const NOITE_DUR_SEG = 2 * 3600 // 2 horas — cobre paradas de 93-94min às 01-02h BRT
  // Gap > 2h entre paradas do mesmo codigo_loja = trips independentes → preservar ambas.
  // Gap ≤ 2h = check-in curto antes da entrega real → manter só a maior duração.
  const MULTI_TRIP_GAP_MS = 2 * 3600 * 1000

  function isEstacionamentoNoturno(p: UnitracParadaRow): boolean {
    const h = new Date(p.chegada).getUTCHours()
    const dur = p.saida === null ? Infinity : (p.duracao_seg ?? 0)
    return h < NOITE_H && dur > NOITE_DUR_SEG
  }

  function melhor(a: UnitracParadaRow, b: UnitracParadaRow): UnitracParadaRow {
    const aN = isEstacionamentoNoturno(a), bN = isEstacionamentoNoturno(b)
    if (aN && !bN) return b
    if (!aN && bN) return a
    const durA = a.saida === null ? Infinity : (a.duracao_seg ?? 0)
    const durB = b.saida === null ? Infinity : (b.duracao_seg ?? 0)
    return durA >= durB ? a : b
  }

  // Agrupa por codigo_loja
  const byCode = new Map<string, UnitracParadaRow[]>()
  const semCodigo: UnitracParadaRow[] = []
  for (const p of paradas) {
    if (!p.codigo_loja) { semCodigo.push(p); continue }
    const arr = byCode.get(p.codigo_loja) ?? []
    arr.push(p)
    byCode.set(p.codigo_loja, arr)
  }

  const result: UnitracParadaRow[] = []
  for (const [, grupo] of byCode) {
    const sorted = grupo.slice().sort((a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime())
    // Cria "trips": sequências onde cada nova parada começa > 2h depois da saída da anterior.
    const trips: UnitracParadaRow[][] = [[sorted[0]]]
    for (let i = 1; i < sorted.length; i++) {
      const prev = trips[trips.length - 1].at(-1)!
      const prevSaida = prev.saida ?? prev.chegada
      const gapMs = new Date(sorted[i].chegada).getTime() - new Date(prevSaida).getTime()
      if (gapMs > MULTI_TRIP_GAP_MS) {
        trips.push([sorted[i]])
      } else {
        trips[trips.length - 1].push(sorted[i])
      }
    }
    // Para cada trip, mantém a melhor parada (max duração, não-noturna preferida)
    for (const trip of trips) {
      result.push(trip.reduce(melhor))
    }
  }

  return [...result, ...semCodigo].sort(
    (a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime()
  )
}
```

- [ ] **Step 4: Confirmar que todos os testes passam**

```bash
npx vitest run src/lib/kpi/matcher.test.ts 2>&1 | grep -E "Tests|FAIL"
```

Expected:
```
Tests  104 passed (104)
```

- [ ] **Step 5: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: zero erros (nenhuma saída).

- [ ] **Step 6: Commit**

```bash
git add src/lib/kpi/matcher.ts src/lib/kpi/matcher.test.ts
git commit -m "fix(matcher): deduplicarPorCodigo preserva dois trips separados >2h

Veículos de dois turnos (LQU-5546, LQE-5401, EFU-5704) visitavam a mesma loja
de manhã e de tarde. deduplicarPorCodigo descartava uma das paradas — a segunda
linha escala (carro_ordem=2) ficava sem match. Fix: gap > 2h entre paradas do
mesmo codigo_loja = trips independentes, ambas preservadas. Gap ≤ 2h (check-in
curto) continua deduplicando, mantendo maior duração."
```

---

## Task 4: Verificar resultado e atualizar script de análise

> Reprocessar KPI e comparar com manual para confirmar redução.

**Files:**
- Read: `scripts/analise/analise_completa_20.ts` (nenhuma mudança necessária)

- [ ] **Step 1: Atualizar o KPI gerado via MCP**

No terminal, via MCP kpi-transmonseg-dev:
1. `clear_data` para rede ZONA_SUL data 2026-05-20
2. `load_files` com os arquivos da escala e unitrac da data
3. `processar_kpi` para rede ZONA_SUL data 2026-05-20
4. `gerar_kpi` → baixar novo xlsx como `KPI-ZONA_SUL-2026-05-20 (8).xlsx`

- [ ] **Step 2: Atualizar o script de análise para apontar para a nova versão**

Em `scripts/analise/analise_completa_20.ts`, atualizar a linha:
```typescript
lerKpi('C:/Users/media/Downloads/KPI-ZONA_SUL-2026-05-20 (7).xlsx'),
```
para:
```typescript
lerKpi('C:/Users/media/Downloads/KPI-ZONA_SUL-2026-05-20 (8).xlsx'),
```

- [ ] **Step 3: Rodar análise e contar DIFFs**

```bash
cd C:\Users\media\dev\kpi-transmonseg
npx tsx --tsconfig tsconfig.scripts.json scripts/analise/analise_completa_20.ts 2>&1 | grep -E "OK=|DIFF=|RESUMO"
```

Expected: `OK=xx  DIFF=yy` com yy ≤ 8 (apenas os casos GPS-não-achou e SC residuais).

- [ ] **Step 4: Commit final**

```bash
git add scripts/analise/analise_completa_20.ts
git commit -m "chore(analise): aponta para KPI v8 pós-fix T18-N e multi-trip"
```

---

## Self-Review

### Spec coverage

| Categoria DIFFs | Coberto por |
|----------------|-------------|
| T18 falsos positivos (11) | Task 2 — T18-N guard < 7 |
| Dois turnos (5) | Task 3 — deduplicarPorCodigo multi-trip |
| GPS não achou loja (6) | **Fora de escopo** — requer dados de coordenadas no DB |
| SC leve diferença (2) | Esperado resolver como colateral das Tasks 2+3 |
| Testes obsoletos (6 FAILs) | Task 1 — atualização dos testes |

### Gaps intencionais

**GPS não achou loja (6 casos)**: stores como MEGA BOX 01, Entrega Extra, Loja 33, Lojas 27/15 não têm coordenadas na tabela `lojas` ou o Unitrac classifica a parada como FORA_BASE em vez de LOJA. Fix requer:
1. `SELECT codigo_escala, nome FROM lojas WHERE rede_id='ZONA_SUL' AND lat IS NULL` para identificar stores sem GPS
2. Adicionar coordenadas via migration SQL ou pelo painel Supabase
Não é um fix de código — excluído deste plano.

### Placeholder scan

Nenhum "TBD", "TODO", ou "similar ao task N" encontrado. Todos os steps têm código completo.

### Type consistency

- `deduplicarPorCodigo` mantém assinatura `(paradas: UnitracParadaRow[]): UnitracParadaRow[]` — sem mudança de API.
- `T18-N` é mudança de constante inline — sem impacto em tipos.
- Novos testes usam `EscalaLinhaRow`, `UnitracParadaRow` — mesmos tipos já importados no arquivo.
