# Romaneio Nutry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nova tela "Romaneio Nutry" — sobe Escala de Rota + Romaneio de Entrega, confere
cada carga/placa da escala contra o romaneio (sem Unitrac) e devolve um XLSX com uma aba
"Resumo" + uma aba por placa.

**Arquitetura:** Módulo novo dentro de `src/lib/kpi-nutrimax/` (paralelo ao pipeline
existente do Benassi/Unitrac, que não muda). Reusa `parse-escala.ts` e `parse-romaneio.ts`
já validados contra os PDFs reais. Um módulo puro (`romaneio-conferencia.ts`) agrupa o
romaneio por carga e decide o status de cada linha da escala. Um gerador (ExcelJS) monta o
workbook multi-aba. Uma rota HTTP fina orquestra os dois. Uma tela reusa o `FileDropzone`
compartilhado já extraído nesta sessão.

**Tech Stack:** Next.js 16 App Router, TypeScript, `exceljs`, Vitest.

## Global Constraints

- **Não altera** `/painel/nutrimax/gerar`, `/painel/nutrimax/inserir`,
  `/painel/nutrimax/dashboard`, `src/app/api/kpi/nutrimax/gerar/route.ts`,
  `src/app/api/kpi-nutrimax/upload/route.ts` nem a tabela `kpi_nutrimax_entradas` — esse
  pipeline continua exatamente como está.
- **Não altera** `src/app/painel/kpi/simples/page.tsx` (Benassi) além do que já foi feito
  (extração do `FileDropzone` — já commitado, fora do escopo deste plano).
- Sem persistência: essa feature não escreve em nenhuma tabela. Sem migration.
- Sem chamada ao Unitrac: é conferência de dois documentos, não status de entrega real.
- Nome de aba do Excel: `"PLACA (carga)"`, sanitizado (`\ / ? * [ ] :` viram `-`, máx. 31
  caracteres), com dedup defensivo se colidir mesmo assim.

---

## Estrutura de arquivos

```
src/lib/kpi-nutrimax/types.ts                          (modificar: + RelatorioPlacaNutrimax, ClienteRomaneioResumo)
src/lib/kpi-nutrimax/romaneio-conferencia.ts            (criar)
src/lib/kpi-nutrimax/romaneio-conferencia.test.ts       (criar)
src/lib/kpi-nutrimax/gerador-romaneio-conferencia.ts    (criar)
src/lib/kpi-nutrimax/gerador-romaneio-conferencia.test.ts (criar)

src/app/api/kpi/nutrimax/romaneio/route.ts              (criar)

src/app/painel/nutrimax/romaneio/page.tsx               (criar)
src/app/painel/nav.tsx                                  (modificar: + item "Romaneio Nutry")
```

---

### Task 1: Tipos — `RelatorioPlacaNutrimax`

**Files:**
- Modify: `src/lib/kpi-nutrimax/types.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: `ClienteRomaneioResumo`, `RelatorioPlacaNutrimax` (usados pelas Tasks 2, 3, 4).

- [ ] **Step 1: Adicionar os tipos (sem teste — só type, sem lógica)**

Adicionar ao final de `src/lib/kpi-nutrimax/types.ts`:

```ts
/** Um cliente dentro da aba de uma placa, no relatório de conferência. */
export type ClienteRomaneioResumo = {
  nf: string
  clienteNome: string
  endereco: string | null
}

/** Uma linha do relatório "Romaneio Nutry" — uma carga/placa da escala, com o resultado
 *  da conferência contra o romaneio e os clientes encontrados. */
export type RelatorioPlacaNutrimax = {
  carga: string
  placaRaw: string
  placaNorm: string
  destino: string
  motorista: string
  ajudante1: string | null
  ajudante2: string | null
  pesoKg: number | null
  nfPlanejado: number | null
  nfRecebido: number
  status: 'ok' | 'divergente' | 'ausente'
  clientes: ClienteRomaneioResumo[]
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/kpi-nutrimax/types.ts
git commit -m "feat(kpi-nutrimax): tipos RelatorioPlacaNutrimax e ClienteRomaneioResumo"
```

---

### Task 2: Módulo de conferência — agrupa romaneio por carga, decide status

**Files:**
- Create: `src/lib/kpi-nutrimax/romaneio-conferencia.ts`
- Create: `src/lib/kpi-nutrimax/romaneio-conferencia.test.ts`

**Interfaces:**
- Consumes: `LinhaEscalaNutrimax`, `LinhaRomaneioNutrimax`, `RelatorioPlacaNutrimax` (Task 1).
- Produces: `montaRelatorioPorPlaca(escala: LinhaEscalaNutrimax[], romaneio: LinhaRomaneioNutrimax[]): RelatorioPlacaNutrimax[]`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/kpi-nutrimax/romaneio-conferencia.test.ts
import { describe, it, expect } from 'vitest'
import { montaRelatorioPorPlaca } from './romaneio-conferencia'
import type { LinhaEscalaNutrimax, LinhaRomaneioNutrimax } from './types'

function escala(overrides: Partial<LinhaEscalaNutrimax> = {}): LinhaEscalaNutrimax {
  return {
    carga: '92593',
    placaRaw: 'TTL7D40',
    placaNorm: 'TTL7D40',
    destino: 'CAMPOS',
    motorista: 'LUAN VIANA AREAS RIBEIRO',
    ajudante1: 'LEANDRO DA HORA BATISTA',
    ajudante2: null,
    pesoKg: 2405,
    entPlanejado: 31,
    nfPlanejado: 2,
    ...overrides,
  }
}

function romaneio(overrides: Partial<LinhaRomaneioNutrimax> = {}): LinhaRomaneioNutrimax {
  return {
    carga: '92593',
    destino: 'CAMPOS',
    placa: 'TTL7D40',
    motorista: 'LUAN VIANA AREAS RIBEIRO',
    ajudantes: [],
    nf: '2270025',
    clienteCodigo: '165049',
    clienteNome: 'ANDRE LUIS SILVA VELASCO',
    endereco: 'RUA X, 1 - BAIRRO, CAMPOS - *',
    ...overrides,
  }
}

describe('montaRelatorioPorPlaca', () => {
  it('status ok: placa bate e recebeu todos os NFs planejados', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: 2 })],
      [romaneio({ nf: '1' }), romaneio({ nf: '2' })],
    )
    expect(r).toHaveLength(1)
    expect(r[0].status).toBe('ok')
    expect(r[0].nfRecebido).toBe(2)
    expect(r[0].clientes).toHaveLength(2)
    expect(r[0].clientes[0]).toEqual({ nf: '1', clienteNome: 'ANDRE LUIS SILVA VELASCO', endereco: 'RUA X, 1 - BAIRRO, CAMPOS - *' })
  })

  it('status ausente: nenhuma linha do romaneio pra essa carga', () => {
    const r = montaRelatorioPorPlaca([escala({ carga: '99999' })], [romaneio({ carga: '92593' })])
    expect(r[0].status).toBe('ausente')
    expect(r[0].nfRecebido).toBe(0)
    expect(r[0].clientes).toEqual([])
  })

  it('status divergente: placa da escala diferente da placa no romaneio', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ placaNorm: 'TTL7D40', nfPlanejado: 1 })],
      [romaneio({ placa: 'ABC1D23', nf: '1' })],
    )
    expect(r[0].status).toBe('divergente')
  })

  it('status divergente: recebeu menos NFs do que o planejado', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: 5 })],
      [romaneio({ nf: '1' }), romaneio({ nf: '2' })],
    )
    expect(r[0].status).toBe('divergente')
    expect(r[0].nfRecebido).toBe(2)
  })

  it('sem nfPlanejado (null) não gera falso-divergente por contagem — só confere placa', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: null })],
      [romaneio({ nf: '1' })],
    )
    expect(r[0].status).toBe('ok')
  })

  it('preserva a ordem da escala e ignora cargas do romaneio sem escala correspondente', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ carga: 'A', nfPlanejado: 1 }), escala({ carga: 'B', nfPlanejado: 1 })],
      [romaneio({ carga: 'B', nf: '1' }), romaneio({ carga: 'A', nf: '1' }), romaneio({ carga: 'ORFA', nf: '1' })],
    )
    expect(r.map(x => x.carga)).toEqual(['A', 'B'])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/kpi-nutrimax/romaneio-conferencia.test.ts`
Expected: FAIL — `./romaneio-conferencia` não existe.

- [ ] **Step 3: Implementar**

```ts
// src/lib/kpi-nutrimax/romaneio-conferencia.ts
import type { LinhaEscalaNutrimax, LinhaRomaneioNutrimax, RelatorioPlacaNutrimax } from './types'

export function montaRelatorioPorPlaca(
  escala: LinhaEscalaNutrimax[],
  romaneio: LinhaRomaneioNutrimax[],
): RelatorioPlacaNutrimax[] {
  const porCarga = new Map<string, LinhaRomaneioNutrimax[]>()
  for (const l of romaneio) {
    const arr = porCarga.get(l.carga) ?? []
    arr.push(l)
    porCarga.set(l.carga, arr)
  }

  return escala.map((e): RelatorioPlacaNutrimax => {
    const linhas = porCarga.get(e.carga) ?? []
    const nfRecebido = linhas.length

    let status: RelatorioPlacaNutrimax['status'] = 'ok'
    if (nfRecebido === 0) {
      status = 'ausente'
    } else {
      const placaRomaneio = linhas[0].placa
      const placaDivergente = !!e.placaNorm && !!placaRomaneio && e.placaNorm !== placaRomaneio
      const entregasIncompletas = e.nfPlanejado != null && nfRecebido < e.nfPlanejado
      if (placaDivergente || entregasIncompletas) status = 'divergente'
    }

    return {
      carga: e.carga,
      placaRaw: e.placaRaw,
      placaNorm: e.placaNorm,
      destino: e.destino,
      motorista: e.motorista,
      ajudante1: e.ajudante1,
      ajudante2: e.ajudante2,
      pesoKg: e.pesoKg,
      nfPlanejado: e.nfPlanejado,
      nfRecebido,
      status,
      clientes: linhas.map(l => ({ nf: l.nf, clienteNome: l.clienteNome, endereco: l.endereco })),
    }
  })
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/kpi-nutrimax/romaneio-conferencia.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-nutrimax/romaneio-conferencia.ts src/lib/kpi-nutrimax/romaneio-conferencia.test.ts
git commit -m "feat(kpi-nutrimax): monta relatório por placa (escala x romaneio, sem Unitrac)"
```

---

### Task 3: Gerador do XLSX multi-aba (Resumo + uma aba por placa)

**Files:**
- Create: `src/lib/kpi-nutrimax/gerador-romaneio-conferencia.ts`
- Create: `src/lib/kpi-nutrimax/gerador-romaneio-conferencia.test.ts`

**Interfaces:**
- Consumes: `RelatorioPlacaNutrimax` (Task 1).
- Produces: `gerarRomaneioConferencia(relatorio: RelatorioPlacaNutrimax[]): Promise<Buffer>`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/kpi-nutrimax/gerador-romaneio-conferencia.test.ts
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { gerarRomaneioConferencia } from './gerador-romaneio-conferencia'
import type { RelatorioPlacaNutrimax } from './types'

const base: RelatorioPlacaNutrimax = {
  carga: '92593',
  placaRaw: 'TTL7D40',
  placaNorm: 'TTL7D40',
  destino: 'CAMPOS',
  motorista: 'LUAN VIANA AREAS RIBEIRO',
  ajudante1: 'LEANDRO DA HORA BATISTA',
  ajudante2: null,
  pesoKg: 2405,
  nfPlanejado: 2,
  nfRecebido: 2,
  status: 'ok',
  clientes: [
    { nf: '1', clienteNome: 'ANDRE LUIS SILVA VELASCO', endereco: 'RUA X, 1 - BAIRRO, CAMPOS - *' },
    { nf: '2', clienteNome: 'M A SARDINHA', endereco: 'RUA Y, 2 - BAIRRO, CAMPOS - *' },
  ],
}

describe('gerarRomaneioConferencia', () => {
  it('gera aba Resumo + uma aba por placa', async () => {
    const buf = await gerarRomaneioConferencia([base])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)

    const nomes = wb.worksheets.map(ws => ws.name)
    expect(nomes).toEqual(['Resumo', 'TTL7D40 (92593)'])

    const resumo = wb.getWorksheet('Resumo')!
    expect(resumo.getRow(1).values).toEqual([, 'CARGA', 'PLACA', 'DESTINO', 'STATUS'])
    expect(resumo.getRow(2).values).toEqual([, '92593', 'TTL7D40', 'CAMPOS', 'OK'])

    const aba = wb.getWorksheet('TTL7D40 (92593)')!
    const linhas = aba.getSheetValues().filter(Boolean).map(r => (r as unknown[]).slice(1))
    expect(linhas).toContainEqual(['MOTORISTA', 'LUAN VIANA AREAS RIBEIRO'])
    expect(linhas).toContainEqual(['NF', 'CLIENTE', 'ENDEREÇO'])
    expect(linhas).toContainEqual(['1', 'ANDRE LUIS SILVA VELASCO', 'RUA X, 1 - BAIRRO, CAMPOS - *'])
  })

  it('duas cargas com a mesma placa geram abas com nomes distintos (placa + carga)', async () => {
    const buf = await gerarRomaneioConferencia([
      base,
      { ...base, carga: '92594', clientes: [] },
    ])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const nomes = wb.worksheets.map(ws => ws.name)
    expect(nomes).toEqual(['Resumo', 'TTL7D40 (92593)', 'TTL7D40 (92594)'])
  })

  it('relatório vazio gera só a aba Resumo', async () => {
    const buf = await gerarRomaneioConferencia([])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    expect(wb.worksheets.map(ws => ws.name)).toEqual(['Resumo'])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/kpi-nutrimax/gerador-romaneio-conferencia.test.ts`
Expected: FAIL — `./gerador-romaneio-conferencia` não existe.

- [ ] **Step 3: Implementar**

```ts
// src/lib/kpi-nutrimax/gerador-romaneio-conferencia.ts
import ExcelJS from 'exceljs'
import type { RelatorioPlacaNutrimax } from './types'

const STATUS_LABEL: Record<RelatorioPlacaNutrimax['status'], string> = {
  ok: 'OK',
  divergente: 'DIVERGENTE',
  ausente: 'AUSENTE',
}

function sanitizaNomeAba(nome: string): string {
  return nome.replace(/[\\/?*[\]:]/g, '-').slice(0, 31)
}

function nomeUnicoAba(usados: Set<string>, base: string): string {
  let nome = sanitizaNomeAba(base)
  let i = 2
  while (usados.has(nome)) {
    nome = sanitizaNomeAba(`${base} (${i})`)
    i++
  }
  usados.add(nome)
  return nome
}

export async function gerarRomaneioConferencia(relatorio: RelatorioPlacaNutrimax[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()

  const resumo = wb.addWorksheet('Resumo')
  resumo.addRow(['CARGA', 'PLACA', 'DESTINO', 'STATUS'])
  for (const r of relatorio) {
    resumo.addRow([r.carga, r.placaNorm, r.destino, STATUS_LABEL[r.status]])
  }

  const usados = new Set<string>(['Resumo'])
  for (const r of relatorio) {
    const ws = wb.addWorksheet(nomeUnicoAba(usados, `${r.placaNorm} (${r.carga})`))
    ws.addRow(['CARGA', r.carga])
    ws.addRow(['PLACA', r.placaNorm])
    ws.addRow(['DESTINO', r.destino])
    ws.addRow(['MOTORISTA', r.motorista])
    ws.addRow(['AJUDANTE 1', r.ajudante1 ?? ''])
    ws.addRow(['AJUDANTE 2', r.ajudante2 ?? ''])
    ws.addRow(['PESO (KG)', r.pesoKg ?? ''])
    ws.addRow(['NF PLANEJADO', r.nfPlanejado ?? ''])
    ws.addRow(['NF RECEBIDO', r.nfRecebido])
    ws.addRow(['STATUS', STATUS_LABEL[r.status]])
    ws.addRow([])
    ws.addRow(['NF', 'CLIENTE', 'ENDEREÇO'])
    for (const c of r.clientes) {
      ws.addRow([c.nf, c.clienteNome, c.endereco ?? ''])
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/kpi-nutrimax/gerador-romaneio-conferencia.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-nutrimax/gerador-romaneio-conferencia.ts src/lib/kpi-nutrimax/gerador-romaneio-conferencia.test.ts
git commit -m "feat(kpi-nutrimax): gera XLSX com aba Resumo + uma aba por placa"
```

---

### Task 4: Rota API — `POST /api/kpi/nutrimax/romaneio`

**Files:**
- Create: `src/app/api/kpi/nutrimax/romaneio/route.ts`

**Interfaces:**
- Consumes: `parseEscalaNutrimax` (já existe, `src/lib/kpi-nutrimax/parse-escala.ts`),
  `parseRomaneioNutrimax` (já existe, `src/lib/kpi-nutrimax/parse-romaneio.ts`),
  `montaRelatorioPorPlaca` (Task 2), `gerarRomaneioConferencia` (Task 3).

- [ ] **Step 1: Implementar a rota**

Sem teste automatizado (rota HTTP fina, orquestra funções já testadas nas Tasks 2-3) —
verificação é o smoke test manual da Task 6.

```ts
// src/app/api/kpi/nutrimax/romaneio/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseEscalaNutrimax } from '@/lib/kpi-nutrimax/parse-escala'
import { parseRomaneioNutrimax } from '@/lib/kpi-nutrimax/parse-romaneio'
import { montaRelatorioPorPlaca } from '@/lib/kpi-nutrimax/romaneio-conferencia'
import { gerarRomaneioConferencia } from '@/lib/kpi-nutrimax/gerador-romaneio-conferencia'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const form = await req.formData()
  const data = String(form.get('data') ?? '')
  const escalaFile = form.get('escala')
  const romaneioFile = form.get('romaneio')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida (YYYY-MM-DD)', { status: 400 })
  if (!(escalaFile instanceof File)) return new NextResponse('Escala de Rota (PDF) obrigatória', { status: 400 })
  if (!(romaneioFile instanceof File)) return new NextResponse('Romaneio de Entrega (PDF) obrigatório', { status: 400 })

  const escalaBuf = Buffer.from(await escalaFile.arrayBuffer())
  const romaneioBuf = Buffer.from(await romaneioFile.arrayBuffer())

  const escala = await parseEscalaNutrimax(escalaBuf)
  if (escala.length === 0) {
    return new NextResponse('Nenhuma carga reconhecida na escala — confira se o PDF é a "Escala de Rota".', { status: 422 })
  }
  const romaneio = await parseRomaneioNutrimax(romaneioBuf)
  if (romaneio.length === 0) {
    return new NextResponse('Nenhum cliente reconhecido no romaneio — confira se o PDF é o "Romaneio de Entrega".', { status: 422 })
  }

  const relatorio = montaRelatorioPorPlaca(escala, romaneio)
  const xlsxBuf = await gerarRomaneioConferencia(relatorio)

  const resumo = {
    total: relatorio.length,
    ok: relatorio.filter(r => r.status === 'ok').length,
    divergentes: relatorio.filter(r => r.status === 'divergente').length,
    ausentes: relatorio.filter(r => r.status === 'ausente').length,
  }

  return NextResponse.json({
    resumo,
    xlsxBase64: xlsxBuf.toString('base64'),
    filename: `Romaneio-Nutry-${data}.xlsx`,
  })
}
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/kpi/nutrimax/romaneio/route.ts"
git commit -m "feat(kpi-nutrimax): rota Romaneio Nutry — escala + romaneio -> XLSX multi-aba"
```

---

### Task 5: UI — tela "Romaneio Nutry" + nav

**Files:**
- Create: `src/app/painel/nutrimax/romaneio/page.tsx`
- Modify: `src/app/painel/nav.tsx`

**Interfaces:**
- Consumes: `POST /api/kpi/nutrimax/romaneio` (Task 4), `FileDropzone`
  (`src/app/painel/file-dropzone.tsx`, já existe).

- [ ] **Step 1: Implementar a página**

```tsx
// src/app/painel/nutrimax/romaneio/page.tsx
'use client'

import { useState } from 'react'
import { ArrowRight, CalendarBlank, WarningCircle, FileArrowDown } from '@phosphor-icons/react/dist/ssr'
import { cn } from '@/components/ui'
import { FileDropzone } from '@/app/painel/file-dropzone'

type Resumo = { total: number; ok: number; divergentes: number; ausentes: number }
type Tone = 'default' | 'success' | 'warning' | 'danger'

export default function NutrimaxRomaneioPage() {
  const [escala, setEscala] = useState<File[]>([])
  const [romaneio, setRomaneio] = useState<File[]>([])
  const [data, setData] = useState('')
  const [pending, setPending] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [resultado, setResultado] = useState<{ xlsxBase64: string; filename: string } | null>(null)

  const pronto = escala.length > 0 && romaneio.length > 0 && !!data

  async function processar() {
    if (!pronto) return
    setPending(true)
    setErro(null)
    setResumo(null)
    setResultado(null)
    try {
      const fd = new FormData()
      fd.set('escala', escala[0])
      fd.set('romaneio', romaneio[0])
      fd.set('data', data)
      const res = await fetch('/api/kpi/nutrimax/romaneio', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json() as { resumo: Resumo; xlsxBase64: string; filename: string }
      setResumo(json.resumo)
      setResultado({ xlsxBase64: json.xlsxBase64, filename: json.filename })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado.')
    } finally {
      setPending(false)
    }
  }

  function baixar() {
    if (!resultado) return
    const bin = atob(resultado.xlsxBase64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = resultado.filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <header className="mb-10 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          Nutrimax
        </span>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-fg)] md:text-[34px]">
          Romaneio Nutry
        </h1>
        <p className="mt-1 max-w-[55ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Suba a Escala de Rota e o Romaneio de Entrega. Confere cada placa da escala contra o
          romaneio (sem consultar o Unitrac) e devolve um XLSX com uma aba de resumo e uma aba
          por placa.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="col-span-1 lg:col-span-7">
          <FileDropzone
            eyebrow="Passo 1"
            label="Escala de Rota"
            hint="PDF · o planejado (placa, destino, NFs previstos)"
            accept=".pdf"
            files={escala}
            onAdd={files => setEscala(files.slice(0, 1))}
            onRemove={() => setEscala([])}
          />
        </div>

        <div className="col-span-1 flex flex-col gap-4 lg:col-span-5">
          <FileDropzone
            eyebrow="Passo 2"
            label="Romaneio de Entrega"
            hint="PDF · o executado (cliente a cliente por carga)"
            accept=".pdf"
            files={romaneio}
            onAdd={files => setRomaneio(files.slice(0, 1))}
            onRemove={() => setRomaneio([])}
          />

          <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
              <CalendarBlank size={12} weight="bold" />
              Passo 3 · Data de referência
            </div>
            <input
              id="data"
              type="date"
              value={data}
              onChange={e => setData(e.target.value)}
              className="mt-1 w-full bg-transparent text-[24px] font-medium tracking-tight text-[var(--color-fg)] outline-none [color-scheme:light] dark:[color-scheme:dark]"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>
        </div>
      </section>

      {erro && (
        <div className="mt-6 flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-5 py-4">
          <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
          <p className="text-[13px] leading-relaxed text-[var(--color-danger-soft-fg)]">{erro}</p>
        </div>
      )}

      {resumo && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CardResumo label="Total" valor={resumo.total} tone="default" />
          <CardResumo label="OK" valor={resumo.ok} tone="success" />
          <CardResumo label="Divergentes" valor={resumo.divergentes} tone="warning" />
          <CardResumo label="Ausentes" valor={resumo.ausentes} tone="danger" />
        </div>
      )}

      {resultado && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--color-success)]/30 bg-[var(--color-success-soft)] px-5 py-4">
          <span className="text-[13px] text-[var(--color-success-soft-fg)]">
            Relatório gerado. Baixe o XLSX — aba &quot;Resumo&quot; lista tudo, uma aba por placa
            traz o detalhe.
          </span>
          <button
            type="button"
            onClick={baixar}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-navy-700)] px-4 py-2 text-[12.5px] font-medium text-white"
          >
            <FileArrowDown size={14} weight="bold" />
            Baixar XLSX
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={processar}
        disabled={pending || !pronto}
        className={cn(
          'group relative mt-8 flex w-full items-center justify-between gap-4 overflow-hidden rounded-[var(--radius-card)] px-7 py-5 text-left transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.99]',
          pronto && !pending
            ? 'bg-[var(--color-navy-700)] text-white shadow-soft hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-10px_rgba(31,56,100,0.55)]'
            : pending
              ? 'bg-[var(--color-navy-700)] text-white'
              : 'cursor-not-allowed bg-[var(--color-bg-subtle)] border border-[var(--color-border)] text-[var(--color-fg-muted)]'
        )}
      >
        {pending && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 h-[3px] w-1/4 bg-white/80 animate-progress-sweep"
            style={{ filter: 'blur(0.3px)' }}
          />
        )}
        <div className="flex flex-col gap-1">
          <span className={cn('text-[11px] font-medium uppercase tracking-[0.18em]', pronto || pending ? 'text-white/60' : 'text-[var(--color-fg-muted)]')}>
            {pending ? 'Processando' : 'Conferir'}
          </span>
          <span className="text-[18px] font-semibold tracking-tight">
            {pending ? 'Cruzando escala com romaneio…' : pronto ? 'Gerar conferência' : 'Aguardando arquivos'}
          </span>
        </div>
        {!pending && pronto && (
          <ArrowRight size={22} weight="bold" className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
        )}
        {pending && (
          <span className="flex items-center gap-1.5" aria-hidden>
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-dot" style={{ animationDelay: '0ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-dot" style={{ animationDelay: '180ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-dot" style={{ animationDelay: '360ms' }} />
          </span>
        )}
      </button>
    </div>
  )
}

function CardResumo({ label, valor, tone }: { label: string; valor: number; tone: Tone }) {
  const toneCls: Record<Tone, string> = {
    default: 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)]',
    success: 'border-transparent bg-[var(--color-success-soft)] text-[var(--color-success-soft-fg)]',
    warning: 'border-transparent bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-fg)]',
    danger: 'border-transparent bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-fg)]',
  }
  return (
    <div className={cn('rounded-xl border px-4 py-3', toneCls[tone])}>
      <div className="text-[22px] font-semibold leading-tight tracking-tight">{valor}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider opacity-80">{label}</div>
    </div>
  )
}
```

- [ ] **Step 2: Adicionar o item "Romaneio Nutry" na navegação**

Abrir `src/app/painel/nav.tsx`. No grupo `Nutrimax` já existente em `GROUPS`, adicionar um
item entre `Inserir KPI` e `Dashboard` (reusa `ClipboardText`, já importado — mesmo ícone do
"Gerar Romaneio" da Cozinha):

```ts
  {
    label: 'Nutrimax',
    Icon: TableIcon,
    children: [
      { href: '/painel/nutrimax/gerar', label: 'Gerar KPI', Icon: TableIcon },
      { href: '/painel/nutrimax/inserir', label: 'Inserir KPI', Icon: TableIcon },
      { href: '/painel/nutrimax/romaneio', label: 'Romaneio Nutry', Icon: ClipboardText },
      { href: '/painel/nutrimax/dashboard', label: 'Dashboard', Icon: ChartBar },
    ],
  },
```

- [ ] **Step 3: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add src/app/painel/nutrimax/romaneio/page.tsx src/app/painel/nav.tsx
git commit -m "feat(kpi-nutrimax): tela Romaneio Nutry + navegação"
```

---

### Task 6: Smoke test fim-a-fim com os PDFs reais + suíte completa

**Files:** nenhum (só verificação).

- [ ] **Step 1: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: todos os testes passam, incluindo os das Tasks 1-5 e os já existentes (parsers,
matcher, gerador antigo etc. — nada deles muda).

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Smoke test manual via navegador**

Servidor de dev rodando (`npm run dev`). Login como admin via chrome-devtools-mcp (mesmo
processo já usado nesta sessão: senha temporária na conta `teste@gmail.com` via API admin do
Supabase, ROTACIONAR de volta ao final).

1. Navegar pra `/painel/nutrimax/romaneio`.
2. Subir `Escala 01-07.pdf` no Passo 1, `Romaneio 01-07.pdf` no Passo 2, data `2026-07-01`.
3. Clicar "Gerar conferência" — confirmar HTTP 200 e os cards de resumo aparecendo.
   Expected: Total 71, e os 3 avisos já conhecidos aparecendo como "Ausentes" (cargas
   92594/92595/92625 — validado nesta sessão via script standalone antes da tela existir).
4. Clicar "Baixar XLSX", abrir o arquivo baixado (ou inspecionar via `ExcelJS` num script
   `tsx` rápido) e confirmar: aba "Resumo" com 71 linhas + 1 header, e abas individuais tipo
   `"TTL7D40 (92593)"` com o cabeçalho da rota e a lista de clientes.
5. Confirmar que `/painel/nutrimax/gerar`, `/painel/nutrimax/inserir` e
   `/painel/nutrimax/dashboard` continuam funcionando exatamente como antes (não fazem parte
   deste plano, mas são o "não pode quebrar" mais importante da sessão).
6. Rotacionar a senha da conta `teste@gmail.com` de volta.

- [ ] **Step 4: Nenhum commit nesta task** (é só verificação; se algo falhar, voltar pra
  task correspondente, corrigir, e repetir esta).

---

### Task 7: Sincronizar com o repo definitivo (`KPI transmonseg`)

**Files:** todos os criados/modificados nas Tasks 1-5.

- [ ] **Step 1: Gerar e aplicar o diff**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
git log --oneline <commit-antes-da-task-1>..HEAD
git diff <commit-antes-da-task-1>..HEAD > /tmp/romaneio-nutry-sync.patch
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg"
git apply --check /tmp/romaneio-nutry-sync.patch && echo "OK"
git apply /tmp/romaneio-nutry-sync.patch
```

- [ ] **Step 2: Rodar typecheck + suíte no repo definitivo**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros, todos os testes passam.

- [ ] **Step 3: Commit no definitivo**

```bash
git add src/lib/kpi-nutrimax/types.ts src/lib/kpi-nutrimax/romaneio-conferencia.ts \
  src/lib/kpi-nutrimax/romaneio-conferencia.test.ts \
  src/lib/kpi-nutrimax/gerador-romaneio-conferencia.ts \
  src/lib/kpi-nutrimax/gerador-romaneio-conferencia.test.ts \
  "src/app/api/kpi/nutrimax/romaneio/route.ts" \
  src/app/painel/nutrimax/romaneio/page.tsx src/app/painel/nav.tsx
git commit -m "feat(kpi-nutrimax): Romaneio Nutry — conferência escala x romaneio, XLSX multi-aba"
rm -f /tmp/romaneio-nutry-sync.patch
```

- [ ] **Step 4: Push nos dois repos — só com confirmação explícita do usuário**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && git push
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg" && git push
```

---

## Divergências da spec que valem uma segunda checada

Nenhuma — este plano segue a spec `2026-07-14-nutrimax-romaneio-conferencia-design.md`
exatamente como revisada (aba Resumo + nome de aba `"placa (carga)"` anti-colisão).

## Fora de escopo deste plano

- Cargas do romaneio sem carga correspondente na escala (órfãs) — documentado na spec como
  limitação conhecida do v1.
- Qualquer alteração no pipeline Gerar KPI / Inserir KPI / Dashboard do Nutrimax ou no KPI do
  Benassi.
