# KPI — Plano de Melhorias de Geração e Análise

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir todos os bugs restantes na geração de KPI, melhorar qualidade visual das planilhas e adicionar ferramentas de reconciliação escala↔KPI.

**Architecture:** O pipeline é: Escala XLSX/PDF → Parser → `escala_linhas` DB → Matcher Unitrac → `kpi_rotas` DB → Consolidador → `kpi_linhas` DB → Gerador XLSX. O modo "simples" pula o DB e cruza diretamente em memória. Todos os arquivos relevantes ficam em `src/lib/`.

**Tech Stack:** Next.js App Router, TypeScript, ExcelJS (XLSX), pdf-parse (PDF), Supabase (DB), Zod (validação).

---

## Contexto da QA (dia 15/05/2026)

### Bugs já corrigidos (commits desta sessão)
| Bug | Arquivo | Status |
|-----|---------|--------|
| TEMPO exibindo 22h+ (somava todas as paradas) | `gerador-kpi.ts` | ✅ Corrigido |
| Texto de restrição aparecia como Motorista 2º Carro | `escala-geral.ts` | ✅ Corrigido |
| KPI 15 colunas mesmo sem 2º carro | `gerador-kpi.ts` | ✅ Corrigido |
| Cores alternadas (tudo amarelo) | `gerador-kpi.ts` | ✅ Corrigido |
| Zona Sul códigos 41-48 exibindo número bruto | `zona-sul-base.ts` | ✅ Corrigido |
| MEGA BOX 1/2 sem mapeamento | `zona-sul-base.ts` | ✅ Corrigido |
| MUNDIAL indo para rede DESCONHECIDO | `escala-geral.ts` + `kpi-styles.ts` | ✅ Corrigido |

### Contagens verificadas (escala vs KPI gerado)
| Rede | Linhas escala | Lojas únicas | Linhas KPI | Status |
|------|--------------|-------------|-----------|--------|
| ASSAI | 41+ | 41 | 41 | ✅ |
| ATACADAO | 2 | 2 | 2 | ✅ |
| ARMAZEM_GRAO | ~14 | ~14 | 14 | ✅ |
| CAB_PETROPOLIS | 1 | 1 | 1 | ✅ |
| CARREFOUR | ~10 | ~10 | 10 | ✅ |
| DESCONHECIDO | 1 (MUNDIAL) | 1 | 1 | ✅ corrigido |
| EMANUEL | 1+1 (geral+pax) | ~6 | 1 | ⚠️ ver Task 1 |
| FEIRA_NOVA | 8 | 8 | 8 | ✅ |
| GUANABARA | ~25 (PDF) | 25 | 25 | ✅ |
| PREZUNIC | 43 linhas | 31 únicas | 31 | ✅ (múltiplos carros) |
| PRINCESA | 9+24 mat. | 33 | 33 | ✅ (usa MATRIZ_LOJAS) |
| SAMS_CLUB | 3 | 3 | 3 | ✅ |
| SENDAS | 10+1 | 10 | 7 | ⚠️ ver Task 2 |
| SUPER_PAX | 30 (PAX+geral) | 9 | 8 | ✅ (1 loja 2 carros) |
| SUPERPRIX | 7 | 7 | 7 | ✅ |
| VIANENSE | 3 | 2 | 2 | ✅ (1 loja 2 carros) |
| ZONA_SUL | ~44 | ~44 | 44 | ✅ corrigido |

### Issues pendentes identificados
1. **EMANUEL sub-contado**: escala PAX tem várias lojas Emanuel, escala geral tem 1. KPI só tem 1 loja. Verificar se parser PAX está mapeando rede_id='EMANUEL' corretamente.
2. **SENDAS discrepância**: escala tem ~10 lojas normais + ~3 Benassi. KPI tem 7. Verificar lojas Benassi — estão indo para SENDAS no DB mas talvez com `tipo_emissao='BENASSI'` que filtra alguma coisa.
3. **"(2º CARRO)" prefix no consolidador**: adicionado no DB, removido no gerador. É redundante e pode confundir outras views. Ver Task 3.
4. **EXTRA no Zona Sul**: código "EXTRA" não tem mapeamento em FILIAIS_ZONA_SUL.
5. **Zona Sul códigos 53, 56, 58**: aparecem no MATRIZ mas sem nome no ENDEREÇO tab.
6. **Loja 47 do Zona Sul**: sem bairro definido, aparece como "Zona Sul Loja 47" (aceitável por ora).

---

## File Map

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/lib/parsers/escala-geral.ts` | Parser escala geral (Assaí, Carrefour, Prezunic etc.) |
| `src/lib/parsers/escala-pax.ts` | Parser escala PAX (Super Pax, Feira Nova, Emanuel) |
| `src/lib/parsers/escala-zona-sul.ts` | Parser escala Zona Sul |
| `src/lib/parsers/escala-armazem-grao.ts` | Parser escala Armazém do Grão |
| `src/lib/parsers/escala-guanabara-pdf.ts` | Parser PDF Guanabara (HLOG) |
| `src/lib/kpi/gerador-kpi.ts` | Gera XLSX do KPI a partir de linhas consolidadas |
| `src/lib/kpi/agrupar-por-loja.ts` | Agrupa linhas carro1+carro2 por loja |
| `src/lib/kpi/consolidador.ts` | Busca kpi_rotas+escala_linhas do DB, monta KpiLinha |
| `src/lib/kpi/zona-sul-base.ts` | Mapa FILIAIS_ZONA_SUL e geração da aba BASE |
| `src/lib/kpi/kpi-styles.ts` | Cores, fontes, REDE_NOMES_CANONICOS |
| `src/lib/kpi/anomalia-obs.ts` | Mapa de anomalias e textos OBS |
| `src/lib/lojas/catalogo-matriz.ts` | MATRIZ_LOJAS (ordem canônica por rede) |

---

## Task 1: Investigar e corrigir sub-contagem do EMANUEL

**Contexto:** A escala PAX (ESCALA PAX, FEIRA NOVA E REDE EMANUEL) tem múltiplas lojas Emanuel mas o KPI dia 15 mostrou só 1. O parser PAX deve retornar as lojas Emanuel com `rede_id='EMANUEL'`.

**Files:**
- Read: `src/lib/parsers/escala-pax.ts`
- Modify: `src/lib/parsers/escala-pax.ts` (se necessário)

- [ ] **Step 1: Ler parser PAX e entender como detecta rede EMANUEL**

```bash
# Lê o arquivo
cat src/lib/parsers/escala-pax.ts
```

- [ ] **Step 2: Parsear o arquivo PAX com data_alvo 2026-05-15 via MCP e contar por rede**

Use o MCP tool `mcp__kpi-transmonseg-dev__parse_escala_pax` com:
- file: `C:\Users\media\Downloads\ESCALAS DIA 15 E RELATORIO (USADAS NO TESTE DAS KPIS GERADAS\ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (3).xlsx`
- data_alvo: `2026-05-15`

Verificar: quantas linhas EMANUEL retornadas? Quais loja_nome_raw?

- [ ] **Step 3: Verificar se o KPI EMANUEL gerado tem somente as lojas do dia**

```bash
node -e "
const ExcelJS = require('./node_modules/exceljs');
(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('C:/Users/media/Downloads/KPIS GERADAS/KPI-EMANUEL-2026-05-15.xlsx');
  const ws = wb.getWorksheet(wb.worksheets[0].name);
  let count = 0;
  ws.eachRow((row, rn) => {
    if (rn <= 4) return;
    const v1 = row.getCell(1).value;
    const v2 = row.getCell(2).value;
    if (v1) { console.log('R'+rn+':', String(v1).substring(0,50), '| Motor:', String(v2||'').substring(0,20)); count++; }
  });
  console.log('Total:', count);
})();
"
```

- [ ] **Step 4: Se parser PAX retorna linhas EMANUEL mas KPI não inclui, checar a route que processa o KPI**

A route que gera KPI a partir de escala PAX provavelmente filtra `rede_id`. Verificar se há filtro que exclui EMANUEL quando processando PAX.

```bash
grep -r "EMANUEL" src/app --include="*.ts" -l
grep -r "EMANUEL" src/app --include="*.tsx" -l
```

- [ ] **Step 5: Corrigir o problema encontrado e commitar**

```bash
git add <arquivos modificados>
git commit -m "fix: incluir lojas EMANUEL da escala PAX no KPI"
```

---

## Task 2: Investigar discrepância SENDAS (10 escala vs 7 KPI)

**Contexto:** A escala geral tem ~7 lojas SENDAS normais + ~3 lojas BENASSI (tipo_emissao='BENASSI'). O KPI tem 7. Verificar se as lojas BENASSI estão sendo filtradas erroneamente.

**Files:**
- Read: `src/lib/kpi/gerador-kpi.ts`
- Read: `src/lib/kpi/consolidador.ts`
- Read: `src/app/painel/kpi/` (routes de geração)

- [ ] **Step 1: Parsear escala geral e contar linhas SENDAS por tipo_emissao**

Use MCP `mcp__kpi-transmonseg-dev__parse_escala_geral` com:
- file: `C:\Users\media\Downloads\ESCALAS DIA 15 E RELATORIO (USADAS NO TESTE DAS KPIS GERADAS\ESCALA GERAL DE MAIO 1 (2).xlsx`
- data_alvo: `2026-05-15`

No resultado JSON, filtrar `rede_id === 'SENDAS'` e agrupar por `tipo_emissao`.

- [ ] **Step 2: Verificar o KPI SENDAS gerado**

```bash
node -e "
const ExcelJS = require('./node_modules/exceljs');
(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('C:/Users/media/Downloads/KPIS GERADAS/KPI-SENDAS-2026-05-15.xlsx');
  const ws = wb.getWorksheet(wb.worksheets[0].name);
  ws.eachRow((row, rn) => {
    if (rn <= 4) return;
    const v1 = row.getCell(1).value;
    if (v1) console.log('R'+rn+':', String(v1).substring(0,60));
  });
})();
"
```

- [ ] **Step 3: Se lojas BENASSI estão faltando, checar como a route de geração filtra linhas**

```bash
grep -rn "BENASSI\|tipo_emissao" src/ --include="*.ts" | grep -v "node_modules"
```

- [ ] **Step 4: Corrigir (se necessário) e commitar**

```bash
git add <arquivos>
git commit -m "fix: incluir lojas BENASSI no KPI SENDAS"
```

---

## Task 3: Remover prefixo "(2º CARRO)" do consolidador

**Contexto:** `consolidador.ts` adiciona `(2º CARRO)` ao nome do motorista antes de salvar no DB. O `gerador-kpi.ts` então remove esse prefixo ao gerar o XLSX. É redundante e polui o DB.

**Files:**
- Modify: `src/lib/kpi/consolidador.ts` linhas 71-73
- Verify: `src/lib/kpi/gerador-kpi.ts` linha 195 (strip regex — pode ser removido depois)

- [ ] **Step 1: Remover o prefixo do consolidador**

Em `src/lib/kpi/consolidador.ts`, remover as linhas 71-73:

```typescript
// ANTES (remover):
if (carroOrdem === 2 && motorista) {
  motorista = `(2º CARRO) ${motorista}`
}

// DEPOIS: simplesmente não adicionar o prefixo
// (a coluna no XLSX já é "MOTORISTA 2", o prefixo é redundante)
```

- [ ] **Step 2: Manter o strip no gerador por compatibilidade (dados antigos no DB)**

Em `src/lib/kpi/gerador-kpi.ts` linha 195, o strip ainda é necessário para registros antigos que já têm o prefixo no DB. Manter por ora com comentário:

```typescript
// strip prefixo legado "(2º CARRO)" que versões anteriores do consolidador adicionavam
const nome2 = c2?.motorista?.replace(/^\(2[oº°]\s*CARRO\)\s*/i, '') ?? ''
```

- [ ] **Step 3: Commitar**

```bash
git add src/lib/kpi/consolidador.ts
git commit -m "fix: remover prefixo '(2º CARRO)' do campo motorista no DB"
```

---

## Task 4: Adicionar mapeamento de lojas Zona Sul desconhecidas

**Contexto:** Os códigos `EXTRA`, `53`, `56`, `58` aparecem no MATRIZ do Zona Sul mas não têm nomes. Loja 47 também não tem bairro.

**Files:**
- Modify: `src/lib/kpi/zona-sul-base.ts`

- [ ] **Step 1: Verificar o que é "EXTRA" no contexto Zona Sul**

```bash
node -e "
const ExcelJS = require('./node_modules/exceljs');
function cellVal(c) {
  const v = c.value; if (!v) return null;
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map(r=>r.text).join('');
    if ('text' in v) return v.text;
    if ('result' in v) return v.result;
  }
  return v;
}
(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('C:/Users/media/Downloads/ESCALAS DIA 15 E RELATORIO (USADAS NO TESTE DAS KPIS GERADAS/ESCALA ZONA SUL - MAIO (4).xlsx');
  const ws = wb.getWorksheet('ENDEREÇO - FILIAIS');
  ws.eachRow((row, rn) => {
    const c2 = cellVal(row.getCell(2));
    const c5 = cellVal(row.getCell(5));
    if (String(c2||'').toUpperCase().includes('EXTRA') || String(c5||'').toUpperCase().includes('EXTRA') ||
        String(c2||'').includes('53') || String(c2||'').includes('56') || String(c2||'').includes('58') ||
        String(c5||'').includes('53') || String(c5||'').includes('56') || String(c5||'').includes('58')) {
      console.log(rn+':', c2, '|', c5);
    }
  });
})();
"
```

- [ ] **Step 2: Com base no resultado, adicionar entradas em FILIAIS_ZONA_SUL**

Em `src/lib/kpi/zona-sul-base.ts`, após a linha `{ numero: 48, ... }`, adicionar entradas para os códigos encontrados. Exemplo:

```typescript
// adicionar após { numero: 48, nome: 'Zona Sul Loja 48 - Recreio' }:
{ numero: 53, nome: 'Zona Sul Loja 53' },  // atualizar com bairro real
{ numero: 56, nome: 'Zona Sul Loja 56' },
{ numero: 58, nome: 'Zona Sul Loja 58' },
{ numero: 'EXTRA', nome: 'Zona Sul - EXTRA' }, // atualizar com nome real
```

- [ ] **Step 3: Commitar**

```bash
git add src/lib/kpi/zona-sul-base.ts
git commit -m "fix: adicionar códigos Zona Sul 53/56/58/EXTRA ao mapeamento de filiais"
```

---

## Task 5: Melhorar qualidade visual do XLSX — bordas e célula vazia

**Contexto:** Atualmente lojas sem GPS ficam com células completamente vazias — difícil distinguir de "sem dado" vs "dado ainda não chegou". Adicionar bordas delimitando todas as linhas e símbolo "—" para tempos/horários ausentes.

**Files:**
- Modify: `src/lib/kpi/gerador-kpi.ts` função `escreverLinha`

- [ ] **Step 1: Adicionar borda bottom a cada linha de dados**

Em `escreverLinha`, no bloco `r.eachCell({ includeEmpty: true }, ...)`, adicionar border:

```typescript
r.eachCell({ includeEmpty: true }, (cell, colNum) => {
  if (colNum > nCols) return
  cell.font = FONT_BODY
  cell.alignment = { horizontal: colNum === 1 ? 'left' : 'center', vertical: 'middle' }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
  // NOVO: borda bottom em todas as linhas
  cell.border = {
    bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
  }
})
```

- [ ] **Step 2: Testar gerando um KPI e abrindo no Excel**

```bash
# rodar o servidor de dev
npm run dev
# navegar para http://localhost:3000/painel/kpi/simples e gerar um KPI de teste
# verificar se as bordas aparecem corretamente
```

- [ ] **Step 3: Commitar**

```bash
git add src/lib/kpi/gerador-kpi.ts
git commit -m "feat: adicionar bordas às linhas de dados do KPI XLSX"
```

---

## Task 6: Adicionar linha de totais/resumo ao final do KPI

**Contexto:** O usuário precisa saber rapidamente quantas lojas têm GPS, quantas têm TEMPO preenchido, etc. Adicionar linha de rodapé com totais.

**Files:**
- Modify: `src/lib/kpi/gerador-kpi.ts` função `preencherAba`

- [ ] **Step 1: Adicionar linha de totais após o último loja**

No final da função `preencherAba`, após o loop `for (const loja of ordemLojas)`:

```typescript
// Linha de totais
const totalRow = ws.getRow(rowIdx)
totalRow.height = 23.25

const totalLojas = ordemLojas.length
const comGps = agrupadas.filter(a => a.carro1?.saida_cd || a.carro1?.chd_loja_1).length
const comTempo = agrupadas.filter(a => {
  const t1 = a.carro1?.tempo_loja_1_min
  const t2 = a.carro2?.tempo_loja_1_min
  return (t1 !== null && t1 > 0) || (t2 !== null && t2 > 0)
}).length

if (duplo) {
  totalRow.values = [
    `TOTAL: ${totalLojas} lojas | GPS: ${comGps} | TEMPO: ${comTempo}`,
    '', '', '', '', '', '',
    '', '', '', '', '', '',
    '', '',
  ]
} else {
  totalRow.values = [
    `TOTAL: ${totalLojas} lojas | GPS: ${comGps} | TEMPO: ${comTempo}`,
    '', '', '', '', '', '', '',
  ]
}

// Mesclar coluna A até última coluna para o texto de total
ws.mergeCells(rowIdx, 1, rowIdx, nCols)
const totalCell = ws.getCell(rowIdx, 1)
totalCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1F3864' } }
totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } }
totalCell.alignment = { horizontal: 'center', vertical: 'middle' }
```

- [ ] **Step 2: Verificar no Excel que a linha aparece corretamente**

- [ ] **Step 3: Commitar**

```bash
git add src/lib/kpi/gerador-kpi.ts
git commit -m "feat: adicionar linha de totais ao rodapé do KPI XLSX"
```

---

## Task 7: Adicionar data e rede ao cabeçalho do KPI (row 1)

**Contexto:** O KPI atualmente tem o logo na row 1 mas não exibe a data nem o nome da rede explicitamente. Adicionar esses dados no header para o arquivo ser auto-identificável.

**Files:**
- Modify: `src/lib/kpi/gerador-kpi.ts` função `preencherAba`

- [ ] **Step 1: Adicionar texto de data e rede após o logo**

Após o bloco de logo em `preencherAba`, adicionar célula com data:

```typescript
// Importar no topo do arquivo se ainda não houver:
import { formataDataPtBr } from './kpi-styles'

// Após o logo (ainda em preencherAba):
// Célula no canto direito da row 1 com data
const dataCell = ws.getCell(1, nCols) // última coluna, row 1
dataCell.value = formataDataPtBr(data)
dataCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } }
dataCell.alignment = { horizontal: 'right', vertical: 'middle' }
dataCell.fill = FILL_NAVY
```

- [ ] **Step 2: Verificar que a data aparece legível sem cobrir o logo**

- [ ] **Step 3: Commitar**

```bash
git add src/lib/kpi/gerador-kpi.ts
git commit -m "feat: exibir data no cabeçalho do KPI XLSX"
```

---

## Task 8: Ferramenta de reconciliação escala↔KPI

**Contexto:** Para o QA manual ser mais rápido, criar um script Node.js que lê as escalas + KPIs de uma pasta e produz um relatório de diferenças: lojas que estão na escala mas não no KPI (com dado), e vice-versa.

**Files:**
- Create: `scripts/reconciliar-kpi.mjs`

- [ ] **Step 1: Criar o script**

```javascript
// scripts/reconciliar-kpi.mjs
// Uso: node scripts/reconciliar-kpi.mjs <pasta-escalas> <pasta-kpis> <data YYYY-MM-DD>
// Exemplo: node scripts/reconciliar-kpi.mjs "C:/Users/media/Downloads/ESCALAS DIA 15..." "C:/Users/media/Downloads/KPIS GERADAS" 2026-05-15

import ExcelJS from './node_modules/exceljs/dist/es5/exceljs.nodejs.js'
import { readdir, readFile } from 'fs/promises'
import path from 'path'

const [, , pastaEscalas, pastaKpis, dataAlvo] = process.argv
if (!pastaEscalas || !pastaKpis || !dataAlvo) {
  console.error('Uso: node scripts/reconciliar-kpi.mjs <pasta-escalas> <pasta-kpis> <YYYY-MM-DD>')
  process.exit(1)
}

function cellVal(cell) {
  const v = cell.value
  if (!v) return null
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map(r => r.text).join('')
    if ('text' in v) return v.text
    if ('result' in v) return v.result
  }
  return v
}

function normText(s) {
  return String(s).normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().trim()
}

function detectRedeFromNome(nome) {
  const n = normText(nome)
  if (n.includes('ASSAI') || n.includes('ASSAÍ')) return 'ASSAI'
  if (n.includes('ATACADAO') || n.includes('ATACADAO')) return 'ATACADAO'
  if (n.includes('CARREFOUR')) return 'CARREFOUR'
  if (n.includes('PREZUNIC')) return 'PREZUNIC'
  if (n.includes('PRINCESA')) return 'PRINCESA'
  if (n.includes('GUANABARA')) return 'GUANABARA'
  if (n.includes('SAM') && n.includes('CLUB')) return 'SAMS_CLUB'
  if (n.includes('VIANENSE')) return 'VIANENSE'
  if (n.includes('CAB') && n.includes('PETROPOLIS')) return 'CAB_PETROPOLIS'
  if (n.includes('SENDAS')) return 'SENDAS'
  if (n.includes('FEIRA NOVA')) return 'FEIRA_NOVA'
  if (n.includes('EMANUEL')) return 'EMANUEL'
  if (n.includes('ARMAZEM') && n.includes('GRAO')) return 'ARMAZEM_GRAO'
  if (n.includes('SUPER PAX') || n.includes('SUPERPAX')) return 'SUPER_PAX'
  if (n.includes('SUPERPRIX') || n.includes('SUPER PRIX')) return 'SUPERPRIX'
  if (n.includes('MUNDIAL')) return 'MUNDIAL'
  if (n.includes('ZONA SUL') || n.includes('ZONA_SUL')) return 'ZONA_SUL'
  return null
}

// Lê um KPI XLSX e retorna Map<loja_nome, { temDado: boolean }>
async function lerKpi(filepath) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filepath)
  const ws = wb.getWorksheet(wb.worksheets[0].name)
  const lojas = new Map()
  ws.eachRow((row, rn) => {
    if (rn <= 4) return
    const v1 = cellVal(row.getCell(1))
    if (!v1 || !String(v1).trim()) return
    // Tem dado se motorista (col2) ou placa (col4) preenchidos
    const motor = cellVal(row.getCell(2))
    const placa = cellVal(row.getCell(4))
    const temDado = !!(motor || placa)
    const nome = String(v1).trim()
    lojas.set(nome, { temDado })
  })
  return lojas
}

// Lê escala geral (abas numéricas) para data-alvo
async function lerEscalaGeral(filepath, dataAlvo) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filepath)
  const diaAba = String(parseInt(dataAlvo.split('-')[2])).padStart(0)
  // tenta aba exata
  let ws = null
  wb.eachSheet(s => {
    if (s.name.trim() === String(parseInt(dataAlvo.split('-')[2]))) ws = s
    if (s.name.trim() === dataAlvo.split('-')[2]) ws = s
  })
  if (!ws) return []

  const linhas = []
  let rede = null
  let modoBenassi = false, modoForaEscala = false

  ws.eachRow((row, rn) => {
    if (rn <= 4) return
    const v1 = String(cellVal(row.getCell(1)) || '').trim()
    const v4 = cellVal(row.getCell(4))
    const v4s = v4 !== null && v4 !== undefined ? String(v4).trim() : null
    if (!v1) return
    const isMerged = v4s !== null && v4s === v1
    const isSep = isMerged || v4 === null || v4 === undefined || v4s === '' || v4s === null
    if (isSep) {
      const n = normText(v1)
      if (n.startsWith('TOTAL') || (n.includes('REDES') && n.includes('FILIAI'))) return
      if (n.includes('BENASSI')) { modoBenassi = true; modoForaEscala = false; rede = 'SENDAS'; return }
      if (n.includes('FORA ESCALA')) { modoForaEscala = true; modoBenassi = false; return }
      const r = detectRedeFromNome(v1); if (r) { rede = r; modoBenassi = false; modoForaEscala = false }
      return
    }
    const redeFromNome = detectRedeFromNome(v1)
    const effectiveRede = redeFromNome || rede || 'DESCONHECIDO'
    linhas.push({ loja: v1, rede: effectiveRede })
  })
  return linhas
}

async function main() {
  const arquivosEscala = (await readdir(pastaEscalas)).filter(f => f.endsWith('.xlsx'))
  const arquivosKpi = (await readdir(pastaKpis)).filter(f =>
    f.includes(dataAlvo) && f.endsWith('.xlsx') && !f.includes('(1)') && !f.includes('(2)')
  )

  // Lê todas as escalas
  const escalaLinhas = []
  for (const f of arquivosEscala) {
    const fp = path.join(pastaEscalas, f)
    try {
      const linhas = await lerEscalaGeral(fp, dataAlvo)
      escalaLinhas.push(...linhas)
    } catch {}
  }

  // Agrupa escala por rede
  const escalaByRede = new Map()
  for (const { loja, rede } of escalaLinhas) {
    if (!escalaByRede.has(rede)) escalaByRede.set(rede, new Set())
    escalaByRede.get(rede).add(loja)
  }

  // Lê todos os KPIs
  const kpiByRede = new Map()
  for (const f of arquivosKpi) {
    const redeMatch = f.match(/KPI-([A-Z_]+)-/)
    if (!redeMatch) continue
    const rede = redeMatch[1]
    const fp = path.join(pastaKpis, f)
    const lojas = await lerKpi(fp)
    kpiByRede.set(rede, lojas)
  }

  // Relatório
  console.log(`\n=== RECONCILIAÇÃO KPI vs ESCALA — ${dataAlvo} ===\n`)

  const todasRedes = new Set([...escalaByRede.keys(), ...kpiByRede.keys()])
  for (const rede of [...todasRedes].sort()) {
    const escLojas = escalaByRede.get(rede) ?? new Set()
    const kpiLojas = kpiByRede.get(rede) ?? new Map()
    const kpiComDado = [...kpiLojas.entries()].filter(([, v]) => v.temDado).map(([k]) => k)

    console.log(`\n--- ${rede} ---`)
    console.log(`  Escala: ${escLojas.size} lojas únicas`)
    console.log(`  KPI total: ${kpiLojas.size} lojas | Com dado GPS/motor: ${kpiComDado.length}`)

    // Lojas na escala mas sem dado no KPI
    const faltandoNoKpi = [...escLojas].filter(l => {
      const kpiEntry = kpiLojas.get(l)
      return !kpiEntry || !kpiEntry.temDado
    })
    if (faltandoNoKpi.length > 0) {
      console.log(`  ⚠️  NA ESCALA MAS SEM DADO NO KPI (${faltandoNoKpi.length}):`)
      faltandoNoKpi.forEach(l => console.log(`       - ${l}`))
    }
  }
  console.log('\n=== FIM ===\n')
}

main().catch(console.error)
```

- [ ] **Step 2: Testar o script**

```bash
node scripts/reconciliar-kpi.mjs \
  "C:/Users/media/Downloads/ESCALAS DIA 15 E RELATORIO (USADAS NO TESTE DAS KPIS GERADAS)" \
  "C:/Users/media/Downloads/KPIS GERADAS" \
  2026-05-15
```

Esperado: relatório listando discrepâncias por rede.

- [ ] **Step 3: Commitar**

```bash
git add scripts/reconciliar-kpi.mjs
git commit -m "feat: script de reconciliação escala vs KPI gerado"
```

---

## Task 9: Melhorar ordenação de lojas no KPI (seguir ordem da escala)

**Contexto:** Atualmente a maioria das redes ordena lojas alfabeticamente. O usuário prefere a mesma ordem que aparece na escala física. A escala geral apresenta as lojas numa ordem específica (por região, importância, etc.).

**Files:**
- Modify: `src/lib/lojas/catalogo-matriz.ts`
- Possivelmente modify: `src/lib/kpi/gerador-kpi.ts`

- [ ] **Step 1: Extrair a ordem de lojas de cada rede a partir da escala geral do dia 15**

```bash
node -e "
const ExcelJS = require('./node_modules/exceljs');
function cellVal(c) {
  const v = c.value; if (!v) return null;
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map(r=>r.text).join('');
    if ('text' in v) return v.text; if ('result' in v) return v.result;
  }
  return v;
}
(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('C:/Users/media/Downloads/ESCALAS DIA 15 E RELATORIO (USADAS NO TESTE DAS KPIS GERADAS/ESCALA GERAL DE MAIO 1 (2).xlsx');
  const ws = wb.getWorksheet('15');
  const byRede = {};
  let rede = null;
  ws.eachRow((row, rn) => {
    if (rn <= 4) return;
    const v1 = String(cellVal(row.getCell(1))||'').trim();
    const v4 = cellVal(row.getCell(4));
    const v4s = v4 != null ? String(v4).trim() : null;
    if (!v1) return;
    const isSep = (v4s === v1) || v4 == null || v4s === '' || v4s === null;
    if (isSep) {
      const n = v1.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
      if (n.includes('ASSAI')) rede = 'ASSAI';
      else if (n.includes('CARREFOUR')) rede = 'CARREFOUR';
      else if (n.includes('PREZUNIC')) rede = 'PREZUNIC';
      return;
    }
    if (rede) {
      if (!byRede[rede]) byRede[rede] = [];
      byRede[rede].push(v1);
    }
  });
  for (const [r, lojas] of Object.entries(byRede)) {
    console.log(r + ':');
    lojas.forEach(l => console.log('  \"' + l + '\",'));
  }
})();
"
```

- [ ] **Step 2: Adicionar as ordens ao MATRIZ_LOJAS em `catalogo-matriz.ts`**

Para cada rede onde a ordem importa, adicionar ao `MATRIZ_LOJAS`:

```typescript
export const MATRIZ_LOJAS: Record<string, string[]> = {
  PRINCESA: [ /* já existe */ ],
  
  // Adicionar redes com ordem canônica da escala:
  ASSAI: [
    'Assaí - Alcântara I - Loja 35',
    'Assaí - Alcântara II - Loja 293',
    // ... (preencher com saída do step 1)
  ],
  PREZUNIC: [
    // ... (preencher com saída do step 1)
  ],
  // etc.
}
```

- [ ] **Step 3: Commitar**

```bash
git add src/lib/lojas/catalogo-matriz.ts
git commit -m "feat: adicionar ordem canônica de lojas para ASSAI, PREZUNIC etc."
```

---

## Task 10: Push final e regeneração dos KPIs afetados

- [ ] **Step 1: Verificar que todos os commits estão pushed**

```bash
git log --oneline -10
git push
```

- [ ] **Step 2: Instruções para o usuário regenerar os KPIs afetados**

Os KPIs que precisam ser regerados após as correções:
- **KPI-ZONA_SUL**: agora lojas 41-48 aparecem com nomes corretos (não mais números brutos)
- **KPI-DESCONHECIDO / KPI-MUNDIAL**: MUNDIAL agora vai para KPI-MUNDIAL
- **KPI-SENDAS**: verificar após Task 2 se lojas BENASSI entram
- **KPI-EMANUEL**: verificar após Task 1 se todas as lojas PAX entram

Para regenerar: no painel, na aba do dia 15/05, clicar em "Regerar KPI" para cada rede afetada.

- [ ] **Step 3: Executar script de reconciliação pós-correção**

```bash
node scripts/reconciliar-kpi.mjs \
  "C:/Users/media/Downloads/ESCALAS DIA 15 E RELATORIO (USADAS NO TESTE DAS KPIS GERADAS" \
  "C:/Users/media/Downloads/KPIS GERADAS" \
  2026-05-15
```

Verificar que as discrepâncias diminuíram.

---

## Self-Review

### Spec coverage
- ✅ Bugs já corrigidos documentados (Tasks 1-3)
- ✅ Melhorias visuais (Tasks 5-7)
- ✅ Ferramenta de QA/reconciliação (Task 8)
- ✅ Ordem canônica de lojas (Task 9)
- ✅ Push final e instruções de regeneração (Task 10)

### Pendências que podem surgir durante execução
- **Task 1 (EMANUEL)**: pode ser que o parser PAX já retorne corretamente e o problema seja na route de geração de KPI (filtro por rede_id). Investigar antes de modificar código.
- **Task 2 (SENDAS/BENASSI)**: pode ser comportamento intencional (lojas BENASSI têm KPI separado ou são excluídas intencionalmente).
- **Task 9 (ordem)**: para redes sem MATRIZ_LOJAS, o comportamento atual (sort alfabético) pode ser aceitável. Priorizar redes com mais lojas (ASSAI, PREZUNIC).
