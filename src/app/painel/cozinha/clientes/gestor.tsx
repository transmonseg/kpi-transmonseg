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

  const buscar = useCallback((p: number, search: string) => {
    startLista(async () => {
      try {
        const params = new URLSearchParams({ page: String(p) })
        if (search) params.set('q', search)
        const res = await fetch(`/api/cozinha/clientes?${params}`)
        if (!res.ok) throw new Error(await res.text())
        setLista(await res.json() as ListaResponse)
      } catch {
        // silencioso
      }
    })
  }, [])

  useEffect(() => {
    setPage(1)
    buscar(1, debouncedQ)
  }, [debouncedQ, buscar])

  useEffect(() => {
    buscar(page, debouncedQ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  function iniciarEdicao(c: Cliente) {
    setEdicao({ id: c.id, cep: c.cep, endereco: c.endereco, numero: c.numero, complemento: c.complemento })
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
        body: JSON.stringify({ cep: edicao.cep, endereco: edicao.endereco, numero: edicao.numero, complemento: edicao.complemento }),
      })
      if (!res.ok) throw new Error(await res.text())
      const atualizado = await res.json() as Cliente
      setLista(prev => prev ? { ...prev, clientes: prev.clientes.map(c => c.id === atualizado.id ? atualizado : c) } : prev)
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
        const res = await fetch('/api/cozinha/clientes/importar', { method: 'POST', body: fd })
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

  return (
    <div className="space-y-4">
      {lista && (
        <div className="flex flex-wrap gap-3">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-3">
            <div className="text-[22px] font-semibold leading-tight">{lista.total}</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Total</div>
          </div>
          <div className={cn(
            'rounded-xl border px-4 py-3',
            lista.semEndereco > 0
              ? 'border-transparent bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-fg)]'
              : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg-muted)]',
          )}>
            <div className="text-[22px] font-semibold leading-tight">{lista.semEndereco}</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider opacity-80">Sem endereço</div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Clientes</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <MagnifyingGlass size={14} weight="bold" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
                <Input
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Buscar fantasia, nome, código..."
                  className="h-8 w-60 pl-7 text-[13px]"
                />
              </div>
              <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={importando}>
                {importando
                  ? <CircleNotch size={13} weight="bold" className="animate-spin" />
                  : <UploadSimple size={13} weight="bold" />
                }
                Importar XLSX
              </Button>
              <input ref={fileRef} type="file" accept=".xlsx" onChange={handleImport} className="hidden" />
            </div>
          </div>
        </CardHeader>

        {(erroImport || sucessoImport) && (
          <div className="border-b border-[var(--color-border)] px-5 py-2">
            {erroImport && (
              <div className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-[12px] text-[var(--color-danger-soft-fg)]">{erroImport}</div>
            )}
            {sucessoImport && (
              <div className="rounded-md bg-[var(--color-success-soft)] px-3 py-2 text-[12px] text-[var(--color-success-soft-fg)]">{sucessoImport}</div>
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
                    {['Fantasia', 'Código', 'CEP', 'Endereço', 'Nº', 'Comp.', ''].map(h => (
                      <th key={h} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lista?.clientes.map(c => {
                    const editing = edicao?.id === c.id
                    const saving = savingId === c.id
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
                        <td className="max-w-[200px] truncate px-4 py-1.5 font-medium text-[var(--color-fg)]">{c.fantasia}</td>
                        <td className="px-4 py-1.5 font-mono text-[12px] text-[var(--color-fg-muted)]">{c.codigo}</td>
                        {editing ? (
                          <>
                            <td className="px-2 py-1">
                              <Input value={edicao!.cep} onChange={e => setEdicao(prev => prev ? { ...prev, cep: e.target.value } : prev)} className="h-7 w-24 text-[12px]" placeholder="CEP" />
                            </td>
                            <td className="px-2 py-1">
                              <Input value={edicao!.endereco} onChange={e => setEdicao(prev => prev ? { ...prev, endereco: e.target.value } : prev)} className="h-7 w-48 text-[12px]" placeholder="Endereço" />
                            </td>
                            <td className="px-2 py-1">
                              <Input value={edicao!.numero} onChange={e => setEdicao(prev => prev ? { ...prev, numero: e.target.value } : prev)} className="h-7 w-16 text-[12px]" placeholder="Nº" />
                            </td>
                            <td className="px-2 py-1">
                              <Input value={edicao!.complemento} onChange={e => setEdicao(prev => prev ? { ...prev, complemento: e.target.value } : prev)} className="h-7 w-28 text-[12px]" placeholder="Comp." />
                            </td>
                            <td className="px-2 py-1">
                              <div className="flex items-center gap-1">
                                <Button size="sm" onClick={salvarEdicao} disabled={saving} className="h-6 px-2 text-[11px]">
                                  {saving ? <CircleNotch size={11} weight="bold" className="animate-spin" /> : <FloppyDisk size={11} weight="bold" />}
                                  Salvar
                                </Button>
                                <Button size="sm" variant="ghost" onClick={cancelarEdicao} disabled={saving} className="h-6 px-2 text-[11px]">
                                  <X size={11} weight="bold" />
                                </Button>
                              </div>
                              {erroSave && <div className="mt-1 text-[11px] text-[var(--color-danger-soft-fg)]">{erroSave}</div>}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-1.5 font-mono text-[12px] text-[var(--color-fg-muted)]">
                              {c.cep || <span className="italic opacity-40">—</span>}
                            </td>
                            <td className="max-w-[180px] truncate px-4 py-1.5 text-[var(--color-fg)]">
                              {c.endereco || <span className="italic text-[var(--color-warning-soft-fg)] opacity-70">sem endereço</span>}
                            </td>
                            <td className="px-4 py-1.5 text-[var(--color-fg-muted)]">
                              {c.numero || <span className="italic opacity-40">—</span>}
                            </td>
                            <td className="px-4 py-1.5 text-[var(--color-fg-muted)]">
                              {c.complemento || <span className="italic opacity-40">—</span>}
                            </td>
                            <td className="px-4 py-1.5">
                              <button
                                onClick={() => iniciarEdicao(c)}
                                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-fg)]"
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
                      <td colSpan={7} className="px-4 py-10 text-center text-[var(--color-fg-subtle)]">
                        {q ? 'Nenhum cliente encontrado para essa busca.' : 'Nenhum cliente cadastrado. Importe um XLSX para começar.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {lista && lista.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3">
              <span className="text-[12px] text-[var(--color-fg-muted)]">
                Página {lista.page} de {lista.totalPages} · {lista.total} clientes
              </span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={lista.page <= 1 || loadingLista} className="h-7 w-7 p-0">
                  <CaretLeft size={13} weight="bold" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPage(p => Math.min(lista.totalPages, p + 1))} disabled={lista.page >= lista.totalPages || loadingLista} className="h-7 w-7 p-0">
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
