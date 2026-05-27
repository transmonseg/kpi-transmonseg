# Relatório Final — Análise dia 19/05/2026

**Gerado:** 2026-05-27
**Tolerância:** 10min
**Fontes:** PDF Unitrac (`relatorio_9572.pdf`, 207 veículos, 2135 paradas) + 17 KPIs sistema (Vercel)

---

## Resumo geral

| Rede | Total | Acerto OK | Saída off | SEM-RASTRE | Vazio | Loja errada | Inventado | Taxa |
|---|---|---|---|---|---|---|---|---|
| ZONA_SUL | 47 | 22 | 1 | 7 | 8 | 1 | 8 | **63%** |
| ASSAI | 41 | 23 | 3 | 3 | 6 | 1 | 5 | **70%** |
| ATACADAO | 2 | 0 | 0 | 1 | 0 | 0 | 1 | 50% |
| CARREFOUR | 11 | 5 | 0 | 0 | 4 | 0 | 2 | 45% |
| PREZUNIC | 57 | 44 | 1 | 4 | 4 | 0 | 4 | **85%** |
| PRINCESA | 26 | 22 | 0 | 0 | 2 | 1 | 1 | **84%** |
| SUPERPRIX | 9 | 8 | 0 | 0 | 1 | 0 | 0 | **88%** |
| SUPERCOMPRAS | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 0% |
| ARMAZEM_GRAO | 14 | 2 | 1 | 0 | 1 | 0 | 10 | 21% |
| GUANABARA | 27 | 10 | 0 | 10 | 4 | 0 | 3 | **74%** |
| MUNDIAL | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 100% |
| SUPER_PAX | 13 | 10 | 0 | 2 | 1 | 0 | 0 | **92%** |
| FEIRA_NOVA | 13 | 10 | 0 | 1 | 0 | 0 | 2 | **84%** |
| CAB_PETROPOLIS | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0% |
| SAMS_CLUB | 3 | 0 | 0 | 0 | 3 | 0 | 0 | 0% |
| SENDAS | 9 | 3 | 0 | 1 | 2 | 2 | 1 | 44% |
| VIANENSE | 4 | 2 | 0 | 0 | 2 | 0 | 0 | 50% |
| **TOTAL** | **279** | **161** | **6** | **30** | **40** | **6** | **37** | **70%** |

**Taxa global de acerto: 70%** (197/279 lojas com timestamps dentro de ±10min OU SEM-RASTRE válido)

---

## Bugs reais identificados (49 lojas)

### Padrão 1: Saída inflada após consolidação (6 lojas)
Chegada bate, saída diverge >10min mesmo consolidando paradas same-cod_loja.

| Rede | Loja | Placa | Sai sistema | Sai Unitrac |
|---|---|---|---|---|
| ZONA_SUL | 04 Copa II | KVH-9J42 | 09:38 | 08:36 |
| ASSAI | Carioca Shopping 316 | QSW-3B65 | 10:41 | 09:41 |
| ASSAI | Mendanha 65 | LFJ-8442 | 11:21 | 08:29 |
| ASSAI | São João Meriti 217 | EAC-4D65 | 11:54 | 08:31 |
| PREZUNIC | (1 caso) | — | — | — |
| ARMAZEM | (1 caso) | — | — | — |

Causa provável: agrupador pega saída de parada FAKE_EXIT/FORA_BASE posterior à última LOJA same-cod.

### Padrão 2: Loja errada (cross-rede via GPS) (5 lojas)

| Rede | Loja sistema | Placa | GPS estava em |
|---|---|---|---|
| ZONA_SUL | Loja 48 Recreio | BBH-1C94 | Loja 33 Humaitá (mesma rede, loja diferente) |
| ASSAI | Loja 181 Petrópolis | KMZ-7057 | SENDAS Petrópolis Loja 38 (rede diferente!) |
| SENDAS | Sendas Central 1º Carro | KRB-2J76 | MATRIZ CD DUQUE (verificar) |
| SUPERCOMPRAS | COSMOS | EYL-8B91 | MERCADO SANTO AGOSTINHO BARRA (rede diferente) |
| PRINCESA | Copacabana | KWH-2J02 | "PRINCESA COPACABANA" (provável **falso positivo** — nome com quebra) |
| SENDAS | Barramares | LTH-4J15 | PETIT MARCHE BARRAMARES (provável **falso positivo** — sub-rede) |

3-4 bugs reais (cross-rede contamination).

### Padrão 3: Inventado (GPS em FORA_BASE) (37 lojas)
Sistema atribuiu timestamp baseado em parada classificada como FORA_BASE pelo Unitrac. Pode ser:
- (a) Sistema usou geofence/trgm-lookup pra promover FORA_BASE → LOJA corretamente
- (b) Bug: atribuiu sem critério geográfico válido

Distribuição: ARMAZEM 10, ZS 8, ASSAI 5, PREZUNIC 4, GUANABARA 3, CARREFOUR 2, FEIRA_NOVA 2, ATACADAO 1, PRINCESA 1, SENDAS 1.

**Requer investigação caso-a-caso** pra distinguir (a) de (b).

### Sem timestamp (40 lojas)
Sistema gerou linha de loja com motorista/placa mas sem timestamps. Causas:
- Placa serve múltiplas lojas, sistema só atribuiu timestamp à 1ª (limitação 2 carros/loja)
- Placa não foi pra loja no Unitrac (motorista mudou de rota)
- Cadastro placa-loja incompleto (sem cod_unitrac/nome_unitrac)

Distribuição: ZS 8, ASSAI 6, GUANABARA 4, CARREFOUR 4, PREZUNIC 4, SAMS_CLUB 3, SENDAS 2, VIANENSE 2, PRINCESA 2, MUNDIAL 1, SUPER_PAX 1, CAB 1, ARMAZ 1, SUPERPRIX 1.

---

## Cruzamento com auditoria externa (Claude.ai 27/05)

### Bugs URGENTES (U1-U4): TODOS resolvidos hoje ✅
- U1 Parser v2 conectado (commit c6bb0b1, mergeado 35397ce)
- U2 VEICULOS_INATIVOS normalizado (6a069d6)
- U3 lookupSlot preferNome (7845022)
- U4 Promise.allSettled (a42f8fb)

### Bugs adicionais resolvidos na mesma sessão
- U5 inferirSaiDaEscala fallback 14d (bf531c0)
- B lookupSlot redeId filter (8ad0a21)
- C parser PDF tabular separar tipo_carro (d3687d7)
- D aplicarAlteracoes priorizar Loja N (d7bb05c)
- E catalogo +11 SPID Prezunic (68be31d)
- A persistir escala_linhas no /simples (a7eb771)

### Bugs IMPORTANTES (I1-I4) — pendentes
- I1 computeSaidaCd em 2 lugares (unitrac.ts vs matcher.ts) — divergência fallback
- I2 Warning alteracoes vazias ausente
- I3 inferirSaiDaEscala usa createClient (RLS) — talvez relacionado a "sem timestamp"
- I4 3ª linha agrupar-por-loja descartada — talvez relacionado a "sem timestamp"

### Bugs N1-N12 — pendentes
- N3 ZS data_entrega D+1 + cross-day alteracoes
- N5 unitrac-pdf REPAIR regex consome paradas seguintes
- N7 variantesOcr só posição 4
- (outros)

---

## Conclusão

Sistema dia 19 sai em **70% de acerto**. Após os 9 fixes dessa sessão (U1-U5 + B,C,D,E,A) — que afetam o **pipeline de geração** mas só vão impactar a partir do próximo deploy — a tendência é melhorar.

Bugs novos descobertos hoje (49 lojas) categorizados por padrão:
- 6 saída off (após consolidação)
- 5 loja errada (3-4 reais, 1-2 falsos positivos do comparador)
- 37 inventado (FORA_BASE atribuído como LOJA — investigar caso a caso)
- 40 sem timestamp (limitação 2-carros OU placa fora de cadastro)

**Próximo passo recomendado:** atacar bugs I3 (RLS) e I4 (3ª linha agrupador) da auditoria externa — provavelmente reduzem o grupo "sem timestamp".

**Arquivos de análise gerados:**
- `unitrac-pdf.md` + `.json` (paradas Unitrac dia 19)
- `analise-{REDE}.md` × 17 (detalhe por rede)
- `resumo-geral.md`
- `RELATORIO-FINAL.md` (este arquivo)
