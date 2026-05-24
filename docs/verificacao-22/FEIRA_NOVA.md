# Análise FEIRA_NOVA — Dia 22/05/2026

> Análise completa com 7 checks (ver `CHECKLIST.md`)

## Sumário

- **Data:** 2026-05-22
- **Rede:** FEIRA_NOVA
- **Escala:** 12 linha(s)
- **Alterações:** 0
- **Unitrac:** 212 veículos, 2148 paradas
- **KPI gerado:** KPI-FEIRA_NOVA-2026-05-22 (1).xlsx (12 linhas)

## Check 1 — Motorista (escala vs KPI)

✓ Todos motoristas batem com a escala.

## Check 2 — Contagem global (escala vs KPI)

- Escala: 12 lojas distintas
- KPI: 12 lojas
✓ Contagens batem exatamente.

## Check 3 — Alterações aplicadas

Sem alterações para esta rede.

## Check 4 — Colunas extras do KPI Excel

Cabeçalhos detectados: [1] REDES / FILIAIS | [2] MOTORISTA | [3] COD | [4] PLACA | [5] SAIDA CD | [6] CHD LOJA | [7] SAIDA LOJA | [8] MOTORISTA | [9] COD | [10] PLACA | [11] SAIDA CD | [12] CHD LOJA | [13] SAIDA LOJA | [14] TEMPO EM LOJA 1 | [15] TEMPO EM LOJA 2

12 loja(s) com dados em colunas extras:
  - **1- Nilopolis (Olinda)**: TEMPO EM LOJA 1=01:01, TEMPO EM LOJA 2=00:00
  - **10- Cachambi**: TEMPO EM LOJA 1=00:46, TEMPO EM LOJA 2=00:00
  - **11- Boa Dica (Piabetá)**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  - **12- Freguesia**: TEMPO EM LOJA 1=00:43, TEMPO EM LOJA 2=00:00
  - **13- Todos os Santos**: TEMPO EM LOJA 1=00:44, TEMPO EM LOJA 2=00:00
  - **3- Anchieta**: TEMPO EM LOJA 1=01:11, TEMPO EM LOJA 2=00:00
  - **4- Irajá**: TEMPO EM LOJA 1=00:34, TEMPO EM LOJA 2=00:00
  - **6- Santa Cruz da Serra**: TEMPO EM LOJA 1=02:45, TEMPO EM LOJA 2=00:00
  - **7- Coelho da Rocha**: TEMPO EM LOJA 1=00:17, TEMPO EM LOJA 2=00:00
  - **8- Cerâmica**: TEMPO EM LOJA 1=00:56, TEMPO EM LOJA 2=00:00
  ... e mais 2

## Check 5 — Lat/lng das paradas (vs cadastro)

✓ Todas paradas dentro do raio cadastrado (com margem 1.5x).

## Check 6 — Ambos slots da linha do KPI

✓ Slots batem com escala.

## Check 7 — SC/CHD/SL: matcher (rodado agora) vs KPI gerado

⚠ **1 divergência(s) entre matcher local e KPI gerado:**
- **Mercado Santo Agostinho (Barra)** (c1): matcher=---/00:05/23:56 | KPI=12:53/13:33/23:56

_Pode indicar que o KPI foi gerado com versão antiga do código. Regerar deve corrigir._

## Detalhe — Loja por loja

### 1- Nilopolis (Olinda)
- **c1**: JOSUÉ | BBH1C94
  - Escala: motorista=JOSUÉ placa=BBH1C94
  - KPI: motorista=JOSUÉ placa=BBH-1C94 | SC=13:04 CHD=13:37 SL=14:38
  - Matcher: SC=13:04 CHD=13:37 SL=14:38
  - GPS LOJA: 05:31-07:12 [9039121] 48 - ZONA SUL - RECREIO DOS BA | 13:37-14:38 [579001] FEIRA NOVA OLINDA | 14:41-15:52 [579003] FEIRA NOVA  ANCHIETA

### 3- Anchieta
- **c1**: JOSUÉ | BBH1C94
  - Escala: motorista=JOSUÉ placa=BBH1C94
  - KPI: motorista=JOSUÉ placa=BBH-1C94 | SC=13:04 CHD=14:41 SL=15:52
  - Matcher: SC=13:04 CHD=14:41 SL=15:52
  - GPS LOJA: 05:31-07:12 [9039121] 48 - ZONA SUL - RECREIO DOS BA | 13:37-14:38 [579001] FEIRA NOVA OLINDA | 14:41-15:52 [579003] FEIRA NOVA  ANCHIETA

### 4- Irajá
- **c1**: WILLIAM FERES | EFU5704
  - Escala: motorista=WILLIAM FERES placa=EFU5704
  - KPI: motorista=WILLIAM FERES placa=EFU-5704 | SC=05:24 CHD=08:56 SL=09:31
  - Matcher: SC=05:24 CHD=08:56 SL=09:31

### 12- Freguesia
- **c1**: JOSE ROBERTO | KPB5I95
  - Escala: motorista=JOSE ROBERTO placa=KPB5I95
  - KPI: motorista=JOSE ROBERTO placa=KPB-5I95 | SC=13:07 CHD=13:57 SL=14:39
  - Matcher: SC=13:07 CHD=13:57 SL=14:39
  - GPS LOJA: 06:48-07:58 [7000707] PREZUNIC FREGUESIA | 08:03-08:16 [579012] FEIRA NOVA  FREGUESIA | 10:33-11:17 [4568001] SAMS NITEROI | 13:57-14:39 [579012] FEIRA NOVA  FREGUESIA

### 10- Cachambi
- **c1**: MARCIO | KVH9J42
  - Escala: motorista=MARCIO placa=KVH9J42
  - KPI: motorista=MARCIO placa=KVH-9J42 | SC=13:02 CHD=14:37 SL=15:22
  - Matcher: SC=13:02 CHD=14:37 SL=15:22
  - GPS LOJA: 05:40-08:26 [9039004] 04 - ZONA SUL - COPACABANA II | 13:45-14:28 [579013] FEIRA NOVA TODOS OS SANTOS | 14:37-15:22 [579010] FEIRA NOVA  CACHAMBI

### 13- Todos os Santos
- **c1**: MARCIO | KVH9J42
  - Escala: motorista=MARCIO placa=KVH9J42
  - KPI: motorista=MARCIO placa=KVH-9J42 | SC=13:02 CHD=13:45 SL=14:28
  - Matcher: SC=13:02 CHD=13:45 SL=14:28
  - GPS LOJA: 05:40-08:26 [9039004] 04 - ZONA SUL - COPACABANA II | 13:45-14:28 [579013] FEIRA NOVA TODOS OS SANTOS | 14:37-15:22 [579010] FEIRA NOVA  CACHAMBI

### 7- Coelho da Rocha
- **c1**: HUMBERTO | KOA6A27
  - Escala: motorista=HUMBERTO placa=KOA6A27
  - KPI: motorista=HUMBERTO placa=KOA-6A27 | SC=12:54 CHD=14:46 SL=15:04
  - Matcher: SC=12:54 CHD=14:46 SL=15:04
  - GPS LOJA: 05:49-06:24 [7000725] PREZUNIC VILAR DOS TELES | 13:31-13:35 [579008] FEIRA NOVA  CERAMICA | 13:36-14:27 [579008] FEIRA NOVA  CERAMICA | 14:46-15:04 [579007] FEIRA NOVA COELHO DA ROCHA

### 8- Cerâmica
- **c1**: HUMBERTO | KOA6A27
  - Escala: motorista=HUMBERTO placa=KOA6A27
  - KPI: motorista=HUMBERTO placa=KOA-6A27 | SC=12:54 CHD=13:31 SL=14:27
  - Matcher: SC=12:54 CHD=13:31 SL=14:27
  - GPS LOJA: 05:49-06:24 [7000725] PREZUNIC VILAR DOS TELES | 13:31-13:35 [579008] FEIRA NOVA  CERAMICA | 13:36-14:27 [579008] FEIRA NOVA  CERAMICA | 14:46-15:04 [579007] FEIRA NOVA COELHO DA ROCHA

### 9- Queimados
- **c1**: MARCELO | KNC1I34
  - Escala: motorista=MARCELO placa=KNC1I34
  - KPI: motorista=MARCELO placa=KNC-1I34 | SC=10:57 CHD=11:43 SL=12:11
  - Matcher: SC=10:57 CHD=11:43 SL=12:11

### 6- Santa Cruz da Serra
- **c1**: FELIPE | KUL1425
  - Escala: motorista=FELIPE placa=KUL1425
  - KPI: motorista=FELIPE placa=KUL-1425 | SC=12:51 CHD=13:26 SL=16:10
  - Matcher: SC=12:51 CHD=13:26 SL=16:10
  - GPS LOJA: 06:44-08:36 [7000748] PREZUNIC VILA ISABEL | 13:26-16:10 [579006] FEIRA NOVA  SANTA CRUZ DA SERR

### 11- Boa Dica (Piabetá)
- **c1**: ZOZIMO | KNS8D16
  - Escala: motorista=ZOZIMO placa=KNS8D16
  - KPI: motorista=ZOZIMO placa=KNS-8D16 | SC=SEM CHD=SEM SL=SEM
  - GPS: placa não encontrada no Unitrac

### Mercado Santo Agostinho (Barra)
- **c1**: RAFAEL | EYL8B91
  - Escala: motorista=RAFAEL placa=EYL8B91
  - KPI: motorista=RAFAEL placa=EYL-8B91 | SC=12:53 CHD=13:33 SL=23:56
  - Matcher: SC=--- CHD=00:05 SL=23:56
  - GPS LOJA: 00:05-04:28 [23080000] MERCADO SANTO AGOSTINHO - BARR | 04:34-05:01 [23080000] MERCADO SANTO AGOSTINHO - BARR | 05:48-07:01 [23080000] MERCADO SANTO AGOSTINHO - BARR | 07:40-07:57 [23080000] MERCADO SANTO AGOSTINHO - BARR | 08:06-12:07 [23080000] MERCADO SANTO AGOSTINHO - BARR | 12:17-12:53 [23080000] MERCADO SANTO AGOSTINHO - BARR | 13:02-13:06 [23080000] MERCADO SANTO AGOSTINHO - BARR | 13:33-13:41 [23080000] MERCADO SANTO AGOSTINHO - BARR | 14:03-16:43 [23080000] MERCADO SANTO AGOSTINHO - BARR | 16:47-16:51 [23080000] MERCADO SANTO AGOSTINHO - BARR | 16:52-16:56 [23080000] MERCADO SANTO AGOSTINHO - BARR | 17:24-17:28 [23080000] MERCADO SANTO AGOSTINHO - BARR | 18:49-23:56 [23080000] MERCADO SANTO AGOSTINHO - BARR

## Problemas identificados

- Check 7: 1 timestamps divergentes (matcher vs KPI)
