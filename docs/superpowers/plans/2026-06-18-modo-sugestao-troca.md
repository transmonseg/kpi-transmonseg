# Modo sugestão de troca Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando o T18 segura a troca de carro, emitir um aviso da placa provável: ALTA reclassifica o status para "mudou de rota" (amarelo, conferir); BAIXA fica "não foi ao cliente" (vermelho) com hipótese na observação.

**Architecture:** O matcher ganha um passe de sugestão que roda só quando o T18 não aplica troca, gravando `placa_sugerida`/`sugestao_confianca`/`sugestao_hora` na `RotaKpi` sem tocar nos mapas de match. O guard do T18 é fatorado num closure `t18Compativel` reusado pelo passe ALTA. As superfícies (planilha PDF via observação, painel via os dois call sites de `derivarStatus`, célula XLSX via `legendaSlot`) leem esses campos.

**Tech Stack:** TypeScript, Next.js custom (Turbopack), vitest, ExcelJS, pdf-lib. Testes com `npx vitest run` e `npx tsc --noEmit`.

## Global Constraints

- Português correto com acentos/ç/ã/é em TODO código, comentário e mensagem de commit; nunca usar ASCII para caracteres acentuados.
- Proibido travessão (`—`) em copy/prosa NOVA: usar vírgula, dois-pontos ou parênteses. O código existente usa `'—'` como placeholder de valor vazio (ex.: `rota.placa_norm ?? '—'`); preservar esses, não introduzir travessão novo em texto.
- KPI NUNCA usa ferramentas MCP. Só `npx vitest run`, `npx tsc --noEmit`, `npx tsx`, git.
- XLSX segue o modelo oficial da Tia: nenhuma coluna nova. A única mudança no XLSX é um ramo em `legendaSlot` (texto de célula já existente).
- Não alterar o comportamento de APLICAÇÃO do T18: o refator `t18Compativel` é byte a byte idêntico (a suíte do matcher tem que continuar verde).
- Não tocar `placa_norm` nem `placa_real`: a placa exibida continua a da escala; o único campo de status que muda é via reclassificação ALTA.
- Convenção de horário do sistema: parsers guardam BRT como `Date.UTC(...)`; ler `getUTCHours()/getUTCMinutes()` direto (sem reconverter timezone).
- Todo commit termina com: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Trabalho assinado como Joaquim Salles.
- Next.js custom (AGENTS.md): só tocamos `src/app/api/kpi/simples/route.ts` numa adição mínima a um objeto já existente; sem novas APIs/rotas.

---

### Task 1: Módulo de texto da sugestão (`sugestao-troca.ts`)

**Files:**
- Create: `src/lib/kpi/sugestao-troca.ts`
- Test: `src/lib/kpi/sugestao-troca.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `textoSugestaoTroca(placa: string, confianca: 'alta' | 'baixa', hora: string | null): string`

- [ ] **Step 1: Escrever o teste que falha**

Create `src/lib/kpi/sugestao-troca.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { textoSugestaoTroca } from './sugestao-troca'

describe('textoSugestaoTroca', () => {
  it('alta com hora → "Possível troca" nomeando placa e horário', () => {
    expect(textoSugestaoTroca('ABC1D23', 'alta', '07:45'))
      .toBe('Possível troca: a placa ABC1D23 esteve nesta loja às 07:45, confirmar.')
  })
  it('alta sem hora → omite o trecho de horário', () => {
    expect(textoSugestaoTroca('ABC1D23', 'alta', null))
      .toBe('Possível troca: a placa ABC1D23 esteve nesta loja, confirmar.')
  })
  it('baixa → hipótese geográfica marcada como não confirmada', () => {
    expect(textoSugestaoTroca('XYZ9K88', 'baixa', '06:10'))
      .toBe('Verificar: nenhum carro da escala registrou GPS aqui; a placa XYZ9K88 passou perto às 06:10 (não confirmado).')
  })
  it('não usa travessão', () => {
    expect(textoSugestaoTroca('ABC1D23', 'alta', '07:45')).not.toContain('—')
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/lib/kpi/sugestao-troca.test.ts`
Expected: FAIL (Cannot find module './sugestao-troca').

- [ ] **Step 3: Implementar o módulo**

Create `src/lib/kpi/sugestao-troca.ts`:

```ts
/**
 * Texto do aviso de sugestão de troca, usado na observação do PDF e no motivo do painel.
 * Apresentação num só lugar (DRY). Sem travessão (regra de copy).
 *  - alta: carro da rede com rota própria esteve nesta loja (sinal forte).
 *  - baixa: hipótese só geográfica (placa passou perto), não confirmada.
 */
export function textoSugestaoTroca(
  placa: string,
  confianca: 'alta' | 'baixa',
  hora: string | null,
): string {
  const h = hora ? ` às ${hora}` : ''
  return confianca === 'alta'
    ? `Possível troca: a placa ${placa} esteve nesta loja${h}, confirmar.`
    : `Verificar: nenhum carro da escala registrou GPS aqui; a placa ${placa} passou perto${h} (não confirmado).`
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run src/lib/kpi/sugestao-troca.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi/sugestao-troca.ts src/lib/kpi/sugestao-troca.test.ts
git commit -m "feat(kpi): texto compartilhado da sugestão de troca

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Campos em `RotaKpi` + refator `t18Compativel` (sem mudar comportamento)

**Files:**
- Modify: `src/lib/types/kpi.ts:51` (3 campos novos em `RotaKpi`, após `_matchMeta?`)
- Modify: `src/lib/kpi/matcher.ts:2065` (extrair o guard do T18 num closure `t18Compativel`) e `src/lib/kpi/matcher.ts:2098-2154` (filtro de candidatas passa a chamar o closure)

**Interfaces:**
- Consumes: tipos `EscalaLinhaRow`, `UnitracParadaRow`, `LojaRow` (já em `matcher.ts`); helpers `haversine`, `resolveLojaId`, `matchScore`, `codCasa`, `scorePair`, mapa `paradaRedesT18` (todos em escopo no bloco T18).
- Produces: closure local `t18Compativel(linha, p, lojaEscala, lojaEscalaAmbigua, redesFungT18): boolean`; campos `RotaKpi.placa_sugerida?`, `RotaKpi.sugestao_confianca?`, `RotaKpi.sugestao_hora?` (lidos pelas Tasks 3, 6, 7).

**Não há teste novo nesta task:** o refator é idêntico em comportamento; o gate é a suíte do matcher continuar 100% verde.

- [ ] **Step 1: Adicionar os campos em `RotaKpi`**

Em `src/lib/types/kpi.ts`, localizar (linha ~51):

```ts
  status: RotaStatus
  _matchMeta?: MatchMeta
}
```

Substituir por:

```ts
  status: RotaStatus
  _matchMeta?: MatchMeta
  /** Placa que PROVAVELMENTE fez a rota quando o T18 segurou (não aplica troca). */
  placa_sugerida?: string | null
  /** Confiança da sugestão: 'alta' = carro da rede parado na loja com rota própria;
   *  'baixa' = só geográfico (hipótese não confirmada). */
  sugestao_confianca?: 'alta' | 'baixa' | null
  /** HH:MM (BRT) em que a placa sugerida esteve no local. */
  sugestao_hora?: string | null
}
```

- [ ] **Step 2: Extrair o closure `t18Compativel`**

Em `src/lib/kpi/matcher.ts`, o bloco T18-F termina na linha ~2064 (`}` do bloco interno) e o loop começa em `for (const linha of semGpsLines) {` (linha ~2066). Inserir o closure ENTRE eles (linha em branco 2065), logo após o fechamento do bloco T18-F:

```ts
      // Guard de compatibilidade do T18 (T18-D distância, T18-R rede, T18-X loja,
      // scorePair ≤ 2), fatorado do filtro de candidatas SEM o teste de `usedIds`.
      // Reusado pelo passe de sugestão (Task 3): "passaria no guard, mas está bloqueado".
      const t18Compativel = (
        linha: EscalaLinhaRow,
        p: UnitracParadaRow,
        lojaEscala: typeof lojas[0] | undefined,
        lojaEscalaAmbigua: boolean,
        redesFungT18: Set<string>,
      ): boolean => {
        // T18-D: guard de distância. Loja com lat/lng → parada ≤5km da loja.
        if (lojaEscala?.lat != null && lojaEscala?.lng != null && p.lat != null && p.lng != null) {
          const distM = haversine(lojaEscala.lat, lojaEscala.lng, p.lat, p.lng)
          if (distM > 5000) return false
        }
        // T18-R: guard de rede.
        const redesDaParada = paradaRedesT18.get(p.id) ?? new Set<string>()
        if (redesDaParada.size > 0) {
          if ([...redesDaParada].every(r => !redesFungT18.has(r))) return false
          // T18-X / T18-X2: parada que resolve para cadastro diferente da escalada é rejeitada.
          const lojaIdParada = resolveLojaId(p, lojas, linha.rede_id)
          if (lojaIdParada) {
            const lojaPar = lojas.find(l => l.id === lojaIdParada)
            if (lojaPar) {
              const codigoBate = !!(linha.loja_codigo_raw && (
                (lojaPar.codigo_escala && codCasa(linha.loja_codigo_raw, lojaPar.codigo_escala)) ||
                (lojaPar.codigo_unitrac && codCasa(linha.loja_codigo_raw, lojaPar.codigo_unitrac))
              ))
              const nomeBate = matchScore(linha.loja_nome_raw, lojaPar.nome) <= 1
              if (!codigoBate && !nomeBate) return false
              if (lojaEscalaAmbigua) return false
              if (lojaEscala && lojaPar.id !== lojaEscala.id) return false
            }
          }
          return scorePair(linha, p) <= 2
        }
        // Coringa (parada sem rede): exige score ≤ 2; cadastro ambíguo exige match perfeito.
        if (lojaEscalaAmbigua) return scorePair(linha, p) === 0
        return scorePair(linha, p) <= 2
      }
```

- [ ] **Step 3: Trocar o filtro de candidatas para usar o closure**

Em `src/lib/kpi/matcher.ts`, localizar o filtro atual (linha ~2098):

```ts
        const candidatas = todasLojaParadas.filter(p => {
          if (usedIds.has(p.id)) return false
```

Esse `.filter(p => { ... })` vai da linha ~2098 até o `})` que fecha em ~2154 (a linha logo antes de `if (!candidatas.length) continue`). Substituir o BLOCO INTEIRO do filtro (de `const candidatas = todasLojaParadas.filter(p => {` até o `})` correspondente, inclusive) por:

```ts
        const candidatas = todasLojaParadas.filter(p =>
          !usedIds.has(p.id) && t18Compativel(linha, p, lojaEscala, lojaEscalaAmbigua, redesFungT18),
        )
```

Não mexer no `if (!candidatas.length) continue` nem no bloco de aplicação (`candidatas.sort`, `matchByEscalaId.set`, etc.) por enquanto — isso é a Task 3.

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros (o closure usa só símbolos já em escopo).

- [ ] **Step 5: Rodar a suíte do matcher (não regressão)**

Run: `npx vitest run src/lib/kpi/matcher.test.ts`
Expected: PASS, mesmo número de testes verdes de antes do refator (o predicado é idêntico).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types/kpi.ts src/lib/kpi/matcher.ts
git commit -m "refactor(kpi): fatora guard do T18 em t18Compativel + campos de sugestão em RotaKpi

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Passe de sugestão no matcher (ALTA/BAIXA) + preenchimento da rota

**Files:**
- Modify: `src/lib/kpi/matcher.ts:1354` (declarar mapa `placaSugerida` ao lado de `placaSubstituta`)
- Modify: `src/lib/kpi/matcher.ts:2155-2166` (substituir `if (!candidatas.length) continue` + aplicação pelo passe de sugestão)
- Modify: `src/lib/kpi/matcher.ts:2620` (passe de preenchimento das rotas, antes de `return rotas`)
- Test: `src/lib/kpi/matcher.test.ts` (estender o describe `troca de carro` com casos ALTA/BAIXA)

**Interfaces:**
- Consumes: `t18Compativel` (Task 2), `RotaKpi.placa_sugerida/sugestao_confianca/sugestao_hora` (Task 2), `UnitracParadaRow.chegada: string`, `haversine`, `scorePair`.
- Produces: rotas com campos de sugestão preenchidos quando o T18 segura.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/lib/kpi/matcher.test.ts`, dentro do `describe('troca de carro — recuperação cross-placa (código + coordenada)', ...)` (que termina em ~2369 com `})`), adicionar ANTES do `})` final do describe estes três testes (reusam `linhaX`, `lojaX`, `paradaLTQ`, `foraBBH` já definidos no describe):

```ts
  it('ALTA: substituto com rota própria → sugere a placa, sem aplicar troca', async () => {
    setSemGeo(true)
    try {
      // LTQ0783 (carro 1) entrega a loja X e fica com a parada (rota própria).
      // BBH1C94 (carro 2) não entrega: T18 segura porque a parada está usada →
      // sugere LTQ0783 (ALTA), sem mexer em placa_real nem nas paradas.
      const linhaA: EscalaLinhaRow = { ...linhaX, id: 'la', placa_norm: 'LTQ0783', carro_ordem: 1 }
      const linhaB: EscalaLinhaRow = { ...linhaX, id: 'lb', placa_norm: 'BBH1C94', carro_ordem: 2 }
      const rotas = await cruzaEscalaUnitrac(
        [linhaA, linhaB], [foraBBH, paradaLTQ(-22.9345, -43.1755)], [lojaX], undefined, undefined, { geoEndereco: true })
      const rB = rotas.find(x => x.escala_linha_id === 'lb')
      expect(rB?.placa_sugerida).toBe('LTQ0783')
      expect(rB?.sugestao_confianca).toBe('alta')
      expect(rB?.sugestao_hora).toBe('06:17') // chegada 06:17Z = BRT mascarado
      expect(rB?.placa_real ?? null).toBeNull()  // NÃO aplica troca
      expect(rB?.paradas ?? []).toHaveLength(0)  // status segue "não entregou"
    } finally { setSemGeo(false) }
  })

  it('troca REAL aplicada não recebe sugestão', async () => {
    setSemGeo(true)
    try {
      const rotas = await cruzaEscalaUnitrac(
        [linhaX], [foraBBH, paradaLTQ(-22.9345, -43.1755)], [lojaX], undefined, undefined, { geoEndereco: true })
      const r = rotas.find(x => x.escala_linha_id === 'lx')
      expect(r?.placa_real).toBe('LTQ0783')          // troca aplicada
      expect(r?.placa_sugerida ?? null).toBeNull()    // logo, sem sugestão
    } finally { setSemGeo(false) }
  })

  it('entrega normal não recebe sugestão', async () => {
    setSemGeo(true)
    try {
      const linhaOk: EscalaLinhaRow = { ...linhaX, id: 'lok', placa_norm: 'LTQ0783' }
      const rotas = await cruzaEscalaUnitrac(
        [linhaOk], [paradaLTQ(-22.9345, -43.1755)], [lojaX], undefined, undefined, { geoEndereco: true })
      const r = rotas.find(x => x.escala_linha_id === 'lok')
      expect(r?.paradas).toHaveLength(1)
      expect(r?.placa_sugerida ?? null).toBeNull()
    } finally { setSemGeo(false) }
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/kpi/matcher.test.ts -t "ALTA: substituto"`
Expected: FAIL (`placa_sugerida` é `undefined`).

- [ ] **Step 3: Declarar o mapa `placaSugerida`**

Em `src/lib/kpi/matcher.ts`, localizar (linha ~1353-1354):

```ts
  const plateTrocaLineIds = new Set<string>()
  const placaSubstituta = new Map<string, string>() // lineId → placa da parada encontrada (T18)
```

Adicionar logo abaixo:

```ts
  const placaSugerida = new Map<string, { placa: string; confianca: 'alta' | 'baixa'; chegada: string }>() // lineId → sugestão (T18 segurou)
```

- [ ] **Step 4: Substituir a aplicação pelo passe de sugestão**

Em `src/lib/kpi/matcher.ts`, localizar o trecho atual (linha ~2155):

```ts
        if (!candidatas.length) continue
        candidatas.sort((a, b) => {
          const sa = scorePair(linha, a), sb = scorePair(linha, b)
          if (sa !== sb) return sa - sb
          return new Date(a.chegada).getTime() - new Date(b.chegada).getTime()
        })
        const best = candidatas[0]
        matchByEscalaId.set(linha.id, best)
        usedIds.add(best.id)
        plateTrocaLineIds.add(linha.id)
        placaSubstituta.set(linha.id, best.placa_norm)
```

Substituir esse bloco inteiro por:

```ts
        const ordenaPorScoreEChegada = (a: UnitracParadaRow, b: UnitracParadaRow) => {
          const sa = scorePair(linha, a), sb = scorePair(linha, b)
          if (sa !== sb) return sa - sb
          return new Date(a.chegada).getTime() - new Date(b.chegada).getTime()
        }
        if (candidatas.length) {
          candidatas.sort(ordenaPorScoreEChegada)
          const best = candidatas[0]
          matchByEscalaId.set(linha.id, best)
          usedIds.add(best.id)
          plateTrocaLineIds.add(linha.id)
          placaSubstituta.set(linha.id, best.placa_norm)
          continue
        }
        // Sem candidata livre: NÃO aplica troca, mas tenta SUGERIR a placa provável.
        // ALTA: parada que passaria no guard do T18, mas está bloqueada por usedIds
        // (o carro tem rota própria / já foi usado). Sinal forte de quem rodou esta loja.
        const alta = todasLojaParadas.filter(p =>
          usedIds.has(p.id) && p.placa_norm !== linha.placa_norm &&
          t18Compativel(linha, p, lojaEscala, lojaEscalaAmbigua, redesFungT18),
        )
        if (alta.length) {
          alta.sort(ordenaPorScoreEChegada)
          const best = alta[0]
          placaSugerida.set(linha.id, { placa: best.placa_norm, confianca: 'alta', chegada: best.chegada })
          continue
        }
        // BAIXA: nenhum carro da rede; hipótese só geográfica (placa mais próxima ≤5km da loja).
        if (lojaEscala?.lat != null && lojaEscala?.lng != null) {
          const lat = lojaEscala.lat, lng = lojaEscala.lng
          const perto = todasLojaParadas
            .filter(p => p.placa_norm !== linha.placa_norm && p.lat != null && p.lng != null &&
              haversine(lat, lng, p.lat, p.lng) <= 5000)
            .map(p => ({ p, d: haversine(lat, lng, p.lat as number, p.lng as number) }))
            .sort((a, b) => a.d - b.d)
          if (perto.length) {
            const best = perto[0].p
            placaSugerida.set(linha.id, { placa: best.placa_norm, confianca: 'baixa', chegada: best.chegada })
          }
        }
```

- [ ] **Step 5: Adicionar o passe de preenchimento das rotas**

Em `src/lib/kpi/matcher.ts`, localizar o fim do guard de saída-CD (linha ~2615-2620) seguido de `return rotas` (~2622):

```ts
  for (const rota of rotas) {
    const chd = rota.paradas[0]?.chegada
    if (rota.saida_cd && chd && new Date(rota.saida_cd).getTime() > new Date(chd).getTime()) {
      rota.saida_cd = null
    }
  }

  return rotas
```

Inserir o passe ENTRE o `}` do loop e o `return rotas`:

```ts
  for (const rota of rotas) {
    const chd = rota.paradas[0]?.chegada
    if (rota.saida_cd && chd && new Date(rota.saida_cd).getTime() > new Date(chd).getTime()) {
      rota.saida_cd = null
    }
  }

  // Sugestão de troca (T18 segurou): grava placa provável + confiança + hora.
  // Só quando a rota NÃO virou troca real (placa_real null) — troca aplicada não sugere.
  for (const rota of rotas) {
    const sug = placaSugerida.get(rota.escala_linha_id)
    if (sug && !rota.placa_real) {
      const d = new Date(sug.chegada)
      rota.placa_sugerida = sug.placa
      rota.sugestao_confianca = sug.confianca
      rota.sugestao_hora = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
    }
  }

  return rotas
```

- [ ] **Step 6: Rodar os testes novos e ver passar**

Run: `npx vitest run src/lib/kpi/matcher.test.ts`
Expected: PASS, incluindo os 3 casos novos e TODOS os existentes (não regressão).

- [ ] **Step 7: Commit**

```bash
git add src/lib/kpi/matcher.ts src/lib/kpi/matcher.test.ts
git commit -m "feat(kpi): passe de sugestão de troca no matcher (ALTA/BAIXA)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Reclassificação de status ALTA (`status-rota.ts`)

**Files:**
- Modify: `src/lib/kpi/status-rota.ts:80` (campo `sugestaoTrocaAlta` em `DadosStatusRota`)
- Modify: `src/lib/kpi/status-rota.ts:213` (reclassificação no wrapper `derivarStatus`)
- Test: `src/lib/kpi/status-rota.test.ts`

**Interfaces:**
- Consumes: nada externo.
- Produces: `DadosStatusRota.sugestaoTrocaAlta?: { placa: string; hora: string | null } | null`. Quando presente e o status base é vermelho, `derivarStatus` devolve `MUDOU_DE_ROTA` (revisar=true).

- [ ] **Step 1: Escrever os testes que falham**

Em `src/lib/kpi/status-rota.test.ts`, adicionar um novo describe (no fim do arquivo, antes do último `})` de fechamento de arquivo não existe — é top-level, então adicionar como bloco independente):

```ts
describe('sugestão de troca ALTA reclassifica para MUDOU_DE_ROTA', () => {
  const semGps = { temGps: false, ficouNaBase: false, paradas: [] as { classificacao: string; loja_id: string | null }[] }

  it('base "não foi" + sugestão ALTA → MUDOU_DE_ROTA, revisar, motivo com a placa', () => {
    const r = derivarStatus({ temGps: true, ficouNaBase: true, paradas: [], placaSaiuDaBase: true,
      sugestaoTrocaAlta: { placa: 'LTQ0783', hora: '06:17' } })
    expect(r.status).toBe('MUDOU_DE_ROTA')
    expect(r.revisar).toBe(true)
    expect(r.motivoRevisao).toContain('LTQ0783')
    expect(r.motivoRevisao).toContain('06:17')
    expect(tierEfetivo(r)).toBe('conferir')
  })

  it('base "sem rastreador" + sugestão ALTA → MUDOU_DE_ROTA', () => {
    expect(derivarStatus({ ...semGps, sugestaoTrocaAlta: { placa: 'AAA1A11', hora: null } }).status)
      .toBe('MUDOU_DE_ROTA')
  })

  it('sem sugestão → status base inalterado (não foi ao cliente)', () => {
    expect(derivarStatus({ temGps: true, ficouNaBase: true, paradas: [], placaSaiuDaBase: true }).status)
      .toBe('NAO_FOI_AO_CLIENTE')
  })

  it('entrega confirmada ignora sugestão ALTA (não rebaixa entrega)', () => {
    const r = derivarStatus({ temGps: true, ficouNaBase: false,
      paradas: [{ classificacao: 'LOJA', loja_id: 'x' }],
      sugestaoTrocaAlta: { placa: 'AAA1A11', hora: '06:00' } })
    expect(r.status).toBe('ENTREGUE')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/kpi/status-rota.test.ts -t "sugestão de troca ALTA"`
Expected: FAIL (o primeiro caso devolve `NAO_FOI_AO_CLIENTE`, não `MUDOU_DE_ROTA`).

- [ ] **Step 3: Adicionar o campo em `DadosStatusRota`**

Em `src/lib/kpi/status-rota.ts`, localizar o fim da interface (linha ~80):

```ts
  placaTemRastreadorApi?: boolean
}
```

Substituir por:

```ts
  placaTemRastreadorApi?: boolean
  /** Sugestão de troca de ALTA confiança (T18 segurou): a placa provável esteve nesta
   *  loja. Reclassifica status vermelho (não foi / sem rastreador / não saiu) para
   *  MUDOU_DE_ROTA (conferir). Ausente/null para sugestão BAIXA ou sem sugestão. */
  sugestaoTrocaAlta?: { placa: string; hora: string | null } | null
}
```

- [ ] **Step 4: Reclassificar no wrapper `derivarStatus`**

Em `src/lib/kpi/status-rota.ts`, localizar o início do wrapper (linha ~211-214):

```ts
export function derivarStatus(d: DadosStatusRota): ResultadoStatus {
  const base = derivarStatusBase(d)
  const temEntrega = d.paradas.some(p => p.loja_id != null)

  // Entregou numa loja que não é a escalada → mudou de rota (com a loja real no motivo).
```

Inserir o bloco de sugestão ALTA logo após a linha do `temEntrega` e antes do comentário de `entregouLojaForaEscala`:

```ts
export function derivarStatus(d: DadosStatusRota): ResultadoStatus {
  const base = derivarStatusBase(d)
  const temEntrega = d.paradas.some(p => p.loja_id != null)

  // Sugestão de troca ALTA: o T18 segurou, mas um carro da rede com rota própria esteve
  // nesta loja. Em vez de vermelho ("não foi"/"sem rastreador"/"não saiu da base"), marca
  // "mudou de rota" (conferir, amarelo) com a placa provável no motivo. Espelha o caminho
  // de troca real não informada (viaTroca && !alteracaoInformada).
  if (d.sugestaoTrocaAlta &&
      (base.status === 'NAO_FOI_AO_CLIENTE' || base.status === 'SEM_RASTREADOR' || base.status === 'NAO_SAIU_DA_BASE')) {
    const h = d.sugestaoTrocaAlta.hora ? ` às ${d.sugestaoTrocaAlta.hora}` : ''
    return {
      status: 'MUDOU_DE_ROTA', revisar: true,
      motivoRevisao: `Provável troca: a placa ${d.sugestaoTrocaAlta.placa} esteve nesta loja${h}. Confirmar.`,
      categoria: null, natureza: 'operacao',
    }
  }

  // Entregou numa loja que não é a escalada → mudou de rota (com a loja real no motivo).
```

- [ ] **Step 5: Rodar os testes e ver passar**

Run: `npx vitest run src/lib/kpi/status-rota.test.ts`
Expected: PASS (incluindo os 4 casos novos e todos os existentes).

- [ ] **Step 6: Commit**

```bash
git add src/lib/kpi/status-rota.ts src/lib/kpi/status-rota.test.ts
git commit -m "feat(kpi): sugestão ALTA reclassifica status para MUDOU_DE_ROTA

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Legenda XLSX da célula ALTA (`gerador-kpi.ts`)

**Files:**
- Modify: `src/lib/types/kpi.ts:92` (flag `sugestao_troca_alta` em `KpiLinha`)
- Modify: `src/lib/kpi/gerador-kpi.ts:180` (ramo novo em `legendaSlot`)
- Test: `src/lib/kpi/gerador-kpi-legenda.test.ts`

**Interfaces:**
- Consumes: `KpiLinha` (de `@/lib/types/kpi`), via `LinhaParaKpi extends KpiLinha`.
- Produces: `KpiLinha.sugestao_troca_alta?: boolean`; `legendaSlot` devolve `'MUDOU DE ROTA - CONFERIR'` quando a flag está ligada e não houve chegada.

- [ ] **Step 1: Escrever o teste que falha**

Em `src/lib/kpi/gerador-kpi-legenda.test.ts`, dentro do `describe('legendaSlot — legenda do KPI gerado', ...)`, adicionar:

```ts
  it('sugestão de troca ALTA → MUDOU DE ROTA - CONFERIR (mesmo sem rastreador da placa escalada)', () => {
    expect(legendaSlot(linha({ sugestao_troca_alta: true, placa_rastreada: false }))).toBe('MUDOU DE ROTA - CONFERIR')
  })
  it('sem sugestão ALTA, placa não rastreada → continua SEM RASTREADOR', () => {
    expect(legendaSlot(linha({ sugestao_troca_alta: false, placa_rastreada: false }))).toBe('SEM RASTREADOR')
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/kpi/gerador-kpi-legenda.test.ts -t "sugestão de troca ALTA"`
Expected: FAIL (devolve `'SEM RASTREADOR'`).

- [ ] **Step 3: Adicionar a flag em `KpiLinha`**

Em `src/lib/types/kpi.ts`, localizar (linha ~92):

```ts
  placa_desatualizada?: boolean
}
```

Substituir por:

```ts
  placa_desatualizada?: boolean
  /** Sugestão de troca de ALTA confiança (T18 segurou; carro da rede com rota própria
   *  esteve nesta loja). Faz a célula do XLSX mostrar "MUDOU DE ROTA - CONFERIR". */
  sugestao_troca_alta?: boolean
}
```

- [ ] **Step 4: Adicionar o ramo em `legendaSlot`**

Em `src/lib/kpi/gerador-kpi.ts`, localizar o início de `legendaSlot` (linha ~178-180):

```ts
export function legendaSlot(c: LinhaParaKpi | null): string | null {
  if (!c) return null
  if (c.chd_loja_1 !== null) return null
```

Inserir o ramo logo após o early-return de chegada:

```ts
export function legendaSlot(c: LinhaParaKpi | null): string | null {
  if (!c) return null
  if (c.chd_loja_1 !== null) return null
  // Sugestão de troca ALTA: outro carro da rede (com rota própria) esteve nesta loja.
  // Mostra "mudou de rota, conferir" mesmo se a placa escalada não estiver rastreada
  // (foi a substituta que rodou). Precede os ramos de "não foi"/"sem rastreador".
  if (c.sugestao_troca_alta) return 'MUDOU DE ROTA - CONFERIR'
```

- [ ] **Step 5: Rodar os testes e ver passar**

Run: `npx vitest run src/lib/kpi/gerador-kpi-legenda.test.ts src/lib/kpi/gerador-kpi.test.ts`
Expected: PASS (casos novos + existentes da legenda intactos).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types/kpi.ts src/lib/kpi/gerador-kpi.ts src/lib/kpi/gerador-kpi-legenda.test.ts
git commit -m "feat(kpi): legenda MUDOU DE ROTA na célula XLSX para sugestão ALTA

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Observação do PDF + flag XLSX em `rotaToLinha` (`gerar-kpi-local.ts`)

**Files:**
- Modify: `src/lib/kpi/gerar-kpi-local.ts:4` (import de `textoSugestaoTroca`) e `:91-93` (`observacao` + `sugestao_troca_alta` em `rotaToLinha`)
- Test: `src/lib/kpi/gerar-kpi-local.test.ts`

**Interfaces:**
- Consumes: `textoSugestaoTroca` (Task 1), `RotaKpi.placa_sugerida/sugestao_confianca/sugestao_hora` (Task 2), `KpiLinha.sugestao_troca_alta` (Task 5).
- Produces: `rotaToLinha` emite a observação da sugestão (PDF, offline + produção) e liga `sugestao_troca_alta` (XLSX).

- [ ] **Step 1: Escrever o teste que falha**

Em `src/lib/kpi/gerar-kpi-local.test.ts`, dentro do mesmo describe do teste `rotaToLinha` existente (após o `it('rotaToLinha mapeia rota+escala pra linha do gerador', ...)`), adicionar:

```ts
  it('rotaToLinha emite observação de sugestão ALTA + liga a flag do XLSX', () => {
    const escala = {
      rede_id: 'GUANABARA', loja_nome_raw: 'Loja 1', loja_codigo_raw: '1',
      motorista_nome: 'FULANO', motorista_codigo: 10, placa_norm: 'ABC1234',
      carro_ordem: 1, data_entrega: '2026-05-20',
    } as unknown as LinhaEscala
    const rota = {
      escala_linha_id: 'esc-0', placa_norm: 'ABC1234', placa_real: null,
      saida_cd: null, chegada_base: null, paradas: [], anomalias_codigos: [], status: 'sem_entrega',
      placa_sugerida: 'LTQ0783', sugestao_confianca: 'alta', sugestao_hora: '06:17',
    } as unknown as RotaKpi

    const linha = rotaToLinha(rota, escala, 1)
    expect(linha.observacao).toBe('Possível troca: a placa LTQ0783 esteve nesta loja às 06:17, confirmar.')
    expect(linha.sugestao_troca_alta).toBe(true)
    expect(linha.placa).toBe('ABC1234') // placa exibida continua a da escala
  })

  it('rotaToLinha: sugestão BAIXA vai na observação mas NÃO liga a flag do XLSX', () => {
    const escala = {
      rede_id: 'GUANABARA', loja_nome_raw: 'Loja 1', loja_codigo_raw: '1',
      motorista_nome: 'FULANO', motorista_codigo: 10, placa_norm: 'ABC1234',
      carro_ordem: 1, data_entrega: '2026-05-20',
    } as unknown as LinhaEscala
    const rota = {
      escala_linha_id: 'esc-0', placa_norm: 'ABC1234', placa_real: null,
      saida_cd: null, chegada_base: null, paradas: [], anomalias_codigos: [], status: 'sem_entrega',
      placa_sugerida: 'XYZ9K88', sugestao_confianca: 'baixa', sugestao_hora: '06:10',
    } as unknown as RotaKpi

    const linha = rotaToLinha(rota, escala, 1)
    expect(linha.observacao).toContain('Verificar')
    expect(linha.observacao).toContain('XYZ9K88')
    expect(linha.sugestao_troca_alta).toBe(false)
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/kpi/gerar-kpi-local.test.ts -t "sugestão ALTA"`
Expected: FAIL (`observacao` é `null`).

- [ ] **Step 3: Importar `textoSugestaoTroca`**

Em `src/lib/kpi/gerar-kpi-local.ts`, localizar os imports do topo e adicionar (junto dos outros imports relativos `./`):

```ts
import { textoSugestaoTroca } from './sugestao-troca'
```

- [ ] **Step 4: Estender a observação e ligar a flag em `rotaToLinha`**

Em `src/lib/kpi/gerar-kpi-local.ts`, localizar (linha ~91-96):

```ts
    observacao: rota.placa_real
      ? `Troca de carro: entregue pela placa ${rota.placa_real} (escala: ${rota.placa_norm ?? '—'}).`
      : null,
    anomalias_codigos: rota.anomalias_codigos,
    motorista_codigo: escala.motorista_codigo,
    rota_status: rota.status,
```

Substituir por:

```ts
    observacao: rota.placa_real
      ? `Troca de carro: entregue pela placa ${rota.placa_real} (escala: ${rota.placa_norm ?? '—'}).`
      : rota.placa_sugerida
        ? textoSugestaoTroca(rota.placa_sugerida, rota.sugestao_confianca ?? 'baixa', rota.sugestao_hora ?? null)
        : null,
    sugestao_troca_alta: rota.sugestao_confianca === 'alta',
    anomalias_codigos: rota.anomalias_codigos,
    motorista_codigo: escala.motorista_codigo,
    rota_status: rota.status,
```

- [ ] **Step 5: Rodar os testes e ver passar**

Run: `npx vitest run src/lib/kpi/gerar-kpi-local.test.ts`
Expected: PASS (casos novos + existentes).

- [ ] **Step 6: Commit**

```bash
git add src/lib/kpi/gerar-kpi-local.ts src/lib/kpi/gerar-kpi-local.test.ts
git commit -m "feat(kpi): observação da sugestão no PDF + flag XLSX via rotaToLinha

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Wiring do painel (preview + dashboard) + verificação dia 17

**Files:**
- Modify: `src/app/api/kpi/simples/route.ts:918` (passar `sugestaoTrocaAlta` ao `derivarStatus` do preview)
- Modify: `src/lib/kpi/dashboard-api-fonte.ts:151` (passar `sugestaoTrocaAlta` ao `derivarStatus` agregado)
- Modify: `scripts/dev/troca-dia17.mts` (imprimir a sugestão por caso, para verificação manual)

**Interfaces:**
- Consumes: `RotaKpi.placa_sugerida/sugestao_confianca/sugestao_hora` (Task 2), `DadosStatusRota.sugestaoTrocaAlta` (Task 4).
- Produces: ALTA aparece amarela (MUDOU_DE_ROTA) no preview por linha e no agregado do dashboard.

**Sem teste unitário:** os dois call sites são integração (route handler + Supabase/API). O gate é `npx tsc --noEmit` + a suíte completa verde + o script do dia 17 mostrando as sugestões.

- [ ] **Step 1: Wiring no preview (`route.ts`)**

Em `src/app/api/kpi/simples/route.ts`, localizar dentro do objeto passado a `derivarStatus` (linha ~943-948):

```ts
          placaTemRastreadorApi: classApiLinha === 'rastreado' && !temGps,
          // Avisos: dado faltando / ambíguo / fora da escala.
          lojaSemCadastroUnitrac,
```

Inserir o campo `sugestaoTrocaAlta` antes do comentário "Avisos":

```ts
          placaTemRastreadorApi: classApiLinha === 'rastreado' && !temGps,
          // Sugestão de troca ALTA (T18 segurou): vira "mudou de rota" (amarelo) em vez
          // de "não foi" (vermelho), com a placa provável no motivo.
          sugestaoTrocaAlta: rota.sugestao_confianca === 'alta' && rota.placa_sugerida
            ? { placa: rota.placa_sugerida, hora: rota.sugestao_hora ?? null }
            : null,
          // Avisos: dado faltando / ambíguo / fora da escala.
          lojaSemCadastroUnitrac,
```

- [ ] **Step 2: Wiring no agregado (`dashboard-api-fonte.ts`)**

Em `src/lib/kpi/dashboard-api-fonte.ts`, localizar o objeto de `derivarStatus` (linha ~156-158):

```ts
      placaDesatualizadaApi: classApi === 'desatualizado',
      placaTemRastreadorApi: classApi === 'rastreado' && !temGps,
    })
```

Substituir por:

```ts
      placaDesatualizadaApi: classApi === 'desatualizado',
      placaTemRastreadorApi: classApi === 'rastreado' && !temGps,
      sugestaoTrocaAlta: rota.sugestao_confianca === 'alta' && rota.placa_sugerida
        ? { placa: rota.placa_sugerida, hora: rota.sugestao_hora ?? null }
        : null,
    })
```

- [ ] **Step 3: Imprimir a sugestão no script do dia 17**

Em `scripts/dev/troca-dia17.mts`, localizar a linha que imprime a substituta (linha ~105):

```ts
  console.log(`  >>> SUBSTITUTA AUTO-DETECTADA: ${substituta ? `SIM → ${substituta}` : 'NÃO'}`)
```

Adicionar logo abaixo:

```ts
  const sug = rota.placa_sugerida ? `${rota.placa_sugerida} (${rota.sugestao_confianca}${rota.sugestao_hora ? ` ${rota.sugestao_hora}` : ''})` : 'NÃO'
  console.log(`  >>> SUGESTÃO (T18 segurou): ${sug}`)
```

- [ ] **Step 4: Verificar tipos e suíte completa**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npx vitest run`
Expected: PASS (suíte completa verde).

- [ ] **Step 5: Rodar o script do dia 17 (verificação manual)**

Run: `npx tsx scripts/dev/troca-dia17.mts`
Expected: para UBO5E05 (Copacabana 26) e UEH9I93 (Laranjeiras 32), a linha `SUGESTÃO (T18 segurou)` mostra uma placa com confiança `alta`; para LGT1200 (Bento Ribeiro) e GVH1397 (Caxias), mostra `baixa` ou `NÃO`. Nenhum dos quatro deve ter `SUBSTITUTA AUTO-DETECTADA: SIM` (o T18 segura nesses casos).

- [ ] **Step 6: Ver o painel rodando (conferência visual da ALTA amarela)**

Subir o dev server e abrir a tela de preview do KPI (`/painel/kpi/simples`), gerar o KPI do dia 17 de uma rede com caso ALTA (Copacabana/Laranjeiras), e CONFERIR que a linha aparece com selo amarelo "Mudou de rota" e o motivo "Provável troca: a placa X esteve nesta loja...". Invocar uma skill de taste antes de dar a UI por pronta. (Sem mudança de código na página; é validação visual de que o status flui correto.)

- [ ] **Step 7: Commit**

```bash
git add src/app/api/kpi/simples/route.ts src/lib/kpi/dashboard-api-fonte.ts scripts/dev/troca-dia17.mts
git commit -m "feat(kpi): painel mostra sugestão ALTA como mudou de rota (preview + dashboard)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- Campos `RotaKpi` → Task 2. ✓
- Refator `t18Compativel` → Task 2. ✓
- Passe de sugestão ALTA/BAIXA + preenchimento → Task 3. ✓
- Módulo `sugestao-troca.ts` → Task 1. ✓
- Status ALTA → MUDOU_DE_ROTA (`status-rota.ts`) → Task 4. ✓
- Legenda XLSX ALTA (`legendaSlot` + flag `KpiLinha`) → Task 5. ✓
- Observação PDF (offline + produção via `rotaToLinha`) → Task 6. ✓
- Painel (preview `route.ts` + agregado `gerarDiaApi`) → Task 7. ✓
- BAIXA fica vermelha, só observação → garantido (Task 4 não passa sugestaoTrocaAlta na baixa; Task 6 emite o texto). ✓
- Não regressão T18 → Task 2 Step 5 + Task 3 Step 6 (suíte verde). ✓

**2. Placeholder scan:** Sem TBD/TODO; todo step de código tem o código completo. ✓

**3. Type consistency:**
- `sugestaoTrocaAlta: { placa: string; hora: string | null } | null` idêntico em `DadosStatusRota` (Task 4), no wiring do preview (Task 7) e do agregado (Task 7). ✓
- `placa_sugerida`/`sugestao_confianca: 'alta' | 'baixa'`/`sugestao_hora` idênticos entre `RotaKpi` (Task 2), matcher (Task 3), `rotaToLinha` (Task 6) e wiring (Task 7). ✓
- `sugestao_troca_alta?: boolean` em `KpiLinha` (Task 5) e setado em `rotaToLinha` (Task 6). ✓
- `textoSugestaoTroca(placa, confianca, hora)` idêntico em Task 1 (def) e Task 6 (uso). ✓
