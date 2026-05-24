# Análise ASSAI — Dia 22/05/2026

> Análise completa com 7 checks (ver `CHECKLIST.md`)

## Sumário

- **Data:** 2026-05-22
- **Rede:** ASSAI
- **Escala:** 40 linha(s)
- **Alterações:** 0
- **Unitrac:** 212 veículos, 2148 paradas
- **KPI gerado:** KPI-ASSAI-2026-05-22 (2).xlsx (41 linhas)

## Check 1 — Motorista (escala vs KPI)

✓ Todos motoristas batem com a escala.

## Check 2 — Contagem global (escala vs KPI)

- Escala: 40 lojas distintas
- KPI: 41 lojas
⚠ **1 loja(s) na escala mas FALTANDO no KPI:**
  - AssaÍ - Ilha do Governador - Loja 29
⚠ **2 loja(s) no KPI mas SEM escala:**
  - Assaí - Cordovil - Loja 231
  - Assaí - Ilha do Governador - Loja 29

## Check 3 — Alterações aplicadas

Sem alterações para esta rede.

## Check 4 — Colunas extras do KPI Excel

Cabeçalhos detectados: [1] REDES / FILIAIS | [2] MOTORISTA | [3] COD | [4] PLACA | [5] SAIDA CD | [6] CHD LOJA | [7] SAIDA LOJA | [8] MOTORISTA | [9] COD | [10] PLACA | [11] SAIDA CD | [12] CHD LOJA | [13] SAIDA LOJA | [14] TEMPO EM LOJA 1 | [15] TEMPO EM LOJA 2

41 loja(s) com dados em colunas extras:
  - **Assaí - Alcântara I - Loja 35**: TEMPO EM LOJA 1=02:06, TEMPO EM LOJA 2=00:00
  - **Assaí - Alcântara II - Loja 293**: TEMPO EM LOJA 1=04:03, TEMPO EM LOJA 2=00:00
  - **Assaí - Araruama - Loja 221**: TEMPO EM LOJA 1=04:25, TEMPO EM LOJA 2=00:00
  - **Assaí - Bangu I - Loja 55**: TEMPO EM LOJA 1=01:05, TEMPO EM LOJA 2=00:00
  - **Assaí - Bangu II - Loja 332**: TEMPO EM LOJA 1=00:48, TEMPO EM LOJA 2=00:00
  - **Assaí - Barra I (Senna) - Loja 133**: TEMPO EM LOJA 1=03:06, TEMPO EM LOJA 2=00:00
  - **Assaí - Barra II  - Loja 245**: TEMPO EM LOJA 1=00:05, TEMPO EM LOJA 2=00:00
  - **Assaí - Boulevard (Vila Isabel) - Loja 294**: TEMPO EM LOJA 1=00:17, TEMPO EM LOJA 2=00:00
  - **Assaí - Cabo Frio - Loja 82**: TEMPO EM LOJA 1=05:14, TEMPO EM LOJA 2=00:00
  - **Assaí - Campinho - Loja 37**: TEMPO EM LOJA 1=04:59, TEMPO EM LOJA 2=00:00
  ... e mais 31

## Check 5 — Lat/lng das paradas (vs cadastro)

✓ Todas paradas dentro do raio cadastrado (com margem 1.5x).

## Check 6 — Ambos slots da linha do KPI

⚠ **1 divergência(s):**
- **Assaí - Ilha do Governador - Loja 29**: KPI tem 1º carro mas escala não tem

## Check 7 — SC/CHD/SL: matcher (rodado agora) vs KPI gerado

⚠ **6 divergência(s) entre matcher local e KPI gerado:**
- **Assaí - Bangu II - Loja 332** (c1): matcher=05:27/09:18/09:53 | KPI=05:27/07:44/08:32
- **Assaí - Carioca Shopping - Loja 316** (c1): matcher=05:37/05:52/14:38 | KPI=04:57/05:10/14:38
- **Assaí - Ceasa - Loja 42** (c1): matcher=17:43/18:16/19:20 | KPI=---/---/---
- **Assaí - Cesário de Melo - Loja 202** (c1): matcher=04:28/05:11/10:14 | KPI=04:01/04:06/10:14
- **Assaí - Macaé - Loja 232** (c1): matcher=---/02:59/08:33 | KPI=---/---/---
- **Assaí - Petrópolis- Loja 181** (c1): matcher=02:52/04:28/05:25 | KPI=---/02:42/05:25

_Pode indicar que o KPI foi gerado com versão antiga do código. Regerar deve corrigir._

## Detalhe — Loja por loja

### Assaí - Alcântara I - Loja 35
- **c1**: SIMÃO | LSN6I72
  - Escala: motorista=SIMÃO placa=LSN6I72
  - KPI: motorista=SIMÃO placa=LSN-6I72 | SC=05:55 CHD=08:02 SL=10:08
  - Matcher: SC=05:55 CHD=08:02 SL=10:08
  - GPS LOJA: 00:06-05:08 [17659001] O BOM CAMPO GRANDE | 05:35-05:55 [17659001] O BOM CAMPO GRANDE | 07:46-07:52 [17659001] O BOM CAMPO GRANDE | 08:02-08:39 [560022] SENDAS ALCÂNTARA I - LOJA 35 | 08:43-10:02 [560022] SENDAS ALCÂNTARA I - LOJA 35 | 10:04-10:08 [560022] SENDAS ALCÂNTARA I - LOJA 35 | 11:23-12:42 [17659001] O BOM CAMPO GRANDE | 12:44-13:38 [17659001] O BOM CAMPO GRANDE | 13:44-15:18 [17659001] O BOM CAMPO GRANDE | 15:55-16:16 [17659001] O BOM CAMPO GRANDE | 16:59-17:35 [17659001] O BOM CAMPO GRANDE | 17:38-18:46 [17659001] O BOM CAMPO GRANDE | 18:53-18:58 [17659001] O BOM CAMPO GRANDE | 20:12-23:50 [17659001] O BOM CAMPO GRANDE

### Assaí - Alcântara II - Loja 293
- **c1**: LUIZ CARLOS | FQN6J72
  - Escala: motorista=LUIZ CARLOS placa=FQN6J72
  - KPI: motorista=LUIZ CARLOS placa=FQN-6J72 | SC=05:15 CHD=06:27 SL=10:30
  - Matcher: SC=05:15 CHD=06:27 SL=10:30

### Assaí - Araruama - Loja 221
- **c1**: ADILSON | KZU4C37
  - Escala: motorista=ADILSON placa=KZU4C37
  - KPI: motorista=ADILSON placa=KZU-4C37 | SC=03:53 CHD=06:12 SL=10:38
  - Matcher: SC=03:53 CHD=06:12 SL=10:38
  - GPS LOJA: 06:12-10:38 [560049] SENDAS ARARUAMA - LJ 221

### Assaí - Bangu I - Loja 55
- **c1**: DIEGO | KQB3F31
  - Escala: motorista=DIEGO placa=KQB3F31
  - KPI: motorista=DIEGO placa=KQB-3F31 | SC=06:22 CHD=07:02 SL=08:07
  - Matcher: SC=06:22 CHD=07:02 SL=08:07
  - GPS LOJA: 07:02-08:07 [560028] SENDAS BANGU - LOJA 55 | 19:42-20:16 [9039106] 32 - ZONA SUL - LARANJEIRAS | 20:23-20:51 [9039116] 42 - ZONA SUL - BOTAFOGO - SÃO

### Assaí - Bangu II - Loja 332
- **c1**: MATHEUS SANDES | UBG7F79
  - Escala: motorista=MATHEUS SANDES placa=UBG7F79
  - KPI: motorista=MATHEUS SANDES placa=UBG-7F79 | SC=05:27 CHD=07:44 SL=08:32
  - Matcher: SC=05:27 CHD=09:18 SL=09:53

### Assaí - Barra I (Senna) - Loja 133
- **c1**: FLAVIANO | SFG2F73
  - Escala: motorista=FLAVIANO placa=SFG2F73
  - KPI: motorista=FLAVIANO placa=SFG-2F73 | SC=04:40 CHD=06:07 SL=09:13
  - Matcher: SC=04:40 CHD=06:07 SL=09:13
  - GPS LOJA: 06:07-09:13 [560032] SENDAS BARRA I - LJ 32

### Assaí - Barra II  - Loja 245
- **c1**: CELSO | SFG2F72
  - Escala: motorista=CELSO placa=SFG2F72
  - KPI: motorista=CELSO placa=SFG-2F72 | SC=04:49 CHD=10:30 SL=10:34
  - Matcher: SC=04:49 CHD=10:30 SL=10:34
  - GPS LOJA: 10:30-10:34 [560042] SENDAS BARRA II - LJ 245

### Assaí - Boulevard (Vila Isabel) - Loja 294
- **c1**: RODRIGO | QSO8D04
  - Escala: motorista=RODRIGO placa=QSO8D04
  - KPI: motorista=RODRIGO placa=QSO-8D04 | SC=05:27 CHD=11:20 SL=11:36
  - Matcher: SC=05:27 CHD=11:20 SL=11:36

### Assaí - Cabo Frio - Loja 82
- **c1**: JOSE | AWA6B40
  - Escala: motorista=JOSE placa=AWA6B40
  - KPI: motorista=JOSE placa=AWA-6B40 | SC=02:34 CHD=05:36 SL=10:50
  - Matcher: SC=02:34 CHD=05:36 SL=10:50
  - GPS LOJA: 05:36-06:07 [560017] SENDAS CABO FRIO - LOJA 82 | 06:09-06:18 [560017] SENDAS CABO FRIO - LOJA 82 | 06:38-10:09 [560017] SENDAS CABO FRIO - LOJA 82 | 10:10-10:50 [560017] SENDAS CABO FRIO - LOJA 82

### Assaí - Campinho - Loja 37
- **c1**: ANTÔNIO | LFJ8442
  - Escala: motorista=ANTÔNIO placa=LFJ8442
  - KPI: motorista=ANTÔNIO placa=LFJ-8442 | SC=04:37 CHD=05:00 SL=09:58
  - Matcher: SC=04:37 CHD=05:00 SL=09:58
  - GPS LOJA: 05:00-06:31 [560024] SENDAS CAMPINHO - LOJA 37 | 06:33-06:49 [560024] SENDAS CAMPINHO - LOJA 37 | 08:03-09:40 [560024] SENDAS CAMPINHO - LOJA 37 | 09:41-09:58 [560024] SENDAS CAMPINHO - LOJA 37

### Assaí - Campos dos Goytacazes- Loja 188
- **c1**: JUCA | CZZ8H82
  - Escala: motorista=JUCA placa=CZZ8H82
  - KPI: motorista=JUCA placa=CZZ-8H82 | SC=--- CHD=04:12 SL=09:23
  - Matcher: SC=--- CHD=04:12 SL=09:23
  - GPS LOJA: 04:12-06:03 [560036] SENDAS CAMPOS - LJ 36 | 06:04-09:23 [560036] SENDAS CAMPOS - LJ 36

### Assaí - Carioca Shopping - Loja 316
- **c1**: MARCUS VINICIUS | QSW3B65
  - Escala: motorista=MARCUS VINICIUS placa=QSW3B65
  - KPI: motorista=MARCUS VINICIUS placa=QSW-3B65 | SC=04:57 CHD=05:10 SL=14:38
  - Matcher: SC=05:37 CHD=05:52 SL=14:38
  - GPS LOJA: 05:52-08:26 [560048] SENDAS CARIOCA SHOPPING | 08:28-08:46 [560048] SENDAS CARIOCA SHOPPING | 08:47-14:38 [560048] SENDAS CARIOCA SHOPPING

### Assaí - Caxias I - Loja 131
- **c1**: ROBERTO ALMEIDA | KPT5B20
  - Escala: motorista=ROBERTO ALMEIDA placa=KPT5B20
  - KPI: motorista=ROBERTO ALMEIDA placa=KPT-5B20 | SC=05:31 CHD=05:59 SL=06:11
  - Matcher: SC=05:31 CHD=05:59 SL=06:11

### Assaí - Caxias II (Parque Fluminense) - Loja 219
- **c1**: ANDERSON | LCE4337
  - Escala: motorista=ANDERSON placa=LCE4337
  - KPI: motorista=ANDERSON placa=LCE-4337 | SC=--- CHD=12:45 SL=12:49
  - Matcher: SC=--- CHD=12:45 SL=12:49

### Assaí - Ceasa - Loja 42
- **c1**: ANTONIO CARLOS | EZU9325
  - Escala: motorista=ANTONIO CARLOS placa=EZU9325
  - KPI: motorista=ANTONIO CARLOS placa=EZU-9325 | SC=--- CHD=--- SL=---
  - Matcher: SC=17:43 CHD=18:16 SL=19:20

### Assaí - Cesário de Melo - Loja 202
- **c1**: FÁBIO ALVES | GSK0G53
  - Escala: motorista=FÁBIO ALVES placa=GSK0G53
  - KPI: motorista=FÁBIO ALVES placa=GSK-0G53 | SC=04:01 CHD=04:06 SL=10:14
  - Matcher: SC=04:28 CHD=05:11 SL=10:14
  - GPS LOJA: 05:11-10:14 [560039] SENDAS CESÁRIO DE MELO - LJ 20

### Assaí - Freguesia - Loja 28
- **c1**: NILTON | AKZ2594
  - Escala: motorista=NILTON placa=AKZ2594
  - KPI: motorista=NILTON placa=AKZ-2594 | SC=04:23 CHD=04:54 SL=07:58
  - Matcher: SC=04:23 CHD=04:54 SL=07:58
  - GPS LOJA: 04:54-05:24 [560019] SENDAS FREGUESIA - LOJA 28 | 05:25-07:58 [560019] SENDAS FREGUESIA - LOJA 28 | 18:33-19:07 [6018001] MEGA BOX 2 (RECREIO)

### Assaí - Galeão - Loja 302
- **c1**: EDMARIO | CUC6J83
  - Escala: motorista=EDMARIO placa=CUC6J83
  - KPI: motorista=EDMARIO placa=CUC-6J83 | SC=05:11 CHD=05:52 SL=08:44
  - Matcher: SC=05:11 CHD=05:52 SL=08:44
  - GPS LOJA: 05:52-06:20 [560051] SENDAS GALEÃO - LJ 302 | 06:21-08:44 [560051] SENDAS GALEÃO - LJ 302

### AssaÍ - Ilha do Governador - Loja 29
⚠ Não encontrada no KPI gerado

### Assaí - Macaé - Loja 232
- **c1**: HÉLIO | LQA4I25
  - Escala: motorista=HÉLIO placa=LQA4I25
  - KPI: motorista=HÉLIO placa=LQA-4I25 | SC=--- CHD=--- SL=---
  - Matcher: SC=--- CHD=02:59 SL=08:33
  - GPS LOJA: 02:59-06:24 [560041] SENDAS MACAÉ - LOJA 232 | 06:44-08:33 [560041] SENDAS MACAÉ - LOJA 232

### Assaí - Maracanã - Loja 286
- **c1**: VICTOR LUIZ | TJQ6J26
  - Escala: motorista=VICTOR LUIZ placa=TJQ6J26
  - KPI: motorista=VICTOR LUIZ placa=TJQ-6J26 | SC=05:07 CHD=13:40 SL=13:51
  - Matcher: SC=05:07 CHD=13:40 SL=13:51

### Assaí - Méier - Loja 160
- **c1**: LUIZ JR. | AKZ2745
  - Escala: motorista=LUIZ JR. placa=AKZ2745
  - KPI: motorista=LUIZ JR. placa=AKZ-2745 | SC=04:54 CHD=05:34 SL=07:29
  - Matcher: SC=04:54 CHD=05:34 SL=07:29
  - GPS LOJA: 05:34-07:29 [560031] SENDAS MEIER | 14:47-15:00 [202005] PAX GUADALUPE

### Assaí - Mendanha (Campo Grande) - Loja 65
- **c1**: VALDEMIRIO | QSU6I54
  - Escala: motorista=VALDEMIRIO placa=QSU6I54
  - KPI: motorista=VALDEMIRIO placa=QSU-6I54 | SC=05:11 CHD=05:47 SL=11:17
  - Matcher: SC=05:11 CHD=05:47 SL=11:17
  - GPS LOJA: 00:04-04:30 [5353012] REGINA  BARRA DO IMBUY | 04:54-05:11 [5353012] REGINA  BARRA DO IMBUY | 05:47-11:17 [560016] SENDAS MENDANHA - LOJA 65 | 11:46-12:54 [5353012] REGINA  BARRA DO IMBUY | 13:02-13:17 [5353012] REGINA  BARRA DO IMBUY | 13:55-14:41 [5353012] REGINA  BARRA DO IMBUY | 15:12-15:37 [5353012] REGINA  BARRA DO IMBUY | 16:18-17:39 [5353012] REGINA  BARRA DO IMBUY | 17:45-23:59 [5353012] REGINA  BARRA DO IMBUY

### Assaí - Mesquita (Dutra) - Loja 142
- **c1**: WALLACE FERNANDES | TML1D82
  - Escala: motorista=WALLACE FERNANDES placa=TML1D82
  - KPI: motorista=WALLACE FERNANDES placa=TML-1D82 | SC=06:11 CHD=06:33 SL=11:30
  - Matcher: SC=06:11 CHD=06:33 SL=11:30
  - GPS LOJA: 06:33-11:30 [560035] SENDAS MESQUITA - LJ 35

### Assaí - Nilópolis - Loja 36
- **c1**: EDVALDO | KSJ1479
  - Escala: motorista=EDVALDO placa=KSJ1479
  - KPI: motorista=EDVALDO placa=KSJ-1479 | SC=05:31 CHD=06:06 SL=06:54
  - Matcher: SC=05:31 CHD=06:06 SL=06:54
  - GPS LOJA: 06:06-06:18 [560023] SENDAS NILÓPOLIS - LOJA 36 | 06:22-06:54 [560023] SENDAS NILÓPOLIS - LOJA 36

### Assaí - Niterói - Loja 41
- **c1**: JOSÉLIO | KRK3D12
  - Escala: motorista=JOSÉLIO placa=KRK3D12
  - KPI: motorista=JOSÉLIO placa=KRK-3D12 | SC=05:21 CHD=06:18 SL=10:15
  - Matcher: SC=05:21 CHD=06:18 SL=10:15
  - GPS LOJA: 06:18-10:15 [560025] SENDAS NITERÓI - LOJA 41

### Assaí - Niterói Ponte - Loja 292
- **c1**: MESSIAS | AMW3424
  - Escala: motorista=MESSIAS placa=AMW3424
  - KPI: motorista=MESSIAS placa=AMW-3424 | SC=SEM CHD=SEM SL=SEM
  - GPS: placa não encontrada no Unitrac

### Assaí - Nova Iguaçu - Loja 30
- **c1**: GABRIEL | KPR9E13
  - Escala: motorista=GABRIEL placa=KPR9E13
  - KPI: motorista=GABRIEL placa=KPR-9E13 | SC=--- CHD=05:48 SL=06:31
  - Matcher: SC=--- CHD=05:48 SL=06:31
  - GPS LOJA: 05:48-06:31 [560021] SENDAS NOVA IGUAÇU - LOJA 30

### Assaí - Nova Iguaçu 2 - Loja 291
- **c1**: EDUARDO | NTT4858
  - Escala: motorista=EDUARDO placa=NTT4858
  - KPI: motorista=EDUARDO placa=NTT-4858 | SC=05:22 CHD=05:49 SL=10:56
  - Matcher: SC=05:22 CHD=05:49 SL=10:56
  - GPS LOJA: 05:49-10:56 [560054] SENDAS NOVA IGUAÇU II

### Assaí - Petrópolis- Loja 181
- **c1**: CARLINHOS | KMZ7057
  - Escala: motorista=CARLINHOS placa=KMZ7057
  - KPI: motorista=CARLINHOS placa=KMZ-7057 | SC=--- CHD=02:42 SL=05:25
  - Matcher: SC=02:52 CHD=04:28 SL=05:25
  - GPS LOJA: 04:28-05:25 [560038] SENDAS PETRÓPOLIS - LJ 38

### Assaí - Pilares - Loja 128
- **c1**: JOAO CARLOS | LOT2962
  - Escala: motorista=JOAO CARLOS placa=LOT2962
  - KPI: motorista=JOAO CARLOS placa=LOT-2962 | SC=05:18 CHD=05:42 SL=11:42
  - Matcher: SC=05:18 CHD=05:42 SL=11:42
  - GPS LOJA: 05:42-11:42 [560030] SENDAS PILARES - LJ 128

### Assaí - Sabão Rio (Benfica) - Loja 136
- **c1**: FELIPE DIEGO | UGA1D55
  - Escala: motorista=FELIPE DIEGO placa=UGA1D55
  - KPI: motorista=FELIPE DIEGO placa=UGA-1D55 | SC=--- CHD=--- SL=---
  - GPS: 9p mas matcher sem match

### Assaí - Santa Cruz - Loja 201
- **c1**: ADRIANO | CEJ3426
  - Escala: motorista=ADRIANO placa=CEJ3426
  - KPI: motorista=ADRIANO placa=CEJ-3426 | SC=--- CHD=05:58 SL=13:16
  - Matcher: SC=--- CHD=05:58 SL=13:16
  - GPS LOJA: 05:58-06:27 [560037] SENDAS SANTA CRUZ - LJ 37 | 06:28-06:54 [560037] SENDAS SANTA CRUZ - LJ 37 | 07:12-08:24 [560037] SENDAS SANTA CRUZ - LJ 37 | 10:23-10:53 [560037] SENDAS SANTA CRUZ - LJ 37 | 11:03-11:33 [560037] SENDAS SANTA CRUZ - LJ 37 | 11:53-13:16 [560037] SENDAS SANTA CRUZ - LJ 37

### Assaí - Santa Cruz 2 - Loja 338
- **c1**: ADRIANO | TML5I70
  - Escala: motorista=ADRIANO placa=TML5I70
  - KPI: motorista=ADRIANO placa=TML-5I70 | SC=10:20 CHD=12:06 SL=16:20
  - Matcher: SC=10:20 CHD=12:06 SL=16:20
  - GPS LOJA: 06:03-07:02 [7000708] PREZUNIC ENGENHO NOVO | 07:22-08:26 [7000706] PREZUNIC BENFICA | 12:06-16:20 [560060] SENDAS SANTA CRUZ  II -  LOJA 

### Assaí - São Gonçalo Camil - Loja 211
- **c1**: LUIS FERREIRA | LAU1I64
  - Escala: motorista=LUIS FERREIRA placa=LAU1I64
  - KPI: motorista=LUIS FERREIRA placa=LAU-1I64 | SC=SEM CHD=SEM SL=SEM
  - GPS: placa não encontrada no Unitrac

### Assaí - São Gonçalo Centro - Loja 266
- **c1**: LUCIANO MARINHO | TML7D21
  - Escala: motorista=LUCIANO MARINHO placa=TML7D21
  - KPI: motorista=LUCIANO MARINHO placa=TML-7D21 | SC=05:30 CHD=07:46 SL=11:50
  - Matcher: SC=05:30 CHD=07:46 SL=11:50
  - GPS LOJA: 07:46-07:54 [560047] SENDAS SÃO GONÇALO CENTRO | 07:57-11:50 [560047] SENDAS SÃO GONÇALO CENTRO

### Assaí - São João do Meriti  - Loja 217
- **c1**: DANIEL | LKV5067
  - Escala: motorista=DANIEL placa=LKV5067
  - KPI: motorista=DANIEL placa=LKV-5067 | SC=06:02 CHD=06:15 SL=10:35
  - Matcher: SC=06:02 CHD=06:15 SL=10:35
  - GPS LOJA: 00:00-05:36 [17659002] EMANUEL CACHAMORRA | 05:44-06:02 [17659002] EMANUEL CACHAMORRA | 06:15-07:00 [560040] SENDAS SÃO JOÃO DE MERITI | 07:01-10:35 [560040] SENDAS SÃO JOÃO DE MERITI | 10:51-12:28 [17659002] EMANUEL CACHAMORRA | 12:29-13:03 [17659002] EMANUEL CACHAMORRA | 13:05-13:11 [17659002] EMANUEL CACHAMORRA | 13:45-13:49 [17659002] EMANUEL CACHAMORRA | 14:09-14:41 [17659002] EMANUEL CACHAMORRA | 15:22-15:36 [17659002] EMANUEL CACHAMORRA | 15:39-15:50 [17659002] EMANUEL CACHAMORRA | 15:51-19:53 [17659002] EMANUEL CACHAMORRA | 19:55-20:18 [17659002] EMANUEL CACHAMORRA | 20:35-21:33 [17659002] EMANUEL CACHAMORRA | 21:50-23:51 [17659002] EMANUEL CACHAMORRA

### Assaí - Taquara   - Loja 340
- **c1**: WALTER REGIS | UBO0B68
  - Escala: motorista=WALTER REGIS placa=UBO0B68
  - KPI: motorista=WALTER REGIS placa=UBO-0B68 | SC=06:16 CHD=06:54 SL=12:49
  - Matcher: SC=06:16 CHD=06:54 SL=12:49
  - GPS LOJA: 06:54-07:19 [560062] SENDAS JACAREPAGUA - LOJA 340  | 07:20-12:49 [560062] SENDAS JACAREPAGUA - LOJA 340 

### Assaí - Tijuca II  - Loja 150
- **c1**: VALDIR | DDI6J90
  - Escala: motorista=VALDIR placa=DDI6J90
  - KPI: motorista=VALDIR placa=DDI-6J90 | SC=04:56 CHD=05:31 SL=08:02
  - Matcher: SC=04:56 CHD=05:31 SL=08:02
  - GPS LOJA: 05:31-06:08 [560043] SENDAS TIJUCA II - LJ 43 | 06:11-08:02 [560043] SENDAS TIJUCA II - LJ 43

### Assaí - Tribobó - Loja 248
- **c1**: FÁBIO DEUSETI | LON7G98
  - Escala: motorista=FÁBIO DEUSETI placa=LON7G98
  - KPI: motorista=FÁBIO DEUSETI placa=LON-7G98 | SC=--- CHD=--- SL=---
  - GPS: 16p mas matcher sem match

## Problemas identificados

- Check 2: 1 lojas faltando no KPI
- Check 2: 2 lojas extras no KPI
- Check 6: 1 slots divergentes
- Check 7: 6 timestamps divergentes (matcher vs KPI)
