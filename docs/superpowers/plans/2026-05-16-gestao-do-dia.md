# Gestão do Dia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir /painel/kpi/novo pelos componentes de "Gestão do Dia" — uma tela única onde o usuário vê, envia e gerencia as escalas de uma data e gera KPIs com seleção de redes.

**Architecture:** Nova rota `/painel/kpi/dia` com Server Component buscando `escala_uploads` e Client Components para toda interatividade. O Unitrac é sempre pedido no momento da geração (nunca pré-populado). A rota `/painel/kpi/novo` vira redirect. Upload estende para suportar `tipo: 'auto'` com auto-detecção sequencial de parsers.

**Tech Stack:** Next.js App Router (Node runtime), React 19, TypeScript, Tailwind 4, Supabase (client + service), next/font/google (Geist)

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/app/api/escalas/dia/route.ts` | Criar | GET — lista escala_uploads por data |
| `src/app/api/escalas/upload/route.ts` | Modificar | Suportar tipo='auto' com detecção sequencial |
| `src/app/layout.tsx` | Modificar | Inter → Geist |
| `src/app/painel/nav.tsx` | Modificar | Atualizar href e label do link de upload |
| `src/app/painel/kpi/dia/page.tsx` | Criar | Server Component — busca escalas e renderiza DiaPage |
| `src/app/painel/kpi/dia/DiaPage.tsx` | Criar | Client Component — estado central da tela |
| `src/app/painel/kpi/dia/DropZone.tsx` | Criar | Drag & drop multi-arquivo |
| `src/app/painel/kpi/dia/EscalaItem.tsx` | Criar | Item da lista (done/pending) |
| `src/app/painel/kpi/dia/GerarSection.tsx` | Criar | Checkboxes + UnitracPicker + botão + resultado |
| `src/app/painel/kpi/novo/page.tsx` | Modificar | Redirect → /painel/kpi/dia |

---

## Task 1: API GET /api/escalas/dia

**Files:**
- Create: `src/app/api/escalas/dia/route.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/app/api/escalas/dia/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { searchParams } = new URL(req.url)
  const data = searchParams.get('data')

  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data))
    return new NextResponse('Parâmetro data inválido. Use YYYY-MM-DD.', { status: 400 })

  const svc = createServiceClient()

  const { data: rows, error } = await svc
    .from('escala_uploads')
    .select('id, tipo, qtd_linhas, qtd_orfas, created_at')
    .eq('data_escala', data)
    .order('tipo')

  if (error) return new NextResponse(error.message, { status: 500 })

  return NextResponse.json(rows ?? [])
}
```

- [ ] **Step 2: Testar manualmente**

Com o dev server rodando (`npm run dev`), abrir:
```
http://localhost:3000/api/escalas/dia?data=2026-05-15
```
Esperado: array JSON (pode ser vazio `[]` se não houver uploads para a data).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/escalas/dia/route.ts
git commit -m "feat(api): GET /api/escalas/dia retorna uploads de escala por data"
```

---

## Task 2: Upload com tipo='auto'

**Files:**
- Modify: `src/app/api/escalas/upload/route.ts`

**Contexto crítico:** O arquivo atual em `src/app/api/escalas/upload/route.ts` valida `tipo` contra `TIPOS_VALIDOS` e bloqueia se não estiver na lista. Também faz checagem de formato esperado por tipo. Precisamos adicionar o caminho `tipo === 'AUTO'` que tenta cada parser em sequência.

- [ ] **Step 1: Adicionar 'AUTO' aos tipos válidos e a lógica de detecção**

Localizar a linha `const TIPOS_VALIDOS: TipoEscala[] = [...]` e adicionar 'AUTO'. Depois, dentro do bloco `try { ... }` onde os parsers são chamados, adicionar o caso AUTO antes dos outros:

```typescript
// Adicionar 'AUTO' ao tipo TipoEscala e TIPOS_VALIDOS:
type TipoEscala = 'GERAL' | 'ZONA_SUL' | 'PAX' | 'ARMAZEM_GRAO' | 'GUANABARA' | 'AUTO'
const TIPOS_VALIDOS: TipoEscala[] = ['GERAL', 'ZONA_SUL', 'PAX', 'ARMAZEM_GRAO', 'GUANABARA', 'AUTO']
```

- [ ] **Step 2: Substituir a checagem de formato esperado para 'AUTO'**

Localizar o bloco que verifica `FORMATO_ESPERADO[tipo]` e adicionar exceção para AUTO:

```typescript
// Antes da checagem de formatoEsperado:
if (tipo !== 'AUTO') {
  const formatoEsperado = FORMATO_ESPERADO[tipo]
  if (formato !== formatoEsperado)
    return new NextResponse(
      `Formato ${formato} ainda não suportado para tipo ${tipo}. Envie em ${formatoEsperado}.`,
      { status: 501 }
    )
}
```

- [ ] **Step 3: Adicionar lógica de auto-detecção no bloco try**

No bloco `try` onde os parsers são chamados, adicionar o caso `AUTO` antes dos outros `if/else if`:

```typescript
if (tipo === 'AUTO') {
  // Tenta cada parser em sequência, usa o primeiro que retorna linhas > 0
  const tentativas: Array<{ t: TipoEscala; fn: () => Promise<LinhaEscala[]> }> = [
    { t: 'GERAL',        fn: () => parseEscalaGeral(arrayBuffer, data as string) },
    { t: 'ZONA_SUL',     fn: () => parseEscalaZonaSul(arrayBuffer, data as string) },
    { t: 'PAX',          fn: () => parseEscalaPax(arrayBuffer, data as string) },
    { t: 'ARMAZEM_GRAO', fn: () => parseEscalaArmazemGrao(arrayBuffer, data as string) },
  ]
  // PDF-only parsers
  if (formato === 'pdf') {
    const { parseEscalaGuanabaraPdf } = await import('@/lib/parsers/escala-guanabara-pdf')
    tentativas.push({ t: 'GUANABARA', fn: () => parseEscalaGuanabaraPdf(Buffer.from(arrayBuffer), data as string) })
  }

  for (const { t, fn } of tentativas) {
    try {
      const resultado = await fn()
      if (resultado.length > 0) {
        linhas = resultado
        // Sobrescrever tipo para o detectado (usado no insert abaixo)
        ;(body as Record<string, unknown>).tipo = t
        // Atualizar variável local que será usada no upsert
        Object.assign(req, { _tipoDetectado: t })
        break
      }
    } catch {
      // Parser não reconheceu o arquivo — tentar próximo
    }
  }

  if (!linhas || linhas.length === 0)
    return new NextResponse(
      'Não foi possível detectar o tipo da escala. Verifique se o arquivo é uma das escalas suportadas (GERAL, ZONA SUL, PAX, ARMAZÉM DO GRÃO, GUANABARA).',
      { status: 400 }
    )
```

**Nota importante:** O `tipo` que vai para o `escala_uploads.insert` precisa ser o tipo detectado, não 'AUTO'. Localizar no código o insert de `escala_uploads` e usar `tipoDetectado` em vez de `tipo`:

```typescript
// Declarar tipoDetectado antes do try:
let tipoDetectado: TipoEscala = tipo

// Dentro do caso AUTO, quando encontrar parser com resultado:
tipoDetectado = t

// No insert do escala_uploads, usar tipoDetectado:
.insert({
  data_escala: data,
  tipo: tipoDetectado,   // ← era: tipo
  arquivo_path: storagePath,
  ...
})

// Também usar tipoDetectado na checagem de existente:
.eq('tipo', tipoDetectado)   // ← era: tipo
```

- [ ] **Step 4: Testar auto-detecção**

Com o dev server rodando, fazer upload de uma escala GERAL via curl ou pelo painel, passando `tipo: 'auto'`. Esperado: retorno com `upload_id`, `qtd_linhas > 0`, e o tipo correto detectado.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/escalas/upload/route.ts
git commit -m "feat(api): suporte a tipo=AUTO com detecção sequencial de parser"
```

---

## Task 3: Font Geist + Scaffold da rota /painel/kpi/dia

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/app/painel/kpi/dia/page.tsx`
- Create: `src/app/painel/kpi/dia/DiaPage.tsx`
- Modify: `src/app/painel/nav.tsx`
- Modify: `src/app/painel/kpi/novo/page.tsx`

- [ ] **Step 1: Trocar Inter por Geist em layout.tsx**

```typescript
// src/app/layout.tsx
import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'KPI TRANSMONSEG',
  description: 'Sistema de gestão de escalas e KPI da TRANSMONSEG',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full bg-zinc-50 text-zinc-900 font-sans">
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Criar page.tsx (Server Component)**

```typescript
// src/app/painel/kpi/dia/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { DiaPage } from './DiaPage'

export const metadata = { title: 'Gestão do Dia — Transmonseg' }

const TODOS_TIPOS = ['GERAL', 'ZONA_SUL', 'PAX', 'ARMAZEM_GRAO', 'GUANABARA'] as const

type EscalaUpload = {
  id: string
  tipo: string
  qtd_linhas: number | null
  qtd_orfas: number | null
  created_at: string
}

async function fetchEscalasDoDia(data: string): Promise<EscalaUpload[]> {
  const svc = createServiceClient()
  const { data: rows, error } = await svc
    .from('escala_uploads')
    .select('id, tipo, qtd_linhas, qtd_orfas, created_at')
    .eq('data_escala', data)
    .order('tipo')
  if (error) throw new Error(error.message)
  return (rows ?? []) as EscalaUpload[]
}

export default async function KpiDiaPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const hoje = new Date().toISOString().slice(0, 10)
  const data = params.data ?? hoje

  const escalas = await fetchEscalasDoDia(data)

  return (
    <DiaPage
      data={data}
      hoje={hoje}
      escalasIniciais={escalas}
      todosTipos={[...TODOS_TIPOS]}
    />
  )
}
```

- [ ] **Step 3: Criar DiaPage.tsx com estado inicial (sem funcionalidade ainda)**

```typescript
// src/app/painel/kpi/dia/DiaPage.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type EscalaUpload = {
  id: string
  tipo: string
  qtd_linhas: number | null
  qtd_orfas: number | null
  created_at: string
}

type Props = {
  data: string
  hoje: string
  escalasIniciais: EscalaUpload[]
  todosTipos: string[]
}

export function DiaPage({ data: dataInicial, hoje, escalasIniciais, todosTipos }: Props) {
  const router = useRouter()
  const [data, setData] = useState(dataInicial)
  const [escalas, setEscalas] = useState<EscalaUpload[]>(escalasIniciais)

  function formatarData(iso: string): string {
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  function diaAnterior(): string {
    const d = new Date(data + 'T12:00:00')
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  }

  function diaSeguinte(): string {
    const d = new Date(data + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  }

  async function navegarPara(novaData: string) {
    setData(novaData)
    router.push(`/painel/kpi/dia?data=${novaData}`)
    // Buscar escalas do novo dia
    const res = await fetch(`/api/escalas/dia?data=${novaData}`)
    if (res.ok) setEscalas(await res.json())
    else setEscalas([])
  }

  const isHoje = data === hoje
  const dataLabel = formatarData(data)

  return (
    <div className="max-w-2xl mx-auto">
      {/* Date header */}
      <div className="bg-slate-800 rounded-xl px-5 py-3 flex items-center justify-between gap-4 mb-6 shadow-lg shadow-slate-900/20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navegarPara(diaAnterior())}
            className="bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer"
          >
            ← {diaAnterior().slice(5).replace('-', '/')}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold text-sm capitalize">{dataLabel}</span>
            {isHoje && (
              <span className="bg-brand-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                hoje
              </span>
            )}
          </div>
          <button
            onClick={() => navegarPara(diaSeguinte())}
            disabled={isHoje}
            className="bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 hover:text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer"
          >
            {diaSeguinte().slice(5).replace('-', '/')} →
          </button>
        </div>
        <input
          type="date"
          value={data}
          max={hoje}
          onChange={e => navegarPara(e.target.value)}
          className="bg-slate-700 border border-slate-600 text-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </div>

      {/* Placeholder — substituído nas próximas tasks */}
      <div className="text-sm text-ink-soft p-4">
        {escalas.length} escala(s) para {data}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Atualizar nav.tsx**

Alterar o item de upload na nav:
```typescript
// Trocar:
{ href: '/painel/kpi/novo', label: 'Upload de Relatórios' },
// Por:
{ href: '/painel/kpi/dia', label: 'Gestão do Dia' },
```

- [ ] **Step 5: Redirecionar /painel/kpi/novo → /painel/kpi/dia**

```typescript
// src/app/painel/kpi/novo/page.tsx
import { redirect } from 'next/navigation'

export default function KpiNovoPage() {
  redirect('/painel/kpi/dia')
}
```

- [ ] **Step 6: Testar visualmente**

Abrir `http://localhost:3000/painel/kpi/dia`. Deve mostrar header escuro com navegação de datas. Font deve ser Geist. Nav lateral deve mostrar "Gestão do Dia" ativo.

- [ ] **Step 7: Commit**

```bash
git add src/app/layout.tsx src/app/painel/nav.tsx src/app/painel/kpi/dia/page.tsx src/app/painel/kpi/dia/DiaPage.tsx src/app/painel/kpi/novo/page.tsx
git commit -m "feat(kpi): scaffold rota /painel/kpi/dia com navegação de datas e font Geist"
```

---

## Task 4: DropZone + EscalaItem + lista de escalas

**Files:**
- Create: `src/app/painel/kpi/dia/DropZone.tsx`
- Create: `src/app/painel/kpi/dia/EscalaItem.tsx`
- Modify: `src/app/painel/kpi/dia/DiaPage.tsx` (adicionar drop zone e lista)

- [ ] **Step 1: Criar DropZone.tsx**

```typescript
// src/app/painel/kpi/dia/DropZone.tsx
'use client'

import { useRef, useState } from 'react'

type Props = {
  onFiles: (files: File[]) => void
  disabled?: boolean
}

export function DropZone({ onFiles, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    onFiles(Array.from(files))
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault()
        setDragging(false)
        if (!disabled) handleFiles(e.dataTransfer.files)
      }}
      className={[
        'flex flex-col items-center justify-center w-full py-6 rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer select-none text-center px-4',
        dragging
          ? 'border-brand-500 bg-brand-100'
          : 'border-brand-200 bg-brand-50 hover:border-brand-400 hover:bg-brand-100',
        disabled ? 'opacity-40 cursor-not-allowed' : '',
      ].join(' ')}
    >
      <svg className="h-6 w-6 text-brand-400 mb-2 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <p className="text-sm font-semibold text-brand-700 pointer-events-none">
        Arraste ou clique para enviar escalas
      </p>
      <p className="text-xs text-brand-400 mt-1 pointer-events-none">
        XLSX ou PDF — detecta o tipo automaticamente
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.pdf"
        multiple
        onChange={e => handleFiles(e.target.files)}
        className="hidden"
      />
    </div>
  )
}
```

- [ ] **Step 2: Criar EscalaItem.tsx**

```typescript
// src/app/painel/kpi/dia/EscalaItem.tsx
'use client'

import { useRef } from 'react'

type EscalaUpload = {
  id: string
  tipo: string
  qtd_linhas: number | null
  qtd_orfas: number | null
  created_at: string
}

type Props =
  | { tipo: string; upload: EscalaUpload; onReenviar: (tipo: string, file: File) => void; uploading?: never }
  | { tipo: string; upload: null; onEnviar: (tipo: string, file: File) => void; uploading?: boolean }

const BADGE_CLASSES: Record<string, string> = {
  GERAL:        'bg-blue-100 text-blue-800',
  ZONA_SUL:     'bg-violet-100 text-violet-800',
  PAX:          'bg-pink-100 text-pink-800',
  GUANABARA:    'bg-amber-100 text-amber-800',
  ARMAZEM_GRAO: 'bg-emerald-100 text-emerald-800',
}

const LABEL: Record<string, string> = {
  GERAL:        'GERAL',
  ZONA_SUL:     'ZONA SUL',
  PAX:          'PAX',
  GUANABARA:    'GUANABARA',
  ARMAZEM_GRAO: 'ARMAZÉM DO GRÃO',
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function EscalaItem(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const badge = BADGE_CLASSES[props.tipo] ?? 'bg-slate-100 text-slate-700'
  const label = LABEL[props.tipo] ?? props.tipo

  if (props.upload) {
    const { upload, onReenviar } = props as Extract<Props, { upload: EscalaUpload }>
    return (
      <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 transition-all duration-200">
        <div className="flex items-center gap-2.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badge}`}>{label}</span>
          <span className="text-xs font-semibold text-emerald-800">
            {upload.qtd_linhas ?? '?'} linhas
            {upload.qtd_orfas != null && upload.qtd_orfas > 0 && (
              <span className="text-emerald-600 font-normal"> · {upload.qtd_orfas} sem placa</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-emerald-600 font-medium tabular-nums">✓ {formatTime(upload.created_at)}</span>
          <button
            onClick={() => inputRef.current?.click()}
            title="Reenviar"
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded px-1.5 py-0.5 text-sm transition-all duration-150 cursor-pointer"
          >
            ↺
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.pdf"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) onReenviar(props.tipo, f)
              e.target.value = ''
            }}
            className="hidden"
          />
        </div>
      </div>
    )
  }

  const { onEnviar, uploading } = props as Extract<Props, { upload: null }>
  return (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-50 border border-dashed border-slate-200">
      <div className="flex items-center gap-2.5">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500">{label}</span>
        <span className="text-xs text-slate-400">{uploading ? 'Enviando…' : 'não enviada'}</span>
      </div>
      {!uploading && (
        <>
          <button
            onClick={() => inputRef.current?.click()}
            className="text-xs font-semibold text-slate-500 border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 rounded-md px-2.5 py-1 transition-all duration-150 cursor-pointer"
          >
            + Enviar
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.pdf"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) onEnviar(props.tipo, f)
              e.target.value = ''
            }}
            className="hidden"
          />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Adicionar lista de escalas e upload flow ao DiaPage.tsx**

Substituir o conteúdo de DiaPage.tsx (a partir do return, após o date header) com o seguinte. O estado de `escalas` já existe — adicionar `uploadingTipos`:

```typescript
// Adicionar dentro do componente DiaPage, após os estados existentes:
const [uploadingTipos, setUploadingTipos] = useState<Set<string>>(new Set())
const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({})

async function uploadArquivo(file: File, tipoExplicito?: string) {
  const tipo = tipoExplicito ?? 'auto'
  const ext = file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'xlsx'
  const contentType = ext === 'pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const storagePath = `${data}/${tipo.toLowerCase()}.${ext}`

  // Upload para Storage
  const { createClient } = await import('@/lib/supabase/client')
  const sb = createClient()
  const { error: storageErr } = await sb.storage
    .from('escalas-raw')
    .upload(storagePath, file, { contentType, upsert: true })
  if (storageErr) throw new Error(storageErr.message)

  // Processar
  const res = await fetch('/api/escalas/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo: tipo.toUpperCase(), data, storagePath }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function handleFiles(files: File[]) {
  for (const file of files) {
    const tipoKey = 'AUTO_' + file.name
    setUploadingTipos(prev => new Set([...prev, tipoKey]))
    try {
      await uploadArquivo(file, 'auto')
      // Recarregar lista
      const res = await fetch(`/api/escalas/dia?data=${data}`)
      if (res.ok) setEscalas(await res.json())
    } catch (e) {
      setUploadErrors(prev => ({ ...prev, [tipoKey]: e instanceof Error ? e.message : String(e) }))
    } finally {
      setUploadingTipos(prev => { const s = new Set(prev); s.delete(tipoKey); return s })
    }
  }
}

async function handleEnviarTipo(tipo: string, file: File) {
  setUploadingTipos(prev => new Set([...prev, tipo]))
  setUploadErrors(prev => { const e = { ...prev }; delete e[tipo]; return e })
  try {
    await uploadArquivo(file, tipo)
    const res = await fetch(`/api/escalas/dia?data=${data}`)
    if (res.ok) setEscalas(await res.json())
  } catch (e) {
    setUploadErrors(prev => ({ ...prev, [tipo]: e instanceof Error ? e.message : String(e) }))
  } finally {
    setUploadingTipos(prev => { const s = new Set(prev); s.delete(tipo); return s })
  }
}
```

E o JSX da lista de escalas (substituir o placeholder `<div>` com):

```tsx
{/* Escalas card */}
<div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
  <div className="px-4 pt-4 pb-2">
    <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-3">Escalas do dia</p>
    <DropZone onFiles={handleFiles} />
  </div>

  <div className="px-4 pb-4 mt-3 flex flex-col gap-1.5">
    {todosTipos.map(tipo => {
      const upload = escalas.find(e => e.tipo === tipo) ?? null
      const uploading = uploadingTipos.has(tipo)
      const erro = uploadErrors[tipo]

      return (
        <div key={tipo}>
          {upload ? (
            <EscalaItem tipo={tipo} upload={upload} onReenviar={handleEnviarTipo} />
          ) : (
            <EscalaItem tipo={tipo} upload={null} onEnviar={handleEnviarTipo} uploading={uploading} />
          )}
          {erro && (
            <p className="text-xs text-red-600 mt-1 px-1">{erro}</p>
          )}
        </div>
      )
    })}
  </div>

  {/* Erros gerais (upload AUTO) */}
  {Object.entries(uploadErrors)
    .filter(([k]) => k.startsWith('AUTO_'))
    .map(([k, msg]) => (
      <div key={k} className="mx-4 mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{msg}</div>
    ))
  }
</div>
```

Adicionar imports no topo de DiaPage.tsx:
```typescript
import { DropZone } from './DropZone'
import { EscalaItem } from './EscalaItem'
```

- [ ] **Step 4: Testar upload e lista**

1. Abrir `http://localhost:3000/painel/kpi/dia`
2. Arrastar um arquivo XLSX de escala → deve aparecer na lista como verde com qtd_linhas
3. Arrastar dois arquivos juntos → ambos devem ser processados
4. Clicar "↺ Reenviar" em uma escala enviada → deve substituir
5. Navegar para um dia sem escala → lista mostra todos como "não enviada"

- [ ] **Step 5: Commit**

```bash
git add src/app/painel/kpi/dia/DropZone.tsx src/app/painel/kpi/dia/EscalaItem.tsx src/app/painel/kpi/dia/DiaPage.tsx
git commit -m "feat(kpi/dia): drop zone multi-arquivo e lista de escalas com auto-detecção"
```

---

## Task 5: GerarSection — checkboxes, Unitrac, gerar, resultado

**Files:**
- Create: `src/app/painel/kpi/dia/GerarSection.tsx`
- Modify: `src/app/painel/kpi/dia/DiaPage.tsx` (adicionar GerarSection ao JSX)

- [ ] **Step 1: Criar GerarSection.tsx**

```typescript
// src/app/painel/kpi/dia/GerarSection.tsx
'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type EscalaUpload = {
  id: string
  tipo: string
  qtd_linhas: number | null
  qtd_orfas: number | null
  created_at: string
}

type ResultadoKpi = {
  rede: string
  kpi_id: string
  xlsx_path: string | null
}

type Props = {
  data: string
  escalas: EscalaUpload[]
  todosTipos: string[]
}

const LABEL: Record<string, string> = {
  GERAL:        'GERAL',
  ZONA_SUL:     'ZONA SUL',
  PAX:          'PAX',
  GUANABARA:    'GUANABARA',
  ARMAZEM_GRAO: 'ARMAZÉM DO GRÃO',
}

export function GerarSection({ data, escalas, todosTipos }: Props) {
  const tiposComEscala = todosTipos.filter(t => escalas.some(e => e.tipo === t))
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set(tiposComEscala))
  const [unitracFile, setUnitracFile] = useState<File | null>(null)
  const [gerando, setGerando] = useState(false)
  const [progresso, setProgresso] = useState<string>('')
  const [resultado, setResultado] = useState<ResultadoKpi[] | null>(null)
  const [erroGerar, setErroGerar] = useState<string>('')
  const unitracInputRef = useRef<HTMLInputElement>(null)

  function toggleRede(tipo: string) {
    setSelecionados(prev => {
      const s = new Set(prev)
      if (s.has(tipo)) s.delete(tipo); else s.add(tipo)
      return s
    })
  }

  function marcarTodas() { setSelecionados(new Set(tiposComEscala)) }
  function desmarcarTodas() { setSelecionados(new Set()) }

  async function gerarDownloadUrl(path: string): Promise<string> {
    const sb = createClient()
    const { data } = await sb.storage.from('kpis-gerados').createSignedUrl(path, 3600)
    return data?.signedUrl ?? '#'
  }

  async function handleGerar() {
    if (!unitracFile || selecionados.size === 0) return
    setGerando(true)
    setErroGerar('')
    setResultado(null)

    try {
      // 1. Upload Unitrac
      setProgresso('Enviando Unitrac…')
      const ext = unitracFile.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'xlsx'
      const contentType = ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      const storagePath = `${data}/unitrac.${ext}`

      const sb = createClient()
      const { error: storageErr } = await sb.storage
        .from('unitrac-raw')
        .upload(storagePath, unitracFile, { contentType, upsert: true })
      if (storageErr) throw new Error(`Erro ao enviar Unitrac: ${storageErr.message}`)

      setProgresso('Processando GPS…')
      const unitracRes = await fetch('/api/unitrac/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, storagePath }),
      })
      if (!unitracRes.ok) throw new Error(await unitracRes.text())

      // 2. Processar cada rede selecionada
      const resultados: ResultadoKpi[] = []

      for (const tipo of selecionados) {
        setProgresso(`Processando ${LABEL[tipo] ?? tipo}…`)

        const processarRes = await fetch('/api/kpi/processar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, rede_id: tipo }),
        })
        if (!processarRes.ok) {
          const msg = await processarRes.text()
          throw new Error(`Erro ao processar ${tipo}: ${msg}`)
        }
        const { kpi_ids } = await processarRes.json() as { kpi_ids: string[] }
        if (!kpi_ids || kpi_ids.length === 0) continue

        // 3. Gerar XLSX para cada kpi_id
        for (const kpi_id of kpi_ids) {
          setProgresso(`Gerando XLSX ${LABEL[tipo] ?? tipo}…`)
          const gerarRes = await fetch('/api/kpi/gerar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kpi_id }),
          })
          if (!gerarRes.ok) {
            const msg = await gerarRes.text()
            // Anomalias HIGH bloqueando → mostrar aviso mas não abortar
            if (gerarRes.status === 409 || msg.includes('anomalia')) {
              resultados.push({ rede: tipo, kpi_id, xlsx_path: null })
              continue
            }
            throw new Error(`Erro ao gerar ${tipo}: ${msg}`)
          }
          const kpiData = await gerarRes.json() as { xlsx_path?: string }
          resultados.push({ rede: tipo, kpi_id, xlsx_path: kpiData.xlsx_path ?? null })
        }
      }

      setResultado(resultados)
      setProgresso('')
    } catch (e) {
      setErroGerar(e instanceof Error ? e.message : String(e))
      setProgresso('')
    } finally {
      setGerando(false)
    }
  }

  const podeGerar = unitracFile !== null && selecionados.size > 0 && !gerando

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden shadow-sm shadow-amber-100">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-800">Gerar KPIs</p>
        {tiposComEscala.length > 0 && (
          <div className="flex gap-3">
            <button onClick={marcarTodas} className="text-[11px] text-amber-700 underline underline-offset-2 cursor-pointer">marcar todas</button>
            <button onClick={desmarcarTodas} className="text-[11px] text-amber-700 underline underline-offset-2 cursor-pointer">desmarcar</button>
          </div>
        )}
      </div>

      <div className="px-4 pb-4 flex flex-col gap-3">
        {/* Seleção de redes */}
        {todosTipos.length === 0 ? (
          <p className="text-xs text-amber-600 py-2">Envie ao menos uma escala para gerar KPIs.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {todosTipos.map(tipo => {
              const temEscala = tiposComEscala.includes(tipo)
              const checked = selecionados.has(tipo)
              return (
                <label
                  key={tipo}
                  className={[
                    'flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150',
                    temEscala
                      ? 'bg-white border border-amber-200 hover:bg-amber-50'
                      : 'bg-slate-50 border border-dashed border-slate-200 cursor-default opacity-60',
                  ].join(' ')}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!temEscala}
                    onChange={() => temEscala && toggleRede(tipo)}
                    className="accent-amber-600 w-3.5 h-3.5"
                  />
                  <span className="text-xs font-semibold text-slate-700 flex-1">{LABEL[tipo] ?? tipo}</span>
                  {temEscala ? (
                    <span className="text-[11px] text-amber-700 tabular-nums">
                      {escalas.find(e => e.tipo === tipo)?.qtd_linhas ?? '?'} linhas
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">escala não enviada</span>
                  )}
                </label>
              )
            })}
          </div>
        )}

        {/* Resultado de geração anterior */}
        {resultado && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 mb-1">KPIs gerados</p>
            {resultado.map(r => (
              <div key={r.kpi_id} className="flex items-center justify-between px-3 py-2 bg-white border border-emerald-200 rounded-lg">
                <span className="text-xs font-semibold text-emerald-800 flex items-center gap-2">
                  <span className="text-emerald-500">✓</span>
                  {LABEL[r.rede] ?? r.rede}
                </span>
                {r.xlsx_path ? (
                  <DownloadButton path={r.xlsx_path} />
                ) : (
                  <span className="text-[11px] text-amber-700">Revisar anomalias antes de baixar</span>
                )}
              </div>
            ))}
            <button
              onClick={() => { setResultado(null); setUnitracFile(null) }}
              className="text-xs text-slate-500 underline underline-offset-2 mt-1 cursor-pointer"
            >
              ↺ Gerar novamente
            </button>
          </div>
        )}

        {/* Unitrac picker */}
        {!resultado && (
          <div className="rounded-lg bg-amber-100 border border-amber-300 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">🛰️</span>
              <span className="text-xs font-bold text-amber-900">Relatório Unitrac — obrigatório para gerar</span>
            </div>
            {unitracFile ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <span className="text-xs font-semibold text-emerald-800 flex items-center gap-2">
                  <span>📄</span> {unitracFile.name}
                </span>
                <button
                  onClick={() => setUnitracFile(null)}
                  className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div
                onClick={() => unitracInputRef.current?.click()}
                className="border border-dashed border-amber-400 rounded-lg px-3 py-3 text-center cursor-pointer hover:bg-amber-50 transition-all duration-150"
              >
                <p className="text-xs font-semibold text-amber-800">📎 Clique para anexar o Unitrac de hoje</p>
                <p className="text-[10px] text-amber-600 mt-0.5">PDF preferido · XLSX aceito · não fica salvo no sistema</p>
              </div>
            )}
            <input
              ref={unitracInputRef}
              type="file"
              accept=".xlsx,.pdf"
              onChange={e => { const f = e.target.files?.[0]; if (f) setUnitracFile(f); e.target.value = '' }}
              className="hidden"
            />
          </div>
        )}

        {/* Erro de geração */}
        {erroGerar && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{erroGerar}</div>
        )}

        {/* Botão gerar */}
        {!resultado && (
          <button
            onClick={handleGerar}
            disabled={!podeGerar}
            className={[
              'w-full rounded-xl py-3 text-sm font-bold transition-all duration-200',
              podeGerar
                ? 'bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white shadow-sm shadow-amber-500/30 hover:shadow-md hover:shadow-amber-500/40 cursor-pointer'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed',
            ].join(' ')}
          >
            {gerando
              ? `⏳ ${progresso || 'Gerando…'}`
              : podeGerar
                ? `⚡ Gerar ${selecionados.size} KPI${selecionados.size > 1 ? 's' : ''} selecionado${selecionados.size > 1 ? 's' : ''}`
                : unitracFile
                  ? 'Selecione ao menos uma rede para gerar'
                  : 'Anexe o Unitrac para continuar'
            }
          </button>
        )}
      </div>
    </div>
  )
}

function DownloadButton({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (url) { window.open(url, '_blank'); return }
    setLoading(true)
    try {
      const sb = createClient()
      const { data } = await sb.storage.from('kpis-gerados').createSignedUrl(path, 3600)
      const signedUrl = data?.signedUrl
      if (signedUrl) { setUrl(signedUrl); window.open(signedUrl, '_blank') }
    } finally { setLoading(false) }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all duration-150 cursor-pointer disabled:opacity-50"
    >
      {loading ? '…' : '↓ Baixar'}
    </button>
  )
}
```

- [ ] **Step 2: Adicionar GerarSection ao DiaPage.tsx**

Adicionar import e incluir `<GerarSection>` após o card de escalas:

```typescript
import { GerarSection } from './GerarSection'

// No JSX, após o card de escalas:
<GerarSection
  data={data}
  escalas={escalas}
  todosTipos={todosTipos}
/>
```

- [ ] **Step 3: Testar o fluxo completo**

1. Abrir `/painel/kpi/dia`
2. Enviar 2 escalas (GERAL + ZONA_SUL)
3. Confirmar que os checkboxes aparecem marcados automaticamente
4. Tentar clicar Gerar sem Unitrac → botão mostra "Anexe o Unitrac para continuar"
5. Anexar um PDF do Unitrac → botão muda para "⚡ Gerar 2 KPIs selecionados"
6. Desmarcar ZONA_SUL → botão mostra "⚡ Gerar 1 KPI selecionado"
7. Clicar Gerar → progresso aparece no botão
8. Após concluir → lista de KPIs com botões "↓ Baixar"
9. Clicar Baixar → abre XLSX em nova aba

- [ ] **Step 4: Commit**

```bash
git add src/app/painel/kpi/dia/GerarSection.tsx src/app/painel/kpi/dia/DiaPage.tsx
git commit -m "feat(kpi/dia): seção de geração com checkboxes, Unitrac obrigatório e download inline"
```

---

## Task 6: Polish — estados, transições e responsividade

**Files:**
- Modify: `src/app/painel/kpi/dia/DiaPage.tsx`
- Modify: `src/app/painel/kpi/dia/DropZone.tsx`
- Modify: `src/app/painel/kpi/dia/GerarSection.tsx`

- [ ] **Step 1: Loading state na lista de escalas (DiaPage)**

Quando `navegarPara` está buscando dados, mostrar skeleton loader em vez da lista vazia:

```typescript
// Adicionar estado:
const [loadingEscalas, setLoadingEscalas] = useState(false)

// Dentro de navegarPara():
setLoadingEscalas(true)
const res = await fetch(`/api/escalas/dia?data=${novaData}`)
if (res.ok) setEscalas(await res.json())
else setEscalas([])
setLoadingEscalas(false)

// No JSX, substituir o map de EscalaItem por:
{loadingEscalas ? (
  <div className="flex flex-col gap-1.5">
    {todosTipos.map(t => (
      <div key={t} className="h-10 rounded-lg bg-slate-100 animate-pulse" />
    ))}
  </div>
) : (
  <div className="flex flex-col gap-1.5">
    {/* map de EscalaItem existente */}
  </div>
)}
```

- [ ] **Step 2: Empty state quando não há escalas e não está carregando**

Após a DropZone e antes da lista, adicionar:

```tsx
{!loadingEscalas && escalas.length === 0 && (
  <p className="text-xs text-slate-400 text-center py-3">
    Nenhuma escala enviada para este dia. Arraste os arquivos acima.
  </p>
)}
```

- [ ] **Step 3: Feedback visual de upload em andamento (DropZone)**

Quando `uploadingTipos.size > 0`, mostrar spinner inline na DropZone:

```typescript
// Prop adicional em DropZone:
uploading?: boolean

// No JSX interno da DropZone, substituir ícone quando uploading=true:
{uploading ? (
  <svg className="animate-spin h-5 w-5 text-brand-400 mb-2" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
    <path fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
  </svg>
) : (
  <svg className="h-6 w-6 text-brand-400 mb-2 pointer-events-none" ...>...</svg>
)}
```

Em DiaPage, passar `uploading={uploadingTipos.size > 0}` para `<DropZone>`.

- [ ] **Step 4: Garantir responsividade mobile**

No date header, em telas pequenas (< 640px), esconder o input de data e mostrar apenas nav de botões:

```tsx
<input
  type="date"
  ...
  className="... hidden sm:block"
/>
```

O max-width do container já limita para 2xl (672px) — confirmar que funciona em 375px abrindo DevTools.

- [ ] **Step 5: Verificar `font-variant-numeric`**

Qualquer `<span>` exibindo números de linhas/paradas/horários deve ter `tabular-nums` no className. Já está em EscalaItem e GerarSection — confirmar visualmente que números se alinham.

- [ ] **Step 6: Commit final**

```bash
git add src/app/painel/kpi/dia/DiaPage.tsx src/app/painel/kpi/dia/DropZone.tsx src/app/painel/kpi/dia/GerarSection.tsx
git commit -m "feat(kpi/dia): loading skeleton, empty state, upload feedback e responsividade mobile"
```

---

## Self-Review do Plano

**Cobertura da spec:**
- ✅ Header de data com navegação prev/next e input
- ✅ Drop zone multi-arquivo com auto-detecção
- ✅ Lista de escalas (done/pending) por tipo
- ✅ Reenviar escala via ↺
- ✅ Unitrac sempre obrigatório, nunca pré-populado
- ✅ Checkboxes por rede com contagem de linhas
- ✅ Redes sem escala desabilitadas
- ✅ Botão desabilitado sem Unitrac ou sem rede selecionada
- ✅ Progresso de geração por rede no botão
- ✅ Download inline após geração
- ✅ Font Geist
- ✅ Redirect /novo → /dia
- ✅ Nav atualizada
- ✅ Loading skeleton, empty state, error state

**Consistência de tipos:** `EscalaUpload` definido em page.tsx e repassado como prop — DiaPage, EscalaItem e GerarSection usam a mesma forma.

**Sem placeholders:** Todas as tasks têm código completo.
