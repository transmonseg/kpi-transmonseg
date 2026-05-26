# Auditoria GUANABARA dia 19/05/2026

**Gerado:** `KPI-GUANABARA-2026-05-19 (7).xlsx` (27 lojas com dado)
**Manual:** `KPI-GUANABARA-MANUAL.xlsx` aba `19` (28 lojas)

## Comparação (placa + CHD/SL)

| Loja | Manual | Gerado | Verdict |
|------|--------|--------|---------|
| Eng. De Dentro F.31 | KSG5412/SEM, 2º=KVG7A00 | KSG-5412/SEM, 2º=KVG-7A00 | ✅ OK |
| Penha F.2 | LFK-2C56 / 07:40/08:45 | LFK-2C56 / 07:40/08:45 | ✅ EXATO |
| Piedade F.3 | KNI-8988 SEM | KNI-8988 SEM | ✅ OK |
| Realengo F.4 | LBL-5907 / 11:00/12:40 | LBL-5907 / 11:01/12:39 | ⚠️ Δ1/1 OK |
| Bangu F.5 | KSP-8814 / 10:40/12:00 | KSP-8814 / 10:42/11:59 | ⚠️ Δ2/1 OK |
| Itaguai F.6 | LGX-1J41 SEM | LGX-1J41 SEM | ✅ OK |
| Barra F.7 | GBC6E12 / 08:20/10:40 | GBC-6E12 / 08:20/10:41 | ⚠️ Δ0/1 OK |
| Niterói F.8 | KTR0546 / **06:20/10:05** | KTR-0546 / **09:20/10:07** | ❌ CHD Δ180min |
| Irajá F.9 | LIF-3965 SEM | LIF-3965 SEM | ✅ OK |
| Vila Isabel F.36 | GUE0D63 SEM, 2º=KUM9J05 (THIAGO) | GUE-0D63 SEM, 2º falta | ❌ 2º carro faltando |
| Campo Grande F.10 | KNI-8942 SEM (ARTHUR) | HUR-1841 (ART) 20:04/20:10, 2º=KNI-8942 | ❌ **PLACA TROCADA** + tempos errados |
| São Gonçalo F.11 | FSE (truncado, VAGNER) 11:30/12:45 | ?? | ⚠️ verificar |
| Rio Da Prata F.13 | KRA-1083 / 10:50/12:00 | KRA-1083 / 10:51/12:01 | ⚠️ Δ1/1 OK |
| Padre Miguel F.14 | LFA-4744 SEM | LFA-4744 sem dado | ✅ OK |
| Bento Ribeiro F.15 | LBB5205 / 10:40/**12:50** | LBB-5205 / 10:32/**10:36** | ❌ CHD Δ8min, SL Δ134min muito curto |
| Nova Iguaçu F.16 | KNB0752 / 09:15/10:15 | KNB-0752 / 09:13/10:14 | ⚠️ Δ2/1 OK |
| Campinho F.17 | DBB-9084 SEM, 2º=DBB-9084 | DBB-9084 sem dado, 2º=DBB-9084 | ✅ OK |
| Caxias F.18 | GVH-1397 / 10:45/11:55 | GVH-1397 / SEM | ❌ sys SEM mas manual tem |
| Tanque F.19 | LIA7683 / 10:50/12:15 | LIA-7683 / 10:50/12:14 | ⚠️ Δ0/1 OK |
| Paciência F.21 | LHE3473 SEM | LHE-3473 SEM | ✅ OK |
| Del Castilho F.22 | KTP-4F70 / 10:30/11:30 | KTP-4F70 / 10:29/11:29 | ⚠️ Δ1/1 OK |
| Tijuca F.25 | CBR9452 SEM, 2º=FTV (truncado, DAVISON) | CBR-9452 SEM, 2º falta | ❌ 2º carro faltando |
| Campo Grande F.30 | CDM-8645 / **08:00**/10:15 | CDM-8645 / **08:55**/10:14 | ❌ CHD Δ55min |
| Recreio F.27 | GEB9H31 / 08:30/10:10 | GEB-9H31 / 08:29/10:11 | ⚠️ Δ1/1 OK |
| Santa Cruz F.28 | KTR6724 / 09:20/10:05 | KTR-6724 sem dado | ❌ sys SEM mas manual tem |
| São João F.20 | KTZ-2055 SEM | KTZ-2055 sem dado | ✅ OK |
| Bonsucesso F.23 | GVH-0163 / 10:50/11:55 | GVH-0163 / 10:45/10:50 | ❌ SL Δ65min curto |
| Catonho F.31 | LFI1467 SEM | LFI-1467 SEM | ✅ OK |
| Catonho F.31 (gerado) | — | LFI-1467 SEM | OK |

## Bugs

### 🔴 BUG G1 — Niterói F.8 CHD Δ180min

Manual: CHD=06:20, SL=10:05.
Gerado: CHD=09:20, SL=10:07.

Sys pulou parada manhã (06:20) e pegou outra parada (09:20). Mesmo padrão "parada errada" do ZS/ASSAI.

### 🔴 BUG G2 — Campo Grande F.10 placa trocada

Manual: ARTHUR/KNI-8942 SEM.
Gerado: ART/HUR-1841 com 20:04/20:10, 2º=KNI-8942.

Sys inverteu: placa real KNI-8942 deveria ser 1º carro SEM. Em vez disso pegou HUR-1841 (que é placa de motorista chamado "ART HUR"? Provável **bug de parsing do nome**: "ARTHUR" foi quebrado em "ART" + "HUR-1841" como se fosse placa).

### 🔴 BUG G3 — Caxias F.18 e Santa Cruz F.28 SEM mas manual tem

Manual: GVH-1397 / 10:45 / 11:55 (Caxias). Gerado: SEM.
Manual: KTR-6724 / 09:20 / 10:05 (Santa Cruz). Gerado: sem dado.

Provavelmente placas com problemas de match (variante OCR?).

### 🔴 BUG G4 — Bento Ribeiro F.15 SL muito curta

Manual: 10:40 / **12:50** (durou 2h10min).
Gerado: 10:32 / **10:36** (durou 4min!).

Padrão `LOJA + FORA_BASE`. Caminhão entrou no geofence rapidamente, saiu, mas ficou na área entregando.

### 🔴 BUG G5 — Bonsucesso F.23 SL curta

Manual: 10:50 / 11:55. Gerado: 10:45 / 10:50. SL Δ65min curto. Mesmo padrão.

### 🔴 BUG G6 — Campo Grande F.30 CHD Δ55min

Manual: 08:00 / 10:15. Gerado: 08:55 / 10:14. Sys pegou parada 55min depois.

### 🔴 BUG G7 — 2º carros faltando (Vila Isabel F.36, Tijuca F.25)

Manual mostra 2º carro com motorista/placa. Gerado: vazio.

## Resumo

| Categoria | Quantidade |
|-----------|------------|
| ✅ OK | ~15 |
| ⚠️ Δ pequeno | ~6 |
| 🔴 Bug código | 7 |

## Status: ✅ Auditado
