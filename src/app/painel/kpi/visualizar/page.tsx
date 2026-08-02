'use client'

import { useEffect, useMemo, useState } from 'react'
import { WarningCircle, CalendarBlank, Link as LinkIcon, Check, FunnelSimple, X, Globe } from '@phosphor-icons/react/dist/ssr'
import { hojeBR } from '@/lib/data-br'
import { cn } from '@/components/ui'
import { KpiManualCards } from '@/components/kpi/kpi-manual-cards'
import type { RedeManual } from '@/lib/kpi/manual-tipos'

function lerParamsAtual() {
  if (typeof window === 'undefined') return { data: '', redes: null as string[] | null }
  const params = new URLSearchParams(window.location.search)
  const redesParam = params.get('redes')
  return {
    data: params.get('data') ?? '',
    redes: redesParam ? redesParam.split(',').filter(Boolean) : null,
  }
}

export default function VisualizarKpiPage() {
  const [data, setData] = useState('')
  const [redes, setRedes] = useState<RedeManual[] | null>(null)
  const [papel, setPapel] = useState<'admin' | 'gerente' | 'visualizador' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [linkCopiado, setLinkCopiado] = useState(false)
  // null = todas as redes visíveis (comportamento padrão); Set = filtro ativo.
  const [redesVisiveis, setRedesVisiveis] = useState<Set<string> | null>(null)
  const [filtroAberto, setFiltroAberto] = useState(false)
  const [gerandoLinkPublico, setGerandoLinkPublico] = useState(false)
  const [linkPublico, setLinkPublico] = useState<string | null>(null)
  const [linkPublicoCopiado, setLinkPublicoCopiado] = useState(false)
  const [erroLinkPublico, setErroLinkPublico] = useState<string | null>(null)

  useEffect(() => {
    const { data: dataParam0, redes: redesParam } = lerParamsAtual()
    let dataParam = dataParam0

    if (!dataParam) {
      // Sem data na URL: assume hoje, já com a URL certa (link estável —
      // recarregar/copiar mantém o mesmo dia).
      dataParam = hojeBR()
    }
    atualizarUrl(dataParam, redesParam)

    setData(dataParam)
    setRedesVisiveis(redesParam ? new Set(redesParam) : null)
    setLinkPublico(null)
    setErroLinkPublico(null)
    setCarregando(true)
    setErro(null)
    ;(async () => {
      try {
        const res = await fetch(`/api/kpi-manual/dia?data=${dataParam}`)
        if (!res.ok) throw new Error(await res.text())
        const json = await res.json() as { redes: RedeManual[]; data: string; papel: 'admin' | 'gerente' | 'visualizador' }
        setRedes(json.redes)
        setPapel(json.papel)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar o KPI dessa data.')
      } finally {
        setCarregando(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeof window !== 'undefined' ? window.location.search : ''])

  function atualizarUrl(d: string, redesSelecionadas: string[] | null) {
    const params = new URLSearchParams({ data: d })
    if (redesSelecionadas && redesSelecionadas.length > 0) params.set('redes', redesSelecionadas.join(','))
    window.history.replaceState(null, '', `/painel/kpi/visualizar?${params.toString()}`)
  }

  function mudarData(novaData: string) {
    if (!novaData) return
    window.location.href = `/painel/kpi/visualizar?data=${novaData}`
  }

  function resetarLinkPublico() {
    setLinkPublico(null)
    setErroLinkPublico(null)
    setLinkPublicoCopiado(false)
  }

  function alternarRede(redeId: string) {
    resetarLinkPublico()
    setRedesVisiveis(prev => {
      const base = prev ?? new Set((redes ?? []).map(r => r.rede_id))
      const next = new Set(base)
      if (next.has(redeId)) next.delete(redeId)
      else next.add(redeId)
      const todas = redes?.length ?? 0
      const resultado = next.size === todas ? null : next
      atualizarUrl(data, resultado ? [...next] : null)
      return resultado
    })
  }

  function verSomenteEsta(redeId: string) {
    resetarLinkPublico()
    const next = new Set([redeId])
    setRedesVisiveis(next)
    atualizarUrl(data, [...next])
  }

  function limparFiltro() {
    resetarLinkPublico()
    setRedesVisiveis(null)
    atualizarUrl(data, null)
  }

  function copiarLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopiado(true)
      setTimeout(() => setLinkCopiado(false), 2000)
    })
  }

  async function gerarLinkPublico() {
    setGerandoLinkPublico(true)
    setErroLinkPublico(null)
    try {
      const res = await fetch('/api/kpi-manual/link-publico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, redes: [...redesVisiveisResolvido] }),
      })
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json() as { token: string }
      setLinkPublico(`${window.location.origin}/kpi-publico/${json.token}`)
      setLinkPublicoCopiado(false)
    } catch (e) {
      setErroLinkPublico(e instanceof Error ? e.message : 'Não foi possível gerar o link.')
    } finally {
      setGerandoLinkPublico(false)
    }
  }

  function copiarLinkPublico() {
    if (!linkPublico) return
    navigator.clipboard.writeText(linkPublico).then(() => {
      setLinkPublicoCopiado(true)
      setTimeout(() => setLinkPublicoCopiado(false), 2000)
    })
  }

  const redesVisiveisResolvido = useMemo(
    () => redesVisiveis ?? new Set((redes ?? []).map(r => r.rede_id)),
    [redesVisiveis, redes],
  )
  const redesParaExibir = (redes ?? []).filter(r => redesVisiveisResolvido.has(r.rede_id))
  const filtroAtivo = redesVisiveis !== null && redes !== null && redesVisiveis.size < redes.length
  const podeGerarLinkPublico = papel === 'admin' || papel === 'gerente'

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
            KPI Transmonseg
          </span>
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-fg)] md:text-[34px]">
            {data ? `KPI do dia ${data.split('-').reverse().join('/')}` : 'Ver KPIs'}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2">
            <CalendarBlank size={14} weight="bold" className="text-[var(--color-fg-subtle)]" />
            <input
              type="date"
              value={data}
              onChange={e => mudarData(e.target.value)}
              className="bg-transparent text-[13px] text-[var(--color-fg)] outline-none [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>
          {redes && redes.length > 1 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setFiltroAberto(o => !o)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-colors',
                  filtroAtivo
                    ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)] hover:bg-[var(--color-bg-hover)]',
                )}
              >
                <FunnelSimple size={14} weight="bold" />
                {filtroAtivo ? `${redesVisiveisResolvido.size} rede(s)` : 'Todas as redes'}
              </button>
              {filtroAberto && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setFiltroAberto(false)} />
                  <div className="absolute right-0 z-40 mt-2 w-64 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-2 shadow-lg">
                    <div className="mb-1 flex items-center justify-between px-1.5 py-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                        Mostrar redes
                      </span>
                      {filtroAtivo && (
                        <button type="button" onClick={limparFiltro} className="text-[11px] font-medium text-[var(--color-accent)] hover:underline">
                          Mostrar todas
                        </button>
                      )}
                    </div>
                    <div className="flex max-h-72 flex-col overflow-y-auto">
                      {redes.map(r => {
                        const marcada = redesVisiveisResolvido.has(r.rede_id)
                        return (
                          <label
                            key={r.rede_id}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-[13px] text-[var(--color-fg)] hover:bg-[var(--color-bg-hover)]"
                          >
                            <input
                              type="checkbox"
                              checked={marcada}
                              onChange={() => alternarRede(r.rede_id)}
                              className="h-3.5 w-3.5 accent-[var(--color-accent)]"
                            />
                            {r.rede_nome}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={copiarLink}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-hover)]"
          >
            {linkCopiado ? <Check size={14} weight="bold" className="text-[var(--color-success)]" /> : <LinkIcon size={14} weight="bold" />}
            {linkCopiado ? 'Link copiado' : 'Copiar link'}
          </button>
          {podeGerarLinkPublico && (
            <div className="relative">
              <button
                type="button"
                onClick={() => { if (!linkPublico) gerarLinkPublico() }}
                disabled={gerandoLinkPublico}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-navy-700)] px-3.5 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                <Globe size={14} weight="bold" />
                {gerandoLinkPublico ? 'Gerando…' : 'Gerar link público'}
              </button>
              {(linkPublico || erroLinkPublico) && (
                <>
                  <div className="fixed inset-0 z-30" onClick={resetarLinkPublico} />
                  <div className="absolute right-0 z-40 mt-2 w-80 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 shadow-lg">
                    {erroLinkPublico ? (
                      <p className="text-[12.5px] text-[var(--color-danger)]">{erroLinkPublico}</p>
                    ) : (
                      <>
                        <p className="mb-2 text-[11.5px] leading-relaxed text-[var(--color-fg-muted)]">
                          Link público, sem login — abre direto na tabela de{' '}
                          <strong className="text-[var(--color-fg)]">{redesVisiveisResolvido.size} rede(s)</strong> em{' '}
                          <strong className="text-[var(--color-fg)]">{data.split('-').reverse().join('/')}</strong>.
                        </p>
                        <div className="flex items-center gap-1.5">
                          <input
                            readOnly
                            value={linkPublico ?? ''}
                            onFocus={e => e.currentTarget.select()}
                            className="min-w-0 flex-1 truncate rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[11.5px] text-[var(--color-fg-muted)]"
                          />
                          <button
                            type="button"
                            onClick={copiarLinkPublico}
                            className="flex shrink-0 items-center gap-1 rounded-md bg-[var(--color-navy-700)] px-2.5 py-1.5 text-[11.5px] font-medium text-white hover:opacity-90"
                          >
                            {linkPublicoCopiado ? <Check size={12} weight="bold" /> : <LinkIcon size={12} weight="bold" />}
                            {linkPublicoCopiado ? 'Copiado' : 'Copiar'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {filtroAtivo && (
        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          {redesParaExibir.map(r => (
            <span
              key={r.rede_id}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1 pl-2.5 pr-1.5 text-[11.5px] font-medium text-[var(--color-fg-muted)]"
            >
              {r.rede_nome}
              <button type="button" onClick={() => alternarRede(r.rede_id)} className="rounded-full p-0.5 hover:bg-[var(--color-bg-hover)]">
                <X size={10} weight="bold" />
              </button>
            </span>
          ))}
          <button type="button" onClick={limparFiltro} className="ml-1 text-[11.5px] font-medium text-[var(--color-accent)] hover:underline">
            Mostrar todas as redes
          </button>
        </div>
      )}

      {carregando && (
        <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-4">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--color-fg-subtle)] border-t-transparent" />
          <p className="text-[13px] text-[var(--color-fg-muted)]">Carregando…</p>
        </div>
      )}

      {erro && (
        <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-5 py-4">
          <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
          <p className="text-[13px] leading-relaxed text-[var(--color-danger-soft-fg)]">{erro}</p>
        </div>
      )}

      {!carregando && !erro && redes && redes.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-6 py-16 text-center">
          <p className="text-[14px] text-[var(--color-fg-muted)]">
            Nenhum KPI inserido nesse dia (ou nenhuma rede do seu acesso tem dado nele).
          </p>
        </div>
      )}

      {redesParaExibir.length > 0 && (
        <KpiManualCards redes={redesParaExibir} data={data} onVerSomenteEsta={verSomenteEsta} />
      )}
    </div>
  )
}
