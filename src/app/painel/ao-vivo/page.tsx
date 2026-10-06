'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { MagnifyingGlass, DownloadSimple, UploadSimple, MapPin, WarningCircle, CaretDown, CaretLeft } from '@phosphor-icons/react/dist/ssr'
import type { EstadoAoVivo } from '@/lib/kpi-romaneio/ao-vivo-servico'
import type { PlacaAoVivo, NfAoVivo, SituacaoNf } from '@/lib/kpi-romaneio/ao-vivo'
import { SubirRomaneio } from './subir-romaneio'

// Tela "Ao vivo" (spec 2026-10-06-kpi-ao-vivo-design.md). Cor/status de cada
// NF vem do último cálculo do KPI (a mesma regra da planilha); o cronômetro e
// a posição vêm da camada "agora" e só mostram — nunca mudam o resultado.

const CLIENTE = 'nutrimax'
type Agora = { posicao: { lat: number | null; lng: number | null; datagps: string | null } | null; parada: { inicio: string } | null; nf: { nf: string; cliente: string } | null; consultadoEm: string }
type Estado = EstadoAoVivo & { data: string }

const UMA_HORA = 3600

function relogio(seg: number): string {
  const s = Math.max(0, Math.floor(seg))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}
function hhmm(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}
const desde = (iso: string, agoraMs: number) => (agoraMs - Date.parse(iso)) / 1000

const COR_SITUACAO: Record<SituacaoNf, string> = {
  entregue: 'var(--color-success)',
  sem_rastreador: '#64748b',
  pendente: 'transparent',
  nao_foi: 'var(--color-danger)',
  revisar: 'var(--color-warning)',
}
const ROTULO_SITUACAO: Record<SituacaoNf, string> = {
  entregue: 'Entregue',
  sem_rastreador: 'Sem rastreador',
  pendente: 'Pendente',
  nao_foi: 'Não foi ao cliente',
  revisar: 'A revisar',
}

export default function AoVivoPage() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [placaSel, setPlacaSel] = useState<string | null>(null)
  const [nfAberta, setNfAberta] = useState<string | null>(null)
  const [agora, setAgora] = useState<Record<string, Agora>>({})
  const [agoraMs, setAgoraMs] = useState(() => Date.now())
  const [busca, setBusca] = useState('')
  const [gerando, setGerando] = useState(false)
  const [subindo, setSubindo] = useState(false)
  // Celular: lista de placas OU detalhe (no computador, os dois lado a lado).
  const [vendoDetalhe, setVendoDetalhe] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/kpi/ao-vivo?cliente=${CLIENTE}`, { cache: 'no-store' })
      if (!r.ok) throw new Error(await r.text())
      setEstado(await r.json())
      setErroCarga(null)
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : 'Não consegui carregar.')
    }
  }, [])

  // Estado: a cada 60 s (10 s enquanto o primeiro cálculo ainda não saiu).
  // Depende só de um booleano: depender do objeto `resultado` recarregaria
  // em loop (cada carga cria um objeto novo).
  const esperandoPrimeiro = !!estado?.dia && !estado?.resultado
  useEffect(() => {
    void carregar()
    const t = setInterval(carregar, esperandoPrimeiro ? 10_000 : 60_000)
    return () => clearInterval(t)
  }, [carregar, esperandoPrimeiro])

  // Relógio da tela: 1 s.
  useEffect(() => {
    const t = setInterval(() => setAgoraMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Carga sem placa (pão sem carro no PDF) vai pro fim, não pro topo.
  const placas = useMemo(() => [...(estado?.resultado?.placas ?? [])].sort((a, b) => Number(a.placa === 'SEM PLACA' || a.placa === '') - Number(b.placa === 'SEM PLACA' || b.placa === '')), [estado])
  const placa = placas.find(p => p.placa === placaSel) ?? placas[0] ?? null

  // Camada "agora" da placa aberta: a cada 30 s.
  useEffect(() => {
    if (!placa) return
    const alvo = placa.placa
    let vivo = true
    const buscar = () => fetch(`/api/kpi/ao-vivo/agora?cliente=${CLIENTE}&placa=${alvo}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((a: Agora | null) => { if (vivo && a) setAgora(prev => ({ ...prev, [alvo]: a })) })
      .catch(() => {})
    buscar()
    const t = setInterval(buscar, 30_000)
    return () => { vivo = false; clearInterval(t) }
  }, [placa?.placa]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtradas = useMemo(() => {
    const b = busca.trim().toUpperCase()
    return b ? placas.filter(p => p.placa.includes(b) || p.motorista.toUpperCase().includes(b) || p.destino.toUpperCase().includes(b)) : placas
  }, [placas, busca])

  async function gerarAgora() {
    setGerando(true)
    try {
      const r = await fetch(`/api/kpi/ao-vivo/gerar?cliente=${CLIENTE}`, { method: 'POST' })
      if (!r.ok) throw new Error(await r.text())
      const blob = await r.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `KPI-Nutry-Max-${estado?.data ?? ''}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : 'Não consegui gerar o KPI.')
    } finally {
      setGerando(false)
    }
  }

  if (!estado) {
    return <div className="mx-auto w-full max-w-[1280px]"><div className="h-24 animate-pulse rounded-[20px] bg-[var(--color-bg-subtle)]" />{erroCarga && <p className="mt-4 text-[13px] text-[var(--color-danger)]">{erroCarga}</p>}</div>
  }

  const r = estado.resultado

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--color-success)] opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2.5 rounded-full bg-[var(--color-success)]" />
            </span>
            <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-[var(--color-fg)]">Nutry Max ao vivo</h1>
          </div>
          {r ? (
            <p className="text-[14px] text-[var(--color-fg-muted)]">
              <strong className="text-[var(--color-fg)] tabular-nums">{r.resumo.pct}% entregue</strong>, {r.resumo.feitas.toLocaleString('pt-BR')} de {r.resumo.totalNfs.toLocaleString('pt-BR')} notas. Atualizado às {hhmm(r.calculadoEm)}{estado.calculando ? ', recalculando agora' : ''}.
            </p>
          ) : estado.dia ? (
            <p className="text-[14px] text-[var(--color-fg-muted)]">Romaneio recebido às {hhmm(estado.dia.enviadoEm)}: {estado.dia.nfs} notas em {estado.dia.placas} placas. Calculando o KPI pela primeira vez — leva uns 3 minutos.</p>
          ) : (
            <p className="text-[14px] text-[var(--color-fg-muted)]">Suba o romaneio de hoje para começar a acompanhar as entregas.</p>
          )}
        </div>
        {estado.dia && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSubindo(s => !s)} className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 text-[13px] font-semibold text-[var(--color-fg)] transition hover:border-[var(--color-border-strong)]">
              <UploadSimple size={15} weight="bold" />Trocar romaneio
            </button>
            <button type="button" onClick={gerarAgora} disabled={gerando} className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--color-navy-700)] px-5 text-[13px] font-semibold text-white transition hover:bg-[var(--color-navy-800)] active:scale-[0.98] disabled:opacity-50">
              <DownloadSimple size={15} weight="bold" />{gerando ? 'Gerando… (uns 3 min)' : 'Gerar KPI agora'}
            </button>
          </div>
        )}
      </header>

      {estado.ultimoErro && (!r || Date.parse(estado.ultimoErro.em) > Date.parse(r.calculadoEm)) && (
        <p className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-warning-soft)] px-4 py-2.5 text-[13px] text-[var(--color-warning-soft-fg)]">
          <WarningCircle size={16} weight="fill" />O último cálculo falhou às {hhmm(estado.ultimoErro.em)}. A tela mostra os dados de {hhmm(r?.calculadoEm)}; o próximo cálculo tenta de novo.
        </p>
      )}
      {erroCarga && <p className="text-[13px] text-[var(--color-danger)]">{erroCarga}</p>}

      {(!estado.dia || subindo) && (
        <section className="dash-card p-6">
          <h2 className="mb-1 text-[16px] font-semibold text-[var(--color-fg)]">{estado.dia ? 'Trocar o romaneio de hoje' : 'Romaneio de hoje'}</h2>
          <p className="mb-5 text-[13px] text-[var(--color-fg-muted)]">Os mesmos PDFs da tela Gerar KPI. O sistema guarda só o que leu deles e recalcula o KPI a cada 10 minutos.</p>
          <SubirRomaneio cliente={CLIENTE} compacto={!!estado.dia} onEnviado={() => { setSubindo(false); carregar() }} />
        </section>
      )}

      {estado.dia && !r && !subindo && (
        <section className="dash-card flex items-center gap-4 p-6">
          <span className="size-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-navy-700)]" />
          <p className="text-[14px] text-[var(--color-fg-muted)]">Calculando o KPI de hoje com as mesmas regras da planilha…</p>
        </section>
      )}

      {r && placa && (
        <div className="grid items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside aria-label="Placas" className={`dash-card flex-col overflow-hidden lg:flex lg:h-[calc(100dvh-190px)] lg:min-h-[420px] ${vendoDetalhe ? 'hidden' : 'flex'}`}>
            <div className="border-b border-[var(--color-border)] p-3">
              <label className="flex h-10 items-center gap-2 rounded-xl bg-[var(--color-bg-subtle)] px-3 text-[var(--color-fg-muted)]">
                <MagnifyingGlass size={15} />
                <input aria-label="Buscar placa, motorista ou destino" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar placa, motorista ou destino" className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--color-fg)] outline-none" />
              </label>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {filtradas.map(p => (
                <LinhaPlaca key={p.placa} p={p} ativa={p.placa === placa.placa} agora={agora[p.placa]} agoraMs={agoraMs} onClick={() => { setPlacaSel(p.placa); setNfAberta(null); setVendoDetalhe(true) }} />
              ))}
              {filtradas.length === 0 && <li className="px-4 py-10 text-center text-[13px] text-[var(--color-fg-muted)]">Nenhuma placa com “{busca}”.</li>}
            </ul>
          </aside>

          <div className={vendoDetalhe ? 'block' : 'hidden lg:block'}>
            <button type="button" onClick={() => setVendoDetalhe(false)} className="mb-3 inline-flex h-10 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 text-[13px] font-semibold text-[var(--color-fg)] lg:hidden">
              <CaretLeft size={14} weight="bold" />Todas as placas
            </button>
          <DetalhePlaca p={placa} agora={agora[placa.placa]} agoraMs={agoraMs} nfAberta={nfAberta} onNf={nf => setNfAberta(a => (a === nf ? null : nf))} calculadoEm={r.calculadoEm} />
          </div>
        </div>
      )}
    </div>
  )
}

/** Voltou à base de vez: chegada à base registrada e nenhuma NF pendente,
 *  ou a chegada é depois da última saída de cliente (rota encerrada). */
function voltouABase(p: PlacaAoVivo): boolean {
  if (!p.chegadaBase) return false
  if (!p.nfs.some(n => n.situacao === 'pendente')) return true
  const ultimaSaida = p.nfs.map(n => n.saida).filter((x): x is string => !!x).sort().pop()
  return !!ultimaSaida && hhmm(p.chegadaBase) >= ultimaSaida
}

function situacaoAgora(p: PlacaAoVivo, a: Agora | undefined, agoraMs: number): { texto: string; tempo: string | null; tom: 'cliente' | 'longe' | 'rota' | 'fim' } {
  if (a?.parada) {
    const s = desde(a.parada.inicio, agoraMs)
    return { texto: 'No cliente', tempo: relogio(s), tom: s >= UMA_HORA ? 'longe' : 'cliente' }
  }
  if (voltouABase(p)) return { texto: `Voltou à base às ${hhmm(p.chegadaBase)}`, tempo: null, tom: 'fim' }
  if (p.saidaBase) return { texto: `Saiu às ${hhmm(p.saidaBase)}`, tempo: relogio(desde(p.saidaBase, agoraMs)), tom: 'rota' }
  return { texto: p.feitas > 0 ? 'Sem horário de saída' : 'Ainda não saiu da base', tempo: null, tom: 'fim' }
}

const COR_TOM = { cliente: 'text-[#1d4fa8]', longe: 'text-[#b45309]', rota: 'text-[var(--color-fg-muted)]', fim: 'text-[var(--color-fg-muted)]' }

/** Carga do pão vem do Romaneio do Pão como "PAO-<n>". */
const ehCargaPao = (c: string) => /^PAO-/i.test(c)
function rotuloPao(p: PlacaAoVivo): string | null {
  const pao = p.cargas.filter(ehCargaPao).length
  if (!pao) return null
  return pao === p.cargas.length ? 'Carro do pão' : 'Também leva pão'
}

function SeloPao({ texto }: { texto: string }) {
  return <span className="shrink-0 rounded-full bg-[#fdf3e3] px-2 py-0.5 text-[11px] font-semibold text-[#8a4b08]">{texto}</span>
}

function LinhaPlaca({ p, ativa, agora, agoraMs, onClick }: { p: PlacaAoVivo; ativa: boolean; agora: Agora | undefined; agoraMs: number; onClick: () => void }) {
  const s = situacaoAgora(p, agora, agoraMs)
  return (
    <li>
      <button type="button" onClick={onClick} aria-current={ativa ? 'true' : undefined}
        className={`block w-full border-b border-[var(--color-border)] px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-navy-700)] ${ativa ? 'bg-[var(--color-bg-subtle)] shadow-[inset_3px_0_0_var(--color-navy-700)]' : 'hover:bg-[var(--color-bg-subtle)]'}`}>
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-[14px] font-semibold text-[var(--color-fg)]">{p.placa === 'SEM PLACA' || !p.placa ? 'Carga sem placa' : p.placa}</span>
            {rotuloPao(p) && <SeloPao texto={rotuloPao(p)!} />}
          </span>
          <span className="text-[15px] font-semibold tabular-nums text-[var(--color-fg)]">{p.pct}%</span>
        </span>
        <span className="mt-2 block h-1 overflow-hidden rounded-full bg-[var(--color-border)]">
          <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${p.pct}%`, background: p.pct === 100 ? 'var(--color-success)' : 'var(--color-navy-700)' }} />
        </span>
        <span className="mt-2 flex items-center justify-between gap-2 text-[12px]">
          <span className="truncate text-[var(--color-fg-muted)]">{s.texto === 'No cliente' ? `No cliente · ${p.destino}` : s.texto}</span>
          {s.tempo && <span className={`shrink-0 font-semibold tabular-nums ${COR_TOM[s.tom]}`}>{s.tempo}</span>}
        </span>
      </button>
    </li>
  )
}

function DetalhePlaca({ p, agora, agoraMs, nfAberta, onNf, calculadoEm }: { p: PlacaAoVivo; agora: Agora | undefined; agoraMs: number; nfAberta: string | null; onNf: (nf: string) => void; calculadoEm: string }) {
  const s = situacaoAgora(p, agora, agoraMs)
  const nfAgora = agora?.nf?.nf ?? null
  const contagem = (sit: SituacaoNf) => p.nfs.filter(n => n.situacao === sit).length
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="dash-card grid gap-5 p-5 sm:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[var(--color-fg)]">{p.placa}</h2>
            {rotuloPao(p) && <SeloPao texto={rotuloPao(p)!} />}
          </div>
          <p className="line-clamp-2 text-[13px] leading-snug text-[var(--color-fg-muted)]">{p.motorista || 'Motorista não informado'}, {p.destino}</p>
        </div>
        <Dado rotulo="Entregas" valor={`${p.pct}%`} extra={`${p.feitas} de ${p.total}`} />
        <Dado rotulo={p.saidaBase ? `Saiu da base às ${hhmm(p.saidaBase)}` : 'Saída da base'} valor={tempoDesdeSaida(p, agoraMs)} />
        {s.tom === 'cliente' || s.tom === 'longe' ? (
          <div className={`rounded-2xl px-4 py-3 ${s.tom === 'longe' ? 'bg-[#fff4e5]' : 'bg-[#eef4fe]'}`}>
            <p className={`truncate text-[12px] font-medium ${COR_TOM[s.tom]}`}>{s.tom === 'longe' ? 'No cliente há mais de 1 hora' : 'No cliente agora'}{agora?.nf ? ` · ${agora.nf.cliente}` : ''}</p>
            <p className={`text-[22px] font-semibold tabular-nums ${COR_TOM[s.tom]}`}>{s.tempo}</p>
          </div>
        ) : (
          s.tom === 'fim' && p.chegadaBase
            ? <Dado rotulo="Voltou à base às" valor={hhmm(p.chegadaBase)} />
            : <Dado rotulo="Agora" valor={s.tom === 'rota' ? 'Em trânsito' : s.texto} />
        )}
      </div>

      <div className="dash-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-5 py-3.5">
          <h3 className="text-[14px] font-semibold text-[var(--color-fg)]">Notas fiscais</h3>
          <p className="text-[12px] text-[var(--color-fg-muted)]">
            {contagem('entregue')} entregues, {contagem('pendente')} pendentes{contagem('revisar') ? `, ${contagem('revisar')} a revisar` : ''}{contagem('nao_foi') ? `, ${contagem('nao_foi')} não foi` : ''}{contagem('sem_rastreador') ? `, ${contagem('sem_rastreador')} sem rastreador` : ''}
          </p>
        </div>
        <ul>
          {p.nfs.map((n, i) => (
            <LinhaNf key={`${n.carga}-${n.nf}`} n={n} ordem={i + 1} aberta={nfAberta === n.nf} noClienteAgora={nfAgora === n.nf ? agora?.parada?.inicio ?? null : null} agoraMs={agoraMs} onClick={() => onNf(n.nf)} calculadoEm={calculadoEm} posicao={agora?.posicao ?? null} />
          ))}
        </ul>
      </div>
    </section>
  )
}

/** Tempo desde a saída da base; para de contar quando a rota terminou. */
function tempoDesdeSaida(p: PlacaAoVivo, agoraMs: number): string {
  if (!p.saidaBase) return '—'
  const fim = voltouABase(p) && p.chegadaBase ? Date.parse(p.chegadaBase) : agoraMs
  return relogio((fim - Date.parse(p.saidaBase)) / 1000)
}

function Dado({ rotulo, valor, extra }: { rotulo: string; valor: string; extra?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[12px] text-[var(--color-fg-muted)]">{rotulo}</p>
      <p className="text-[22px] font-semibold tabular-nums text-[var(--color-fg)]">{valor} {extra && <span className="text-[13px] font-medium text-[var(--color-fg-muted)]">{extra}</span>}</p>
    </div>
  )
}

function LinhaNf({ n, ordem, aberta, noClienteAgora, agoraMs, onClick, posicao }: { n: NfAoVivo; ordem: number; aberta: boolean; noClienteAgora: string | null; agoraMs: number; onClick: () => void; calculadoEm: string; posicao: Agora['posicao'] }) {
  const segAgora = noClienteAgora ? desde(noClienteAgora, agoraMs) : null
  const longe = segAgora != null && segAgora >= UMA_HORA
  const corPonto = segAgora != null ? (longe ? 'var(--color-warning)' : '#2a6fdb') : COR_SITUACAO[n.situacao]
  const rotulo = segAgora != null ? (longe ? 'No cliente há +1 h' : 'No cliente agora') : ROTULO_SITUACAO[n.situacao]
  const corRotulo = segAgora != null ? (longe ? 'text-[#b45309]' : 'text-[#1d4fa8]') : n.situacao === 'entregue' ? 'text-[var(--color-success)]' : n.situacao === 'nao_foi' ? 'text-[var(--color-danger)]' : n.situacao === 'revisar' ? 'text-[#b45309]' : 'text-[var(--color-fg-muted)]'
  return (
    <li className="border-b border-[var(--color-border)] last:border-b-0">
      <button type="button" onClick={onClick} aria-expanded={aberta}
        className={`flex w-full items-center gap-3 px-5 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-navy-700)] ${aberta ? 'bg-[var(--color-bg-subtle)]' : 'hover:bg-[var(--color-bg-subtle)]'}`}>
        <span className="w-6 shrink-0 text-right text-[12px] tabular-nums text-[var(--color-fg-subtle)]">{ordem}</span>
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: corPonto, border: n.situacao === 'pendente' && segAgora == null ? '2px solid var(--color-border-strong)' : undefined }} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-fg)]">{n.cliente || 'Cliente sem nome'}</span>
        <span className={`hidden shrink-0 text-[12px] font-semibold sm:inline ${corRotulo}`}>{rotulo}</span>
        <span className="w-24 shrink-0 text-right text-[12px] tabular-nums text-[var(--color-fg-muted)]">
          {segAgora != null ? relogio(segAgora) : n.chegada ? `${n.chegada}${n.tempoMin != null ? ` · ${n.tempoMin} min` : ''}` : ''}
        </span>
        <CaretDown size={13} className={`shrink-0 text-[var(--color-fg-subtle)] transition-transform ${aberta ? 'rotate-180' : ''}`} />
      </button>
      {aberta && (() => {
        const motivo = segAgora == null && n.situacao !== 'entregue' ? motivoLegivel(n.status) : null
        const temHorario = segAgora != null || n.chegada != null
        const mapa = segAgora != null && posicao?.lat != null && posicao.lng != null
          ? { lat: posicao.lat, lng: posicao.lng, texto: 'Ver o caminhão no mapa' }
          : n.lat != null && n.lng != null ? { lat: n.lat, lng: n.lng, texto: 'Ver endereço no mapa' } : null
        return (
          <div className="flex flex-col gap-3 px-5 pb-4 pl-[60px] text-[13px]">
            {motivo && (
              <div className={`rounded-xl px-3.5 py-2.5 ${n.situacao === 'nao_foi' ? 'bg-[#fdecec] text-[#a61b1b]' : n.situacao === 'revisar' ? 'bg-[#fdf3e3] text-[#8a4b08]' : 'bg-[var(--color-bg-subtle)] text-[var(--color-fg)]'}`}>
                <p className="font-semibold leading-snug">{motivo.motivo}</p>
                {motivo.acao && <p className="mt-0.5 text-[12px] opacity-80">{motivo.acao}</p>}
              </div>
            )}
            <p className="leading-relaxed text-[var(--color-fg-muted)]">NF {n.nf}, carga {n.carga}. {enderecoLimpo(n.endereco)}</p>
            {temHorario && (
              <div className="grid grid-cols-3 gap-x-6">
                <Mini rotulo="Chegou" valor={segAgora != null ? hhmm(noClienteAgora) : n.chegada ?? '—'} />
                <Mini rotulo="Saiu" valor={segAgora != null ? 'Ainda está lá' : n.saida ?? '—'} />
                <Mini rotulo="Tempo no cliente" valor={segAgora != null ? relogio(segAgora) : n.tempoMin != null ? `${n.tempoMin} min` : '—'} destaque={segAgora != null} longe={longe} />
              </div>
            )}
            {(segAgora != null || mapa) && (
              <p className="text-[12px] text-[var(--color-fg-muted)]">
                {segAgora != null && 'Chegou agora. Entra como entregue no próximo cálculo do KPI se a parada se confirmar.'}
                {mapa && (
                  <a className={`${segAgora != null ? 'ml-2 ' : ''}inline-flex items-center gap-1 font-medium text-[var(--color-navy-700)] underline-offset-2 hover:underline`} href={`https://www.google.com/maps?q=${mapa.lat},${mapa.lng}`} target="_blank" rel="noreferrer"><MapPin size={13} />{mapa.texto}</a>
                )}
              </p>
            )}
          </div>
        )
      })()}
    </li>
  )
}

/** "PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA - CONFERIR" ->
 *  { motivo: "Passou no endereço mas não registrou parada", acao: "Conferir" }. */
function motivoLegivel(status: string): { motivo: string; acao: string | null } {
  const frase = (s: string) => {
    const t = s.trim().toLowerCase().replace(/\bunitrac\b/g, 'Unitrac').replace(/\bkpi\b/g, 'KPI')
    return t.charAt(0).toUpperCase() + t.slice(1)
  }
  const partes = status.split(/\s+-\s+/).filter(Boolean)
  const i = partes.findIndex((p, k) => k > 0 && /^(CONFERIR|PERGUNTAR|VERIFICAR)/i.test(p))
  if (i > 0) return { motivo: frase(partes.slice(0, i).join(', ')), acao: frase(partes.slice(i).join(', ')) }
  return { motivo: frase(partes.join(', ')), acao: null }
}

/** Tira os "- *" (complemento vazio do romaneio) do endereço. */
function enderecoLimpo(e: string): string {
  return e.replace(/\s+-\s+\*(?=\s+-|\s*$)/g, '').replace(/\s{2,}/g, ' ').trim()
}

function Mini({ rotulo, valor, destaque, longe, titulo }: { rotulo: string; valor: string; destaque?: boolean; longe?: boolean; titulo?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] text-[var(--color-fg-muted)]">{rotulo}</p>
      <p title={titulo} className={`truncate font-semibold tabular-nums ${destaque ? (longe ? 'text-[#b45309]' : 'text-[#1d4fa8]') : 'text-[var(--color-fg)]'}`}>{valor}</p>
    </div>
  )
}
