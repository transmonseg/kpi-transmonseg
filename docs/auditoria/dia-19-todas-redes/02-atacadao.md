# Auditoria ATACADAO dia 19/05/2026

**Gerado:** `KPI-ATACADAO-2026-05-19 (4).xlsx` (2 lojas)
**Manual:** `KPI-ATACADAO-MANUAL.xlsx` aba `19` (2 lojas)

## Comparação

| Loja | Manual placa/CHD/SL | Gerado placa/CHD/SL | Verdict |
|------|---------------------|----------------------|---------|
| Manilha | QSS-1E48 / 05:55 / 10:20 | QSS-1E48 / 06:21 / 08:07 | ❌ CHD Δ26min, SL Δ133min muito curto |
| Belford Roxo | UBF-5G34 / SEM | UBF-5G34 / SEM | ✅ OK |

## Bugs

### 🔴 BUG B1 — Manilha SL muito curta

Manual: 05:55 / 10:20 (durou 4h25min, normal pra Atacadão).
Gerado: 06:21 / 08:07 (durou 1h46min).

Sys terminou cedo demais. Provavelmente padrão `LOJA + FORA_BASE` igual PREZUNIC Fonseca — caminhão entrou no geofence, saiu rápido, mas ficou na área entregando.

## Resumo

| Categoria | Quantidade |
|-----------|------------|
| ✅ OK | 1 |
| 🔴 Bug código (SL curta) | 1 |

## Status: ✅ Auditado
