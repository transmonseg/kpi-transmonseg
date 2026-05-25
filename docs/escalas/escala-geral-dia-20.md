# Escala Geral — Dia 20/05/2026 (Análise A1-A5)

**Arquivo:** `ESCALA DIA 20/ESCALA GERAL DE MAIO 1 (7).xlsx`

## A1 — Estrutura da escala XLSX

20 abas no workbook (uma a mais que dia 19: aba "20"). Estrutura idêntica:
- Aba "20" com 381 linhas × 266 cols, 113 merges
- Mesma divisão em 3 blocos

### Separadores azuis (13)

Mesmas posições do dia 19: r3, r59, r70, r111, r120, r160, r173, r182, r197, r216, r223, r239, r240.

### Distribuição por seção (Dia 20)

| Seção | Linhas com placa |
|-------|------------------|
| INICIO (Assai + Atacadão + Carrefour) | 53 |
| SUPER PRIX | 10 |
| PREZUNIC | 39 |
| PREZUNIC SPID NORMAL | 30 |
| SUPER PAX (na verdade aqui caem Vianense + Bloco 2 BENASSI + Mundial) | 16 |

## A2 — Unitrac XLSX (`relatorio_9573.xlsx`)

- **207 abas**, **2.175 paradas** totais
- Período: 20/05/2026 00:00 → 21/05/2026 00:00 ✓

**Top locais:**

| Qtd | Local |
|-----|-------|
| 816 | BASE BENASSI |
| 570 | FORA DE BASE |
| 52 | 2018001 - ROTA BARRA |
| 35 | 2018006 - ROTA CAMPO GRANDE |
| 22 | 2018005 - ROTA CAMPOS |
| 18 | REGINA / GRÃO DA SERRA (combo Armazém) |

## A3 — Unitrac PDF (`relatorio_9522.pdf`)

OCR Mistral: 175 páginas.

**Comparação placas PDF × XLSX:**

- PDF: 205 placas únicas
- XLSX: 207 placas únicas
- Match exato: 199 (96.1%)
- **OCR confunde:**
  - `I` ↔ `1`: ECT2I70, TML9I75, UEH9I93 (3 placas)
  - `K` ↔ `X`: KQX9G38 → KQK9G38 (1)
  - `U` ↔ `J`: KZU4C37 → KZJ4C37 (1) — **nova categoria de OCR error**
- Só no PDF: DBB9084
- Só no XLSX: KPB5I95 (recorrente!), ETI5F79, LSN6I72

## A4 — Cruzamento Escala × Unitrac

| Métrica | Valor |
|---------|-------|
| Entradas com placa na escala | 152 |
| Placas únicas na escala | 114 |
| Placas no unitrac | 207 |
| **Match escala → unitrac** | **137/152 (90.1%)** |
| Sem match | 15 |
| Extras no unitrac | 106 |

**Entradas SEM tracking (15):**

| Row | Placa | Motorista | Loja |
|-----|-------|-----------|------|
| 11 | MQV9D14 | ANTONIO RODRIGUES | Assaí - Barra II |
| 21 | UBF5G34 | RODRIGO | Assaí - Cordovil |
| 23 | JXA4I92 | EDSON | Assaí - Galeão |
| 28 | KGO5E65 | FERNANDO | Assaí - Mendanha |
| 32 | AMW3424 | MESSIAS | Assaí - Niterói Ponte |
| 34 | JKR0E08 | ISRAEL MYNSSEN | Assaí - Nova Iguaçu 2 |
| 37 | MQV9D15 | JOSÉ LUZIMAR | Assaí - Sabão Rio |
| 40 | LAU1I64 | LUIS FERREIRA | Assaí - São Gonçalo Camil |
| 42 | LQK0F07 | CLAUDIO LUIZ | Assaí - São João do Meriti |
| 74 | KWB6998 | DELSON | Prezunic - Botafogo / Serra Azul |
| 80 | LUP1F13 | CARLOS DOS SANTOS | Prezunic - Jauru / Serra Azul |
| 81 | LUP1F13 | CARLOS DOS SANTOS | Prezunic - Taquara / Serra Azul |
| 92 | UBF5G34 | RODRIGO | Prezunic - Méier / Serra Azul |
| 234 | KPH8C41 | EDUARDO | Armazem do grão - Central |
| 241 | CDL8E52 | CLUDIOMIR | MUNDIAL |

**Placas pendentes recorrentes (3 dias seguidos):**
- LUP1F13 (Prezunic Serra Azul)
- KPH8C41 (Armazem Central)
- CDL8E52 (Mundial)
- KWB6998 (Prezunic Botafogo Serra Azul)
- UBF5G34 (multi-loja)

Essas placas nunca aparecem no unitrac — provavelmente são veículos que não passam pela base Benassi ou rodam fora do sistema de tracking.

## A5 — Alterações do dia 20 (vindas do WhatsApp)

| Loja | Antes | Depois |
|------|-------|--------|
| Assaí - Taquara | UBO 0B68 / Walter Regis | UBO 5E01 (carro sem chave) |

Apenas 1 alteração simples (troca de placa, motorista mantido).

Após aplicar:
- Linha do Assaí Taquara muda de UBO0B68 → UBO5E01
- UBO5E01 está no unitrac do dia 20? Vou verificar… (consta na escala em outras linhas, está no unitrac)

## Conclusões Dia 20

1. **Estrutura idêntica** aos dias 18 e 19
2. **Unitrac 207 placas / PDF 205** com mesmos tipos de OCR error (+novo `U/J`)
3. **Match 90.1%** — entre dia 18 (91.1%) e dia 19 (93.8%)
4. **15 sem tracking** — placas novas do dia 20 também ficam fora (MQV9D14, JKR0E08, MQV9D15, LQK0F07)
5. **Padrão de placas órfãs** se mantém: 5 placas recorrentes nos 3 dias indicam veículos fora do sistema de rastreamento Benassi
