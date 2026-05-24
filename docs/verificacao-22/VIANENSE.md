# Análise VIANENSE — Dia 22/05/2026

> Análise completa com 7 checks (ver `CHECKLIST.md`)

## Sumário

- **Data:** 2026-05-22
- **Rede:** VIANENSE
- **Escala:** 4 linha(s)
- **Alterações:** 0
- **Unitrac:** 212 veículos, 2148 paradas
- **KPI gerado:** KPI-VIANENSE-2026-05-22 (1).xlsx (4 linhas)

## Check 1 — Motorista (escala vs KPI)

✓ Todos motoristas batem com a escala.

## Check 2 — Contagem global (escala vs KPI)

- Escala: 4 lojas distintas
- KPI: 4 lojas
✓ Contagens batem exatamente.

## Check 3 — Alterações aplicadas

Sem alterações para esta rede.

## Check 4 — Colunas extras do KPI Excel

Cabeçalhos detectados: [1] REDES / FILIAIS | [2] MOTORISTA | [3] COD | [4] PLACA | [5] SAIDA CD | [6] CHD LOJA | [7] SAIDA LOJA | [8] MOTORISTA | [9] COD | [10] PLACA | [11] SAIDA CD | [12] CHD LOJA | [13] SAIDA LOJA | [14] TEMPO EM LOJA 1 | [15] TEMPO EM LOJA 2

4 loja(s) com dados em colunas extras:
  - **Vianense - Freguesia 2º entrega**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  - **Vianense - Jardim Alvorada 2º entrega**: TEMPO EM LOJA 1=00:25, TEMPO EM LOJA 2=00:00
  - **Vianense - Nova Iguaçu 1º entrega**: TEMPO EM LOJA 1=00:18, TEMPO EM LOJA 2=00:00
  - **Vianense - Recreio 1º entrega**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00

## Check 5 — Lat/lng das paradas (vs cadastro)

✓ Todas paradas dentro do raio cadastrado (com margem 1.5x).

## Check 6 — Ambos slots da linha do KPI

✓ Slots batem com escala.

## Check 7 — SC/CHD/SL: matcher (rodado agora) vs KPI gerado

✓ Todos timestamps batem.

## Detalhe — Loja por loja

### Vianense - Recreio 1º entrega
- **c1**: JOSE ROBERTO | TML6D96
  - Escala: motorista=JOSE ROBERTO placa=TML6D96
  - KPI: motorista=JOSE ROBERTO placa=TML-6D96 | SC=--- CHD=--- SL=---
  - GPS: 11p mas matcher sem match
  - GPS LOJA: 06:38-07:06 [7000747] PREZUNIC TIJUCA

### Vianense - Freguesia 2º entrega
- **c1**: JOSE ROBERTO | TML6D96
  - Escala: motorista=JOSE ROBERTO placa=TML6D96
  - KPI: motorista=JOSE ROBERTO placa=TML-6D96 | SC=--- CHD=--- SL=---
  - GPS: 11p mas matcher sem match
  - GPS LOJA: 06:38-07:06 [7000747] PREZUNIC TIJUCA

### Vianense - Nova Iguaçu 1º entrega
- **c1**: MÁRCIO | LTH4J15
  - Escala: motorista=MÁRCIO placa=LTH4J15
  - KPI: motorista=MÁRCIO placa=LTH-4J15 | SC=10:29 CHD=11:17 SL=11:34
  - Matcher: SC=10:29 CHD=11:17 SL=11:34
  - GPS LOJA: 05:13-05:50 [22980000] EMPORIO BARRA TOWER | 06:03-06:27 [22144000] PETIT MARCHE BARRAMARES | 11:17-11:34 [11623028] VIANENSE NOVA IGUAÇU | 11:48-12:13 [11623032] VIANENSE JARDIM ALVORADA | 20:17-20:23 [9039006] 06 - ZONA SUL - GAVEA | 20:39-20:57 [9039105] 31 - ZONA SUL - JD BOTANICO

### Vianense - Jardim Alvorada 2º entrega
- **c1**: MÁRCIO | LTH4J15
  - Escala: motorista=MÁRCIO placa=LTH4J15
  - KPI: motorista=MÁRCIO placa=LTH-4J15 | SC=10:29 CHD=11:48 SL=12:13
  - Matcher: SC=10:29 CHD=11:48 SL=12:13
  - GPS LOJA: 05:13-05:50 [22980000] EMPORIO BARRA TOWER | 06:03-06:27 [22144000] PETIT MARCHE BARRAMARES | 11:17-11:34 [11623028] VIANENSE NOVA IGUAÇU | 11:48-12:13 [11623032] VIANENSE JARDIM ALVORADA | 20:17-20:23 [9039006] 06 - ZONA SUL - GAVEA | 20:39-20:57 [9039105] 31 - ZONA SUL - JD BOTANICO

## Problemas identificados

✓ Nenhum problema detectado.
