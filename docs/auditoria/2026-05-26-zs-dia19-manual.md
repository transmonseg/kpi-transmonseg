# Auditoria manual ZS dia 19/05/2026

Comparação placa-por-placa entre:
- **KPI Gerado**: `C:/Users/media/Downloads/KPI-ZONA_SUL-2026-05-19 (8).xlsx` (51 linhas, aba `19.05`)
- **KPI Manual**: `KPI ZONA SUL-MANUAL.xlsx` aba `19` (55 linhas com dado)
- **Escala**: `ESCALA ZONA SUL - MAIO (6).xlsx` aba `MATRIZ` (linhas dia 19)
- **GPS Unitrac**: `relatorio_9391.xlsx` + `relatorio_9572.pdf`
- **Alterações**: `ALTERACOES/alteracoes_19.05.txt`

## Bugs encontrados (varredura manual)

### 🔴 BUG 1 — EBG-2D13 atribui parada manhã às lojas noturnas

Placa EBG-2D13 escalada pra Loja 22 e Loja 25 (ambas noite, manual 19:00+).

| Loja | Manual SC/CHD/SL | Gerado SC/CHD/SL | Δ |
|------|-------------------|------------------|---|
| Loja 22 S.Conrado | 19:00 / 21:10 / 21:35 | 09:53 / **11:09 / 12:04** | 540min off |
| Loja 25 Jd.Botânico | 19:00 / 20:15 / 21:00 | 09:53 / **11:09 / 12:04** | 540min off |

Sys atribuiu a MESMA parada (11:09 manhã) para 2 lojas distintas.

### 🔴 BUG 2 — LQE-5401 Loja 47 atribui parada manhã

| Loja | Manual | Gerado | Δ |
|------|--------|--------|---|
| Loja 47 Catete | 18:30 / **19:40 / 20:20** | 10:04 / **11:09 / 12:25** | 510min off |

LQE-5401 fez 2 viagens (manhã Loja 30 + noite Loja 47). Sys deu manhã.

### 🔴 BUG 3 — Placa trocada: Loja 33 (manual BBH-1C94, gerado LCO-0978)

Manual: Loja 33 placa **BBH-1C94** chegou 05:30 / 07:50.
Gerado: Loja 33 placa **LCO-0978** sem dados.

Isso é caso de plate-swap (manual = placa real, escala = LCO-0978). Manual indica que o motorista Josué fez 33 com BBH-1C94. Sys não pegou.

### 🔴 BUG 4 — Loja 21 1ª: manual KWK-4593, gerado LTQ-0783

| | Placa | SC/CHD/SL |
|---|---|---|
| Manual 1ª | KWK-4593 | 05:25 / 06:15 / 08:15 |
| Gerado | LTQ-0783 | sem dado |
| Manual 2ª | LQE-5401 | NÃO FOI |

Mesma situação plate-swap — gerado usou placa escalada (LTQ) sem GPS.

### 🔴 BUG 5 — Loja 07 1ª: manual LCO-0978, gerado KWK-4593

| | Placa | SC/CHD/SL |
|---|---|---|
| Manual | LCO-0978 (motorista RAPHAEL/LUIZ ALVES) | 05:25 / 06:20 / 11:20 |
| Gerado | KWK-4593 (motorista RODRIGO) | 05:23 / 06:15 / 08:17 |

KWK-4593 deve ter passado pela Loja 07 também (Δ5min CHD bate). Mas Loja 07 da manhã era da LCO-0978 conforme manual. Sys está pegando a parada errada.

### 🔴 BUG 6 — Loja 48: manual RJL-7D33 NÃO FOI, gerado BBH-1C94 entrega

| | Placa | SC/CHD/SL |
|---|---|---|
| Manual | RJL-7D33 (FRANCISCO IRAN) | NÃO FOI |
| Gerado | BBH-1C94 (JOSUE DOS SANTOS) | 04:49 / 05:29 / 07:51 |

Sys pegou BBH-1C94 pra Loja 48 (carro do JOSUE — que na realidade fez 33 e 03/19 noite). Provavelmente plate-swap deu match errado.

### 🔴 BUG 7 — Lojas FALTANDO no gerado

| Loja | Manual placa | Manual SC/CHD/SL | Gerado |
|------|--------------|------------------|--------|
| Loja 07 2ª | KQR-2J11 (ALESSIO) | 14:10 / 15:00 / 16:10 | NÃO APARECE |
| Loja 11 1ª | DBB-8D19 (PAULO HENRIQUE) | 12:55 / 14:35 / 17:05 | NÃO APARECE |
| Loja 19 1ª | LCO-0978 | 19:10 / 20:00 / 21:35 | NÃO APARECE |
| Loja 21 2ª | LQE-5401 NÃO FOI | NÃO FOI | NÃO APARECE |
| MEGA BOX 2 noite | LNU-7733 | 18:25 / 19:30 / 20:10 | NÃO APARECE |
| MEGA BOX 2 (3ª) | AKZ-2594 | 18:30 / 19:30 / 19:40 | NÃO APARECE |

### 🔴 BUG 8 — Loja 31 1ª: manual DBB-8D19 (Paulo Henrique), gerado LTE-0A64 SEM

| | Placa | SC/CHD/SL |
|---|---|---|
| Manual 1ª (R19) | DBB-8D19 (PAULO HENRIQUE) | 12:55 / **14:00 / 14:10** |
| Manual 2ª (R38) | LTE-0A64 (DOUGLAS) | SEM RASTREADOR |
| Gerado | LTE-0A64 (DOUGLAS) | SEM |

Sys só pegou a 2ª linha (LTE-0A64 SEM), perdeu a 1ª (DBB-8D19 14:00/14:10).

### 🟡 BUG 9 — MEGA BOX 1 (R16) e MEGA BOX 2 (R17) sem tempos

| | Manual placa | Manual SC/CHD/SL | Gerado placa | Gerado |
|---|---|---|---|---|
| MEGA BOX 1 (Olaria 1ª) | KOP-4978 (MILTON) | 13:25 / 13:40 / 13:55 | MDV-3746 SEM | sem tempo |
| MEGA BOX 2 (Recreio 1ª) | KOP-4978 (MILTON) | 13:25 / 16:40 / 17:00 | AKZ-2594 sem dado | sem tempo |

### 🟡 BUG 10 — Loja 14 falso positivo

| | Placa | Resultado |
|---|---|---|
| Manual | UBO-5E05 | NÃO FOI |
| Gerado | UBO-5E05 | 04:03 / 06:06 / 09:34 |

GPS confirma UBO-5E05 fez Loja 14 às 04:03-09:34. Mas manual marca NÃO FOI.
Provavelmente caminhão passou na área mas não entregou. Manual decide.

### 🟡 BUG 11 — Loja 32 falso positivo

| | Placa | Resultado |
|---|---|---|
| Manual | QAH-2H50 | SEM |
| Gerado | QAH-2H50 | 04:54 / 05:31 / 06:22 |

QAH-2H50 fez Loja 42 (manual SEM, gerado SEM) e Loja 32 (manual SEM, gerado **5:31**). Caminhão tem GPS mas manual marca SEM rastreador? Pode ser placa sem comunicação intermitente.

### 🟡 BUG 12 — Loja 43 e Loja 45: SL muito curta (FORA_BASE pattern)

| Loja | Manual SL | Gerado SL | Δ |
|------|-----------|-----------|---|
| Loja 43 Barra | 16:55 | 16:20 | 35min |
| Loja 45 Flamengo | 18:00 | 16:19 | 101min |

Mesmo padrão Fonseca dia 20 — manual = fim FORA_BASE, sys = fim LOJA stop.

## Resumo

**Bugs de plate-swap mal feito**: 4-8 (Loja 33, 21, 07, 48, 31, MEGA BOX)
**Parada errada (manhã vs noite)**: 1-2 (EBG-2D13 lojas 22/25, LQE-5401 Loja 47)
**Lojas faltando**: 7 (Loja 07 2ª, Loja 11 1ª, Loja 19 1ª, etc.)
**Falsos positivos**: 10-11 (Loja 14, 32)
**SL curta**: 12 (Loja 43, 45)

## Status

🔍 Em análise

## Fixes aplicados (26/05 noite)

### Fix #1 — aplicar-alteracoes.ts: match por nome quando sem `Sai:`

**Arquivo:** `src/lib/kpi/aplicar-alteracoes.ts:56-83`

Antes, alteração sem `Sai:` só casava a linha original via número de filial (`Filial 23`, `Loja 35`). Lojas SEM número no nome (`Carrefour Campo Grande`, `Assai Camil`, `Assai Sao Goncalo Camil`) ficavam órfãs.

Agora também casa por **tokens fortes** (≥4 chars, removendo nomes de rede e palavras genéricas).

**Exemplo:**
```
Carrefour Campo Grande
Entra: Simao Cod: 184846 Placa: LSN-6I72
```
→ Casa contra linha escala "Carrefour - Campo Grande ●" via tokens `[CAMPO, GRANDE]`.

10/10 testes de aplicar-alteracoes ainda passando.

### Pendente (próximos fixes)

- BUG 1+2: Multi-trip wrong parada (EBG-2D13 noite, LQE-5401 noite)
- BUG 7: Lojas faltando no gerado (Loja 07 2ª, Loja 11 1ª, Loja 19 1ª, MEGA BOX 2 noite)
- BUG 8: Loja 31 1ª (DBB-8D19) sumindo
- BUG 12: SL muito curta Loja 43/45

