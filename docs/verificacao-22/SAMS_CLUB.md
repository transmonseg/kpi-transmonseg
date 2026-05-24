# Análise SAMS_CLUB — Dia 22/05/2026

> Análise completa com 7 checks (ver `CHECKLIST.md`)

## Sumário

- **Data:** 2026-05-22
- **Rede:** SAMS_CLUB
- **Escala:** 3 linha(s)
- **Alterações:** 0
- **Unitrac:** 212 veículos, 2148 paradas
- **KPI gerado:** KPI-SAMS_CLUB-2026-05-22 (1).xlsx (3 linhas)

## Check 1 — Motorista (escala vs KPI)

✓ Todos motoristas batem com a escala.

## Check 2 — Contagem global (escala vs KPI)

- Escala: 3 lojas distintas
- KPI: 3 lojas
✓ Contagens batem exatamente.

## Check 3 — Alterações aplicadas

Sem alterações para esta rede.

## Check 4 — Colunas extras do KPI Excel

Cabeçalhos detectados: [1] REDES / FILIAIS | [2] MOTORISTA | [3] COD | [4] PLACA | [5] SAIDA CD | [6] CHD LOJA | [7] SAIDA LOJA | [8] MOTORISTA | [9] COD | [10] PLACA | [11] SAIDA CD | [12] CHD LOJA | [13] SAIDA LOJA | [14] TEMPO EM LOJA 1 | [15] TEMPO EM LOJA 2

3 loja(s) com dados em colunas extras:
  - **Sam's - Barra (Ayrton Senna)**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  - **Sam's - Linha Amarela**: TEMPO EM LOJA 1=01:30, TEMPO EM LOJA 2=00:00
  - **Sam's - Niterói**: TEMPO EM LOJA 1=00:44, TEMPO EM LOJA 2=00:00

## Check 5 — Lat/lng das paradas (vs cadastro)

✓ Todas paradas dentro do raio cadastrado (com margem 1.5x).

## Check 6 — Ambos slots da linha do KPI

✓ Slots batem com escala.

## Check 7 — SC/CHD/SL: matcher (rodado agora) vs KPI gerado

✓ Todos timestamps batem.

## Detalhe — Loja por loja

### Sam's - Linha Amarela
- **c1**: FÁBIO BORGES | LAF0697
  - Escala: motorista=FÁBIO BORGES placa=LAF0697
  - KPI: motorista=FÁBIO BORGES placa=LAF-0697 | SC=09:45 CHD=10:14 SL=11:44
  - Matcher: SC=09:45 CHD=10:14 SL=11:44
  - GPS LOJA: 06:05-06:24 [7000721] PREZUNIC NILÓPOLIS | 10:14-11:44 [4568002] SAMS LINHA AMARELA

### Sam's - Niterói
- **c1**: JOSE ROBERTO | KPB5I95
  - Escala: motorista=JOSE ROBERTO placa=KPB5I95
  - KPI: motorista=JOSE ROBERTO placa=KPB-5I95 | SC=09:43 CHD=10:33 SL=11:17
  - Matcher: SC=09:43 CHD=10:33 SL=11:17
  - GPS LOJA: 06:48-07:58 [7000707] PREZUNIC FREGUESIA | 08:03-08:16 [579012] FEIRA NOVA  FREGUESIA | 10:33-11:17 [4568001] SAMS NITEROI | 13:57-14:39 [579012] FEIRA NOVA  FREGUESIA

### Sam's - Barra (Ayrton Senna)
- **c1**: FLÁVIO | NSM6D98
  - Escala: motorista=FLÁVIO placa=NSM6D98
  - KPI: motorista=FLÁVIO placa=NSM-6D98 | SC=--- CHD=--- SL=---
  - GPS: 11p mas matcher sem match
  - GPS LOJA: 05:51-06:14 [9006012] CARREFOUR ALCANTARA

## Problemas identificados

✓ Nenhum problema detectado.
