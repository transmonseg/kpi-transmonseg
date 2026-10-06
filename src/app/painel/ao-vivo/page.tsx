'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { MagnifyingGlass, DownloadSimple, UploadSimple, MapPin, WarningCircle, CaretDown, CaretLeft, MapTrifold, ArrowsLeftRight } from '@phosphor-icons/react/dist/ssr'
import type { EstadoAoVivo } from '@/lib/kpi-romaneio/ao-vivo-servico'
import type { SugestaoTroca } from '@/lib/kpi-romaneio/sugerir-trocas'
import type { PlacaAoVivo, NfAoVivo, SituacaoNf } from '@/lib/kpi-romaneio/ao-vivo'
import { SubirRomaneio, type EnvioRomaneio } from './subir-romaneio'

// Tela "Ao vivo" (spec 2026-10-06-kpi-ao-vivo-design.md). Cor/status de cada
// NF vem do último cálculo do KPI (a mesma regra da planilha); o cronômetro e
// a posição vêm da camada "agora" e só mostram — nunca mudam o resultado.

type Cliente = 'nutrimax' | 'rioquality'
const NOME_CLIENTE: Record<Cliente, string> = { nutrimax: 'Nutry Max', rioquality: 'Rio Quality' }
type Agora = { posicao: { lat: number | null; lng: number | null; datagps: string | null } | null; parada: { inicio: string } | null; nf: { nf: string; cliente: string } | null; consultadoEm: string }
type Estado = EstadoAoVivo & { data: string; hoje: string; historico: boolean; dias: string[]; clientes: Cliente[]; fonte?: 'ao_vivo' | 'geracao' | null; geracaoId?: string | null }

/** "2026-10-03" -> "sex, 03/10". */
function rotuloDia(d: string): string {
  const [a, m, dia] = d.split('-').map(Number)
  const sem = new Date(Date.UTC(a, m - 1, dia, 12)).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '')
  return `${sem}, ${String(dia).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

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
  nao_confirmada: 'var(--color-danger)',
  nao_foi: 'var(--color-danger)',
  revisar: 'var(--color-warning)',
}
const ROTULO_SITUACAO: Record<SituacaoNf, string> = {
  entregue: 'Entregue',
  sem_rastreador: 'Sem rastreador',
  pendente: 'Pendente',
  nao_confirmada: 'Não confirmada',
  nao_foi: 'Não foi ao cliente',
  revisar: 'A revisar',
}

export default function AoVivoPage() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  // ?placa=&nf=&data= (volta da tela "Entrega no mapa"): abre direto nelas.
  const daUrl = () => (typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search))
  const [placaSel, setPlacaSel] = useState<string | null>(() => daUrl().get('placa'))
  const [nfAberta, setNfAberta] = useState<string | null>(() => daUrl().get('nf'))
  const [agora, setAgora] = useState<Record<string, Agora>>({})
  const [agoraMs, setAgoraMs] = useState(() => Date.now())
  const [busca, setBusca] = useState('')
  const [gerando, setGerando] = useState(false)
  const [subindo, setSubindo] = useState(false)
  // Resultado do último envio: romaneio/pão também foram pro Monitoramento?
  const [ultimoEnvio, setUltimoEnvio] = useState<EnvioRomaneio | null>(null)
  // Celular: lista de placas OU detalhe (no computador, os dois lado a lado).
  const [vendoDetalhe, setVendoDetalhe] = useState(() => !!daUrl().get('placa'))
  // Dia escolhido (null = hoje, ao vivo). Dia passado = histórico guardado.
  const [dataSel, setDataSel] = useState<string | null>(() => daUrl().get('data'))
  // Nutry Max ou Rio Quality (05/10). ?cliente= na URL (volta do monitoramento).
  const [cliente, setCliente] = useState<Cliente>(() => (daUrl().get('cliente') === 'rioquality' ? 'rioquality' : 'nutrimax'))
  const CLIENTE = cliente

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/kpi/ao-vivo?cliente=${CLIENTE}${dataSel ? `&data=${dataSel}` : ''}`, { cache: 'no-store' })
      // Login só da Rio Quality: abre direto nela.
      if (r.status === 403 && CLIENTE === 'nutrimax') { setCliente('rioquality'); return }
      if (!r.ok) throw new Error(await r.text())
      setEstado(await r.json())
      setErroCarga(null)
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : 'Não consegui carregar.')
    }
  }, [dataSel, cliente]) // eslint-disable-line react-hooks/exhaustive-deps

  // Estado: a cada 60 s (10 s enquanto o primeiro cálculo ainda não saiu).
  // Depende só de um booleano: depender do objeto `resultado` recarregaria
  // em loop (cada carga cria um objeto novo).
  const esperandoPrimeiro = !!estado?.dia && !estado?.resultado
  useEffect(() => {
    void carregar()
    if (dataSel) return // dia passado não muda
    const t = setInterval(carregar, esperandoPrimeiro ? 10_000 : 60_000)
    return () => clearInterval(t)
  }, [carregar, esperandoPrimeiro, dataSel])

  // Relógio da tela: 1 s.
  useEffect(() => {
    const t = setInterval(() => setAgoraMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Carga sem placa (pão sem carro no PDF) vai pro fim, não pro topo.
  const placas = useMemo(() => [...(estado?.resultado?.placas ?? [])].sort((a, b) => Number(a.placa === 'SEM PLACA' || a.placa === '') - Number(b.placa === 'SEM PLACA' || b.placa === '')), [estado])

  const filtradas = useMemo(() => {
    const b = busca.trim().toUpperCase()
    return b ? placas.filter(p => p.placa.includes(b) || p.motorista.toUpperCase().includes(b) || p.destino.toUpperCase().includes(b)) : placas
  }, [placas, busca])

  const placa = placas.find(p => p.placa === placaSel) ?? filtradas[0] ?? placas[0] ?? null

  // Camada "agora" da placa aberta: a cada 30 s.
  useEffect(() => {
    if (!placa || dataSel) return
    const alvo = placa.placa
    let vivo = true
    const buscar = () => fetch(`/api/kpi/ao-vivo/agora?cliente=${CLIENTE}&placa=${alvo}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((a: Agora | null) => { if (vivo && a) setAgora(prev => ({ ...prev, [alvo]: a })) })
      .catch(() => {})
    buscar()
    const t = setInterval(buscar, 30_000)
    return () => { vivo = false; clearInterval(t) }
  }, [placa?.placa, dataSel]) // eslint-disable-line react-hooks/exhaustive-deps


  async function gerarAgora() {
    setGerando(true)
    try {
      const r = await fetch(`/api/kpi/ao-vivo/gerar?cliente=${CLIENTE}`, { method: 'POST' })
      if (!r.ok) throw new Error(await r.text())
      const blob = await r.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `KPI-${cliente === 'rioquality' ? 'Rio-Quality' : 'Nutry-Max'}-${estado?.data ?? ''}.xlsx`
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
  const historico = estado.historico
  const trocarCliente = (c: Cliente) => { setCliente(c); setDataSel(null); setPlacaSel(null); setNfAberta(null); setVendoDetalhe(false); setAgora({}); setBusca(''); setEstado(null) }
  const trocarDia = (d: string) => { setDataSel(d === estado.hoje ? null : d); setPlacaSel(null); setNfAberta(null); setVendoDetalhe(false); setAgora({}); setBusca('') }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            {!historico && (
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--color-success)] opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex size-2.5 rounded-full bg-[var(--color-success)]" />
              </span>
            )}
            <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-[var(--color-fg)]">{historico ? `${NOME_CLIENTE[cliente]} em ${rotuloDia(estado.data).split(', ')[1]}` : `${NOME_CLIENTE[cliente]} ao vivo`}</h1>
          </div>
          {historico ? (
            <p className="text-[14px] text-[var(--color-fg-muted)]">
              {r ? (<><FraseResumo r={r} /> {estado.fonte === 'geracao' ? 'KPI gerado' : 'Último cálculo'} em {new Date(r.calculadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às')}.</>)
                : 'Nada guardado deste dia.'}
            </p>
          ) : r ? (
            <p className="text-[14px] text-[var(--color-fg-muted)]">
              <FraseResumo r={r} /> Atualizado às {hhmm(r.calculadoEm)}{estado.calculando ? ', recalculando agora' : ''}.
            </p>
          ) : estado.dia ? (
            <p className="text-[14px] text-[var(--color-fg-muted)]">Romaneio recebido às {hhmm(estado.dia.enviadoEm)}: {estado.dia.nfs} notas em {estado.dia.placas} placas. Calculando o KPI pela primeira vez — leva uns 3 minutos.</p>
          ) : (
            <p className="text-[14px] text-[var(--color-fg-muted)]">{cliente === 'rioquality' ? 'Suba o relatório de entregas de hoje' : 'Suba o romaneio de hoje'} para começar a acompanhar as entregas.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {estado.clientes.length > 1 && (
            <div role="tablist" aria-label="Cliente" className="flex h-10 items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-1">
              {estado.clientes.map(c => (
                <button key={c} type="button" role="tab" aria-selected={c === cliente} onClick={() => trocarCliente(c)}
                  className={`h-8 rounded-full px-3.5 text-[13px] font-semibold transition-colors ${c === cliente ? 'bg-[var(--color-navy-700)] text-white' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'}`}>
                  {NOME_CLIENTE[c]}
                </button>
              ))}
            </div>
          )}
          <label className="relative inline-flex h-10 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] pl-4 pr-9 text-[13px] font-semibold text-[var(--color-fg)] transition hover:border-[var(--color-border-strong)]">
            <span className="sr-only">Dia</span>
            <select value={estado.data} onChange={e => trocarDia(e.target.value)} className="appearance-none bg-transparent outline-none">
              <option value={estado.hoje}>Hoje, ao vivo</option>
              {estado.dias.map(d => <option key={d} value={d}>{rotuloDia(d)}</option>)}
            </select>
            <CaretDown size={13} className="pointer-events-none absolute right-3.5 text-[var(--color-fg-subtle)]" />
          </label>
          {historico && estado.geracaoId && (
            <a href={`/api/kpi/historico/${estado.geracaoId}/xlsx`} className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--color-navy-700)] px-5 text-[13px] font-semibold text-white transition hover:bg-[var(--color-navy-800)]">
              <DownloadSimple size={15} weight="bold" />Baixar planilha
            </a>
          )}
        {!historico && estado.dia && (
          <>
            <button type="button" onClick={() => setSubindo(s => !s)} className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 text-[13px] font-semibold text-[var(--color-fg)] transition hover:border-[var(--color-border-strong)]">
              <UploadSimple size={15} weight="bold" />Trocar romaneio
            </button>
            <button type="button" onClick={gerarAgora} disabled={gerando} className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--color-navy-700)] px-5 text-[13px] font-semibold text-white transition hover:bg-[var(--color-navy-800)] active:scale-[0.98] disabled:opacity-50">
              <DownloadSimple size={15} weight="bold" />{gerando ? 'Gerando… (uns 3 min)' : 'Gerar KPI agora'}
            </button>
          </>
        )}
        </div>
      </header>

      {estado.ultimoErro && (!r || Date.parse(estado.ultimoErro.em) > Date.parse(r.calculadoEm)) && (
        <p className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-warning-soft)] px-4 py-2.5 text-[13px] text-[var(--color-warning-soft-fg)]">
          <WarningCircle size={16} weight="fill" />O último cálculo falhou às {hhmm(estado.ultimoErro.em)}. A tela mostra os dados de {hhmm(r?.calculadoEm)}; o próximo cálculo tenta de novo.
        </p>
      )}
      {erroCarga && <p className="text-[13px] text-[var(--color-danger)]">{erroCarga}</p>}
      {!historico && (() => {
        const longas = placas
          .map(p => ({ p, inicio: agora[p.placa]?.parada?.inicio ?? p.paradaAtual?.inicio ?? null, cliente: agora[p.placa]?.nf?.cliente ?? p.paradaAtual?.cliente ?? null }))
          .filter((x): x is { p: PlacaAoVivo; inicio: string; cliente: string | null } => !!x.inicio && desde(x.inicio, agoraMs) >= UMA_HORA)
          .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))
        if (!longas.length) return null
        return (
          <section role="alert" className="flex flex-col gap-2 rounded-2xl border border-[#f3d9b1] bg-[#fff7ec] px-4 py-3">
            <p className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#8a4b08]">
              <WarningCircle size={16} weight="fill" />{longas.length === 1 ? '1 placa parada há mais de 1 hora no cliente' : `${longas.length} placas paradas há mais de 1 hora no cliente`}
            </p>
            <div className="flex flex-wrap gap-2">
              {longas.map(({ p, inicio, cliente }) => (
                <button key={p.placa} type="button" onClick={() => { setPlacaSel(p.placa); setNfAberta(null); setVendoDetalhe(true) }}
                  className="inline-flex items-center gap-2 rounded-full border border-[#f3d9b1] bg-white px-3 py-1.5 text-[12.5px] text-[#8a4b08] transition hover:border-[#e8b874]">
                  <span className="font-semibold">{p.placa}</span>
                  {cliente && <span className="max-w-[220px] truncate">{cliente}</span>}
                  <span className="font-semibold tabular-nums">{relogio(desde(inicio, agoraMs))}</span>
                </button>
              ))}
            </div>
          </section>
        )
      })()}
      {!historico && cliente === 'nutrimax' && r?.sugestoesTroca && r.sugestoesTroca.length > 0 && (
        <TrocasSugeridas sugestoes={r.sugestoesTroca} onConfirmada={carregar} />
      )}
      {ultimoEnvio?.monitoramento && ultimoEnvio.monitoramento.length > 0 && (
        <p className={`inline-flex flex-wrap items-center gap-2 rounded-2xl px-4 py-2.5 text-[13px] ${ultimoEnvio.monitoramento.every(m => m.ok) ? 'bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)]' : 'bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-fg)]'}`}>
          {ultimoEnvio.monitoramento.map(m => (m.ok
            ? `${m.origem === 'romaneio' ? 'Romaneio' : 'Pão'} enviado também ao Monitoramento${m.linhas != null ? ` (${m.linhas} linhas)` : ''}.`
            : `${m.origem === 'romaneio' ? 'Romaneio' : 'Pão'} não foi pro Monitoramento: ${m.erro}. Suba lá em Configurar Romaneio.`)).join(' ')}
        </p>
      )}

      {!historico && (!estado.dia || subindo) && (
        <section className="dash-card p-6">
          <h2 className="mb-1 text-[16px] font-semibold text-[var(--color-fg)]">{cliente === 'rioquality' ? (estado.dia ? 'Trocar o relatório de entregas de hoje' : 'Relatório de entregas de hoje') : (estado.dia ? 'Trocar o romaneio de hoje' : 'Romaneio de hoje')}</h2>
          <p className="mb-5 text-[13px] text-[var(--color-fg-muted)]">{cliente === 'rioquality' ? 'A mesma planilha da tela Gerar KPI da Rio Quality.' : 'Os mesmos PDFs da tela Gerar KPI.'} O sistema guarda só o que leu e recalcula o KPI a cada 10 minutos.</p>
          <SubirRomaneio cliente={CLIENTE} compacto={!!estado.dia} onEnviado={r => { setSubindo(false); setUltimoEnvio(r); carregar() }} />
        </section>
      )}

      {!historico && estado.dia && !r && !subindo && (
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
                <LinhaPlaca key={p.placa} p={p} ativa={p.placa === placa.placa} agora={historico ? undefined : agora[p.placa]} agoraMs={agoraMs} historico={historico} onClick={() => { setPlacaSel(p.placa); setNfAberta(null); setVendoDetalhe(true) }} />
              ))}
              {filtradas.length === 0 && <li className="px-4 py-10 text-center text-[13px] text-[var(--color-fg-muted)]">Nenhuma placa com “{busca}”.</li>}
            </ul>
          </aside>

          <div className={vendoDetalhe ? 'block' : 'hidden lg:block'}>
            <button type="button" onClick={() => setVendoDetalhe(false)} className="mb-3 inline-flex h-10 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 text-[13px] font-semibold text-[var(--color-fg)] lg:hidden">
              <CaretLeft size={14} weight="bold" />Todas as placas
            </button>
          <DetalhePlaca p={placa} data={estado.data} cliente={cliente} agora={historico ? undefined : agora[placa.placa]} agoraMs={agoraMs} historico={historico} nfAberta={nfAberta} onNf={nf => setNfAberta(a => (a === nf ? null : nf))} />
          </div>
        </div>
      )}
    </div>
  )
}

/** Taxa do KPI (a mesma da planilha: fora da conta não entra) e as notas. */
function FraseResumo({ r }: { r: NonNullable<Estado['resultado']> }) {
  const n = (x: number) => x.toLocaleString('pt-BR')
  if (r.resumo.taxa != null && r.resumo.entregues != null && r.resumo.nfsNaConta != null) {
    return <><strong className="text-[var(--color-fg)] tabular-nums">{r.resumo.taxa.toLocaleString('pt-BR')}% no KPI</strong>, {n(r.resumo.entregues)} de {n(r.resumo.nfsNaConta)} notas na conta entregues.</>
  }
  return <><strong className="text-[var(--color-fg)] tabular-nums">{r.resumo.pct}% entregue</strong>, {n(r.resumo.feitas)} de {n(r.resumo.totalNfs)} notas.</>
}

/** Voltou à base de vez: chegada à base registrada e nenhuma NF pendente,
 *  ou a chegada é depois da última saída de cliente (rota encerrada). */
function voltouABase(p: PlacaAoVivo): boolean {
  if (!p.chegadaBase) return false
  if (!p.nfs.some(n => n.situacao === 'pendente')) return true
  const ultimaSaida = p.nfs.map(n => n.saida).filter((x): x is string => !!x).sort().pop()
  return !!ultimaSaida && hhmm(p.chegadaBase) >= ultimaSaida
}

const KM_JA_EM_ROTA = 3

function situacaoAgora(p: PlacaAoVivo, a: Agora | undefined, agoraMs: number, historico = false): { texto: string; tempo: string | null; tom: 'cliente' | 'longe' | 'rota' | 'fim' } {
  // Parada em andamento: a da consulta "agora" da placa aberta (30 s) ou, pras
  // outras, a do último cálculo (10 min).
  const inicioParada = a?.parada?.inicio ?? (!historico ? p.paradaAtual?.inicio : null)
  if (inicioParada) {
    const s = desde(inicioParada, agoraMs)
    return { texto: 'No cliente', tempo: relogio(s), tom: s >= UMA_HORA ? 'longe' : 'cliente' }
  }
  if (voltouABase(p)) return { texto: `Voltou à base às ${hhmm(p.chegadaBase)}`, tempo: null, tom: 'fim' }
  if (p.saidaBase) return { texto: historico ? `Saiu às ${hhmm(p.saidaBase)}, sem volta registrada` : `Saiu às ${hhmm(p.saidaBase)}`, tempo: historico ? null : relogio(desde(p.saidaBase, agoraMs)), tom: historico ? 'fim' : 'rota' }
  // Carro que dorme fora da base (motoristas da região dos Lagos, achado 06/10
  // RQV5F67): nunca registra saída, mas já está rodando.
  if (p.km != null && p.km >= KM_JA_EM_ROTA) return { texto: historico ? 'Rodou sem saída da base registrada' : 'Em rota (saída da base não registrada)', tempo: null, tom: historico ? 'fim' : 'rota' }
  return { texto: p.feitas > 0 ? 'Sem horário de saída' : 'Ainda não saiu da base', tempo: null, tom: 'fim' }
}

const COR_TOM = { cliente: 'text-[#1d4fa8]', longe: 'text-[#b45309]', rota: 'text-[var(--color-fg-muted)]', fim: 'text-[var(--color-fg-muted)]' }

/** Carga do pão vem do Romaneio do Pão como "PAO-<n>". */
const ehCargaPao = (c: string) => /^PAO-/i.test(c)
function rotuloPao(p: PlacaAoVivo): string | null {
  const pao = p.nfs.filter(n => ehCargaPao(n.carga)).length
  if (!pao) return null
  return pao === p.nfs.length ? 'Carro do pão' : 'Também leva pão'
}

function SeloPao({ texto }: { texto: string }) {
  return <span className="shrink-0 rounded-full bg-[#fdf3e3] px-2 py-0.5 text-[11px] font-semibold text-[#8a4b08]">{texto}</span>
}

function LinhaPlaca({ p, ativa, agora, agoraMs, historico, onClick }: { p: PlacaAoVivo; ativa: boolean; agora: Agora | undefined; agoraMs: number; historico: boolean; onClick: () => void }) {
  const s = situacaoAgora(p, agora, agoraMs, historico)
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

function DetalhePlaca({ p, data, cliente, agora, agoraMs, historico, nfAberta, onNf }: { p: PlacaAoVivo; data: string; cliente: Cliente; agora: Agora | undefined; agoraMs: number; historico: boolean; nfAberta: string | null; onNf: (nf: string) => void }) {
  const s = situacaoAgora(p, agora, agoraMs, historico)
  const nfAgora = agora?.nf?.nf ?? (!historico ? p.paradaAtual?.nf ?? null : null)
  const clienteAgora = agora?.nf?.cliente ?? (!historico ? p.paradaAtual?.cliente ?? null : null)
  const inicioAgora = agora?.parada?.inicio ?? (!historico ? p.paradaAtual?.inicio ?? null : null)
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
        <Dado rotulo={p.saidaBase ? `Saiu da base às ${hhmm(p.saidaBase)}` : 'Saída da base'} valor={tempoDesdeSaida(p, agoraMs, historico)} />
        {s.tom === 'cliente' || s.tom === 'longe' ? (
          <div className={`rounded-2xl px-4 py-3 ${s.tom === 'longe' ? 'bg-[#fff4e5]' : 'bg-[#eef4fe]'}`}>
            <p className={`truncate text-[12px] font-medium ${COR_TOM[s.tom]}`}>{s.tom === 'longe' ? 'No cliente há mais de 1 hora' : 'No cliente agora'}{clienteAgora ? ` · ${clienteAgora}` : ''}</p>
            <p className={`text-[22px] font-semibold tabular-nums ${COR_TOM[s.tom]}`}>{s.tempo}</p>
          </div>
        ) : (
          s.tom === 'fim' && p.chegadaBase
            ? <Dado rotulo="Voltou à base às" valor={hhmm(p.chegadaBase)} />
            : <Dado rotulo={historico ? 'Situação' : 'Agora'} valor={s.tom === 'rota' ? 'Em trânsito' : s.texto} />
        )}
      </div>

      <div className="dash-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-5 py-3.5">
          <h3 className="text-[14px] font-semibold text-[var(--color-fg)]">Notas fiscais</h3>
          <p className="text-[12px] text-[var(--color-fg-muted)]">
            {contagem('entregue')} entregues{contagem('pendente') ? `, ${contagem('pendente')} pendentes` : ''}{contagem('nao_confirmada') ? `, ${contagem('nao_confirmada')} não confirmadas` : ''}{contagem('revisar') ? `, ${contagem('revisar')} a revisar` : ''}{contagem('nao_foi') ? `, ${contagem('nao_foi')} não foi` : ''}{contagem('sem_rastreador') ? `, ${contagem('sem_rastreador')} sem rastreador` : ''}
          </p>
        </div>
        <ul>
          {p.nfs.map((n, i) => (
            <LinhaNf key={`${n.carga}-${n.nf}`} n={n} todas={p.nfs} placa={p.placa} data={data} historico={historico} cliente={cliente} ordem={i + 1} aberta={nfAberta === n.nf} noClienteAgora={nfAgora === n.nf ? inicioAgora : null} agoraMs={agoraMs} onClick={() => onNf(n.nf)} posicao={agora?.posicao ?? null} />
          ))}
        </ul>
      </div>
    </section>
  )
}

/** Tempo desde a saída da base; para de contar quando a rota terminou. */
function tempoDesdeSaida(p: PlacaAoVivo, agoraMs: number, historico = false): string {
  if (!p.saidaBase) return '—'
  if (historico && !p.chegadaBase) return '—'
  const fim = (voltouABase(p) || historico) && p.chegadaBase ? Date.parse(p.chegadaBase) : agoraMs
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

function LinhaNf({ n, todas, placa, data, historico, cliente, ordem, aberta, noClienteAgora, agoraMs, onClick, posicao }: { n: NfAoVivo; todas: NfAoVivo[]; placa: string; data: string; historico: boolean; cliente: Cliente; ordem: number; aberta: boolean; noClienteAgora: string | null; agoraMs: number; onClick: () => void; posicao: Agora['posicao'] }) {
  const segAgora = noClienteAgora ? desde(noClienteAgora, agoraMs) : null
  const longe = segAgora != null && segAgora >= UMA_HORA
  const corPonto = segAgora != null ? (longe ? 'var(--color-warning)' : '#2a6fdb') : COR_SITUACAO[n.situacao]
  const rotulo = segAgora != null ? (longe ? 'No cliente há +1 h' : 'No cliente agora') : ROTULO_SITUACAO[n.situacao]
  const corRotulo = segAgora != null ? (longe ? 'text-[#b45309]' : 'text-[#1d4fa8]') : n.situacao === 'entregue' ? 'text-[var(--color-success)]' : n.situacao === 'nao_foi' || n.situacao === 'nao_confirmada' ? 'text-[var(--color-danger)]' : n.situacao === 'revisar' ? 'text-[#b45309]' : 'text-[var(--color-fg-muted)]'
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
              <div className={`rounded-xl px-3.5 py-2.5 ${n.situacao === 'nao_foi' || n.situacao === 'nao_confirmada' ? 'bg-[#fdecec] text-[#a61b1b]' : n.situacao === 'revisar' ? 'bg-[#fdf3e3] text-[#8a4b08]' : 'bg-[var(--color-bg-subtle)] text-[var(--color-fg)]'}`}>
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
            {placa && placa !== 'SEM PLACA' && cliente === 'nutrimax' && (
              <div>
                <Link href={linkMonitoramento(n, todas, placa, data, historico)}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-[var(--color-navy-700)] px-4 text-[12.5px] font-semibold text-white transition hover:bg-[var(--color-navy-800)] active:scale-[0.98]">
                  <MapTrifold size={15} weight="bold" />Ver no monitoramento
                </Link>
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

/** Tela "Entrega no mapa" do monitoramento, aberta dentro da Central: rastro
 *  do dia, ponto do cliente e a parada que o KPI contou como entrega. */
function linkMonitoramento(n: NfAoVivo, todas: NfAoVivo[], placa: string, data: string, historico: boolean): string {
  const q = new URLSearchParams({ placa, data, nf: n.nf, cliente: n.cliente, endereco: enderecoLimpo(n.endereco), situacao: n.situacao, status: n.status })
  if (n.lat != null && n.lng != null) { q.set('lat', String(n.lat)); q.set('lng', String(n.lng)) }
  if (n.parada) { q.set('plat', n.parada.lat.toFixed(6)); q.set('plng', n.parada.lng.toFixed(6)) }
  if (n.chegada) q.set('chegada', n.chegada)
  if (n.saida) q.set('saida', n.saida)
  // A rota inteira da placa: ordem, NF, situação e ponto de cada entrega.
  q.set('pts', todas.map((t, i) => `${i + 1}|${t.nf}|${t.situacao}|${t.lat != null ? t.lat.toFixed(5) : ''}|${t.lng != null ? t.lng.toFixed(5) : ''}|${t.cliente.slice(0, 40).replace(/[|;]/g, ' ')}`).join(';'))
  // Botão X da tela de entrega volta pra cá, na mesma placa e NF.
  q.set('volta', `/painel/ao-vivo?${new URLSearchParams({ placa, nf: n.nf, ...(historico ? { data } : {}) }).toString()}`)
  return `/painel/monitoramento/entrega?${q.toString()}`
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

/** Carro trocado sem aviso (06/10): o carro da escala não passou na carga e
 *  outro, sem carga no dia, parou na maioria dos endereços. A operação
 *  confirma; nada é trocado sozinho. */
function TrocasSugeridas({ sugestoes, onConfirmada }: { sugestoes: SugestaoTroca[]; onConfirmada: () => void }) {
  const [enviando, setEnviando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  async function confirmar(s: SugestaoTroca) {
    setEnviando(s.carga); setAviso(null)
    try {
      const r = await fetch('/api/kpi/ao-vivo/troca', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ carga: s.carga, placaEscala: s.placaEscala, placaReal: s.placaSugerida }) })
      if (!r.ok) { setAviso(`Não deu pra trocar: ${await r.text()}`); return }
      const j = (await r.json()) as { monitoramento?: { ok: boolean; erro?: string } }
      setAviso(`Troca registrada: carga ${s.carga} agora é do ${s.placaSugerida}. O KPI recalcula em instantes.${j.monitoramento && !j.monitoramento.ok ? ` Monitoramento não atualizou (${j.monitoramento.erro}).` : ''}`)
      onConfirmada()
    } finally { setEnviando(null) }
  }
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-3">
      <p className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--color-fg)]">
        <ArrowsLeftRight size={16} weight="bold" />{sugestoes.length === 1 ? 'Carro trocado?' : `${sugestoes.length} cargas com carro trocado?`}
      </p>
      <ul className="flex flex-col gap-1.5">
        {sugestoes.map(s => (
          <li key={s.carga} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-[var(--color-fg-muted)]">
            <span>Carga <strong className="text-[var(--color-fg)]">{s.carga}</strong>: o <strong className="text-[var(--color-fg)]">{s.placaEscala}</strong> da escala não passou nos clientes; o <strong className="text-[var(--color-fg)]">{s.placaSugerida}</strong> parou em {s.enderecosVisitados} de {s.enderecosDaCarga} endereços.</span>
            <button type="button" disabled={enviando != null} onClick={() => confirmar(s)}
              className="inline-flex h-8 items-center rounded-full bg-[var(--color-navy-700)] px-3.5 text-[12.5px] font-semibold text-white transition hover:bg-[var(--color-navy-800)] disabled:opacity-50">
              {enviando === s.carga ? 'Trocando…' : `Confirmar ${s.placaSugerida}`}
            </button>
          </li>
        ))}
      </ul>
      {aviso && <p className="text-[12.5px] text-[var(--color-fg-muted)]">{aviso}</p>}
    </section>
  )
}
