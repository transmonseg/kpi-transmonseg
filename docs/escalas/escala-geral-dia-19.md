# Escala Geral — Dia 19/05/2026 (Análise A1-A5)

**Arquivo:** `ESCALA DIA 19/ESCALA GERAL DE MAIO 1 (6).xlsx`

## A1 — Estrutura da escala XLSX

19 abas (uma a mais que o dia 18: aba "19"). Padrão idêntico ao dia 18:
- Aba "19" com 381 linhas × 266 cols, 118 merges
- Mesma divisão em 3 blocos (Principal, Benassi, Pedidos Fora)

### Separadores azuis mesclados (13 na aba "19")

| Row | Texto |
|-----|-------|
| r3 | "" (header 1º/2º CARRO) |
| **r59** | **SUPER PRIX \| ROMANEIO TIPO COZINHA** |
| **r70** | **LOJAS DO PREZUNIC - PROJETO** |
| **r111** | **PREZUNIC SPID - ROMANEIOS TIPO BENASSI** |
| **r120** | **PREZUNIC SPID - ROMANEIOS TIPO NORMAL** |
| **r160** | **FEIRA NOVA** (+1 vs dia 18 = r159) |
| **r173** | **GRUPO EMANUEL** (+1) |
| **r182** | **ARMAZÉM DO GRÃO** (+1) |
| **r197** | **SUPER PAX** (+1) |
| r216 | "" |
| **r223** | **CARREGAMENTO DIÁRIO - EMISSÃO BENASSI** |
| r239 | "" |
| **r240** | **CARREGAMENTO DIÁRIO - PEDIDOS FORA ESCALA** |

**Sem separador (inferir por prefixo de loja):** ASSAI, ATACADÃO, CARREFOUR, SUPERCOMPRAS, PRINCESA, SAMS, VIANENSE.

### Distribuição por rede (Dia 19)

| Rede | Lojas com placa |
|------|-----------------|
| ASSAI (r5-45) | 40 (1 com SEM PEDIDO em r21 Cordovil) |
| ATACADÃO (r46-47) | 2 |
| CARREFOUR (r48-54) | 7 (4 sem placa: Campos/Macaé/JuizFora/EspSanto = SEM PEDIDO) |
| SUPER PRIX (r60-68) | 9 |
| SUPERCOMPRAS (r69) | 1 (EYL-8B91 já com a alteração do Rafael) |
| PREZUNIC (r71-110) | 40 |
| PREZUNIC SPID BENASSI (r112-119) | 8 |
| PREZUNIC SPID NORMAL (r121-129) | 9 |
| PRINCESA (r130-155) | 26 |
| CAB-PETRÓPOLIS (r156) | 1 |
| SAMS_CLUB (r157-159) | 3 |
| FEIRA NOVA (r161-172) | 12 (todas com fórmulas, sem placa) |
| GRUPO EMANUEL (r174-181) | 8 (todas com peso 0) |
| ARMAZÉM DO GRÃO (r183-196) | 14 (todas com fórmulas) |
| SUPER PAX (r198-209) | 12 (todas com fórmulas) |
| VIANENSE (r210-213) | 4 |
| Bloco 2 BENASSI (r225-236) | ~10 (Americanas, Sendas, Atlantico Sul, etc.) |
| Bloco 3 MUNDIAL (r241) | 1 |

## A2 — Unitrac XLSX (`relatorio_9391.xlsx`)

- **206 abas** (1 por placa), **1717 paradas** totais
- Período: 19/05/2026 00:00 → 20/05/2026 00:00 ✓
- Mesma estrutura do dia 18: r1-r6 header, r7+ paradas, 11 colunas

**Top locais de parada:**

| Qtd | Local |
|-----|-------|
| 717 | BASE BENASSI |
| 536 | FORA DE BASE E LOCAL DE SERVIÇO |
| 35 | 2018002 - ROTA BOTAFOGO |
| 31 | 2018001 - ROTA BARRA |
| 18 | 2018038 - ROTA NITEROI / MARICA |
| 14 | 2018006 - ROTA CAMPO GRANDE |

## A3 — Unitrac PDF (`relatorio_9572.pdf`)

OCR Mistral: 200 páginas extraídas.

**Comparação placas PDF × XLSX:**

- PDF: 205 placas únicas
- XLSX: 206 placas únicas
- Match exato: 196
- **OCR confunde `I` ↔ `1`** em 7 placas:
  - ECT2I70 → ECT2170
  - KNC1I34 → KNC1134
  - LSN6I72 → LSN6172
  - TML5I70 → TML5170
  - TML9I75 → TML9175
  - UDC6I03 → UDC6103
  - UEH9I93 → UEH9193
- **OCR confunde `K` ↔ `X`** em 1 placa:
  - KQX9G38 (XLSX) → KQK9G38 (PDF)
- Só no PDF: TML1D82 (1 placa fantasma, talvez OCR errado de outra)
- Só no XLSX: KPB5I95, QSW3B65 (2 ausentes no PDF)

Confiabilidade: **97.6% match** após normalizar `I/1`. Reforça que XLSX é o source canônico.

## A4 — Cruzamento Escala × Unitrac

| Métrica | Valor |
|---------|-------|
| Entradas com placa na escala | 162 |
| Placas únicas na escala | 107 |
| Placas no unitrac | 206 |
| **Match escala → unitrac** | **152/162 (93.8%)** |
| Sem match (escala não rastreada) | 10 |
| Extras no unitrac (não estão na escala) | 107 |

**Entradas SEM tracking (10):**

| Row | Placa | Motorista | Loja |
|-----|-------|-----------|------|
| 32 | AMW3424 | MESSIAS | Assaí - Niterói Ponte |
| 38 | KGO5E65 | FERNANDO | Assaí - Santa Cruz |
| 40 | LAU1I64 | LUIS FERREIRA | Assaí - São Gonçalo Camil |
| 47 | UBF5G34 | RODRIGO | Atacadão - Belford Roxo |
| 74 | KWB6998 | DELSON | Prezunic - Botafogo / Serra Azul |
| 80 | LUP1F13 | CARLOS DOS SANTOS | Prezunic - Jauru / Serra Azul |
| 81 | LUP1F13 | CARLOS DOS SANTOS | Prezunic - Taquara / Serra Azul |
| 110 | UBF5G34 | RODRIGO | Prezunic - Depósito Central |
| 234 | KPH8C41 | EDUARDO | Armazem do grão - Central |
| 241 | CDL8E52 | CLUDIOMIR | MUNDIAL |

**Observações dia 19 vs dia 18:**
- Match subiu de 91.1% → 93.8% (mais entradas batendo)
- 10 placas sem tracking (dia 18 tinha 13)
- LUP1F13, UBF5G34, KWB6998, KPH8C41, CDL8E52 **repetem** sem tracking nos dois dias → forte indicador de que esses carros não rodam com unitrac OU vão para Serra Azul (rota fora do sistema)

## A5 — Alterações do dia 19 (vindas do WhatsApp)

| Loja | Antes | Depois |
|------|-------|--------|
| Assaí - Alcântara I (L35) | já é Simão LSN-6I72 | (já aplicada) entra Paulo Henrique cod 807 DBB-8D19, tipo 710 c/Rampa |
| Assaí - Barra I Senna (L133) | já é Felipe Diego UGA-1D55 | (já aplicada) entra Felipe Diego cod 353 UBO-5E01, tipo Toco c/Rampa Refri |
| Assaí - São Gonçalo Camil (L211) | LAU-1I64 / Luis Ferreira | entra Messias cod 141 AMW-3424, tipo Toco |
| Carrefour - Campo Grande | já é Renan KRW-8E86 | entra Simão cod 184846 LSN-6I72, tipo KIA (2º carro) |

Após aplicar alterações, esperar:
- Assaí São Gonçalo Camil → AMW3424 (mas AMW3424 está sem tracking r32 Niterói Ponte!) — conflito a investigar
- Carrefour Campo Grande → adicionar 2º carro LSN6I72

## Conclusões Dia 19

1. **Estrutura idêntica ao dia 18** — parser deve funcionar igual
2. **Unitrac XLSX 206 abas / PDF 205** — confirma PDF como secundário
3. **Match 93.8%** — melhor que dia 18 (91.1%)
4. **10 placas pendentes** — padrão recorrente (LUP1F13, UBF5G34, KWB6998, KPH8C41, CDL8E52, KGO5E65, LAU1I64) → investigar separadamente
5. **Alteração crítica:** AMW3424 aparece como **substituto** em São Gonçalo Camil mas mesma placa estava em Niterói Ponte (conflito de placa entre 2 lojas no mesmo dia?)
