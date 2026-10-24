'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CopySimple, DownloadSimple, WarningCircle, CaretLeft, Check } from '@phosphor-icons/react/dist/ssr'
import { secoesResumoDia, type ResumoDia } from '@/lib/kpi-romaneio/resumo-dia'
import { buscarComSessao, lerJson, SessaoVencida } from '@/lib/sessao-fetch'

// F3-02 (ACH-03) / F3-09: Resumo do dia montado por regra, sem IA. Uma ação
// por tela: copiar o texto ou baixar o PDF. Nada é enviado daqui.

type Cliente = 'nutrimax' | 'rioquality'
const NOME_CLIENTE: Record<Cliente, string> = { nutrimax: 'Nutry Max', rioquality: 'Rio Quality' }
type Resposta = { resumo: ResumoDia; texto: string; nomeCliente: string; avisos: string[]; clientes: Cliente[]; hoje: string }

const daUrl = () => (typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search))

export default function ResumoDiaPage() {
  const [cliente, setCliente] = useState<Cliente>(() => (daUrl().get('cliente') === 'rioquality' ? 'rioquality' : 'nutrimax'))
  const [data, setData] = useState<string | null>(() => daUrl().get('data'))
  const [r, setR] = useState<Resposta | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null)
    try {
      const resp = await buscarComSessao(`/api/kpi/resumo-dia?cliente=${cliente}${data ? `&data=${data}` : ''}`, { cache: 'no-store' })
      if (resp.status === 403 && cliente === 'nutrimax') { setCliente('rioquality'); return }
      if (resp.status === 404) { setR(null); setErro('Nada calculado nem guardado deste dia.'); return }
      if (!resp.ok) throw new Error(await resp.text())
      setR(await lerJson<Resposta>(resp))
    } catch (e) {
      if (e instanceof SessaoVencida) return
      setErro('Não consegui montar o resumo agora. Tente de novo em instantes.')
    } finally { setCarregando(false) }
  }, [cliente, data])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    const u = new URL(window.location.href)
    u.searchParams.set('cliente', cliente)
    if (data) u.searchParams.set('data', data); else u.searchParams.delete('data')
    window.history.replaceState(null, '', u)
  }, [cliente, data])

  async function copiar() {
    if (!r) return
    try { await navigator.clipboard.writeText(r.texto); setCopiado(true); setTimeout(() => setCopiado(false), 2500) } catch { setErro('O navegador não deixou copiar. Use Baixar PDF.') }
  }

  const resumo = r?.resumo
  const diaMostrado = resumo?.data ?? data
  const linkAoVivo = `/painel/ao-vivo?cliente=${cliente}${diaMostrado && r && diaMostrado !== r.hoje ? `&data=${diaMostrado}` : ''}`

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <Link href={linkAoVivo} className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
            <CaretLeft size={13} weight="bold" />Ao vivo
          </Link>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-[var(--color-fg)]">Resumo do dia</h1>
          <p className="text-[14px] text-[var(--color-fg-muted)]">{NOME_CLIENTE[cliente]}{resumo ? ` · ${resumo.data.split('-').reverse().join('/')}${resumo.parcial ? ' · parcial, o dia ainda não fechou' : ''}` : ''}. Montado por regra a partir do KPI, sem IA.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {r && r.clientes.length > 1 && (
            <div role="tablist" aria-label="Cliente" className="flex h-10 items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-1">
              {r.clientes.map(c => (
                <button key={c} type="button" role="tab" aria-selected={c === cliente} onClick={() => setCliente(c)}
                  className={`h-8 rounded-full px-3.5 text-[13px] font-semibold transition-colors ${c === cliente ? 'bg-[var(--color-navy-700)] text-white' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'}`}>
                  {NOME_CLIENTE[c]}
                </button>
              ))}
            </div>
          )}
          <label className="inline-flex h-10 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 text-[13px] font-semibold text-[var(--color-fg)]">
            <span className="sr-only">Dia</span>
            <input type="date" value={diaMostrado ?? ''} max={r?.hoje} onChange={e => setData(e.target.value || null)} className="bg-transparent outline-none [color-scheme:light] dark:[color-scheme:dark]" />
          </label>
          {r && (
            <>
              <button type="button" onClick={copiar} className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 text-[13px] font-semibold text-[var(--color-fg)] transition hover:border-[var(--color-border-strong)] active:scale-[0.98]">
                {copiado ? <Check size={15} weight="bold" /> : <CopySimple size={15} weight="bold" />}{copiado ? 'Copiado' : 'Copiar texto'}
              </button>
              <a href={`/api/kpi/resumo-dia?cliente=${cliente}&data=${resumo!.data}&formato=pdf`} className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--color-navy-700)] px-5 text-[13px] font-semibold text-white transition hover:bg-[var(--color-navy-800)]">
                <DownloadSimple size={15} weight="bold" />Baixar PDF
              </a>
            </>
          )}
        </div>
      </header>

      {r?.avisos.map(a => (
        <p key={a} className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-warning-soft)] px-4 py-2.5 text-[13px] text-[var(--color-warning-soft-fg)]">
          <WarningCircle size={16} weight="fill" />{a}
        </p>
      ))}
      {erro && <p className="text-[13px] text-[var(--color-danger)]">{erro}</p>}
      {carregando && !r && <p className="text-[14px] text-[var(--color-fg-muted)]">Montando o resumo…</p>}

      {resumo && (
        <>
          <section className="dash-card flex flex-wrap items-end gap-x-10 gap-y-4 p-6">
            <div>
              <p className="text-[13px] font-medium text-[var(--color-fg-muted)]">Taxa do KPI{resumo.parcial ? ' até agora' : ''}</p>
              <p className="text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[var(--color-fg)]">{resumo.resultado.taxa != null ? `${resumo.resultado.taxa.toLocaleString('pt-BR')}%` : '—'}</p>
            </div>
            <Numero rotulo="Meta" valor={`${resumo.resultado.meta}%`} />
            <Numero rotulo="Faltam" valor={resumo.resultado.faltam === 0 && !resumo.parcial ? 'meta batida' : resumo.resultado.faltam.toLocaleString('pt-BR')} />
            <Numero rotulo="Comprovadas pelo GPS" valor={resumo.resultado.pctGps != null ? `${resumo.resultado.pctGps.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%` : '—'} />
            <Numero rotulo="Fora da conta" valor={resumo.resultado.foraDaConta.toLocaleString('pt-BR')} />
          </section>
          {secoesResumoDia(resumo).filter(s => s.titulo !== 'Resultado').map(s => (
            <section key={s.titulo} className="dash-card p-6">
              <h2 className="mb-3 text-[15px] font-semibold text-[var(--color-fg)]">{s.titulo}</h2>
              {s.titulo === 'Conferir primeiro' && resumo.conferirPrimeiro.length > 0 ? (
                <ul className="flex flex-col divide-y divide-[var(--color-border)]">
                  <li className="pb-2 text-[13px] text-[var(--color-fg-muted)]">{s.linhas[0]} Só aparece aqui (tem nome de cliente): não vai no texto copiado nem no PDF.</li>
                  {resumo.conferirPrimeiro.map(c => (
                    <li key={`${c.carga}-${c.nf}`} className="py-2.5">
                      <Link href={`/painel/ao-vivo?cliente=${cliente}${resumo.data !== r!.hoje ? `&data=${resumo.data}` : ''}&placa=${encodeURIComponent(c.placa)}&nf=${encodeURIComponent(c.nf)}`} className="block text-[13.5px] text-[var(--color-fg)] hover:underline">
                        <span className="font-semibold">{c.placa}</span> · NF {c.nf} · {c.cliente || 'cliente sem nome'}
                      </Link>
                      <span className="text-[12.5px] text-[var(--color-fg-muted)]">{c.titulo}. {c.frase}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="flex flex-col gap-1.5 text-[13.5px] leading-relaxed text-[var(--color-fg)]">
                  {s.linhas.map((l, i) => (
                    <li key={i} className={l.startsWith('  ') ? 'pl-5 text-[var(--color-fg-muted)]' : l.endsWith(':') ? 'mt-1 font-semibold' : ''}>{l.trim()}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  )
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-[13px] font-medium text-[var(--color-fg-muted)]">{rotulo}</p>
      <p className="text-[22px] font-semibold tabular-nums text-[var(--color-fg)]">{valor}</p>
    </div>
  )
}
