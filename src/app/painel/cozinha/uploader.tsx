'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  cn,
} from '@/components/ui'

type Status = 'completa' | 'sem-placa' | 'sem-motorista' | 'vazia'

type Rota = {
  rota: string
  motorista: string
  placa: string
  veiculo: string
  status: Status
  duplicada: boolean
}

type Estatisticas = {
  total: number
  completas: number
  semPlaca: number
  semMotorista: number
  vazias: number
  duplicadas: number
}

type Resultado = {
  rotas: Rota[]
  estatisticas: Estatisticas
  declaradas: number
  xlsxBase64: string
  pdfBase64: string
  nomeBase: string
}

type FiltroExport = 'todos' | 'pendentes' | 'completas'
type FiltroLista = 'todas' | 'problemas' | 'completas'

const SEM_VALOR = '—'

export function CozinhaUploader() {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [dataRef, setDataRef] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [rotasEditadas, setRotasEditadas] = useState<Rota[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [pendingRegen, startRegen] = useTransition()
  const [filtro, setFiltro] = useState<FiltroLista>('todas')
  const [filtroExport, setFiltroExport] = useState<FiltroExport>('todos')
  const [pendingDownload, startDownload] = useTransition()

  async function processar() {
    if (!arquivo) {
      setErro('Selecione um arquivo XLSX.')
      return
    }
    setErro(null)
    setResultado(null)
    setRotasEditadas(null)

    const fd = new FormData()
    fd.append('arquivo', arquivo)
    fd.append('dataRef', dataRef)

    startTransition(async () => {
      try {
        const res = await fetch('/api/cozinha', { method: 'POST', body: fd })
        if (!res.ok) throw new Error((await res.text()) || 'Erro ao processar.')
        const data = (await res.json()) as Resultado
        setResultado(data)
        setRotasEditadas(data.rotas)
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e))
      }
    })
  }

  async function salvarEdicoes() {
    if (!rotasEditadas || !resultado) return
    setErro(null)
    const dataFormatada = formatarDataPtBr(dataRef)

    startRegen(async () => {
      try {
        const res = await fetch('/api/cozinha/regenerar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rotas: rotasEditadas,
            dataRef: dataFormatada,
            nomeBase: resultado.nomeBase,
          }),
        })
        if (!res.ok) throw new Error((await res.text()) || 'Erro ao regenerar.')
        const data = (await res.json()) as Resultado
        setResultado(data)
        setRotasEditadas(data.rotas)
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e))
      }
    })
  }

  function editarCelula(
    idx: number,
    campo: 'motorista' | 'placa',
    valor: string,
  ) {
    if (!rotasEditadas) return
    const novas = [...rotasEditadas]
    novas[idx] = { ...novas[idx], [campo]: valor }
    setRotasEditadas(novas)
  }

  function baixar(base64: string, nome: string, mime: string) {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const blob = new Blob([new Uint8Array(bytes)], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nome
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function baixarFiltrado(tipo: 'xlsx' | 'pdf') {
    if (!rotasEditadas || !resultado) return

    const rotasFiltExport = (() => {
      if (filtroExport === 'pendentes')
        return rotasEditadas.filter((r) => r.status !== 'completa')
      if (filtroExport === 'completas')
        return rotasEditadas.filter((r) => r.status === 'completa')
      return rotasEditadas
    })()

    const dataFormatada = formatarDataPtBr(dataRef)

    startDownload(async () => {
      try {
        const res = await fetch('/api/cozinha/regenerar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rotas: rotasFiltExport,
            dataRef: dataFormatada,
            nomeBase: resultado.nomeBase,
          }),
        })
        if (!res.ok)
          throw new Error((await res.text()) || 'Erro ao gerar arquivo.')
        const data = (await res.json()) as Resultado

        const sufixo =
          filtroExport === 'pendentes'
            ? '_PENDENTES'
            : filtroExport === 'completas'
              ? '_COMPLETAS'
              : ''
        if (tipo === 'xlsx') {
          baixar(
            data.xlsxBase64,
            `${resultado.nomeBase}${sufixo}_LIMPO.xlsx`,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          )
        } else {
          baixar(
            data.pdfBase64,
            `${resultado.nomeBase}${sufixo}_LIMPO.pdf`,
            'application/pdf',
          )
        }
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e))
      }
    })
  }

  const editou = useMemo(() => {
    if (!rotasEditadas || !resultado) return false
    return rotasEditadas.some(
      (r, i) =>
        r.motorista !== resultado.rotas[i]?.motorista ||
        r.placa !== resultado.rotas[i]?.placa,
    )
  }, [rotasEditadas, resultado])

  const rotasFiltradas = useMemo(() => {
    if (!rotasEditadas) return []
    if (filtro === 'todas') return rotasEditadas
    if (filtro === 'completas')
      return rotasEditadas.filter((r) => r.status === 'completa')
    return rotasEditadas.filter((r) => r.status !== 'completa')
  }, [rotasEditadas, filtro])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload da escala</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cozinha-arquivo">Arquivo XLSX</Label>
              <label
                htmlFor="cozinha-arquivo"
                className={cn(
                  'flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 text-center transition-colors',
                  'border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)]',
                  'hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-hover)]',
                )}
              >
                <IconUpload className="mb-2 h-6 w-6 text-[var(--color-fg-subtle)]" />
                <span className="text-[13px] font-medium text-[var(--color-fg)]">
                  {arquivo ? arquivo.name : 'Clique para selecionar'}
                </span>
                <span className="mt-0.5 text-[11px] text-[var(--color-fg-muted)]">
                  Apenas .xlsx
                </span>
                <input
                  id="cozinha-arquivo"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cozinha-data">Data de referência</Label>
              <Input
                id="cozinha-data"
                type="date"
                value={dataRef}
                onChange={(e) => setDataRef(e.target.value)}
              />
              <p className="text-[11px] text-[var(--color-fg-muted)]">
                Aparece no cabeçalho do XLSX e PDF gerados.
              </p>
            </div>
          </div>

          {erro && (
            <div
              className={cn(
                'rounded-md border px-3 py-2 text-[13px]',
                'border-transparent bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-fg)]',
              )}
            >
              {erro}
            </div>
          )}

          <div>
            <Button
              onClick={processar}
              disabled={pending || !arquivo}
              size="md"
            >
              {pending ? (
                <>
                  <Spinner className="mr-1.5" />
                  Processando...
                </>
              ) : (
                'Processar escala'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {resultado && rotasEditadas && (
        <>
          <AlertasResumo
            estatisticas={resultado.estatisticas}
            declaradas={resultado.declaradas}
            rotas={rotasEditadas}
          />

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-3">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-[var(--color-fg)]">
                  Rotas
                </h2>
                <FiltroChips
                  filtro={filtro}
                  setFiltro={setFiltro}
                  stats={resultado.estatisticas}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {editou && (
                  <Button
                    onClick={salvarEdicoes}
                    disabled={pendingRegen}
                    size="sm"
                    className="bg-[var(--color-warning)] text-white hover:opacity-90"
                  >
                    {pendingRegen ? (
                      <>
                        <Spinner />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <IconSave />
                        Salvar edições
                      </>
                    )}
                  </Button>
                )}
                <div className="ml-1 flex items-center gap-1.5 border-l border-[var(--color-border)] pl-3">
                  <span className="text-[11px] font-medium text-[var(--color-fg-muted)]">
                    Exportar:
                  </span>
                  <FiltroExportControl
                    filtro={filtroExport}
                    setFiltro={setFiltroExport}
                    stats={resultado.estatisticas}
                  />
                </div>
                <Button
                  onClick={() => baixarFiltrado('xlsx')}
                  disabled={editou || pendingDownload}
                  title={editou ? 'Salve as edições primeiro' : undefined}
                  size="sm"
                  variant="primary"
                >
                  {pendingDownload ? <Spinner /> : <IconDownload />}
                  XLSX
                </Button>
                <Button
                  onClick={() => baixarFiltrado('pdf')}
                  disabled={editou || pendingDownload}
                  title={editou ? 'Salve as edições primeiro' : undefined}
                  size="sm"
                  variant="secondary"
                >
                  {pendingDownload ? <Spinner /> : <IconDownload />}
                  PDF
                </Button>
              </div>
            </div>

            <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-5 py-2 text-[12px] text-[var(--color-fg-muted)]">
              Clique em qualquer célula de motorista ou placa para editar.
              {editou && (
                <span className="ml-2 font-semibold text-[var(--color-warning-soft-fg)]">
                  Você tem alterações não salvas.
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] text-left">
                    <th className="w-12 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                      #
                    </th>
                    <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                      Rota
                    </th>
                    <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                      Motorista
                    </th>
                    <th className="w-32 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                      Placa
                    </th>
                    <th className="w-28 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                      Veículo
                    </th>
                    <th className="w-32 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rotasFiltradas.map((r) => {
                    const idx = rotasEditadas.indexOf(r)
                    const problema =
                      r.status === 'vazia' ||
                      r.status === 'sem-placa' ||
                      r.status === 'sem-motorista'
                    return (
                      <tr
                        key={idx}
                        className={cn(
                          'border-b border-[var(--color-border)] last:border-0',
                          problema && 'bg-[var(--color-warning-soft)]/30',
                        )}
                      >
                        <td className="px-4 py-1.5 text-[var(--color-fg-muted)]">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-1.5 font-medium text-[var(--color-fg)]">
                          <div className="flex items-center gap-2">
                            <span>{r.rota}</span>
                            {r.duplicada && <Badge variant="warning">DUP</Badge>}
                          </div>
                        </td>
                        <td className="px-2 py-1">
                          <CelulaEditavel
                            valor={r.motorista}
                            onChange={(v) => editarCelula(idx, 'motorista', v)}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <CelulaEditavel
                            valor={r.placa}
                            onChange={(v) => editarCelula(idx, 'placa', v)}
                            monospace
                          />
                        </td>
                        <td className="px-4 py-1.5 text-[11px] text-[var(--color-fg-muted)]">
                          {r.veiculo}
                        </td>
                        <td className="px-4 py-1.5 text-center">
                          <StatusBadge status={r.status} />
                        </td>
                      </tr>
                    )
                  })}
                  {rotasFiltradas.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-[var(--color-fg-subtle)]"
                      >
                        Nenhuma rota nesse filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function AlertasResumo({
  estatisticas,
  declaradas,
  rotas,
}: {
  estatisticas: Estatisticas
  declaradas: number
  rotas: Rota[]
}) {
  const parseadas = new Set(rotas.map((r) => r.rota)).size
  const divergencia = declaradas > parseadas

  type Tone = 'default' | 'success' | 'warning' | 'neutral'
  const itens: { label: string; valor: number; tone: Tone }[] = [
    { label: 'Total', valor: estatisticas.total, tone: 'default' },
    { label: 'Completas', valor: estatisticas.completas, tone: 'success' },
    {
      label: 'Sem placa',
      valor: estatisticas.semPlaca,
      tone: estatisticas.semPlaca > 0 ? 'warning' : 'neutral',
    },
    {
      label: 'Sem motorista',
      valor: estatisticas.semMotorista,
      tone: estatisticas.semMotorista > 0 ? 'warning' : 'neutral',
    },
    {
      label: 'Vazias',
      valor: estatisticas.vazias,
      tone: estatisticas.vazias > 0 ? 'warning' : 'neutral',
    },
    {
      label: 'Duplicadas',
      valor: estatisticas.duplicadas,
      tone: estatisticas.duplicadas > 0 ? 'warning' : 'neutral',
    },
  ]

  const toneCard: Record<Tone, string> = {
    default:
      'border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)]',
    success:
      'border-transparent bg-[var(--color-success-soft)] text-[var(--color-success-soft-fg)]',
    warning:
      'border-transparent bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-fg)]',
    neutral:
      'border-[var(--color-border)] bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)]',
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {itens.map((it) => (
          <div
            key={it.label}
            className={cn(
              'rounded-xl border px-4 py-3 transition-colors',
              toneCard[it.tone],
            )}
          >
            <div className="text-[22px] font-semibold leading-tight tracking-tight">
              {it.valor}
            </div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider opacity-80">
              {it.label}
            </div>
          </div>
        ))}
      </div>
      <div
        className={cn(
          'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px]',
          divergencia
            ? 'border-transparent bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-fg)]'
            : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg-muted)]',
        )}
      >
        <span>
          <span className="font-semibold">{declaradas}</span> declaradas
        </span>
        <span className="opacity-40">/</span>
        <span>
          <span className="font-semibold">{parseadas}</span> parseadas
        </span>
        {divergencia && (
          <Badge variant="danger">
            {declaradas - parseadas} bloco
            {Math.abs(declaradas - parseadas) !== 1 ? 's' : ''} não lido
            {Math.abs(declaradas - parseadas) !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>
    </div>
  )
}

function FiltroChips({
  filtro,
  setFiltro,
  stats,
}: {
  filtro: FiltroLista
  setFiltro: (f: FiltroLista) => void
  stats: Estatisticas
}) {
  const problemas = stats.total - stats.completas
  const opts: { id: FiltroLista; label: string; count: number }[] = [
    { id: 'todas', label: 'Todas', count: stats.total },
    { id: 'problemas', label: 'Com problemas', count: problemas },
    { id: 'completas', label: 'Completas', count: stats.completas },
  ]
  return (
    <div className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-0.5">
      {opts.map((o) => {
        const active = filtro === o.id
        return (
          <button
            key={o.id}
            onClick={() => setFiltro(o.id)}
            className={cn(
              'rounded-[5px] px-2 py-0.5 text-[11px] font-medium transition-colors',
              active
                ? 'bg-[var(--color-bg-elevated)] text-[var(--color-fg)] shadow-sm'
                : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
            )}
          >
            {o.label}{' '}
            <span className="text-[var(--color-fg-subtle)]">({o.count})</span>
          </button>
        )
      })}
    </div>
  )
}

function FiltroExportControl({
  filtro,
  setFiltro,
  stats,
}: {
  filtro: FiltroExport
  setFiltro: (f: FiltroExport) => void
  stats: Estatisticas
}) {
  const pendentes = stats.total - stats.completas
  const opts: { id: FiltroExport; label: string; count: number }[] = [
    { id: 'todos', label: 'Todos', count: stats.total },
    { id: 'pendentes', label: 'Pendentes', count: pendentes },
    { id: 'completas', label: 'Completas', count: stats.completas },
  ]
  return (
    <div className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-0.5">
      {opts.map((o) => {
        const active = filtro === o.id
        return (
          <button
            key={o.id}
            onClick={() => setFiltro(o.id)}
            className={cn(
              'rounded-[5px] px-2 py-0.5 text-[11px] font-medium transition-colors',
              active
                ? 'bg-[var(--color-bg-elevated)] text-[var(--color-fg)] shadow-sm'
                : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
            )}
          >
            {o.label}{' '}
            <span className="text-[var(--color-fg-subtle)]">({o.count})</span>
          </button>
        )
      })}
    </div>
  )
}

function StatusBadge({ status }: { status: Status }) {
  const cfg: Record<
    Status,
    { label: string; variant: 'success' | 'warning' | 'danger' | 'default' }
  > = {
    completa: { label: 'OK', variant: 'success' },
    'sem-placa': { label: 'SEM PLACA', variant: 'warning' },
    'sem-motorista': { label: 'SEM MOT.', variant: 'warning' },
    vazia: { label: 'VAZIA', variant: 'danger' },
  }
  const c = cfg[status]
  return <Badge variant={c.variant}>{c.label}</Badge>
}

function CelulaEditavel({
  valor,
  onChange,
  monospace,
}: {
  valor: string
  onChange: (v: string) => void
  monospace?: boolean
}) {
  const vazio = !valor || valor === SEM_VALOR
  return (
    <input
      value={vazio ? '' : valor}
      placeholder={SEM_VALOR}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] transition-colors',
        'placeholder:text-[var(--color-fg-subtle)]',
        'hover:border-[var(--color-border)] hover:bg-[var(--color-bg-subtle)]',
        'focus:border-[var(--color-accent)] focus:bg-[var(--color-bg-elevated)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30',
        monospace && 'font-mono text-[12px]',
        vazio
          ? 'italic text-[var(--color-fg-subtle)]'
          : 'text-[var(--color-fg)]',
      )}
    />
  )
}

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={cn('h-3.5 w-3.5 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-25"
      />
      <path
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
  )
}

function IconUpload({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function IconDownload() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function IconSave() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  )
}

function formatarDataPtBr(iso: string): string {
  if (!iso) return ''
  const [a, m, d] = iso.split('-')
  if (!a || !m || !d) return ''
  return `${d}/${m}/${a}`
}
