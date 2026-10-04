'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { UploadSimple, CheckCircle, WarningCircle, FileXls, DownloadSimple, Trash, ArrowRight } from '@phosphor-icons/react/dist/ssr'
import type { ClienteDash, DiaKpi } from '@/lib/kpi-romaneio/dashboard-kpis'
import { hoje, intervalo, dataCurta, fmtPct, tom, COR_TOM } from './calculos'

type Item = { nome: string; status: 'enviando' | 'ok' | 'erro'; msg?: string; data?: string }

// Inserir KPI (04/10/2026): igual a Benassi -- o dashboard só analisa o que for
// inserido aqui. A data vem da própria planilha; reinserir o mesmo dia substitui.
export function InserirKpi({ cliente, nome, onAbrirDia }: { cliente: ClienteDash; nome: string; onAbrirDia: (d: string) => void }) {
  const [mes, setMes] = useState(hoje().slice(0, 7))
  const [dias, setDias] = useState<DiaKpi[] | null>(null)
  const [itens, setItens] = useState<Item[]>([])
  const [arrastando, setArrastando] = useState(false)
  const [recarregar, setRecarregar] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let vivo = true
    const [de, ate] = intervalo('mes', `${mes}-01`, '', '')
    setDias(null)
    fetch(`/api/dashboard-kpi?cliente=${cliente}&de=${de}&ate=${ate}`).then(r => r.json()).then(j => { if (vivo) setDias(j.dias) }).catch(() => { if (vivo) setDias([]) })
    return () => { vivo = false }
  }, [cliente, mes, recarregar])

  const enviar = useCallback(async (arquivos: File[]) => {
    const xlsx = arquivos.filter(f => f.name.toLowerCase().endsWith('.xlsx'))
    if (!xlsx.length) { setItens(i => [{ nome: arquivos[0]?.name ?? 'arquivo', status: 'erro', msg: 'Envie a planilha .xlsx do KPI.' }, ...i]); return }
    for (const f of xlsx) {
      setItens(i => [{ nome: f.name, status: 'enviando' }, ...i])
      const fd = new FormData()
      fd.set('cliente', cliente)
      fd.set('arquivo', f)
      try {
        const r = await fetch('/api/dashboard-kpi/inserir', { method: 'POST', body: fd })
        const j = await r.json().catch(() => ({ ok: false, erro: 'Resposta inválida do servidor.' }))
        setItens(i => i.map(x => x.nome === f.name && x.status === 'enviando'
          ? j.ok
            ? { nome: f.name, status: 'ok', data: j.data, msg: `${dataCurta(j.data)} · taxa ${fmtPct(j.taxa)} · ${j.nfs.toLocaleString('pt-BR')} NFs · ${j.cargas} cargas${j.substituiu ? ' · substituiu o anterior' : ''}` }
            : { nome: f.name, status: 'erro', msg: j.erro }
          : x))
        if (j.ok) { setMes(String(j.data).slice(0, 7)); setRecarregar(n => n + 1) }
      } catch {
        setItens(i => i.map(x => x.nome === f.name && x.status === 'enviando' ? { nome: f.name, status: 'erro', msg: 'Falha de conexão. Tente de novo.' } : x))
      }
    }
  }, [cliente])

  const excluir = async (data: string) => {
    if (!window.confirm(`Remover o KPI de ${dataCurta(data)} do dashboard?`)) return
    await fetch(`/api/dashboard-kpi?cliente=${cliente}&data=${data}`, { method: 'DELETE' })
    setRecarregar(n => n + 1)
  }

  const [de, ate] = intervalo('mes', `${mes}-01`, '', '')
  const diasDoMes: string[] = []
  for (let d = de; d <= ate; d = new Date(new Date(`${d}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10)) diasDoMes.push(d)
  const porData = new Map((dias ?? []).map(d => [d.data, d]))
  const offset = (new Date(`${de}T12:00:00Z`).getUTCDay() + 6) % 7

  return (
    <div className="space-y-6">
      {/* Envio */}
      <div
        onDragOver={e => { e.preventDefault(); setArrastando(true) }}
        onDragLeave={() => setArrastando(false)}
        onDrop={e => { e.preventDefault(); setArrastando(false); enviar(Array.from(e.dataTransfer.files)) }}
        onClick={() => input.current?.click()}
        className={`dash-card group flex cursor-pointer flex-col items-center px-6 py-12 text-center transition-transform duration-300 ${arrastando ? 'scale-[1.01] !border-[var(--color-accent)]' : 'hover:-translate-y-0.5'}`}
      >
        <input ref={input} type="file" accept=".xlsx" multiple className="hidden" onChange={e => { enviar(Array.from(e.target.files ?? [])); e.target.value = '' }} />
        <span className="dash-icone mb-4 !h-14 !w-14 !rounded-2xl" style={{ ['--dash-tom' as string]: '#1f3864' }}>
          <UploadSimple size={24} weight="bold" />
        </span>
        <p className="text-[18px] font-semibold tracking-[-0.01em] text-[var(--color-fg)]">Arraste a planilha do KPI da {nome}</p>
        <p className="mt-1.5 max-w-lg text-[13px] text-[var(--color-fg-muted)]">
          Ou clique para escolher. Pode enviar vários dias de uma vez — a data sai da própria planilha. Enviar de novo o mesmo dia substitui o anterior.
        </p>
      </div>

      {itens.length > 0 && (
        <ul className="space-y-2">
          {itens.map((it, i) => (
            <li key={`${it.nome}-${i}`} className="dash-card flex items-center gap-3 px-4 py-3 animate-fade-up">
              {it.status === 'enviando' ? <span className="size-5 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
                : it.status === 'ok' ? <CheckCircle size={20} weight="fill" className="text-[var(--color-success)]" />
                : <WarningCircle size={20} weight="fill" className="text-[var(--color-danger)]" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[var(--color-fg)]">{it.nome}</p>
                <p className="text-[12px] text-[var(--color-fg-muted)]">{it.status === 'enviando' ? 'Lendo a planilha…' : it.msg}</p>
              </div>
              {it.status === 'ok' && it.data && (
                <button type="button" onClick={() => onAbrirDia(it.data!)} className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-medium transition hover:border-[var(--color-accent)]">
                  Ver no dashboard <ArrowRight size={12} weight="bold" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Calendário do mês */}
      <section className="dash-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--color-fg)]">KPIs inseridos</h3>
            <p className="text-[12px] text-[var(--color-fg-muted)]">{dias ? `${dias.length} ${dias.length === 1 ? 'dia' : 'dias'} no mês` : 'Carregando…'}</p>
          </div>
          <input type="month" value={mes} onChange={e => setMes(e.target.value)}
            className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[13px] outline-none focus:border-[var(--color-accent)] [color-scheme:light] dark:[color-scheme:dark]" />
        </div>
        <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-medium text-[var(--color-fg-subtle)]">
          {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map(d => <div key={d} className="pb-1">{d}</div>)}
          {Array.from({ length: offset }).map((_, i) => <div key={`v${i}`} />)}
          {diasDoMes.map(d => {
            const k = porData.get(d)
            const parcial = (k?.resumo.aguardando ?? 0) > 0
            return (
              <div key={d} className={`group relative flex min-h-[84px] flex-col items-start justify-between rounded-2xl border p-2.5 text-left transition-[transform,border-color] duration-200 ${k ? 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:-translate-y-0.5 hover:border-[var(--color-accent)]' : 'border-dashed border-[var(--color-border)] bg-transparent'}`}>
                <span className="text-[12px] font-semibold text-[var(--color-fg-muted)]">{Number(d.slice(8))}</span>
                {k ? (
                  <>
                    <button type="button" onClick={() => onAbrirDia(d)} className="text-[16px] font-semibold tabular-nums" style={{ color: parcial ? 'var(--color-warning)' : COR_TOM[tom(k.resumo.taxa)] }}>
                      {fmtPct(k.resumo.taxa)}{parcial && <span className="ml-1 text-[10px] font-semibold">parcial</span>}
                    </button>
                    <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <a href={`/api/dashboard-kpi/arquivo?cliente=${cliente}&data=${d}`} title="Baixar planilha" className="inline-flex size-6 items-center justify-center rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"><DownloadSimple size={12} weight="bold" /></a>
                      <button type="button" onClick={() => excluir(d)} title="Remover" className="inline-flex size-6 items-center justify-center rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)] hover:text-[var(--color-danger)]"><Trash size={12} weight="bold" /></button>
                    </div>
                  </>
                ) : (
                  <span className="text-[11px] text-[var(--color-fg-subtle)]">—</span>
                )}
              </div>
            )
          })}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-[var(--color-fg-subtle)]"><FileXls size={14} /> Use a planilha do KPI gerada pelo sistema (Gerar KPI) — pode ser a versão conferida pela operação.</p>
      </section>
    </div>
  )
}
