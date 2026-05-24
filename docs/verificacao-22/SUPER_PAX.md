# Análise SUPER_PAX — Dia 22/05/2026

> Análise completa com 7 checks (ver `CHECKLIST.md`)

## Sumário

- **Data:** 2026-05-22
- **Rede:** SUPER_PAX
- **Escala:** 12 linha(s)
- **Alterações:** 0
- **Unitrac:** 212 veículos, 2148 paradas
- **KPI gerado:** KPI-SUPER_PAX-2026-05-22 (1).xlsx (12 linhas)

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
  - **Del Castilho**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  - **Engenho de Dentro**: TEMPO EM LOJA 1=00:43, TEMPO EM LOJA 2=00:00
  - **Guadalupe**: TEMPO EM LOJA 1=00:13, TEMPO EM LOJA 2=00:00
  - **Inhauma**: TEMPO EM LOJA 1=00:28, TEMPO EM LOJA 2=00:00
  - **Lins**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  - **Madureira**: TEMPO EM LOJA 1=00:32, TEMPO EM LOJA 2=00:00
  - **Oswaldo Cruz**: TEMPO EM LOJA 1=01:14, TEMPO EM LOJA 2=00:00
  - **Pilares**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  - **Realengo**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  - **Sepetiba**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  ... e mais 2

## Check 5 — Lat/lng das paradas (vs cadastro)

✓ Todas paradas dentro do raio cadastrado (com margem 1.5x).

## Check 6 — Ambos slots da linha do KPI

✓ Slots batem com escala.

## Check 7 — SC/CHD/SL: matcher (rodado agora) vs KPI gerado

✓ Todos timestamps batem.

## Detalhe — Loja por loja

### Sepetiba
- **c1**: FERNANDO CARDOSO | UGA1D55
  - Escala: motorista=FERNANDO CARDOSO placa=UGA1D55
  - KPI: motorista=FERNANDO CARDOSO placa=UGA-1D55 | SC=--- CHD=--- SL=---
  - GPS: 9p mas matcher sem match

### Lins
- **c1**: CARLOS | LUP1F13
  - Escala: motorista=CARLOS placa=LUP1F13
  - KPI: motorista=CARLOS placa=LUP-1F13 | SC=SEM CHD=SEM SL=SEM
  - GPS: placa não encontrada no Unitrac

### Realengo
- **c1**: LUIZ ANTONIO | KMY5561
  - Escala: motorista=LUIZ ANTONIO placa=KMY5561
  - KPI: motorista=LUIZ ANTONIO placa=KMY-5561 | SC=--- CHD=--- SL=---
  - GPS: 8p mas matcher sem match
  - GPS LOJA: 06:13-06:59 [9006001] CARREFOUR BARRA

### Inhauma
- **c1**: WALLACE | ETI5F79
  - Escala: motorista=WALLACE placa=ETI5F79
  - KPI: motorista=WALLACE placa=ETI-5F79 | SC=14:08 CHD=14:36 SL=15:04
  - Matcher: SC=14:08 CHD=14:36 SL=15:04
  - GPS LOJA: 05:22-05:29 [7000726] PREZUNIC PADRE MIGUEL | 05:34-06:31 [7000726] PREZUNIC PADRE MIGUEL | 14:36-15:04 [202003] PAX INHAUMA

### Engenho de Dentro
- **c1**: SERGIO FIDELIS | LOU9928
  - Escala: motorista=SERGIO FIDELIS placa=LOU9928
  - KPI: motorista=SERGIO FIDELIS placa=LOU-9928 | SC=14:13 CHD=15:13 SL=15:56
  - Matcher: SC=14:13 CHD=15:13 SL=15:56
  - GPS LOJA: 07:27-07:56 [7000724] PREZUNIC CACHAMBI | 15:13-15:56 [202001] PAX ENGENHO DE DENTRO

### Madureira
- **c1**: DOVAL | KQV1D80
  - Escala: motorista=DOVAL placa=KQV1D80
  - KPI: motorista=DOVAL placa=KQV-1D80 | SC=14:24 CHD=14:51 SL=15:22
  - Matcher: SC=14:24 CHD=14:51 SL=15:22
  - GPS LOJA: 06:17-09:45 [7000722] PREZUNIC FONSECA | 14:51-15:22 [202006] PAX MADUREIRA | 15:24-15:51 [202000] PAX OSWALDO CRUZ | 15:54-16:37 [202000] PAX OSWALDO CRUZ

### Oswaldo Cruz
- **c1**: DOVAL | KQV1D80
  - Escala: motorista=DOVAL placa=KQV1D80
  - KPI: motorista=DOVAL placa=KQV-1D80 | SC=14:24 CHD=15:24 SL=16:37
  - Matcher: SC=14:24 CHD=15:24 SL=16:37
  - GPS LOJA: 06:17-09:45 [7000722] PREZUNIC FONSECA | 14:51-15:22 [202006] PAX MADUREIRA | 15:24-15:51 [202000] PAX OSWALDO CRUZ | 15:54-16:37 [202000] PAX OSWALDO CRUZ

### Vila da Penha
- **c1**: PAULO CESAR | LNU7733
  - Escala: motorista=PAULO CESAR placa=LNU7733
  - KPI: motorista=PAULO CESAR placa=LNU-7733 | SC=SEM CHD=SEM SL=SEM
  - GPS: placa não encontrada no Unitrac

### Pilares
- **c1**: MARCIO | KXR7527
  - Escala: motorista=MARCIO placa=KXR7527
  - KPI: motorista=MARCIO placa=KXR-7527 | SC=SEM CHD=SEM SL=SEM
  - GPS: placa não encontrada no Unitrac

### Del Castilho
- **c1**: MARCIO | KXR7527
  - Escala: motorista=MARCIO placa=KXR7527
  - KPI: motorista=MARCIO placa=KXR-7527 | SC=SEM CHD=SEM SL=SEM
  - GPS: placa não encontrada no Unitrac

### Guadalupe
- **c1**: LUIZ | AKZ2745
  - Escala: motorista=LUIZ placa=AKZ2745
  - KPI: motorista=LUIZ placa=AKZ-2745 | SC=14:20 CHD=14:47 SL=15:00
  - Matcher: SC=14:20 CHD=14:47 SL=15:00
  - GPS LOJA: 05:34-07:29 [560031] SENDAS MEIER | 14:47-15:00 [202005] PAX GUADALUPE

### Taquara
- **c1**: ANDRE | LSX7C72
  - Escala: motorista=ANDRE placa=LSX7C72
  - KPI: motorista=ANDRE placa=LSX-7C72 | SC=14:23 CHD=15:18 SL=16:20
  - Matcher: SC=14:23 CHD=15:18 SL=16:20
  - GPS LOJA: 06:19-08:15 [7000766] PREZUNIC CAMPO GRANDE (TINGUI) | 15:18-16:20 [202011] PAX TAQUARA

## Problemas identificados

✓ Nenhum problema detectado.
