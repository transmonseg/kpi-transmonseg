# Análise ZONA_SUL — Dia 22/05/2026

> Análise completa com 7 checks (ver `CHECKLIST.md`)

## Sumário

- **Data:** 2026-05-22
- **Rede:** ZONA_SUL
- **Escala:** 50 linha(s)
- **Alterações:** 0
- **Unitrac:** 212 veículos, 2148 paradas
- **KPI gerado:** KPI-ZONA_SUL-2026-05-22 (1).xlsx (44 linhas)

## Check 1 — Motorista (escala vs KPI)

⚠ **8 divergência(s):**
- **MEGA BOX 01 - Olaria** (c1): escala="INACIO ARAUJO" KPI="JHONATA FREIRE DA SILVA"
- **MEGA BOX 02 - Olaria** (c1): escala="INACIO ARAUJO" KPI="NILTON RODRIGUES"
- **Zona Sul Loja 07 - Leblon** (c1): escala="ALESSIO" KPI="LUIZ ALVES"
- **Zona Sul Loja 46 - Botafogo** (c1): escala="ERIVELTON" KPI="PAULO ROBERTO"
- **Zona Sul Loja 11 - Leblon** (c1): escala="ERIVELTON" KPI="WILLIAM"
- **Zona Sul Loja 34 - Barra** (c1): escala="CARLOS GONÇALVES" KPI="ALEX"
- **Zona Sul Loja 03 - Copacabana I** (c1): escala="EVERTON" KPI="Sidney"
- **Zona Sul Loja 26 - Copacabana** (c1): escala="EVERTON" KPI="Sidney"

## Check 2 — Contagem global (escala vs KPI)

- Escala: 44 lojas distintas
- KPI: 44 lojas
✓ Contagens batem exatamente.

## Check 3 — Alterações aplicadas

Sem alterações para esta rede.

## Check 4 — Colunas extras do KPI Excel

Cabeçalhos detectados: [1] REDES / FILIAIS | [2] MOTORISTA | [3] COD | [4] PLACA | [5] SAIDA CD | [6] CHD LOJA | [7] SAIDA LOJA | [8] MOTORISTA | [9] COD | [10] PLACA | [11] SAIDA CD | [12] CHD LOJA | [13] SAIDA LOJA | [14] TEMPO EM LOJA 1 | [15] TEMPO EM LOJA 2

44 loja(s) com dados em colunas extras:
  - **MEGA BOX 01 - Olaria**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  - **MEGA BOX 02 - Olaria**: TEMPO EM LOJA 1=00:34, TEMPO EM LOJA 2=00:00
  - **Zona Sul - Entrega Extra**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  - **Zona Sul Loja 01 - Ipanema**: TEMPO EM LOJA 1=00:41, TEMPO EM LOJA 2=00:00
  - **Zona Sul Loja 03 - Copacabana I**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  - **Zona Sul Loja 04 - Copacabana II**: TEMPO EM LOJA 1=02:46, TEMPO EM LOJA 2=00:00
  - **Zona Sul Loja 05 - Copacabana III**: TEMPO EM LOJA 1=00:14, TEMPO EM LOJA 2=00:00
  - **Zona Sul Loja 06 - Gávea**: TEMPO EM LOJA 1=00:06, TEMPO EM LOJA 2=00:00
  - **Zona Sul Loja 07 - Leblon**: TEMPO EM LOJA 1=04:20, TEMPO EM LOJA 2=00:00
  - **Zona Sul Loja 08 - Ipanema**: TEMPO EM LOJA 1=00:53, TEMPO EM LOJA 2=00:00
  ... e mais 34

## Check 5 — Lat/lng das paradas (vs cadastro)

✓ Todas paradas dentro do raio cadastrado (com margem 1.5x).

## Check 6 — Ambos slots da linha do KPI

✓ Slots batem com escala.

## Check 7 — SC/CHD/SL: matcher (rodado agora) vs KPI gerado

⚠ **10 divergência(s) entre matcher local e KPI gerado:**
- **MEGA BOX 01 - Olaria** (c1): matcher=13:04/13:26/13:57 | KPI=SEM/SEM/SEM
- **MEGA BOX 02 - Olaria** (c1): matcher=13:04/14:51/15:06 | KPI=17:39/18:33/19:07
- **Zona Sul Loja 07 - Leblon** (c1): matcher=13:05/13:59/14:56 | KPI=05:20/06:23/10:42
- **Zona Sul Loja 11 - Leblon** (c1): matcher=11:17/12:30/14:21 | KPI=13:54/15:39/16:20
- **Zona Sul Loja 08 - Ipanema** (c1): matcher=14:33/17:24/17:45 | KPI=14:33/16:09/17:03
- **Zona Sul Loja 34 - Barra** (c1): matcher=04:28/07:06/08:56 | KPI=---/---/---
- **Zona Sul Loja 20 - Botafogo** (c1): matcher=17:58/19:26/19:58 | KPI=15:43/15:48/19:58
- **Zona Sul Loja 23 - Barra** (c1): matcher=---/07:23/08:02 | KPI=---/07:06/08:56
- **Zona Sul Loja 44 - Barra** (c1): matcher=---/07:35/08:01 | KPI=---/07:06/08:56
- **Zona Sul Loja 42 - Botafogo** (c1): matcher=18:52/20:23/20:51 | KPI=18:52/19:42/20:16

_Pode indicar que o KPI foi gerado com versão antiga do código. Regerar deve corrigir._

## Detalhe — Loja por loja

### Zona Sul Loja 28 - Urca
- **c1**: EDMILSON JOSÉ | LTQ0783
  - Escala: motorista=EDMILSON JOSÉ placa=LTQ0783
  - KPI: motorista=EDMILSON JOSÉ placa=LTQ-0783 | SC=13:55 CHD=15:02 SL=15:18
  - Matcher: SC=13:55 CHD=15:02 SL=15:18
  - GPS LOJA: 05:01-05:19 [9039027] 27 - ZONA SUL - IPANEMA | 05:36-06:34 [9039015] 15 - ZONA SUL - LEBLON | 15:02-15:18 [9039028] 28 - ZONA SUL - URCA | 15:34-16:09 [9039029] 29 - ZONA SUL - FLAMENGO

### Zona Sul Loja 29 - Flamengo
- **c1**: EDMILSON JOSÉ | LTQ0783
  - Escala: motorista=EDMILSON JOSÉ placa=LTQ0783
  - KPI: motorista=EDMILSON JOSÉ placa=LTQ-0783 | SC=13:55 CHD=15:34 SL=16:09
  - Matcher: SC=13:55 CHD=15:34 SL=16:09
  - GPS LOJA: 05:01-05:19 [9039027] 27 - ZONA SUL - IPANEMA | 05:36-06:34 [9039015] 15 - ZONA SUL - LEBLON | 15:02-15:18 [9039028] 28 - ZONA SUL - URCA | 15:34-16:09 [9039029] 29 - ZONA SUL - FLAMENGO

### MEGA BOX 01 - Olaria
- **c1**: INACIO ARAUJO | LQU5546
  - Escala: motorista=INACIO ARAUJO placa=LQU5546
  - KPI: motorista=JHONATA FREIRE DA SILVA placa=KYM-2I62 | SC=SEM CHD=SEM SL=SEM
  - Matcher: SC=13:04 CHD=13:26 SL=13:57
  - GPS LOJA: 13:26-13:41 [6018000] MEGA BOX (OLARIA) | 13:41-13:57 [6018000] MEGA BOX (OLARIA) | 14:51-15:06 [6018001] MEGA BOX 2 (RECREIO)
- **c1**: JHONATA FREIRE DA SILVA | KYM2I62
  - Escala: motorista=JHONATA FREIRE DA SILVA placa=KYM2I62
  - KPI: motorista=JHONATA FREIRE DA SILVA placa=KYM-2I62 | SC=SEM CHD=SEM SL=SEM
  - GPS: placa não encontrada no Unitrac

### MEGA BOX 02 - Olaria
- **c1**: INACIO ARAUJO | LQU5546
  - Escala: motorista=INACIO ARAUJO placa=LQU5546
  - KPI: motorista=NILTON RODRIGUES placa=AKZ-2594 | SC=17:39 CHD=18:33 SL=19:07
  - Matcher: SC=13:04 CHD=14:51 SL=15:06
  - GPS LOJA: 13:26-13:41 [6018000] MEGA BOX (OLARIA) | 13:41-13:57 [6018000] MEGA BOX (OLARIA) | 14:51-15:06 [6018001] MEGA BOX 2 (RECREIO)
- **c1**: NILTON RODRIGUES | AKZ2594
  - Escala: motorista=NILTON RODRIGUES placa=AKZ2594
  - KPI: motorista=NILTON RODRIGUES placa=AKZ-2594 | SC=17:39 CHD=18:33 SL=19:07
  - Matcher: SC=17:39 CHD=18:33 SL=19:07
  - GPS LOJA: 04:54-05:24 [560019] SENDAS FREGUESIA - LOJA 28 | 05:25-07:58 [560019] SENDAS FREGUESIA - LOJA 28 | 18:33-19:07 [6018001] MEGA BOX 2 (RECREIO)

### Zona Sul - Entrega Extra
- **c1**: INACIO ARAUJO | LQU5546
  - Escala: motorista=INACIO ARAUJO placa=LQU5546
  - KPI: motorista=INACIO ARAUJO placa=LQU-5546 | SC=--- CHD=--- SL=---
  - GPS: 9p mas matcher sem match
  - GPS LOJA: 13:26-13:41 [6018000] MEGA BOX (OLARIA) | 13:41-13:57 [6018000] MEGA BOX (OLARIA) | 14:51-15:06 [6018001] MEGA BOX 2 (RECREIO)

### Zona Sul Loja 07 - Leblon
- **c1**: ALESSIO | KQR2J11
  - Escala: motorista=ALESSIO placa=KQR2J11
  - KPI: motorista=LUIZ ALVES placa=LCO-0978 | SC=05:20 CHD=06:23 SL=10:42
  - Matcher: SC=13:05 CHD=13:59 SL=14:56
  - GPS LOJA: 05:31-07:46 [8590165] PRINCESA FLAMENGO | 13:59-14:56 [9039007] 07 - ZONA SUL - LEBLON
- **c1**: LUIZ ALVES | LCO0978
  - Escala: motorista=LUIZ ALVES placa=LCO0978
  - KPI: motorista=LUIZ ALVES placa=LCO-0978 | SC=05:20 CHD=06:23 SL=10:42
  - Matcher: SC=05:20 CHD=06:23 SL=10:42

### Zona Sul Loja 46 - Botafogo
- **c1**: ERIVELTON | KRH5H67
  - Escala: motorista=ERIVELTON placa=KRH5H67
  - KPI: motorista=PAULO ROBERTO placa=MDV-3746 | SC=SEM CHD=SEM SL=SEM
  - GPS: 12p mas matcher sem match
  - GPS LOJA: 05:18-06:02 [8590000] PRINCESA COSME VELHO | 09:15-09:37 [8590000] PRINCESA COSME VELHO | 12:30-14:21 [9039011] 11 - ZONA SUL - LEBLON
- **c1**: PAULO ROBERTO | MDV3746
  - Escala: motorista=PAULO ROBERTO placa=MDV3746
  - KPI: motorista=PAULO ROBERTO placa=MDV-3746 | SC=SEM CHD=SEM SL=SEM
  - GPS: placa não encontrada no Unitrac

### Zona Sul Loja 11 - Leblon
- **c1**: ERIVELTON | KRH5H67
  - Escala: motorista=ERIVELTON placa=KRH5H67
  - KPI: motorista=WILLIAM placa=INW-8A51 | SC=13:54 CHD=15:39 SL=16:20
  - Matcher: SC=11:17 CHD=12:30 SL=14:21
  - GPS LOJA: 05:18-06:02 [8590000] PRINCESA COSME VELHO | 09:15-09:37 [8590000] PRINCESA COSME VELHO | 12:30-14:21 [9039011] 11 - ZONA SUL - LEBLON
- **c1**: WILLIAM | INW8A51
  - Escala: motorista=WILLIAM placa=INW8A51
  - KPI: motorista=WILLIAM placa=INW-8A51 | SC=13:54 CHD=15:39 SL=16:20
  - Matcher: SC=13:54 CHD=15:39 SL=16:20
  - GPS LOJA: 05:19-06:11 [3030007] SUPERPRIX LJ 07 - RIACHUELO | 14:46-14:51 [9039122] 46 - ZONA SUL - BOTAFOGO | 14:55-15:11 [9039122] 46 - ZONA SUL - BOTAFOGO | 15:39-16:20 [9039011] 11 - ZONA SUL - LEBLON

### Zona Sul Loja 14 - Leblon
- **c1**: SÉRGIO JOSE DA SILVA | LJS2172
  - Escala: motorista=SÉRGIO JOSE DA SILVA placa=LJS2172
  - KPI: motorista=SÉRGIO JOSE DA SILVA placa=LJS-2172 | SC=14:33 CHD=16:09 SL=17:03
  - Matcher: SC=14:33 CHD=16:09 SL=17:03

### Zona Sul Loja 08 - Ipanema
- **c1**: SÉRGIO JOSE DA SILVA | LJS2172
  - Escala: motorista=SÉRGIO JOSE DA SILVA placa=LJS2172
  - KPI: motorista=SÉRGIO JOSE DA SILVA placa=LJS-2172 | SC=14:33 CHD=16:09 SL=17:03
  - Matcher: SC=14:33 CHD=17:24 SL=17:45

### Zona Sul Loja 12 - Leme
- **c1**: EDUARDO | QAH2H50
  - Escala: motorista=EDUARDO placa=QAH2H50
  - KPI: motorista=EDUARDO placa=QAH-2H50 | SC=SEM CHD=SEM SL=SEM
  - GPS: placa não encontrada no Unitrac

### Zona Sul Loja 38 - Copacabana
- **c1**: EDUARDO | QAH2H50
  - Escala: motorista=EDUARDO placa=QAH2H50
  - KPI: motorista=EDUARDO placa=QAH-2H50 | SC=SEM CHD=SEM SL=SEM
  - GPS: placa não encontrada no Unitrac

### Zona Sul Loja 09 - Ipanema
- **c1**: RODRIGO | KWK4593
  - Escala: motorista=RODRIGO placa=KWK4593
  - KPI: motorista=RODRIGO placa=KWK-4593 | SC=15:22 CHD=16:51 SL=17:15
  - Matcher: SC=15:22 CHD=16:51 SL=17:15
  - GPS LOJA: 16:51-17:15 [9039009] 09 - ZONA SUL - IPANEMA | 17:16-17:56 [9039001] 01 - ZONA SUL - IPANEMA

### Zona Sul Loja 01 - Ipanema
- **c1**: RODRIGO | KWK4593
  - Escala: motorista=RODRIGO placa=KWK4593
  - KPI: motorista=RODRIGO placa=KWK-4593 | SC=15:22 CHD=17:16 SL=17:56
  - Matcher: SC=15:22 CHD=17:16 SL=17:56
  - GPS LOJA: 16:51-17:15 [9039009] 09 - ZONA SUL - IPANEMA | 17:16-17:56 [9039001] 01 - ZONA SUL - IPANEMA

### Zona Sul Loja 34 - Barra
- **c1**: CARLOS GONÇALVES | LNU9595
  - Escala: motorista=CARLOS GONÇALVES placa=LNU9595
  - KPI: motorista=ALEX placa=LKW-2B80 | SC=--- CHD=--- SL=---
  - GPS: placa não encontrada no Unitrac
- **c1**: ALEX | LKW2B80
  - Escala: motorista=ALEX placa=LKW2B80
  - KPI: motorista=ALEX placa=LKW-2B80 | SC=--- CHD=--- SL=---
  - Matcher: SC=04:28 CHD=07:06 SL=08:56
  - GPS LOJA: 05:13-07:30 [9039018] 18 - ZONA SUL - COPACABANA | 15:53-17:02 [9039115] 43 - ZONA SUL - BARRA PENINSUL

### Zona Sul Loja 43 - Barra (Península)
- **c1**: ALEX | LKW2B80
  - Escala: motorista=ALEX placa=LKW2B80
  - KPI: motorista=ALEX placa=LKW-2B80 | SC=14:51 CHD=15:53 SL=17:02
  - Matcher: SC=14:51 CHD=15:53 SL=17:02
  - GPS LOJA: 05:13-07:30 [9039018] 18 - ZONA SUL - COPACABANA | 15:53-17:02 [9039115] 43 - ZONA SUL - BARRA PENINSUL

### Zona Sul Loja 35 - Barra
- **c1**: PAULO HENRIQUE | DBB8D19
  - Escala: motorista=PAULO HENRIQUE placa=DBB8D19
  - KPI: motorista=PAULO HENRIQUE placa=DBB-8D19 | SC=13:25 CHD=14:50 SL=15:46
  - Matcher: SC=13:25 CHD=14:50 SL=15:46
  - GPS LOJA: 14:50-15:46 [9039107] 35 - ZONA SUL - BARRA DA TIJUC

### Zona Sul Loja 45 - Flamengo
- **c1**: WANDERLEY | AFY7J99
  - Escala: motorista=WANDERLEY placa=AFY7J99
  - KPI: motorista=WANDERLEY placa=AFY-7J99 | SC=14:51 CHD=15:46 SL=16:24
  - Matcher: SC=14:51 CHD=15:46 SL=16:24
  - GPS LOJA: 06:04-07:51 [7000711] PREZUNIC JAURU | 07:59-08:16 [7000719] PREZUNIC TAQUARA | 15:46-16:24 [9039120] 45 - ZONA SUL - FLAMENGO

### Zona Sul Loja 40 - Ipanema
- **c1**: VLADIMIR | KQY9E24
  - Escala: motorista=VLADIMIR placa=KQY9E24
  - KPI: motorista=VLADIMIR placa=KQY-9E24 | SC=15:11 CHD=16:49 SL=17:34
  - Matcher: SC=15:11 CHD=16:49 SL=17:34
  - GPS LOJA: 05:37-07:30 [9039103] 21 - ZONA SUL - FLAMENGO | 16:49-17:34 [9039118] 40 - ZONA SUL- IPANEMA

### Zona Sul Loja 05 - Copacabana III
- **c1**: RENATO | JAJ6B36
  - Escala: motorista=RENATO placa=JAJ6B36
  - KPI: motorista=RENATO placa=JAJ-6B36 | SC=17:58 CHD=20:16 SL=20:30
  - Matcher: SC=17:58 CHD=20:16 SL=20:30
  - GPS LOJA: 05:06-08:30 [8590568] PRINCESA - RIO DAS OSTRAS | 08:55-11:22 [8590562] PRINCESA - BARRA DE SÃO JOÃO | 19:26-19:58 [9039102] 20 - ZONA SUL - BOTAFOGO | 20:16-20:30 [9039005] 05 - ZONA SUL - COPACABANA III

### Zona Sul Loja 20 - Botafogo
- **c1**: RENATO | JAJ6B36
  - Escala: motorista=RENATO placa=JAJ6B36
  - KPI: motorista=RENATO placa=JAJ-6B36 | SC=15:43 CHD=15:48 SL=19:58
  - Matcher: SC=17:58 CHD=19:26 SL=19:58
  - GPS LOJA: 05:06-08:30 [8590568] PRINCESA - RIO DAS OSTRAS | 08:55-11:22 [8590562] PRINCESA - BARRA DE SÃO JOÃO | 19:26-19:58 [9039102] 20 - ZONA SUL - BOTAFOGO | 20:16-20:30 [9039005] 05 - ZONA SUL - COPACABANA III

### Zona Sul Loja 25 - Jd. Botânico
- **c1**: MARCOS FERNANDO | TML2D79
  - Escala: motorista=MARCOS FERNANDO placa=TML2D79
  - KPI: motorista=MARCOS FERNANDO placa=TML-2D79 | SC=17:33 CHD=18:58 SL=19:25
  - Matcher: SC=17:33 CHD=18:58 SL=19:25
  - GPS LOJA: 18:58-19:25 [9039099] 25 - ZONA SUL - JD. BOTANICO | 19:35-19:58 [9039022] 22 - ZONA SUL - SAO CONRADO

### Zona Sul Loja 22 - S. Conrado
- **c1**: MARCOS FERNANDO | TML2D79
  - Escala: motorista=MARCOS FERNANDO placa=TML2D79
  - KPI: motorista=MARCOS FERNANDO placa=TML-2D79 | SC=17:33 CHD=19:35 SL=19:58
  - Matcher: SC=17:33 CHD=19:35 SL=19:58
  - GPS LOJA: 18:58-19:25 [9039099] 25 - ZONA SUL - JD. BOTANICO | 19:35-19:58 [9039022] 22 - ZONA SUL - SAO CONRADO

### Zona Sul Loja 06 - Gávea
- **c1**: MARCIO | LTH4J15
  - Escala: motorista=MARCIO placa=LTH4J15
  - KPI: motorista=MARCIO placa=LTH-4J15 | SC=18:27 CHD=20:17 SL=20:23
  - Matcher: SC=18:27 CHD=20:17 SL=20:23
  - GPS LOJA: 05:13-05:50 [22980000] EMPORIO BARRA TOWER | 06:03-06:27 [22144000] PETIT MARCHE BARRAMARES | 11:17-11:34 [11623028] VIANENSE NOVA IGUAÇU | 11:48-12:13 [11623032] VIANENSE JARDIM ALVORADA | 20:17-20:23 [9039006] 06 - ZONA SUL - GAVEA | 20:39-20:57 [9039105] 31 - ZONA SUL - JD BOTANICO

### Zona Sul Loja 31 - Jd. Botânico
- **c1**: MARCIO | LTH4J15
  - Escala: motorista=MARCIO placa=LTH4J15
  - KPI: motorista=MARCIO placa=LTH-4J15 | SC=18:27 CHD=20:39 SL=20:57
  - Matcher: SC=18:27 CHD=20:39 SL=20:57
  - GPS LOJA: 05:13-05:50 [22980000] EMPORIO BARRA TOWER | 06:03-06:27 [22144000] PETIT MARCHE BARRAMARES | 11:17-11:34 [11623028] VIANENSE NOVA IGUAÇU | 11:48-12:13 [11623032] VIANENSE JARDIM ALVORADA | 20:17-20:23 [9039006] 06 - ZONA SUL - GAVEA | 20:39-20:57 [9039105] 31 - ZONA SUL - JD BOTANICO

### Zona Sul Loja 23 - Barra
- **c1**: JONESON | EBG2D13
  - Escala: motorista=JONESON placa=EBG2D13
  - KPI: motorista=JONESON placa=EBG-2D13 | SC=--- CHD=07:06 SL=08:56
  - Matcher: SC=--- CHD=07:23 SL=08:02

### Zona Sul Loja 44 - Barra
- **c1**: JONESON | EBG2D13
  - Escala: motorista=JONESON placa=EBG2D13
  - KPI: motorista=JONESON placa=EBG-2D13 | SC=--- CHD=07:06 SL=08:56
  - Matcher: SC=--- CHD=07:35 SL=08:01

### Zona Sul Loja 17 - Barra
- **c1**: MILTON | KOP4978
  - Escala: motorista=MILTON placa=KOP4978
  - KPI: motorista=MILTON placa=KOP-4978 | SC=--- CHD=--- SL=---
  - GPS: 14p mas matcher sem match
  - GPS LOJA: 06:45-07:00 [7000710] PREZUNIC CAMPO GRANDE

### Zona Sul Loja 10 - Recreio
- **c1**: AGNALDO | LKR5990
  - Escala: motorista=AGNALDO placa=LKR5990
  - KPI: motorista=AGNALDO placa=LKR-5990 | SC=18:53 CHD=20:15 SL=20:54
  - Matcher: SC=18:53 CHD=20:15 SL=20:54
  - GPS LOJA: 07:04-08:42 [7000714] PREZUNIC OLARIA | 08:54-09:46 [7000723] PREZUNIC PENHA | 20:15-20:21 [9039010] 10 - ZONA SUL - RECREIO DOS BA | 20:22-20:54 [9039010] 10 - ZONA SUL - RECREIO DOS BA

### Zona Sul Loja 19 - Copacabana
- **c1**: ANDERSON | LVE0688
  - Escala: motorista=ANDERSON placa=LVE0688
  - KPI: motorista=ANDERSON placa=LVE-0688 | SC=17:39 CHD=19:01 SL=20:29
  - Matcher: SC=17:39 CHD=19:01 SL=20:29
  - GPS LOJA: 19:01-19:27 [9039019] 19 - ZONA SUL - COPACABANA | 19:31-20:29 [9039019] 19 - ZONA SUL - COPACABANA

### Zona Sul Loja 03 - Copacabana I
- **c1**: EVERTON | CYB3B90
  - Escala: motorista=EVERTON placa=CYB3B90
  - KPI: motorista=Sidney placa=LQE-5E01 | SC=--- CHD=--- SL=---
  - GPS: 9p mas matcher sem match
  - GPS LOJA: 06:39-06:59 [7000718] PREZUNIC CAMPINHO | 07:34-07:50 [7000716] PREZUNIC CIDADE DE DEUS

### Zona Sul Loja 26 - Copacabana
- **c1**: EVERTON | CYB3B90
  - Escala: motorista=EVERTON placa=CYB3B90
  - KPI: motorista=Sidney placa=LQE-5E01 | SC=--- CHD=--- SL=---
  - GPS: 9p mas matcher sem match
  - GPS LOJA: 06:39-06:59 [7000718] PREZUNIC CAMPINHO | 07:34-07:50 [7000716] PREZUNIC CIDADE DE DEUS

### Zona Sul Loja 32 - Laranjeiras
- **c1**: DIEGO | KQB3F31
  - Escala: motorista=DIEGO placa=KQB3F31
  - KPI: motorista=DIEGO placa=KQB-3F31 | SC=18:52 CHD=19:42 SL=20:16
  - Matcher: SC=18:52 CHD=19:42 SL=20:16
  - GPS LOJA: 07:02-08:07 [560028] SENDAS BANGU - LOJA 55 | 19:42-20:16 [9039106] 32 - ZONA SUL - LARANJEIRAS | 20:23-20:51 [9039116] 42 - ZONA SUL - BOTAFOGO - SÃO

### Zona Sul Loja 42 - Botafogo
- **c1**: DIEGO | KQB3F31
  - Escala: motorista=DIEGO placa=KQB3F31
  - KPI: motorista=DIEGO placa=KQB-3F31 | SC=18:52 CHD=19:42 SL=20:16
  - Matcher: SC=18:52 CHD=20:23 SL=20:51
  - GPS LOJA: 07:02-08:07 [560028] SENDAS BANGU - LOJA 55 | 19:42-20:16 [9039106] 32 - ZONA SUL - LARANJEIRAS | 20:23-20:51 [9039116] 42 - ZONA SUL - BOTAFOGO - SÃO

### Zona Sul Loja 47
- **c1**: PAULO ROBERTO | MDV3746
  - Escala: motorista=PAULO ROBERTO placa=MDV3746
  - KPI: motorista=PAULO ROBERTO placa=MDV-3746 | SC=SEM CHD=SEM SL=SEM
  - GPS: placa não encontrada no Unitrac

### Zona Sul Loja 1129 - Olaria
- **c1**: JHONATA FREIRE DA SILVA | KYM2I62
  - Escala: motorista=JHONATA FREIRE DA SILVA placa=KYM2I62
  - KPI: motorista=JHONATA FREIRE DA SILVA placa=KYM-2I62 | SC=SEM CHD=SEM SL=SEM
  - GPS: placa não encontrada no Unitrac

### Zona Sul Loja 33 - Humaitá
- **c1**: MOBRICI | AOP3C73
  - Escala: motorista=MOBRICI placa=AOP3C73
  - KPI: motorista=MOBRICI placa=AOP-3C73 | SC=05:02 CHD=05:49 SL=06:48
  - Matcher: SC=05:02 CHD=05:49 SL=06:48
  - GPS LOJA: 05:49-06:48 [9039104] 33 - ZONA SUL - HUMAITA | 06:54-07:12 [9039108] 36 - ZONA SUL - BOTAFOGO | 07:23-07:47 [9039104] 33 - ZONA SUL - HUMAITA | 11:51-12:49 [71039] GB 27 - RECREIO DOS BANDEIRANT

### Zona Sul Loja 36 - Botafogo
- **c1**: MOBRICI | AOP3C73
  - Escala: motorista=MOBRICI placa=AOP3C73
  - KPI: motorista=MOBRICI placa=AOP-3C73 | SC=05:02 CHD=06:54 SL=07:12
  - Matcher: SC=05:02 CHD=06:54 SL=07:12
  - GPS LOJA: 05:49-06:48 [9039104] 33 - ZONA SUL - HUMAITA | 06:54-07:12 [9039108] 36 - ZONA SUL - BOTAFOGO | 07:23-07:47 [9039104] 33 - ZONA SUL - HUMAITA | 11:51-12:49 [71039] GB 27 - RECREIO DOS BANDEIRANT

### Zona Sul Loja 30 - Laranjeiras
- **c1**: SIDNEI ANTONIO MENDES | LQE5401
  - Escala: motorista=SIDNEI ANTONIO MENDES placa=LQE5401
  - KPI: motorista=SIDNEI ANTONIO MENDES placa=LQE-5401 | SC=04:06 CHD=04:38 SL=05:14
  - Matcher: SC=04:06 CHD=04:38 SL=05:14

### Zona Sul Loja 21 - Flamengo
- **c1**: SIDNEI ANTONIO MENDES | LQE5401
  - Escala: motorista=SIDNEI ANTONIO MENDES placa=LQE5401
  - KPI: motorista=SIDNEI ANTONIO MENDES placa=LQE-5401 | SC=--- CHD=--- SL=---
  - GPS: placa não encontrada no Unitrac

### Zona Sul Loja 04 - Copacabana II
- **c1**: MARCIO | KVH9J42
  - Escala: motorista=MARCIO placa=KVH9J42
  - KPI: motorista=MARCIO placa=KVH-9J42 | SC=04:49 CHD=05:40 SL=08:26
  - Matcher: SC=04:49 CHD=05:40 SL=08:26
  - GPS LOJA: 05:40-08:26 [9039004] 04 - ZONA SUL - COPACABANA II | 13:45-14:28 [579013] FEIRA NOVA TODOS OS SANTOS | 14:37-15:22 [579010] FEIRA NOVA  CACHAMBI

### Zona Sul Loja 18 - Copacabana
- **c1**: ALEX | LKW2B80
  - Escala: motorista=ALEX placa=LKW2B80
  - KPI: motorista=ALEX placa=LKW-2B80 | SC=04:28 CHD=05:13 SL=07:30
  - Matcher: SC=04:28 CHD=05:13 SL=07:30
  - GPS LOJA: 05:13-07:30 [9039018] 18 - ZONA SUL - COPACABANA | 15:53-17:02 [9039115] 43 - ZONA SUL - BARRA PENINSUL

### Zona Sul Loja 48 - Recreio
- **c1**: JOSUE DOS SANTOS | BBH1C94
  - Escala: motorista=JOSUE DOS SANTOS placa=BBH1C94
  - KPI: motorista=JOSUE DOS SANTOS placa=BBH-1C94 | SC=04:49 CHD=05:31 SL=07:12
  - Matcher: SC=04:49 CHD=05:31 SL=07:12
  - GPS LOJA: 05:31-07:12 [9039121] 48 - ZONA SUL - RECREIO DOS BA | 13:37-14:38 [579001] FEIRA NOVA OLINDA | 14:41-15:52 [579003] FEIRA NOVA  ANCHIETA

### Zona Sul Loja 13 - Angra
- **c1**: JULIO | CZB9J19
  - Escala: motorista=JULIO placa=CZB9J19
  - KPI: motorista=JULIO placa=CZB-9J19 | SC=--- CHD=--- SL=---
  - GPS: 1p mas matcher sem match

## Problemas identificados

- Check 1 (Motorista): 8 divergências
- Check 7: 10 timestamps divergentes (matcher vs KPI)
