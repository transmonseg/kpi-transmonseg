# Análise SUPERPRIX — Dia 22/05/2026

> Análise completa com 7 checks (ver `CHECKLIST.md`)

## Sumário

- **Data:** 2026-05-22
- **Rede:** SUPERPRIX
- **Escala:** 9 linha(s)
- **Alterações:** 0
- **Unitrac:** 212 veículos, 2148 paradas
- **KPI gerado:** KPI-SUPERPRIX-2026-05-22 (1).xlsx (9 linhas)

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
  - **Super Prix - Barra - Loja 202**: TEMPO EM LOJA 1=02:03, TEMPO EM LOJA 2=00:00
  - **Super Prix - Icaraí - Loja 10 - 2° ENTREGA**: TEMPO EM LOJA 1=00:56, TEMPO EM LOJA 2=00:00
  - **Super Prix - Ipanema - Loja 201**: TEMPO EM LOJA 1=00:59, TEMPO EM LOJA 2=00:00
  - **Super Prix - Niterói - Loja 13 - 1° ENTREGA**: TEMPO EM LOJA 1=01:32, TEMPO EM LOJA 2=00:00
  - **Super Prix - Tijuca  (2° °ENTREGA) Loja 14**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  - **Super Prix -Grajaú  VERDUN Loja 04 2°ENTREGA**: TEMPO EM LOJA 1=02:27, TEMPO EM LOJA 2=00:00
  - **Super Prix -Grajaú -  Loja 08 - 1°° ENTREGA**: TEMPO EM LOJA 1=01:11, TEMPO EM LOJA 2=00:00
  - **Super Prix -Riachuelo Loja 07**: TEMPO EM LOJA 1=00:18, TEMPO EM LOJA 2=00:00
  - **Super Prix -Tijuquinha (1° ENTREGA)  Loja 13**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00

## Check 5 — Lat/lng das paradas (vs cadastro)

✓ Todas paradas dentro do raio cadastrado (com margem 1.5x).

## Check 6 — Ambos slots da linha do KPI

✓ Slots batem com escala.

## Check 7 — SC/CHD/SL: matcher (rodado agora) vs KPI gerado

⚠ **9 divergência(s) entre matcher local e KPI gerado:**
- **Super Prix -Tijuquinha (1° ENTREGA)  Loja 13** (c1): matcher=05:27/06:24/07:03 | KPI=SEM/SEM/SEM
- **Super Prix - Tijuca  (2° °ENTREGA) Loja 14** (c1): matcher=05:27/07:13/08:17 | KPI=SEM/SEM/SEM
- **Super Prix -Grajaú -  Loja 08 - 1°° ENTREGA** (c1): matcher=05:47/07:00/07:48 | KPI=05:15/06:06/07:17
- **Super Prix -Grajaú  VERDUN Loja 04 2°ENTREGA** (c1): matcher=05:47/07:54/08:49 | KPI=05:15/07:24/09:51
- **Super Prix - Ipanema - Loja 201** (c1): matcher=05:03/05:55/06:45 | KPI=04:57/05:39/06:38
- **Super Prix - Barra - Loja 202** (c1): matcher=05:27/06:02/07:33 | KPI=05:15/05:53/07:56
- **Super Prix -Riachuelo Loja 07** (c1): matcher=04:54/05:19/06:11 | KPI=04:12/04:29/04:46
- **Super Prix - Niterói - Loja 13 - 1° ENTREGA** (c1): matcher=05:09/06:00/06:49 | KPI=03:51/03:52/05:24
- **Super Prix - Icaraí - Loja 10 - 2° ENTREGA** (c1): matcher=05:09/06:52/07:45 | KPI=03:51/06:58/07:54

_Pode indicar que o KPI foi gerado com versão antiga do código. Regerar deve corrigir._

## Detalhe — Loja por loja

### Super Prix -Tijuquinha (1° ENTREGA)  Loja 13
- **c1**: ERALDO | TML7D61
  - Escala: motorista=ERALDO placa=TML7D61
  - KPI: motorista=ERALDO placa=TML-7D61 | SC=SEM CHD=SEM SL=SEM
  - Matcher: SC=05:27 CHD=06:24 SL=07:03
  - GPS LOJA: 06:24-07:03 [3030013] SUPERPRIX LJ 13 - TIJUQUINHA | 07:13-08:17 [3030014] SUPERPRIX LJ 14 - TIJUCA | 12:17-15:47 [560030] SENDAS PILARES - LJ 128 | 16:16-16:48 [560032] SENDAS BARRA I - LJ 32 | 18:16-19:20 [560042] SENDAS BARRA II - LJ 245

### Super Prix - Tijuca  (2° °ENTREGA) Loja 14
- **c1**: ERALDO | TML7D61
  - Escala: motorista=ERALDO placa=TML7D61
  - KPI: motorista=ERALDO placa=TML-7D61 | SC=SEM CHD=SEM SL=SEM
  - Matcher: SC=05:27 CHD=07:13 SL=08:17
  - GPS LOJA: 06:24-07:03 [3030013] SUPERPRIX LJ 13 - TIJUQUINHA | 07:13-08:17 [3030014] SUPERPRIX LJ 14 - TIJUCA | 12:17-15:47 [560030] SENDAS PILARES - LJ 128 | 16:16-16:48 [560032] SENDAS BARRA I - LJ 32 | 18:16-19:20 [560042] SENDAS BARRA II - LJ 245

### Super Prix -Grajaú -  Loja 08 - 1°° ENTREGA
- **c1**: BRUNO | CXA7B36
  - Escala: motorista=BRUNO placa=CXA7B36
  - KPI: motorista=BRUNO placa=CXA-7B36 | SC=05:15 CHD=06:06 SL=07:17
  - Matcher: SC=05:47 CHD=07:00 SL=07:48
  - GPS LOJA: 07:00-07:48 [3030008] SUPERPRIX LJ 08 - GRAJAÚ | 07:54-08:49 [3030004] SUPERPRIX LJ 04 - GRAJAÚ VERDU

### Super Prix -Grajaú  VERDUN Loja 04 2°ENTREGA
- **c1**: BRUNO | CXA7B36
  - Escala: motorista=BRUNO placa=CXA7B36
  - KPI: motorista=BRUNO placa=CXA-7B36 | SC=05:15 CHD=07:24 SL=09:51
  - Matcher: SC=05:47 CHD=07:54 SL=08:49
  - GPS LOJA: 07:00-07:48 [3030008] SUPERPRIX LJ 08 - GRAJAÚ | 07:54-08:49 [3030004] SUPERPRIX LJ 04 - GRAJAÚ VERDU

### Super Prix - Ipanema - Loja 201
- **c1**: CLEYTON | FHO5F88
  - Escala: motorista=CLEYTON placa=FHO5F88
  - KPI: motorista=CLEYTON placa=FHO-5F88 | SC=04:57 CHD=05:39 SL=06:38
  - Matcher: SC=05:03 CHD=05:55 SL=06:45
  - GPS LOJA: 05:55-06:45 [3030201] SUPERPRIX LJ 201 - IPANEMA

### Super Prix - Barra - Loja 202
- **c1**: MATHEUS SANDES | UBG7F79
  - Escala: motorista=MATHEUS SANDES placa=UBG7F79
  - KPI: motorista=MATHEUS SANDES placa=UBG-7F79 | SC=05:15 CHD=05:53 SL=07:56
  - Matcher: SC=05:27 CHD=06:02 SL=07:33

### Super Prix -Riachuelo Loja 07
- **c1**: WILLIAM | INW8A51
  - Escala: motorista=WILLIAM placa=INW8A51
  - KPI: motorista=WILLIAM placa=INW-8A51 | SC=04:12 CHD=04:29 SL=04:46
  - Matcher: SC=04:54 CHD=05:19 SL=06:11
  - GPS LOJA: 05:19-06:11 [3030007] SUPERPRIX LJ 07 - RIACHUELO | 14:46-14:51 [9039122] 46 - ZONA SUL - BOTAFOGO | 14:55-15:11 [9039122] 46 - ZONA SUL - BOTAFOGO | 15:39-16:20 [9039011] 11 - ZONA SUL - LEBLON

### Super Prix - Niterói - Loja 13 - 1° ENTREGA
- **c1**: RODRIGO | KZC4D39
  - Escala: motorista=RODRIGO placa=KZC4D39
  - KPI: motorista=RODRIGO placa=KZC-4D39 | SC=03:51 CHD=03:52 SL=05:24
  - Matcher: SC=05:09 CHD=06:00 SL=06:49
  - GPS LOJA: 06:00-06:49 [3030113] SUPERPRIX LJ 13 - NITEROI | 06:52-07:45 [3030011] SUPERPRIX LJ 10 - ICARAÍ

### Super Prix - Icaraí - Loja 10 - 2° ENTREGA
- **c1**: RODRIGO | KZC4D39
  - Escala: motorista=RODRIGO placa=KZC4D39
  - KPI: motorista=RODRIGO placa=KZC-4D39 | SC=03:51 CHD=06:58 SL=07:54
  - Matcher: SC=05:09 CHD=06:52 SL=07:45
  - GPS LOJA: 06:00-06:49 [3030113] SUPERPRIX LJ 13 - NITEROI | 06:52-07:45 [3030011] SUPERPRIX LJ 10 - ICARAÍ

## Problemas identificados

- Check 7: 9 timestamps divergentes (matcher vs KPI)
