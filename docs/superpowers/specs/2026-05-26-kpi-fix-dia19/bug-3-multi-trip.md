# Bug 3 — Multi-trip: sys pega parada errada (manhã vs noite)

## Causa raiz hipotética

Quando placa faz **2+ viagens no dia** (manhã + tarde, ou tarde + noite), o algoritmo de assignment matricial em `matcher.ts:728+` minimiza score TOTAL e pode escolher parada do horário ERRADO pra cada loja.

Hipótese específica: o assignment não considera proximidade temporal entre paradas de mesma loja-rede. Manual sabe que Loja 47 dia 19 foi entregue 19:40, sys pega 11:09 da manhã pq aquela parada tem score igualmente bom.

## Evidência (dia 19)

| Rede | Loja | Manual CHD | Gerado CHD | Δ |
|------|------|-----------|------------|---|
| ZS | 22 S.Conrado | 21:10 | **11:09** | 540min |
| ZS | 25 Jd.Botânico | 20:15 | **11:09** | 540min |
| ZS | 47 Catete | 19:40 | **11:09** | 510min |
| ASSAI | Santa Cruz 2 | 06:00 | **12:33** | 393min |
| ARMAZEM | REGINA BARRA | 15:40 | **14:20** | 80min |
| ARMAZEM | REGINA 1 DE MAIO | 14:20 | **15:38** | 78min |

**Total:** 17 lojas afetadas.

## Solução proposta

**Adicionar heurística de "horário esperado":**
- Se a escala tem `turno` ou ordem de carregamento, usar isso como hint
- Quando placa tem N paradas LOJA pra mesma rede, preferir cronologia (1ª loja escala → 1ª parada cronológica)
- Penalizar paradas "isoladas" (com gap >2h da operação dominante da placa)

**Investigar com `diagnose`:** rodar o matcher com caso ZS Loja 47 dia 19 e identificar onde o assignment troca.

## Arquivos a tocar

- `src/lib/kpi/matcher.ts` linha 728+ (`dfsAssign`/Hungarian-like)
- Possivelmente adicionar campo `ordem_cronologica` nas paradas e considerar no scorer

## Critério de aceite (tolerante — bug de timing)

- [ ] ZS Loja 47 dia 19: CHD entre 19:33-19:47 (manual=19:40 ±7)
- [ ] ZS Loja 22, 25: CHD entre 21:03-21:17 e 20:08-20:22
- [ ] ARMAZEM REGINA BARRA dia 19: CHD entre 15:33-15:47
- [ ] Nenhuma das 17 lojas regride pra Δ>30min

## Teste vitest

Caso minimal: placa com 2 paradas LOJA (manhã + noite), 2 linhas escala mesma loja → assignment respeita cronologia.

## Rollback

`git revert` + verificar que nenhuma loja com multi-trip correto antes virou bug.

## Status

🔍 Aguardando investigação (depois de Bug 1 e 2)
