# Escala Geral — Dia 18/05/2026 (Análise A1)

**Arquivo:** `ESCALA DIA 18/ESCALA GERAL DE MAIO 1 (6).xlsx`

## Estrutura do workbook

18 abas no total. Cada aba com nome = dia do mês ("01", "02", "04"... "18"). O dia "18" tem 381 linhas × 266 colunas, 112 merges. Há também abas auxiliares: `"2° ENTREGA"`, `"MATRIZ"`, `"MOTORISTAS"`.

## Layout da aba "18"

A aba é dividida em **3 blocos verticais**, separados por células mescladas linha-inteira que repetem texto.

```
r1-2:   Header "CARREGAMENTO DIÁRIO - EMISSÃO" + data (2026-05-18)
r3:     Header "1º CARRO / 2º CARRO" (técnico, mesclado, NÃO é rede)
r4:     Cabeçalho de colunas (REDES, PESO, PALETES, QTD, TIPO, MOTORISTA, CÓD, PLACA, ...)
r5-213: BLOCO 1 — escala principal
r215:   linha em branco
r222:   Separador BLOCO 2 ("CARREGAMENTO DIÁRIO - EMISSÃO BENASSI")
r223:   Cabeçalho repetido
r224-237: BLOCO 2 — Benassi (Americanas, CAB, Sendas, Atlântico Sul, etc.)
r239:   linha em branco
r240:   Separador BLOCO 3 ("CARREGAMENTO DIÁRIO - PEDIDOS FORA ESCALA")
r241+:  BLOCO 3 — pedidos fora da escala (Mundial)
r269+:  Resumo de peso por rede em colunas J-M (FRATELLI/JAPI/JANAUBA)
```

## Padrão de colunas (rows de dados)

| Col | Conteúdo |
|-----|----------|
| A   | REDES / FILIAIS (nome da loja, ex: `Assaí - Bangu I - Loja 55`) |
| B   | PESO TOTAL (kg) |
| C   | PALETES (decimal) |
| D   | QTD (`1` = primeira linha do carro; vazio = continuação) |
| E   | TIPO CARRO (1º carro) |
| F   | MOTORISTA (1º) |
| G   | CÓD motorista (1º) |
| H   | PLACA (1º) — formato `AAA-9A99`, `AAA9A99` ou `AAA9999` |
| I-L | TIPO / MOTORISTA / CÓD / PLACA (2º carro) |
| M   | FRATELLI (peso) |
| N   | JAPI (peso) |
| O   | JANAUBA (peso) |

## Separadores mesclados (13 na aba "18")

| Row | Texto |
|-----|-------|
| r3   | "" (header 1º/2º CARRO) |
| **r59**  | **SUPER PRIX** |
| **r70**  | **LOJAS DO PREZUNIC - PROJETO** |
| **r111** | **PREZUNIC SPID - ROMANEIOS TIPO BENASSI** |
| **r120** | **PREZUNIC SPID - ROMANEIOS TIPO NORMAL** |
| **r159** | **FEIRA NOVA** |
| **r172** | **GRUPO EMANUEL** |
| **r181** | **ARMAZÉM DO GRÃO** |
| **r196** | **SUPER PAX** |
| r215 | "" |
| r222 | "CARREGAMENTO DIÁRIO - EMISSÃO BENASSI" |
| r239 | "" |
| r240 | "CARREGAMENTO DIÁRIO - PEDIDOS FORA ESCALA" |

**OBSERVAÇÃO CRÍTICA:** ASSAI, ATACADÃO, CARREFOUR, PRINCESA, SAMS, VIANENSE **não têm separador**. O parser tem que inferir a rede pelo nome da loja.

## Distribuição por rede

### BLOCO 1 (rows 5-212, escala principal)

| Rede | Range | Lojas com placa | Tem separador? |
|------|-------|-----------------|----------------|
| **ASSAI** | r5-45 | 39 lojas (2 SEM PEDIDO) | Não — inferir por "Assaí - " |
| **ATACADÃO** | r46-47 | 2 lojas | Não — inferir por "Atacadão - " |
| **CARREFOUR** | r48-58 | 10 lojas (1 sem placa "CARRO ESCALADO PELA MANHÃ") | Não — inferir por "Carrefour - " |
| **SUPER PRIX** | r60-68 | 9 lojas | r59 |
| **SUPERCOMPRAS** | r69 | 1 loja | Não — linha solitária no meio da SUPER PRIX |
| **PREZUNIC** | r71-110 | 39 lojas | r70 |
| **PREZUNIC SPID** | r112-129 | 17 (TODAS com `[object Object]` — fórmulas, sem placa) | r111 e r120 |
| **PRINCESA** | r130-155 | 26 lojas | Não — inferir por "Princesa - " |
| **SAMS_CLUB** | r156-158 | 3 lojas | Não — inferir por "Sam's - " |
| **FEIRA NOVA** | r160-171 | 12 (todas `[object Object]`, sem placa) | r159 |
| **GRUPO EMANUEL** | r173-180 | 8 (todas peso 0) | r172 |
| **ARMAZÉM DO GRÃO** | r182-195 | 14 (todas `[object Object]`) | r181 |
| **SUPER PAX** | r197-208 | 12 (todas `[object Object]`) | r196 |
| **VIANENSE** | r209-212 | 4 lojas | Não — inferir por "Vianense - " |

### BLOCO 2 (rows 224-236, sob separador "EMISSÃO BENASSI")

| Loja | Row | Placa |
|------|-----|-------|
| Americanas | r224 | LKV-5067 |
| CAB - PETRÓPOLIS | r225 | UBF-5G36 |
| Sendas Central 1º | r226 | KRB2J76 |
| Sendas Central 2º | r227 | (vazio) |
| Atlantico Sul (Barra) | r228 | LTH-4J15 |
| Barramares (Barra) | r229 | LTH-4J15 |
| Barra Tower | r230 | LTH-4J15 |
| Santo Agostinho | r231 | NSM-6D98 |
| Meat4you (Barra) | r232 | (sem placa) |
| Mercado Q.Marche | r233 | (sem placa) |
| Armazem do grão Central | r234 | KPH-8C41 |
| Mercado de Santa | r235 | LMF-2049 |
| Mercearia Sachinho | r236 | KXA-5966 |

### BLOCO 3 (rows 241+, sob "PEDIDOS FORA ESCALA")

| Loja | Row | Placa |
|------|-----|-------|
| MUNDIAL | r241 | CDL-8E52 |

## Marcadores especiais

Algumas células contêm texto em vez de dados:

- `SEM PEDIDO` — loja sem entrega no dia (ex: r21 Cordovil, r39 Santa Cruz 2)
- `2ª ENTREGA - ATÉ AS 7:00` — info de ordem de entrega
- `CARGA COMPARTILHADA` — duas lojas no mesmo carro
- `CARRO ESCALADO PELA MANHÃ` — manhã (r58 Carrefour Espirito Santo)
- `SOMENTE CARRO COM RAMPA` — restrição
- `ORDEM DE ENTREGA: ...` — sequência forçada

## Fórmulas `[object Object]`

PREZUNIC SPID, FEIRA NOVA, GRUPO EMANUEL, ARMAZÉM DO GRÃO e SUPER PAX usam **fórmulas que referenciam outras planilhas**. ExcelJS retorna `{result, formula, sharedFormula}` em vez de valor primitivo. O parser deve extrair `.result` ou usar arquivos separados:

- `ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (5).xlsx` → SUPER PAX + FEIRA NOVA + EMANUEL
- `ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx` → ARMAZÉM DO GRÃO

Já PREZUNIC SPID tem dados na geral mas como fórmula — precisa resolver `.result`.

## Alterações do dia 18 (vindas do WhatsApp)

| Loja | Antes | Depois |
|------|-------|--------|
| Assaí - Caxias I | EZU-9J51 / ALLAN | UBO-5E05 / ALLAN (mesmo motorista) |
| Assaí - Tijuca II | DDI-6J90 / VALDIR | DBB-8D19 / Paulo Henrique cod 807 |
| Carrefour - Campos | KPN-4F36 / AGENOR | KZJ0E14 / VANOR cod 61 |
| Carrefour - Macaé | KPN-4F36 / AGENOR | KZJ0E14 / VANOR cod 61 |
| Princesa - Flamengo | KQR-2J11 / KANU | EYL-8B91 / RAFAEL cod 184502 |

## A2 — Unitrac XLSX (`relatorio_9402.xlsx`)

- **207 abas**, uma por placa, **2.326 paradas** totais
- Período: 18/05/2026 00:00 → 19/05/2026 00:00
- **ExcelJS falha** ao abrir esse arquivo → usar SheetJS (`xlsx`)
- Datas em formato americano: `5/18/26 14:42`
- Placas na aba: misturadas (com traço `AKZ-2745` ou sem `AFY7J99`) — normalizar removendo `[-\s]`

**Estrutura de cada aba:**

| Row | Conteúdo |
|-----|----------|
| r1 | `RELATÓRIO DE PARADAS x SERVIÇOS` |
| r2 | `PERÍODO DE: ... À: ...` |
| r4 | Header sumário (Veículo, Início, Fim, Qtd Paradas, Distância, Tempos) |
| r5 | Dados sumário da viagem |
| r6 | Header das paradas |
| r7+ | Paradas individuais |

**Colunas das paradas (r6 header → r7+ dados):**

| Col | Conteúdo |
|-----|----------|
| A | Condutor (geralmente vazio) |
| B | Veículo (placa repetida) |
| C | Data Parada (entrada) |
| D | Data Saída |
| E | Duração Parada (`0D 04:40:18`) |
| F | Distância Até o Local (km) |
| G | Tempo Até o Local |
| H | Endereço completo |
| I | Latitude |
| J | Longitude |
| K | **Local da Parada** (chave para identificar loja) |

**Categorias de "Local da Parada":**

- `BASE BENASSI - BASE BENASSI` (833×) — base de operações
- `FORA DE BASE E LOCAL DE SERVIÇO` (798×) — em trânsito
- `<código> - <NOME LOJA>` (ex: `560031 - SENDAS MEIER`, `202005 - PAX GUADALUPE`) — entrega em cliente
- `<código rota> - ROTA <NOME>` (ex: `2018001 - ROTA BARRA`) — rota Zona Sul agrupada

## A3 — Unitrac PDF (`relatorio_9401.pdf`)

OCR via Mistral (`etl-ocr`): 211 páginas, ~763KB de texto markdown. Mesma estrutura do XLSX (tabelas com 11 colunas idênticas).

**Comparação placas PDF × XLSX:**

- PDF: 206 placas únicas
- XLSX: 207 placas únicas
- Match exato: 202
- **OCR confunde `I` ↔ `1`** em 4 casos:
  - `ECT2170` (PDF) vs `ECT2I70` (XLSX)
  - `KNC1134` vs `KNC1I34`
  - `LSN6172` vs `LSN6I72`
  - `TML5170` vs `TML5I70`
- 1 placa só no XLSX: `KPB5I95` (sumiu no OCR)

**Conclusão:** XLSX é o source confiável. PDF serve como verificação manual de auditoria — a confusão `I`/`1` é sistemática e previsível.

## A4 — Cruzamento Escala × Unitrac (placa-a-placa)

| Métrica | Valor |
|---------|-------|
| Entradas com placa na escala | 146 |
| Placas únicas na escala | 110 |
| Placas no unitrac | 207 |
| **Match escala → unitrac** | **133/146 (91.1%)** |
| Sem match (escala não rastreada) | 13 |
| Extras no unitrac (não estão na escala) | 108 |

**Entradas da escala SEM tracking no unitrac (13):**

| Row | Placa | Motorista | Loja |
|-----|-------|-----------|------|
| 12 | KNS8D16 | CLEBER SODRE | Assaí - Boulevard (2º carro) |
| 23 | MQV9D14 | ANTONIO RODRIGUES | Assaí - Galeão |
| 37 | MQI6C04 | JOSIAS | Assaí - Sabão Rio (Benfica) |
| 38 | KGO5E65 | FERNANDO | Assaí - Santa Cruz |
| 40 | LAU1I64 | LUIS FERREIRA | Assaí - São Gonçalo Camil |
| 42 | MQV9D15 | JOSÉ LUZIMAR | Assaí - São João do Meriti |
| 74 | KWB6998 | DELSON | Prezunic - Botafogo / Serra Azul |
| 75 | UBF5G34 | BRUNO | Prezunic - Botafogo (Voluntários, 2º carro) |
| 80 | LUP1F13 | CARLOS DOS SANTOS | Prezunic - Jauru / Serra Azul |
| 81 | LUP1F13 | CARLOS DOS SANTOS | Prezunic - Taquara / Serra Azul |
| 101 | UBF5G34 | RODRIGO | Prezunic - Padre Miguel |
| 234 | KPH8C41 | EDUARDO | Armazem do grão - Central |
| 241 | CDL8E52 | CLUDIOMIR | MUNDIAL |

**Hipóteses para SEM MATCH:**
- Placas que ficaram na base / não saíram (LUP1F13 nas duas Serra Azul = mesmo carro, talvez não viajou)
- Veículos cadastrados em outro centro de custo / unidade Benassi
- Placas digitadas errado na escala
- Placas que vão pra Serra Azul (que não tem unitrac próprio?)

**108 placas extras no unitrac sem aparecer na escala geral:**
- Maioria é da Zona Sul, Pax, Feira Nova, Emanuel, Armazém (estão em arquivos separados)
- Algumas: KPT5B20 (escala 21), DBB8D19 (alteração dia 18 da Tijuca II)
- Confirma que o unitrac tem TODOS os carros Benassi, e a escala geral só tem um subset

## Conclusões do Dia 18

1. **XLSX da escala:** estrutura sólida, parser precisa lidar com fórmulas (`.result`), separadores azuis mesclados e redes sem separador (inferir por prefixo de loja)
2. **XLSX do unitrac:** ExcelJS falha → usar SheetJS; data em formato americano; placas normalizadas removendo `[-\s]`
3. **PDF do unitrac:** confirmação visual, 99% match com XLSX, apenas ruído OCR `I`↔`1`
4. **Cruzamento:** 91.1% match — bom resultado, 13 entradas pendentes de explicação caso a caso
5. **Alterações:** as 4 trocas precisam ser aplicadas ANTES do cruzamento — `EYL8B91`, `DBB8D19`, `UBO5E05` estão no unitrac (alterações vão melhorar o match)

## Heurísticas para o parser

1. **Detectar separador:** linha mesclada `A:?:?` cobrindo múltiplas colunas com texto não-vazio (excluir os que começam com "CARREGAMENTO" ou "TOTAL").
2. **Atribuição de rede em seção sem separador:** inferir por prefixo do nome da loja (`Assaí`, `Atacadão`, `Carrefour`, `Princesa`, `Sam's`, `Vianense`, `SUPERCOMPRAS`).
3. **Linha válida de dados:** coluna H tem placa que casa com `/^[A-Z]{3}[-]?\d[A-Z0-9]\d{2}$/i`.
4. **Linhas de continuação:** coluna D vazia + col F repete motorista da linha anterior → mesmo carro, próxima loja.
5. **Resolver fórmulas:** quando `cell.value` é objeto com `result`, usar `cell.value.result`.
6. **Pular:** linhas de TOTAL (col A começa com "TOTAL"), linhas em branco, separadores "CARREGAMENTO DIÁRIO" e "RESUMO DE".
