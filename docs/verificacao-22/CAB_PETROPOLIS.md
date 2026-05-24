# Análise CAB_PETROPOLIS — Dia 22/05/2026

> Análise completa com 7 checks (ver `CHECKLIST.md`)

## Sumário

- **Data:** 2026-05-22
- **Rede:** CAB_PETROPOLIS
- **Escala:** 1 linha(s)
- **Alterações:** 0
- **Unitrac:** 212 veículos, 2148 paradas
- **KPI gerado:** KPI-CAB_PETROPOLIS-2026-05-22 (1).xlsx (1 linhas)

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
  - **CAB - PETRÓPOLIS**: TEMPO EM LOJA 1=09:08, TEMPO EM LOJA 2=00:00

## Check 5 — Lat/lng das paradas (vs cadastro)

✓ Todas paradas dentro do raio cadastrado (com margem 1.5x).

## Check 6 — Ambos slots da linha do KPI

✓ Slots batem com escala.

## Check 7 — SC/CHD/SL: matcher (rodado agora) vs KPI gerado

⚠ **1 divergência(s) entre matcher local e KPI gerado:**
- **CAB - PETRÓPOLIS** (c1): matcher=---/00:00/13:14 | KPI=13:14/14:49/23:57

_Pode indicar que o KPI foi gerado com versão antiga do código. Regerar deve corrigir._

## Detalhe — Loja por loja

### CAB - PETRÓPOLIS
- **c1**: ZOZIMO | KNS8D26
  - Escala: motorista=ZOZIMO placa=KNS8D26
  - KPI: motorista=ZOZIMO placa=KNS-8D26 | SC=13:14 CHD=14:49 SL=23:57
  - Matcher: SC=--- CHD=00:00 SL=13:14
  - GPS LOJA: 00:00-03:45 [7012010] CAB - PETROPOLIS | 04:41-05:03 [7012010] CAB - PETROPOLIS | 05:09-05:18 [7012010] CAB - PETROPOLIS | 07:07-07:15 [7012010] CAB - PETROPOLIS | 07:15-07:55 [7012010] CAB - PETROPOLIS | 09:29-10:09 [7012010] CAB - PETROPOLIS | 10:15-10:20 [7012010] CAB - PETROPOLIS | 10:40-10:55 [7012010] CAB - PETROPOLIS | 10:59-11:25 [7012010] CAB - PETROPOLIS | 11:26-12:12 [7012010] CAB - PETROPOLIS | 12:13-13:14 [7012010] CAB - PETROPOLIS | 14:15-14:42 [579011] FEIRA NOVA BOA DICA (PIABETÁ) | 14:49-14:55 [7012010] CAB - PETROPOLIS | 15:45-23:57 [7012010] CAB - PETROPOLIS

## Problemas identificados

- Check 7: 1 timestamps divergentes (matcher vs KPI)
