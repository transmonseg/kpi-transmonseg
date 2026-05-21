# Design: Correções TDD Sequenciais — Pipeline KPI

**Data:** 2026-05-20
**Abordagem:** TDD Red → Green por bug, um de cada vez
**Escopo:** 5 bugs identificados no mega-audit do pipeline KPI

---

## Contexto

O pipeline KPI gera planilhas de desempenho de entrega cruzando escalas de motoristas com dados GPS (Unitrac). O mega-audit identificou 5 bugs que causam silêncio em anomalias críticas, datas erradas, e alterações duplicadas.

---

## Ciclo de execução

Para cada bug:
1. **RED** — escrever teste Vitest que falha com o código atual
2. **GREEN** — corrigir o código mínimo para o teste passar
3. **REGRESSÃO** — rodar `npx vitest run` (todos os testes devem passar)
4. Próximo bug

---

## Bug 1 — ANOM-01: GPS existe mas não casou (UNMATCHED silencioso)

**Arquivo:** `src/lib/kpi/anomalia.ts` linha 71
**Severidade:** Alta

**Comportamento atual:**
ANOM-01 dispara apenas quando `!paradasIndex.has(placa)` (placa completamente ausente do GPS). Quando o GPS tem a placa mas o matcher falhou em casar qualquer parada com a escala (rota.paradas = []), nenhuma anomalia é gerada.

**Comportamento esperado:**
Se a placa tem GPS mas zero paradas casaram, deve disparar ANOM-01 com `tem_gps: true` e `severidade: 'HIGH'`.

**Fix:**
Adicionar `else` branch no bloco ANOM-01:
```typescript
const temParadas = paradasIndex.has(rota.placa_norm)
if (!temParadas) {
  // ANOM-01 sem GPS
} else {
  // ANOM-01 com GPS mas UNMATCHED
  anomalias.push({ ..., payload: { placa, tem_gps: true } })
}
```

**Teste (arquivo `src/lib/kpi/anomalia.test.ts`):**
- Rota com `paradas: []`, placa presente no `paradasIndex` → deve gerar ANOM-01 (HIGH, tem_gps: true)
- Rota com `paradas: []`, placa AUSENTE do `paradasIndex` → deve gerar ANOM-01 (HIGH, tem_gps: false)
- Rota com `status: 'sem_entrega'` → NÃO gera ANOM-01

---

## Bug 2 — Dedup alterações sem placa aplica 2x

**Arquivo:** `src/app/api/kpi/simples/route.ts` linhas 267-289
**Severidade:** Alta

**Comportamento atual:**
A deduplicação de alterações usa `placa_norm` como chave. Quando `!entraPlaca || !dbEntraPlaca`, retorna `false` → nunca deduplica. Resultado: alteração só-motorista enviada inline E salva no banco é aplicada duas vezes a `escalaLinhas`.

**Comportamento esperado:**
Quando não há placa em nenhum dos lados, deduplica por `motorista_nome + rede_id`.

**Fix:**
```typescript
// Fallback: motorista + rede quando sem placa
const entraMot = a.entra?.motorista_nome?.toLowerCase().trim()
const dbEntraMot = dbAlt.entra?.motorista_nome?.toLowerCase().trim()
if (!entraMot || !dbEntraMot) return false
return entraMot === dbEntraMot && saiMot === dbSaiMot && a.rede_id === dbAlt.rede_id
```

**Teste:** Extrair a lógica de dedup para função pura `deduplicaAlteracoes(inline: AltConfirmada[], db: AltConfirmada[]): AltConfirmada[]`. Testar: inline com motorista X (sem placa) + db com mesmo motorista X mesma rede → resultado deve ter 1 entrada, não 2.

---

## Bug 3 — tabToDate defaults hardcoded

**Arquivo:** `src/lib/parsers/escala-pax.ts` linha 114
**Severidade:** Média

**Comportamento atual:**
`function tabToDate(tabName: string, ano = 2026, mes = 5)` — se chamada sem `ano`/`mes`, usa 2026 e maio independente da data real.

**Comportamento esperado:**
Parâmetros obrigatórios. `detectYearMonth` já tem fallback `new Date()` antes de chamar `tabToDate`.

**Fix:**
```typescript
function tabToDate(tabName: string, ano: number, mes: number): string
```

**Teste:** `tabToDate('15', 2025, 3)` → `"2025-03-15"`. `tabToDate('05', 2024, 12)` → `"2024-12-05"`.

---

## Bug 4 — loja_codigo_raw sem zero-pad no MATRIZ

**Arquivo:** `src/lib/parsers/escala-zona-sul.ts` linha 309
**Severidade:** Média

**Comportamento atual:**
Formato compacto (`parseFormatoCompacto`) usa `d1Key` ("04"). Formato MATRIZ armazena o raw ("4") em `loja_codigo_raw`. O matcher pode falhar ao comparar "4" com "04" no `scorePair`.

**Comportamento esperado:**
`loja_codigo_raw` sempre zero-padded para 2 dígitos em ambos os formatos.

**Fix:**
Antes de atribuir `loja_codigo_raw: loja`, computar:
```typescript
const lojaCodNorm = /^\d$/.test(loja.trim()) ? `0${loja.trim()}` : loja.trim()
```

**Teste:** Parse de linha MATRIZ com filial "4" → `loja_codigo_raw === "04"`.

---

## Bug 5 — ANOM-04: duração zero não detectada

**Arquivo:** `src/lib/kpi/anomalia.ts` linhas 121-150
**Severidade:** Média

**Comportamento atual:**
`parada.saida < parada.chegada` nunca é verdadeiro quando o matcher fez `saida = chegada` (fallback para `matched.saida === null`). Durações zero passam silenciosas.

**Comportamento esperado:**
Quando `duracao_min === 0` e `saida.getTime() === chegada.getTime()`, disparar ANOM-04 com `severidade: 'MEDIUM'` (dado incompleto, não GPS corrompido).

**Fix:**
```typescript
} else if (parada.duracao_min === 0 && parada.saida.getTime() === parada.chegada.getTime()) {
  anomalias.push({ codigo: 'ANOM-04', severidade: 'MEDIUM', ... })
}
```

**Teste:** Parada com `saida === chegada` e `duracao_min: 0` → deve gerar ANOM-04 (MEDIUM).

---

## Arquivos impactados

| Arquivo | Bugs | Testes |
|---------|------|--------|
| `src/lib/kpi/anomalia.ts` | 1, 5 | `anomalia.test.ts` |
| `src/app/api/kpi/simples/route.ts` | 2 | `route.test.ts` (novo) |
| `src/lib/parsers/escala-pax.ts` | 3 | `escala-pax.test.ts` (novo) |
| `src/lib/parsers/escala-zona-sul.ts` | 4 | `escala-zona-sul.test.ts` (novo) |

---

## Critério de conclusão

- Todos os 5 testes RED → GREEN
- Suite completa `npx vitest run` sem falhas
- Nenhum teste existente quebrado
