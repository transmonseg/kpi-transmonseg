'use client'

import { useCallback, useEffect, useState } from 'react'
import { CellSignalSlash, ArrowsLeftRight, Trash, CheckCircle, WarningCircle } from '@phosphor-icons/react/dist/ssr'

type SemRastreador = { id: number; placa: string; inicio: string; fim: string | null; motivo: string | null; responsavel: string }
type Troca = { id: number; data: string; carga: string | null; placa_escala: string; placa_real: string; responsavel: string }

function hoje(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}
const br = (iso: string) => iso.split('-').reverse().join('/')
const ontemDe = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

const campo = 'h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[13px] text-[var(--color-fg)] outline-none transition-colors hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)] [color-scheme:light] dark:[color-scheme:dark]'
const botao = 'inline-flex h-10 items-center justify-center rounded-full bg-[var(--color-navy-700)] px-5 text-[13px] font-semibold text-white transition hover:bg-[var(--color-navy-800)] active:scale-[0.97] disabled:opacity-50'

export default function PlacasDoDiaPage() {
  const [data, setData] = useState(hoje())
  const [sem, setSem] = useState<SemRastreador[] | null>(null)
  const [trocas, setTrocas] = useState<Troca[] | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [fSem, setFSem] = useState({ placa: '', fim: '', motivo: '' })
  const [fTroca, setFTroca] = useState({ placaEscala: '', placaReal: '', carga: '' })

  const carregar = useCallback(async () => {
    setSem(null); setTrocas(null)
    const r = await fetch(`/api/kpi/nutrimax/placas?data=${data}`)
    if (!r.ok) { setMsg({ ok: false, texto: await r.text() }); setSem([]); setTrocas([]); return }
    const j = await r.json() as { semRastreador: SemRastreador[]; trocas: Troca[] }
    setSem(j.semRastreador); setTrocas(j.trocas)
  }, [data])
  useEffect(() => { carregar() }, [carregar])

  async function enviar(metodo: 'POST' | 'PATCH' | 'DELETE', corpo?: unknown, query = '') {
    setEnviando(true); setMsg(null)
    const r = await fetch(`/api/kpi/nutrimax/placas${query}`, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined })
    setEnviando(false)
    if (!r.ok) { setMsg({ ok: false, texto: await r.text() }); return false }
    setMsg({ ok: true, texto: 'Salvo. Gere o KPI do dia de novo para aplicar.' })
    await carregar()
    return true
  }

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <header className="mb-8 flex flex-col gap-1.5">
        <span className="text-overline">Nutry Max · Placas do dia</span>
        <h1 className="text-display text-[34px] leading-none text-[var(--color-fg)] md:text-[40px]">Placas do dia</h1>
        <p className="mt-2 max-w-[65ch] text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
          Informe as placas da escala que estão sem rastreador e as trocas de veículo. O KPI usa isso na próxima vez que for gerado — depois de salvar, gere o KPI do dia de novo.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <label className="text-[13px] font-medium text-[var(--color-fg-muted)]" htmlFor="data">Dia</label>
        <input id="data" type="date" value={data} max={hoje()} onChange={e => e.target.value && setData(e.target.value)} className={campo} />
        {msg && (
          <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${msg.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
            {msg.ok ? <CheckCircle size={15} weight="fill" /> : <WarningCircle size={15} weight="fill" />}{msg.texto}
          </span>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="dash-card p-5">
          <div className="mb-1 flex items-center gap-2">
            <span className="dash-icone inline-flex size-8 items-center justify-center rounded-xl"><CellSignalSlash size={16} weight="bold" /></span>
            <h2 className="text-[15px] font-semibold text-[var(--color-fg)]">Sem rastreador</h2>
          </div>
          <p className="mb-4 text-[12px] text-[var(--color-fg-muted)]">Vale a partir do dia escolhido até você marcar que voltou a rastrear. As NFs dessas placas contam como corretas e aparecem como “sem rastreador”.</p>

          <form className="mb-5 grid grid-cols-2 gap-2" onSubmit={async e => {
            e.preventDefault()
            if (await enviar('POST', { tipo: 'sem_rastreador', placa: fSem.placa, inicio: data, fim: fSem.fim || null, motivo: fSem.motivo })) setFSem({ placa: '', fim: '', motivo: '' })
          }}>
            <input required placeholder="Placa (ex.: TTL5J17)" value={fSem.placa} onChange={e => setFSem({ ...fSem, placa: e.target.value })} className={`${campo} uppercase`} />
            <input type="date" title="Até (opcional)" value={fSem.fim} min={data} onChange={e => setFSem({ ...fSem, fim: e.target.value })} className={campo} />
            <input placeholder="Motivo (opcional)" value={fSem.motivo} onChange={e => setFSem({ ...fSem, motivo: e.target.value })} className={`${campo} col-span-2`} />
            <button disabled={enviando} className={`${botao} col-span-2`}>Marcar sem rastreador a partir de {br(data)}</button>
          </form>

          {sem == null ? <div className="h-16 animate-pulse rounded-xl bg-[var(--color-bg-subtle)]" /> : sem.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-[var(--color-fg-muted)]">Nenhuma placa sem rastreador em {br(data)}.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {sem.map(s => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-[var(--color-fg)]">{s.placa}</p>
                    <p className="truncate text-[12px] text-[var(--color-fg-muted)]">desde {br(s.inicio)}{s.fim ? ` até ${br(s.fim)}` : ''}{s.motivo ? ` · ${s.motivo}` : ''}</p>
                  </div>
                  {!s.fim && (
                    <button type="button" disabled={enviando} onClick={() => enviar('PATCH', { id: s.id, fim: ontemDe(data) < s.inicio ? s.inicio : ontemDe(data) })}
                      className="shrink-0 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-medium transition hover:border-[var(--color-accent)]">
                      Voltou a rastrear
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dash-card p-5">
          <div className="mb-1 flex items-center gap-2">
            <span className="dash-icone inline-flex size-8 items-center justify-center rounded-xl"><ArrowsLeftRight size={16} weight="bold" /></span>
            <h2 className="text-[15px] font-semibold text-[var(--color-fg)]">Troca de placa</h2>
          </div>
          <p className="mb-4 text-[12px] text-[var(--color-fg-muted)]">Quando a carga saiu em outro veículo que não o da escala. Vale só para o dia escolhido. Sem carga, troca todas as cargas da placa nesse dia.</p>

          <form className="mb-5 grid grid-cols-2 gap-2" onSubmit={async e => {
            e.preventDefault()
            if (await enviar('POST', { tipo: 'troca', data, ...fTroca })) setFTroca({ placaEscala: '', placaReal: '', carga: '' })
          }}>
            <input required placeholder="Placa da escala" value={fTroca.placaEscala} onChange={e => setFTroca({ ...fTroca, placaEscala: e.target.value })} className={`${campo} uppercase`} />
            <input required placeholder="Placa que rodou" value={fTroca.placaReal} onChange={e => setFTroca({ ...fTroca, placaReal: e.target.value })} className={`${campo} uppercase`} />
            <input placeholder="Carga (opcional)" value={fTroca.carga} onChange={e => setFTroca({ ...fTroca, carga: e.target.value })} className={`${campo} col-span-2`} />
            <button disabled={enviando} className={`${botao} col-span-2`}>Registrar troca em {br(data)}</button>
          </form>

          {trocas == null ? <div className="h-16 animate-pulse rounded-xl bg-[var(--color-bg-subtle)]" /> : trocas.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-[var(--color-fg-muted)]">Nenhuma troca em {br(data)}.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {trocas.map(t => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-[var(--color-fg)]">{t.placa_escala} <span className="font-normal text-[var(--color-fg-muted)]">→</span> {t.placa_real}</p>
                    <p className="truncate text-[12px] text-[var(--color-fg-muted)]">{t.carga ? `carga ${t.carga}` : 'todas as cargas da placa'} · {t.responsavel}</p>
                  </div>
                  <button type="button" title="Remover" disabled={enviando} onClick={() => enviar('DELETE', undefined, `?id=${t.id}`)}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-fg-muted)] transition hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]">
                    <Trash size={14} weight="bold" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
