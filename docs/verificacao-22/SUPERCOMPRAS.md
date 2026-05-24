# Análise SUPERCOMPRAS — Dia 22/05/2026

> Análise completa com 7 checks (ver `CHECKLIST.md`)

## Sumário

- **Data:** 2026-05-22
- **Rede:** SUPERCOMPRAS
- **Escala:** 1 linha(s)
- **Alterações:** 0
- **Unitrac:** 212 veículos, 2148 paradas
- **KPI gerado:** KPI-SUPERCOMPRAS-2026-05-22 (1).xlsx (1 linhas)

## Check 1 — Motorista (escala vs KPI)

✓ Todos motoristas batem com a escala.

## Check 2 — Contagem global (escala vs KPI)

- Escala: 1 lojas distintas
- KPI: 1 lojas
✓ Contagens batem exatamente.

## Check 3 — Alterações aplicadas

Sem alterações para esta rede.

## Check 4 — Colunas extras do KPI Excel

Cabeçalhos detectados: [1] REDES / FILIAIS | [2] MOTORISTA | [3] COD | [4] PLACA | [5] SAIDA CD | [6] CHD LOJA | [7] SAIDA LOJA | [8] MOTORISTA | [9] COD | [10] PLACA | [11] SAIDA CD | [12] CHD LOJA | [13] SAIDA LOJA | [14] TEMPO EM LOJA 1 | [15] TEMPO EM LOJA 2

1 loja(s) com dados em colunas extras:
  - **SUPERCOMPRAS - COSMOS**: TEMPO EM LOJA 1=00:08, TEMPO EM LOJA 2=00:00

## Check 5 — Lat/lng das paradas (vs cadastro)

✓ Todas paradas dentro do raio cadastrado (com margem 1.5x).

## Check 6 — Ambos slots da linha do KPI

✓ Slots batem com escala.

## Check 7 — SC/CHD/SL: matcher (rodado agora) vs KPI gerado

⚠ **1 divergência(s) entre matcher local e KPI gerado:**
- **SUPERCOMPRAS - COSMOS** (c1): matcher=---/00:05/23:56 | KPI=12:53/13:33/13:41

_Pode indicar que o KPI foi gerado com versão antiga do código. Regerar deve corrigir._

## Detalhe — Loja por loja

### SUPERCOMPRAS - COSMOS
- **c1**: RAFAEL SOARES | EYL8B91
  - Escala: motorista=RAFAEL SOARES placa=EYL8B91
  - KPI: motorista=RAFAEL SOARES placa=EYL-8B91 | SC=12:53 CHD=13:33 SL=13:41
  - Matcher: SC=--- CHD=00:05 SL=23:56
  - GPS LOJA: 00:05-04:28 [23080000] MERCADO SANTO AGOSTINHO - BARR | 04:34-05:01 [23080000] MERCADO SANTO AGOSTINHO - BARR | 05:48-07:01 [23080000] MERCADO SANTO AGOSTINHO - BARR | 07:40-07:57 [23080000] MERCADO SANTO AGOSTINHO - BARR | 08:06-12:07 [23080000] MERCADO SANTO AGOSTINHO - BARR | 12:17-12:53 [23080000] MERCADO SANTO AGOSTINHO - BARR | 13:02-13:06 [23080000] MERCADO SANTO AGOSTINHO - BARR | 13:33-13:41 [23080000] MERCADO SANTO AGOSTINHO - BARR | 14:03-16:43 [23080000] MERCADO SANTO AGOSTINHO - BARR | 16:47-16:51 [23080000] MERCADO SANTO AGOSTINHO - BARR | 16:52-16:56 [23080000] MERCADO SANTO AGOSTINHO - BARR | 17:24-17:28 [23080000] MERCADO SANTO AGOSTINHO - BARR | 18:49-23:56 [23080000] MERCADO SANTO AGOSTINHO - BARR

## Problemas identificados

- Check 7: 1 timestamps divergentes (matcher vs KPI)
