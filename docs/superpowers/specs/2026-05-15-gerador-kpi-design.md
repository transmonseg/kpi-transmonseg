# Gerador de KPI — Spec (15/05/2026)

## Goal

Substituir o gerador-xlsx.ts atual por um sistema que produz **16 arquivos `KPI {Rede}.xlsx`** (1 por rede), no mesmo padrão visual do template `KPI PRINCESA.xlsx` que William usa hoje, mas com design contemporâneo ("mais chique" — pedido literal Érica 15/05 17:30:47).

## Cliente

- Operadora real: Érica (substituta de William a partir de 30/05)
- Cliente final do output: 8 grupos WhatsApp (1 por KPI/rede); Érica copia da tabela e cola
- Output secundário: arquivo XLSX baixável para impressão/arquivamento

## Princípios

1. **Mesma estrutura do template oficial** — para Érica reconhecer o produto
2. **Visual contemporâneo** — fora do Excel 2010 default
3. **Mantém logo TRANSMONSEG amarelo** — identidade visual da empresa
4. **Sem ambiguidade visual** — anomalias destacadas, vazios explícitos
5. **Frozen header + zebra** — leitura facilitada de tabelas longas

## Arquitetura

### Geração

`POST /api/kpi/gerar`:
- Input: `{ data: '2026-05-15', redes: ['PRINCESA', 'ZONA_SUL', ...] }` (default: todas as 16)
- Para cada rede:
  1. Lê `kpi_rotas` + `kpi_linhas` da data
  2. Lê arquivo existente do Storage (`kpi/{rede}/{rede}.xlsx`) ou cria do template
  3. Regenera **só a aba do dia atual** (ex: `15`)
  4. Atualiza no Storage
  5. Retorna URL assinada de download

### Estrutura de arquivo

`KPI Princesa.xlsx`:
```
├── matriz   ← template fixo (26 linhas pra Princesa, varia por rede)
├── 01       ← aba do dia 01/05
├── 02
├── 04
├── 05
...
├── 15       ← aba do dia atual (regenerada)
```

Zona Sul tem além disso:
```
├── BASE         ← mapeamento filial→bairro (PROCV)
├── ENDEREÇO     ← endereços completos das filiais (opcional)
```

## Layout das abas de dia

### Linhas 1-4 (cabeçalho fixo)

| Row | Conteúdo | Estilo |
|---|---|---|
| 1 | Logo TRANSMONSEG \| `RELATÓRIO KPI · {Rede}` \| Logo (merged) | h=50px, fundo `#FFD700`, Calibri 18 bold preto, centro vertical |
| 2 | `BENASSI · {dia da semana}, {DD} de {Mês} de {YYYY}` (merged) | h=22px, fundo branco, Calibri 11 italic cinza escuro `#475569`, centro |
| 3 | (vazia) | h=8px |
| 4 | Headers de colunas | h=30px, fundo `#1F4E78`, Calibri 11 bold branco, frozen |

### Colunas

| Col | Header | Width | Conteúdo | Format |
|---|---|---|---|---|
| A | REDES / FILIAIS | 35 | Nome da loja (com `(1ª)`, `(2ª)`, `(3ª)` se rota Lagos) | string, esquerda |
| B | MOTORISTA | 28 | Nome (com `(2º CARRO)` se for) | string, esquerda |
| C | CÓDIGO | 10 | Cod motorista | int, centro |
| D | PLACA | 12 | `ABC-1234` ou Mercosul `ABC1D23` | string, centro |
| E | SAÍDA CD | 12 | hora | `h:mm`, centro |
| F | CHD LOJA 1 | 12 | hora | `h:mm`, centro |
| G | SAÍDA LOJA 1 | 12 | hora | `h:mm`, centro |
| H | TEMPO LOJA 1 | 12 | `=MOD(G-F,1)` | `h:mm`, centro |
| I-K | LOJA 2 (CHD/SAÍ/TEMPO) | 12 | só se rede usa multi-loja | igual |
| L-N | LOJA 3 (CHD/SAÍ/TEMPO) | 12 | só se rede usa multi-loja | igual |
| O (ou última) | OBS | 25 | "⚠ {motivo}" se anomalia, vazio se OK | string, esquerda |

**Detecção de quantas lojas por rede:**
- Princesa, Carrefour, Prezunic, etc.: max 3 lojas (Princesa tem rotas Lagos)
- Zona Sul: max 3 lojas (multi-entrega por veículo)
- Outras redes: max 1 loja (default)
- Logica: `maxLojas = max(rotas.map(r => r.paradas.filter(p => p.classificacao === 'LOJA').length))` clamped [1, 3]

### Linhas de dados (row 5+)

- Altura 22px
- Zebra: par = branco, ímpar = `#F8FAFC`
- Bordas: só horizontal inferior, cor `#E2E8F0`, estilo `thin`
- **TEMPO LOJA formatação condicional:**
  - ≤ 60min: fundo verde claro `#DCFCE7`
  - 60-120min: fundo amarelo claro `#FEF3C7`
  - > 120min: fundo pêssego `#FED7AA`
- **Linha com anomalia HIGH:** fundo `#FEF2F2` (vermelho ultra suave) na linha inteira
- **Loja não rodou (todos os horários vazios):** italic + cor cinza `#94A3B8`

### Comportamentos especiais

#### 2º carro mesma loja

```
| Princesa Niterói | LUIZ CESAR              | 184621 | LMF-2049 | 4:15 | 5:55 | 6:23 | 0:28 |
| Princesa Niterói | LUIZ CESAR (2º CARRO)   | 184621 | LMF-2049 | 4:20 | 6:10 | 6:45 | 0:35 |
```

Mesmo nome de loja, segunda linha com sufixo `(2º CARRO)` no motorista.

#### Rota Lagos multi-loja (Princesa)

```
| Iguaba Grande (1ª) | DIEGO | 353 | TML-2D79 | 2:45 | 5:10 | 5:42 | 0:32 | 6:15 | 6:50 | 0:35 |
| Itaboraí (2ª)      | DIEGO | 353 | TML-2D79 | 2:45 | (já preenchido pela linha anterior na col F-H) | | | | |
```

Decisão: **uma linha por loja**, mesma `saida_cd`. Cols `LOJA 2` e `LOJA 3` ficam preenchidos só na primeira linha; outras linhas têm cols 2/3 vazias.

#### Filiais que não rodaram

Aparecem na ordem da matriz com cols E-N vazias e estilo cinza italic. Erica vê o gap.

#### Anomalias visíveis

Coluna OBS ganha ⚠ + texto curto baseado no `codigo`:
- ANOM-01: "⚠ placa sem GPS"
- ANOM-03: "⚠ parada fora geofence ≥10min"
- ANOM-04: "⚠ saída < chegada"
- ANOM-06: "⚠ saída CD ausente"
- ANOM-07: "⚠ chegada antes da saída CD"
- ANOM-08: "⚠ tempo loja >4h"
- ANOM-10: "⚠ loja não cadastrada"
- ANOM-11: "⚠ fora janela operacional"

Severidade HIGH pinta a linha inteira de `#FEF2F2`.

## Aba `matriz` (template fixo por rede)

- Mesmo layout das abas de dia
- Coluna A preenchida com ordem fixa de lojas da rede
- Cols B-N vazias
- Serve como referência visual + fonte da ordem das lojas em cada dia novo

## Aba `BASE` (só Zona Sul)

| Col | Header | Conteúdo |
|---|---|---|
| C | LOJA NÚMERO | 1, 2, 3, ... 48, 1129, MEGA BOX 01, MEGA BOX 02 |
| D | NOME COMPLETO | "Zona Sul Loja 28 - Urca", etc. |
| E | (input manual diário, deprecada na automação) | vazio |
| F | `=PROCV(E2;C:D;2;0)` | resolução PROCV |

Sistema preenche cols C-D no setup. Cols E-F existem só pra compatibilidade visual com workflow William.

Nas abas de dia da Zona Sul, col A usa: `=SE(BASE!F{n}="";"";BASE!F{n})` — preservando o padrão dele.

## Logo

- Logo TRANSMONSEG amarelo extraída do template original `KPI PRINCESA.xlsx`
- Salva como PNG em `src/assets/transmonseg-logo.png` (commit no repo)
- Embedded em cada KPI via `workbook.addImage()` ExcelJS
- Posicionada nas duas pontas da linha 1, dentro da área merged

## Storage no Supabase

Bucket: `kpi-gerado` (privado, signed URLs)

Estrutura:
```
kpi-gerado/
  2026-05/
    Princesa.xlsx
    ZonaSul.xlsx
    Prezunic.xlsx
    ...
```

Um arquivo por rede por mês. Cada `gerar` substitui o arquivo do mês.

## Tabela `kpis` (já existe)

Schema mantido. Adicionar campos se necessário:
- `xlsx_path text` — caminho do storage
- `xlsx_url_assinada text` — URL temporária

## Não escopo

- Geração de PDF (separada, gerador-pdf.ts já existe)
- Envio automático via WhatsApp
- Dashboard analítico
- Multi-empresa / multi-cliente

## Critérios de sucesso

1. ✅ 16 KPIs geradas para dia 15/05 com dados reais já no banco (289 rotas processadas)
2. ✅ Layout visual confirmado pela Érica como "chique"
3. ✅ Erica consegue copiar trecho do XLSX e colar em grupo WhatsApp mantendo formatação
4. ✅ Anomalias claramente visíveis (linha vermelha + texto OBS)
5. ✅ Funciona em Excel 365, LibreOffice e Google Sheets
6. ✅ Tempo de geração < 30s para todas as 16 redes

## Riscos

| Risco | Mitigação |
|---|---|
| Logo embedded quebrar em Sheets/LibreOffice | Testar em todos os 3; fallback texto se quebrar |
| Formatação condicional perdida no copy/paste WhatsApp | Testar com Érica; se quebrar, usar emoji ⏱⚠ no texto |
| Layout muito largo (>16 colunas) corta no print | Configurar área de impressão A4 paisagem; auto-fit |
| Logo TRANSMONSEG.png não estar no repo | Extrair de `KPI PRINCESA.xlsx` original via ExcelJS antes de começar |

## Decisões fechadas

- 1 XLSX por rede por mês, regenera dia atual
- Logo TRANSMONSEG amarelo preservado
- Subtítulo `BENASSI` mantido pra todas as redes (cliente final)
- 2º carro = linha extra com sufixo `(2º CARRO)`
- Multi-loja = cols LOJA 2/3 expandidas
- Anomalias HIGH = linha vermelho suave + OBS ⚠
- Filiais sem rodada = italic cinza
