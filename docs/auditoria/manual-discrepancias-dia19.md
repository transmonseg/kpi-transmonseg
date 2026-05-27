# Discrepâncias Manual vs GPS — Dia 19/05/2026

> Casos onde o **manual da Tia Érica diverge do GPS** mas o GPS comprova a entrega.
> Por regra estabelecida pelo user: **GPS + raio + cadastro = autoridade**.
> Sys está CERTO nesses casos. Manual precisa revisão pela Tia Érica.

## Origem: Bug 7 — Falso positivo (sys diz FOI, manual diz NÃO_FOI/SEM)

Investigação dos 7 casos de falso positivo dia 19 classificou:

| Sub-causa | Quantidade | Significado |
|-----------|-----------|-------------|
| **7A_resolved** | 4 | Falso positivo já eliminado pelo fix do matcher (Bug 7 fix T18-X2) |
| **7A** | 1 | Manual errado, GPS dentro do raio cadastrado |
| **7B** | 1 | Bug do matcher persistente (parada borderline fora de raio) |
| **???** | 1 | Cadastro não encontrado (ASSAI Barra I) |

## Caso 7A — Manual errado

### ZS Loja 32 Laranjeiras (placa QAH2H50)

- **Manual:** SEM
- **Sys gera:** CL=05:31, SL=06:22 (51min)
- **Cadastro:** ZONA SUL LOJA 32 - LARANJEIRAS, lat=-22.93344, lng=-43.18604, raio=200m
- **Parada GPS:** placa QAH2H50, parada 05:31→06:22, **a 39m do cadastro** (dentro do raio)
- **Diagnose detalhado:** `docs/auditoria/dia-19-reanalise/bug-7-ZONA_SUL-ZS_Loja_32_Laranjeiras-diagnose.txt`
- **Veredito:** Manual marcou SEM mas placa entregou na loja. Conferir com Tia Érica.

## Casos 7A_resolved — Falsos positivos já eliminados pelo fix do matcher

O fix T18-X2 (`src/lib/kpi/matcher.ts`) eliminou 4 falsos positivos que vinham
de placas que **nem circularam dia 19**, mas o matcher atribuía paradas de
**UBO5E01** (placa ASSAI Bangu) via plate-swap T18 enganado por matchScore=1
de token qualificador comum ("Serra Azul" entre 6 cadastros Prezunic):

| Loja | Placa escala | Spec gerou (antes) | Sys gera (agora) |
|------|--------------|-------------------|------------------|
| ZS Loja 14 Leblon | UBO5E05 | 15:53/16:41 | (não gera) |
| PREZUNIC Botafogo / Serra Azul | KWB6998 | 10:42/10:59 | (não gera) |
| PREZUNIC Jauru / Serra Azul | LUP1F13 | 14:37/14:45 | (não gera) |
| PREZUNIC Taquara / Serra Azul | LUP1F13 | 14:50/14:53 | (não gera) |

Sys agora retorna SEM/UNMATCHED para essas linhas — consistente com manual.

## Caso 7B — Bug persistente

### ASSAI Bangu II - Loja 332 (escala placa LMF2049, sys atribui via UBO5E01)

- **Manual:** NAO_FOI
- **Sys gera:** placa UBO5E01 fez parada 05:43→08:31 (167min) a **288m** de Assaí Bangu I (raio 200m)
- **Análise:** Escala tem 2 linhas Bangu (I=UBO5E01 e II=LMF2049). UBO5E01 entregou em Bangu I (parada legítima a 288m, classif=LOJA). Mas matcher atribuiu mesma parada a Bangu II também via T8 N:N/T18.
- **Veredito:** Cadastro de Bangu I/II precisa ter raio mais largo (288m está borderline) OU cadastrar Bangu II separadamente (não há cadastro hoje, só Bangu I).

## Caso ??? — Cadastro inexistente

### ASSAI Barra I (Senna) - Loja 133 (escala placa UGA1D55)

- **Manual:** NAO_FOI
- **Sys gera:** placa UGA1D55 fez parada 05:10→05:47 (geo, score 0.8 LOW)
- **Análise:** Não há cadastro de "Assaí Barra I" no banco (todos os outros Assaí estão, mas não Barra I/II — só Barra II Loja 245 mas com nome diferente).
- **Ação:** Cadastrar Assaí Barra I e Barra II (códigos 133 e 245) com lat/lng + raio antes da próxima rodada. Sem cadastro, impossível validar discrepância.

## Resumo executivo

Dos 7 falsos positivos originais do Bug 7:
- **4 resolvidos por fix do matcher** (T18-X2 + lookup ambíguo)
- **1 manual errado** (ZS Loja 32 — Tia Érica precisa revisar)
- **1 bug residual** (ASSAI Bangu II — cadastro precisa ajuste de raio)
- **1 bloqueado por falta de cadastro** (ASSAI Barra I)

Net: o fix do matcher elimina ~57% dos falsos positivos (4/7) imediatamente.
Os restantes precisam ação no cadastro (não no código).
