# Verificação KPIs Dia 22/05/2026 — Contexto Completo

> **Para Claude que retoma após compactação:** leia ESTE arquivo PRIMEIRO. Tudo aqui aponta para a verdade do projeto.

## Objetivo

Verificar UMA POR UMA todas as 17 KPIs geradas pelo sistema no dia 22/05/2026, comparando:
- Escala (input — o que era pra fazer)
- Alterações (PDF tabular do dia)
- Relatório Unitrac (GPS real — o que aconteceu)
- KPI gerado (output — o que o sistema produziu)

**Objetivo final:** o sistema tem que estar PERFEITO. Não "razoável".

## Protocolo OBRIGATÓRIO

1. **Análise UMA POR VEZ** — não pular pra próxima sem aprovação explícita do usuário
2. **NÃO CORRIGIR nada durante a análise** — só ANOTAR problemas. Correções aplicadas em lote depois.
3. **Salvar relatório por rede** em `docs/verificacao-22/<REDE>.md` (markdown estruturado)
4. **Compatibilidade com compactação:** sempre que houver decisão importante ou achado significativo, atualizar este arquivo + STATUS.md

## Onde estão os arquivos

| Item | Local |
|------|-------|
| Escalas dia 22 | `C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 22/` |
| Escala Geral | `ESCALA GERAL DE MAIO 0.xlsx` |
| Escala PAX/Feira Nova/Emanuel | `ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (7).xlsx` |
| Escala Armazém do Grão | `ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx` |
| Escala Zona Sul | `ESCALA ZONA SUL - MAIO (8).xlsx` |
| Escala Guanabara (PDF) | `ESCALA 23.05.pdf` |
| Alterações (PDF tabular) | `alteracoes/ALTERACAO DE ESCALA GERAL 22.05.pdf` |
| Relatório Unitrac (XLSX) | `relatorio_9588.xlsx` |
| Relatório Unitrac (PDF) | `relatorio_9589 (1).pdf` |
| KPIs gerados | `C:/Users/media/Downloads/KPI-<REDE>-2026-05-22 (X).xlsx` |

## Script de verificação

`scripts/analise/verificar_kpi_22.ts <REDE_ID> [arquivo_kpi]`

Roda matcher fresh e compara com KPI gerado. Salva relatório em `docs/verificacao-22/<REDE>.md`.

## Os 7 Checks (Fase 1 — em implementação)

1. **Motorista** — comparar nome do motorista da escala vs nome no KPI
2. **Contagem global** — escala (N) vs KPI (N) — flag lojas faltantes/extras
3. **Alterações aplicadas** — KPI reflete trocas de placa/motorista do PDF de alterações?
4. **Todas colunas KPI** — ler obs/status/anomalia além de mot/placa/SC/CHD/SL
5. **Lat/lng paradas** — distância das paradas GPS ao centro da loja (>raio = flag)
6. **2 slots na linha** — validar placa1 E placa2 da linha do KPI
7. **Anomalias sistema** — comparar com `qtd_anomalias_high/medium/low` do banco

## Lista das 17 KPIs

| # | Rede | Arquivo |
|---|------|---------|
| 1 | MUNDIAL | KPI-MUNDIAL-2026-05-22 (1).xlsx |
| 2 | SENDAS | KPI-SENDAS-2026-05-22 (1).xlsx |
| 3 | VIANENSE | KPI-VIANENSE-2026-05-22 (1).xlsx |
| 4 | SAMS_CLUB | KPI-SAMS_CLUB-2026-05-22 (1).xlsx |
| 5 | CAB_PETROPOLIS | KPI-CAB_PETROPOLIS-2026-05-22 (1).xlsx |
| 6 | PRINCESA | KPI-PRINCESA-2026-05-22 (2).xlsx |
| 7 | PREZUNIC | KPI-PREZUNIC-2026-05-22 (1).xlsx |
| 8 | SUPERCOMPRAS | KPI-SUPERCOMPRAS-2026-05-22 (1).xlsx |
| 9 | SUPERPRIX | KPI-SUPERPRIX-2026-05-22 (2).xlsx |
| 10 | CARREFOUR | KPI-CARREFOUR-2026-05-22 (1).xlsx |
| 11 | ATACADAO | KPI-ATACADAO-2026-05-22 (1).xlsx |
| 12 | ASSAI | KPI-ASSAI-2026-05-22 (2).xlsx |
| 13 | SUPER_PAX | KPI-SUPER_PAX-2026-05-22 (1).xlsx |
| 14 | ARMAZEM_GRAO | KPI-ARMAZEM_GRAO-2026-05-22 (1).xlsx |
| 15 | ZONA_SUL | KPI-ZONA_SUL-2026-05-22 (1).xlsx |
| 16 | EMANUEL | KPI-EMANUEL-2026-05-22 (1).xlsx |
| 17 | FEIRA_NOVA | KPI-FEIRA_NOVA-2026-05-22 (1).xlsx |

## Fixes já aplicados no matcher.ts durante o trabalho

- **2026-05-24** — `isEstacionamentoNoturno` agora exige saída <06:00 também (antes só checava chegada e duração). Caso CAB-PETROPOLIS: matcher passa a retornar `SC=--- CHD=00:00 SL=13:14` (entrega real) em vez de `13:14/14:49/23:57` (trip secundário). Commit `2a491f4`.

## Status global

Ver `STATUS.md` para o estado atual de cada KPI.
