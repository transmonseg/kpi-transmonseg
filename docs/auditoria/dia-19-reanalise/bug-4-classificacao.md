# Bug 4 — Classificação das 13 lojas faltantes (pós-investigação)

**Data:** 2026-05-26
**Worktree:** `fix/lojas-faltando`
**Baseline atual (pós-Bug 3):** TOTAL DIA 19: 62/241 (26%) ✅ 121⚠️ 35❌ 23❓

## Resumo executivo

**Conclusão central:** Após investigação placa-por-placa, **nenhum dos 13 casos de bug-4 é um bug de matcher fixável**. A grande maioria das placas SIMPLESMENTE NÃO TEM PARADA LOJA NO GPS — ou seja, o veículo não foi à loja (ou foi mas Unitrac não classificou). Outros casos são discrepância entre escala-banco vs realidade do manual (KQR2J11).

**Casos que JÁ EMERGEM (3 das 13):**
- ZS Loja 11 1ª (DBB-8D19): sys=14:37/17:05 Δ2/0 ⚠️ (Bug 3 do plano resolveu)
- ZS Loja 31 1ª: emerge mas como falso positivo (manual=NAO)
- PREZUNIC Cidade de Deus (KOP-4978): sys=06:59/07:51 ⚠️ (já estava emergindo antes do Bug 4)

**Casos com manual em branco (4 das 13):**
- ARMAZEM BOA VISTA — manual em branco, ARMAZEM 100%
- ARMAZEM POSSE noite — manual em branco
- (MEGA BOX 2 noite LNU7733 — placa sem GPS, mas manual exige sys)
- (MEGA BOX 2 3ª AKZ2594 — placa só fez SENDAS Freguesia)

**Casos onde placa não tem nenhuma LOJA no GPS (6 das 13):**
- ZS Loja 19 1ª (LCO-0978): GPS só tem BASE/FORA_BASE
- ZS MEGA BOX 2 noite (LNU-7733): GPS 0 paradas — placa não rastreada dia 19
- ASSAI Ceasa (EZU-9325): GPS só BASE/FORA_BASE
- ASSAI Maracanã (GAR-0802): GPS só BASE/FORA_BASE
- GUANABARA Caxias F.18 (GVH-1397): GPS 0 paradas
- GUANABARA Santa Cruz F.28 (KTR-6724): GPS só BASE

**Casos de discrepância escala-banco vs manual:**
- ZS Loja 07 2ª (KQR-2J11): GPS tem LOJA 07 14:58-16:11, mas KQR2J11 NÃO está na escala como Loja 07. Escala diz Loja 07 1ª = FHO5F88 e LCO0978. **Não há linha pra atribuir.**

**Caso SPID Barra (LLJ-9C64):**
- GPS tem PREZUNIC BARRA (Barra da Tijuca) 05:57/06:26 — está atribuído à linha "Prezunic - Barra da Tijuca"
- Manual "SPID Barra" 08:25/08:35 — GPS não tem essa parada (placa fez Alpha Mall, Recreio, FORA_BASE)
- **Não é bug fixável.**

## Tabela detalhada

| Rede | Loja | Placa | Manual | GPS LOJAs encontradas | Diagnose | Fix viável? |
|------|------|-------|--------|----------------------|----------|-------------|
| ZS | 07 2ª | KQR-2J11 | 15:00/16:10 | 9039007 LEBLON 14:58/16:11 | **Escala não tem KQR2J11 pra Loja 07** | NÃO — cadastro de escala |
| ZS | 11 1ª | DBB-8D19 | 14:35/17:05 | (nenhuma) | **JÁ EMERGE sys=14:37/17:05** Δ2/0 | JÁ RESOLVIDO (Bug 3) |
| ZS | 19 1ª | LCO-0978 | 20:00/21:35 | (variante LCO0J78 — só BASE/FORA_BASE) | Placa não fez Loja 19 GPS | NÃO — sem dado GPS |
| ZS | 21 2ª | LQE-5401 | NÃO_FOI | LOJA 30 04:47-05:27, ARM BARRA 14:08, FORA_BASE 14:55 | Manual NAO + sys nada | OK (já SEM) |
| ZS | MEGA BOX 2 noite | LNU-7733 | 19:30/20:10 | **0 paradas GPS** | Placa não rastreada | NÃO — sem GPS |
| ZS | MEGA BOX 2 3ª | AKZ-2594 | 19:30/19:40 | SENDAS FREGUESIA 04:40-08:12 | Placa não foi à Mega Box | NÃO — sem dado GPS |
| ASSAI | Ceasa | EZU-9325 | 05:55/07:30 | (nenhuma — só BASE/FORA_BASE) | Placa não fez Ceasa GPS | NÃO — sem dado GPS |
| ASSAI | Maracanã 286 | GAR-0802 | 06:00/11:20 | (nenhuma — só BASE/FORA_BASE) | Placa não fez Maracanã GPS | NÃO — sem dado GPS |
| GUANABARA | Caxias F.18 | GVH-1397 | 10:45/11:55 | **0 paradas GPS** | Placa não rastreada | NÃO — sem GPS |
| GUANABARA | Santa Cruz F.28 | KTR-6724 | 09:20/10:05 | (só BASE) | Placa não fez Santa Cruz GPS | NÃO — sem dado GPS |
| PREZUNIC | Cidade de Deus | KOP-4978 | 07:00/07:50 | CAMPINHO 05:16-06:26 + FORA_BASE 06:59-07:51 | **JÁ EMERGE sys=06:59/07:51** Δ1/1 ⚠️ | JÁ RESOLVIDO antes |
| PREZUNIC | SPID Barra | LLJ-9C64 | 08:25/08:35 | BARRA, ALPHA MALL, SPID RECREIO (sem SPID Barra) | Placa não fez SPID Barra GPS | NÃO — sem dado GPS |
| ARMAZEM | BOA VISTA | TML-9I75 | 15:30/15:55 | **PREZUNIC MARICÁ** 05:12-09:43 (cross-rede a 50km+ de Petrópolis!) | Placa não foi a Petrópolis | NÃO — manual incorreto ou placa errada |

## Por que ARMAZEM aparece 100% mas BOA VISTA "tem" 15:30/15:55 no manual original?

O manual em uso atual (lerKpi sheet '19') está em **BRANCO** para BOA VISTA, então o validador passa como ✓. A spec do bug-4 cita manual antigo. **Critério atual:** manual em branco = OK.

## Conclusão

**0/13 casos são fixáveis no matcher.** Todos são:
1. Dados ausentes do GPS (placa não rastreada)
2. Discrepância escala-banco vs manual
3. Já resolvidos por Bug 3 ou por evolução do matcher
4. Manual em branco (ARMAZEM aceita)

## Recomendação

**Marcar Bug 4 como NO-OP** — nenhum fix de matcher é viável. Os "casos" da spec foram, na verdade:
- Manual reanalisado por nova auditoria que considera blanks como OK (ARMAZEM)
- Bug 3 já resolveu DBB-8D19 / KOP-4978 antes da spec ser escrita
- Resto exige melhoria no fluxo Unitrac (não no matcher)

**Ação:** Documentar concerns, pular Bug 4 e passar para Bug 5 (carro 2º), que tem chance maior de ter código fix viável.
