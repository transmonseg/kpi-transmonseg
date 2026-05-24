# Análise PREZUNIC — Dia 22/05/2026

> Análise completa com 7 checks (ver `CHECKLIST.md`)

## Sumário

- **Data:** 2026-05-22
- **Rede:** PREZUNIC
- **Escala:** 39 linha(s)
- **Alterações:** 2
- **Unitrac:** 212 veículos, 2148 paradas
- **KPI gerado:** KPI-PREZUNIC-2026-05-22 (1).xlsx (46 linhas)

## Check 1 — Motorista (escala vs KPI)

⚠ **2 divergência(s):**
- **Prezunic - Caxias Centro / Serra Azul** (c1): escala="ANDERSON" KPI="Sidnei"
- **Prezunic - Caxias Centenário** (c1): escala="ANDERSON" KPI="Sidnei"

## Check 2 — Contagem global (escala vs KPI)

- Escala: 39 lojas distintas
- KPI: 46 lojas
⚠ **7 loja(s) no KPI mas SEM escala:**
  - Prezunic - Depósito Central
  - Prezunic SPID - Tijuca
  - Prezunic SPID - Jacarepagua
  - Prezunic SPID - Santa Rosa (Niterói)
  - Prezunic SPID - Freguesia
  - Prezunic SPID - Glória
  - Prezunic SPID - Botafogo

## Check 3 — Alterações aplicadas

Alterações encontradas no PDF: 2

- **Prezunic - Caxias Centro / Serra Azul** → carro 1º CARRO: motorista=710 C/ RAMPA SIDNEY placa=LQE-5401
  ⚠ KPI tem placa=LLJ-9C64 mot=HELIO ALVES — divergente
- **Prezunic - Caxias Centenário** → carro 1º CARRO: motorista=710 C/ RAMPA SIDNEY placa=LQE-5401
  ⚠ KPI tem placa=LLJ-9C64 mot=HELIO ALVES — divergente

## Check 4 — Colunas extras do KPI Excel

Cabeçalhos detectados: [1] REDES / FILIAIS | [2] MOTORISTA | [3] COD | [4] PLACA | [5] SAIDA CD | [6] CHD LOJA | [7] SAIDA LOJA | [8] MOTORISTA | [9] COD | [10] PLACA | [11] SAIDA CD | [12] CHD LOJA | [13] SAIDA LOJA | [14] TEMPO EM LOJA 1 | [15] TEMPO EM LOJA 2

46 loja(s) com dados em colunas extras:
  - **Prezunic - Barra da Tijuca**: TEMPO EM LOJA 1=00:33, TEMPO EM LOJA 2=00:00
  - **Prezunic - Jardim Oceanico**: TEMPO EM LOJA 1=00:17, TEMPO EM LOJA 2=00:00
  - **Prezunic - Barra Marapendi**: TEMPO EM LOJA 1=00:17, TEMPO EM LOJA 2=00:00
  - **Prezunic - Botafogo / Serra Azul**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  - **Prezunic - Botafogo (Voluntários)**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  - **Prezunic - Ilha do Governador**: TEMPO EM LOJA 1=00:40, TEMPO EM LOJA 2=00:00
  - **Prezunic - Pechincha**: TEMPO EM LOJA 1=02:23, TEMPO EM LOJA 2=00:00
  - **Prezunic - Freguesia**: TEMPO EM LOJA 1=01:11, TEMPO EM LOJA 2=00:00
  - **Prezunic - Anil (Jacarepaguá)**: TEMPO EM LOJA 1=01:58, TEMPO EM LOJA 2=00:00
  - **Prezunic - Jauru / Serra Azul**: TEMPO EM LOJA 1=01:48, TEMPO EM LOJA 2=00:00
  ... e mais 36

## Check 5 — Lat/lng das paradas (vs cadastro)

✓ Todas paradas dentro do raio cadastrado (com margem 1.5x).

## Check 6 — Ambos slots da linha do KPI

✓ Slots batem com escala.

## Check 7 — SC/CHD/SL: matcher (rodado agora) vs KPI gerado

⚠ **5 divergência(s) entre matcher local e KPI gerado:**
- **Prezunic - Barra Marapendi** (c1): matcher=05:14/06:19/07:09 | KPI=05:14/05:52/06:09
- **Prezunic - Botafogo (Voluntários)** (c1): matcher=05:25/06:17/08:48 | KPI=---/---/---
- **Prezunic - Fonseca** (c1): matcher=05:24/06:17/09:45 | KPI=04:49/04:51/09:45
- **Prezunic - Caxias Centenário** (c1): matcher=---/09:43/09:54 | KPI=---/---/---
- **Prezunic - Laranjeiras** (c1): matcher=05:24/06:12/08:29 | KPI=04:43/04:52/05:24

_Pode indicar que o KPI foi gerado com versão antiga do código. Regerar deve corrigir._

## Detalhe — Loja por loja

### Prezunic - Barra da Tijuca
- **c1**: HELIO ALVES | LLJ9C64
  - Escala: motorista=HELIO ALVES placa=LLJ9C64
  - KPI: motorista=HELIO ALVES placa=LLJ-9C64 | SC=04:53 CHD=05:38 SL=06:11
  - Matcher: SC=04:53 CHD=05:38 SL=06:11
  - GPS LOJA: 05:38-06:11 [7000734] PREZUNIC BARRA

### Prezunic - Jardim Oceanico
- **c1**: MARCELO | KNC1I34
  - Escala: motorista=MARCELO placa=KNC1I34
  - KPI: motorista=MARCELO placa=KNC-1I34 | SC=05:14 CHD=05:52 SL=06:09
  - Matcher: SC=05:14 CHD=05:52 SL=06:09

### Prezunic - Barra Marapendi
- **c1**: MARCELO | KNC1I34
  - Escala: motorista=MARCELO placa=KNC1I34
  - KPI: motorista=MARCELO placa=KNC-1I34 | SC=05:14 CHD=05:52 SL=06:09
  - Matcher: SC=05:14 CHD=06:19 SL=07:09

### Prezunic - Botafogo / Serra Azul
- **c1**: DELSON | KWB6998
  - Escala: motorista=DELSON placa=KWB6998
  - KPI: motorista=DELSON placa=KWB-6998 | SC=SEM CHD=SEM SL=SEM
  - GPS: placa não encontrada no Unitrac

### Prezunic - Botafogo (Voluntários)
- **c1**: VICTOR LINS | QSY2H32
  - Escala: motorista=VICTOR LINS placa=QSY2H32
  - KPI: motorista=VICTOR LINS placa=QSY-2H32 | SC=--- CHD=--- SL=---
  - Matcher: SC=05:25 CHD=06:17 SL=08:48
  - GPS LOJA: 06:17-08:48 [7000750] PREZUNIC BOTAFOGO (VOLUNTÁRIOS

### Prezunic - Ilha do Governador
- **c1**: CIRLANDO | KPE4133
  - Escala: motorista=CIRLANDO placa=KPE4133
  - KPI: motorista=CIRLANDO placa=KPE-4133 | SC=05:25 CHD=06:13 SL=06:52
  - Matcher: SC=05:25 CHD=06:13 SL=06:52
  - GPS LOJA: 06:13-06:44 [7000728] PREZUNIC ILHA | 06:45-06:52 [7000728] PREZUNIC ILHA

### Prezunic - Pechincha
- **c1**: PAULO CESAR | LNU7H38
  - Escala: motorista=PAULO CESAR placa=LNU7H38
  - KPI: motorista=PAULO CESAR placa=LNU-7H38 | SC=05:49 CHD=06:36 SL=08:59
  - Matcher: SC=05:49 CHD=06:36 SL=08:59
  - GPS LOJA: 06:36-08:59 [7000709] PREZUNIC PECHINCHA

### Prezunic - Freguesia
- **c1**: JOSE ROBERTO | KPB5I95
  - Escala: motorista=JOSE ROBERTO placa=KPB5I95
  - KPI: motorista=JOSE ROBERTO placa=KPB-5I95 | SC=05:52 CHD=06:48 SL=07:58
  - Matcher: SC=05:52 CHD=06:48 SL=07:58
  - GPS LOJA: 06:48-07:58 [7000707] PREZUNIC FREGUESIA | 08:03-08:16 [579012] FEIRA NOVA  FREGUESIA | 10:33-11:17 [4568001] SAMS NITEROI | 13:57-14:39 [579012] FEIRA NOVA  FREGUESIA

### Prezunic - Anil (Jacarepaguá)
- **c1**: EDUARDO | KWI3461
  - Escala: motorista=EDUARDO placa=KWI3461
  - KPI: motorista=EDUARDO placa=KWI-3461 | SC=05:38 CHD=06:21 SL=08:19
  - Matcher: SC=05:38 CHD=06:21 SL=08:19
  - GPS LOJA: 06:21-08:19 [7000735] PREZUNIC ANIL (SHOPPING JACARE

### Prezunic - Jauru / Serra Azul
- **c1**: WANDERLEY | AFY7J99
  - Escala: motorista=WANDERLEY placa=AFY7J99
  - KPI: motorista=WANDERLEY placa=AFY-7J99 | SC=05:31 CHD=06:04 SL=07:51
  - Matcher: SC=05:31 CHD=06:04 SL=07:51
  - GPS LOJA: 06:04-07:51 [7000711] PREZUNIC JAURU | 07:59-08:16 [7000719] PREZUNIC TAQUARA | 15:46-16:24 [9039120] 45 - ZONA SUL - FLAMENGO

### Prezunic - Taquara / Serra Azul
- **c1**: WANDERLEY | AFY7J99
  - Escala: motorista=WANDERLEY placa=AFY7J99
  - KPI: motorista=WANDERLEY placa=AFY-7J99 | SC=05:31 CHD=07:59 SL=08:16
  - Matcher: SC=05:31 CHD=07:59 SL=08:16
  - GPS LOJA: 06:04-07:51 [7000711] PREZUNIC JAURU | 07:59-08:16 [7000719] PREZUNIC TAQUARA | 15:46-16:24 [9039120] 45 - ZONA SUL - FLAMENGO

### Prezunic - Icaraí
- **c1**: ESTELITA | GAJ6H51
  - Escala: motorista=ESTELITA placa=GAJ6H51
  - KPI: motorista=ESTELITA placa=GAJ-6H51 | SC=05:28 CHD=07:04 SL=10:15
  - Matcher: SC=05:28 CHD=07:04 SL=10:15
  - GPS LOJA: 07:04-09:14 [7000730] PREZUNIC ICARAÍ | 09:16-10:15 [7000730] PREZUNIC ICARAÍ

### Prezunic - Fonseca
- **c1**: DOVAL | KQV1D80
  - Escala: motorista=DOVAL placa=KQV1D80
  - KPI: motorista=DOVAL placa=KQV-1D80 | SC=04:49 CHD=04:51 SL=09:45
  - Matcher: SC=05:24 CHD=06:17 SL=09:45
  - GPS LOJA: 06:17-09:45 [7000722] PREZUNIC FONSECA | 14:51-15:22 [202006] PAX MADUREIRA | 15:24-15:51 [202000] PAX OSWALDO CRUZ | 15:54-16:37 [202000] PAX OSWALDO CRUZ

### Prezunic - Recreio dos Bandeirantes
- **c1**: CARLOS DO SANTOS | LUP1F13
  - Escala: motorista=CARLOS DO SANTOS placa=LUP1F13
  - KPI: motorista=CARLOS DO SANTOS placa=LUP-1F13 | SC=SEM CHD=SEM SL=SEM
  - GPS: placa não encontrada no Unitrac

### Prezunic - Caxias Centro / Serra Azul
- **c1**: ANDERSON | LCE4337
  - Escala: motorista=ANDERSON placa=LCE4337
  - KPI: motorista=Sidnei placa=LQE-5401 | SC=--- CHD=--- SL=---
  - GPS: 1p mas matcher sem match

### Prezunic - Caxias Centenário
- **c1**: ANDERSON | LCE4337
  - Escala: motorista=ANDERSON placa=LCE4337
  - KPI: motorista=Sidnei placa=LQE-5401 | SC=--- CHD=--- SL=---
  - Matcher: SC=--- CHD=09:43 SL=09:54

### Prezunic - Campo Grande (TINGUI)
- **c1**: ANDRE | LSX7C72
  - Escala: motorista=ANDRE placa=LSX7C72
  - KPI: motorista=ANDRE placa=LSX-7C72 | SC=05:24 CHD=06:19 SL=08:15
  - Matcher: SC=05:24 CHD=06:19 SL=08:15
  - GPS LOJA: 06:19-08:15 [7000766] PREZUNIC CAMPO GRANDE (TINGUI) | 15:18-16:20 [202011] PAX TAQUARA

### Prezunic - Campo Grande / Serra Azul
- **c1**: MILTON | KOP4978
  - Escala: motorista=MILTON placa=KOP4978
  - KPI: motorista=MILTON placa=KOP-4978 | SC=05:34 CHD=06:45 SL=07:00
  - Matcher: SC=05:34 CHD=06:45 SL=07:00
  - GPS LOJA: 06:45-07:00 [7000710] PREZUNIC CAMPO GRANDE

### Prezunic - Santa Cruz / Serra Azul
- **c1**: ANTÔNIO FREITAS | LNG7110
  - Escala: motorista=ANTÔNIO FREITAS placa=LNG7110
  - KPI: motorista=ANTÔNIO FREITAS placa=LNG-7110 | SC=05:45 CHD=06:51 SL=07:16
  - Matcher: SC=05:45 CHD=06:51 SL=07:16
  - GPS LOJA: 06:51-07:16 [7000733] PREZUNIC SANTA CRUZ

### Prezunic - Nilópolis
- **c1**: FÁBIO BORGES | LAF0697
  - Escala: motorista=FÁBIO BORGES placa=LAF0697
  - KPI: motorista=FÁBIO BORGES placa=LAF-0697 | SC=05:35 CHD=06:05 SL=06:24
  - Matcher: SC=05:35 CHD=06:05 SL=06:24
  - GPS LOJA: 06:05-06:24 [7000721] PREZUNIC NILÓPOLIS | 10:14-11:44 [4568002] SAMS LINHA AMARELA

### Prezunic - Vilar dos Teles
- **c1**: HUMBERTO | KOA6A27
  - Escala: motorista=HUMBERTO placa=KOA6A27
  - KPI: motorista=HUMBERTO placa=KOA-6A27 | SC=05:32 CHD=05:49 SL=06:24
  - Matcher: SC=05:32 CHD=05:49 SL=06:24
  - GPS LOJA: 05:49-06:24 [7000725] PREZUNIC VILAR DOS TELES | 13:31-13:35 [579008] FEIRA NOVA  CERAMICA | 13:36-14:27 [579008] FEIRA NOVA  CERAMICA | 14:46-15:04 [579007] FEIRA NOVA COELHO DA ROCHA

### Prezunic - Méier / Serra Azul
- **c1**: RICARDO | KXB6E57
  - Escala: motorista=RICARDO placa=KXB6E57
  - KPI: motorista=RICARDO placa=KXB-6E57 | SC=06:16 CHD=07:16 SL=09:09
  - Matcher: SC=06:16 CHD=07:16 SL=09:09

### Prezunic - Cachambi
- **c1**: SÉRGIO FIDÉLIS | LOU9928
  - Escala: motorista=SÉRGIO FIDÉLIS placa=LOU9928
  - KPI: motorista=SÉRGIO FIDÉLIS placa=LOU-9928 | SC=04:52 CHD=07:27 SL=07:56
  - Matcher: SC=04:52 CHD=07:27 SL=07:56
  - GPS LOJA: 07:27-07:56 [7000724] PREZUNIC CACHAMBI | 15:13-15:56 [202001] PAX ENGENHO DE DENTRO

### Prezunic - Maricá
- **c1**: ALEXANDRE | TML9I75
  - Escala: motorista=ALEXANDRE placa=TML9I75
  - KPI: motorista=ALEXANDRE placa=TML-9I75 | SC=04:17 CHD=05:35 SL=09:54
  - Matcher: SC=04:17 CHD=05:35 SL=09:54
  - GPS LOJA: 05:35-09:54 [7000749] PREZUNIC MARICÁ

### Prezunic - Catumbi / Serra Azul
- **c1**: EDSON CAFÉ | LTC8F97
  - Escala: motorista=EDSON CAFÉ placa=LTC8F97
  - KPI: motorista=EDSON CAFÉ placa=LTC-8F97 | SC=06:00 CHD=07:08 SL=08:52
  - Matcher: SC=06:00 CHD=07:08 SL=08:52
  - GPS LOJA: 07:08-08:52 [7000704] PREZUNIC CATUMBI | 12:29-12:43 [560031] SENDAS MEIER

### Prezunic - Senador Camará
- **c1**: WILLIAM RODRIGUES | UFW0H63
  - Escala: motorista=WILLIAM RODRIGUES placa=UFW0H63
  - KPI: motorista=WILLIAM RODRIGUES placa=UFW-0H63 | SC=05:47 CHD=07:03 SL=09:59
  - Matcher: SC=05:47 CHD=07:03 SL=09:59
  - GPS LOJA: 00:05-01:04 [17659003] EMANUEL VARGEM GRANDE | 01:06-02:18 [17659003] EMANUEL VARGEM GRANDE | 02:27-05:47 [17659003] EMANUEL VARGEM GRANDE | 06:12-06:47 [7000712] PREZUNIC REALENGO | 07:03-08:04 [7000705] PREZUNIC SENADOR CAMARÁ | 08:07-09:02 [7000705] PREZUNIC SENADOR CAMARÁ | 09:08-09:59 [7000705] PREZUNIC SENADOR CAMARÁ | 10:40-11:24 [17659003] EMANUEL VARGEM GRANDE | 11:34-11:44 [17659003] EMANUEL VARGEM GRANDE | 12:04-13:48 [17659003] EMANUEL VARGEM GRANDE | 14:56-15:45 [17659003] EMANUEL VARGEM GRANDE | 16:15-16:18 [17659003] EMANUEL VARGEM GRANDE | 16:49-17:03 [17659003] EMANUEL VARGEM GRANDE | 17:05-23:54 [17659003] EMANUEL VARGEM GRANDE

### Prezunic - Realengo/ Serra Azul
- **c1**: WILLIAM RODRIGUES | UFW0H63
  - Escala: motorista=WILLIAM RODRIGUES placa=UFW0H63
  - KPI: motorista=WILLIAM RODRIGUES placa=UFW-0H63 | SC=05:47 CHD=06:12 SL=06:47
  - Matcher: SC=05:47 CHD=06:12 SL=06:47
  - GPS LOJA: 00:05-01:04 [17659003] EMANUEL VARGEM GRANDE | 01:06-02:18 [17659003] EMANUEL VARGEM GRANDE | 02:27-05:47 [17659003] EMANUEL VARGEM GRANDE | 06:12-06:47 [7000712] PREZUNIC REALENGO | 07:03-08:04 [7000705] PREZUNIC SENADOR CAMARÁ | 08:07-09:02 [7000705] PREZUNIC SENADOR CAMARÁ | 09:08-09:59 [7000705] PREZUNIC SENADOR CAMARÁ | 10:40-11:24 [17659003] EMANUEL VARGEM GRANDE | 11:34-11:44 [17659003] EMANUEL VARGEM GRANDE | 12:04-13:48 [17659003] EMANUEL VARGEM GRANDE | 14:56-15:45 [17659003] EMANUEL VARGEM GRANDE | 16:15-16:18 [17659003] EMANUEL VARGEM GRANDE | 16:49-17:03 [17659003] EMANUEL VARGEM GRANDE | 17:05-23:54 [17659003] EMANUEL VARGEM GRANDE

### Prezunic - Tijuca
- **c1**: JOSE ROBERTO | TML6D96
  - Escala: motorista=JOSE ROBERTO placa=TML6D96
  - KPI: motorista=JOSE ROBERTO placa=TML-6D96 | SC=--- CHD=06:38 SL=07:06
  - Matcher: SC=--- CHD=06:38 SL=07:06
  - GPS LOJA: 06:38-07:06 [7000747] PREZUNIC TIJUCA

### Prezunic - Vila Isabel
- **c1**: FELIPE | KUL1425
  - Escala: motorista=FELIPE placa=KUL1425
  - KPI: motorista=FELIPE placa=KUL-1425 | SC=05:47 CHD=06:44 SL=08:36
  - Matcher: SC=05:47 CHD=06:44 SL=08:36
  - GPS LOJA: 06:44-08:36 [7000748] PREZUNIC VILA ISABEL | 13:26-16:10 [579006] FEIRA NOVA  SANTA CRUZ DA SERR

### Prezunic - Laranjeiras
- **c1**: WILLIAM FERES | EFU5H04
  - Escala: motorista=WILLIAM FERES placa=EFU5H04
  - KPI: motorista=WILLIAM FERES placa=EFU-5H04 | SC=04:43 CHD=04:52 SL=05:24
  - Matcher: SC=05:24 CHD=06:12 SL=08:29

### Prezunic - Padre Miguel
- **c1**: WALLACE | ETI5F79
  - Escala: motorista=WALLACE placa=ETI5F79
  - KPI: motorista=WALLACE placa=ETI-5F79 | SC=04:58 CHD=05:22 SL=06:31
  - Matcher: SC=04:58 CHD=05:22 SL=06:31
  - GPS LOJA: 05:22-05:29 [7000726] PREZUNIC PADRE MIGUEL | 05:34-06:31 [7000726] PREZUNIC PADRE MIGUEL | 14:36-15:04 [202003] PAX INHAUMA

### Prezunic - Penha
- **c1**: AGNALDO | LKR5990
  - Escala: motorista=AGNALDO placa=LKR5990
  - KPI: motorista=AGNALDO placa=LKR-5990 | SC=06:21 CHD=08:54 SL=09:46
  - Matcher: SC=06:21 CHD=08:54 SL=09:46
  - GPS LOJA: 07:04-08:42 [7000714] PREZUNIC OLARIA | 08:54-09:46 [7000723] PREZUNIC PENHA | 20:15-20:21 [9039010] 10 - ZONA SUL - RECREIO DOS BA | 20:22-20:54 [9039010] 10 - ZONA SUL - RECREIO DOS BA

### Prezunic - Olaria
- **c1**: AGNALDO | LKR5990
  - Escala: motorista=AGNALDO placa=LKR5990
  - KPI: motorista=AGNALDO placa=LKR-5990 | SC=06:21 CHD=07:04 SL=08:42
  - Matcher: SC=06:21 CHD=07:04 SL=08:42
  - GPS LOJA: 07:04-08:42 [7000714] PREZUNIC OLARIA | 08:54-09:46 [7000723] PREZUNIC PENHA | 20:15-20:21 [9039010] 10 - ZONA SUL - RECREIO DOS BA | 20:22-20:54 [9039010] 10 - ZONA SUL - RECREIO DOS BA

### Prezunic - Engenho Novo
- **c1**: ADRIANO | TML5I70
  - Escala: motorista=ADRIANO placa=TML5I70
  - KPI: motorista=ADRIANO placa=TML-5I70 | SC=05:36 CHD=06:03 SL=07:02
  - Matcher: SC=05:36 CHD=06:03 SL=07:02
  - GPS LOJA: 06:03-07:02 [7000708] PREZUNIC ENGENHO NOVO | 07:22-08:26 [7000706] PREZUNIC BENFICA | 12:06-16:20 [560060] SENDAS SANTA CRUZ  II -  LOJA 

### Prezunic - Benfica
- **c1**: ADRIANO | TML5I70
  - Escala: motorista=ADRIANO placa=TML5I70
  - KPI: motorista=ADRIANO placa=TML-5I70 | SC=05:36 CHD=07:22 SL=08:26
  - Matcher: SC=05:36 CHD=07:22 SL=08:26
  - GPS LOJA: 06:03-07:02 [7000708] PREZUNIC ENGENHO NOVO | 07:22-08:26 [7000706] PREZUNIC BENFICA | 12:06-16:20 [560060] SENDAS SANTA CRUZ  II -  LOJA 

### Prezunic - Campinho
- **c1**: EVERTON | CYB3B90
  - Escala: motorista=EVERTON placa=CYB3B90
  - KPI: motorista=EVERTON placa=CYB-3B90 | SC=06:01 CHD=06:39 SL=06:59
  - Matcher: SC=06:01 CHD=06:39 SL=06:59
  - GPS LOJA: 06:39-06:59 [7000718] PREZUNIC CAMPINHO | 07:34-07:50 [7000716] PREZUNIC CIDADE DE DEUS

### Prezunic - Cidade de Deus
- **c1**: EVERTON | CYB3B90
  - Escala: motorista=EVERTON placa=CYB3B90
  - KPI: motorista=EVERTON placa=CYB-3B90 | SC=06:01 CHD=07:34 SL=07:50
  - Matcher: SC=06:01 CHD=07:34 SL=07:50
  - GPS LOJA: 06:39-06:59 [7000718] PREZUNIC CAMPINHO | 07:34-07:50 [7000716] PREZUNIC CIDADE DE DEUS

### Prezunic - Itaoca
- **c1**: MÁRCIO | KXR7F27
  - Escala: motorista=MÁRCIO placa=KXR7F27
  - KPI: motorista=MÁRCIO placa=KXR-7F27 | SC=05:14 CHD=05:37 SL=06:16
  - Matcher: SC=05:14 CHD=05:37 SL=06:16
  - GPS LOJA: 05:37-05:42 [7000720] PREZUNIC ITAOCA | 05:43-06:16 [7000720] PREZUNIC ITAOCA | 06:34-07:07 [7000715] PREZUNIC VISTA ALEGRE | 08:26-09:39 [560023] SENDAS NILÓPOLIS - LOJA 36 | 14:41-14:57 [202009] PAX  PILARES | 15:08-15:20 [202004] PAX DEL CASTILHO

### Prezunic - Vista Alegre
- **c1**: MÁRCIO | KXR7F27
  - Escala: motorista=MÁRCIO placa=KXR7F27
  - KPI: motorista=MÁRCIO placa=KXR-7F27 | SC=05:14 CHD=06:34 SL=07:07
  - Matcher: SC=05:14 CHD=06:34 SL=07:07
  - GPS LOJA: 05:37-05:42 [7000720] PREZUNIC ITAOCA | 05:43-06:16 [7000720] PREZUNIC ITAOCA | 06:34-07:07 [7000715] PREZUNIC VISTA ALEGRE | 08:26-09:39 [560023] SENDAS NILÓPOLIS - LOJA 36 | 14:41-14:57 [202009] PAX  PILARES | 15:08-15:20 [202004] PAX DEL CASTILHO

## Problemas identificados

- Check 1 (Motorista): 2 divergências
- Check 2: 7 lojas extras no KPI
- Check 3: 2 alteração(ões) não aplicada(s)
- Check 7: 5 timestamps divergentes (matcher vs KPI)
