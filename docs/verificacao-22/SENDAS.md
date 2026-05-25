# Análise SENDAS — Dia 22/05/2026

> Análise completa com 7 checks (ver `CHECKLIST.md`)

## Sumário

- **Data:** 2026-05-22
- **Rede:** SENDAS
- **Escala:** 9 linha(s)
- **Alterações:** 0
- **Unitrac:** 212 veículos, 2148 paradas
- **KPI gerado:** KPI-SENDAS-2026-05-22 (1).xlsx (9 linhas)

## Check 1 — Motorista (escala vs KPI)

✓ Todos motoristas batem com a escala.

## Check 2 — Contagem global (escala vs KPI)

- Escala: 9 lojas distintas
- KPI: 9 lojas
✓ Contagens batem exatamente.

## Check 3 — Alterações aplicadas

Sem alterações para esta rede.

## Check 4 — Colunas extras do KPI Excel

Cabeçalhos detectados: [1] REDES / FILIAIS | [2] MOTORISTA | [3] COD | [4] PLACA | [5] SAIDA CD | [6] CHD LOJA | [7] SAIDA LOJA | [8] MOTORISTA | [9] COD | [10] PLACA | [11] SAIDA CD | [12] CHD LOJA | [13] SAIDA LOJA | [14] TEMPO EM LOJA 1 | [15] TEMPO EM LOJA 2

9 loja(s) com dados em colunas extras:
  - **Americanas**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  - **Armazem do grão - Central**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  - **Atlantico Sul (Barra da Tijuca)**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  - **Barra Tower**: TEMPO EM LOJA 1=00:37, TEMPO EM LOJA 2=00:00
  - **Barramares (Barra da Tijuca)**: TEMPO EM LOJA 1=00:25, TEMPO EM LOJA 2=00:00
  - **Mercado de Santa**: TEMPO EM LOJA 1=00:16, TEMPO EM LOJA 2=00:00
  - **Mercearia Sachinho (Vargem Grande)**: TEMPO EM LOJA 1=00:43, TEMPO EM LOJA 2=00:00
  - **Santo Agostinho**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  - **Sendas Central 1º Carro**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00

## Check 5 — Lat/lng das paradas (vs cadastro)

✓ Todas paradas dentro do raio cadastrado (com margem 1.5x).

## Check 6 — Ambos slots da linha do KPI

✓ Slots batem com escala.

## Check 7 — SC/CHD/SL: matcher (rodado agora) vs KPI gerado

⚠ **3 divergência(s) entre matcher local e KPI gerado:**
- **Americanas** (c1): matcher=06:02/06:15/10:35 | KPI=---/---/---
- **Sendas Central 1º Carro** (c1): matcher=---/00:08/14:01 | KPI=---/---/---
- **Mercado de Santa** (c1): matcher=05:12/07:41/10:33 | KPI=13:30/16:25/16:41

_Pode indicar que o KPI foi gerado com versão antiga do código. Regerar deve corrigir._

## Detalhe — Loja por loja

### Americanas
- **c1**: JOSÉ CARLOS | LKV5067
  - Escala: motorista=JOSÉ CARLOS placa=LKV5067
  - KPI: motorista=JOSÉ CARLOS placa=LKV-5067 | SC=--- CHD=--- SL=---
  - Matcher: SC=06:02 CHD=06:15 SL=10:35
  - GPS LOJA: 00:00-05:36 [17659002] EMANUEL CACHAMORRA | 05:44-06:02 [17659002] EMANUEL CACHAMORRA | 06:15-07:00 [560040] SENDAS SÃO JOÃO DE MERITI | 07:01-10:35 [560040] SENDAS SÃO JOÃO DE MERITI | 10:51-12:28 [17659002] EMANUEL CACHAMORRA | 12:29-13:03 [17659002] EMANUEL CACHAMORRA | 13:05-13:11 [17659002] EMANUEL CACHAMORRA | 13:45-13:49 [17659002] EMANUEL CACHAMORRA | 14:09-14:41 [17659002] EMANUEL CACHAMORRA | 15:22-15:36 [17659002] EMANUEL CACHAMORRA | 15:39-15:50 [17659002] EMANUEL CACHAMORRA | 15:51-19:53 [17659002] EMANUEL CACHAMORRA | 19:55-20:18 [17659002] EMANUEL CACHAMORRA | 20:35-21:33 [17659002] EMANUEL CACHAMORRA | 21:50-23:51 [17659002] EMANUEL CACHAMORRA

### Sendas Central 1º Carro
- **c1**: NELSON | KRB2J76
  - Escala: motorista=NELSON placa=KRB2J76
  - KPI: motorista=NELSON placa=KRB-2J76 | SC=--- CHD=--- SL=---
  - Matcher: SC=--- CHD=00:08 SL=14:01
  - GPS LOJA: 00:08-07:04 [13156084] MATRIZ CD DUQUE | 07:08-07:35 [13156084] MATRIZ CD DUQUE | 07:44-08:48 [13156084] MATRIZ CD DUQUE | 08:54-09:54 [13156084] MATRIZ CD DUQUE | 11:09-11:12 [13156084] MATRIZ CD DUQUE | 11:14-12:18 [13156084] MATRIZ CD DUQUE | 12:19-12:57 [13156084] MATRIZ CD DUQUE | 13:38-14:01 [13156084] MATRIZ CD DUQUE

### Atlantico Sul (Barra da Tijuca)
- **c1**: MÁRCIO | LTH4J15
  - Escala: motorista=MÁRCIO placa=LTH4J15
  - KPI: motorista=MÁRCIO placa=LTH-4J15 | SC=--- CHD=--- SL=---
  - GPS: 19p mas matcher sem match
  - GPS LOJA: 05:13-05:50 [22980000] EMPORIO BARRA TOWER | 06:03-06:27 [22144000] PETIT MARCHE BARRAMARES | 11:17-11:34 [11623028] VIANENSE NOVA IGUAÇU | 11:48-12:13 [11623032] VIANENSE JARDIM ALVORADA | 20:17-20:23 [9039006] 06 - ZONA SUL - GAVEA | 20:39-20:57 [9039105] 31 - ZONA SUL - JD BOTANICO

### Barramares (Barra da Tijuca)
- **c1**: MÁRCIO | LTH4J15
  - Escala: motorista=MÁRCIO placa=LTH4J15
  - KPI: motorista=MÁRCIO placa=LTH-4J15 | SC=04:24 CHD=06:03 SL=06:27
  - Matcher: SC=04:24 CHD=06:03 SL=06:27
  - GPS LOJA: 05:13-05:50 [22980000] EMPORIO BARRA TOWER | 06:03-06:27 [22144000] PETIT MARCHE BARRAMARES | 11:17-11:34 [11623028] VIANENSE NOVA IGUAÇU | 11:48-12:13 [11623032] VIANENSE JARDIM ALVORADA | 20:17-20:23 [9039006] 06 - ZONA SUL - GAVEA | 20:39-20:57 [9039105] 31 - ZONA SUL - JD BOTANICO

### Barra Tower
- **c1**: MÁRCIO | LTH4J15
  - Escala: motorista=MÁRCIO placa=LTH4J15
  - KPI: motorista=MÁRCIO placa=LTH-4J15 | SC=04:24 CHD=05:13 SL=05:50
  - Matcher: SC=04:24 CHD=05:13 SL=05:50
  - GPS LOJA: 05:13-05:50 [22980000] EMPORIO BARRA TOWER | 06:03-06:27 [22144000] PETIT MARCHE BARRAMARES | 11:17-11:34 [11623028] VIANENSE NOVA IGUAÇU | 11:48-12:13 [11623032] VIANENSE JARDIM ALVORADA | 20:17-20:23 [9039006] 06 - ZONA SUL - GAVEA | 20:39-20:57 [9039105] 31 - ZONA SUL - JD BOTANICO

### Santo Agostinho
- **c1**: FLÁVIO | NSM6D98
  - Escala: motorista=FLÁVIO placa=NSM6D98
  - KPI: motorista=FLÁVIO placa=NSM-6D98 | SC=--- CHD=--- SL=---
  - GPS: 11p mas matcher sem match
  - GPS LOJA: 05:51-06:14 [9006012] CARREFOUR ALCANTARA

### Armazem do grão - Central
- **c1**: EDUARDO | KPH8C41
  - Escala: motorista=EDUARDO placa=KPH8C41
  - KPI: motorista=EDUARDO placa=KPH-8C41 | SC=SEM CHD=SEM SL=SEM
  - GPS: placa não encontrada no Unitrac

### Mercado de Santa
- **c1**: LUIZ CESAR | LMF2049
  - Escala: motorista=LUIZ CESAR placa=LMF2049
  - KPI: motorista=LUIZ CESAR placa=LMF-2049 | SC=13:30 CHD=16:25 SL=16:41
  - Matcher: SC=05:12 CHD=07:41 SL=10:33

### Mercearia Sachinho (Vargem Grande)
- **c1**: SANDRO | KXA5966
  - Escala: motorista=SANDRO placa=KXA5966
  - KPI: motorista=SANDRO placa=KXA-5966 | SC=10:47 CHD=11:50 SL=12:33
  - Matcher: SC=10:47 CHD=11:50 SL=12:33
  - GPS LOJA: 09:23-09:37 [202006] PAX MADUREIRA | 11:50-12:33 [15247000] MERCEARIA SACHINHO

## Problemas identificados

- Check 7: 3 timestamps divergentes (matcher vs KPI)
