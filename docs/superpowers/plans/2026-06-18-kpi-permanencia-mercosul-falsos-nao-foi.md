# Correção de Permanência + Falsos "Não Foi" no KPI — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a permanência subnotificada quando a visita oscila para fora do raio (cadeia FORA_BASE antes/depois da geofence LOJA) e rebaixar de "não entregou" para "conferir" os no-shows marcados para revisão (placa divergente no Unitrac).

**Architecture:** Três correções cirúrgicas no pipeline de cruzamento já existente. (1) Remover o guard de 15min na extensão de saída por FORA_BASE em `matcher.ts`. (2) Adicionar a função espelho `estendeChegadaPorForaBase` (extensão da chegada para trás) e ligá-la no call site. (3) Generalizar `tierEfetivo` em `status-rota.ts` para que qualquer no-show com `revisar=true` caia em `conferir`. Nenhuma reescrita de subsistema; cada mudança é coberta por fixture nova e validada contra a suíte completa de não-regressão.

**Tech Stack:** TypeScript, Next.js 16.2.6 (Turbopack), Vitest. Backend Supabase. Sem MCP — só scripts diretos com `tsx`/`vitest`.

## Global Constraints

- Português correto com acentos em commits, comentários e docs. NUNCA usar travessão (—) fora de roteiros.
- KPI: NUNCA usar ferramentas MCP. Só scripts diretos (`npx vitest`, `tsx`).
- Saída/entrada da loja é SEMPRE a última saída relevante (placa que volta conta até a última saída).
- Não remontar XLSX do zero: qualquer saída XLSX reaproveita o modelo oficial (`gerador-kpi.ts` / XLSX da Tia). (Aplica-se ao plano seguinte do diagnóstico, não a este.)
- Dark mode do projeto é PRETO; azul só como acento. (Sem trabalho de UI neste plano.)
- Antes de dar qualquer UI por pronta, ver a tela rodando. (Sem UI neste plano.)
- Todo commit termina com:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Free tier apenas; nenhuma solução paga.
- `cruzaEscalaUnitrac` mascara BRT como UTC (`getUTCHours()`); todas as fixtures usam timestamps `...Z` lidos como horário local de Brasília.

## Escopo deste plano

Cobre as correções de **código de exatidão** (Frente 1 permanência + Frente 3 Camada 1 rebaixamento de tier). O **relatório diagnóstico de cadastro em XLSX** (Frente 2 placas Mercosul/divergentes + Frente 3 Camada 2 `diagnostico-cadastro.ts`) é um subsistema separado (novo módulo + geração XLSX seguindo o modelo oficial) e recebe um plano próprio em seguida, conforme a regra de "um plano por subsistema". Achado registrado na investigação: o caso "placa Mercosul não identifica" relatado pelo cliente (ex.: `KWV7E49` x `KWV7E89`) já é detectado por `placaDivergeUnitrac` (ANOM-15) e é ação de cadastro, não bug de conversão; a Camada 1 deste plano remove o sintoma visível (linha vermelha "Não entregou") desse caso.

## File Structure

- `src/lib/kpi/matcher.ts` — Tasks 1 e 2. Já contém `estendeSaidaPorForaBase` (linha 440), `haversine`, e o call site de montagem da rota (linhas 2187-2237). Recebe a nova função `estendeChegadaPorForaBase` ao lado da existente.
- `src/lib/kpi/matcher.test.ts` — fixtures novas de Assaí (forward) e Caxias (backward). Padrão existente: `cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)` com `EscalaLinhaRow[]`, `UnitracParadaRow[]`, `LojaRow[]` (ver bloco "Bug 6" a partir da linha 2025).
- `src/lib/kpi/status-rota.ts` — Task 3. `tierEfetivo` (linha 306).
- `src/lib/kpi/status-rota.test.ts` — testes novos de rebaixamento de tier (padrão `describe('tiers de certeza')`, linha 25).

---

## Task 1: Remover guard de 15min na extensão de saída (Assaí Barra)

**Files:**
- Modify: `src/lib/kpi/matcher.ts:447-454` (guard dentro de `estendeSaidaPorForaBase`)
- Test: `src/lib/kpi/matcher.test.ts` (nova fixture no `describe` "Bug 6", após a linha 2097)

**Interfaces:**
- Consumes: `cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)`, tipos `EscalaLinhaRow`, `UnitracParadaRow`, `LojaRow` (já importados no topo de `matcher.test.ts`).
- Produces: comportamento corrigido de `estendeSaidaPorForaBase` (mesma assinatura `(matched: UnitracParadaRow, todasParadas: UnitracParadaRow[]): Date | null`).

**Contexto do bug (já reproduzido em `scripts/dev/repro-perm-18.mts`):** Assaí Barra placa `SFG2F72` dia 18/06: a visita aparece como LOJA 05:29→05:45 (16min) seguida de FORA_BASE 05:46→12:18 (deriva de GPS ~150m). O KPI reporta só os 16min da LOJA. O guard `if (cls === 'LOJA') { if (matchedDurSeg > 15*60) return null }` bloqueia a extensão porque 960s > 900s. A cadeia forward só caminha por FORA_BASE (`if (p.classificacao !== 'FORA_BASE') break`), então remover o guard NÃO reabre a regressão Recreio (LOJA+LOJA), que continua barrada por esse `break`.

- [ ] **Step 1: Escrever o teste que falha (Assaí forward)**

Adicionar ao final do `describe` "Bug 6" em `src/lib/kpi/matcher.test.ts` (logo após o teste PREZUNIC FONSECA que termina na linha 2097, antes do `})` que fecha o describe):

```ts
  it('Permanência 18/06: ASSAI BARRA SFG2F72 (LOJA 16min + FORA_BASE longo → estende saída)', async () => {
    // Cliente reportou 16min; real ≈6h49 (chegou ~05:29, permaneceu até ~12:18).
    // LOJA de 16min (>15min) seguida de FORA_BASE longo, ~150m da loja: GPS oscila
    // pra fora do raio mas o caminhão segue no cliente. Antes do fix o guard de
    // 15min zerava a extensão.
    const lojaLat = -22.9970, lojaLng = -43.3650
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'lAss', rede_id: 'ASSAI', placa_norm: 'SFG2F72', loja_nome_raw: 'Assaí - Barra', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-06-18' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p0', placa_norm: 'SFG2F72', chegada: '2026-06-18T03:10:00Z', saida: '2026-06-18T04:50:00Z', duracao_seg: 6000, local_parada: 'BASE BENASSI - BASE BENASSI', codigo_loja: null, nome_loja: null, lat: -22.83, lng: -43.32, classificacao: 'BASE', ordem: 1 },
      { id: 'p1', placa_norm: 'SFG2F72', chegada: '2026-06-18T05:29:00Z', saida: '2026-06-18T05:45:00Z', duracao_seg: 960, local_parada: '560245 - ASSAI BARRA', codigo_loja: '560245', nome_loja: 'ASSAI BARRA', lat: -22.99701, lng: -43.36499, classificacao: 'LOJA', ordem: 2 },
      { id: 'p2', placa_norm: 'SFG2F72', chegada: '2026-06-18T05:46:00Z', saida: '2026-06-18T12:18:00Z', duracao_seg: 23520, local_parada: 'FORA DE BASE E LOCAL DE SERVIÇO', codigo_loja: null, nome_loja: null, lat: -22.99820, lng: -43.36460, classificacao: 'FORA_BASE', ordem: 3 },
      { id: 'p3', placa_norm: 'SFG2F72', chegada: '2026-06-18T13:20:00Z', saida: '2026-06-18T13:55:00Z', duracao_seg: 2100, local_parada: 'BASE BENASSI - BASE BENASSI', codigo_loja: null, nome_loja: null, lat: -22.83, lng: -43.32, classificacao: 'BASE', ordem: 4 },
    ]
    const lojas: LojaRow[] = [
      { id: 'cad-ass', rede_id: 'ASSAI', nome: 'Assaí - Barra', nome_normalizado: 'barra', codigo_escala: null, codigo_unitrac: '560245', nome_unitrac: 'ASSAI BARRA', lat: lojaLat, lng: lojaLng, raio_metros: 200 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    const r = rotas.find((x) => x.escala_linha_id === 'lAss')
    expect(r?.paradas ?? []).toHaveLength(1)
    expect(r!.paradas[0].parada_id).toBe('p1')
    const chegada = r!.paradas[0].chegada
    const saida = r!.paradas[0].saida
    expect(`${String(chegada.getUTCHours()).padStart(2, '0')}:${String(chegada.getUTCMinutes()).padStart(2, '0')}`).toBe('05:29')
    expect(`${String(saida.getUTCHours()).padStart(2, '0')}:${String(saida.getUTCMinutes()).padStart(2, '0')}`).toBe('12:18')
    expect(r!.paradas[0].duracao_min).toBe(409)
  })
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/kpi/matcher.test.ts -t "ASSAI BARRA SFG2F72"`
Expected: FAIL. A saída atual fica em `05:45` (guard de 15min retorna null), `duracao_min` ≈ 16, não 409.

- [ ] **Step 3: Remover o guard de 15min para LOJA**

Em `src/lib/kpi/matcher.ts`, substituir o bloco do guard (linhas 447-454):

```ts
  const cls = matched.classificacao
  // LOJA: só estende se for curta (≤15min). FORA_BASE/FAKE_EXIT: estende sem
  // restrição de duração (matched pode ser longo, ex: MANILHA 106min).
  if (cls === 'LOJA') {
    if (matchedDurSeg > 15 * 60) return null
  } else if (cls !== 'FORA_BASE' && cls !== 'FAKE_EXIT') {
    return null
  }
```

por:

```ts
  const cls = matched.classificacao
  // Estende LOJA / FORA_BASE / FAKE_EXIT sem restrição de duração do matched.
  // A cadeia forward só caminha por FORA_BASE adjacente (break em não-FORA_BASE
  // abaixo), então LOJA longa seguida de outra LOJA (Recreio) continua barrada.
  // O guard antigo de 15min em LOJA zerava casos legítimos onde o GPS oscila pra
  // fora do raio e o caminhão segue no cliente (Assaí Barra 18/06: 16min de LOJA
  // + ~6h30 de FORA_BASE a ~150m).
  if (cls !== 'LOJA' && cls !== 'FORA_BASE' && cls !== 'FAKE_EXIT') {
    return null
  }
```

Nota: `matchedDurSeg` (linha 446) passa a ficar sem uso na função. Removê-lo: apagar a linha `const matchedDurSeg = matched.duracao_seg ?? 0`.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/kpi/matcher.test.ts -t "ASSAI BARRA SFG2F72"`
Expected: PASS.

- [ ] **Step 5: Rodar a suíte completa de matcher (não-regressão)**

Run: `npx vitest run src/lib/kpi/matcher.test.ts`
Expected: PASS em tudo, incluindo "PREZUNIC FONSECA", "ATACADAO MANILHA", "GUANABARA BENTO RIBEIRO" e os casos LOJA+LOJA. Se algum quebrar, o guard era necessário em mais do que o previsto: PARAR e reanalisar (não tentar segundo fix por cima).

- [ ] **Step 6: Commit**

```bash
git add src/lib/kpi/matcher.ts src/lib/kpi/matcher.test.ts
git commit -m "$(cat <<'EOF'
fix(kpi): estende saída por FORA_BASE mesmo com LOJA longa (Assaí Barra 18/06)

O guard de 15min na LOJA matched zerava a extensão de saída quando o GPS
oscila pra fora do raio e o caminhão segue no cliente. Cliente reportou 16min
de permanência no Assaí Barra quando o real era ~6h49. A cadeia forward só
caminha por FORA_BASE adjacente, então LOJA+LOJA (Recreio) continua barrada.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extensão de chegada para trás por FORA_BASE (Caxias Sul Fluminense)

**Files:**
- Modify: `src/lib/kpi/matcher.ts` — adicionar `estendeChegadaPorForaBase` logo após `estendeSaidaPorForaBase` (depois da linha 486); ligar no call site (após a linha 2200) e ajustar o override do bloco LOJA+LOJA (linha 2218).
- Test: `src/lib/kpi/matcher.test.ts` (nova fixture no `describe` "Bug 6").

**Interfaces:**
- Consumes: `haversine(lat, lng, lat, lng)` (já usada em `estendeSaidaPorForaBase`), `UnitracParadaRow`.
- Produces: `estendeChegadaPorForaBase(matched: UnitracParadaRow, todasParadas: UnitracParadaRow[]): Date | null` — retorna a chegada da PRIMEIRA parada FORA_BASE da cadeia adjacente ANTERIOR ao matched, ou `null` se não estende.

**Contexto do bug:** Caxias Sul Fluminense placa `UBF5G32` dia 18/06: FORA_BASE 10:25→12:29 (124min) seguido de LOJA 12:31→13:07 (36min), ~45m da loja. O KPI reporta só os 36min da LOJA; a chegada real é 10:25 (permanência ≈2h42). A extensão de saída (Task 1) não cobre porque o FORA_BASE está ANTES da LOJA. É o espelho exato: caminhar para trás pela cadeia FORA_BASE com os mesmos critérios de gap/dist/duração.

- [ ] **Step 1: Escrever o teste que falha (Caxias backward)**

Adicionar ao `describe` "Bug 6" em `src/lib/kpi/matcher.test.ts`:

```ts
  it('Permanência 18/06: CAXIAS SUL FLUMINENSE UBF5G32 (FORA_BASE longo ANTES da LOJA → estende chegada)', async () => {
    // Mapa: chegada 10:25, permanência ~2:45h. KPI reportava só 0h36 (segmento LOJA).
    // Visita COMEÇA fora do raio (FORA_BASE 10:25→12:29) e só depois entra na
    // geofence (LOJA 12:31→13:07). Espelho de estendeSaidaPorForaBase pra chegada.
    const lojaLat = -22.7100, lojaLng = -43.3050
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'lCax', rede_id: 'ASSAI', placa_norm: 'UBF5G32', loja_nome_raw: 'Assaí - Caxias Sul Fluminense', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-06-18' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p0', placa_norm: 'UBF5G32', chegada: '2026-06-18T07:00:00Z', saida: '2026-06-18T09:30:00Z', duracao_seg: 9000, local_parada: 'BASE BENASSI - BASE BENASSI', codigo_loja: null, nome_loja: null, lat: -22.83, lng: -43.32, classificacao: 'BASE', ordem: 1 },
      { id: 'p1', placa_norm: 'UBF5G32', chegada: '2026-06-18T10:25:00Z', saida: '2026-06-18T12:29:00Z', duracao_seg: 7440, local_parada: 'FORA DE BASE E LOCAL DE SERVIÇO', codigo_loja: null, nome_loja: null, lat: -22.71030, lng: -43.30540, classificacao: 'FORA_BASE', ordem: 2 },
      { id: 'p2', placa_norm: 'UBF5G32', chegada: '2026-06-18T12:31:00Z', saida: '2026-06-18T13:07:00Z', duracao_seg: 2160, local_parada: '560219 - ASSAI CAXIAS', codigo_loja: '560219', nome_loja: 'ASSAI CAXIAS', lat: -22.71001, lng: -43.30499, classificacao: 'LOJA', ordem: 3 },
      { id: 'p3', placa_norm: 'UBF5G32', chegada: '2026-06-18T14:10:00Z', saida: '2026-06-18T14:45:00Z', duracao_seg: 2100, local_parada: 'BASE BENASSI - BASE BENASSI', codigo_loja: null, nome_loja: null, lat: -22.83, lng: -43.32, classificacao: 'BASE', ordem: 4 },
    ]
    const lojas: LojaRow[] = [
      { id: 'cad-cax', rede_id: 'ASSAI', nome: 'Assaí - Caxias Sul Fluminense', nome_normalizado: 'caxias sul fluminense', codigo_escala: null, codigo_unitrac: '560219', nome_unitrac: 'ASSAI CAXIAS', lat: lojaLat, lng: lojaLng, raio_metros: 200 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    const r = rotas.find((x) => x.escala_linha_id === 'lCax')
    expect(r?.paradas ?? []).toHaveLength(1)
    expect(r!.paradas[0].parada_id).toBe('p2')
    const chegada = r!.paradas[0].chegada
    const saida = r!.paradas[0].saida
    expect(`${String(chegada.getUTCHours()).padStart(2, '0')}:${String(chegada.getUTCMinutes()).padStart(2, '0')}`).toBe('10:25')
    expect(`${String(saida.getUTCHours()).padStart(2, '0')}:${String(saida.getUTCMinutes()).padStart(2, '0')}`).toBe('13:07')
    expect(r!.paradas[0].duracao_min).toBe(162)
  })
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/kpi/matcher.test.ts -t "CAXIAS SUL FLUMINENSE UBF5G32"`
Expected: FAIL. Chegada atual fica em `12:31` (só o segmento LOJA), `duracao_min` ≈ 36, não 162.

- [ ] **Step 3: Adicionar `estendeChegadaPorForaBase`**

Em `src/lib/kpi/matcher.ts`, inserir logo após o fechamento de `estendeSaidaPorForaBase` (depois da linha 486, antes do comentário de `computeSaidaCdParaParada`):

```ts
/**
 * Espelho de estendeSaidaPorForaBase para a CHEGADA. Quando a visita começa fora
 * do raio registrado (cadeia FORA_BASE) e só depois o GPS entra na geofence LOJA,
 * a chegada real é a da PRIMEIRA parada FORA_BASE adjacente, não a do matched.
 * Caminha para trás na timeline com os mesmos critérios de gap/duração/distância.
 *
 * Caso real (Caxias Sul Fluminense, UBF5G32, 18/06): FORA_BASE 10:25→12:29
 * seguido de LOJA 12:31→13:07. Sem isto o KPI reporta só 0h36; real ≈2h42.
 */
function estendeChegadaPorForaBase(
  matched: UnitracParadaRow,
  todasParadas: UnitracParadaRow[],
): Date | null {
  const matchedChegadaTs = new Date(matched.chegada).getTime()
  const cls = matched.classificacao
  if (cls !== 'LOJA' && cls !== 'FORA_BASE' && cls !== 'FAKE_EXIT') return null
  if (matched.lat == null || matched.lng == null) return null

  const ordenadas = [...todasParadas].sort(
    (a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime(),
  )
  const idx = ordenadas.findIndex((p) => p.id === matched.id)
  if (idx < 0) return null

  let chegadaEstendida: Date | null = null
  let prevChegadaTs = matchedChegadaTs
  for (let i = idx - 1; i >= 0; i--) {
    const p = ordenadas[i]
    if (!p.saida) break
    const pSaidaTs = new Date(p.saida).getTime()
    // p precisa terminar até o início do segmento atual (gap não-negativo).
    if (pSaidaTs > prevChegadaTs) break
    if (p.classificacao !== 'FORA_BASE') break
    if (p.lat == null || p.lng == null) break

    const gapSeg = (prevChegadaTs - pSaidaTs) / 1000
    const pDurSeg = p.duracao_seg ?? 0
    const aceitaPorGapCurto = gapSeg <= 10 * 60 && pDurSeg >= 15 * 60
    const aceitaPorGapMedio = gapSeg <= 20 * 60 && pDurSeg >= 30 * 60
    if (!aceitaPorGapCurto && !aceitaPorGapMedio) break

    // Dist sempre do matched original (não acumula deriva entre FORA_BASE).
    const dist = haversine(matched.lat, matched.lng, p.lat, p.lng)
    if (dist > 300) break

    chegadaEstendida = new Date(p.chegada)
    prevChegadaTs = new Date(p.chegada).getTime()
    // Continua iterando para trás — multi-step. Acumula a chegada mais antiga.
  }
  return chegadaEstendida
}
```

- [ ] **Step 4: Ligar no call site e ajustar o override do bloco LOJA+LOJA**

Em `src/lib/kpi/matcher.ts`, no call site (linhas 2199-2200), substituir:

```ts
    let chegadaFinal = matched ? new Date(matched.chegada) : null
    let saidaFinal: Date | null = saidaEstendida ?? (matched?.saida ? new Date(matched.saida) : null)
```

por:

```ts
    let chegadaFinal = matched ? new Date(matched.chegada) : null
    let saidaFinal: Date | null = saidaEstendida ?? (matched?.saida ? new Date(matched.saida) : null)
    // Bug permanência 18/06 (Caxias): visita que COMEÇA fora do raio (cadeia
    // FORA_BASE antes da geofence LOJA). Espelho de estendeSaidaPorForaBase.
    const chegadaEstendida = matched ? estendeChegadaPorForaBase(matched, todasParadas) : null
    if (chegadaEstendida && chegadaFinal && chegadaEstendida.getTime() < chegadaFinal.getTime()) {
      chegadaFinal = chegadaEstendida
    }
```

Em seguida, no bloco LOJA+LOJA, substituir a linha 2218:

```ts
          chegadaFinal = new Date(lojasOrdenadas[inicio].chegada)
```

por (preserva a chegada mais antiga já obtida pela extensão FORA_BASE):

```ts
          const chegadaBloco = new Date(lojasOrdenadas[inicio].chegada)
          if (!chegadaFinal || chegadaBloco.getTime() < chegadaFinal.getTime()) chegadaFinal = chegadaBloco
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/kpi/matcher.test.ts -t "CAXIAS SUL FLUMINENSE UBF5G32"`
Expected: PASS.

- [ ] **Step 6: Rodar a suíte completa de matcher (não-regressão)**

Run: `npx vitest run src/lib/kpi/matcher.test.ts`
Expected: PASS em tudo (Assaí da Task 1 incluído, PREZUNIC/MANILHA/BENTO RIBEIRO e os multi-loja ZONA_SUL). Se o teste "LQU5546" ou outro de bloco LOJA+LOJA quebrar por chegada antecipada indevida, PARAR e reanalisar o critério de distância/gap da extensão backward.

- [ ] **Step 7: Commit**

```bash
git add src/lib/kpi/matcher.ts src/lib/kpi/matcher.test.ts
git commit -m "$(cat <<'EOF'
fix(kpi): estende chegada por FORA_BASE anterior à LOJA (Caxias 18/06)

Visita que começa fora do raio (cadeia FORA_BASE antes da geofence LOJA) tinha
a chegada reportada só a partir do segmento LOJA. Cliente viu 0h36 quando o
real era ~2h42 (chegada 10:25). Espelho de estendeSaidaPorForaBase para trás,
mesmos critérios de gap/distância/duração.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Rebaixar no-show revisável de "não entregou" para "conferir"

**Files:**
- Modify: `src/lib/kpi/status-rota.ts:306-314` (`tierEfetivo`)
- Test: `src/lib/kpi/status-rota.test.ts` (novos casos no `describe('tiers de certeza')`, após a linha 45)

**Interfaces:**
- Consumes: `tierEfetivo(r)`, `TIER_DE_STATUS`, tipo `StatusRota` (já importados no topo de `status-rota.test.ts`).
- Produces: `tierEfetivo` com regra generalizada — qualquer `r` cujo `TIER_DE_STATUS[r.status] === 'nao_entregou'` e `r.revisar === true` retorna `'conferir'`.

**Contexto:** Placa divergente no Unitrac (`placaDivergeUnitrac`, linha 106) devolve `status: 'SEM_RASTREADOR', revisar: true` com mensagem "o veículo TEM rastreador, corrigir a placa no painel". Mas `tierEfetivo` hoje só rebaixa `NAO_FOI_AO_CLIENTE && revisar`, então esse caso aparece como vermelho "Não entregou", contradizendo a própria mensagem. Generalizar elimina o falso negativo (cobre também `SEM_RASTREADOR`/`NAO_SAIU_DA_BASE` revisáveis) e subsume a regra antiga de `NAO_FOI_AO_CLIENTE`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao `describe('tiers de certeza')` em `src/lib/kpi/status-rota.test.ts` (após o teste da linha 43-45):

```ts
  it('tierEfetivo: no-show revisável (placa divergente no Unitrac) cai em conferir', () => {
    // placaDivergeUnitrac → SEM_RASTREADOR + revisar=true. Não é "não entregou":
    // o veículo tem rastreador, é placa errada no cadastro.
    expect(tierEfetivo({ status: 'SEM_RASTREADOR', revisar: true })).toBe('conferir')
    expect(tierEfetivo({ status: 'NAO_SAIU_DA_BASE', revisar: true })).toBe('conferir')
  })
  it('tierEfetivo: no-show NÃO revisável continua não-entregou', () => {
    expect(tierEfetivo({ status: 'SEM_RASTREADOR', revisar: false })).toBe('nao_entregou')
    expect(tierEfetivo({ status: 'NAO_SAIU_DA_BASE', revisar: false })).toBe('nao_entregou')
  })
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/kpi/status-rota.test.ts -t "no-show revisável"`
Expected: FAIL. Hoje `SEM_RASTREADOR`/`NAO_SAIU_DA_BASE` com `revisar=true` retornam `'nao_entregou'`.

- [ ] **Step 3: Generalizar `tierEfetivo`**

Em `src/lib/kpi/status-rota.ts`, substituir o corpo de `tierEfetivo` (linhas 307-313):

```ts
  if (r.categoria === 'RELATORIO_PARCIAL') return 'conferir'
  const base = TIER_DE_STATUS[r.status]
  // Geo fora do raio (revisar) e no-show revisável (placa entregou própria escala /
  // rastreador travado) viram "conferir" — não são certezas pra cima nem pra baixo.
  if (r.status === 'ENTREGUE_GEO' && r.revisar) return 'conferir'
  if (r.status === 'NAO_FOI_AO_CLIENTE' && r.revisar) return 'conferir'
  return base
```

por:

```ts
  if (r.categoria === 'RELATORIO_PARCIAL') return 'conferir'
  const base = TIER_DE_STATUS[r.status]
  // Geo fora do raio com revisar não é certeza pra cima.
  if (r.status === 'ENTREGUE_GEO' && r.revisar) return 'conferir'
  // Qualquer "não entregou" marcado para revisão é incerteza, não negativa
  // definitiva: cai em "conferir". Cobre placa divergente no cadastro Unitrac
  // (SEM_RASTREADOR+revisar, ex.: KWV-7E49 x KWV-7E89), NAO_FOI_AO_CLIENTE
  // revisável e loja sem cadastro/ambígua que caiu em NAO_SAIU_DA_BASE.
  if (base === 'nao_entregou' && r.revisar) return 'conferir'
  return base
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/kpi/status-rota.test.ts`
Expected: PASS em tudo. O teste existente "geo fora do raio e no-show revisável caem em conferir" (NAO_FOI_AO_CLIENTE+revisar → conferir, linha 41) continua verde pois é subsumido pela nova regra.

- [ ] **Step 5: Verificação de tipo e build**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Suíte completa do projeto**

Run: `npx vitest run`
Expected: todos verdes (linha de base 344+ testes, mais os 4 novos das Tasks 1-3).

- [ ] **Step 7: Commit**

```bash
git add src/lib/kpi/status-rota.ts src/lib/kpi/status-rota.test.ts
git commit -m "$(cat <<'EOF'
fix(kpi): rebaixa no-show revisável para "conferir" em tierEfetivo

Placa divergente no Unitrac (SEM_RASTREADOR+revisar) aparecia como vermelho
"não entregou" mesmo o sistema dizendo que o veículo tem rastreador e é só
corrigir a placa. Generaliza a regra: qualquer tier "não entregou" com
revisar=true cai em "conferir". Subsume a regra antiga de NAO_FOI_AO_CLIENTE.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Validação final (após Tasks 1-3)

- [ ] **Validar no dado real do dia 18/06 (sem MCP, script direto):**

Run: `npx tsx scripts/dev/repro-perm-18.mts`
Expected: para `SFG2F72` a parada da rota mostra chegada ~05:29 e saída ~12:18 (permanência ≈6h49); para `UBF5G32` chegada ~10:25 e saída ~13:07 (≈2h42). Confirma a correção contra o relatório real, não só fixtures.

## Próximo plano (subsistema separado, não incluído aqui)

Relatório diagnóstico de cadastro em XLSX — Frente 2 (placas Mercosul/divergentes não casadas: 9 do dia 18/06, ex. `MQV9D14`, `KWV7E49`) + Frente 3 Camada 2 (`src/lib/kpi/diagnostico-cadastro.ts`). Produz lista de ações de cadastro (placa a corrigir no Unitrac, loja sem código/geo) exportada em XLSX reaproveitando o modelo oficial (`gerador-kpi.ts`). Requer leitura prévia do gerador XLSX para escrever passos sem placeholder; recebe plano próprio em seguida.

## Self-Review

**1. Cobertura do spec (frentes deste plano):**
- Frente 1 (permanência 18/06): Task 1 cobre Assaí Barra (LOJA longa + FORA_BASE forward); Task 2 cobre Caxias Sul Fluminense (FORA_BASE backward). ✅
- Frente 3 Camada 1 (rebaixar falsos "não foi"): Task 3 generaliza `tierEfetivo`. ✅
- Frente 2 + Frente 3 Camada 2 (diagnóstico XLSX): explicitamente fora deste plano, com justificativa de subsistema separado e achado-chave registrado (placaDivergeUnitrac já detecta o caso Mercosul). ✅
- Achado da Frente 2 (conversão Mercosul correta, caso `KWV` é placa divergente): refletido na Camada 1 (Task 3) que remove o sintoma vermelho. ✅

**2. Varredura de placeholders:** Sem TBD/TODO. Todo step de código mostra o código exato; todo step de teste tem o teste completo; todos os comandos têm saída esperada concreta. ✅

**3. Consistência de tipos:** `estendeChegadaPorForaBase` espelha a assinatura de `estendeSaidaPorForaBase` (`(matched: UnitracParadaRow, todasParadas: UnitracParadaRow[]): Date | null`). `tierEfetivo` mantém a assinatura existente (`Pick<ResultadoStatus,...> & { categoria? }`). Fixtures usam `EscalaLinhaRow`/`UnitracParadaRow`/`LojaRow` no mesmo shape dos testes "Bug 6" existentes. `chegadaFinal`/`saidaFinal`/`duracao_min` batem com a montagem das linhas 2225-2237. ✅
