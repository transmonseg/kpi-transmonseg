'use client'

import { useState, useCallback, useEffect } from 'react'
import { REDES, REDE_LABEL } from '@/lib/kpi/redes'
import { CheckCircle, WarningCircle, DownloadSimple } from '@phosphor-icons/react/dist/ssr'

type Modo = 'mes' | 'dia'
type Estado = { status: 'idle' | 'enviando' | 'ok' | 'erro' | 'excluindo'; lojas?: number; dias?: number; msg?: string }
type Fechamento = { nome: string | null; em: string }

// formata um timestamptz/ISO em DD/MM
function ddmm(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function InserirManual({ data, onChange }: { data: string; onChange: (d: string) => void }) {
  const [modo, setModo] = useState<Modo>('mes')
  const [estados, setEstados] = useState<Record<string, Estado>>({})
  const [fechados, setFechados] = useState<Record<string, Fechamento>>({})
  const [carregando, setCarregando] = useState(true)
  const mes = data.slice(0, 7)

  // No modo DIA pré-carrega o que já foi enviado pra a data (vindo do banco).
  // No modo MÊS não há pré-load por dia — o operador envia a planilha do mês inteiro.
  useEffect(() => {
    if (modo === 'mes') { setEstados({}); setFechados({}); setCarregando(false); return }
    setCarregando(true)
    setEstados({})
    setFechados({})
    // status de envio por rede + carimbos de fechamento (revisão) da data
    Promise.all([
      fetch(`/api/kpi-manual/historico?data=${data}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/kpi-manual/fechar?data=${data}`).then(r => r.json()).catch(() => ({})),
    ])
      .then(([hist, fech]) => {
        const e: Record<string, Estado> = {}
        for (const [rede, n] of Object.entries(hist.redes ?? {})) e[rede] = { status: 'ok', lojas: n as number }
        setEstados(e)
        const f: Record<string, Fechamento> = {}
        for (const row of (fech.fechados ?? []) as { rede_id: string; fechado_por_nome: string | null; fechado_em: string }[]) {
          f[row.rede_id] = { nome: row.fechado_por_nome, em: row.fechado_em }
        }
        setFechados(f)
      })
      .finally(() => setCarregando(false))
  }, [data, modo])

  const fechar = useCallback(async (rede: string) => {
    try {
      const r = await fetch('/api/kpi-manual/fechar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, rede_id: rede }),
      })
      if (!r.ok) return
      const j = await r.json()
      setFechados(s => ({ ...s, [rede]: { nome: j.fechado_por_nome ?? null, em: j.fechado_em } }))
    } catch { /* silencioso — o estado fica como aberto */ }
  }, [data])

  const reabrir = useCallback(async (rede: string) => {
    try {
      const r = await fetch(`/api/kpi-manual/fechar?data=${data}&rede_id=${rede}`, { method: 'DELETE' })
      if (!r.ok) return
      setFechados(s => { const c = { ...s }; delete c[rede]; return c })
    } catch { /* silencioso */ }
  }, [data])

  const enviar = useCallback(async (rede: string, file: File) => {
    setEstados(s => ({ ...s, [rede]: { status: 'enviando' } }))
    const fd = new FormData()
    fd.set('rede_id', rede); fd.set('file', file)
    if (modo === 'mes') fd.set('mes', mes); else fd.set('data', data)
    try {
      const r = await fetch('/api/kpi-manual/upload', { method: 'POST', body: fd })
      if (!r.ok) { const msg = await r.text(); setEstados(s => ({ ...s, [rede]: { status: 'erro', msg } })); return }
      const j = await r.json()
      setEstados(s => ({ ...s, [rede]: { status: 'ok', lojas: j.inseridas, dias: j.dias } }))
    } catch (e) {
      setEstados(s => ({ ...s, [rede]: { status: 'erro', msg: String(e) } }))
    }
  }, [data, mes, modo])

  const excluir = useCallback(async (rede: string) => {
    if (modo === 'mes' && !window.confirm(`Apagar TODOS os KPIs de ${REDE_LABEL[rede] ?? rede} no mês ${mes}? Essa ação não tem volta.`)) return
    setEstados(s => ({ ...s, [rede]: { status: 'excluindo' } }))
    try {
      // modo mês apaga o MÊS inteiro da rede; modo dia apaga aquele dia
      const qs = modo === 'mes' ? `mes=${mes}&rede_id=${rede}` : `data=${data}&rede_id=${rede}`
      const r = await fetch(`/api/kpi-manual/upload?${qs}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(await r.text())
      setEstados(s => { const c = { ...s }; delete c[rede]; return c })
    } catch {
      setEstados(s => ({ ...s, [rede]: { status: 'erro', msg: 'falha ao excluir' } }))
    }
  }, [data, mes, modo])

  const enviadas = Object.values(estados).filter(e => e.status === 'ok').length
  const totalLojas = Object.values(estados).reduce((a, e) => a + (e.lojas ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* toggle modo */}
          <div data-tour="ins-modo" className="flex flex-col gap-2">
            <label className="text-overline">Como enviar</label>
            <div className="inline-flex h-9 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-0.5 shadow-soft">
              {(['mes', 'dia'] as Modo[]).map(mo => (
                <button
                  key={mo} onClick={() => setModo(mo)}
                  className={[
                    'h-8 cursor-pointer rounded-[calc(var(--radius-md)-2px)] px-3.5 text-[12px] font-medium transition-[background-color,color] duration-150',
                    modo === mo ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)] shadow-soft' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
                  ].join(' ')}
                >{mo === 'mes' ? 'Mês inteiro' : 'Dia específico'}</button>
              ))}
            </div>
          </div>
          {/* seletor de período conforme o modo */}
          <div data-tour="ins-periodo" className="flex flex-col gap-2">
            <label className="text-overline">{modo === 'mes' ? 'Mês dos KPIs' : 'Data dos KPIs'}</label>
            {modo === 'mes' ? (
              <input
                type="month" value={mes} onChange={e => onChange(`${e.target.value}-01`)}
                className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-[13px] text-[var(--color-fg)] outline-none transition-colors hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
              />
            ) : (
              <input
                type="date" value={data} onChange={e => onChange(e.target.value)}
                className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-[13px] text-[var(--color-fg)] outline-none transition-colors hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
              />
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-display text-numeric text-[28px] text-[var(--color-fg)]">{enviadas}<span className="text-[var(--color-fg-subtle)]">/{REDES.length}</span></div>
          <div className="text-overline">redes · <span className="text-numeric" style={{ letterSpacing: 'normal' }}>{totalLojas}</span> lojas</div>
        </div>
      </div>

      {modo === 'mes' && (
        <p className="rounded-[var(--radius-md)] border-l-[3px] border-l-[var(--color-info)] bg-[var(--color-info-soft)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--color-info-soft-fg)]">
          Suba a planilha da rede com as abas de todos os dias — o sistema identifica cada aba-dia e importa o mês inteiro de uma vez.
        </p>
      )}

      {carregando ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[58px] animate-shimmer rounded-[var(--radius-lg)]" style={{ animationDelay: `${i * 40}ms` }} />)}
        </div>
      ) : (
        <div data-tour="ins-grid" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {REDES.map((rede, i) => {
            const e = estados[rede] ?? { status: 'idle' }
            const enviado = e.status === 'ok'
            const ocupado = e.status === 'enviando' || e.status === 'excluindo'
            const fech = modo === 'dia' ? fechados[rede] : undefined
            return (
              <div
                key={rede}
                className={[
                  'relative flex items-center justify-between gap-3 overflow-hidden rounded-[var(--radius-lg)] border px-4 py-3 animate-fade-up transition-[background-color,border-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
                  e.status === 'erro' ? 'border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)]'
                    : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-soft',
                ].join(' ')}
                style={{ animationDelay: `${i * 35}ms` }}
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-[var(--color-fg)]">{REDE_LABEL[rede] ?? rede}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--color-fg-muted)]">
                    {e.status === 'idle' && 'Não enviado'}
                    {ocupado && (
                      <>
                        <span className="inline-block h-3 w-3 animate-[spin_0.7s_linear_infinite] rounded-full border-[1.5px] border-[var(--color-fg-subtle)] border-t-transparent" />
                        {e.status === 'enviando' ? 'Enviando…' : 'Excluindo…'}
                      </>
                    )}
                    {enviado && (
                      <span className="flex items-center gap-1" style={{ color: 'var(--color-success)' }}>
                        <CheckCircle size={12} weight="fill" /> Salvo · {e.dias ? <><span className="text-numeric">{e.dias}</span> dias · </> : null}<span className="text-numeric">{e.lojas}</span> lojas
                      </span>
                    )}
                    {e.status === 'erro' && (
                      <span className="flex items-center gap-1" style={{ color: 'var(--color-danger-soft-fg)' }} title={e.msg}>
                        <WarningCircle size={12} weight="fill" /> {e.msg ? e.msg.slice(0, 44) + (e.msg.length > 44 ? '…' : '') : 'Falha no envio'}
                      </span>
                    )}
                  </div>
                  {modo === 'dia' && (
                    fech ? (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-medium" style={{ color: 'var(--color-success)' }}>
                          <CheckCircle size={11} weight="fill" /> Revisado
                          {fech.nome ? <span className="text-[var(--color-fg-subtle)] font-normal">· {fech.nome}</span> : null}
                          {fech.em ? <span className="text-[var(--color-fg-subtle)] font-normal text-numeric">· {ddmm(fech.em)}</span> : null}
                        </span>
                        <button
                          onClick={() => reabrir(rede)}
                          className="cursor-pointer rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--color-fg-subtle)] transition-colors hover:text-[var(--color-fg)]"
                        >Reabrir</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => fechar(rede)}
                        className="mt-1.5 inline-flex h-6 cursor-pointer items-center gap-1 rounded-[var(--radius-md)] border px-2 text-[10.5px] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]"
                        style={{ borderColor: 'color-mix(in oklab, var(--color-success) 45%, transparent)', color: 'var(--color-success)' }}
                      ><CheckCircle size={11} weight="bold" /> Fechar revisão</button>
                    )
                  )}
                </div>
                {enviado ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <a
                      href={modo === 'mes' ? `/api/dashboard/export-mensal?rede=${rede}&mes=${mes}` : `/api/kpi-manual/export?rede=${rede}&data=${data}`}
                      className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 text-[11px] font-medium text-[var(--color-fg-muted)] transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                      title="Baixar XLSX desta rede"
                    ><DownloadSimple size={12} weight="bold" /> Baixar</a>
                    <button
                      onClick={() => excluir(rede)}
                      className="h-7 cursor-pointer rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 text-[11px] font-medium text-[var(--color-fg-muted)] transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                    >{modo === 'mes' ? 'Limpar' : 'Excluir'}</button>
                  </div>
                ) : (
                  <label className={`h-7 inline-flex shrink-0 cursor-pointer items-center rounded-[var(--radius-md)] border px-2.5 text-[11px] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${e.status === 'erro' ? 'border-[var(--color-danger)] text-[var(--color-danger)]' : 'border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-fg)]'} ${ocupado ? 'pointer-events-none opacity-50' : ''}`}>
                    {e.status === 'erro' ? 'Tentar de novo' : 'Enviar'}
                    <input type="file" accept=".xlsx" className="hidden" onChange={ev => { const f = ev.target.files?.[0]; if (f) enviar(rede, f) }} />
                  </label>
                )}
                {ocupado && (
                  <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-[var(--color-bg-subtle)]">
                    <div className="h-full w-1/3 bg-[var(--color-accent)] animate-progress-sweep" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
