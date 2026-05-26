# Auditoria PREZUNIC dia 19/05/2026

**Gerado:** `KPI-PREZUNIC-2026-05-19 (3).xlsx` (57 linhas com dado)
**Manual:** `KPI-PREZUNIC-MANUAL.xlsx` aba `19` (61 linhas)

## Resumo

A maioria das lojas tá ⚠️ Δ pequeno (1-3min). Convenção arredondamento da Tia Érica.

## Bugs reais

### 🔴 BUG P1 — Botafogo Serra Azul falso positivo

| Loja | Manual | Gerado |
|------|--------|--------|
| Botafogo / Serra Azul | KWB-6998 / **SEM** | KWB-6998 / **10:42 / 10:59** |

Manual diz SEM rastreador, sys gerou tempos. Pode ser bug ou KWB-6998 fez essa loja mas Tia Érica achou que não tinha GPS.

### 🔴 BUG P2 — Jauru e Taquara falsos positivos

| Loja | Manual | Gerado |
|------|--------|--------|
| Jauru / Serra Azul | LUP-1F13 / **SEM** | LUP-1F13 / **14:37 / 14:45** |
| Taquara / Serra Azul | LUP-1F13 / **SEM** | LUP-1F13 / **14:50 / 14:53** |

Mesma placa LUP-1F13 fez duas paradas curtas. Manual diz SEM. Provavelmente carros sem comunicação intermitente.

### 🔴 BUG P3 — Icaraí CHD Δ137min

Manual: 06:00 / 09:10. Gerado: **08:17** / 09:09. CHD Δ137min, SL Δ1.

Sys pulou a chegada real e pegou outra parada (talvez retorno).

### 🔴 BUG P4 — SPID Freguesia parada tarde

Manual: 07:05 / 07:45 (manhã).
Gerado: **14:30 / 15:24** (tarde).

Sys pegou parada tarde quando real era manhã. Mesmo padrão ZS dia 19 (Loja 47 Catete, Loja 25/22 S.Conrado).

### 🟡 BUG P5 — Caxias Centro SL Δ13min curto

Manual: 06:00 / 06:30. Gerado: 06:02 / 06:17. SL Δ13min curto (padrão FORA_BASE).

### 🟡 BUG P6 — Cidade de Deus e SPID Barra sem dado

| Loja | Manual | Gerado |
|------|--------|--------|
| Cidade de Deus | KOP-4978 / 07:00 / 07:50 | sem dado |
| SPID Barra | LLJ-9C64 / 08:25 / 08:35 | sem dado |

## Lojas OK (✅ EXATO + ⚠️ Δ pequeno)

~50 lojas com Δ ≤3min CHD/SL. PREZUNIC dia 19 está bem acertado.

## Resumo

| Categoria | Quantidade |
|-----------|------------|
| ✅ OK | ~50 |
| 🔴 Bug código | 7 |

## Status: ✅ Auditado
