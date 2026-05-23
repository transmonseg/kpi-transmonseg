# Plano: Análise Escala × Unitrac — Dias 18 a 21/05/2026

**Objetivo:** Analisar a estrutura real de cada escala geral e seu relatório unitrac, cruzar placas, documentar o funcionamento correto de cada escala e depois corrigir o parser/gerador de KPI.

**Ferramentas:**
- `etl-ocr` (Mistral) → PDFs dos relatórios unitrac e escalas
- `Read` / ExcelJS → estrutura dos XLSX
- `mcp__kpi-transmonseg-dev__parse_escala_geral` → testar o parser atual
- `mcp__plugin_supabase_supabase__execute_sql` → consultar dados parsed

**Regra:** UM DOCUMENTO POR VEZ. Não avançar para o próximo antes de entender o atual.

---

## FASE A — Análise por Dia

### Módulo por dia (repetir para 18, 19, 20, 21 nessa ordem)

#### Passo A1 — Escala Geral (XLSX)
- [ ] Abrir o arquivo XLSX com ExcelJS via script Node
- [ ] Mapear: quantas abas, quantas linhas, cabeçalhos por coluna
- [ ] Identificar: como estão divididas as redes (seção por seção ou coluna?)
- [ ] Identificar: padrão de placa (col X), motorista (col Y), loja (col Z)
- [ ] Identificar: células mescladas, headers repetidos, separadores visuais
- [ ] Anotar: quais redes aparecem, quantas linhas por rede
- [ ] Aplicar alterações do dia sobre os dados antes de prosseguir

#### Passo A2 — Relatório Unitrac (XLSX)
- [ ] Abrir o relatório_XXXX.xlsx
- [ ] Mapear: colunas disponíveis (placa, motorista, loja, horário, etc.)
- [ ] Contar: quantas paradas únicas, quantas placas distintas
- [ ] Identificar: formato de placa (com traço? sem? maiúsculo?)
- [ ] Anotar: range de datas/horas no arquivo

#### Passo A3 — Relatório Unitrac (PDF via etl-ocr)
- [ ] Rodar: `python3 ~/.claude/skills/etl-ocr/scripts/extract.py <pdf> /tmp/ocr-relatorio-diaXX.json`
- [ ] Extrair: placas listadas no PDF
- [ ] Comparar placas do PDF vs XLSX do unitrac — conferir se batem
- [ ] Documentar diferenças PDF ↔ XLSX (se houver)

#### Passo A4 — Cruzamento Escala × Unitrac
- [ ] Normalizar placas de ambos (remover traço, maiúsculo)
- [ ] Listar: placas na escala que aparecem no unitrac ✓
- [ ] Listar: placas na escala que NÃO aparecem no unitrac ✗
- [ ] Listar: placas no unitrac que NÃO estão na escala (carros extras?)
- [ ] Aplicar alterações do dia (trocas de placa) e re-cruzar
- [ ] Taxa de match: X/Y placas encontradas

#### Passo A5 — Documento "Como Funciona Esta Escala"
- [ ] Criar `docs/escalas/escala-geral-dia-XX.md` com:
  - Estrutura do XLSX (abas, colunas, merges)
  - Padrão de separação de redes
  - Padrão de placa/motorista/loja
  - Anomalias encontradas
  - Resultado do cruzamento com unitrac
  - Placas sem match e possível motivo

---

## FASE B — Dias na Ordem

### DIA 18/05
**Arquivos:**
- Escala: `ESCALA DIA 18/ESCALA GERAL DE MAIO 1 (6).xlsx`
- Unitrac XLSX: `ESCALA DIA 18/relatorio_9401.pdf` ← PDF primeiro
- Unitrac PDF: `ESCALA DIA 18/relatorio_9402.xlsx`
- Alterações: 4 trocas escala geral (Assai Caxias, Assai Tijuca, Carrefour Campos/Macaé, Princesa Flamengo)

### DIA 19/05
**Arquivos:**
- Escala: `ESCALA DIA 19/ESCALA GERAL DE MAIO 1 (6).xlsx`
- Unitrac XLSX: `ESCALA DIA 19/relatorio_9521.xlsx`
- Unitrac PDF: `ESCALA DIA 19/relatorio_9522.pdf`
- Alterações: 4 entradas escala geral (Assai Alcântara, Barra Senna, SG Camil, Carrefour CG)

### DIA 20/05
**Arquivos:**
- Escala: `ESCALA DIA 20/ESCALA GERAL DE MAIO 1 (7).xlsx`
- Unitrac XLSX: `ESCALA DIA 20/relatorio_9552.xlsx`
- Unitrac PDF: `ESCALA DIA 20/relatorio_9553.pdf`
- Alterações: 1 troca (Assai Taquara)

### DIA 21/05
**Arquivos:**
- Escala: `ESCALA DIA 21/ESCALA GERAL DE MAIO 1 (7).xlsx`
- Unitrac XLSX: `ESCALA DIA 21/relatorio_9564.xlsx`
- Unitrac PDF: `ESCALA DIA 21/relatorio_9565.pdf`
- Alterações: 5 trocas escala geral

---

## FASE C — Varredura do Gerador de KPI

Após análise dos 4 dias, com os documentos de escala produzidos:

- [ ] Comparar o que o parser atual extrai vs o que deveria extrair (baseado nos docs)
- [ ] Listar campos que o parser perde ou distorce
- [ ] Verificar matcher: placa do escala bate com placa do unitrac corretamente?
- [ ] Revisar gerador XLSX: campos corretos, formatação, lojas faltando
- [ ] Aplicar alterações de escala geral no fluxo de processamento
- [ ] Reprocessar dias 18-21 e comparar com KPIs manuais

---

## Output Final por Dia

```
docs/escalas/
  escala-geral-dia-18.md
  escala-geral-dia-19.md
  escala-geral-dia-20.md
  escala-geral-dia-21.md
```

Cada documento servirá como spec para o parser — se o parser divergir do doc, o parser está errado.
