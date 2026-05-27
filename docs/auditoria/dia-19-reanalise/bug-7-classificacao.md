# Bug 7 — Classificacao dos 8 casos (matcher real, dia 2026-05-19)

Regra autoridade: GPS + raio + cadastro = autoridade. Se parada atribuida pelo matcher esta dentro do raio cadastrado, sys CERTO (manual errado).

## Resumo
- 7A (manual errado, sys certo, ainda gera): **1**
- 7A_resolved (falso positivo eliminado pelo fix do mestre): **4**
- 7B (bug matcher persistente): **1**
- 7C (convencao): **0**
- ??? (sem dados): **1**

## Tabela detalhada

| Loja | Placa | Manual | Spec gerou | Matcher atual gera | Dist→cadastro | Raio | Sub-causa |
|------|-------|--------|-----------|--------------------|---------------|------|-----------|
| ZS Loja 14 Leblon | UBO5E05 | NAO_FOI | 15:53/16:41 | NAO GERA/NAO GERA | --- | 200m | **7A_resolved** |
| ZS Loja 32 Laranjeiras | QAH2H50 | SEM | 04:54/05:31 | 05:31/06:22 | 39m | 200m | **7A** |
| ASSAI Barra I | UGA1D55 | NAO_FOI | 06:08/06:36 | 05:10/05:47 | --- | 200m | **???** |
| ASSAI Bangu II | UBO5E01 | NAO_FOI | 09:33/09:37 | 05:43/08:31 | 288m | 200m | **7B** |
| PREZUNIC Botafogo Serra Azul | KWB6998 | SEM | 10:42/10:59 | NAO GERA/NAO GERA | --- | 150m | **7A_resolved** |
| PREZUNIC Jauru | LUP1F13 | SEM | 14:37/14:45 | NAO GERA/NAO GERA | --- | 150m | **7A_resolved** |
| PREZUNIC Taquara | LUP1F13 | SEM | 14:50/14:53 | NAO GERA/NAO GERA | --- | 150m | **7A_resolved** |

## Detalhes por caso

### ZS Loja 14 Leblon
- Escala: placa=UBO5E05, raw="Zona Sul Loja 14 - Leblon"
- Cadastro: (NAO ENCONTRADO)
- Matcher: SEM rota/parada — falso positivo ja eliminado
- **7A_resolved** — Matcher ATUAL nao gera CL/SL — falso positivo ja resolvido
- Rota=OK, paradas=0. O fix do mestre ja eliminou o falso positivo.

### ZS Loja 32 Laranjeiras
- Escala: placa=QAH2H50, raw="Zona Sul Loja 32 - Laranjeiras"
- Cadastro: ZONA SUL LOJA 32 - LARANJEIRAS, lat=-22.93344, raio=200m
- Matcher: 05:31→06:22 (classif=LOJA), dist→cadastro=39m
  - meta: {"score":0.8,"confidence":"LOW","requiresReview":true,"algorithm":"geo"}
- **7A** — Aceitar — manual errado (GPS comprova entrega)
- Parada 05:31→06:22 a 39m de ZONA SUL LOJA 32 - LARANJEIRAS (raio 200m), classif=LOJA

### ASSAI Barra I
- Escala: placa=UGA1D55, raw="Assaí - Barra I (Senna) - Loja 133"
- Cadastro: (NAO ENCONTRADO)
- Matcher: 05:10→05:47 (classif=LOJA), dist→cadastro=---m
  - meta: {"score":0.8,"confidence":"LOW","requiresReview":true,"algorithm":"geo"}
- **???** — Cadastro nao encontrado
- ASSAI Barra I sem cadastro identificavel

### ASSAI Bangu II
- Escala: placa=UBO5E01, raw="Assaí - Bangu I - Loja 55"
- Cadastro: Assaí - Bangu I - Loja 55, lat=-22.876, raio=200m
- Matcher: 05:43→08:31 (classif=LOJA), dist→cadastro=288m
  - meta: {"score":1,"confidence":"HIGH","requiresReview":false,"algorithm":"hybrid"}
- **7B** — Matcher atribuiu parada fora do raio — bug
- Parada 05:43→08:31 a 288m de Assaí - Bangu I - Loja 55 (raio 200m), classif=LOJA, local="560028 - SENDAS BANGU - LOJA 55,5353016 - REGINA  LUCIO MEIRA,5353017 - ABASTECE"

### PREZUNIC Botafogo Serra Azul
- Escala: placa=KWB6998, raw="Prezunic - Botafogo / Serra Azul"
- Cadastro: PREZUNIC BOTAFOGO (VOLUNTÁRIOS DA PÁTRIA), lat=-22.952595, raio=150m
- Matcher: SEM rota/parada — falso positivo ja eliminado
- **7A_resolved** — Matcher ATUAL nao gera CL/SL — falso positivo ja resolvido
- Rota=OK, paradas=0. O fix do mestre ja eliminou o falso positivo.

### PREZUNIC Jauru
- Escala: placa=LUP1F13, raw="Prezunic - Jauru / Serra Azul"
- Cadastro: PREZUNIC JAURU, lat=-22.91567, raio=150m
- Matcher: SEM rota/parada — falso positivo ja eliminado
- **7A_resolved** — Matcher ATUAL nao gera CL/SL — falso positivo ja resolvido
- Rota=OK, paradas=0. O fix do mestre ja eliminou o falso positivo.

### PREZUNIC Taquara
- Escala: placa=LUP1F13, raw="Prezunic - Taquara / Serra Azul"
- Cadastro: PREZUNIC TAQUARA, lat=-22.92438, raio=150m
- Matcher: SEM rota/parada — falso positivo ja eliminado
- **7A_resolved** — Matcher ATUAL nao gera CL/SL — falso positivo ja resolvido
- Rota=OK, paradas=0. O fix do mestre ja eliminou o falso positivo.
