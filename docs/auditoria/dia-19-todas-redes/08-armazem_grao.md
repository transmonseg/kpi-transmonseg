# Auditoria ARMAZEM_GRAO dia 19/05/2026

**Gerado:** `KPI-ARMAZEM_GRAO-2026-05-19 (8).xlsx`
**Manual:** `KPI-ARMAZEM_GRAO-MANUAL.xlsx` aba `19` (manual novo, com 14 lojas)

## Comparação

| Loja | Manual placa/CHD/SL | Gerado placa/CHD/SL | Verdict |
|------|---------------------|----------------------|---------|
| REGINA BARRA DO IMBUY | TML-6D96 / **15:40 / 16:25** | TML-6D96 / **14:20 / 14:27** | ❌ CHD Δ80min, SL Δ118min |
| REGINA 1 DE MAIO | TML-6D96 / 14:20 / **14:30** | TML-6D96 / 15:38 / **16:26** | ❌ CHD Δ78min, SL Δ116min |
| REGINA LUCIO MEIRA | TML-6D96 / **14:35 / 14:55** | TML-6D96 / **14:20 / 14:27** | ❌ CHD Δ15min, SL Δ28min |
| ABASTECEDORA GRAO DA SERRA | TML-6D96 / **15:05 / 15:25** | TML-6D96 / **14:37 / 14:56** | ❌ CHD Δ28min, SL Δ29min |
| ARMAZÉM DO GRÃO BOA VISTA | TML-9I75 / 15:30 / 15:55 | TML-9I75 / sem dado | ❌ sys SEM mas manual tem |
| ARMAZÉM DO GRÃO MATRIZ POSSE | TML-9I75 / 16:50 / 17:55 | TML-9I75 / 17:19 / 17:57 | ❌ CHD Δ29min, SL Δ2 |
| ITAIPAVA | LSL9670 / 14:10 / 14:20 | LSL-9670 / 14:09 / 14:18 | ⚠️ Δ1/2 OK |
| CORREAS | LSL9670 / 14:30 / 14:45 | LSL-9670 / 14:28 / 14:47 | ⚠️ Δ2/2 OK |
| VALPARAÍSO | QST-4C52 / 15:25 / 15:45 | QST-4C52 / 15:25 / 15:44 | ⚠️ Δ0/1 OK |
| MOSELA | QST-4C52 / 16:00 / 16:30 | QST-4C52 / 15:58 / 16:28 | ⚠️ Δ2/2 OK |
| QUITANDINHA | QST-4C52 / 15:00 / 15:20 | QST-4C52 / 14:59 / 15:18 | ⚠️ Δ1/2 OK |
| CAPELA | UDC-6I03 / 15:30 / 16:00 | UDC-6I03 / 15:28 / 15:58 | ⚠️ Δ2/2 OK |
| 16 DE MARÇO | UDC-6I03 / 16:00 / 16:20 | UDC-6I03 / 16:00 / 16:20 | ✅ EXATO |
| A. BARRA DA TIJUCA | LQE-5E01 / 14:10 / 14:40 | LQE-5E01 / 14:08 / 14:39 | ⚠️ Δ2/1 OK |

## Bugs

### 🔴 BUG AR1 — REGINA placas trocadas/multi-trip mal feito

TML-6D96 fez 4 entregas (REGINA BARRA, 1 DE MAIO, LUCIO MEIRA, ABASTECEDORA). Manual:

| Loja | Manual CHD/SL |
|------|---------------|
| BARRA DO IMBUY | **15:40 / 16:25** |
| 1 DE MAIO | **14:20 / 14:30** |
| LUCIO MEIRA | **14:35 / 14:55** |
| ABASTECEDORA | **15:05 / 15:25** |

Gerado:

| Loja | Gerado CHD/SL |
|------|---------------|
| BARRA DO IMBUY | 14:20 / 14:27 ← deveria ser 15:40 |
| 1 DE MAIO | 15:38 / 16:26 ← deveria ser 14:20 |
| LUCIO MEIRA | 14:20 / 14:27 ← deveria ser 14:35 |
| ABASTECEDORA | 14:37 / 14:56 ← deveria ser 15:05 |

**Sys trocou as atribuições.** REGINA BARRA pegou a parada que era 1 DE MAIO, etc. Bug clássico de assignment quando há 4 paradas pra 4 linhas com nomes similares.

### 🔴 BUG AR2 — BOA VISTA sem dado no gerado

Manual: 15:30 / 15:55. Gerado: vazio.

### 🔴 BUG AR3 — POSSE CHD Δ29min

Manual: 16:50. Gerado: 17:19.

## Resumo

| Categoria | Quantidade |
|-----------|------------|
| ✅ OK | 8 |
| 🔴 Bug código | 6 |

## Status: ✅ Auditado
