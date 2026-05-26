# Auditoria PRINCESA dia 19/05/2026

**Gerado:** `KPI-PRINCESA-2026-05-19 (10).xlsx`
**Manual:** `KPI-PRINCESA-MANUAL.xlsx` aba `19`

## Resumo

22/26 linhas com Δ ≤ 3min (arredondamento manual). PRINCESA dia 19 está MUITO bem.

## Bugs reais

### 🔴 BUG PR1 — Iguaba 1ª (convenção)

| Loja | Manual | Gerado |
|------|--------|--------|
| Iguaba (1ª) | LRA-9C41 / **07:20 / 08:20** | LRA-9C41 / **04:50 / 06:18** |

Sys pegou parada 04:50 (mesma que Itaboraí 2ª). Manual 07:20 é convenção Tia Érica = início do atendimento (não chegada GPS).

> **Não-bug**: convenção. GPS confirma chegada 04:50 fisicamente.

### 🔴 BUG PR2 — Buzios 1 (2ª) SL muito longa

| Loja | Manual | Gerado |
|------|--------|--------|
| Buzios 1 (2ª) | QST-4C52 / **06:15 / 17:30** | QST-4C52 / **06:14 / 06:32** |

Manual SL=17:30 (11h+ na loja!). Sys SL=06:32 (18min na loja). Real provavelmente entre os dois — caminhão entregou rápido e ficou na área (FORA_BASE pattern).

### 🔴 BUG PR3 — Buzios 3 (1ª) CHD Δ113min

| Loja | Manual | Gerado |
|------|--------|--------|
| Buzios 3 (1ª) | QST-4C52 / **05:45 / 06:10** | QST-4C52 / **07:38 / 10:36** |

Sys pulou primeira parada (5:45) e pegou outra. Mesmo padrão Multi-trip.

### 🔴 BUG PR4 — Barra de São João SL Δ41min

| Loja | Manual | Gerado |
|------|--------|--------|
| Barra de São João | JAJ-6B36 / 09:45 / **11:15** | JAJ-6B36 / 09:46 / **11:56** |

SL Δ41min. Pode ser convenção Tia Érica (arredondamento? fim de atendimento).

## Lojas OK

| Loja | Δ CHD | Δ SL |
|------|-------|------|
| Catete | 1 | 2 |
| Flamengo | 2 | 1 |
| Cosme Velho | 1 | 2 |
| Laranjeiras | 1 | 2 |
| Copacabana | 1 | 0 |
| Leme | 2 | 0 |
| Pechincha | 2 | 1 |
| Niterói Barcas | 2 | 1 |
| Inga | 1 | 1 |
| Fonseca | 2 | 2 |
| Icaraí | 1 | 2 |
| Itaboraí | 0 | 2 |
| Maricá 1/2 | 1 | 2 |
| Rio das Ostras | 1 | 2 |
| Arraial 1/2/3 | 1 | 0-2 |
| Buzios 2 | 2 | 1 |
| Cabo Frio 1/2/3 | 1-4 | 1-2 |

## Resumo

| Categoria | Quantidade |
|-----------|------------|
| ✅+⚠️ OK | 22 |
| 🟡 Convenção (não-bug) | 1 (Iguaba 1ª) |
| 🔴 Bug código | 3 (Buzios 1 SL longa, Buzios 3 CHD, Barra São João SL) |

## Status: ✅ Auditado
