# Escala Geral — Dia 21/05/2026 (Análise A1-A5)

**Arquivo:** `ESCALA DIA 21/ESCALA GERAL DE MAIO 1 (7).xlsx`

## A1 — Estrutura da escala XLSX

21 abas no workbook (com a aba "21" adicionada). Estrutura idêntica:
- Aba "21" com 381 linhas × 266 cols, 118 merges
- 13 separadores azuis mesclados (mesmas posições)

### Distribuição por seção (Dia 21)

| Seção | Linhas com placa |
|-------|------------------|
| INICIO (Assai + Atacadão + Carrefour) | 50 |
| SUPER PRIX | 10 |
| PREZUNIC | 39 |
| PREZUNIC SPID BENASSI | 8 |
| PREZUNIC SPID NORMAL | 38 |
| SUPER PAX (Vianense + Bloco 2 + Mundial) | 14 |

**Total escala dia 21:** 160 entradas com placa (mais que dia 18, 19, 20).

### Observações da escala original vs alterações

Algumas trocas já podem estar refletidas na própria escala do arquivo:
- r37 Assaí Sabão Rio: aparece como **KPT-5B20 / ROBERTO ALMEIDA** (mas alteração diz que Sabão final seria UBO 0B68 / Valdemiro, e Nilópolis fica com KPT-5B20 / Roberto Almeida)
- r30 Assaí Nilópolis: aparece como **UBO-0B68 / WALTER REGIS** (escala original, antes da alteração)

Conflito entre escala registrada e alteração do WhatsApp — precisa reconciliação manual.

## A2 — Unitrac XLSX (`relatorio_9552.xlsx`)

- **205 abas**, **1.855 paradas** totais
- Período: 21/05/2026 00:00 → 22/05/2026 00:00 ✓

**Top locais:**

| Qtd | Local |
|-----|-------|
| 747 | BASE BENASSI |
| 582 | FORA DE BASE |
| 28 | 2018001 - ROTA BARRA |
| 25 | 2018023 - ROTA ZONA NORTE |
| 19 | 2018009 - ROTA CENTRO |
| 15 | 2018005 - ROTA CAMPOS |

## A3 — Unitrac PDF (`relatorio_9553.pdf`)

OCR Mistral: 169 páginas.

**Comparação placas PDF × XLSX:**

- PDF: 201 placas únicas
- XLSX: 205 placas únicas
- Match exato: 195 (95.1%)
- **OCR confunde:**
  - `I` ↔ `1`: ECT2I70, LSN6I72 (2)
  - `X` ↔ `Z`: DZX3H55 → DZK3H55 (1) — **nova confusão X/Z**
  - `X` ↔ `K`: CXA7B36 → CKA7B36 (1) e LGX1J41 → LGK1J41 (1)
- Só no PDF: DBB9084
- Só no XLSX: GSK0G53, HNG2B61, KPB5I95, QSW3B65, UBO0B68 (5 placas ausentes do OCR)

## A4 — Cruzamento Escala × Unitrac

| Métrica | Valor |
|---------|-------|
| Entradas com placa na escala | 160 |
| Placas únicas na escala | 104 |
| Placas no unitrac | 205 |
| **Match escala → unitrac** | **154/160 (96.3%)** |
| Sem match | 6 |
| Extras no unitrac | 107 |

**Entradas SEM tracking (apenas 6 — melhor dia):**

| Row | Placa | Motorista | Loja |
|-----|-------|-----------|------|
| 28 | LUP1F13 | CARLOS DOS SANTOS | Assaí - Mendanha (Campo Grande) |
| 32 | AMW3424 | MESSIAS | Assaí - Niterói Ponte |
| 40 | LAU1I64 | LUIS FERREIRA | Assaí - São Gonçalo Camil |
| 74 | KWB6998 | DELSON | Prezunic - Botafogo / Serra Azul |
| 234 | KPH8C41 | EDUARDO | Armazem do grão - Central |
| 241 | CDL8E52 | CLUDIOMIR | MUNDIAL |

**TODAS as 6 placas órfãs são RECORRENTES nos 4 dias** → confirmação definitiva de que são veículos fora do sistema unitrac.

## A5 — Alterações do dia 21 (vindas do WhatsApp)

| Loja | Antes | Depois |
|------|-------|--------|
| Assaí - Sabão | KPT 5B20 / Roberto Almeida | UBO 0B68 / Valdemiro (final) |
| Assaí - Nilópolis | UBO 0B68 / Walter Regis | KPT 5B20 / Roberto Almeida |
| Prezunic - Freguesia | TML6D96 | EZU9325 |
| Assaí - Ceasa | EZU9325 | TML6D96 |
| Transbordo Assai Campos | — | Walter Regis / EZU 9D26 (novo) |

Após aplicar:
- KPT5B20 e UBO0B68 trocam de loja entre Sabão ↔ Nilópolis
- EZU9325 e TML6D96 trocam entre Prezunic Freguesia ↔ Assaí Ceasa
- Walter Regis fica como transbordo Campos com EZU9D26

## Conclusões Dia 21

1. **Estrutura idêntica** aos dias anteriores
2. **Unitrac 205 placas / PDF 201** — 4 categorias de OCR error agora confirmadas (`I/1`, `K/X`, `U/J`, `X/Z`)
3. **MELHOR match (96.3%)** — só 6 placas sem tracking
4. **6 placas órfãs definitivamente fora do sistema** (LUP1F13, AMW3424, LAU1I64, KWB6998, KPH8C41, CDL8E52)
5. **Alterações complexas** (5 trocas) com conflito potencial entre escala registrada e alterações pós-emissão
