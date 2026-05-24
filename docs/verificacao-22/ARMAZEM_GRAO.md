# Análise ARMAZEM_GRAO — Dia 22/05/2026

> Análise completa com 7 checks (ver `CHECKLIST.md`)

## Sumário

- **Data:** 2026-05-22
- **Rede:** ARMAZEM_GRAO
- **Escala:** 14 linha(s)
- **Alterações:** 0
- **Unitrac:** 212 veículos, 2148 paradas
- **KPI gerado:** KPI-ARMAZEM_GRAO-2026-05-22 (1).xlsx (14 linhas)

## Check 1 — Motorista (escala vs KPI)

✓ Todos motoristas batem com a escala.

## Check 2 — Contagem global (escala vs KPI)

- Escala: 14 lojas distintas
- KPI: 14 lojas
✓ Contagens batem exatamente.

## Check 3 — Alterações aplicadas

Sem alterações para esta rede.

## Check 4 — Colunas extras do KPI Excel

Cabeçalhos detectados: [1] REDES / FILIAIS | [2] MOTORISTA | [3] COD | [4] PLACA | [5] SAIDA CD | [6] CHD LOJA | [7] SAIDA LOJA | [8] MOTORISTA | [9] COD | [10] PLACA | [11] SAIDA CD | [12] CHD LOJA | [13] SAIDA LOJA | [14] TEMPO EM LOJA 1 | [15] TEMPO EM LOJA 2

14 loja(s) com dados em colunas extras:
  - **ABASTECEDORA GRÃO DA SERRA (ALTO)**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  - **ARMAZEM DO GRAO (16 DE MARÇO)**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  - **ARMAZEM DO GRAO (CORREAS)**: TEMPO EM LOJA 1=00:26, TEMPO EM LOJA 2=00:00
  - **ARMAZEM DO GRAO A. BARRA DA TIJUCA**: TEMPO EM LOJA 1=00:25, TEMPO EM LOJA 2=00:00
  - **ARMAZEM DO GRÃO  (MOSELA)**: TEMPO EM LOJA 1=00:50, TEMPO EM LOJA 2=00:00
  - **ARMAZEM DO GRÃO (CAPELA)**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  - **ARMAZEM DO GRÃO (ITAIPAVA)**: TEMPO EM LOJA 1=00:10, TEMPO EM LOJA 2=00:00
  - **ARMAZEM DO GRÃO (QUITANDINHA)**: TEMPO EM LOJA 1=00:25, TEMPO EM LOJA 2=00:00
  - **ARMAZEM DO GRÃO (VALPARAÍSO)**: TEMPO EM LOJA 1=00:25, TEMPO EM LOJA 2=00:00
  - **ARMAZÉM DO GRÃO ( BOA VISTA)**: TEMPO EM LOJA 1=00:00, TEMPO EM LOJA 2=00:00
  ... e mais 4

## Check 5 — Lat/lng das paradas (vs cadastro)

✓ Todas paradas dentro do raio cadastrado (com margem 1.5x).

## Check 6 — Ambos slots da linha do KPI

✓ Slots batem com escala.

## Check 7 — SC/CHD/SL: matcher (rodado agora) vs KPI gerado

⚠ **5 divergência(s) entre matcher local e KPI gerado:**
- **REGINA  BARRA DO IMBUY** (c1): matcher=11:23/11:46/12:54 | KPI=02:21/07:23/08:02
- **REGINA  1 DE MAIO** (c1): matcher=12:29/13:02/13:17 | KPI=---/---/---
- **REGINA  LUCIO MEIRA** (c1): matcher=13:08/13:55/14:41 | KPI=---/---/---
- **ABASTECEDORA GRÃO DA SERRA (ALTO)** (c1): matcher=13:08/15:12/15:37 | KPI=---/---/---
- **ARMAZEM DO GRÃO (VALPARAÍSO)** (c1): matcher=13:26/15:14/15:37 | KPI=13:26/14:37/15:01

_Pode indicar que o KPI foi gerado com versão antiga do código. Regerar deve corrigir._

## Detalhe — Loja por loja

### REGINA  BARRA DO IMBUY
- **c1**: GILSON | UBO5E05
  - Escala: motorista=GILSON placa=UBO5E05
  - KPI: motorista=GILSON placa=UBO-5E05 | SC=02:21 CHD=07:23 SL=08:02
  - Matcher: SC=11:23 CHD=11:46 SL=12:54

### REGINA  1 DE MAIO
- **c1**: GILSON | UBO5E05
  - Escala: motorista=GILSON placa=UBO5E05
  - KPI: motorista=GILSON placa=UBO-5E05 | SC=--- CHD=--- SL=---
  - Matcher: SC=12:29 CHD=13:02 SL=13:17

### REGINA  LUCIO MEIRA
- **c1**: GILSON | UBO5E05
  - Escala: motorista=GILSON placa=UBO5E05
  - KPI: motorista=GILSON placa=UBO-5E05 | SC=--- CHD=--- SL=---
  - Matcher: SC=13:08 CHD=13:55 SL=14:41

### ABASTECEDORA GRÃO DA SERRA (ALTO)
- **c1**: GILSON | UBO5E05
  - Escala: motorista=GILSON placa=UBO5E05
  - KPI: motorista=GILSON placa=UBO-5E05 | SC=--- CHD=--- SL=---
  - Matcher: SC=13:08 CHD=15:12 SL=15:37

### ARMAZÉM DO GRÃO ( BOA VISTA)
- **c1**: ANTUNES | QSZ9A20
  - Escala: motorista=ANTUNES placa=QSZ9A20
  - KPI: motorista=ANTUNES placa=QSZ-9A20 | SC=--- CHD=--- SL=---
  - GPS: 19p mas matcher sem match
  - GPS LOJA: 05:16-06:36 [8590002] PRINCESA MARICÁ 1 | 06:39-07:54 [8590003] PRINCESA MARICÁ 2 | 08:00-09:06 [8590002] PRINCESA MARICÁ 1

### ARMAZÉM DO GRÃO MATRIZ ( POSSE)
- **c1**: ANTUNES | QSZ9A20
  - Escala: motorista=ANTUNES placa=QSZ9A20
  - KPI: motorista=ANTUNES placa=QSZ-9A20 | SC=--- CHD=--- SL=---
  - GPS: 19p mas matcher sem match
  - GPS LOJA: 05:16-06:36 [8590002] PRINCESA MARICÁ 1 | 06:39-07:54 [8590003] PRINCESA MARICÁ 2 | 08:00-09:06 [8590002] PRINCESA MARICÁ 1

### ARMAZEM DO GRÃO (ITAIPAVA)
- **c1**: ROBERTO | LSL9670
  - Escala: motorista=ROBERTO placa=LSL9670
  - KPI: motorista=ROBERTO placa=LSL-9670 | SC=13:02 CHD=14:24 SL=14:34
  - Matcher: SC=13:02 CHD=14:24 SL=14:34
  - GPS LOJA: 06:27-07:51 [9006156] CARREFOUR JUIZ DE FORA | 14:24-14:34 [5353003] ARMAZEM DO GRÃO (ITAIPAVA) | 14:43-15:09 [5353006] ARMAZEM DO GRAO (CORREAS)

### ARMAZEM DO GRAO (CORREAS)
- **c1**: ROBERTO | LSL9670
  - Escala: motorista=ROBERTO placa=LSL9670
  - KPI: motorista=ROBERTO placa=LSL-9670 | SC=13:02 CHD=14:43 SL=15:09
  - Matcher: SC=13:02 CHD=14:43 SL=15:09
  - GPS LOJA: 06:27-07:51 [9006156] CARREFOUR JUIZ DE FORA | 14:24-14:34 [5353003] ARMAZEM DO GRÃO (ITAIPAVA) | 14:43-15:09 [5353006] ARMAZEM DO GRAO (CORREAS)

### ARMAZEM DO GRÃO (VALPARAÍSO)
- **c1**: JEFERSON | QST4C52
  - Escala: motorista=JEFERSON placa=QST4C52
  - KPI: motorista=JEFERSON placa=QST-4C52 | SC=13:26 CHD=14:37 SL=15:01
  - Matcher: SC=13:26 CHD=15:14 SL=15:37
  - GPS LOJA: 05:48-06:11 [8590571] PRINCESA - BUZIOS 3 | 06:14-06:25 [8590563] PRINCESA - BUZIOS 1 | 06:25-06:59 [8590564] PRINCESA - BUZIOS 2 | 07:01-09:11 [8590571] PRINCESA - BUZIOS 3 | 14:37-15:01 [5353008] ARMAZEM DO GRÃO (QUITANDINHA) | 15:14-15:37 [5353004] ARMAZEM DO GRÃO (VALPARAÍSO) | 15:52-16:42 [5353007] ARMAZEM DO GRÃO  (MOSELA)

### ARMAZEM DO GRÃO  (MOSELA)
- **c1**: JEFERSON | QST4C52
  - Escala: motorista=JEFERSON placa=QST4C52
  - KPI: motorista=JEFERSON placa=QST-4C52 | SC=13:26 CHD=15:52 SL=16:42
  - Matcher: SC=13:26 CHD=15:52 SL=16:42
  - GPS LOJA: 05:48-06:11 [8590571] PRINCESA - BUZIOS 3 | 06:14-06:25 [8590563] PRINCESA - BUZIOS 1 | 06:25-06:59 [8590564] PRINCESA - BUZIOS 2 | 07:01-09:11 [8590571] PRINCESA - BUZIOS 3 | 14:37-15:01 [5353008] ARMAZEM DO GRÃO (QUITANDINHA) | 15:14-15:37 [5353004] ARMAZEM DO GRÃO (VALPARAÍSO) | 15:52-16:42 [5353007] ARMAZEM DO GRÃO  (MOSELA)

### ARMAZEM DO GRÃO (QUITANDINHA)
- **c1**: JEFERSON | QST4C52
  - Escala: motorista=JEFERSON placa=QST4C52
  - KPI: motorista=JEFERSON placa=QST-4C52 | SC=13:26 CHD=14:37 SL=15:01
  - Matcher: SC=13:26 CHD=14:37 SL=15:01
  - GPS LOJA: 05:48-06:11 [8590571] PRINCESA - BUZIOS 3 | 06:14-06:25 [8590563] PRINCESA - BUZIOS 1 | 06:25-06:59 [8590564] PRINCESA - BUZIOS 2 | 07:01-09:11 [8590571] PRINCESA - BUZIOS 3 | 14:37-15:01 [5353008] ARMAZEM DO GRÃO (QUITANDINHA) | 15:14-15:37 [5353004] ARMAZEM DO GRÃO (VALPARAÍSO) | 15:52-16:42 [5353007] ARMAZEM DO GRÃO  (MOSELA)

### ARMAZEM DO GRÃO (CAPELA)
- **c1**: JAIRO | TML1D82
  - Escala: motorista=JAIRO placa=TML1D82
  - KPI: motorista=JAIRO placa=TML-1D82 | SC=--- CHD=--- SL=---
  - GPS: 11p mas matcher sem match
  - GPS LOJA: 06:33-11:30 [560035] SENDAS MESQUITA - LJ 35

### ARMAZEM DO GRAO (16 DE MARÇO)
- **c1**: JAIRO | TML1D82
  - Escala: motorista=JAIRO placa=TML1D82
  - KPI: motorista=JAIRO placa=TML-1D82 | SC=--- CHD=--- SL=---
  - GPS: 11p mas matcher sem match
  - GPS LOJA: 06:33-11:30 [560035] SENDAS MESQUITA - LJ 35

### ARMAZEM DO GRAO A. BARRA DA TIJUCA
- **c1**: SIDNEI | LQE5E01
  - Escala: motorista=SIDNEI placa=LQE5E01
  - KPI: motorista=SIDNEI placa=LQE-5E01 | SC=13:02 CHD=13:45 SL=14:09
  - Matcher: SC=13:02 CHD=13:45 SL=14:09
  - GPS LOJA: 04:38-05:14 [9039030] 30 - ZONA SUL - LARANJEIRAS | 13:45-14:09 [5353011] ARMAZEM DO GRAO (BARRA DA TIJU

## Problemas identificados

- Check 7: 5 timestamps divergentes (matcher vs KPI)
