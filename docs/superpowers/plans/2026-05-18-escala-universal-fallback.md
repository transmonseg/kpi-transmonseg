# Universal Escala Fallback Parser — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um parser heurístico universal como último fallback no fluxo AUTO de detecção de escalas, extraindo dados de qualquer XLSX/PDF desconhecido e sinalizando via campo `aviso` na response.

**Architecture:** Novo arquivo `escala-universal.ts` implementa heurística de cabeçalhos + padrão de placa. A route `/api/escalas/upload` o chama como penúltima tentativa no bloco AUTO, adicionando `aviso` na response quando acionado. A route de preview recebe o mesmo tratamento. `DiaPage.tsx` exibe banner amarelo quando `aviso` está presente.

**Tech Stack:** ExcelJS (já instalado), pdf-parse (já instalado), `normalizaPlaca` / `placaValida` de `@/lib/utils/placa`, tipo `LinhaEscala` de `@/lib/types/escala`.

---

## File Map

| Ação | Arquivo | Responsabilidade |
|------|---------|-----------------|
| **CREATE** | `src/lib/parsers/escala-universal.ts` | Heurística XLSX + PDF → LinhaEscala[] |
| **MODIFY** | `src/app/api/escalas/upload/route.ts` | Adicionar UNIVERSAL no fluxo AUTO + campo `aviso` |
| **MODIFY** | `src/app/api/escalas/preview/route.ts` | Mesma adição de UNIVERSAL + `aviso` |
| **MODIFY** | `src/app/painel/kpi/dia/DiaPage.tsx` | Estado `avisoUpload`, banner amarelo |

---

## Task 1: Criar `escala-universal.ts` — heurística XLSX

**Files:**
- Create: `src/lib/parsers/escala-universal.ts`

- [ ] **Step 1: Criar o arquivo com a função principal e heurística XLSX**

```typescript
import ExcelJS from 'exceljs'
import { normalizaPlaca, placaValida } from '@/lib/utils/placa'
import type { LinhaEscala } from '@/lib/types/escala'

// Mapeamento de palavras-chave de cabeçalho para campo semântico interno
type FieldKey = 'placa' | 'motorista' | 'loja' | 'codigo' | 'carro'

const HEADER_KEYWORDS: Array<{ keys: string[]; field: FieldKey }> = [
  { keys: ['PLACA', 'VEÍCULO', 'VEICULO', 'CAMINHÃO', 'CAMINHAO', 'TRUCK'], field: 'placa' },
  { keys: ['MOTORISTA', 'DRIVER', 'NOME', 'COLABORADOR', 'CHOFER'], field: 'motorista' },
  { keys: ['LOJA', 'ROTA', 'CLIENTE', 'DESTINO', 'LOCAL', 'ESTABELECIMENTO'], field: 'loja' },
  { keys: ['CÓDIGO', 'CODIGO', 'COD', 'CD', 'MATRÍCULA', 'MATRICULA'], field: 'codigo' },
  { keys: ['CARRO', 'TIPO CARRO', 'TIPO', 'FROTA', 'VEIC'], field: 'carro' },
]

const PLACA_RE = /[A-Z]{3}[\s\-]?\d[A-Z0-9]\d{2}/i
const DATE_CELL_RE = /(\d{2})\/(\d{2})\/(\d{4})/

// Detecta linha de cabeçalho nas primeiras 5 linhas de uma aba
function detectarCabecalho(
  sheet: ExcelJS.Worksheet,
): { rowIdx: number; colMap: Map<FieldKey, number> } | null {
  for (let r = 1; r <= 5; r++) {
    const row = sheet.getRow(r)
    const colMap = new Map<FieldKey, number>()
    row.eachCell((cell, col) => {
      const txt = String(cell.value ?? '').toUpperCase().trim()
      for (const { keys, field } of HEADER_KEYWORDS) {
        if (keys.some((k) => txt.includes(k))) {
          if (!colMap.has(field)) colMap.set(field, col)
          break
        }
      }
    })
    if (colMap.size >= 2) return { rowIdx: r, colMap }
  }
  return null
}

// Extrai data da aba: parâmetro > célula com DD/MM/YYYY > objeto Date do ExcelJS > undefined
function extrairData(sheet: ExcelJS.Worksheet, dataAlvo?: string): string | undefined {
  if (dataAlvo) return dataAlvo
  for (let r = 1; r <= 3; r++) {
    const row = sheet.getRow(r)
    for (let c = 1; c <= 20; c++) {
      const cell = row.getCell(c)
      if (cell.value instanceof Date) {
        const d = cell.value
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      }
      const m = DATE_CELL_RE.exec(String(cell.value ?? ''))
      if (m) return `${m[3]}-${m[2]}-${m[1]}`
    }
  }
  return undefined
}

// Fallback posicional: quando sem cabeçalho, tenta achar coluna de placa por padrão regex
function detectarColunaPorPadrao(sheet: ExcelJS.Worksheet): Map<FieldKey, number> {
  const placaMatches = new Map<number, number>() // colIdx → contagem de matches de placa
  const maxRow = Math.min(sheet.rowCount, 20)
  for (let r = 1; r <= maxRow; r++) {
    const row = sheet.getRow(r)
    row.eachCell((cell, col) => {
      if (PLACA_RE.test(String(cell.value ?? ''))) {
        placaMatches.set(col, (placaMatches.get(col) ?? 0) + 1)
      }
    })
  }
  const colMap = new Map<FieldKey, number>()
  if (placaMatches.size > 0) {
    const melhorCol = [...placaMatches.entries()].sort((a, b) => b[1] - a[1])[0][0]
    colMap.set('placa', melhorCol)
    // Coluna anterior ao placa provavelmente é loja/motorista
    if (melhorCol > 1) colMap.set('loja', melhorCol - 1)
    if (melhorCol > 2) colMap.set('motorista', melhorCol - 2)
  }
  return colMap
}

function parsearAbaXlsx(
  sheet: ExcelJS.Worksheet,
  dataAlvo?: string,
): LinhaEscala[] {
  const data = extrairData(sheet, dataAlvo)
  if (!data) return []

  const cabecalho = detectarCabecalho(sheet)
  const colMap = cabecalho?.colMap ?? detectarColunaPorPadrao(sheet)

  if (colMap.size === 0) return []

  const startRow = cabecalho ? cabecalho.rowIdx + 1 : 1
  const linhas: LinhaEscala[] = []
  let rowNum = 0

  sheet.eachRow((row, rIdx) => {
    if (rIdx < startRow) return
    rowNum++

    const get = (f: FieldKey) => {
      const col = colMap.get(f)
      return col ? String(row.getCell(col).value ?? '').trim() : ''
    }

    const placaRaw = get('placa')
    if (!placaRaw && !get('loja') && !get('motorista')) return // linha vazia

    const placaNorm = placaValida(placaRaw) ? normalizaPlaca(placaRaw) : ''

    linhas.push({
      data,
      data_entrega: data,
      rede_id: 'DESCONHECIDO',
      loja_nome_raw: get('loja') || null,
      loja_codigo_raw: get('codigo') || null,
      placa_norm: placaNorm,
      placa_raw: placaRaw || null,
      motorista_nome: get('motorista') || null,
      motorista_codigo: null,
      tipo_carro: get('carro') || null,
      carro_ordem: 1,
      turno: 'MANHA',
      tipo_emissao: 'NORMAL',
      obs: null,
      restricao: null,
      peso_kg: null,
      paletes: null,
      raw_row_num: rIdx,
    })
  })

  return linhas
}

async function parseXlsxUniversal(
  buffer: ArrayBuffer | Buffer,
  dataAlvo?: string,
): Promise<LinhaEscala[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer)

  const todas: LinhaEscala[] = []
  wb.eachSheet((sheet) => {
    todas.push(...parsearAbaXlsx(sheet, dataAlvo))
  })
  return todas
}
```

- [ ] **Step 2: Adicionar heurística PDF ao mesmo arquivo**

Adicionar após a função `parseXlsxUniversal`:

```typescript
async function parsePdfUniversal(
  buffer: Buffer,
  dataAlvo?: string,
): Promise<LinhaEscala[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse')
  const { text }: { text: string } = await pdfParse(buffer)

  const linhas: LinhaEscala[] = []
  const rows = text.split('\n').map((l) => l.trim()).filter(Boolean)

  // Data do documento — extrai do texto ou usa dataAlvo
  let dataDoc = dataAlvo
  if (!dataDoc) {
    const mData = DATE_CELL_RE.exec(text)
    if (mData) dataDoc = `${mData[3]}-${mData[2]}-${mData[1]}`
  }
  if (!dataDoc) return []

  // Varre linhas procurando padrão de placa
  for (let i = 0; i < rows.length; i++) {
    const placaMatch = PLACA_RE.exec(rows[i])
    if (!placaMatch) continue

    const placaRaw = placaMatch[0]
    const placaNorm = normalizaPlaca(placaRaw)

    // Linha anterior provavelmente tem nome (loja ou motorista)
    const anterior = i > 0 ? rows[i - 1] : ''
    // Linha posterior pode ter loja
    const posterior = i < rows.length - 1 ? rows[i + 1] : ''

    const motorista = /^[A-ZÁÉÍÓÚÃÕÇ\s]{4,}$/.test(anterior) ? anterior : null
    const loja = motorista ? posterior : anterior

    linhas.push({
      data: dataDoc,
      data_entrega: dataDoc,
      rede_id: 'DESCONHECIDO',
      loja_nome_raw: loja || null,
      loja_codigo_raw: null,
      placa_norm: placaNorm,
      placa_raw: placaRaw,
      motorista_nome: motorista,
      motorista_codigo: null,
      tipo_carro: null,
      carro_ordem: 1,
      turno: 'MANHA',
      tipo_emissao: 'NORMAL',
      obs: null,
      restricao: null,
      peso_kg: null,
      paletes: null,
      raw_row_num: i + 1,
    })
  }

  return linhas
}
```

- [ ] **Step 3: Adicionar a função exportada principal**

Adicionar ao final do arquivo:

```typescript
export async function parseEscalaUniversal(
  buffer: ArrayBuffer | Buffer,
  dataAlvo?: string,
  formato?: 'xlsx' | 'pdf',
): Promise<LinhaEscala[]> {
  const fmt = formato ?? 'xlsx'
  if (fmt === 'pdf') {
    const buf = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer
    return parsePdfUniversal(buf, dataAlvo)
  }
  return parseXlsxUniversal(buffer, dataAlvo)
}
```

- [ ] **Step 4: Verificar compilação TypeScript**

```powershell
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 5: Testar o parser XLSX com o arquivo Armazém (já testado anteriormente como controle)**

```powershell
cd C:\Users\media\dev\kpi-transmonseg

$s = @'
import { parseEscalaUniversal } from "./src/lib/parsers/escala-universal.js"
import { readFile } from "node:fs/promises"
const buf = await readFile("C:/Users/media/Downloads/ESCALA DO ARMAZÉM DO GRÃO MAIO (4).xlsx")
const linhas = await parseEscalaUniversal(buf, "2026-05-14", "xlsx")
console.log("Total:", linhas.length)
console.log("Sample:", JSON.stringify(linhas[0]))
'@
$s | Set-Content test_univ.mts -Encoding UTF8
npx tsx test_univ.mts
Remove-Item test_univ.mts
```

Esperado: pelo menos 5 linhas extraídas com `placa_norm` e `rede_id: 'DESCONHECIDO'`.

---

## Task 2: Atualizar `upload/route.ts` — adicionar UNIVERSAL + campo `aviso`

**Files:**
- Modify: `src/app/api/escalas/upload/route.ts`

- [ ] **Step 1: Adicionar import do parser universal**

No topo do arquivo, após os outros imports de parser:

```typescript
import { parseEscalaUniversal } from '@/lib/parsers/escala-universal'
```

- [ ] **Step 2: Adicionar `DESCONHECIDO` ao tipo e lista**

```typescript
// antes
type TipoEscala = 'GERAL' | 'ZONA_SUL' | 'PAX' | 'ARMAZEM_GRAO' | 'GUANABARA' | 'AUTO'
const TIPOS_VALIDOS: TipoEscala[] = ['GERAL', 'ZONA_SUL', 'PAX', 'ARMAZEM_GRAO', 'GUANABARA', 'AUTO']

// depois
type TipoEscala = 'GERAL' | 'ZONA_SUL' | 'PAX' | 'ARMAZEM_GRAO' | 'GUANABARA' | 'AUTO' | 'DESCONHECIDO'
const TIPOS_VALIDOS: TipoEscala[] = ['GERAL', 'ZONA_SUL', 'PAX', 'ARMAZEM_GRAO', 'GUANABARA', 'AUTO']
// DESCONHECIDO não entra em TIPOS_VALIDOS (é só output, nunca input do usuário)
```

- [ ] **Step 3: Adicionar variável `aviso` e fallback UNIVERSAL no bloco AUTO**

Localizar o bloco `if (tipo === 'AUTO')`. Substituir:

```typescript
// antes — ao final do bloco AUTO:
if (linhas.length === 0)
  return new NextResponse(
    'Não foi possível detectar o tipo da escala. Verifique se o arquivo é uma das escalas suportadas (GERAL, ZONA SUL, PAX, ARMAZÉM DO GRÃO, GUANABARA).',
    { status: 400 },
  )
```

Por:

```typescript
// depois:
let aviso: string | undefined

if (linhas.length === 0) {
  // Último recurso: parser heurístico universal
  try {
    const resultado = await parseEscalaUniversal(arrayBuffer, data, formato)
    if (resultado.length > 0) {
      linhas = resultado
      tipoDetectado = 'DESCONHECIDO'
      aviso =
        'Formato não reconhecido. Dados extraídos por heurística — verifique se as informações estão corretas antes de processar o KPI.'
    }
  } catch {
    // fallback também falhou — deixa 0 linhas passar para o check abaixo
  }
}

if (linhas.length === 0)
  return new NextResponse(
    'Não foi possível detectar o tipo da escala. Verifique se o arquivo é uma das escalas suportadas (GERAL, ZONA SUL, PAX, ARMAZÉM DO GRÃO, GUANABARA).',
    { status: 400 },
  )
```

A variável `aviso` precisa ser declarada antes do bloco `try` de parsing:

```typescript
// logo antes do `try {` que abre o bloco de parsing, linha ~96:
let aviso: string | undefined
```

- [ ] **Step 4: Incluir `aviso` na response final**

```typescript
// antes:
return NextResponse.json({
  upload_id: upload.id,
  qtd_linhas: linhas.length,
  qtd_orfas: qtdOrfas,
  substituiu: !!existente,
  tipo_detectado: tipoDetectado,
})

// depois:
return NextResponse.json({
  upload_id: upload.id,
  qtd_linhas: linhas.length,
  qtd_orfas: qtdOrfas,
  substituiu: !!existente,
  tipo_detectado: tipoDetectado,
  ...(aviso ? { aviso } : {}),
})
```

- [ ] **Step 5: Verificar TypeScript**

```powershell
npx tsc --noEmit
```

Esperado: sem erros.

---

## Task 3: Atualizar `preview/route.ts` — mesma lógica de fallback

**Files:**
- Modify: `src/app/api/escalas/preview/route.ts`

- [ ] **Step 1: Ler o arquivo para entender sua estrutura atual**

O preview route tem estrutura similar ao upload. Após ler, localizar o bloco AUTO e o ponto onde retorna 0 linhas.

- [ ] **Step 2: Adicionar import + fallback UNIVERSAL**

Idêntico ao Task 2: adicionar import, adicionar fallback antes do `return` de 0 linhas no AUTO, adicionar `aviso` na response JSON.

A response do preview já retorna `tipo_detectado` — adicionar `aviso?: string` junto.

- [ ] **Step 3: Verificar TypeScript**

```powershell
npx tsc --noEmit
```

---

## Task 4: Atualizar `DiaPage.tsx` — banner amarelo de aviso

**Files:**
- Modify: `src/app/painel/kpi/dia/DiaPage.tsx`

- [ ] **Step 1: Adicionar estado `avisoUpload`**

No bloco de useState existente (após linha ~133), adicionar:

```typescript
const [avisoUpload, setAvisoUpload] = useState<string | null>(null)
```

- [ ] **Step 2: Capturar `aviso` da response do upload**

Na função `processarUpload`, após `if (!parseRes.ok) throw new Error(...)` (linha ~231):

```typescript
if (!parseRes.ok) throw new Error(await parseRes.text())

const parseJson = await parseRes.json() as { aviso?: string }
if (parseJson.aviso) setAvisoUpload(parseJson.aviso)
else setAvisoUpload(null)
```

E no início de `processarUpload` (linha ~177), limpar o aviso anterior:

```typescript
setPreviewData(null)
setAvisoUpload(null)   // ← adicionar esta linha
```

- [ ] **Step 3: Renderizar banner amarelo**

Localizar onde `previewData` é exibido (linha ~408). Logo após o bloco de preview, adicionar o banner:

```tsx
{avisoUpload && (
  <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
    <span className="mt-0.5 shrink-0">⚠</span>
    <span>{avisoUpload}</span>
  </div>
)}
```

- [ ] **Step 4: Verificar TypeScript**

```powershell
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 5: Commit final**

```powershell
git add src/lib/parsers/escala-universal.ts
git add src/app/api/escalas/upload/route.ts
git add src/app/api/escalas/preview/route.ts
git add src/app/painel/kpi/dia/DiaPage.tsx
git add docs/superpowers/specs/2026-05-18-escala-universal-fallback-design.md
git add docs/superpowers/plans/2026-05-18-escala-universal-fallback.md
git commit -m "feat: parser heurístico universal como fallback de detecção de escalas desconhecidas"
```

---

## Self-Review

**Spec coverage:**
- [x] Mantém parsers existentes — fluxo AUTO inalterado até UNIVERSAL
- [x] Fallback heurístico XLSX — Task 1
- [x] Fallback heurístico PDF — Task 1
- [x] `rede_id: 'DESCONHECIDO'` — implementado
- [x] Campo `aviso` na response upload — Task 2
- [x] Campo `aviso` na response preview — Task 3
- [x] Banner amarelo na UI — Task 4
- [x] 400 se UNIVERSAL também retornar 0 — mantido

**Inconsistências verificadas:**
- `parseEscalaUniversal` exportada com assinatura `(buffer, dataAlvo?, formato?)` — usada consistentemente em Task 2
- `TipoEscala: 'DESCONHECIDO'` adicionado ao tipo mas não a `TIPOS_VALIDOS` — correto, é só output
- `aviso` declarado antes do bloco try externo — visível no `return` final
