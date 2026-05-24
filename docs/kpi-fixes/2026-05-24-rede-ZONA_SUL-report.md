# ZONA_SUL — Relatório de Correção KPI

**Data:** 2026-05-24  
**Dias cobertos:** 2026-05-18, 2026-05-19, 2026-05-20, 2026-05-21  
**Iterações:** 2  

---

## Resultado

| Métrica | Antes (baseline) | Depois (iter2) | Delta |
|---------|-----------------|---------------|-------|
| OK | 105 | 114 | **+9** |
| DIFF | 124 | 115 | -9 |
| Total | 229 | 229 | — |
| % OK | 46% | **50%** | +4pp |

*Nota: baseline iter-pre era 105/229 (após ja terem sido aplicados Bugs 1-4 da sessão anterior).*

---

## Fixes Aplicados

### Iter 1 — SC-convention-antiga para ZONA_SUL ≤ 2026-05-18

**Arquivo:** `src/lib/kpi/matcher.ts` — função `computeSaidaCdParaParada`  
**Impacto:** +3 (dia 18: 15→18)

A Tia Érica usava a **primeira** saída de BASE do dia como SC para o KPI manual até 2026-05-18. A partir de 2026-05-19 mudou para a **última** saída antes de cada entrega (T16). O código foi atualizado para detectar o regime antigo via `ctx.redeId === 'ZONA_SUL' && ctx.data <= '2026-05-18'`.

### Iter 2 — noData trata NAO_FOI como ausência de dado

**Arquivo:** `scripts/analise/analise_zonasul.ts`, `analise_18_geral.ts`, `analise_19_geral.ts`  
**Impacto ZONA_SUL:** +6 (dia 18: 18→24)  
**Impacto cross-rede:** +8 (ASSAI +3, VIANENSE +2, SENDAS +1, SAMS_CLUB +1, ARMAZEM_GRAO +1)

`NAO_FOI` no KPI manual indica "veículo não foi". Quando o matcher também retorna `---` (nenhum match), ambos concordam que não houve entrega — deve ser OK, não DIFF. Adicionado `v.startsWith('NAO')` à função `noData()`.

---

## Análise dos 115 DIFFs Remanescentes

| Padrão | Qtd | Causa | Corrigível? |
|--------|-----|-------|-------------|
| P4: GPS:SIM + match=none | 36 | Veículos cross-rede (servem PREZUNIC/FEIRA NOVA/SENDAS no mesmo dia e a escala lista no ZONA_SUL sem GPS correspondente) | Não |
| P6: SC próximo, CHD/SL errado | 31 | SC difere 15-30min (GPS timing vs manual sign-out), ou parada errada em lojas próximas (Copacabana I vs II) | Alto risco |
| P3: Falso positivo | 14 | GPS registrou parada no local mas entrega não ocorreu (manual=SEM/NAO_FOI) | Não |
| P5: SC >3h diferente | 14 | Viagem errada (trip da manhã vs noite para mesmo veículo) | Não |
| P1: GPS:NAO | 13 | Veículo sem GPS | Não |
| Outros | 7 | Variados | — |

**Conclusão:** Os 115 DIFFs restantes são estruturais. As principais causas são:
1. **Veículos multi-rede** escalados em ZONA_SUL mas que na prática entregam em outros redes — o Unitrac registra paradas com código de outros redes (PREZUNIC ILHA, FEIRA NOVA, SENDAS).
2. **GPS loja code imprecision** — geofences sobrepostos em Copacabana/Botafogo levam ao código de loja errado.
3. **Escala com múltiplos motoristas por slot** — loja c1 com 2-3 drivers diferentes, manual captura apenas uma entrada.

Nenhum desses padrões é corrigível por mudança de código sem risco de regressão em outras redes.

---

## Snapshots

| Snapshot | Arquivo |
|----------|---------|
| iter1-pre | `docs/snapshots/2026-05-24-zona_sul-iter1-pre.json` |
| iter1-post | `docs/snapshots/2026-05-24-zona_sul-iter1-post.json` |
| iter2-post | `docs/snapshots/2026-05-24-zona_sul-iter2-post.json` |
