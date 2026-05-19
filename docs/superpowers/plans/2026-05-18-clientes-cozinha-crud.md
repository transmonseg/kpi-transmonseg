# Clientes Cozinha — Gestao e CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrar a Matriz de Clientes da Cozinha de um JSON blob no Supabase Storage para uma tabela relacional `clientes_cozinha`, expor CRUD completo via API routes, criar pagina `/painel/cozinha/clientes` com busca/edicao inline/importacao XLSX, e simplificar o uploader removendo o fluxo legado de upload da matriz.

**Architecture:** Supabase table `clientes_cozinha` como fonte de verdade. API routes segmentadas: listagem paginada com busca, importacao via upsert em lote, patch de endereco por id. A rota `POST /api/cozinha` passa a consultar o banco ao inves do Storage. A rota `GET /api/cozinha/matriz` passa a contar rows no DB. O card "Matriz de Clientes" no uploader vira um link para a nova pagina CRUD.

**Tech Stack:** Next.js App Router (nodejs runtime), TypeScript, Supabase (service client para writes/upsert, auth client para verificacao de sessao), Tailwind v4 CSS vars, Phosphor Icons SSR, ExcelJS para parse XLSX.

---

## Arquivos

| Arquivo | Acao |
|---|---|
| `supabase/migrations/20260518_clientes_cozinha.sql` | Criar (migration nova tabela + RLS) |
| `src/app/api/cozinha/clientes/route.ts` | Criar (GET lista paginada) |
| `src/app/api/cozinha/clientes/importar/route.ts` | Criar (POST importacao XLSX) |
| `src/app/api/cozinha/clientes/[id]/route.ts` | Criar (PATCH edicao endereco) |
| `src/app/painel/cozinha/clientes/page.tsx` | Criar (server page + metadata) |
| `src/app/painel/cozinha/clientes/gestor.tsx` | Criar (client component CRUD) |
| `src/app/api/cozinha/route.ts` | Editar (trocar Storage por query DB) |
| `src/app/api/cozinha/matriz/route.ts` | Editar (GET conta DB, POST retorna 410) |
| `src/app/painel/cozinha/uploader.tsx` | Editar (remover logica matriz, card simplificado) |
| `src/app/painel/nav.tsx` | Editar (adicionar item Clientes com UsersThree) |

---

## Task 1: Migration SQL — tabela clientes_cozinha

Criar o arquivo de migration com a tabela, trigger de updated_at e politica RLS.

**Files:**
- [ ] Step 1: Criar `supabase/migrations/20260518_clientes_cozinha.sql`

```sql
-- Migration: clientes_cozinha
-- Tabela relacional para a Matriz de Clientes da Cozinha Industrial

create table if not exists public.clientes_cozinha (
  id            uuid        primary key default gen_random_uuid(),
  codigo        text        not null unique,
  filial        text        not null default '',
  nome          text        not null default '',
  fantasia      text        not null,
  cnpj          text        not null default '',
  cep           text        not null default '',
  endereco      text        not null default '',
  numero        text        not null default '',
  complemento   text        not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Trigger para manter updated_at automatico
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_clientes_cozinha_updated_at on public.clientes_cozinha;
create trigger trg_clientes_cozinha_updated_at
  before update on public.clientes_cozinha
  for each row execute procedure public.set_updated_at();

-- RLS
alter table public.clientes_cozinha enable row level security;

create policy "authenticated_all_clientes_cozinha"
  on public.clientes_cozinha
  for all
  to authenticated
  using (true)
  with check (true);
```

- [ ] Step 2: Verificar que o arquivo foi criado e que o SQL esta correto.
- [ ] Step 3: Aplicar a migration no Supabase via `npx supabase db push` ou pelo Dashboard SQL Editor.
- [ ] Step 4: `npx tsc --noEmit` — deve passar sem erros novos.
- [ ] Step 5: commit `feat: migration clientes_cozinha table with RLS`

---

## Task 2: API Routes — listagem, importacao e patch

Criar as tres rotas de API que dao suporte ao CRUD da pagina de clientes.

**Files:**

- [ ] Step 1: Criar `src/app/api/cozinha/clientes/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Nao autenticado', { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const offset = (page - 1) * PAGE_SIZE

  const svc = createServiceClient()

  // Contagem global de sem endereco (independente do filtro)
  const { count: semEndereco } = await svc
    .from('clientes_cozinha')
    .select('id', { count: 'exact', head: true })
    .eq('endereco', '')

  let query = svc.from('clientes_cozinha').select('*', { count: 'exact' })

  if (q) {
    query = query.or(
      `fantasia.ilike.%${q}%,nome.ilike.%${q}%,codigo.ilike.%${q}%`,
    )
  }

  const { data: clientes, count, error } = await query
    .order('fantasia', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1)

  if (error) {
    return new NextResponse(`Erro ao buscar clientes: ${error.message}`, {
      status: 500,
    })
  }

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return NextResponse.json({
    clientes: clientes ?? [],
    total,
    semEndereco: semEndereco ?? 0,
    page,
    totalPages,
  })
}
```

- [ ] Step 2: Criar `src/app/api/cozinha/clientes/importar/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseMatrizClientes } from '@/lib/parsers/cozinha-matriz'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Nao autenticado', { status: 401 })

  const formData = await req.formData()
  const arquivo = formData.get('arquivo')

  if (!(arquivo instanceof File))
    return new NextResponse('Arquivo nao enviado.', { status: 400 })
  if (!arquivo.name.toLowerCase().endsWith('.xlsx'))
    return new NextResponse('Envie um arquivo .xlsx.', { status: 400 })

  const buffer = await arquivo.arrayBuffer()
  let clientes
  try {
    clientes = await parseMatrizClientes(buffer)
  } catch (e) {
    return new NextResponse(
      e instanceof Error ? e.message : 'Erro ao ler XLSX.',
      { status: 400 },
    )
  }

  if (clientes.length === 0)
    return new NextResponse(
      'Nenhum cliente encontrado. Confirme que e a planilha de clientes.',
      { status: 400 },
    )

  const svc = createServiceClient()

  // Upsert em lotes de 500 para evitar payload gigante
  const BATCH = 500
  for (let i = 0; i < clientes.length; i += BATCH) {
    const lote = clientes.slice(i, i + BATCH)
    const { error } = await svc
      .from('clientes_cozinha')
      .upsert(lote, { onConflict: 'codigo', ignoreDuplicates: false })
    if (error)
      return new NextResponse(
        `Erro ao importar clientes (lote ${i / BATCH + 1}): ${error.message}`,
        { status: 500 },
      )
  }

  return NextResponse.json({ ok: true, total: clientes.length })
}
```

- [ ] Step 3: Criar `src/app/api/cozinha/clientes/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Nao autenticado', { status: 401 })

  const { id } = await params

  let body: { cep?: string; endereco?: string; numero?: string; complemento?: string }
  try {
    body = await req.json()
  } catch {
    return new NextResponse('Body invalido.', { status: 400 })
  }

  const patch: Record<string, string> = {}
  if (body.cep !== undefined) patch.cep = body.cep
  if (body.endereco !== undefined) patch.endereco = body.endereco
  if (body.numero !== undefined) patch.numero = body.numero
  if (body.complemento !== undefined) patch.complemento = body.complemento

  if (Object.keys(patch).length === 0)
    return new NextResponse('Nenhum campo enviado.', { status: 400 })

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('clientes_cozinha')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error)
    return new NextResponse(`Erro ao atualizar: ${error.message}`, {
      status: 500,
    })

  return NextResponse.json(data)
}
```

- [ ] Step 4: `npx tsc --noEmit` — deve passar sem erros novos.
- [ ] Step 5: commit `feat: api routes GET/POST/PATCH clientes_cozinha`

---

## Task 3: Pagina /painel/cozinha/clientes (server page + gestor client)

Criar a page.tsx server-side e o componente client `GestorClientes` com tabela, busca, edicao inline e importacao XLSX.

**Files:**

- [ ] Step 1: Criar `src/app/painel/cozinha/clientes/page.tsx`

```typescript
import type { Metadata } from 'next'
import { GestorClientes } from './gestor'

export const metadata: Metadata = {
  title: 'Clientes — Cozinha | TRANSMONSEG',
}

export default function ClientesCozinhaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-[var(--color-fg)]">
          Clientes da Cozinha
        </h1>
        <p className="mt-1 text-[13px] text-[var(--color-fg-muted)]">
          Gerencie a matriz de clientes usada para gerar os romaneios.
        </p>
      </div>
      <GestorClientes />
    </div>
  )
}
```

- [ ] Step 2: Criar `src/app/painel/cozinha/clientes/gestor.tsx`

```typescript
'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import {
  MagnifyingGlass,
  UploadSimple,
  PencilSimple,
  FloppyDisk,
  X,
  CircleNotch,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react/dist/ssr'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  cn,
} from '@/components/ui'

type Cliente = {
  id: string
  codigo: string
  filial: string
  nome: string
  fantasia: string
  cnpj: string
  cep: string
  endereco: string
  numero: string
  complemento: string
  updated_at: string
}

type ListaResponse = {
  clientes: Cliente[]
  total: number
  semEndereco: number
  page: number
  totalPages: number
}

type EdicaoInline = {
  id: string
  cep: string
  endereco: string
  numero: string
  complemento: string
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export function GestorClientes() {
  const [lista, setLista] = useState<ListaResponse | null>(null)
  const [loadingLista, startLista] = useTransition()
  const [q, setQ] = useState('')
  const debouncedQ = useDebounce(q, 300)
  const [page, setPage] = useState(1)
  const [edicao, setEdicao] = useState<EdicaoInline | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [erroSave, setErroSave] = useState<string | null>(null)
  const [importando, startImport] = useTransition()
  const [erroImport, setErroImport] = useState<string | null>(null)
  const [sucessoImport, setSucessoImport] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const buscar = useCallback(
    (p: number, search: string) => {
      startLista(async () => {
        try {
          const params = new URLSearchParams({ page: String(p) })
          if (search) params.set('q', search)
          const res = await fetch(`/api/cozinha/clientes?${params}`)
          if (!res.ok) throw new Error(await res.text())
          setLista(await res.json() as ListaResponse)
        } catch {
          // silencioso — lista fica como estava
        }
      })
    },
    [],
  )

  useEffect(() => {
    setPage(1)
    buscar(1, debouncedQ)
  }, [debouncedQ, buscar])

  useEffect(() => {
    buscar(page, debouncedQ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  function iniciarEdicao(c: Cliente) {
    setEdicao({
      id: c.id,
      cep: c.cep,
      endereco: c.endereco,
      numero: c.numero,
      complemento: c.complemento,
    })
    setErroSave(null)
  }

  function cancelarEdicao() {
    setEdicao(null)
    setErroSave(null)
  }

  async function salvarEdicao() {
    if (!edicao) return
    setSavingId(edicao.id)
    setErroSave(null)
    try {
      const res = await fetch(`/api/cozinha/clientes/${edicao.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cep: edicao.cep,
          endereco: edicao.endereco,
          numero: edicao.numero,
          complemento: edicao.complemento,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const atualizado = await res.json() as Cliente
      setLista(prev =>
        prev
          ? {
              ...prev,
              clientes: prev.clientes.map(c =>
                c.id === atualizado.id ? atualizado : c,
              ),
            }
          : prev,
      )
      setEdicao(null)
    } catch (e) {
      setErroSave(e instanceof Error ? e.message : 'Erro ao salvar.')
    } finally {
      setSavingId(null)
    }
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setErroImport(null)
    setSucessoImport(null)
    const fd = new FormData()
    fd.append('arquivo', file)
    startImport(async () => {
      try {
        const res = await fetch('/api/cozinha/clientes/importar', {
          method: 'POST',
          body: fd,
        })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json() as { ok: boolean; total: number }
        setSucessoImport(`${data.total} clientes importados com sucesso.`)
        buscar(1, debouncedQ)
        setPage(1)
      } catch (err) {
        setErroImport(err instanceof Error ? err.message : 'Erro ao importar.')
      }
    })
  }

  const isSaving = (id: string) => savingId === id
  const isEditing = (id: string) => edicao?.id === id

  return (
    <div className="space-y-4">
      {/* Stats */}
      {lista && (
        <div className="flex flex-wrap gap-3">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-3">
            <div className="text-[22px] font-semibold leading-tight">{lista.total}</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
              Total
            </div>
          </div>
          <div
            className={cn(
              'rounded-xl border px-4 py-3',
              lista.semEndereco > 0
                ? 'border-transparent bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-fg)]'
                : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg-muted)]',
            )}
          >
            <div className="text-[22px] font-semibold leading-tight">
              {lista.semEndereco}
            </div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider opacity-80">
              Sem endereco
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Clientes</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <MagnifyingGlass
                  size={14}
                  weight="bold"
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)]"
                />
                <Input
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Buscar fantasia, nome, codigo..."
                  className="h-8 w-60 pl-7 text-[13px]"
                />
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => fileRef.current?.click()}
                disabled={importando}
              >
                {importando ? (
                  <CircleNotch size={13} weight="bold" className="animate-spin" />
                ) : (
                  <UploadSimple size={13} weight="bold" />
                )}
                Importar XLSX
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx"
                onChange={handleImport}
                className="hidden"
              />
            </div>
          </div>
        </CardHeader>

        {(erroImport || sucessoImport) && (
          <div className="border-b border-[var(--color-border)] px-5 py-2">
            {erroImport && (
              <div className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-[12px] text-[var(--color-danger-soft-fg)]">
                {erroImport}
              </div>
            )}
            {sucessoImport && (
              <div className="rounded-md bg-[var(--color-success-soft)] px-3 py-2 text-[12px] text-[var(--color-success-soft-fg)]">
                {sucessoImport}
              </div>
            )}
          </div>
        )}

        <CardContent className="p-0">
          {loadingLista && !lista ? (
            <div className="flex items-center justify-center py-12 text-[var(--color-fg-muted)]">
              <CircleNotch size={20} weight="bold" className="animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] text-left">
                    {['Fantasia', 'Codigo', 'CEP', 'Endereco', 'No.', 'Comp.', ''].map(h => (
                      <th
                        key={h}
                        className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lista?.clientes.map(c => {
                    const editing = isEditing(c.id)
                    const saving = isSaving(c.id)
                    const semEnd = !c.endereco
                    return (
                      <tr
                        key={c.id}
                        className={cn(
                          'border-b border-[var(--color-border)] last:border-0 transition-colors',
                          editing
                            ? 'bg-[var(--color-bg-elevated)]'
                            : semEnd
                              ? 'bg-[var(--color-warning-soft)]/20'
                              : 'hover:bg-[var(--color-bg-subtle)]',
                        )}
                      >
                        <td className="max-w-[200px] truncate px-4 py-1.5 font-medium text-[var(--color-fg)]">
                          {c.fantasia}
                        </td>
                        <td className="px-4 py-1.5 font-mono text-[12px] text-[var(--color-fg-muted)]">
                          {c.codigo}
                        </td>
                        {editing ? (
                          <>
                            <td className="px-2 py-1">
                              <Input
                                value={edicao!.cep}
                                onChange={e =>
                                  setEdicao(prev => prev ? { ...prev, cep: e.target.value } : prev)
                                }
                                className="h-7 w-24 text-[12px]"
                                placeholder="CEP"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <Input
                                value={edicao!.endereco}
                                onChange={e =>
                                  setEdicao(prev => prev ? { ...prev, endereco: e.target.value } : prev)
                                }
                                className="h-7 w-48 text-[12px]"
                                placeholder="Endereco"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <Input
                                value={edicao!.numero}
                                onChange={e =>
                                  setEdicao(prev => prev ? { ...prev, numero: e.target.value } : prev)
                                }
                                className="h-7 w-16 text-[12px]"
                                placeholder="No."
                              />
                            </td>
                            <td className="px-2 py-1">
                              <Input
                                value={edicao!.complemento}
                                onChange={e =>
                                  setEdicao(prev => prev ? { ...prev, complemento: e.target.value } : prev)
                                }
                                className="h-7 w-28 text-[12px]"
                                placeholder="Comp."
                              />
                            </td>
                            <td className="px-2 py-1">
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  onClick={salvarEdicao}
                                  disabled={saving}
                                  className="h-6 px-2 text-[11px]"
                                >
                                  {saving ? (
                                    <CircleNotch size={11} weight="bold" className="animate-spin" />
                                  ) : (
                                    <FloppyDisk size={11} weight="bold" />
                                  )}
                                  Salvar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={cancelarEdicao}
                                  disabled={saving}
                                  className="h-6 px-2 text-[11px]"
                                >
                                  <X size={11} weight="bold" />
                                </Button>
                              </div>
                              {erroSave && (
                                <div className="mt-1 text-[11px] text-[var(--color-danger-soft-fg)]">
                                  {erroSave}
                                </div>
                              )}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-1.5 font-mono text-[12px] text-[var(--color-fg-muted)]">
                              {c.cep || <span className="italic opacity-40">-</span>}
                            </td>
                            <td className="max-w-[180px] truncate px-4 py-1.5 text-[var(--color-fg)]">
                              {c.endereco || (
                                <span className="italic text-[var(--color-warning-soft-fg)] opacity-70">
                                  sem endereco
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-1.5 text-[var(--color-fg-muted)]">
                              {c.numero || <span className="italic opacity-40">-</span>}
                            </td>
                            <td className="px-4 py-1.5 text-[var(--color-fg-muted)]">
                              {c.complemento || <span className="italic opacity-40">-</span>}
                            </td>
                            <td className="px-4 py-1.5">
                              <button
                                onClick={() => iniciarEdicao(c)}
                                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-fg)] transition-colors"
                              >
                                <PencilSimple size={11} weight="bold" />
                                Editar
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                  {lista?.clientes.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-10 text-center text-[var(--color-fg-subtle)]"
                      >
                        {q ? 'Nenhum cliente encontrado para essa busca.' : 'Nenhum cliente cadastrado. Importe um XLSX.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginacao */}
          {lista && lista.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3">
              <span className="text-[12px] text-[var(--color-fg-muted)]">
                Pagina {lista.page} de {lista.totalPages} &middot; {lista.total} clientes
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={lista.page <= 1 || loadingLista}
                  className="h-7 w-7 p-0"
                >
                  <CaretLeft size={13} weight="bold" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPage(p => Math.min(lista.totalPages, p + 1))}
                  disabled={lista.page >= lista.totalPages || loadingLista}
                  className="h-7 w-7 p-0"
                >
                  <CaretRight size={13} weight="bold" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] Step 3: `npx tsc --noEmit` — deve passar sem erros novos.
- [ ] Step 4: commit `feat: pagina /painel/cozinha/clientes com CRUD inline`

---

## Task 4: Migrar rota cozinha principal + matriz para usar o banco

Atualizar `POST /api/cozinha` para carregar a matriz do banco ao inves do Storage JSON. Atualizar `GET /api/cozinha/matriz` para contar rows. `POST /api/cozinha/matriz` retorna 410 Gone.

**Files:**

- [ ] Step 1: Editar `src/app/api/cozinha/route.ts` — substituir o bloco try/catch do Storage pelo query do banco.

Localizar este bloco (linhas 39-48):
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

Substituir por:
```typescript
  // Carrega matriz de clientes do banco (opcional — não bloqueia se ausente)
  let matriz: ClienteMatriz[] | undefined
  try {
    const svc = createServiceClient()
    const { data: rows } = await svc
      .from('clientes_cozinha')
      .select('codigo,filial,nome,fantasia,cnpj,cep,endereco,numero,complemento')
      .order('codigo', { ascending: true })
    if (rows && rows.length > 0) {
      matriz = rows as ClienteMatriz[]
    }
  } catch {
    // matriz ausente — gera sem endereços
  }
```

Tambem remover o import de `createServiceClient` se ficar sem outros usos... mas ele ainda e usado acima no mesmo arquivo, entao manter.

- [ ] Step 2: Editar `src/app/api/cozinha/matriz/route.ts` — substituir todo o conteudo pelo seguinte:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Nao autenticado', { status: 401 })

  const svc = createServiceClient()
  const { count, error } = await svc
    .from('clientes_cozinha')
    .select('id', { count: 'exact', head: true })

  if (error) {
    return NextResponse.json({ exists: false, totalClientes: 0, updatedAt: null })
  }

  const total = count ?? 0
  return NextResponse.json({
    exists: total > 0,
    totalClientes: total,
    updatedAt: null,
  })
}

export async function POST() {
  return new NextResponse(
    'Este endpoint foi descontinuado. Use POST /api/cozinha/clientes/importar',
    { status: 410 },
  )
}
```

- [ ] Step 3: `npx tsc --noEmit` — deve passar sem erros novos.
- [ ] Step 4: commit `refactor: cozinha route usa banco ao inves de storage json`

---

## Task 5: Simplificar uploader.tsx + adicionar nav item

Remover toda a logica de upload da matriz do `uploader.tsx`, substituir o Card "Matriz de Clientes" por um card simples com count + link para `/painel/cozinha/clientes`. Adicionar item "Clientes" na nav.

**Files:**

- [ ] Step 1: Editar `src/app/painel/cozinha/uploader.tsx`

**5a — Remover imports nao mais necessarios.**

Localizar e remover `CheckCircle` e `Warning` da lista de imports do Phosphor:
```typescript
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
Substituir por:
```typescript
import {
  UploadSimple,
  DownloadSimple,
  FloppyDisk,
  CircleNotch,
  UsersThree,
  ArrowRight,
} from '@phosphor-icons/react/dist/ssr'
```

Adicionar import do Link do Next.js logo abaixo dos outros imports (antes do import dos componentes UI):
```typescript
import Link from 'next/link'
```

**5b — Remover states e funcao da matriz.**

Localizar e remover as linhas:
```typescript
  const [matriz, setMatriz] = useState<MatrizStatus | null>(null)
  const [arquivoMatriz, setArquivoMatriz] = useState<File | null>(null)
  const [pendingMatriz, startMatriz] = useTransition()
  const [erroMatriz, setErroMatriz] = useState<string | null>(null)
```

Remover o type `MatrizStatus`:
```typescript
type MatrizStatus = {
  exists: boolean
  totalClientes: number
  updatedAt: string | null
}
```

Remover o `useEffect` que faz fetch para `/api/cozinha/matriz`:
```typescript
  useEffect(() => {
    fetch('/api/cozinha/matriz')
      .then(r => r.json())
      .then((d: MatrizStatus) => setMatriz(d))
      .catch(() => {})
  }, [])
```

Remover a funcao `uploadMatriz` inteira:
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

**5c — Substituir o Card "Matriz de Clientes" pelo card simplificado.**

Localizar o Card completo de "Matriz de Clientes" (desde `<Card>` com `CardTitle` "Matriz de Clientes" ate o `</Card>` correspondente, que inclui o estado de CheckCircle/Warning e o form de upload) e substituir por:

```typescript
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersThree size={16} weight="fill" className="text-[var(--color-accent)]" />
            Matriz de Clientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-[13px] text-[var(--color-fg-muted)]">
            Gerencie os clientes cadastrados, importe planilhas XLSX e edite enderecos diretamente na pagina de clientes.
          </p>
          <Link
            href="/painel/cozinha/clientes"
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Gerenciar clientes
            <ArrowRight size={13} weight="bold" />
          </Link>
        </CardContent>
      </Card>
```

- [ ] Step 2: Editar `src/app/painel/nav.tsx` — adicionar item "Clientes" na navegacao.

Localizar o import de icones:
```typescript
import {
  HouseSimple,
  ForkKnife,
  TableIcon,
} from '@phosphor-icons/react/dist/ssr'
```
Substituir por:
```typescript
import {
  HouseSimple,
  ForkKnife,
  TableIcon,
  UsersThree,
} from '@phosphor-icons/react/dist/ssr'
```

Localizar o array `NAV_ITEMS`:
```typescript
const NAV_ITEMS: Item[] = [
  { href: '/painel', label: 'Início', Icon: HouseSimple },
  { href: '/painel/cozinha', label: 'Cozinha', Icon: ForkKnife },
  { href: '/painel/kpi/simples', label: 'KPI', Icon: TableIcon },
]
```
Substituir por:
```typescript
const NAV_ITEMS: Item[] = [
  { href: '/painel', label: 'Início', Icon: HouseSimple },
  { href: '/painel/cozinha', label: 'Cozinha', Icon: ForkKnife },
  { href: '/painel/cozinha/clientes', label: 'Clientes', Icon: UsersThree },
  { href: '/painel/kpi/simples', label: 'KPI', Icon: TableIcon },
]
```

- [ ] Step 3: `npx tsc --noEmit` — deve passar sem erros novos.
- [ ] Step 4: commit `refactor: simplificar uploader matriz + nav item clientes cozinha`

---

## Checklist final

- [ ] Migration aplicada no Supabase (`clientes_cozinha` existe com RLS)
- [ ] `GET /api/cozinha/clientes?q=&page=1` retorna `{ clientes, total, semEndereco, page, totalPages }`
- [ ] `POST /api/cozinha/clientes/importar` com XLSX faz upsert e retorna `{ ok, total }`
- [ ] `PATCH /api/cozinha/clientes/[id]` atualiza e retorna row
- [ ] `POST /api/cozinha` usa banco (nao Storage) para carregar matriz
- [ ] `GET /api/cozinha/matriz` retorna count do banco
- [ ] `POST /api/cozinha/matriz` retorna 410
- [ ] Pagina `/painel/cozinha/clientes` abre com tabela paginada, busca funcional, edicao inline funcional
- [ ] Uploader nao tem mais referencias a `arquivoMatriz`, `pendingMatriz`, `erroMatriz`, `uploadMatriz`, `CheckCircle`, `Warning`, `MatrizStatus`
- [ ] Nav exibe "Clientes" entre Cozinha e KPI
- [ ] `npx tsc --noEmit` passa sem erros em todas as tasks
