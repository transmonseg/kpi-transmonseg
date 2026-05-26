# Auditoria CARREFOUR dia 19/05/2026

**Gerado:** `KPI-CARREFOUR-2026-05-19 (3).xlsx`
**Manual:** `KPI-CARREFOUR-MANUAL.xlsx` aba `19`

## Comparação

| Loja | Manual placa/CHD/SL | Gerado placa/CHD/SL | Verdict |
|------|---------------------|----------------------|---------|
| Alcântara (Loja 5) | LSE-1D35 / 06:10 / 07:45 | LSE-1D35 / 06:59 / 07:45 | ❌ CHD Δ49min |
| Barra da Tijuca | KMY-5561 / 05:50 / 07:20 | KMY-5561 / 05:50 / 07:19 | ⚠️ Δ0/1 OK |
| Brigadeiro (Caxias) | QSU6I54 / 04:55 / 07:15 | QSU-6I54 / 04:55 / 07:14 | ⚠️ Δ0/1 OK |
| Campo Grande 1º | SIMÃO/LSN6I72 / 06:05 / 06:45 | KIA SIMÃO/LSN-6I72 / 04:48 / 05:21 | ❌ CHD Δ77min, SL Δ84min |
| Campo Grande 2º | RENAN/KRW8E06 (não no gerado como 2º) | Simao no 2º duplicado | ❌ **2º CARRO TROCADO** |
| Norte Shopping | LJS-2B72 / 05:55 / 06:35 | LJS-2B72 / 05:56 / 06:37 | ⚠️ Δ1/2 OK |
| Sulacap | TJQ6J26 / 06:20 / 07:15 | TJQ-6J26 / 06:18 / 06:32 | ❌ CHD Δ2 OK / SL Δ43min curto |
| Washington Luiz | AMF-0325 / 05:35 / 08:10 | AMF-0325 / 05:36 / 08:08 | ⚠️ Δ1/2 OK |
| Campos dos Goytacazes | (vazio) | (vazio) | ✅ |
| Macaé | (vazio) | (vazio) | ✅ |
| Juiz de Fora | (vazio) | (vazio) | ✅ |
| Espírito Santo | (vazio) | (vazio) | ✅ |

## Bugs

### 🔴 BUG C1 — Campo Grande 2º carro errado

Manual: 1º=SIMÃO/LSN-6I72, 2º=RENAN/KRW-8E86 (ou KRW8E06 — typo manual).
Gerado: 1º=KIA SIMÃO/LSN-6I72, 2º=**Simao Cod Placa**/LSN-6I72 (DUPLICADO!)

A alteração diz Carrefour Campo Grande tem RENAN (1º) e SIMÃO (2º). Sys colocou SIMÃO em ambos. RENAN sumiu.

> Possivelmente o fix `aplicar-alteracoes.ts` (tokens fortes) precisa lidar com **dois carros** na mesma loja.

### 🔴 BUG C2 — Alcântara CHD Δ49min

Manual: 06:10. Gerado: 06:59. Δ49min. Sys pegou parada errada.

### 🔴 BUG C3 — Campo Grande 1º CHD Δ77min, SL Δ84min

Manual: 06:05 / 06:45.
Gerado: 04:48 / 05:21.

Sys pegou parada muito antes. Pode ser FAKE_EXIT ou outra placa.

### 🟡 BUG C4 — Sulacap SL curto

Manual: SL=07:15. Gerado: SL=06:32. Δ43min curto. Padrão FORA_BASE.

## Resumo

| Categoria | Quantidade |
|-----------|------------|
| ✅ OK | 8 |
| 🔴 Bug código | 4 |

## Status: ✅ Auditado
