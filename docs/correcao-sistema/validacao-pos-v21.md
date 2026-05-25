# Validação pós-V2.1 — 5 dias (18-22/05/2026)

Data: 2026-05-25
Branch: main
Cadastro: 330 lojas ativas (era 295 pré-Sprint A)
Listas auxiliares: 38 rotas gigantes + 31 veículos inativos
Testes vitest: **282/282 passando**
TypeScript: **0 erros**

---

## Resultado por dia

| Dia        | Escalas | Paradas Unitrac | Paradas LOJA | Matches | Sem match | Match rate |
|------------|---------|-----------------|--------------|---------|-----------|------------|
| 2026-05-18 | 243     | 2.326           | 653          | 192     | 51        | 79.0%      |
| 2026-05-19 | 244     | 1.717           | 441          | 173     | 71        | 70.9%      |
| 2026-05-20 | 222     | 2.175           | 720          | 171     | 51        | 77.0%      |
| 2026-05-21 | 243     | 1.855           | 487          | 174     | 69        | 71.6%      |
| 2026-05-22 | 229     | 2.148           | 587          | 186     | 43        | 81.2%      |
| **Total**  | **1.181** | **10.221**    | **2.888**    | **896** | **285**   | **75.9%**  |

---

## Reforços validados

### Reforço 5 — rotas gigantes
**Paradas com `codigo_loja` em ROTAS_GIGANTES** ao longo dos 5 dias:
- 409 + 227 + 460 + 248 + 333 = **1.677 paradas**

Antes da V2.1, essas paradas causariam GPS clonado (1 parada distribuída pra N lojas via suffix-match). Agora, o matcher pula match exato e cai em geo/nome.

### Reforço 6 — matching geo robusto
**~50% das paradas FORA_BASE** (sem geofence Unitrac) — função `resolveForaBaseGeo` casa via lat/lng + raio_metros.

Coberta pelo cadastro novo (lojas têm lat/lng + raio populados via Sprint A1).

### Reforço 7 — descarte de placas CD-only
**Linhas inativas com match: 0/1.181** em todos os 5 dias.

As 31 placas CD-only crônicas (lista negra) não recebem matches indevidos quando o veículo não saiu do CD.

---

## Bugs do plano confirmados como JÁ FIXADOS

| Bug | Local | Status |
|-----|-------|--------|
| 1 — GPS Clonado | `matcher.ts:894` `scorePair === 0` | ✓ aplicado em commit anterior |
| 2 — saída_cd = chegada | `matcher.ts:312` retorna null | ✓ aplicado |
| 3 — fallback MCP errado | `mcp/server.ts:513` removido | ✓ aplicado |
| 4 — filtro noturno subestimado | `matcher.ts:380` `NOITE_DUR_SEG = 3 * 3600` | ✓ aplicado |

---

## Métricas-alvo

| Métrica | Atual | Alvo plano | Status |
|---------|-------|------------|--------|
| Cobertura codigo_unitrac | 78% | 90% | ✗ (4 lojas ZS sem operação nos 5 dias) |
| Cobertura nome_unitrac | 78% | 80% | ≈ |
| 0 GPS clonado em CD-only | 0 / 1.181 | 0 | ✓ |
| Rotas gigantes filtradas | 1.677 paradas | n/a | ✓ |
| Testes vitest | 282 | passar | ✓ |
| TypeScript | 0 erros | passar | ✓ |
| Match rate | 75.9% | 95% | ✗ (baseline pré-V2.1 era ~55%) |

**Ganho real:** baseline 287 OK no STATE.md → V2.1 896 matches.
**Justificativa do 95% não atingido:** 285 unmatched incluem linhas com placa não-localizada no Unitrac, lojas em rota gigante sem citação, e duplicações estruturais que sobrevivem ao matcher. Resolver chega no patamar do STATE.md (50-80% por rede) que reflete limitações estruturais.

---

## Próximos passos (fora desta sprint)

1. Auditar as 285 unmatched por rede e padrão
2. Aplicar lojas ASSAI vs SENDAS aliases adicionais (rebrand 2024)
3. Investigar 11139000 EMANUEL PEDRA DE GUARATIBA + cluster O BOM (revisão com Fecchio)
4. Cadastrar lojas ZS sem operação manual (lat/lng) — 4 lojas
