# Análise PRINCESA — Dia 22/05/2026

> Análise completa com 7 checks (ver `CHECKLIST.md`)

## Sumário

- **Data:** 2026-05-22
- **Rede:** PRINCESA
- **Escala:** 26 linha(s)
- **Alterações:** 0
- **Unitrac:** 212 veículos, 2148 paradas
- **KPI gerado:** KPI-PRINCESA-2026-05-22 (1).xlsx (26 linhas)

## Check 1 — Motorista (escala vs KPI)

⚠ **2 divergência(s):**
- **Princesa - Leme** (c1): escala="WANDERSON" KPI="MANOEL PAULINO"
- **Princesa - Inga** (c1): escala="LUIZ CESAR" KPI="WALLACE"

## Check 2 — Contagem global (escala vs KPI)

- Escala: 26 lojas distintas
- KPI: 26 lojas
⚠ **1 loja(s) na escala mas FALTANDO no KPI:**
  - Princesa - Iguaba (1º Entrega)
⚠ **1 loja(s) no KPI mas SEM escala:**
  - Princesa - Iguaba (1ª Entrega)

## Check 3 — Alterações aplicadas

Sem alterações para esta rede.

## Check 4 — Colunas extras do KPI Excel

Cabeçalhos detectados: [1] REDES / FILIAIS | [2] MOTORISTA | [3] COD | [4] PLACA | [5] SAIDA CD | [6] CHD LOJA | [7] SAIDA LOJA | [8] MOTORISTA | [9] COD | [10] PLACA | [11] SAIDA CD | [12] CHD LOJA | [13] SAIDA LOJA | [14] TEMPO EM LOJA 1 | [15] TEMPO EM LOJA 2

26 loja(s) com dados em colunas extras:
  - **Princesa - Catete**: TEMPO EM LOJA 1=01:36, TEMPO EM LOJA 2=00:00
  - **Princesa - Flamengo**: TEMPO EM LOJA 1=01:43, TEMPO EM LOJA 2=00:00
  - **Princesa - Cosme Velho**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  - **Princesa - Laranjeiras**: TEMPO EM LOJA 1=00:36, TEMPO EM LOJA 2=00:00
  - **Princesa - Copacabana**: TEMPO EM LOJA 1=01:38, TEMPO EM LOJA 2=00:00
  - **Princesa - Leme**: TEMPO EM LOJA 1=00:23, TEMPO EM LOJA 2=00:00
  - **Princesa - Pechincha**: TEMPO EM LOJA 1=01:11, TEMPO EM LOJA 2=00:00
  - **Princesa - Niteroí Barcas**: TEMPO EM LOJA 1=00:22, TEMPO EM LOJA 2=00:00
  - **Princesa - Inga**: TEMPO EM LOJA 1=01:03, TEMPO EM LOJA 2=00:00
  - **Princesa - Fonseca**: TEMPO EM LOJA 1=01:30, TEMPO EM LOJA 2=00:00
  ... e mais 16

## Check 5 — Lat/lng das paradas (vs cadastro)

✓ Todas paradas dentro do raio cadastrado (com margem 1.5x).

## Check 6 — Ambos slots da linha do KPI

⚠ **4 divergência(s):**
- **Princesa - Cosme Velho**: KPI tem 2º carro (placa KXB-6E57) mas escala só tem 1 carro
- **Princesa - Laranjeiras**: KPI tem 2º carro (placa KXB-6E57) mas escala só tem 1 carro
- **Princesa - Icaraí**: KPI tem 2º carro (placa NSM-6D98) mas escala só tem 1 carro
- **Princesa - Iguaba (1ª Entrega)**: KPI tem 1º carro mas escala não tem

## Check 7 — SC/CHD/SL: matcher (rodado agora) vs KPI gerado

⚠ **25 divergência(s) entre matcher local e KPI gerado:**
- **Princesa - Catete** (c1): matcher=04:11/04:51/06:35 | KPI=04:28/05:00/06:37
- **Princesa - Flamengo** (c1): matcher=04:48/05:31/07:46 | KPI=04:59/05:44/07:27
- **Princesa - Cosme Velho** (c1): matcher=04:14/05:18/09:37 | KPI=SEM/SEM/SEM
- **Princesa - Laranjeiras** (c1): matcher=04:47/05:22/05:33 | KPI=04:45/05:22/05:58
- **Princesa - Copacabana** (c1): matcher=04:43/05:43/06:41 | KPI=04:32/05:10/06:48
- **Princesa - Leme** (c1): matcher=04:43/05:21/05:35 | KPI=04:57/05:36/05:59
- **Princesa - Pechincha** (c1): matcher=04:00/04:31/06:00 | KPI=04:04/04:30/05:42
- **Princesa - Niteroí Barcas** (c1): matcher=05:12/06:00/06:19 | KPI=05:13/06:03/06:25
- **Princesa - Inga** (c1): matcher=---/---/--- | KPI=04:28/05:16/06:18
- **Princesa - Fonseca** (c1): matcher=04:52/05:35/07:22 | KPI=05:00/05:41/07:11
- **Princesa - Icaraí** (c1): matcher=04:28/05:05/06:04 | KPI=04:12/04:53/05:36
- **Princesa - Itaboraí (2ª Entrega)** (c1): matcher=04:02/07:21/08:01 | KPI=03:47/07:21/07:55
- **Princesa - Maricá 1 (2ª Entrega)** (c1): matcher=03:26/05:16/06:36 | KPI=03:18/05:08/06:36
- **Princesa - Maricá 2 (1ª Entrega)** (c1): matcher=03:26/06:39/07:54 | KPI=03:18/06:39/09:09
- **Princesa - Barra de São João (1ª Entrega)** (c1): matcher=02:24/08:55/11:22 | KPI=02:39/05:22/06:49
- **Princesa - Rio das Ostras (2ª Entrega)** (c1): matcher=02:24/05:06/08:30 | KPI=02:39/07:11/11:01
- **Princesa - Arraial 1 (1ª Entrega)** (c1): matcher=03:28/08:04/10:43 | KPI=03:14/08:16/12:14
- **Princesa - Arraial 2 (2ª Entrega)** (c1): matcher=03:28/07:19/07:51 | KPI=03:14/07:33/08:13
- **Princesa - Arraial 3 (3ª Entrega)** (c1): matcher=03:28/06:36/07:14 | KPI=03:14/06:49/07:28
- **Princesa - Buzios 1 (2ª Entrega)** (c1): matcher=02:35/06:14/06:25 | KPI=02:20/06:26/06:38
- **Princesa - Buzios 2 (3ª Entrega)** (c1): matcher=02:35/06:25/06:59 | KPI=02:20/06:38/07:47
- **Princesa - Buzios 3 (1ª Entrega)** (c1): matcher=02:35/07:01/09:11 | KPI=02:20/07:50/10:18
- **Princesa - Cabo Frio 1 (1ª Entrega)** (c1): matcher=02:34/05:22/06:54 | KPI=03:21/05:39/06:52
- **Princesa - Cabo Frio 2 (3ª Entrega)** (c1): matcher=02:34/08:06/08:34 | KPI=03:21/08:04/09:02
- **Princesa - Cabo Frio 3 (2ª Entrega)** (c1): matcher=02:34/06:56/07:46 | KPI=03:21/06:54/07:50

_Pode indicar que o KPI foi gerado com versão antiga do código. Regerar deve corrigir._

## Detalhe — Loja por loja

### Princesa - Catete
- **c1**: RAFAEL | KVT5427
  - Escala: motorista=RAFAEL placa=KVT5427
  - KPI: motorista=RAFAEL placa=KVT-5427 | SC=04:28 CHD=05:00 SL=06:37
  - Matcher: SC=04:11 CHD=04:51 SL=06:35
  - GPS LOJA: 00:09-03:23 [25140000] EMANUEL- REDE ECONOMIA SANTA M | 04:00-04:11 [25140000] EMANUEL- REDE ECONOMIA SANTA M | 04:29-04:35 [25140000] EMANUEL- REDE ECONOMIA SANTA M | 04:51-06:35 [8590120] PRINCESA CATETE | 07:01-07:05 [25140000] EMANUEL- REDE ECONOMIA SANTA M | 07:06-07:09 [25140000] EMANUEL- REDE ECONOMIA SANTA M | 07:29-07:37 [25140000] EMANUEL- REDE ECONOMIA SANTA M | 07:41-10:33 [25140000] EMANUEL- REDE ECONOMIA SANTA M | 10:34-12:42 [25140000] EMANUEL- REDE ECONOMIA SANTA M | 12:43-13:01 [25140000] EMANUEL- REDE ECONOMIA SANTA M | 13:06-13:15 [25140000] EMANUEL- REDE ECONOMIA SANTA M | 13:17-13:21 [25140000] EMANUEL- REDE ECONOMIA SANTA M | 13:23-13:36 [25140000] EMANUEL- REDE ECONOMIA SANTA M | 14:18-15:15 [25140000] EMANUEL- REDE ECONOMIA SANTA M | 15:45-23:52 [25140000] EMANUEL- REDE ECONOMIA SANTA M

### Princesa - Flamengo
- **c1**: KANU | KQR2J11
  - Escala: motorista=KANU placa=KQR2J11
  - KPI: motorista=KANU placa=KQR-2J11 | SC=04:59 CHD=05:44 SL=07:27
  - Matcher: SC=04:48 CHD=05:31 SL=07:46
  - GPS LOJA: 05:31-07:46 [8590165] PRINCESA FLAMENGO | 13:59-14:56 [9039007] 07 - ZONA SUL - LEBLON

### Princesa - Cosme Velho
- **c1**: ERIVELTON | KRH5H67
  - Escala: motorista=ERIVELTON placa=KRH5H67
  - KPI: motorista=ERIVELTON placa=KRH-5H67 | SC=SEM CHD=SEM SL=SEM
  - Matcher: SC=04:14 CHD=05:18 SL=09:37
  - GPS LOJA: 05:18-06:02 [8590000] PRINCESA COSME VELHO | 09:15-09:37 [8590000] PRINCESA COSME VELHO | 12:30-14:21 [9039011] 11 - ZONA SUL - LEBLON

### Princesa - Laranjeiras
- **c1**: ELVIS | KPS4J07
  - Escala: motorista=ELVIS placa=KPS4J07
  - KPI: motorista=ELVIS placa=KPS-4J07 | SC=04:45 CHD=05:22 SL=05:58
  - Matcher: SC=04:47 CHD=05:22 SL=05:33
  - GPS LOJA: 05:22-05:33 [8590218] PRINCESA LARANJEIRAS | 10:46-16:50 [560046] SENDAS CORDOVIL | 16:51-17:01 [560046] SENDAS CORDOVIL

### Princesa - Copacabana
- **c1**: WANDERSON | KWH2J02
  - Escala: motorista=WANDERSON placa=KWH2J02
  - KPI: motorista=WANDERSON placa=KWH-2J02 | SC=04:32 CHD=05:10 SL=06:48
  - Matcher: SC=04:43 CHD=05:43 SL=06:41
  - GPS LOJA: 00:02-03:32 [17659004] REDE ECONOMIA SANTA MARIA | 04:10-04:34 [17659004] REDE ECONOMIA SANTA MARIA | 04:35-04:43 [17659004] REDE ECONOMIA SANTA MARIA | 05:21-05:24 [8590134] PRINCESA LEME | 05:28-05:35 [8590134] PRINCESA LEME | 05:43-06:41 [8590034] PRINCESA COPACABANA | 07:41-07:57 [17659004] REDE ECONOMIA SANTA MARIA | 08:01-11:10 [17659004] REDE ECONOMIA SANTA MARIA | 12:19-12:41 [17659004] REDE ECONOMIA SANTA MARIA | 12:43-13:02 [17659004] REDE ECONOMIA SANTA MARIA | 13:58-14:59 [17659004] REDE ECONOMIA SANTA MARIA

### Princesa - Leme
- **c1**: WANDERSON | KWH2J02
  - Escala: motorista=WANDERSON placa=KWH2J02
  - KPI: motorista=MANOEL PAULINO placa=HNG-2B61 | SC=04:57 CHD=05:36 SL=05:59
  - Matcher: SC=04:43 CHD=05:21 SL=05:35
  - GPS LOJA: 00:02-03:32 [17659004] REDE ECONOMIA SANTA MARIA | 04:10-04:34 [17659004] REDE ECONOMIA SANTA MARIA | 04:35-04:43 [17659004] REDE ECONOMIA SANTA MARIA | 05:21-05:24 [8590134] PRINCESA LEME | 05:28-05:35 [8590134] PRINCESA LEME | 05:43-06:41 [8590034] PRINCESA COPACABANA | 07:41-07:57 [17659004] REDE ECONOMIA SANTA MARIA | 08:01-11:10 [17659004] REDE ECONOMIA SANTA MARIA | 12:19-12:41 [17659004] REDE ECONOMIA SANTA MARIA | 12:43-13:02 [17659004] REDE ECONOMIA SANTA MARIA | 13:58-14:59 [17659004] REDE ECONOMIA SANTA MARIA

### Princesa - Pechincha
- **c1**: ALISSON | MSK3752
  - Escala: motorista=ALISSON placa=MSK3752
  - KPI: motorista=ALISSON placa=MSK-3752 | SC=04:04 CHD=04:30 SL=05:42
  - Matcher: SC=04:00 CHD=04:31 SL=06:00
  - GPS LOJA: 04:31-06:00 [8590031] PRINCESA PECHINCHA | 08:23-08:44 [7000731] PREZUNIC BOTAFOGO | 08:45-08:55 [7000731] PREZUNIC BOTAFOGO

### Princesa - Niteroí Barcas
- **c1**: LUIZ CESAR | LMF2049
  - Escala: motorista=LUIZ CESAR placa=LMF2049
  - KPI: motorista=LUIZ CESAR placa=LMF-2049 | SC=05:13 CHD=06:03 SL=06:25
  - Matcher: SC=05:12 CHD=06:00 SL=06:19

### Princesa - Inga
- **c1**: LUIZ CESAR | LMF2049
  - Escala: motorista=LUIZ CESAR placa=LMF2049
  - KPI: motorista=WALLACE placa=ETI-5F79 | SC=04:28 CHD=05:16 SL=06:18
  - GPS: 13p mas matcher sem match

### Princesa - Fonseca
- **c1**: JULIO PEREIRA | RJN9F68
  - Escala: motorista=JULIO PEREIRA placa=RJN9F68
  - KPI: motorista=JULIO PEREIRA placa=RJN-9F68 | SC=05:00 CHD=05:41 SL=07:11
  - Matcher: SC=04:52 CHD=05:35 SL=07:22
  - GPS LOJA: 05:35-07:22 [8590555] PRINCESA FONSECA | 12:27-13:18 [560019] SENDAS FREGUESIA - LOJA 28

### Princesa - Icaraí
- **c1**: JOHN | KVI9088
  - Escala: motorista=JOHN placa=KVI9088
  - KPI: motorista=JOHN placa=KVI-9088 | SC=04:12 CHD=04:53 SL=05:36
  - Matcher: SC=04:28 CHD=05:05 SL=06:04
  - GPS LOJA: 05:05-06:04 [8590004] PRINCESA ICARAÍ | 07:33-08:20 [9006154] CARREFOUR CAMPO GRANDE

### Princesa - Iguaba (1º Entrega)
⚠ Não encontrada no KPI gerado

### Princesa - Itaboraí (2ª Entrega)
- **c1**: DIEGO | LRA9C41
  - Escala: motorista=DIEGO placa=LRA9C41
  - KPI: motorista=DIEGO placa=LRA-9C41 | SC=03:47 CHD=07:21 SL=07:55
  - Matcher: SC=04:02 CHD=07:21 SL=08:01

### Princesa - Maricá 1 (2ª Entrega)
- **c1**: DANIEL CAVALCANTE | QSZ9A20
  - Escala: motorista=DANIEL CAVALCANTE placa=QSZ9A20
  - KPI: motorista=DANIEL CAVALCANTE placa=QSZ-9A20 | SC=03:18 CHD=05:08 SL=06:36
  - Matcher: SC=03:26 CHD=05:16 SL=06:36
  - GPS LOJA: 05:16-06:36 [8590002] PRINCESA MARICÁ 1 | 06:39-07:54 [8590003] PRINCESA MARICÁ 2 | 08:00-09:06 [8590002] PRINCESA MARICÁ 1

### Princesa - Maricá 2 (1ª Entrega)
- **c1**: DANIEL CAVALCANTE | QSZ9A20
  - Escala: motorista=DANIEL CAVALCANTE placa=QSZ9A20
  - KPI: motorista=DANIEL CAVALCANTE placa=QSZ-9A20 | SC=03:18 CHD=06:39 SL=09:09
  - Matcher: SC=03:26 CHD=06:39 SL=07:54
  - GPS LOJA: 05:16-06:36 [8590002] PRINCESA MARICÁ 1 | 06:39-07:54 [8590003] PRINCESA MARICÁ 2 | 08:00-09:06 [8590002] PRINCESA MARICÁ 1

### Princesa - Barra de São João (1ª Entrega)
- **c1**: RENATO | JAJ6B36
  - Escala: motorista=RENATO placa=JAJ6B36
  - KPI: motorista=RENATO placa=JAJ-6B36 | SC=02:39 CHD=05:22 SL=06:49
  - Matcher: SC=02:24 CHD=08:55 SL=11:22
  - GPS LOJA: 05:06-08:30 [8590568] PRINCESA - RIO DAS OSTRAS | 08:55-11:22 [8590562] PRINCESA - BARRA DE SÃO JOÃO | 19:26-19:58 [9039102] 20 - ZONA SUL - BOTAFOGO | 20:16-20:30 [9039005] 05 - ZONA SUL - COPACABANA III

### Princesa - Rio das Ostras (2ª Entrega)
- **c1**: RENATO | JAJ6B36
  - Escala: motorista=RENATO placa=JAJ6B36
  - KPI: motorista=RENATO placa=JAJ-6B36 | SC=02:39 CHD=07:11 SL=11:01
  - Matcher: SC=02:24 CHD=05:06 SL=08:30
  - GPS LOJA: 05:06-08:30 [8590568] PRINCESA - RIO DAS OSTRAS | 08:55-11:22 [8590562] PRINCESA - BARRA DE SÃO JOÃO | 19:26-19:58 [9039102] 20 - ZONA SUL - BOTAFOGO | 20:16-20:30 [9039005] 05 - ZONA SUL - COPACABANA III

### Princesa - Arraial 1 (1ª Entrega)
- **c1**: ANTÔNIO | MES7F27
  - Escala: motorista=ANTÔNIO placa=MES7F27
  - KPI: motorista=ANTÔNIO placa=MES-7F27 | SC=03:14 CHD=08:16 SL=12:14
  - Matcher: SC=03:28 CHD=08:04 SL=10:43
  - GPS LOJA: 06:02-06:35 [8590559] PRINCESA - ARRAIAL DO CABO 1 | 06:36-07:14 [8590569] PRINCESA - ARRAIAL DO CABO 3 | 07:19-07:51 [8590560] PRINCESA - ARRAIAL DO CABO 2 | 08:04-10:43 [8590559] PRINCESA - ARRAIAL DO CABO 1 | 10:47-10:53 [8590569] PRINCESA - ARRAIAL DO CABO 3 | 11:00-11:10 [8590560] PRINCESA - ARRAIAL DO CABO 2 | 11:16-13:05 [8590559] PRINCESA - ARRAIAL DO CABO 1 | 13:12-13:20 [8590560] PRINCESA - ARRAIAL DO CABO 2

### Princesa - Arraial 2 (2ª Entrega)
- **c1**: ANTÔNIO | MES7F27
  - Escala: motorista=ANTÔNIO placa=MES7F27
  - KPI: motorista=ANTÔNIO placa=MES-7F27 | SC=03:14 CHD=07:33 SL=08:13
  - Matcher: SC=03:28 CHD=07:19 SL=07:51
  - GPS LOJA: 06:02-06:35 [8590559] PRINCESA - ARRAIAL DO CABO 1 | 06:36-07:14 [8590569] PRINCESA - ARRAIAL DO CABO 3 | 07:19-07:51 [8590560] PRINCESA - ARRAIAL DO CABO 2 | 08:04-10:43 [8590559] PRINCESA - ARRAIAL DO CABO 1 | 10:47-10:53 [8590569] PRINCESA - ARRAIAL DO CABO 3 | 11:00-11:10 [8590560] PRINCESA - ARRAIAL DO CABO 2 | 11:16-13:05 [8590559] PRINCESA - ARRAIAL DO CABO 1 | 13:12-13:20 [8590560] PRINCESA - ARRAIAL DO CABO 2

### Princesa - Arraial 3 (3ª Entrega)
- **c1**: ANTÔNIO | MES7F27
  - Escala: motorista=ANTÔNIO placa=MES7F27
  - KPI: motorista=ANTÔNIO placa=MES-7F27 | SC=03:14 CHD=06:49 SL=07:28
  - Matcher: SC=03:28 CHD=06:36 SL=07:14
  - GPS LOJA: 06:02-06:35 [8590559] PRINCESA - ARRAIAL DO CABO 1 | 06:36-07:14 [8590569] PRINCESA - ARRAIAL DO CABO 3 | 07:19-07:51 [8590560] PRINCESA - ARRAIAL DO CABO 2 | 08:04-10:43 [8590559] PRINCESA - ARRAIAL DO CABO 1 | 10:47-10:53 [8590569] PRINCESA - ARRAIAL DO CABO 3 | 11:00-11:10 [8590560] PRINCESA - ARRAIAL DO CABO 2 | 11:16-13:05 [8590559] PRINCESA - ARRAIAL DO CABO 1 | 13:12-13:20 [8590560] PRINCESA - ARRAIAL DO CABO 2

### Princesa - Buzios 1 (2ª Entrega)
- **c1**: LEONARDO | QST4C52
  - Escala: motorista=LEONARDO placa=QST4C52
  - KPI: motorista=LEONARDO placa=QST-4C52 | SC=02:20 CHD=06:26 SL=06:38
  - Matcher: SC=02:35 CHD=06:14 SL=06:25
  - GPS LOJA: 05:48-06:11 [8590571] PRINCESA - BUZIOS 3 | 06:14-06:25 [8590563] PRINCESA - BUZIOS 1 | 06:25-06:59 [8590564] PRINCESA - BUZIOS 2 | 07:01-09:11 [8590571] PRINCESA - BUZIOS 3 | 14:37-15:01 [5353008] ARMAZEM DO GRÃO (QUITANDINHA) | 15:14-15:37 [5353004] ARMAZEM DO GRÃO (VALPARAÍSO) | 15:52-16:42 [5353007] ARMAZEM DO GRÃO  (MOSELA)

### Princesa - Buzios 2 (3ª Entrega)
- **c1**: LEONARDO | QST4C52
  - Escala: motorista=LEONARDO placa=QST4C52
  - KPI: motorista=LEONARDO placa=QST-4C52 | SC=02:20 CHD=06:38 SL=07:47
  - Matcher: SC=02:35 CHD=06:25 SL=06:59
  - GPS LOJA: 05:48-06:11 [8590571] PRINCESA - BUZIOS 3 | 06:14-06:25 [8590563] PRINCESA - BUZIOS 1 | 06:25-06:59 [8590564] PRINCESA - BUZIOS 2 | 07:01-09:11 [8590571] PRINCESA - BUZIOS 3 | 14:37-15:01 [5353008] ARMAZEM DO GRÃO (QUITANDINHA) | 15:14-15:37 [5353004] ARMAZEM DO GRÃO (VALPARAÍSO) | 15:52-16:42 [5353007] ARMAZEM DO GRÃO  (MOSELA)

### Princesa - Buzios 3 (1ª Entrega)
- **c1**: LEONARDO | QST4C52
  - Escala: motorista=LEONARDO placa=QST4C52
  - KPI: motorista=LEONARDO placa=QST-4C52 | SC=02:20 CHD=07:50 SL=10:18
  - Matcher: SC=02:35 CHD=07:01 SL=09:11
  - GPS LOJA: 05:48-06:11 [8590571] PRINCESA - BUZIOS 3 | 06:14-06:25 [8590563] PRINCESA - BUZIOS 1 | 06:25-06:59 [8590564] PRINCESA - BUZIOS 2 | 07:01-09:11 [8590571] PRINCESA - BUZIOS 3 | 14:37-15:01 [5353008] ARMAZEM DO GRÃO (QUITANDINHA) | 15:14-15:37 [5353004] ARMAZEM DO GRÃO (VALPARAÍSO) | 15:52-16:42 [5353007] ARMAZEM DO GRÃO  (MOSELA)

### Princesa - Cabo Frio 1 (1ª Entrega)
- **c1**: CLAUDIO | UEH9I93
  - Escala: motorista=CLAUDIO placa=UEH9I93
  - KPI: motorista=CLAUDIO placa=UDC-6I03 | SC=03:21 CHD=05:39 SL=06:52
  - Matcher: SC=02:34 CHD=05:22 SL=06:54
  - GPS LOJA: 05:22-06:54 [8590565] PRINCESA - CABO FRIO 1 | 06:56-07:46 [8590567] PRINCESA - CABO FRIO 3 | 08:06-08:34 [8590566] PRINCESA - CABO FRIO 2

### Princesa - Cabo Frio 2 (3ª Entrega)
- **c1**: CLAUDIO | UEH9I93
  - Escala: motorista=CLAUDIO placa=UEH9I93
  - KPI: motorista=CLAUDIO placa=UDC-6I03 | SC=03:21 CHD=08:04 SL=09:02
  - Matcher: SC=02:34 CHD=08:06 SL=08:34
  - GPS LOJA: 05:22-06:54 [8590565] PRINCESA - CABO FRIO 1 | 06:56-07:46 [8590567] PRINCESA - CABO FRIO 3 | 08:06-08:34 [8590566] PRINCESA - CABO FRIO 2

### Princesa - Cabo Frio 3 (2ª Entrega)
- **c1**: CLAUDIO | UEH9I93
  - Escala: motorista=CLAUDIO placa=UEH9I93
  - KPI: motorista=CLAUDIO placa=UDC-6I03 | SC=03:21 CHD=06:54 SL=07:50
  - Matcher: SC=02:34 CHD=06:56 SL=07:46
  - GPS LOJA: 05:22-06:54 [8590565] PRINCESA - CABO FRIO 1 | 06:56-07:46 [8590567] PRINCESA - CABO FRIO 3 | 08:06-08:34 [8590566] PRINCESA - CABO FRIO 2

## Problemas identificados

- Check 1 (Motorista): 2 divergências
- Check 2: 1 lojas faltando no KPI
- Check 2: 1 lojas extras no KPI
- Check 6: 4 slots divergentes
- Check 7: 25 timestamps divergentes (matcher vs KPI)
