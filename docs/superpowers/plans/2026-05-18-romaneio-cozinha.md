# Romaneio Cozinha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar um segundo output "romaneio" no processamento da cozinha — placa + motorista + clientes com endereços — cruzando a escala diária com uma matriz de clientes armazenada persistentemente no Supabase Storage.

**Architecture:** Matriz de clientes (572 entradas) é armazenada como JSON em bucket Supabase `cozinha-matriz`. O parser da cozinha ganha extração de clientes por rota. Dois novos geradores produzem romaneio XLSX e PDF. A UI ganha seção de upload/status da matriz e botões de download do romaneio.

**Tech Stack:** Next.js App Router, TypeScript, ExcelJS, pdf-lib, Supabase Storage, Tailwind v4

---

## Arquivos

| Arquivo | Ação |
|---------|------|
| `src/lib/parsers/cozinha-matriz.ts` | Criar — parser do XLSX da matriz de clientes |
| `src/lib/parsers/cozinha-parser.ts` | Modificar — adicionar extração de clientes + matcher de endereços |
| `src/lib/parsers/romaneio-generator.ts` | Criar — geradores XLSX e PDF do romaneio |
| `src/app/api/cozinha/matriz/route.ts` | Criar — GET status + POST upload da matriz |
| `src/app/api/cozinha/route.ts` | Modificar — carregar matriz + gerar romaneio na resposta |
| `src/app/api/cozinha/regenerar/route.ts` | Modificar — propagar campo `clientes` no regen |
| `src/app/painel/cozinha/uploader.tsx` | Modificar — seção de matriz + botões de romaneio |

---

## Task 1: Parser da Matriz de Clientes

**Files:**
- Create: `src/lib/parsers/cozinha-matriz.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
import ExcelJS from 'exceljs'

export type ClienteMatriz = {
  codigo: string
  filial: string
  nome: string
  fantasia: string
  cnpj: string
  cep: string
  endereco: string
  numero: string
  complemento: string
}

function cellStr(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return ''
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if ('text' in v) return String((v as { text: unknown }).text ?? '').trim()
    if ('result' in v) return String((v as { result: unknown }).result ?? '').trim()
    if ('richText' in v)
      return (v as { richText: { text: string }[] }).richText.map(r => r.text).join('').trim()
  }
  return String(v).trim()
}

export async function parseMatrizClientes(
  buffer: ArrayBuffer | Buffer
): Promise<ClienteMatriz[]> {
  const wb = new ExcelJS.Workbook()
  const buf =
    buffer instanceof ArrayBuffer
      ? buffer
      : (buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength
        ) as ArrayBuffer)
  await wb.xlsx.load(buf)

  const ws = wb.worksheets[0]
  if (!ws) return []

  const clientes: ClienteMatriz[] = []

  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return // pula cabeçalho
    const codigo = cellStr(row.getCell(1))
    if (!codigo || isNaN(Number(codigo))) return
    clientes.push({
      codigo,
      filial: cellStr(row.getCell(2)),
      nome: cellStr(row.getCell(3)),
      fantasia: cellStr(row.getCell(4)),
      cnpj: cellStr(row.getCell(5)),
      cep: cellStr(row.getCell(7)),
      endereco: cellStr(row.getCell(8)),
      numero: cellStr(row.getCell(9)),
      complemento: cellStr(row.getCell(10)),
    })
  })

  return clientes
}
```

- [ ] **Step 2: Verificar tipos**

```bash
cd C:\Users\media\dev\kpi-transmonseg && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/parsers/cozinha-matriz.ts
git commit -m "feat(cozinha): parser da matriz de clientes"
```

---

## Task 2: Extração de Clientes por Rota + Matcher de Endereços

**Files:**
- Modify: `src/lib/parsers/cozinha-parser.ts`

- [ ] **Step 1: Adicionar `ClienteRomaneio`, campo `clientes` em `RotaCozinha`, e as funções de normalização e match**

Adicionar logo após as importações no topo do arquivo (após `const SEM_VALOR`):

```typescript
export type ClienteRomaneio = {
  nome: string
  notaFiscal: string
  peso: number | null
  endereco: string | null
  cep: string | null
}
```

Adicionar `clientes` em `RotaCozinha`:

```typescript
export type RotaCozinha = {
  rota: string
  motorista: string
  placa: string
  veiculo: string
  status: StatusRota
  duplicada: boolean
  clientes: ClienteRomaneio[]  // ← adicionar esta linha
}
```

Adicionar import no topo:

```typescript
import type { ClienteMatriz } from './cozinha-matriz'
```

Adicionar as funções internas antes de `parseCozinha`:

```typescript
function normalizaNomeCliente(nome: string): string {
  return nome
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatEnderecoCliente(c: ClienteMatriz): string {
  return [c.endereco, c.numero, c.complemento].filter(Boolean).join(', ')
}

function matchCliente(
  nomeEscala: string,
  matriz: ClienteMatriz[]
): { endereco: string; cep: string } | null {
  const key = normalizaNomeCliente(nomeEscala)
  if (!key || key.length < 2) return null

  // 1. Match exato na fantasia
  for (const c of matriz) {
    if (normalizaNomeCliente(c.fantasia) === key)
      return { endereco: formatEnderecoCliente(c), cep: c.cep }
  }

  // 2. Fantasia contém o nome da escala ou vice-versa
  for (const c of matriz) {
    const fant = normalizaNomeCliente(c.fantasia)
    if (fant.includes(key) || key.includes(fant))
      return { endereco: formatEnderecoCliente(c), cep: c.cep }
  }

  // 3. Todas as palavras do nome (≥3 chars) aparecem na fantasia
  const words = key.split(' ').filter(w => w.length >= 3)
  if (words.length > 0) {
    for (const c of matriz) {
      const fant = normalizaNomeCliente(c.fantasia)
      if (words.every(w => fant.includes(w)))
        return { endereco: formatEnderecoCliente(c), cep: c.cep }
    }
  }

  return null
}
```

- [ ] **Step 2: Atualizar a assinatura de `parseCozinha` e extrair clientes no loop**

Mudar a assinatura:

```typescript
export async function parseCozinha(
  buffer: ArrayBuffer | Buffer,
  matriz?: ClienteMatriz[]
): Promise<ResultadoCozinha>
```

Após o trecho que extrai `veiculoRaw`, `motorista`, `placa` (antes do `rotas.push`), adicionar a extração de clientes:

```typescript
    // Extrai clientes desta rota
    const clientes: ClienteRomaneio[] = []
    for (let cOff = 2; cOff <= 25; cOff++) {
      const cr = ws.getRow(row + cOff)
      const nomeRaw = cellValue(cr.getCell(col))
      if (!nomeRaw) continue
      const nomeCliente = String(nomeRaw).trim().toUpperCase()
      if (!nomeCliente || nomeCliente === 'CLIENTE' || nomeCliente.length < 2) continue
      const notaFiscalRaw = cellValue(cr.getCell(col - 1))
      const pesoRaw = cellValue(cr.getCell(col + 1))
      const peso = typeof pesoRaw === 'number' ? pesoRaw : null
      const match = matriz ? matchCliente(nomeCliente, matriz) : null
      clientes.push({
        nome: nomeCliente,
        notaFiscal: notaFiscalRaw ? String(notaFiscalRaw).trim() : '',
        peso,
        endereco: match?.endereco ?? null,
        cep: match?.cep ?? null,
      })
    }
```

E adicionar `clientes` no `rotas.push(...)`:

```typescript
    rotas.push({
      rota: rotaNome,
      motorista,
      placa,
      veiculo: normalizaVeiculo(veiculoRaw),
      status: classificaStatus(motorista, placa),
      duplicada: false,
      clientes,   // ← adicionar
    })
```

Também no `regenerar/route.ts`, o `body.rotas.map` precisa passar `clientes` adiante:

```typescript
    return {
      rota: r.rota,
      motorista,
      placa,
      veiculo: r.veiculo ?? SEM_VALOR,
      duplicada: r.duplicada ?? false,
      status: classificaStatus(motorista, placa),
      clientes: r.clientes ?? [],   // ← adicionar
    }
```

- [ ] **Step 3: Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/parsers/cozinha-parser.ts src/app/api/cozinha/regenerar/route.ts
git commit -m "feat(cozinha): extrai clientes por rota e cruza endereços com a matriz"
```

---

## Task 3: Geradores de Romaneio (XLSX + PDF)

**Files:**
- Create: `src/lib/parsers/romaneio-generator.ts`

- [ ] **Step 1: Criar o gerador XLSX do romaneio**

O romaneio XLSX tem uma aba por rota. Cada aba: cabeçalho (rota + motorista + placa) + tabela de clientes (NF, CLIENTE, PESO, ENDEREÇO, CEP).

```typescript
import ExcelJS from 'exceljs'
import type { RotaCozinha } from './cozinha-parser'

const COR_BRAND_600 = 'FF1F4E78'
const COR_BRAND_500 = 'FF2E75B6'
const COR_BRAND_50 = 'FFF0F6FB'
const COR_BORDER = 'FFE2E8F0'
const COR_BG_ALT = 'FFF8FAFC'
const COR_MUTED = 'FF94A3B8'

export async function gerarRomaneioXlsx(
  rotas: RotaCozinha[],
  dataReferencia?: string
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TRANSMONSEG'
  wb.created = new Date()

  // Aba resumo
  const wsResumo = wb.addWorksheet('RESUMO')
  wsResumo.columns = [
    { key: 'rota', width: 30 },
    { key: 'motorista', width: 26 },
    { key: 'placa', width: 13 },
    { key: 'veiculo', width: 20 },
    { key: 'clientes', width: 10 },
  ]

  wsResumo.mergeCells('A1:E1')
  const title = wsResumo.getCell('A1')
  title.value = 'ROMANEIO COZINHA INDUSTRIAL' + (dataReferencia ? `  —  ${dataReferencia}` : '')
  title.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRAND_600 } }
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  wsResumo.getRow(1).height = 30

  const hdr = wsResumo.getRow(2)
  hdr.values = ['ROTA', 'MOTORISTA', 'PLACA', 'VEÍCULO', 'CLIENTES']
  hdr.height = 22
  hdr.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRAND_500 } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })

  rotas.forEach((r, i) => {
    const row = wsResumo.getRow(3 + i)
    row.values = [r.rota, r.motorista, r.placa, r.veiculo, r.clientes.length]
    row.height = 18
    const bg = i % 2 === 1 ? COR_BG_ALT : null
    row.eachCell(cell => {
      if (bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      cell.border = {
        bottom: { style: 'thin', color: { argb: COR_BORDER } },
        right: { style: 'thin', color: { argb: COR_BORDER } },
      }
      cell.alignment = { vertical: 'middle' }
      cell.font = { size: 10 }
    })
  })

  // Uma aba por rota
  for (const r of rotas) {
    const sheetName = r.rota.slice(0, 31).replace(/[*?:/\\[\]]/g, '-')
    const ws = wb.addWorksheet(sheetName)
    ws.columns = [
      { key: 'nf', width: 18 },
      { key: 'cliente', width: 32 },
      { key: 'peso', width: 10 },
      { key: 'endereco', width: 42 },
      { key: 'cep', width: 12 },
    ]

    // Cabeçalho da rota
    ws.mergeCells('A1:E1')
    const t = ws.getCell('A1')
    t.value = r.rota
    t.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRAND_600 } }
    t.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(1).height = 28

    ws.mergeCells('A2:E2')
    const info = ws.getCell('A2')
    info.value = `Motorista: ${r.motorista}   |   Placa: ${r.placa}   |   Veículo: ${r.veiculo}` +
      (dataReferencia ? `   |   ${dataReferencia}` : '')
    info.font = { size: 10, color: { argb: 'FF475569' } }
    info.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRAND_50 } }
    info.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(2).height = 20

    ws.getRow(3).height = 8  // espaçamento

    const colHdr = ws.getRow(4)
    colHdr.values = ['NOTA FISCAL', 'CLIENTE', 'PESO (KG)', 'ENDEREÇO', 'CEP']
    colHdr.height = 22
    colHdr.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRAND_500 } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })

    r.clientes.forEach((c, idx) => {
      const row = ws.getRow(5 + idx)
      row.values = [c.notaFiscal, c.nome, c.peso ?? '', c.endereco ?? '—', c.cep ?? '—']
      row.height = 18
      const bg = idx % 2 === 1 ? COR_BG_ALT : null
      const semEndereco = !c.endereco
      row.eachCell((cell, col) => {
        if (bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
        if (semEndereco && col >= 4) {
          cell.font = { size: 10, color: { argb: COR_MUTED }, italic: true }
        } else {
          cell.font = { size: 10 }
        }
        cell.border = { bottom: { style: 'thin', color: { argb: COR_BORDER } } }
        cell.alignment = { vertical: 'middle' }
      })
    })

    if (r.clientes.length === 0) {
      ws.mergeCells(`A5:E5`)
      const empty = ws.getCell('A5')
      empty.value = 'Nenhum cliente encontrado nesta rota'
      empty.font = { italic: true, color: { argb: COR_MUTED }, size: 10 }
      empty.alignment = { horizontal: 'center' }
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer())
}
```

- [ ] **Step 2: Criar o gerador PDF do romaneio**

```typescript
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib'
import type { RotaCozinha } from './cozinha-parser'

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN_X = 36
const MARGIN_TOP = 36
const MARGIN_BOTTOM = 40

const C_BRAND_600 = rgb(0.122, 0.306, 0.471)
const C_BRAND_500 = rgb(0.18, 0.46, 0.71)
const C_BRAND_50 = rgb(0.941, 0.965, 0.984)
const C_BORDER = rgb(0.886, 0.91, 0.941)
const C_INK = rgb(0.06, 0.09, 0.16)
const C_MUTED = rgb(0.58, 0.64, 0.72)
const C_WHITE = rgb(1, 1, 1)
const C_ALT = rgb(0.973, 0.98, 0.988)

const COL_W = [80, 148, 40, 210, 65] // NF | CLIENTE | PESO | ENDEREÇO | CEP
const TABLE_W = COL_W.reduce((a, b) => a + b, 0)

export async function gerarRomaneioPdf(
  rotas: RotaCozinha[],
  dataReferencia?: string
): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.setTitle('Romaneio Cozinha Industrial — TRANSMONSEG')

  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  for (const rota of rotas) {
    let page = pdf.addPage([PAGE_W, PAGE_H])
    let y = drawRotaHeader(page, fontBold, font, rota, dataReferencia)
    y = drawClienteHeader(page, fontBold, y)

    const ROW_H = 20
    let tableTop = y

    for (let i = 0; i < rota.clientes.length; i++) {
      if (y - ROW_H < MARGIN_BOTTOM + 10) {
        drawBordersV(page, tableTop, y)
        drawPageFooter(page, font, rota.rota)
        page = pdf.addPage([PAGE_W, PAGE_H])
        y = drawRotaContinuacao(page, fontBold, rota)
        y = drawClienteHeader(page, fontBold, y)
        tableTop = y
      }
      const c = rota.clientes[i]
      const bg = i % 2 === 1 ? C_ALT : null
      if (bg) {
        page.drawRectangle({
          x: MARGIN_X, y: y - ROW_H,
          width: TABLE_W, height: ROW_H,
          color: bg,
        })
      }
      const cols = [c.notaFiscal, c.nome, c.peso != null ? String(c.peso) : '', c.endereco ?? '—', c.cep ?? '—']
      let cx = MARGIN_X
      cols.forEach((txt, ci) => {
        const w = COL_W[ci]
        const size = 8.5
        const f = !c.endereco && ci >= 3 ? font : font
        const color = !c.endereco && ci >= 3 ? C_MUTED : C_INK
        const maxW = w - 8
        let drawT = txt
        while (drawT.length > 1 && f.widthOfTextAtSize(drawT + '…', size) > maxW)
          drawT = drawT.slice(0, -1)
        if (drawT !== txt) drawT += '…'
        page.drawText(drawT, { x: cx + 4, y: y - ROW_H + 7, size, font: f, color })
        cx += w
      })
      page.drawLine({
        start: { x: MARGIN_X, y: y - ROW_H },
        end: { x: MARGIN_X + TABLE_W, y: y - ROW_H },
        thickness: 0.3, color: C_BORDER,
      })
      y -= ROW_H
    }

    if (rota.clientes.length === 0) {
      page.drawText('Nenhum cliente encontrado nesta rota', {
        x: MARGIN_X + 8, y: y - ROW_H + 7,
        size: 9, font, color: C_MUTED,
      })
      y -= ROW_H
    }

    drawBordersV(page, tableTop, y)
    drawPageFooter(page, font, rota.rota)
  }

  return Buffer.from(await pdf.save())
}

function drawRotaHeader(
  page: PDFPage,
  fontBold: PDFFont,
  font: PDFFont,
  rota: RotaCozinha,
  dataRef: string | undefined
): number {
  let y = PAGE_H - MARGIN_TOP

  page.drawRectangle({ x: 0, y: y - 4, width: PAGE_W, height: 4, color: C_BRAND_600 })
  y -= 4

  page.drawRectangle({ x: MARGIN_X, y: y - 30, width: TABLE_W, height: 30, color: C_BRAND_600 })
  const rotaText = rota.rota
  const rotaW = fontBold.widthOfTextAtSize(rotaText, 14)
  page.drawText(rotaText, {
    x: MARGIN_X + (TABLE_W - rotaW) / 2, y: y - 20,
    size: 14, font: fontBold, color: C_WHITE,
  })
  y -= 30

  page.drawRectangle({ x: MARGIN_X, y: y - 22, width: TABLE_W, height: 22, color: C_BRAND_50 })
  const infoText = `${rota.motorista}  ·  ${rota.placa}  ·  ${rota.veiculo}` +
    (dataRef ? `  ·  ${dataRef}` : '')
  const infoW = font.widthOfTextAtSize(infoText, 9)
  page.drawText(infoText, {
    x: MARGIN_X + (TABLE_W - infoW) / 2, y: y - 14,
    size: 9, font, color: C_BRAND_600,
  })
  y -= 22

  y -= 8
  return y
}

function drawRotaContinuacao(page: PDFPage, fontBold: PDFFont, rota: RotaCozinha): number {
  const y = PAGE_H - MARGIN_TOP
  page.drawRectangle({ x: 0, y: y - 4, width: PAGE_W, height: 4, color: C_BRAND_600 })
  const txt = `${rota.rota} (continuação)`
  const tw = fontBold.widthOfTextAtSize(txt, 11)
  page.drawText(txt, {
    x: (PAGE_W - tw) / 2, y: y - 22,
    size: 11, font: fontBold, color: C_BRAND_600,
  })
  return y - 32
}

function drawClienteHeader(page: PDFPage, fontBold: PDFFont, y: number): number {
  const H = 22
  page.drawRectangle({ x: MARGIN_X, y: y - H, width: TABLE_W, height: H, color: C_BRAND_500 })
  const labels = ['NOTA FISCAL', 'CLIENTE', 'KG', 'ENDEREÇO', 'CEP']
  let cx = MARGIN_X
  labels.forEach((lbl, i) => {
    const w = COL_W[i]
    const size = 8.5
    const tw = fontBold.widthOfTextAtSize(lbl, size)
    page.drawText(lbl, {
      x: cx + (w - tw) / 2, y: y - H + 7,
      size, font: fontBold, color: C_WHITE,
    })
    cx += w
  })
  return y - H
}

function drawBordersV(page: PDFPage, topY: number, bottomY: number) {
  let cx = MARGIN_X
  for (let i = 0; i <= COL_W.length; i++) {
    page.drawLine({
      start: { x: cx, y: topY },
      end: { x: cx, y: bottomY },
      thickness: 0.4, color: C_BORDER,
    })
    if (i < COL_W.length) cx += COL_W[i]
  }
}

function drawPageFooter(page: PDFPage, font: PDFFont, rotaNome: string) {
  const txt = `TRANSMONSEG  ·  ${rotaNome}  ·  Gerado em ${new Date().toLocaleString('pt-BR')}`
  const size = 7
  const tw = font.widthOfTextAtSize(txt, size)
  page.drawText(txt, {
    x: (PAGE_W - tw) / 2, y: MARGIN_BOTTOM - 20,
    size, font, color: C_MUTED,
  })
}
```

Adicionar `export { gerarRomaneioXlsx, gerarRomaneioPdf }` no fim do arquivo (as funções já têm `export`).

- [ ] **Step 3: Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/parsers/romaneio-generator.ts
git commit -m "feat(cozinha): geradores XLSX e PDF do romaneio por rota"
```

---

## Task 4: Bucket Supabase + API da Matriz

**Files:**
- Create: `src/app/api/cozinha/matriz/route.ts`

- [ ] **Step 1: Criar bucket `cozinha-matriz` no Supabase via MCP**

Usar `mcp__plugin_supabase_supabase__execute_sql` para criar o bucket via SQL da API de storage do Supabase:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cozinha-matriz', 'cozinha-matriz', false, 5242880, ARRAY['application/json', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Criar a rota da API**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseMatrizClientes, type ClienteMatriz } from '@/lib/parsers/cozinha-matriz'

export const runtime = 'nodejs'

const BUCKET = 'cozinha-matriz'
const FILE_KEY = 'clientes.json'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const svc = createServiceClient()
  const { data, error } = await svc.storage.from(BUCKET).download(FILE_KEY)
  if (error || !data) return NextResponse.json({ exists: false, totalClientes: 0, updatedAt: null })

  try {
    const text = await data.text()
    const clientes = JSON.parse(text) as ClienteMatriz[]
    // Buscar metadata do arquivo para pegar updatedAt
    const { data: meta } = await svc.storage.from(BUCKET).list('', { search: FILE_KEY })
    const updatedAt = meta?.[0]?.updated_at ?? null
    return NextResponse.json({ exists: true, totalClientes: clientes.length, updatedAt })
  } catch {
    return NextResponse.json({ exists: false, totalClientes: 0, updatedAt: null })
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const formData = await req.formData()
  const arquivo = formData.get('arquivo')
  if (!(arquivo instanceof File))
    return new NextResponse('Arquivo não enviado.', { status: 400 })
  if (!arquivo.name.toLowerCase().endsWith('.xlsx'))
    return new NextResponse('Envie um arquivo .xlsx.', { status: 400 })

  const buffer = await arquivo.arrayBuffer()
  let clientes: ClienteMatriz[]
  try {
    clientes = await parseMatrizClientes(buffer)
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : 'Erro ao ler XLSX.', { status: 400 })
  }

  if (clientes.length === 0)
    return new NextResponse('Nenhum cliente encontrado no arquivo. Confirme que é a planilha de clientes.', { status: 400 })

  const svc = createServiceClient()
  const json = JSON.stringify(clientes)
  const { error } = await svc.storage
    .from(BUCKET)
    .upload(FILE_KEY, new Blob([json], { type: 'application/json' }), { upsert: true })

  if (error)
    return new NextResponse(`Erro ao salvar matriz: ${error.message}`, { status: 500 })

  return NextResponse.json({ ok: true, totalClientes: clientes.length })
}
```

- [ ] **Step 3: Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cozinha/matriz/route.ts
git commit -m "feat(cozinha): endpoint GET/POST para matriz de clientes (Supabase Storage)"
```

---

## Task 5: Atualizar API Principal + Regenerar

**Files:**
- Modify: `src/app/api/cozinha/route.ts`
- Modify: `src/app/api/cozinha/regenerar/route.ts`

- [ ] **Step 1: Atualizar `src/app/api/cozinha/route.ts`**

Adicionar imports:

```typescript
import { createServiceClient } from '@/lib/supabase/service'
import type { ClienteMatriz } from '@/lib/parsers/cozinha-matriz'
import { gerarRomaneioXlsx, gerarRomaneioPdf } from '@/lib/parsers/romaneio-generator'
```

Antes de chamar `parseCozinha`, carregar a matriz:

```typescript
  // Carrega matriz de clientes do storage (opcional — não bloqueia se ausente)
  let matriz: ClienteMatriz[] | undefined
  try {
    const svc = createServiceClient()
    const { data: matrizBlob } = await svc.storage.from('cozinha-matriz').download('clientes.json')
    if (matrizBlob) {
      const text = await matrizBlob.text()
      matriz = JSON.parse(text) as ClienteMatriz[]
    }
  } catch {
    // matriz ausente — gera sem endereços
  }
```

Alterar a chamada do parser para passar a matriz:

```typescript
  resultado = await parseCozinha(arrayBuffer, matriz)
```

Após gerar `xlsxBuffer` e `pdfBuffer`, gerar o romaneio:

```typescript
  const [xlsxBuffer, pdfBuffer, romaneioXlsxBuffer, romaneioPdfBuffer] = await Promise.all([
    gerarXlsx(rotas, estatisticas, dataFormatada),
    gerarPdf(rotas, estatisticas, dataFormatada),
    gerarRomaneioXlsx(rotas, dataFormatada),
    gerarRomaneioPdf(rotas, dataFormatada),
  ])
```

Adicionar ao retorno:

```typescript
  return NextResponse.json({
    rotas,
    estatisticas,
    declaradas,
    xlsxBase64: xlsxBuffer.toString('base64'),
    pdfBase64: pdfBuffer.toString('base64'),
    romaneioXlsxBase64: romaneioXlsxBuffer.toString('base64'),
    romaneioPdfBase64: romaneioPdfBuffer.toString('base64'),
    temMatriz: !!matriz,
    totalClientesNaMatriz: matriz?.length ?? 0,
    nomeBase,
  })
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cozinha/route.ts
git commit -m "feat(cozinha): carrega matriz e gera romaneio XLSX+PDF na resposta da API"
```

---

## Task 6: Atualizar UI do Uploader

**Files:**
- Modify: `src/app/painel/cozinha/uploader.tsx`

- [ ] **Step 1: Adicionar tipos novos e state**

Nos imports, adicionar `useEffect` e os ícones Phosphor necessários:

```typescript
import { useMemo, useState, useTransition, useEffect } from 'react'
import {
  UploadSimple,
  DownloadSimple,
  FloppyDisk,
  CircleNotch,
  UsersThree,
  CheckCircle,
  Warning,
} from '@phosphor-icons/react/dist/ssr'
```

Adicionar o tipo `MatrizStatus` e campos ao tipo `Resultado`:

```typescript
type MatrizStatus = {
  exists: boolean
  totalClientes: number
  updatedAt: string | null
}
```

Em `Resultado`, adicionar:

```typescript
type Resultado = {
  rotas: Rota[]
  estatisticas: Estatisticas
  declaradas: number
  xlsxBase64: string
  pdfBase64: string
  romaneioXlsxBase64: string   // ← novo
  romaneioPdfBase64: string    // ← novo
  temMatriz: boolean           // ← novo
  nomeBase: string
}
```

Adicionar states no `CozinhaUploader`:

```typescript
  const [matriz, setMatriz] = useState<MatrizStatus | null>(null)
  const [arquivoMatriz, setArquivoMatriz] = useState<File | null>(null)
  const [pendingMatriz, startMatriz] = useTransition()
  const [erroMatriz, setErroMatriz] = useState<string | null>(null)
```

- [ ] **Step 2: Buscar status da matriz no mount**

Adicionar após os estados:

```typescript
  useEffect(() => {
    fetch('/api/cozinha/matriz')
      .then(r => r.json())
      .then((d: MatrizStatus) => setMatriz(d))
      .catch(() => {})
  }, [])
```

- [ ] **Step 3: Adicionar função `uploadMatriz`**

```typescript
  async function uploadMatriz() {
    if (!arquivoMatriz) return
    setErroMatriz(null)
    const fd = new FormData()
    fd.append('arquivo', arquivoMatriz)
    startMatriz(async () => {
      try {
        const res = await fetch('/api/cozinha/matriz', { method: 'POST', body: fd })
        if (!res.ok) throw new Error((await res.text()) || 'Erro ao enviar.')
        const data = (await res.json()) as { ok: boolean; totalClientes: number }
        setMatriz({ exists: true, totalClientes: data.totalClientes, updatedAt: new Date().toISOString() })
        setArquivoMatriz(null)
      } catch (e) {
        setErroMatriz(e instanceof Error ? e.message : String(e))
      }
    })
  }
```

- [ ] **Step 4: Adicionar seção de Matriz no JSX**

Após o `<Card>` de upload da escala (antes do `{resultado && ...}`), adicionar:

```tsx
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersThree size={16} weight="fill" className="text-[var(--color-accent)]" />
            Matriz de Clientes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            {matriz?.exists ? (
              <div className="flex items-center gap-2 rounded-md border border-transparent bg-[var(--color-success-soft)] px-3 py-2 text-[13px] text-[var(--color-success-soft-fg)]">
                <CheckCircle size={15} weight="fill" />
                <span>
                  <span className="font-semibold">{matriz.totalClientes}</span> clientes carregados
                  {matriz.updatedAt && (
                    <span className="ml-2 opacity-70">
                      · atualizado {new Date(matriz.updatedAt).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-transparent bg-[var(--color-warning-soft)] px-3 py-2 text-[13px] text-[var(--color-warning-soft-fg)]">
                <Warning size={15} weight="fill" />
                <span>Nenhuma matriz carregada — romaneio será gerado sem endereços</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cozinha-matriz">Atualizar matriz (XLSX dos clientes)</Label>
              <label
                htmlFor="cozinha-matriz"
                className={cn(
                  'flex h-24 w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 text-center transition-colors',
                  'border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)]',
                  'hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-hover)]',
                )}
              >
                <UploadSimple size={20} weight="bold" className="mb-1 text-[var(--color-fg-subtle)]" />
                <span className="text-[13px] font-medium text-[var(--color-fg)]">
                  {arquivoMatriz ? arquivoMatriz.name : 'Clique para selecionar'}
                </span>
                <input
                  id="cozinha-matriz"
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => setArquivoMatriz(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
            </div>
            <div className="flex flex-col justify-end gap-2">
              {erroMatriz && (
                <div className="rounded-md border border-transparent bg-[var(--color-danger-soft)] px-3 py-2 text-[12px] text-[var(--color-danger-soft-fg)]">
                  {erroMatriz}
                </div>
              )}
              <Button
                onClick={uploadMatriz}
                disabled={pendingMatriz || !arquivoMatriz}
                size="md"
              >
                {pendingMatriz ? (
                  <>
                    <CircleNotch size={14} weight="bold" className="animate-spin" />
                    Enviando...
                  </>
                ) : (
                  'Salvar matriz'
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
```

- [ ] **Step 5: Adicionar botões de download do romaneio**

No bloco de botões de exportação (onde estão os botões XLSX e PDF da escala), adicionar os botões do romaneio logo após:

```tsx
                {resultado.romaneioXlsxBase64 && (
                  <>
                    <div className="mx-1 h-4 w-px bg-[var(--color-border)]" />
                    <span className="text-[11px] font-medium text-[var(--color-fg-muted)]">
                      Romaneio:
                    </span>
                    <Button
                      onClick={() =>
                        baixar(
                          resultado.romaneioXlsxBase64,
                          `${resultado.nomeBase}_ROMANEIO.xlsx`,
                          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        )
                      }
                      size="sm"
                      variant="primary"
                    >
                      <DownloadSimple size={14} weight="bold" />
                      XLSX
                    </Button>
                    <Button
                      onClick={() =>
                        baixar(
                          resultado.romaneioPdfBase64,
                          `${resultado.nomeBase}_ROMANEIO.pdf`,
                          'application/pdf',
                        )
                      }
                      size="sm"
                      variant="secondary"
                    >
                      <DownloadSimple size={14} weight="bold" />
                      PDF
                    </Button>
                  </>
                )}
```

- [ ] **Step 6: Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 7: Commit**

```bash
git add src/app/painel/cozinha/uploader.tsx
git commit -m "feat(cozinha): seção de matriz de clientes + botões de romaneio na UI"
```

---

## Task 7: Criar bucket + Verificação Final + Push

- [ ] **Step 1: Criar bucket via Supabase MCP**

Executar via `mcp__plugin_supabase_supabase__execute_sql`:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cozinha-matriz',
  'cozinha-matriz',
  false,
  5242880,
  ARRAY['application/json', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Verificação final de tipos e lint**

```bash
npx tsc --noEmit && npx eslint src/lib/parsers/cozinha-matriz.ts src/lib/parsers/romaneio-generator.ts src/app/api/cozinha/matriz/route.ts src/app/api/cozinha/route.ts src/app/painel/cozinha/uploader.tsx --max-warnings=0
```

Esperado: 0 erros, 0 warnings.

- [ ] **Step 3: Push**

```bash
git push
```

---

## Notas de Implementação

**Matching de clientes:** O algoritmo tenta match exato → substring → palavras-chave (≥3 chars). Clientes sem match ficam com `endereco: null` e aparecem como "—" em itálico no romaneio. Erica pode subir uma nova matriz a qualquer momento para melhorar os matches.

**Upload da Matriz:** O `Clientes cozinha (4).xlsx` (572 linhas) já está nos downloads — Erica deve fazer o upload inicial assim que a feature for ao ar.

**Romaneio sem matriz:** Funciona normalmente — gera o romaneio com placa/motorista/clientes, apenas sem endereços.

**Backward compat:** `clientes: []` no `regenerar/route.ts` garante que o endpoint de regeneração não quebra com dados antigos que não tenham o campo.
