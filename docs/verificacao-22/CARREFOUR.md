# Análise CARREFOUR — Dia 22/05/2026

> Análise completa com 7 checks (ver `CHECKLIST.md`)

## Sumário

- **Data:** 2026-05-22
- **Rede:** CARREFOUR
- **Escala:** 10 linha(s)
- **Alterações:** 2
- **Unitrac:** 212 veículos, 2148 paradas
- **KPI gerado:** KPI-CARREFOUR-2026-05-22 (1).xlsx (11 linhas)

## Check 1 — Motorista (escala vs KPI)

✓ Todos motoristas batem com a escala.

## Check 2 — Contagem global (escala vs KPI)

- Escala: 10 lojas distintas
- KPI: 11 lojas
⚠ **1 loja(s) no KPI mas SEM escala:**
  - Carrefour - Espírito Santo

## Check 3 — Alterações aplicadas

Alterações encontradas no PDF: 2

- **Carrefour - Campo Grande ●** → carro 1º CARRO: motorista=KIA RENAN placa=KRW-8E86
  ⚠ KPI tem placa=NSM-6D98 mot=FLÁVIO — divergente
- **Carrefour - Campo Grande ●** → carro 2º CARRO: motorista=KIA JHON placa=KVI-9088
  ⚠ KPI tem placa= mot= — divergente

## Check 4 — Colunas extras do KPI Excel

Cabeçalhos detectados: [1] REDES / FILIAIS | [2] MOTORISTA | [3] COD | [4] PLACA | [5] SAIDA CD | [6] CHD LOJA | [7] SAIDA LOJA | [8] MOTORISTA | [9] COD | [10] PLACA | [11] SAIDA CD | [12] CHD LOJA | [13] SAIDA LOJA | [14] TEMPO EM LOJA 1 | [15] TEMPO EM LOJA 2

11 loja(s) com dados em colunas extras:
  - **Carrefour - Alcântara**: TEMPO EM LOJA 1=00:24, TEMPO EM LOJA 2=00:00
  - **Carrefour - Barra da Tijuca**: TEMPO EM LOJA 1=00:46, TEMPO EM LOJA 2=00:00
  - **Carrefour - Brigadeiro (Caxias)**: TEMPO EM LOJA 1=01:43, TEMPO EM LOJA 2=00:00
  - **Carrefour - Campo Grande**: TEMPO EM LOJA 1=01:13, TEMPO EM LOJA 2=00:00
  - **Carrefour - Norte Shopping**: TEMPO EM LOJA 1=01:06, TEMPO EM LOJA 2=00:00
  - **Carrefour - Sulacap**: TEMPO EM LOJA 1=01:23, TEMPO EM LOJA 2=00:00
  - **Carrefour - Washington Luiz**: TEMPO EM LOJA 1=02:47, TEMPO EM LOJA 2=00:00
  - **Carrefour - Campos dos Goytacazes**: TEMPO EM LOJA 1=00:29, TEMPO EM LOJA 2=00:00
  - **Carrefour - Macaé**: TEMPO EM LOJA 1=01:08, TEMPO EM LOJA 2=00:00
  - **Carrefour - Juiz de Fora**: TEMPO EM LOJA 1=01:25, TEMPO EM LOJA 2=00:00
  ... e mais 1

## Check 5 — Lat/lng das paradas (vs cadastro)

✓ Todas paradas dentro do raio cadastrado (com margem 1.5x).

## Check 6 — Ambos slots da linha do KPI

✓ Slots batem com escala.

## Check 7 — SC/CHD/SL: matcher (rodado agora) vs KPI gerado

✓ Todos timestamps batem.

## Detalhe — Loja por loja

### Carrefour - Alcântara
- **c1**: FLÁVIO | NSM6D98
  - Escala: motorista=FLÁVIO placa=NSM6D98
  - KPI: motorista=FLÁVIO placa=NSM-6D98 | SC=04:42 CHD=05:51 SL=06:14
  - Matcher: SC=04:42 CHD=05:51 SL=06:14
  - GPS LOJA: 05:51-06:14 [9006012] CARREFOUR ALCANTARA

### Carrefour - Barra da Tijuca
- **c1**: LUÍZ ANTÔNIO | KMY5561
  - Escala: motorista=LUÍZ ANTÔNIO placa=KMY5561
  - KPI: motorista=LUÍZ ANTÔNIO placa=KMY-5561 | SC=05:09 CHD=06:13 SL=06:59
  - Matcher: SC=05:09 CHD=06:13 SL=06:59
  - GPS LOJA: 06:13-06:59 [9006001] CARREFOUR BARRA

### Carrefour - Brigadeiro (Caxias)
- **c1**: MILTON | EAC4D65
  - Escala: motorista=MILTON placa=EAC4D65
  - KPI: motorista=MILTON placa=EAC-4D65 | SC=05:11 CHD=05:41 SL=07:24
  - Matcher: SC=05:11 CHD=05:41 SL=07:24
  - GPS LOJA: 05:41-07:24 [9006144] CARREFOUR BRIGADEIRO

### Carrefour - Campo Grande
- **c1**: RENAN | KRW8E86
  - Escala: motorista=RENAN placa=KRW8E86
  - KPI: motorista=RENAN placa=KRW-8E86 | SC=05:04 CHD=05:38 SL=06:51
  - Matcher: SC=05:04 CHD=05:38 SL=06:51
  - GPS LOJA: 05:38-06:51 [9006154] CARREFOUR CAMPO GRANDE

### Carrefour - Norte Shopping
- **c1**: SÉRGIO | LJS2B72
  - Escala: motorista=SÉRGIO placa=LJS2B72
  - KPI: motorista=SÉRGIO placa=LJS-2B72 | SC=05:23 CHD=05:50 SL=06:56
  - Matcher: SC=05:23 CHD=05:50 SL=06:56

### Carrefour - Sulacap
- **c1**: JULIO | KNC5J75
  - Escala: motorista=JULIO placa=KNC5J75
  - KPI: motorista=JULIO placa=KNC-5J75 | SC=05:16 CHD=05:48 SL=07:10
  - Matcher: SC=05:16 CHD=05:48 SL=07:10
  - GPS LOJA: 00:05-04:16 [11139000] EMANUEL COMÉRCIO PEDRA DE GUAR | 04:46-05:16 [11139000] EMANUEL COMÉRCIO PEDRA DE GUAR | 05:48-06:07 [9006007] CARREFOUR SULACAP | 06:08-06:51 [9006007] CARREFOUR SULACAP | 06:52-07:10 [9006007] CARREFOUR SULACAP | 07:33-07:57 [11139000] EMANUEL COMÉRCIO PEDRA DE GUAR | 08:19-10:08 [11139000] EMANUEL COMÉRCIO PEDRA DE GUAR | 10:30-12:10 [11139000] EMANUEL COMÉRCIO PEDRA DE GUAR | 12:11-13:02 [11139000] EMANUEL COMÉRCIO PEDRA DE GUAR | 13:03-13:10 [11139000] EMANUEL COMÉRCIO PEDRA DE GUAR | 14:05-14:09 [11139000] EMANUEL COMÉRCIO PEDRA DE GUAR | 14:10-14:14 [11139000] EMANUEL COMÉRCIO PEDRA DE GUAR | 14:43-15:14 [11139000] EMANUEL COMÉRCIO PEDRA DE GUAR | 15:24-15:29 [11139000] EMANUEL COMÉRCIO PEDRA DE GUAR | 15:31-15:52 [11139000] EMANUEL COMÉRCIO PEDRA DE GUAR | 16:35-16:44 [11139000] EMANUEL COMÉRCIO PEDRA DE GUAR

### Carrefour - Washington Luiz
- **c1**: GORDO | AMF0325
  - Escala: motorista=GORDO placa=AMF0325
  - KPI: motorista=GORDO placa=AMF-0325 | SC=05:00 CHD=05:23 SL=08:10
  - Matcher: SC=05:00 CHD=05:23 SL=08:10
  - GPS LOJA: 05:23-06:18 [9006010] CARREFOUR WASHINGTON LUIS | 06:18-08:10 [9006010] CARREFOUR WASHINGTON LUIS

### Carrefour - Campos dos Goytacazes
- **c1**: AGENOR | KPN4F36
  - Escala: motorista=AGENOR placa=KPN4F36
  - KPI: motorista=AGENOR placa=KPN-4F36 | SC=--- CHD=06:18 SL=06:47
  - Matcher: SC=--- CHD=06:18 SL=06:47
  - GPS LOJA: 06:18-06:47 [9006158] CARREFOUR CAMPOS | 08:40-09:48 [9006159] CARREFOUR MACAE

### Carrefour - Macaé
- **c1**: AGENOR | KPN4F36
  - Escala: motorista=AGENOR placa=KPN4F36
  - KPI: motorista=AGENOR placa=KPN-4F36 | SC=--- CHD=08:40 SL=09:48
  - Matcher: SC=--- CHD=08:40 SL=09:48
  - GPS LOJA: 06:18-06:47 [9006158] CARREFOUR CAMPOS | 08:40-09:48 [9006159] CARREFOUR MACAE

### Carrefour - Juiz de Fora
- **c1**: ROBERTO | LSL9670
  - Escala: motorista=ROBERTO placa=LSL9670
  - KPI: motorista=ROBERTO placa=LSL-9670 | SC=--- CHD=06:27 SL=07:51
  - Matcher: SC=--- CHD=06:27 SL=07:51
  - GPS LOJA: 06:27-07:51 [9006156] CARREFOUR JUIZ DE FORA | 14:24-14:34 [5353003] ARMAZEM DO GRÃO (ITAIPAVA) | 14:43-15:09 [5353006] ARMAZEM DO GRAO (CORREAS)

## Problemas identificados

- Check 2: 1 lojas extras no KPI
- Check 3: 2 alteração(ões) não aplicada(s)
