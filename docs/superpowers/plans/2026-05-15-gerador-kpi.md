# Gerador de KPI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir gerador de KPI que produz 16 arquivos `KPI {Rede}.xlsx` por dia, no padrão visual do template `KPI PRINCESA.xlsx` mas com design contemporâneo.

**Architecture:** Substitui o `src/lib/kpi/gerador-xlsx.ts` atual (single-sheet) por sistema multi-sheet por rede com regeneração do dia. Logo TRANSMONSEG extraída do template original. Storage no Supabase `kpi-gerado/{YYYY-MM}/{Rede}.xlsx`. Zona Sul tem aba especial BASE com PROCV.

**Tech Stack:** ExcelJS 4.4 (XLSX + imagem), Supabase Storage, Node 20+, TypeScript strict.

---

## File Structure

**Create:**
- `src/lib/kpi/template-loader.ts` — extrair logo + metadata do template `KPI PRINCESA.xlsx`
- `src/lib/kpi/gerador-kpi.ts` — novo gerador (substitui `gerador-xlsx.ts` mas mantém compat)
- `src/lib/kpi/kpi-styles.ts` — paleta + estilos centralizados (constantes)
- `src/lib/kpi/anomalia-obs.ts` — mapeamento codigo ANOM → texto OBS
- `src/lib/kpi/zona-sul-base.ts` — gerador da aba BASE de Zona Sul
- `src/assets/transmonseg-logo.png` — extraído do template
- `src/lib/lojas/catalogo-matriz.ts` — ordem fixa de lojas por rede (matriz template)
- `scripts/extract-logo.mjs` — script one-shot pra extrair logo do template

**Modify:**
- `src/app/api/kpi/gerar/route.ts` — regenera por rede, acumula no XLSX do mês
- `scripts/load-day.mjs` — adicionar etapa de gerar XLSX pós-processar

**Tests:**
- `scripts/test-gerador-kpi.mjs` — gera 16 KPIs do dia 15/05 com dados reais, salva em `/tmp/kpi-test/`

---

## Task 1: Extrair logo TRANSMONSEG do template

**Files:**
- Create: `scripts/extract-logo.mjs`
- Create: `src/assets/transmonseg-logo.png`

- [ ] **Step 1: Criar script de extração**

```javascript
// scripts/extract-logo.mjs
import ExcelJS from 'exceljs'
import { writeFile } from 'node:fs/promises'

const TEMPLATE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/kpi-modelos/KPI PRINCESA.xlsx'
const OUT = 'src/assets/transmonseg-logo.png'

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(TEMPLATE)
const imgs = wb.model.media || []
console.log(`Imagens encontradas: ${imgs.length}`)
for (const [i, m] of imgs.entries()) {
  console.log(`  ${i}: type=${m.extension} ${m.buffer?.length ?? 0} bytes`)
}
if (imgs[0]) {
  await writeFile(OUT, imgs[0].buffer)
  console.log(`OK → ${OUT}`)
}
```

- [ ] **Step 2: Rodar e validar**

Run: `cd /c/Users/media/dev/kpi-transmonseg && npx tsx scripts/extract-logo.mjs`
Expected: imprime `Imagens encontradas: 1` (ou mais) e salva o PNG.

- [ ] **Step 3: Verificar visualmente o PNG**

Abrir `src/assets/transmonseg-logo.png` no preview do Windows. Confirmar que é o logo TRANSMONSEG amarelo.

- [ ] **Step 4: Commit**

```bash
git add scripts/extract-logo.mjs src/assets/transmonseg-logo.png
git commit -m "feat(kpi): extrair logo TRANSMONSEG do template Princesa"
```

---

## Task 2: Estilos centralizados (kpi-styles.ts)

**Files:**
- Create: `src/lib/kpi/kpi-styles.ts`

- [ ] **Step 1: Criar arquivo de estilos**

```typescript
// src/lib/kpi/kpi-styles.ts
export const KPI_COLORS = {
  TRANSMONSEG_YELLOW: 'FFFFD700',
  BRAND_BLUE: 'FF1F4E78',
  BRAND_BLUE_LIGHT: 'FF2E75B6',
  HEADER_TEXT: 'FFFFFFFF',
  BG_WHITE: 'FFFFFFFF',
  BG_ZEBRA: 'FFF8FAFC',
  BORDER: 'FFE2E8F0',
  TEXT_DEFAULT: 'FF1E293B',
  TEXT_MUTED: 'FF475569',
  TEXT_SUBTLE: 'FF94A3B8',
  TEMPO_GOOD: 'FFDCFCE7',
  TEMPO_MEDIUM: 'FFFEF3C7',
  TEMPO_HIGH: 'FFFED7AA',
  ANOMALIA_HIGH_BG: 'FFFEF2F2',
} as const

export const KPI_FONTS = {
  TITLE: { name: 'Calibri', size: 18, bold: true, color: { argb: KPI_COLORS.TEXT_DEFAULT } },
  SUBTITLE: { name: 'Calibri', size: 11, italic: true, color: { argb: KPI_COLORS.TEXT_MUTED } },
  HEADER: { name: 'Calibri', size: 11, bold: true, color: { argb: KPI_COLORS.HEADER_TEXT } },
  BODY: { name: 'Calibri', size: 10, color: { argb: KPI_COLORS.TEXT_DEFAULT } },
  BODY_MUTED: { name: 'Calibri', size: 10, italic: true, color: { argb: KPI_COLORS.TEXT_SUBTLE } },
} as const

export const KPI_BORDER_THIN = {
  bottom: { style: 'thin' as const, color: { argb: KPI_COLORS.BORDER } },
}

export const REDE_NOMES_CANONICOS: Record<string, string> = {
  PRINCESA: 'Princesa',
  PREZUNIC: 'Prezunic',
  CARREFOUR: 'Carrefour',
  ASSAI: 'Assaí',
  SUPERPRIX: 'Superprix',
  ATACADAO: 'Atacadão',
  SAMS_CLUB: "Sam's Club",
  VIANENSE: 'Vianense',
  CAB_PETROPOLIS: 'CAB-Petrópolis',
  SENDAS: 'Sendas',
  GUANABARA: 'Guanabara',
  SUPER_PAX: 'Superpax',
  FEIRA_NOVA: 'Feira Nova',
  EMANUEL: 'Rede Emanuel',
  ARMAZEM_GRAO: 'Armazém do Grão',
  ZONA_SUL: 'Zona Sul',
}

export function formataDataPtBr(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const diaSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'][dt.getUTCDay()]
  const mes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][dt.getUTCMonth()]
  return `${diaSemana}, ${String(d).padStart(2, '0')} de ${mes} de ${y}`
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/kpi/kpi-styles.ts
git commit -m "feat(kpi): adicionar paleta e fonts centralizadas"
```

---

## Task 3: Mapeamento anomalia → texto OBS

**Files:**
- Create: `src/lib/kpi/anomalia-obs.ts`
- Create: `scripts/test-anomalia-obs.mjs`

- [ ] **Step 1: Escrever teste**

```javascript
// scripts/test-anomalia-obs.mjs
import { codigoToObsText, joinObsTexts } from '../src/lib/kpi/anomalia-obs.ts'
import assert from 'node:assert'

assert.equal(codigoToObsText('ANOM-01'), '⚠ placa sem GPS')
assert.equal(codigoToObsText('ANOM-04'), '⚠ saída < chegada')
assert.equal(codigoToObsText('ANOM-99'), '⚠ anomalia ANOM-99')
assert.equal(joinObsTexts(['ANOM-01', 'ANOM-04']), '⚠ placa sem GPS · ⚠ saída < chegada')
assert.equal(joinObsTexts([]), '')
console.log('OK anomalia-obs')
```

- [ ] **Step 2: Rodar teste pra ver falhar**

Run: `cd /c/Users/media/dev/kpi-transmonseg && npx tsx scripts/test-anomalia-obs.mjs`
Expected: erro de import (módulo não existe)

- [ ] **Step 3: Implementar**

```typescript
// src/lib/kpi/anomalia-obs.ts
const OBS_MAP: Record<string, string> = {
  'ANOM-01': '⚠ placa sem GPS',
  'ANOM-02': '⚠ GPS sem escala',
  'ANOM-03': '⚠ parada fora geofence ≥10min',
  'ANOM-04': '⚠ saída < chegada',
  'ANOM-05': '⚠ qtd paradas ≠ escala',
  'ANOM-06': '⚠ saída CD ausente',
  'ANOM-07': '⚠ chegada antes da saída CD',
  'ANOM-08': '⚠ tempo loja >4h',
  'ANOM-10': '⚠ loja não cadastrada',
  'ANOM-11': '⚠ fora janela operacional',
}

export function codigoToObsText(codigo: string): string {
  return OBS_MAP[codigo] ?? `⚠ anomalia ${codigo}`
}

export function joinObsTexts(codigos: string[]): string {
  if (!codigos?.length) return ''
  return [...new Set(codigos)].map(codigoToObsText).join(' · ')
}
```

- [ ] **Step 4: Rodar teste pra ver passar**

Run: `npx tsx scripts/test-anomalia-obs.mjs`
Expected: `OK anomalia-obs`

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi/anomalia-obs.ts scripts/test-anomalia-obs.mjs
git commit -m "feat(kpi): mapeamento codigo anomalia para texto OBS"
```

---

## Task 4: Catálogo de matriz (ordem fixa de lojas por rede)

**Files:**
- Create: `src/lib/lojas/catalogo-matriz.ts`

- [ ] **Step 1: Implementar com dados conhecidos**

```typescript
// src/lib/lojas/catalogo-matriz.ts
// Ordem canônica de lojas por rede, baseada em KPI PRINCESA.xlsx
// e nas escalas observadas.
// Sistema usa essa ordem para popular a aba MATRIZ.
// Lojas novas detectadas automaticamente são adicionadas ao final.

export const MATRIZ_LOJAS: Record<string, string[]> = {
  PRINCESA: [
    'Princesa - Catete', 'Princesa - Flamengo', 'Princesa - Cosme Velho',
    'Princesa - Laranjeiras', 'Princesa - Copacabana', 'Princesa - Leme',
    'Princesa - Pechincha', 'Princesa - Niterói Barcas', 'Princesa - Inga',
    'Princesa - Fonseca', 'Princesa - Icaraí',
    'Princesa - Iguaba Grande (1ª)', 'Princesa - Itaboraí (2ª)',
    'Princesa - Maricá 1 (2ª)', 'Princesa - Maricá 2 (1ª)',
    'Princesa - Barra de São João (1ª)', 'Princesa - Rio das Ostras (2ª)',
    'Princesa - Arraial do Cabo 1 (1ª)', 'Princesa - Arraial do Cabo 2 (2ª)', 'Princesa - Arraial do Cabo 3 (3ª)',
    'Princesa - Búzios 1 (2ª)', 'Princesa - Búzios 2 (3ª)', 'Princesa - Búzios 3 (1ª)',
    'Princesa - Cabo Frio 1 (1ª)', 'Princesa - Cabo Frio 2 (3ª)', 'Princesa - Cabo Frio 3 (2ª)',
  ],
  // outras redes: ordem é descoberta dinamicamente da escala se não houver template fixo
}

export function getMatrizLojas(rede_id: string, lojasDescobertasNoDia: string[]): string[] {
  const fixo = MATRIZ_LOJAS[rede_id]
  if (fixo) {
    const novas = lojasDescobertasNoDia.filter(l => !fixo.includes(l))
    return [...fixo, ...novas]
  }
  // Sem template: usa só as descobertas, ordenadas alfabeticamente
  return [...new Set(lojasDescobertasNoDia)].sort()
}

export function detectarMaxLojasPorRota(linhas: Array<{ chd_loja_1?: Date|null; chd_loja_2?: Date|null; chd_loja_3?: Date|null }>): 1 | 2 | 3 {
  let max = 1
  for (const l of linhas) {
    if (l.chd_loja_3) return 3
    if (l.chd_loja_2 && max < 2) max = 2
  }
  return max as 1 | 2 | 3
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/lojas/catalogo-matriz.ts
git commit -m "feat(kpi): catalogo matriz fixa + detector de multi-loja"
```

---

## Task 5: Gerador KPI core — abrir template, criar aba do dia

**Files:**
- Create: `src/lib/kpi/template-loader.ts`
- Create: `src/lib/kpi/gerador-kpi.ts`

- [ ] **Step 1: Criar template-loader**

```typescript
// src/lib/kpi/template-loader.ts
import ExcelJS from 'exceljs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

let cachedLogoBuffer: Buffer | null = null

export async function getLogoBuffer(): Promise<Buffer> {
  if (cachedLogoBuffer) return cachedLogoBuffer
  // PNG salvo em src/assets/transmonseg-logo.png pelo Task 1
  const path = resolve(process.cwd(), 'src/assets/transmonseg-logo.png')
  cachedLogoBuffer = await readFile(path)
  return cachedLogoBuffer
}

export async function carregarOuCriarWorkbook(buffer: Buffer | null): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TRANSMONSEG'
  wb.created = new Date()
  if (buffer) {
    await wb.xlsx.load(buffer)
  }
  return wb
}

export function nomeAbaDoDia(dataISO: string): string {
  return dataISO.split('-')[2]  // '2026-05-15' → '15'
}
```

- [ ] **Step 2: Criar gerador-kpi com header**

```typescript
// src/lib/kpi/gerador-kpi.ts
import ExcelJS from 'exceljs'
import type { KpiLinha } from '@/lib/types/kpi'
import { KPI_COLORS, KPI_FONTS, KPI_BORDER_THIN, REDE_NOMES_CANONICOS, formataDataPtBr } from './kpi-styles'
import { getLogoBuffer, carregarOuCriarWorkbook, nomeAbaDoDia } from './template-loader'
import { getMatrizLojas, detectarMaxLojasPorRota } from '@/lib/lojas/catalogo-matriz'
import { joinObsTexts } from './anomalia-obs'

export interface GerarKpiInput {
  rede_id: string
  data: string  // YYYY-MM-DD
  linhas: KpiLinha[]
  arquivoExistente?: Buffer | null  // buffer do XLSX do mês existente (Storage)
}

function fmt(d: Date | null | undefined): string {
  if (!d) return ''
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

function colLetter(n: number): string {
  let result = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    result = String.fromCharCode(65 + rem) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}

export async function gerarKpi(input: GerarKpiInput): Promise<Buffer> {
  const { rede_id, data, linhas, arquivoExistente } = input
  const wb = await carregarOuCriarWorkbook(arquivoExistente ?? null)
  const nomeAba = nomeAbaDoDia(data)
  const redeNome = REDE_NOMES_CANONICOS[rede_id] ?? rede_id

  // Remove aba do dia se já existir (vamos regenerar)
  const abaExistente = wb.getWorksheet(nomeAba)
  if (abaExistente) wb.removeWorksheet(abaExistente.id)

  const ws = wb.addWorksheet(nomeAba, { views: [{ state: 'frozen', ySplit: 4 }] })
  await preencherAba(ws, wb, { redeNome, data, linhas })
  return Buffer.from(await wb.xlsx.writeBuffer())
}

async function preencherAba(
  ws: ExcelJS.Worksheet,
  wb: ExcelJS.Workbook,
  ctx: { redeNome: string; data: string; linhas: KpiLinha[] },
) {
  const { redeNome, data, linhas } = ctx
  const maxLojas = detectarMaxLojasPorRota(linhas)
  const totalCols = 4 + maxLojas * 3 + 1  // loja+motorista+cod+placa + (chd+sai+tempo)*N + obs
  const lastCol = colLetter(totalCols)

  // Larguras
  ws.columns = [
    { width: 35 }, { width: 28 }, { width: 10 }, { width: 12 },
    ...Array.from({ length: maxLojas * 3 }, (_, i) => ({ width: i % 3 === 2 ? 12 : 12 })),
    { width: 25 },
  ]

  // Row 1: header amarelo com logo
  ws.mergeCells(`A1:${lastCol}1`)
  const c1 = ws.getCell('A1')
  c1.value = `RELATÓRIO KPI · ${redeNome}`
  c1.font = KPI_FONTS.TITLE
  c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_COLORS.TRANSMONSEG_YELLOW } }
  c1.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 50

  // Logo nas pontas
  try {
    const logoBuf = await getLogoBuffer()
    const logoId = wb.addImage({ buffer: logoBuf, extension: 'png' })
    ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 80, height: 50 }, editAs: 'oneCell' })
    ws.addImage(logoId, { tl: { col: totalCols - 1, row: 0 }, ext: { width: 80, height: 50 }, editAs: 'oneCell' })
  } catch (e) {
    console.warn(`Logo não encontrada: ${(e as Error).message}`)
  }

  // Row 2: subtítulo BENASSI + data
  ws.mergeCells(`A2:${lastCol}2`)
  const c2 = ws.getCell('A2')
  c2.value = `BENASSI · ${formataDataPtBr(data)}`
  c2.font = KPI_FONTS.SUBTITLE
  c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_COLORS.BG_WHITE } }
  c2.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(2).height = 22

  // Row 3: separador
  ws.getRow(3).height = 8

  // Row 4: headers
  const headers: string[] = ['REDES / FILIAIS', 'MOTORISTA', 'CÓDIGO', 'PLACA']
  for (let n = 1; n <= maxLojas; n++) {
    headers.push(`CHD LOJA ${n}`, `SAÍDA LOJA ${n}`, `TEMPO LOJA ${n}`)
  }
  headers.push('OBS')

  const headerRow = ws.getRow(4)
  headerRow.values = headers
  headerRow.height = 30
  headerRow.eachCell((cell) => {
    cell.font = KPI_FONTS.HEADER
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_COLORS.BRAND_BLUE } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })

  // Dados - ordem da matriz
  const lojasNoDia = [...new Set(linhas.map(l => l.loja_nome))]
  const ordem = getMatrizLojas(extractRedeIdFromRedeNome(redeNome), lojasNoDia)
  let rowIdx = 5
  for (const loja of ordem) {
    const linhasDessaLoja = linhas.filter(l => l.loja_nome === loja)
    if (linhasDessaLoja.length === 0) {
      // loja não rodou hoje - linha placeholder
      escreverLinhaPlaceholder(ws, rowIdx, loja, maxLojas, totalCols)
      rowIdx++
      continue
    }
    for (const linha of linhasDessaLoja) {
      escreverLinhaDados(ws, rowIdx, linha, maxLojas, totalCols)
      rowIdx++
    }
  }
}

function extractRedeIdFromRedeNome(nome: string): string {
  for (const [id, n] of Object.entries(REDE_NOMES_CANONICOS)) if (n === nome) return id
  return nome.toUpperCase()
}

function escreverLinhaPlaceholder(ws: ExcelJS.Worksheet, row: number, loja: string, maxLojas: number, totalCols: number) {
  const r = ws.getRow(row)
  r.height = 22
  r.values = [loja, '', '', '', ...Array(maxLojas * 3).fill(''), '']
  r.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.font = colNum === 1 ? KPI_FONTS.BODY_MUTED : KPI_FONTS.BODY
    cell.alignment = { horizontal: colNum === 1 ? 'left' : 'center', vertical: 'middle' }
    cell.border = KPI_BORDER_THIN
  })
}

function escreverLinhaDados(ws: ExcelJS.Worksheet, row: number, linha: KpiLinha, maxLojas: number, totalCols: number) {
  const r = ws.getRow(row)
  r.height = 22
  const motorista = (linha.motorista ?? '') + (linha.carro_ordem === 2 ? ' (2º CARRO)' : '')
  const values: (string | number | null)[] = [
    linha.loja_nome, motorista, linha.codigo ?? '', linha.placa ?? '',
    fmt(linha.saida_cd),
  ]
  for (let n = 1; n <= maxLojas; n++) {
    const chd = n === 1 ? linha.chd_loja_1 : n === 2 ? linha.chd_loja_2 : linha.chd_loja_3
    const sai = n === 1 ? linha.saida_loja_1 : n === 2 ? linha.saida_loja_2 : linha.saida_loja_3
    const tempo = n === 1 ? linha.tempo_loja_1_min : n === 2 ? linha.tempo_loja_2_min : linha.tempo_loja_3_min
    if (n === 1) {
      values.push(fmt(chd), fmt(sai), tempo ?? '')
    } else {
      values.push(fmt(chd), fmt(sai), tempo ?? '')
    }
  }
  const obs = joinObsTexts(linha.anomalias_codigos ?? [])
  values[values.length] = obs
  r.values = [linha.loja_nome, motorista, linha.codigo ?? '', linha.placa ?? '', ...values.slice(4)]

  const hasAnomaliaHigh = (linha.anomalias_codigos ?? []).some(c => ['ANOM-01', 'ANOM-04', 'ANOM-06', 'ANOM-07'].includes(c))
  const zebraColor = row % 2 === 0 ? KPI_COLORS.BG_ZEBRA : KPI_COLORS.BG_WHITE
  const bgColor = hasAnomaliaHigh ? KPI_COLORS.ANOMALIA_HIGH_BG : zebraColor

  r.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.font = KPI_FONTS.BODY
    cell.alignment = { horizontal: colNum === 1 ? 'left' : 'center', vertical: 'middle' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
    cell.border = KPI_BORDER_THIN
    // Formatação condicional do TEMPO (col 8, 11, 14)
    if ([8, 11, 14].includes(colNum) && typeof cell.value === 'number') {
      const tempo = cell.value as number
      if (tempo <= 60) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_COLORS.TEMPO_GOOD } }
      else if (tempo <= 120) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_COLORS.TEMPO_MEDIUM } }
      else cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_COLORS.TEMPO_HIGH } }
    }
  })
}
```

- [ ] **Step 3: Smoke test — gerar XLSX vazio**

```javascript
// scripts/smoke-gerador-kpi.mjs
import { gerarKpi } from '../src/lib/kpi/gerador-kpi.ts'
import { writeFile } from 'node:fs/promises'

const out = await gerarKpi({
  rede_id: 'PRINCESA',
  data: '2026-05-15',
  linhas: [],
})
await writeFile('/tmp/kpi-test.xlsx', out)
console.log('OK → /tmp/kpi-test.xlsx (vazio, só header)')
```

Run: `cd /c/Users/media/dev/kpi-transmonseg && npx tsx scripts/smoke-gerador-kpi.mjs`
Expected: arquivo gerado em /tmp; abrir manualmente no Excel pra ver header amarelo + logo + linhas das 26 lojas Princesa em cinza italic.

- [ ] **Step 4: Commit**

```bash
git add src/lib/kpi/template-loader.ts src/lib/kpi/gerador-kpi.ts scripts/smoke-gerador-kpi.mjs
git commit -m "feat(kpi): gerador-kpi core com header e linhas placeholder"
```

---

## Task 6: Aba BASE para Zona Sul

**Files:**
- Create: `src/lib/kpi/zona-sul-base.ts`

- [ ] **Step 1: Implementar**

```typescript
// src/lib/kpi/zona-sul-base.ts
import ExcelJS from 'exceljs'
import { KPI_COLORS, KPI_FONTS, KPI_BORDER_THIN } from './kpi-styles'

// Mapeamento filial → bairro/local (do KPI ZONA SUL original, vídeo William)
export const FILIAIS_ZONA_SUL: Array<{ numero: number | string; nome: string }> = [
  { numero: 1, nome: 'Zona Sul Loja 01 - Ipanema' },
  { numero: 2, nome: 'Zona Sul Loja 02 - Ipanema' },
  { numero: 3, nome: 'Zona Sul Loja 03 - Copacabana I' },
  { numero: 4, nome: 'Zona Sul Loja 04 - Copacabana II' },
  { numero: 5, nome: 'Zona Sul Loja 05 - Copacabana III' },
  { numero: 6, nome: 'Zona Sul Loja 06 - Gávea' },
  { numero: 7, nome: 'Zona Sul Loja 07 - Leblon' },
  { numero: 8, nome: 'Zona Sul Loja 08 - Leblon' },
  { numero: 9, nome: 'Zona Sul Loja 09 - Ipanema' },
  { numero: 10, nome: 'Zona Sul Loja 10 - Recreio' },
  { numero: 11, nome: 'Zona Sul Loja 11 - Leblon' },
  { numero: 12, nome: 'Zona Sul Loja 12 - Leme' },
  { numero: 13, nome: 'Zona Sul Loja 13 - Angra' },
  { numero: 14, nome: 'Zona Sul Loja 14 - Leblon' },
  { numero: 15, nome: 'Zona Sul Loja 15 - Leblon' },
  { numero: 16, nome: 'Zona Sul Loja 16 - Leblon' },
  { numero: 17, nome: 'Zona Sul Loja 17 - Barra' },
  { numero: 18, nome: 'Zona Sul Loja 18 - Copacabana' },
  { numero: 19, nome: 'Zona Sul Loja 19 - Copacabana' },
  { numero: 20, nome: 'Zona Sul Loja 20 - Botafogo' },
  { numero: 21, nome: 'Zona Sul Loja 21 - Flamengo' },
  { numero: 22, nome: 'Zona Sul Loja 22 - São Conrado' },
  { numero: 23, nome: 'Zona Sul Loja 23 - Barra' },
  { numero: 24, nome: 'Zona Sul Loja 24 - Penha' },
  { numero: 25, nome: 'Zona Sul Loja 25 - Jardim Botânico' },
  { numero: 26, nome: 'Zona Sul Loja 26 - Copacabana' },
  { numero: 27, nome: 'Zona Sul Loja 27 - Ipanema' },
  { numero: 28, nome: 'Zona Sul Loja 28 - Urca' },
  { numero: 29, nome: 'Zona Sul Loja 29 - Flamengo' },
  { numero: 30, nome: 'Zona Sul Loja 30 - Laranjeiras' },
  { numero: 31, nome: 'Zona Sul Loja 31 - Jardim Botânico' },
  { numero: 32, nome: 'Zona Sul Loja 32 - Laranjeiras' },
  { numero: 33, nome: 'Zona Sul Loja 33 - Humaitá' },
  { numero: 34, nome: 'Zona Sul Loja 34 - Barra' },
  { numero: 35, nome: 'Zona Sul Loja 35 - Barra' },
  { numero: 36, nome: 'Zona Sul Loja 36 - Botafogo' },
  { numero: 37, nome: 'Zona Sul Loja 37 - Botafogo' },
  { numero: 38, nome: 'Zona Sul Loja 38 - Copacabana' },
  { numero: 39, nome: 'Zona Sul Loja 39 - Centro' },
  { numero: 40, nome: 'Zona Sul Loja 40 - Ipanema' },
  { numero: 1129, nome: 'Zona Sul Olaria' },
  { numero: 'MEGA BOX 01', nome: 'MEGA BOX 01 - Olaria' },
  { numero: 'MEGA BOX 02', nome: 'MEGA BOX 02 - Olaria' },
]

export function gerarAbaBaseZonaSul(wb: ExcelJS.Workbook): void {
  const existente = wb.getWorksheet('BASE')
  if (existente) wb.removeWorksheet(existente.id)

  const ws = wb.addWorksheet('BASE')
  ws.columns = [
    { width: 5 },   // A vazia (padding)
    { width: 5 },   // B vazia
    { width: 14 }, // C = LOJA NÚMERO
    { width: 45 }, // D = NOME COMPLETO
    { width: 14 }, // E = input manual (vazio)
    { width: 45 }, // F = PROCV resolve
  ]

  // Header
  const h = ws.getRow(1)
  h.values = ['', '', 'LOJA', 'NOME', 'INPUT', 'NOME PROCV']
  h.height = 30
  h.eachCell((cell, col) => {
    if (col < 3) return
    cell.font = KPI_FONTS.HEADER
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_COLORS.BRAND_BLUE } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })

  // Dados
  FILIAIS_ZONA_SUL.forEach((f, i) => {
    const r = ws.getRow(2 + i)
    r.getCell('C').value = f.numero
    r.getCell('D').value = f.nome
    r.getCell('F').value = { formula: `IFERROR(VLOOKUP(E${2+i},C:D,2,FALSE),"")` }
    r.eachCell({ includeEmpty: false }, (cell) => {
      cell.font = KPI_FONTS.BODY
      cell.border = KPI_BORDER_THIN
      cell.alignment = { vertical: 'middle' }
    })
  })
}
```

- [ ] **Step 2: Integrar no gerador**

Modificar `gerarKpi` em `src/lib/kpi/gerador-kpi.ts` adicionando logo após criar a aba do dia:

```typescript
  // Se Zona Sul, garantir aba BASE
  if (input.rede_id === 'ZONA_SUL') {
    const { gerarAbaBaseZonaSul } = await import('./zona-sul-base')
    gerarAbaBaseZonaSul(wb)
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/kpi/zona-sul-base.ts src/lib/kpi/gerador-kpi.ts
git commit -m "feat(kpi): aba BASE para Zona Sul com PROCV"
```

---

## Task 7: Wire-up no /api/kpi/gerar (regenera todas as redes)

**Files:**
- Modify: `src/app/api/kpi/gerar/route.ts`

- [ ] **Step 1: Ler estado atual da rota**

Run: `cat src/app/api/kpi/gerar/route.ts` (manual ou pelo skill Read)

- [ ] **Step 2: Substituir conteúdo**

```typescript
// src/app/api/kpi/gerar/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { gerarKpi } from '@/lib/kpi/gerador-kpi'
import { consolidaKpi } from '@/lib/kpi/consolidador'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const { data, redes } = await req.json()
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return new NextResponse('Data inválida (use YYYY-MM-DD)', { status: 400 })
  }
  const svc = createServiceClient()
  const mesPath = data.slice(0, 7) // YYYY-MM
  const results: Array<{ rede_id: string; ok: boolean; url?: string; err?: string }> = []

  // Lista de redes a gerar
  const { data: kpis } = await svc.from('kpis').select('rede_id').eq('data', data)
  const redesAlvo: string[] = redes?.length ? redes : [...new Set((kpis ?? []).map(k => k.rede_id))]

  for (const rede_id of redesAlvo) {
    try {
      // Consolida linhas
      const { data: rotas } = await svc
        .from('kpi_rotas')
        .select('id, escala_linha_id, rede_id, placa_norm, saida_cd, paradas_json, anomalias_codigos')
        .eq('data', data).eq('rede_id', rede_id)
      const { data: escalaLinhas } = await svc
        .from('escala_linhas')
        .select('id, rede_id, loja_nome_raw, placa_norm, motorista_nome, motorista_codigo, carro_ordem')
        .in('id', (rotas ?? []).map(r => r.escala_linha_id))
      const linhas = consolidaKpi(rotas ?? [], escalaLinhas ?? [])

      // Tenta carregar XLSX existente do mês
      const arquivoPath = `${mesPath}/${rede_id}.xlsx`
      let arquivoExistente: Buffer | null = null
      const { data: existing } = await svc.storage.from('kpi-gerado').download(arquivoPath)
      if (existing) {
        arquivoExistente = Buffer.from(await existing.arrayBuffer())
      }

      const xlsxBuffer = await gerarKpi({ rede_id, data, linhas, arquivoExistente })

      // Upload
      await svc.storage.from('kpi-gerado').upload(arquivoPath, xlsxBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      })
      const { data: signed } = await svc.storage.from('kpi-gerado').createSignedUrl(arquivoPath, 60 * 60)

      results.push({ rede_id, ok: true, url: signed?.signedUrl })
    } catch (e) {
      results.push({ rede_id, ok: false, err: (e as Error).message })
    }
  }
  return NextResponse.json({ data, results })
}
```

- [ ] **Step 3: Criar bucket no Supabase**

Verificar se bucket `kpi-gerado` existe. Se não, criar:

```bash
# script one-shot
cat <<'EOF' > /tmp/create-bucket.mjs
import 'dotenv/config'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
config({ path: resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data, error } = await sb.storage.createBucket('kpi-gerado', { public: false })
console.log(error ?? 'OK created bucket kpi-gerado')
EOF
cd /c/Users/media/dev/kpi-transmonseg && npx tsx /tmp/create-bucket.mjs
```

Expected: `OK created bucket kpi-gerado` (ou warning de já existe — ignorar).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/kpi/gerar/route.ts
git commit -m "feat(api): kpi/gerar regenera multi-rede acumulando no XLSX do mês"
```

---

## Task 8: Script de teste com dados reais 15/05

**Files:**
- Create: `scripts/test-gerador-kpi.mjs`

- [ ] **Step 1: Criar script**

```javascript
// scripts/test-gerador-kpi.mjs
import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { gerarKpi } from '../src/lib/kpi/gerador-kpi.ts'
import { consolidaKpi } from '../src/lib/kpi/consolidador.ts'

dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

const data = '2026-05-15'
const out = '/tmp/kpi-test'
await mkdir(out, { recursive: true })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data: kpis } = await sb.from('kpis').select('rede_id').eq('data', data)
const redes = [...new Set(kpis.map(k => k.rede_id))]
console.log(`Gerando ${redes.length} KPIs...`)

for (const rede_id of redes) {
  const { data: rotas } = await sb.from('kpi_rotas')
    .select('id, escala_linha_id, rede_id, placa_norm, saida_cd, paradas_json, anomalias_codigos')
    .eq('data', data).eq('rede_id', rede_id)
  const escalaIds = rotas.map(r => r.escala_linha_id)
  const { data: linhasEsc } = await sb.from('escala_linhas')
    .select('id, rede_id, loja_nome_raw, placa_norm, motorista_nome, motorista_codigo, carro_ordem')
    .in('id', escalaIds.length ? escalaIds : ['__none__'])
  const linhas = consolidaKpi(rotas ?? [], linhasEsc ?? [])
  const buf = await gerarKpi({ rede_id, data, linhas })
  await writeFile(`${out}/KPI ${rede_id}.xlsx`, buf)
  console.log(`  ✓ ${rede_id}: ${linhas.length} linhas`)
}
console.log(`\nAbrir: ${out}`)
```

- [ ] **Step 2: Rodar**

Run: `cd /c/Users/media/dev/kpi-transmonseg && npx tsx scripts/test-gerador-kpi.mjs`
Expected: 15 XLSXs em `/tmp/kpi-test/`

- [ ] **Step 3: Inspeção visual**

Abrir `KPI PRINCESA.xlsx` no Excel. Verificar:
- ✅ Header amarelo com logo TRANSMONSEG nas pontas
- ✅ Subtítulo "BENASSI · Sexta-feira, 15 de Maio de 2026"
- ✅ Header azul `#1F4E78` em branco
- ✅ Linhas de dados com zebra suave
- ✅ TEMPO LOJA colorido (verde/amarelo/pêssego)
- ✅ Linhas com anomalia HIGH com fundo vermelho suave
- ✅ Coluna OBS com texto ⚠
- ✅ Lojas que não rodaram em italic cinza

Abrir `KPI ZONA_SUL.xlsx`:
- ✅ Aba BASE com 42 filiais + MEGA BOX
- ✅ PROCV funcionando

- [ ] **Step 4: Commit**

```bash
git add scripts/test-gerador-kpi.mjs
git commit -m "test(kpi): script de smoke test com dados reais 15/05"
```

---

## Task 9: Substituir gerador-xlsx.ts antigo (compatibilidade)

**Files:**
- Modify: `src/lib/kpi/gerador-xlsx.ts`

- [ ] **Step 1: Substituir conteúdo do gerador-xlsx.ts (compat shim)**

```typescript
// src/lib/kpi/gerador-xlsx.ts — agora é só um shim para gerador-kpi.ts
import { gerarKpi } from './gerador-kpi'
import type { KpiLinha } from '@/lib/types/kpi'

/** @deprecated Use gerarKpi() de ./gerador-kpi */
export async function gerarKpiXlsx(params: {
  rede_id: string
  rede_nome: string
  data: string
  linhas: KpiLinha[]
}): Promise<Buffer> {
  return gerarKpi({
    rede_id: params.rede_id,
    data: params.data,
    linhas: params.linhas,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/kpi/gerador-xlsx.ts
git commit -m "refactor(kpi): gerador-xlsx vira shim de gerador-kpi"
```

---

## Task 10: E2E pelo /api/kpi/gerar

**Files:**
- (apenas execução, sem arquivos)

- [ ] **Step 1: Iniciar dev server**

Run: `cd /c/Users/media/dev/kpi-transmonseg && npm run dev` (background)

- [ ] **Step 2: Chamar a rota**

```bash
curl -X POST http://localhost:3000/api/kpi/gerar \
  -H "Content-Type: application/json" \
  -d '{"data":"2026-05-15"}'
```

Expected: JSON com `results: [{rede_id, ok: true, url: "https://..."}, ...]`

- [ ] **Step 3: Baixar e validar 3 redes (Princesa, Zona Sul, Prezunic)**

Abrir as URLs no browser. Confirmar XLSX abre, header amarelo, dados corretos.

- [ ] **Step 4: Commit final do plano**

```bash
git add -A
git commit -m "feat(kpi): gerador-kpi end-to-end com 15 redes processadas"
git push
```

---

## Self-Review do plano

**1. Spec coverage:**
- ✅ 16 arquivos por mês: Task 7 + Task 8
- ✅ Layout amarelo + logo: Task 1, Task 5
- ✅ Subtítulo BENASSI: Task 5 (preencherAba)
- ✅ Frozen header + zebra: Task 5
- ✅ Multi-loja (LOJA 2/3): Task 4 (detectarMaxLojasPorRota) + Task 5
- ✅ 2º carro: Task 5 (sufixo em motorista)
- ✅ Anomalias OBS + linha vermelha: Task 3 + Task 5
- ✅ Aba BASE Zona Sul: Task 6
- ✅ Filiais não rodadas: Task 5 (escreverLinhaPlaceholder)
- ✅ Storage por mês: Task 7
- ✅ Regen apenas dia atual: Task 5 (removeWorksheet do nome do dia)

**2. Placeholder scan:** Sem TBDs. Código completo em cada step.

**3. Type consistency:** `gerarKpi` recebe `GerarKpiInput` consistentemente. `KpiLinha` reutilizado de types/kpi.ts existente.

**4. Riscos:**
- Logo extraída do template pode não estar na primeira posição de `wb.model.media`. Mitigação no Task 1: imprime todas as imagens encontradas, dev escolhe manualmente se necessário.
- `consolidaKpi` precisa existir e funcionar (já existe em src/lib/kpi/consolidador.ts).

---

**Plano completo.** Próximo: executar via subagent-driven-development ou inline.
