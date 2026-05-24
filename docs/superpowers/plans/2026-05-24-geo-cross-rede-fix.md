# KPI Matcher — Geo Cross-Rede Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminar FP e FN cross-rede no geo fallback e T18, garantindo que paradas FORA_BASE e LOJA só matchem lojas da rede correta.

**Architecture:** Três mudanças cirúrgicas em `src/lib/kpi/matcher.ts`. Nenhum novo arquivo. O `lojas` array já contém TODAS as redes — o parâmetro está disponível nos três pontos de edição.

**Tech Stack:** TypeScript, matcher.ts, Supabase (lojas DB), vitest

---

### Task 1: Fix 1 — Geo Exclusividade (linha ~831)

**Files:**
- Modify: `src/lib/kpi/matcher.ts:831-854`

- [ ] **Implementar geo exclusividade**

Substituir o bloco atual (linhas 831–854):

```typescript
// Geo-R guard: se o veículo tem paradas LOJA não atribuídas a nenhuma linha
// (órfãs), é sinal de que ele entregou em outra rede. Usar FORA_BASE dele para
// geo-match seria FP cross-rede.
// Caso TML3B11: LOJA parada = PREZUNIC TIJUCA (não bate código VIANENSE) →
// parada órfã → pula geo fallback para linhas VIANENSE.
const temLojaOrfa = todas.some(p => p.classificacao === 'LOJA' && !usados.has(p.id))

const usadosGeo = new Set<number>()
for (const linha of linhasAindaSemMatch) {
  // Geo-R: pula se veículo tem LOJA órfã (entregou em outra rede → FP)
  if (temLojaOrfa) continue

  // Pra cada linha sem match, procura parada FORA_BASE próxima de loja
  // cadastrada da MESMA REDE (operacional ou canonical).
  const lojasDaRede: GeoStore[] = lojas
    .filter(l => l.rede_id === linha.rede_id && l.lat != null && l.lng != null)
    .map(l => ({ id: l.id, name: l.nome, lat: l.lat as number, lng: l.lng as number, raio_metros: l.raio_metros }))
  // Canonical_loja não tem rede_id no GeoStore — entra como pool geral
  // mas só será usado se nenhuma loja operacional da rede bater.
  let melhorIdx = -1
  for (let j = 0; j < paradasForaBase.length; j++) {
    if (usadosGeo.has(j)) continue
    const p = paradasForaBase[j]
    const bateRedeEspecifica = resolveForaBaseGeo(p.lat!, p.lng!, lojasDaRede) !== null
    const bateCanonical = !bateRedeEspecifica && (geoStores ?? []).length > 0
      && resolveForaBaseGeo(p.lat!, p.lng!, geoStores!) !== null
    if (bateRedeEspecifica || bateCanonical) {
      melhorIdx = j
      break
    }
  }
  if (melhorIdx >= 0) {
    matchByEscalaId.set(linha.id, paradasForaBase[melhorIdx])
    usados.add(paradasForaBase[melhorIdx].id)
    usadosGeo.add(melhorIdx)
    geoMatchedLineIds.add(linha.id)
  }
}
```

Por:

```typescript
// Geo-R guard (refined): bloqueia geo apenas se o veículo tem LOJA órfã de
// OUTRA rede (codigo_loja não está no catálogo da rede atual). Veículos que
// entregam em múltiplas redes podem ter LOJA parada de outra rede mas ainda
// precisam de geo para as lojas desta rede (FORA_BASE sem LOJA cadastrada).
const redeAtual = linhas[0]?.rede_id ?? ''
const codigosRedeAtual = new Set(
  lojas.filter(l => l.rede_id === redeAtual).map(l => l.codigo_unitrac).filter((c): c is string => !!c)
)
const temLojaOrfaCrossRede = todas.some(p =>
  p.classificacao === 'LOJA' &&
  !usados.has(p.id) &&
  !!p.codigo_loja &&
  !codigosRedeAtual.has(p.codigo_loja)
)

// Lojas de OUTRAS redes para exclusividade geográfica:
// uma parada FORA_BASE que cai dentro do raio de uma loja de outra rede é
// território disputado — não usar (FP cross-rede).
const lojasOutrasRedes: GeoStore[] = lojas
  .filter(l => l.rede_id !== redeAtual && l.rede_id && l.lat != null && l.lng != null)
  .map(l => ({ id: l.id, name: l.nome, lat: l.lat as number, lng: l.lng as number, raio_metros: l.raio_metros }))

const usadosGeo = new Set<number>()
for (const linha of linhasAindaSemMatch) {
  // Geo-R: pula se veículo tem LOJA órfã cross-rede
  if (temLojaOrfaCrossRede) continue

  const lojasDaRede: GeoStore[] = lojas
    .filter(l => l.rede_id === linha.rede_id && l.lat != null && l.lng != null)
    .map(l => ({ id: l.id, name: l.nome, lat: l.lat as number, lng: l.lng as number, raio_metros: l.raio_metros }))

  let melhorIdx = -1
  for (let j = 0; j < paradasForaBase.length; j++) {
    if (usadosGeo.has(j)) continue
    const p = paradasForaBase[j]
    const bateRedeEspecifica = resolveForaBaseGeo(p.lat!, p.lng!, lojasDaRede) !== null
    // Geo exclusividade: rejeita parada que também cai dentro do raio de outra rede
    const contaminadaCrossRede = bateRedeEspecifica
      && resolveForaBaseGeo(p.lat!, p.lng!, lojasOutrasRedes) !== null
    const bateCanonical = !bateRedeEspecifica && (geoStores ?? []).length > 0
      && resolveForaBaseGeo(p.lat!, p.lng!, geoStores!) !== null
      && resolveForaBaseGeo(p.lat!, p.lng!, lojasOutrasRedes) === null
    if ((bateRedeEspecifica && !contaminadaCrossRede) || bateCanonical) {
      melhorIdx = j
      break
    }
  }
  if (melhorIdx >= 0) {
    matchByEscalaId.set(linha.id, paradasForaBase[melhorIdx])
    usados.add(paradasForaBase[melhorIdx].id)
    usadosGeo.add(melhorIdx)
    geoMatchedLineIds.add(linha.id)
  }
}
```

- [ ] `npx tsc --noEmit` — zero erros

### Task 2: Fix 2 — Refinar T18-Orphan guard (linha ~1010)

**Files:**
- Modify: `src/lib/kpi/matcher.ts:1001-1013`

- [ ] **Refinar T18-Orphan para cross-rede only**

Substituir linhas 1001–1013:

```typescript
// T18-Orphan: exclui linhas cujo veículo tem parada LOJA não atribuída a nenhuma
// escala_linha (parada "órfã"). Indica que o veículo entregou em outra rede mas
// não nas lojas desta escala; T18 buscaria parada de outro veículo perto da loja
// e produziria FP (caso TML3B11: LOJA=PREZUNIC TIJUCA, escala=VIANENSE).
const matchedParadaIds = new Set([...matchByEscalaId.values()].map(p => p.id))
const semGpsLines = escalaLinhas.filter(l => {
  if (!l.placa_norm || matchByEscalaId.has(l.id)) return false
  const placaRes = resolvePlacaUnitrac(l.placa_norm)
  if (!placaRes) return false
  // T18-Orphan: pula se veículo tem LOJA órfã
  const paradaDoVeiculo = paradaByPlaca.get(placaRes) ?? []
  if (paradaDoVeiculo.some(p => p.classificacao === 'LOJA' && !matchedParadaIds.has(p.id))) return false
  return true
})
```

Por:

```typescript
// T18-Orphan (refined): exclui linhas cujo veículo tem parada LOJA órfã de
// OUTRA rede. Caso TML3B11: LOJA=PREZUNIC TIJUCA (codigo fora do catálogo
// VIANENSE) → órfã cross-rede → T18 bloqueado. Veículos com LOJA órfã da
// própria rede (hybrid falhou por outro motivo) continuam sendo candidatos T18.
const matchedParadaIds = new Set([...matchByEscalaId.values()].map(p => p.id))
const redeAtualT18 = escalaLinhas[0]?.rede_id ?? ''
const codigosRedeT18 = new Set(
  lojas.filter(l => l.rede_id === redeAtualT18).map(l => l.codigo_unitrac).filter((c): c is string => !!c)
)
const semGpsLines = escalaLinhas.filter(l => {
  if (!l.placa_norm || matchByEscalaId.has(l.id)) return false
  const placaRes = resolvePlacaUnitrac(l.placa_norm)
  if (!placaRes) return false
  // T18-Orphan: pula se veículo tem LOJA órfã de OUTRA rede (cross-rede)
  const paradaDoVeiculo = paradaByPlaca.get(placaRes) ?? []
  const temOrfaCrossRede = paradaDoVeiculo.some(p =>
    p.classificacao === 'LOJA' &&
    !matchedParadaIds.has(p.id) &&
    !!p.codigo_loja &&
    !codigosRedeT18.has(p.codigo_loja)
  )
  if (temOrfaCrossRede) return false
  return true
})
```

- [ ] `npx tsc --noEmit` — zero erros

### Task 3: Rodar análise completa

- [ ] Rodar análise todas as redes e comparar antes vs. depois
- [ ] `npx vitest run` — 263 passed
- [ ] Commit

### Task 4: Commit e push

```bash
git add src/lib/kpi/matcher.ts
git commit -m "fix(matcher): geo exclusividade cross-rede + guards refinados"
git push
```
