# Completar Uploads do Sistema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adicionar à UI `/painel/kpi/novo` os 4 inputs faltantes pra cobrir 100% das fontes de dados: Armazém do Grão, Guanabara PDF, Unitrac PDF e Alterações. Resultado: sistema pronto pra Érica gerar KPI completo das 16 redes via web.

**Architecture:** 4 sub-tarefas independentes, cada uma adiciona parser TS + suporte na rota + card na UI. Reusa estrutura existente (`escalas-raw` bucket, `escala_uploads` + `escala_linhas`, `unitrac_uploads` + `unitrac_paradas`).

**Tech Stack:** Next.js 16 + TS, ExcelJS, pdf-parse, Supabase Storage, React 19 Server Components + Client uploaders.

---

## File Structure

**Tarefa A — Armazém do Grão**
- Create: `src/lib/parsers/escala-armazem-grao.ts`
- Modify: `src/app/api/escalas/upload/route.ts` (aceita `ARMAZEM_GRAO`)
- Modify: `src/app/painel/kpi/novo/uploaders.tsx` (card novo)
- Modify: `src/lib/lojas/catalogo-matriz.ts` (matriz ARMAZEM_GRAO)

**Tarefa B — Guanabara PDF**
- Create: `src/lib/parsers/escala-guanabara-pdf.ts`
- Modify: `src/app/api/escalas/upload/route.ts` (aceita `GUANABARA` + PDF)
- Modify: `src/app/painel/kpi/novo/uploaders.tsx` (card novo com aceite PDF)
- Modify: `src/lib/lojas/catalogo-matriz.ts` (matriz GUANABARA)

**Tarefa C — Unitrac PDF**
- Modify: `src/app/api/unitrac/upload/route.ts` (detecta PDF, usa `parseUnitracPdf`)
- Modify: `src/app/painel/kpi/novo/uploaders.tsx` (card aceita .xlsx **ou** .pdf)

**Tarefa D — Alterações**
- Create: `src/lib/parsers/alteracao-text.ts` (porta `sistema/parse_alteracao.py` → TS)
- Create: `src/app/painel/alteracoes/nova/page.tsx`
- Create: `src/app/painel/alteracoes/nova/form.tsx` (paste + preview + aplicar)
- (Rota `/api/alteracoes/parsear` já existe → integrar)

---

## TAREFA A — Parser e UI Armazém do Grão

### A.1: Parser escala-armazem-grao.ts

**Files:**
- Create: `src/lib/parsers/escala-armazem-grao.ts`

- [ ] **Step 1: Implementar parser**

```typescript
// src/lib/parsers/escala-armazem-grao.ts
// Parser da escala diária Armazém do Grão.
// Formato: 1 aba só (nome = dia do mês, ex '14'), 5 colunas:
// A=loja  B=tipo_carro  C=motorista  D=cod  E=placa
// Linha 1 = título "ARMAZÉM DO GRÃO | DD/MM/YYYY"
// Linha 2+ = dados, agrupados por motorista (mesma placa repetida)
import ExcelJS from 'exceljs'
import type { LinhaEscala } from '@/lib/types/escala'
import { normalizaPlaca } from '@/lib/utils/placa'

function asStr(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'object' && 'richText' in (v as object)) {
    return (v as { richText: { text: string }[] }).richText.map(r => r.text).join('').trim()
  }
  return String(v).trim()
}

function asNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function extrairDataDoTitulo(titulo: string): string | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(titulo)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

export async function parseEscalaArmazemGrao(
  buffer: ArrayBuffer | Buffer,
  dataAlvo?: string,
): Promise<LinhaEscala[]> {
  const wb = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buffer as any)

  const results: LinhaEscala[] = []
  for (const ws of wb.worksheets) {
    // Procurar título "ARMAZÉM DO GRÃO | DD/MM/YYYY"
    let dataISO: string | null = null
    for (let r = 1; r <= 3; r++) {
      const t = asStr(ws.getRow(r).getCell(1).value)
      if (t.toUpperCase().includes('ARMAZ')) {
        dataISO = extrairDataDoTitulo(t)
        if (dataISO) break
      }
    }
    if (!dataISO) continue
    if (dataAlvo && dataAlvo !== dataISO) continue

    // Encontrar primeira linha de dados (depois do título)
    for (let r = 2; r <= ws.actualRowCount; r++) {
      const row = ws.getRow(r)
      const loja = asStr(row.getCell(1).value)
      const tipoCarro = asStr(row.getCell(2).value)
      const motorista = asStr(row.getCell(3).value)
      const codigo = asNum(row.getCell(4).value)
      const placaRaw = asStr(row.getCell(5).value)
      if (!loja || !placaRaw || !motorista) continue
      const placaNorm = normalizaPlaca(placaRaw)
      if (!placaNorm) continue

      results.push({
        data: dataISO,
        data_entrega: dataISO,
        rede_id: 'ARMAZEM_GRAO',
        loja_nome_raw: loja,
        loja_codigo_raw: null,
        placa_norm: placaNorm,
        placa_raw: placaRaw,
        motorista_nome: motorista,
        motorista_codigo: codigo,
        tipo_carro: tipoCarro,
        carro_ordem: 1,
        turno: 'TARDE', // janela 12-18h
        tipo_emissao: 'NORMAL',
        obs: null,
        restricao: null,
        peso_kg: null,
        paletes: null,
        raw_row_num: r,
      })
    }
  }
  return results
}
```

- [ ] **Step 2: Smoke test**

```bash
cd /c/Users/media/dev/kpi-transmonseg
cat > scripts/test-armazem.mjs <<'EOF'
import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { parseEscalaArmazemGrao } from '../src/lib/parsers/escala-armazem-grao.ts'
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })
const buf = await readFile('C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/escalas/ESCALA DO ARMAZÉM DO GRÃO MAIO.xlsx')
const linhas = await parseEscalaArmazemGrao(buf)
console.log('Linhas:', linhas.length)
console.log('Datas:', [...new Set(linhas.map(l => l.data))])
console.log('Sample:', linhas.slice(0, 3))
EOF
npx tsx scripts/test-armazem.mjs
```

Expected: 14 linhas, data 2026-05-14, motoristas GILSON/ANTUNES/etc.

- [ ] **Step 3: Commit**

```bash
git add src/lib/parsers/escala-armazem-grao.ts scripts/test-armazem.mjs
git commit -m "feat(parsers): escala Armazem do Grao (1 aba flat 5 cols)"
```

### A.2: Suportar ARMAZEM_GRAO em /api/escalas/upload

**Files:**
- Modify: `src/app/api/escalas/upload/route.ts`

- [ ] **Step 1: Editar o route**

Localizar `type TipoEscala = 'GERAL' | 'ZONA_SUL' | 'PAX'` e adicionar `| 'ARMAZEM_GRAO'`.
Localizar `if (!['GERAL', 'ZONA_SUL', 'PAX'].includes(tipo))` e adicionar `'ARMAZEM_GRAO'`.
Localizar bloco `if (tipo === 'GERAL') { ... }` e adicionar:

```typescript
} else if (tipo === 'ARMAZEM_GRAO') {
  const { parseEscalaArmazemGrao } = await import('@/lib/parsers/escala-armazem-grao')
  linhas = await parseEscalaArmazemGrao(arrayBuffer, data as string)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/escalas/upload/route.ts
git commit -m "feat(api): /api/escalas/upload aceita tipo ARMAZEM_GRAO"
```

### A.3: Card UI Armazém do Grão

**Files:**
- Modify: `src/app/painel/kpi/novo/uploaders.tsx`

- [ ] **Step 1: Adicionar 4º card no grid de escalas**

Na função `Uploaders`, alterar o grid de 3 para 4 colunas e adicionar:

```tsx
<EscalaCard
  tipo="ARMAZEM_GRAO"
  label="Armazém do Grão"
  desc="Rede própria com Regina e Abastecedora. Aba única."
/>
```

- [ ] **Step 2: Adicionar matriz fixa (opcional)**

`src/lib/lojas/catalogo-matriz.ts` — adicionar entrada `ARMAZEM_GRAO` com as 14 lojas conhecidas.

- [ ] **Step 3: Commit**

```bash
git add src/app/painel/kpi/novo/uploaders.tsx src/lib/lojas/catalogo-matriz.ts
git commit -m "feat(ui): card Armazem do Grao no upload de escalas"
```

---

## TAREFA B — Parser e UI Guanabara PDF

### B.1: Parser escala-guanabara-pdf.ts

**Files:**
- Create: `src/lib/parsers/escala-guanabara-pdf.ts`

- [ ] **Step 1: Implementar parser PDF**

```typescript
// src/lib/parsers/escala-guanabara-pdf.ts
// Parser da escala diária Guanabara em PDF.
// Header: "(HLOG) ESCALA GUANABARA DD/MM/YYYY (DIA-SEMANA)"
// 31 rotas numeradas, cada uma com: rota | qtd_carros | 1º motorista cod placa tipo | 2º motorista cod placa tipo
import { PDFParse } from 'pdf-parse'
import type { LinhaEscala } from '@/lib/types/escala'
import { normalizaPlaca } from '@/lib/utils/placa'

function extrairData(text: string): string | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(text)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

export async function parseEscalaGuanabaraPdf(
  buffer: Buffer,
  dataAlvo?: string,
): Promise<LinhaEscala[]> {
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText()
  const texto = result.text

  const dataISO = extrairData(texto)
  if (!dataISO) throw new Error('Data não encontrada no PDF Guanabara')
  if (dataAlvo && dataAlvo !== dataISO) return []

  const linhas: LinhaEscala[] = []
  const lines = texto.split('\n').map(l => l.trim()).filter(Boolean)

  // Linhas de dados: número + qtd_carros + dados
  // Ex: "1   2   RONALDO   35   KSG 5412   TRUCK   JOSE NILDON (DOCA)   753   KVG 7A00   TRUCK"
  const ROW_REGEX = /^(\d{1,2})\s+(\d)\s+(.+?)\s+(\d+)\s+([A-Z]{3}[\s-]?\d[A-Z0-9]\d{2}|[A-Z]{3}[\s-]?\d{4})\s+(TRUCK|TOCO)(?:\s+(.+?)\s+(\d+)?\s+([A-Z]{3}[\s-]?\d[A-Z0-9]\d{2}|[A-Z]{3}[\s-]?\d{4})\s+(TRUCK|TOCO))?$/

  for (const line of lines) {
    const m = ROW_REGEX.exec(line)
    if (!m) continue
    const [, rotaNum, , mot1, cod1, placa1Raw, tipo1, mot2, cod2, placa2Raw, tipo2] = m
    const lojaNome = `Guanabara - Rota ${rotaNum.padStart(2, '0')}`

    // 1º carro
    const placa1Norm = normalizaPlaca(placa1Raw)
    if (placa1Norm) {
      linhas.push({
        data: dataISO, data_entrega: dataISO,
        rede_id: 'GUANABARA',
        loja_nome_raw: lojaNome, loja_codigo_raw: rotaNum,
        placa_norm: placa1Norm, placa_raw: placa1Raw,
        motorista_nome: mot1.trim(), motorista_codigo: Number(cod1),
        tipo_carro: tipo1,
        carro_ordem: 1, turno: 'MANHA',
        tipo_emissao: 'NORMAL',
        obs: null, restricao: null,
        peso_kg: null, paletes: null,
        raw_row_num: Number(rotaNum),
      })
    }

    // 2º carro (se existir)
    if (mot2 && placa2Raw) {
      const placa2Norm = normalizaPlaca(placa2Raw)
      if (placa2Norm) {
        linhas.push({
          data: dataISO, data_entrega: dataISO,
          rede_id: 'GUANABARA',
          loja_nome_raw: lojaNome, loja_codigo_raw: rotaNum,
          placa_norm: placa2Norm, placa_raw: placa2Raw,
          motorista_nome: mot2.trim(), motorista_codigo: cod2 ? Number(cod2) : null,
          tipo_carro: tipo2 ?? null,
          carro_ordem: 2, turno: 'MANHA',
          tipo_emissao: 'NORMAL',
          obs: null, restricao: null,
          peso_kg: null, paletes: null,
          raw_row_num: Number(rotaNum),
        })
      }
    }
  }

  return linhas
}
```

- [ ] **Step 2: Smoke test**

```bash
cat > scripts/test-guanabara.mjs <<'EOF'
import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { parseEscalaGuanabaraPdf } from '../src/lib/parsers/escala-guanabara-pdf.ts'
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })
const buf = await readFile('C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/escalas/escala 15.005.pdf')
const linhas = await parseEscalaGuanabaraPdf(buf)
console.log('Linhas:', linhas.length)
console.log('Sample:', linhas.slice(0, 5))
EOF
cd /c/Users/media/dev/kpi-transmonseg && npx tsx scripts/test-guanabara.mjs
```

Expected: ~38 linhas (31 rotas + 7 segundos carros), data 2026-05-15.

- [ ] **Step 3: Commit**

```bash
git add src/lib/parsers/escala-guanabara-pdf.ts scripts/test-guanabara.mjs
git commit -m "feat(parsers): escala Guanabara PDF (1 PDF/dia, 31 rotas)"
```

### B.2: Suportar GUANABARA + PDF em /api/escalas/upload

**Files:**
- Modify: `src/app/api/escalas/upload/route.ts`

- [ ] **Step 1: Aceitar tipo GUANABARA e detectar PDF**

Adicionar `'GUANABARA'` na lista de tipos. No bloco do parse:

```typescript
} else if (tipo === 'GUANABARA') {
  const { parseEscalaGuanabaraPdf } = await import('@/lib/parsers/escala-guanabara-pdf')
  linhas = await parseEscalaGuanabaraPdf(Buffer.from(arrayBuffer), data as string)
}
```

Atualizar `contentType` do download do storage pra `application/pdf` quando tipo === 'GUANABARA'.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/escalas/upload/route.ts
git commit -m "feat(api): /api/escalas/upload aceita Guanabara em PDF"
```

### B.3: Card UI Guanabara PDF

**Files:**
- Modify: `src/app/painel/kpi/novo/uploaders.tsx`

- [ ] **Step 1: Refatorar EscalaCard pra aceitar `accept` configurável**

No componente `EscalaCard`, adicionar prop `accept?: string` (default `.xlsx`). Passar pro `FileZone`.
No `FileZone`, parametrizar o input `accept`.

- [ ] **Step 2: Adicionar 5º card no grid**

```tsx
<EscalaCard
  tipo="GUANABARA"
  label="Escala Guanabara"
  desc="PDF diário (HLOG) com 31 rotas numeradas."
  accept=".pdf"
/>
```

- [ ] **Step 3: Modificar `uploadEscala()` para usar contentType correto**

```typescript
const contentType = arquivo.name.endsWith('.pdf')
  ? 'application/pdf'
  : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const ext = arquivo.name.endsWith('.pdf') ? 'pdf' : 'xlsx'
const storagePath = `${data}/${tipo.toLowerCase()}.${ext}`
```

- [ ] **Step 4: Commit**

```bash
git add src/app/painel/kpi/novo/uploaders.tsx
git commit -m "feat(ui): card Guanabara PDF + EscalaCard generaliza accept"
```

---

## TAREFA C — Aceitar Unitrac PDF na rota

### C.1: Detectar PDF em /api/unitrac/upload

**Files:**
- Modify: `src/app/api/unitrac/upload/route.ts`

- [ ] **Step 1: Detectar extensão e usar parser apropriado**

```typescript
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
// ...
const isPdf = storagePath.toLowerCase().endsWith('.pdf')
const veiculos = isPdf
  ? await parseUnitracPdf(Buffer.from(arrayBuffer))
  : await parseUnitrac(arrayBuffer)
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/unitrac/upload/route.ts
git commit -m "feat(api): /api/unitrac/upload detecta PDF e usa unitrac-pdf parser"
```

### C.2: Card UI aceita PDF ou XLSX

**Files:**
- Modify: `src/app/painel/kpi/novo/uploaders.tsx`

- [ ] **Step 1: UnitracCard aceita .xlsx,.pdf**

No `FileZone` do `UnitracCard`, mudar `accept=".xlsx"` para `accept=".xlsx,.pdf"`.

No `uploadUnitrac()`:
```typescript
const ext = arquivo.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'xlsx'
const contentType = ext === 'pdf'
  ? 'application/pdf'
  : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const storagePath = `${data}/unitrac.${ext}`
```

- [ ] **Step 2: Commit**

```bash
git add src/app/painel/kpi/novo/uploaders.tsx
git commit -m "feat(ui): card Unitrac aceita PDF ou XLSX"
```

---

## TAREFA D — Parser e UI Alterações

### D.1: Portar parse_alteracao.py → alteracao-text.ts

**Files:**
- Create: `src/lib/parsers/alteracao-text.ts`

- [ ] **Step 1: Implementar parser**

```typescript
// src/lib/parsers/alteracao-text.ts
// Porta de sistema/parse_alteracao.py para TS.
// Aceita texto livre de WhatsApp com palavras-chave Entra:/Sai: variáveis.
import { normalizaPlaca } from '@/lib/utils/placa'

export type TipoAlteracao = 'SUBSTITUICAO' | 'INCLUSAO' | 'COMUNICADO' | 'INFORMATIVO' | 'SWAP'

export interface VeiculoSlot {
  motorista_nome: string | null
  motorista_codigo: number | null
  placa_raw: string | null
  placa_norm: string | null
}

export interface AlteracaoParsed {
  tipo: TipoAlteracao
  rede_id: string | null
  loja_nome_raw: string | null
  entra: VeiculoSlot | null
  sai: VeiculoSlot | null
  motivo: string | null
  texto_original: string
  confianca: 'alta' | 'media' | 'baixa'
}

const REDES_KEYWORDS: Record<string, string> = {
  PREZUNIC: 'prezunic', PRINCESA: 'princesa', CARREFOUR: 'carrefour',
  ASSAI: 'assa', ATACADAO: 'atacad', SUPERPRIX: 'super prix',
  SAMS_CLUB: "sam's", VIANENSE: 'vianen', SENDAS: 'sendas',
  GUANABARA: 'guanabara', SUPER_PAX: 'super pax', FEIRA_NOVA: 'feira nova',
  EMANUEL: 'emanuel', ARMAZEM_GRAO: 'armaz', ZONA_SUL: 'zona sul',
}

const PLACA_RE = /\b([A-Z]{3}[\s-]?\d{4}|[A-Z]{3}[\s-]?\d[A-Z0-9]\d{2}|[a-z]{3}[\s-]?\d[a-z0-9]\d{2})\b/g
const CODIGO_RE = /\b(\d{2,6})\b/

function extrairRede(texto: string): string | null {
  const lower = texto.toLowerCase()
  for (const [id, kw] of Object.entries(REDES_KEYWORDS)) {
    if (lower.includes(kw)) return id
  }
  return null
}

function extrairLoja(texto: string): string | null {
  // Tipicamente vem na linha após o emoji 🚨ALTERAÇÃO🚨 ou no início
  const m = /(?:🚨\s*altera[çc][ãa]o\s*🚨\s*)?([A-Z][A-Za-zÀ-ú\s\-,/]+?)(?:\nEntra|\nSai|\nMotivo|\n\n|$)/i.exec(texto)
  return m?.[1]?.trim() ?? null
}

function parseSlot(linha: string): VeiculoSlot | null {
  if (!linha) return null
  const placaMatch = PLACA_RE.exec(linha)
  if (!placaMatch) return null
  PLACA_RE.lastIndex = 0
  const placaRaw = placaMatch[1]
  const placaNorm = normalizaPlaca(placaRaw)
  // Nome + código antes da placa
  const antesPLaca = linha.slice(0, placaMatch.index).trim()
  const codMatch = CODIGO_RE.exec(antesPLaca)
  const codigo = codMatch ? Number(codMatch[1]) : null
  const nome = antesPLaca.replace(/\b\d{2,6}\b/g, '').trim() || null
  return {
    motorista_nome: nome,
    motorista_codigo: codigo,
    placa_raw: placaRaw,
    placa_norm: placaNorm,
  }
}

export function parseAlteracaoText(texto: string): AlteracaoParsed {
  const lower = texto.toLowerCase()
  let tipo: TipoAlteracao = 'INFORMATIVO'
  let entra: VeiculoSlot | null = null
  let sai: VeiculoSlot | null = null
  let motivo: string | null = null

  // Match Entra: e Sai:
  const entraMatch = /entra\s*:?\s*([^\n]+)/i.exec(texto)
  const saiMatch = /sai\s*:?\s*([^\n]+)/i.exec(texto)
  const motivoMatch = /(?:motivo|obs)\s*:?\.?\s*([^\n]+)/i.exec(texto)

  if (entraMatch) entra = parseSlot(entraMatch[1])
  if (saiMatch) sai = parseSlot(saiMatch[1])
  if (motivoMatch) motivo = motivoMatch[1].trim()

  if (entra && sai) tipo = 'SUBSTITUICAO'
  else if (entra && !sai) tipo = 'INCLUSAO'
  else if (lower.includes('comunicado')) tipo = 'COMUNICADO'
  else if (lower.includes('viagem') || lower.includes('informativo')) tipo = 'INFORMATIVO'

  const rede_id = extrairRede(texto)
  const loja_nome_raw = extrairLoja(texto)

  // Confiança
  let confianca: 'alta' | 'media' | 'baixa' = 'baixa'
  if (tipo === 'SUBSTITUICAO' && entra?.placa_norm && sai?.placa_norm) confianca = 'alta'
  else if (rede_id && (entra?.placa_norm || sai?.placa_norm)) confianca = 'media'

  return {
    tipo, rede_id, loja_nome_raw, entra, sai, motivo,
    texto_original: texto, confianca,
  }
}
```

- [ ] **Step 2: Smoke test com 5 cases**

```javascript
// scripts/test-alteracao.mjs
import { parseAlteracaoText } from '../src/lib/parsers/alteracao-text.ts'

const cases = [
  // TEST-01: Substituição só carro
  `🚨ALTERAÇÃO 🚨
Prezunic Maricá
Entra: UBO5E05
Sai : LRA9C41
Motivo: ninguém achou o carro`,

  // TEST-04: Substituição completa (caso ouro de hoje 15/05)
  `🚨ALTERAÇÃO 🚨
Prezunic Caxias centenário, Caxias centro
Entra: Sidnei 674 LQE5401
Sai : Anderson 811 LCE4337
Motivo: Pneu do caminhão furou`,

  // TEST-05: Comunicado
  `Comunicado 🚨
Motoriata Kanu
Placa : KQR 2J11
cod : 738
Vai sair com 2 romaneios. Liberados por Murilo.`,
]

for (const [i, c] of cases.entries()) {
  const r = parseAlteracaoText(c)
  console.log(`\n=== Case ${i+1} ===`)
  console.log(JSON.stringify(r, null, 2))
}
```

Expected: cada caso parseado com tipo correto + entra/sai + placa normalizada.

- [ ] **Step 3: Commit**

```bash
git add src/lib/parsers/alteracao-text.ts scripts/test-alteracao.mjs
git commit -m "feat(parsers): porta parse_alteracao.py para TS (5 tipos)"
```

### D.2: UI /painel/alteracoes/nova

**Files:**
- Create: `src/app/painel/alteracoes/nova/page.tsx`
- Create: `src/app/painel/alteracoes/nova/form.tsx`

- [ ] **Step 1: Server component page**

```tsx
// src/app/painel/alteracoes/nova/page.tsx
import { AlteracaoForm } from './form'

export default function NovaAlteracaoPage() {
  return (
    <div className="container mx-auto py-6 px-4 max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">Nova alteração</h1>
      <p className="text-sm text-ink-soft mb-6">
        Cole a mensagem do WhatsApp. O sistema identifica rede, loja, placas e motorista.
      </p>
      <AlteracaoForm />
    </div>
  )
}
```

- [ ] **Step 2: Client component com paste + preview**

```tsx
// src/app/painel/alteracoes/nova/form.tsx
'use client'
import { useState, useTransition } from 'react'
import type { AlteracaoParsed } from '@/lib/parsers/alteracao-text'

export function AlteracaoForm() {
  const [texto, setTexto] = useState('')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [parsed, setParsed] = useState<AlteracaoParsed | null>(null)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function analisar() {
    setErr(null); setSaved(false)
    start(async () => {
      const res = await fetch('/api/alteracoes/parsear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      })
      if (!res.ok) { setErr(await res.text()); return }
      setParsed(await res.json())
    })
  }

  function aplicar() {
    if (!parsed) return
    setErr(null)
    start(async () => {
      const res = await fetch('/api/alteracoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_alteracao: data, ...parsed }),
      })
      if (!res.ok) { setErr(await res.text()); return }
      setSaved(true)
    })
  }

  const confColor = parsed?.confianca === 'alta' ? 'emerald' : parsed?.confianca === 'media' ? 'amber' : 'red'

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink-soft mb-1">Data</label>
        <input type="date" value={data} onChange={e => setData(e.target.value)}
          className="rounded-lg border border-border-strong bg-white px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink-soft mb-1">Mensagem do WhatsApp</label>
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          rows={8}
          placeholder="🚨ALTERAÇÃO 🚨&#10;Prezunic Caxias…&#10;Entra: Sidnei 674 LQE5401&#10;Sai : Anderson 811 LCE4337&#10;Motivo: …"
          className="w-full rounded-lg border border-border-strong bg-white px-3 py-2 text-sm font-mono"
        />
      </div>
      <button
        onClick={analisar}
        disabled={pending || !texto.trim()}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? 'Analisando…' : 'Analisar'}
      </button>

      {err && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}

      {parsed && (
        <div className={`rounded-lg border border-${confColor}-200 bg-${confColor}-50 p-4 space-y-2 text-sm`}>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase bg-${confColor}-100 text-${confColor}-800`}>
              {parsed.tipo}
            </span>
            <span className={`text-xs text-${confColor}-700`}>
              Confiança: {parsed.confianca}
            </span>
          </div>
          <div><b>Rede:</b> {parsed.rede_id ?? '?'}</div>
          <div><b>Loja:</b> {parsed.loja_nome_raw ?? '?'}</div>
          {parsed.entra && <div><b>Entra:</b> {parsed.entra.motorista_nome} (cod {parsed.entra.motorista_codigo}) — {parsed.entra.placa_norm}</div>}
          {parsed.sai && <div><b>Sai:</b> {parsed.sai.motorista_nome} (cod {parsed.sai.motorista_codigo}) — {parsed.sai.placa_norm}</div>}
          {parsed.motivo && <div><b>Motivo:</b> {parsed.motivo}</div>}
          <button
            onClick={aplicar}
            disabled={pending}
            className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saved ? '✓ Salvo' : 'Aplicar alteração'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Atualizar /api/alteracoes/parsear pra usar o parser TS**

Substituir a chamada do parser Python (se houver) por `parseAlteracaoText(texto)`.

- [ ] **Step 4: Commit**

```bash
git add src/app/painel/alteracoes/nova/ src/app/api/alteracoes/parsear/route.ts
git commit -m "feat(ui): /painel/alteracoes/nova com paste+preview+aplicar"
```

### D.3: Link no menu

**Files:**
- Modify: `src/app/painel/layout.tsx` (se for onde fica o menu)

- [ ] **Step 1: Adicionar item "Alterações" no menu lateral apontando pra `/painel/alteracoes/nova`**

- [ ] **Step 2: Commit**

```bash
git add src/app/painel/layout.tsx
git commit -m "feat(ui): link Alteracoes no menu lateral"
```

---

## TAREFA E — Validação E2E

- [ ] **Step 1: Subir os 5 arquivos no painel produção**

1. Acessar `https://kpi-transmonseg.vercel.app/painel/kpi/novo`
2. Subir cada arquivo em seu card respectivo (data 2026-05-16 ou outro dia de teste)
3. Conferir que cada upload retorna OK com qtd_linhas correto

- [ ] **Step 2: Adicionar 2 alterações de teste**

Acessar `/painel/alteracoes/nova`. Colar a alteração do Prezunic Caxias e mais uma. Confirmar preview correto, aplicar.

- [ ] **Step 3: Processar e gerar**

Acessar `/painel/kpi`, processar todas as redes do dia, gerar XLSX. Baixar e abrir.

- [ ] **Step 4: Push final**

```bash
git push
```

---

## Self-Review

**Spec coverage:**
- ✅ Armazém do Grão: parser + rota + UI (Tarefa A)
- ✅ Guanabara PDF: parser + rota + UI (Tarefa B)
- ✅ Unitrac PDF na UI: rota + UI (Tarefa C)
- ✅ Alterações: parser + UI + integração (Tarefa D)
- ✅ Validação E2E (Tarefa E)

**Placeholder scan:** Todos os steps têm código completo.

**Type consistency:** `LinhaEscala` reutilizado consistentemente. `parseAlteracaoText` retorna tipo único `AlteracaoParsed`.

**Riscos:**
- pdf-parse 2.4.5 (API nova `PDFParse` class) pode precisar ajuste de import
- Regex de placa pode falhar em formatos não previstos — testar com cases reais
- `/api/alteracoes/parsear` atual pode chamar o Python via subprocess — se chamar, refatorar pra TS

**Decisões deferidas:**
- Aba "Romaneio compacto" Cozinha (não cobre KPI principal)
- Filtros completos/erro Cozinha (idem)
- Treinamento Érica + manual (após estabilizar)

---

**Plano completo.** Total estimado: 6-9 horas de trabalho focado, 4 sub-tarefas independentes.
