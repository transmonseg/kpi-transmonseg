'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown, ArrowUp, Truck, Package, Warning, MapPinLine, Path, Timer, Clock, CellSignalSlash,
  MagnifyingGlass, CaretUpDown, UploadSimple, DownloadSimple, CaretRight,
} from '@phosphor-icons/react/dist/ssr'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { BarList, type BarItem } from '@/app/painel/charts'
import { LinhaTaxa, Colunas } from './graficos'
import type { ClienteDash, DiaKpi } from '@/lib/kpi-romaneio/dashboard-kpis'
import {
  agregar, intervalo, intervaloAnterior, somarDias, hoje, dataCurta, dataLonga,
  fmtPct, fmtInt, fmtKm, fmtDur, tom, COR_TOM, type Periodo, type Agregado, type PlacaAgg,
} from './calculos'
import { PlacaDrawer } from './placa-drawer'

const ANO = Number(hoje().slice(0, 4))
const ANOS = [ANO, ANO - 1, ANO - 2].map(String)
const META = 95

const CTRL = 'h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[13px] text-[var(--color-fg)] outline-none transition-colors hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)] [color-scheme:light] dark:[color-scheme:dark]'

export function VisaoGeral({ cliente, dataInicial, podeInserir, onInserir }: {
  cliente: ClienteDash
  dataInicial?: string
  podeInserir: boolean
  onInserir: () => void
}) {
  const [periodo, setPeriodo] = useState<Periodo>(dataInicial ? 'dia' : 'mes')
  const [data, setData] = useState(dataInicial ?? hoje())
  const [de, setDe] = useState(somarDias(hoje(), -13))
  const [ate, setAte] = useState(hoje())
  const [dias, setDias] = useState<DiaKpi[] | null>(null)
  const [anteriores, setAnteriores] = useState<DiaKpi[]>([])
  const [erro, setErro] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  const [placaAberta, setPlacaAberta] = useState<PlacaAgg | null>(null)

  const faixa = useMemo(() => intervalo(periodo, data, de, ate), [periodo, data, de, ate])

  useEffect(() => {
    let vivo = true
    setDias(null); setErro(false)
    const [aDe, aAte] = intervaloAnterior(faixa)
    const q = (x: string, y: string) => fetch(`/api/dashboard-kpi?cliente=${cliente}&de=${x}&ate=${y}`).then(r => { if (!r.ok) throw new Error(); return r.json() })
    Promise.all([q(faixa[0], faixa[1]), q(aDe, aAte)])
      .then(([a, b]) => { if (vivo) { setDias(a.dias); setAnteriores(b.dias) } })
      .catch(() => { if (vivo) setErro(true) })
    return () => { vivo = false }
  }, [cliente, faixa, tentativa])

  const ag = useMemo(() => (dias ? agregar(dias) : null), [dias])
  const agAnt = useMemo(() => (anteriores.length ? agregar(anteriores) : null), [anteriores])

  return (
    <div className="space-y-6">
      {/* Barra de período (mesma da Benassi) */}
      <div className="sticky top-14 z-20 -mx-5 flex flex-wrap items-center gap-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 px-5 py-2.5 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="inline-flex h-9 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-0.5 shadow-soft">
          {(['dia', 'semana', 'mes', 'ano', 'custom'] as Periodo[]).map(p => (
            <button
              key={p} type="button" onClick={() => setPeriodo(p)}
              className={`h-8 rounded-[var(--radius-sm)] px-3.5 text-[12px] font-medium capitalize transition-[background-color,color,transform] duration-150 active:scale-[0.97] ${periodo === p ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)] shadow-soft' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'}`}
            >{p === 'mes' ? 'Mês' : p === 'ano' ? 'Ano' : p === 'custom' ? 'Período' : p}</button>
          ))}
        </div>
        {periodo === 'custom' ? (
          <div className="flex items-center gap-1.5">
            <input type="date" value={de} max={ate} onChange={e => setDe(e.target.value)} className={CTRL} />
            <span className="text-[12px] text-[var(--color-fg-subtle)]">até</span>
            <input type="date" value={ate} min={de} onChange={e => setAte(e.target.value)} className={CTRL} />
          </div>
        ) : periodo === 'ano' ? (
          <select value={data.slice(0, 4)} onChange={e => setData(`${e.target.value}-01-01`)} className={CTRL}>
            {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        ) : periodo === 'mes' ? (
          <input type="month" value={data.slice(0, 7)} onChange={e => setData(`${e.target.value}-01`)} className={CTRL} />
        ) : (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setData(somarDias(data, periodo === 'semana' ? -7 : -1))} aria-label="Anterior"
              className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[16px] text-[var(--color-fg-muted)] shadow-soft transition active:scale-95 hover:text-[var(--color-fg)]">‹</button>
            <input type="date" value={data} max={hoje()} onChange={e => setData(e.target.value)} className={CTRL} />
            <button type="button" onClick={() => setData(somarDias(data, periodo === 'semana' ? 7 : 1))} aria-label="Próximo" disabled={data >= hoje()}
              className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[16px] text-[var(--color-fg-muted)] shadow-soft transition active:scale-95 hover:text-[var(--color-fg)] disabled:pointer-events-none disabled:opacity-40">›</button>
          </div>
        )}
        <span className="text-numeric text-[12px] text-[var(--color-fg-subtle)]">
          {periodo === 'dia' ? dataLonga(faixa[0]) : `${dataCurta(faixa[0])} → ${dataCurta(faixa[1])}`}
        </span>
        {periodo === 'dia' && dias?.length === 1 && (
          <a href={`/api/dashboard-kpi/arquivo?cliente=${cliente}&data=${faixa[0]}`}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3.5 text-[12px] font-medium text-[var(--color-fg)] shadow-soft transition hover:border-[var(--color-accent)] active:scale-[0.97]">
            <DownloadSimple size={14} weight="bold" /> Baixar planilha do dia
          </a>
        )}
      </div>

      {erro ? (
        <div className="dash-card flex flex-col items-center gap-3 py-14 text-center">
          <p className="text-[14px] text-[var(--color-fg-muted)]">Não consegui carregar os dados.</p>
          <button type="button" onClick={() => setTentativa(t => t + 1)} className="rounded-full border border-[var(--color-border)] px-4 py-1.5 text-[13px] font-medium">Tentar de novo</button>
        </div>
      ) : !ag ? <Esqueleto /> : ag.dias.length === 0 ? (
        <div className="dash-card flex flex-col items-center px-6 py-16 text-center">
          <span className="dash-icone mb-4" style={{ ['--dash-tom' as string]: '#1f3864' }}><UploadSimple size={18} weight="bold" /></span>
          <p className="text-[17px] font-semibold text-[var(--color-fg)]">Nenhum KPI inserido {periodo === 'dia' ? 'neste dia' : 'neste período'}</p>
          <p className="mt-1.5 max-w-md text-[13px] text-[var(--color-fg-muted)]">O dashboard analisa os KPIs que forem inseridos. Insira a planilha do KPI e os números aparecem aqui.</p>
          {podeInserir && (
            <button type="button" onClick={onInserir} className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-[var(--color-navy-700)] px-5 text-[13px] font-semibold text-white transition hover:bg-[var(--color-navy-800)] active:scale-[0.97]">
              <UploadSimple size={16} weight="bold" /> Inserir KPI
            </button>
          )}
        </div>
      ) : (
        <Conteudo ag={ag} agAnt={agAnt} periodo={periodo} onPlaca={setPlacaAberta} />
      )}

      {placaAberta && ag && (
        <PlacaDrawer cliente={cliente} placa={placaAberta} dias={ag.dias} onFechar={() => setPlacaAberta(null)} />
      )}
    </div>
  )
}

function Esqueleto() {
  return (
    <div className="space-y-5">
      <div className="h-[190px] animate-pulse rounded-[24px] bg-[var(--color-bg-subtle)]" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[128px] animate-pulse rounded-[20px] bg-[var(--color-bg-subtle)]" />)}
      </div>
      <div className="h-[320px] animate-pulse rounded-[20px] bg-[var(--color-bg-subtle)]" />
    </div>
  )
}

function Delta({ atual, anterior, inverso, suf = ' pts', casas = 1 }: { atual: number | null; anterior: number | null | undefined; inverso?: boolean; suf?: string; casas?: number }) {
  if (atual == null || anterior == null) return null
  const d = atual - anterior
  if (Math.abs(d) < 10 ** -casas / 2) return <span className="text-[12px] text-[var(--color-fg-subtle)]">igual ao anterior</span>
  const bom = inverso ? d < 0 : d > 0
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px] font-semibold ${bom ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' : 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'}`}>
      {d > 0 ? <ArrowUp size={11} weight="bold" /> : <ArrowDown size={11} weight="bold" />}
      {Math.abs(d).toLocaleString('pt-BR', { maximumFractionDigits: casas })}{suf}
    </span>
  )
}

function Conteudo({ ag, agAnt, periodo, onPlaca }: { ag: Agregado; agAnt: Agregado | null; periodo: Periodo; onPlaca: (p: PlacaAgg) => void }) {
  const umDia = periodo === 'dia'
  const serieComp = ag.serie.filter(s => !s.parcial)
  return (
    <div className="space-y-6">
      {ag.diasParciais > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] px-4 py-3 text-[13px] text-[var(--color-warning-soft-fg)]">
          <span className="size-2 animate-pulse rounded-full bg-[var(--color-warning)]" />
          {ag.diasParciais === 1 ? '1 KPI inserido foi gerado' : `${ag.diasParciais} KPIs inseridos foram gerados`} com a rota ainda em andamento — {umDia ? 'os números deste dia são parciais' : 'fica fora dos totais e médias'}. Insira o KPI do dia fechado para substituir.
        </div>
      )}

      <Hero ag={ag} agAnt={agAnt} umDia={umDia} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile i={0} Icone={Package} cor="#2a78d6" rotulo="NFs entregues" valor={fmtInt(ag.entregues)} sub={`de ${fmtInt(ag.nfsNaConta)} na conta`} delta={<Delta atual={ag.entregues} anterior={agAnt?.entregues} suf="" casas={0} />} />
        <Tile i={1} Icone={Warning} cor="#e08a00" rotulo="A revisar" valor={fmtInt(Math.max(0, ag.pendentes - (ag.motivos['Não foi ao cliente'] ?? 0)))} sub="Coordenada ou conferência" />
        <Tile i={2} Icone={Path} cor="#1baf7a" rotulo="KM rodados" valor={fmtKm(ag.km)} sub={umDia ? `${fmtInt(ag.cargas)} cargas` : `${fmtKm(ag.km / Math.max(1, ag.diasCompletos))} por dia`} delta={<Delta atual={ag.km} anterior={agAnt?.km} suf=" km" casas={0} />} />
        <Tile i={3} Icone={Timer} cor="#7a5af0" rotulo="Operação média" valor={fmtDur(ag.operacaoMedia)} sub="Saída até a volta ao CD" delta={<Delta atual={ag.operacaoMedia} anterior={agAnt?.operacaoMedia} inverso suf=" min" casas={0} />} />
        <Tile i={4} Icone={Clock} cor="#d05a8a" rotulo="Tempo por entrega" valor={fmtDur(ag.porEntregaMedia)} sub="Média das cargas" delta={<Delta atual={ag.porEntregaMedia} anterior={agAnt?.porEntregaMedia} inverso suf=" min" casas={0} />} />
        <Tile i={5} Icone={Truck} cor="#1f3864" rotulo="Cargas" valor={fmtInt(ag.cargas)} sub={`${ag.placas.length} placas`} />
        <Tile i={6} Icone={CellSignalSlash} cor="#6b7280" rotulo="Sem rastreador" valor={fmtInt(ag.semRastreador)} sub="Contam como corretas" />
        <Tile i={7} Icone={MapPinLine} cor="#d70015" rotulo="Não foi ao cliente" valor={fmtInt(ag.motivos['Não foi ao cliente'] ?? 0)} sub="Caminhão longe do endereço" />
      </div>

      {!umDia && (
        <div className="grid gap-4 lg:grid-cols-5">
          <Painel titulo="Taxa de confirmação" sub={`Dia a dia · meta ${META}%`} className="lg:col-span-3">
            {serieComp.length >= 1 ? (
              <LinhaTaxa
                pontos={serieComp.map(x => ({ chave: x.data, rotulo: dataCurta(x.data), valor: x.taxa }))}
                meta={META}
                altura={260}
              />
            ) : <p className="py-16 text-center text-[13px] text-[var(--color-fg-muted)]">Insira mais dias para ver a evolução.</p>}
          </Painel>
          <Painel titulo="KM por dia" sub="Soma de todas as placas" className="lg:col-span-2">
            <Colunas
              pontos={serieComp.map(x => ({ chave: x.data, rotulo: dataCurta(x.data), valor: Math.round(x.km) }))}
              formatar={n => `${n.toLocaleString('pt-BR')} km`}
              altura={260}
            />
          </Painel>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel titulo="Resultado das entregas" sub="Como terminou cada NF">
          <Resultado ag={ag} />
        </Painel>
        <Painel titulo={umDia ? 'Piores placas do dia' : 'Piores placas do período'} sub="Menor taxa de confirmação — clique para abrir">
          <PioresPlacas placas={ag.placas} onPlaca={onPlaca} />
        </Painel>
      </div>

      <Painel titulo="Placas" sub="Clique numa placa para ver o dia dela, NF por NF" semPadding>
        <TabelaPlacas placas={ag.placas} umDia={umDia} onPlaca={onPlaca} />
      </Painel>
    </div>
  )
}

function Hero({ ag, agAnt, umDia }: { ag: Agregado; agAnt: Agregado | null; umDia: boolean }) {
  const t = ag.taxa
  const pct = Math.max(0, Math.min(100, t ?? 0))
  const r = 52, c = 2 * Math.PI * r
  const serie = ag.serie.filter(s => !s.parcial && s.taxa != null)
  const min = Math.min(85, ...serie.map(s => s.taxa as number)), max = 100
  const pts = serie.map((s, i) => `${serie.length === 1 ? 50 : (i / (serie.length - 1)) * 100},${40 - (((s.taxa as number) - min) / (max - min || 1)) * 36}`).join(' ')
  return (
    <section className="dash-hero animate-fade-up overflow-hidden p-6 sm:p-8">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4 sm:gap-6">
          <svg viewBox="0 0 128 128" className="size-[84px] shrink-0 -rotate-90 sm:size-32">
            <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="12" />
            <circle cx="64" cy="64" r={r} fill="none" stroke={t != null && t >= META ? '#5be08a' : t != null && t >= 85 ? '#ffc04d' : '#ff7a72'} strokeWidth="12" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.32,0.72,0,1)' }} />
          </svg>
          <div>
            <p className="text-[13px] font-medium text-white/70">Taxa de confirmação {umDia ? 'do dia' : 'no período'}</p>
            <p className="mt-1 text-[44px] font-semibold leading-none tracking-[-0.04em] tabular-nums sm:text-[64px]">{fmtPct(t)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-white/75">
              <span>{fmtInt(ag.entregues)} de {fmtInt(ag.nfsNaConta)} NFs</span>
              {agAnt?.taxa != null && t != null && (
                <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px] font-semibold ${t - agAnt.taxa >= 0 ? 'bg-[#5be08a]/20 text-[#8af0ad]' : 'bg-[#ff7a72]/20 text-[#ffaaa4]'}`}>
                  {t - agAnt.taxa >= 0 ? <ArrowUp size={11} weight="bold" /> : <ArrowDown size={11} weight="bold" />}
                  {Math.abs(t - agAnt.taxa).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pts vs anterior
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-6 lg:min-w-[440px]">
          <HeroMini rotulo="Dias analisados" valor={fmtInt(ag.diasCompletos)} />
          <HeroMini rotulo="Na meta (≥95%)" valor={`${serie.filter(s => (s.taxa as number) >= META).length}/${serie.length}`} />
          <HeroMini rotulo="Placas" valor={fmtInt(ag.placas.length)} />
          {serie.length >= 2 && (
            <svg viewBox="0 0 100 42" preserveAspectRatio="none" className="col-span-3 h-12 w-full">
              <polyline points={pts} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          )}
        </div>
      </div>
    </section>
  )
}

function HeroMini({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-[12px] text-white/60">{rotulo}</p>
      <p className="mt-0.5 text-[24px] font-semibold tracking-[-0.02em] tabular-nums">{valor}</p>
    </div>
  )
}

function Tile({ i, Icone, cor, rotulo, valor, sub, delta }: { i: number; Icone: PhosphorIcon; cor: string; rotulo: string; valor: string; sub?: string; delta?: React.ReactNode }) {
  return (
    <div className="dash-card dash-card-hover animate-fade-up p-4 sm:p-5" style={{ animationDelay: `${60 + i * 40}ms` }}>
      <div className="flex items-start justify-between gap-2">
        <span className="dash-icone" data-cor={cor}><Icone size={19} /></span>
        {delta}
      </div>
      <p className="mt-4 text-[13px] font-medium text-[var(--color-fg-muted)]">{rotulo}</p>
      <p className="mt-0.5 whitespace-nowrap text-[22px] font-semibold leading-tight tracking-[-0.025em] text-[var(--color-fg)] tabular-nums sm:text-[28px]">{valor}</p>
      {sub && <p className="mt-0.5 text-[12px] text-[var(--color-fg-subtle)]">{sub}</p>}
    </div>
  )
}

function Painel({ titulo, sub, children, className = '', semPadding }: { titulo: string; sub?: string; children: React.ReactNode; className?: string; semPadding?: boolean }) {
  return (
    <section className={`dash-card animate-fade-up ${semPadding ? 'overflow-hidden' : 'p-5'} ${className}`}>
      <div className={semPadding ? 'px-5 pb-3 pt-5' : 'mb-4'}>
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-fg)]">{titulo}</h3>
        {sub && <p className="mt-0.5 text-[12px] text-[var(--color-fg-muted)]">{sub}</p>}
      </div>
      {children}
    </section>
  )
}

function PioresPlacas({ placas, onPlaca }: { placas: PlacaAgg[]; onPlaca: (p: PlacaAgg) => void }) {
  const lista = placas.filter(p => p.taxa != null && p.nfPlanejado > 0).sort((a, b) => (a.taxa ?? 0) - (b.taxa ?? 0)).slice(0, 8)
  if (!lista.length) return <p className="py-10 text-center text-[13px] text-[var(--color-fg-muted)]">Sem placas.</p>
  return (
    <ul className="flex flex-col gap-2.5">
      {lista.map(p => {
        const t = tom(p.taxa)
        return (
          <li key={p.placa}>
            <button type="button" onClick={() => onPlaca(p)} className="group w-full text-left">
              <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate"><b className="font-semibold text-[var(--color-fg)]">{p.placa}</b> <span className="text-[var(--color-fg-muted)]">· {p.motorista || p.destino || '—'}</span></span>
                <span className="shrink-0 font-semibold tabular-nums" style={{ color: COR_TOM[t] }}>{fmtPct(p.taxa)} <span className="font-normal text-[var(--color-fg-subtle)]">{p.nfConfirmadas}/{p.nfPlanejado - p.nfForaDaConta}</span></span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
                <div className="h-full rounded-full transition-[filter] group-hover:brightness-110" style={{ width: `${Math.min(100, p.taxa ?? 0)}%`, background: COR_TOM[t] }} />
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Resultado({ ag }: { ag: Agregado }) {
  const naoFoi = ag.motivos['Não foi ao cliente'] ?? 0
  const coord = (ag.motivos['Coordenada imprecisa'] ?? 0) + (ag.motivos['Endereço não localizado'] ?? 0)
  const aRevisar = Math.max(0, ag.pendentes - naoFoi - coord)
  const entregues = Math.max(0, ag.entregues - ag.semRastreador)
  const itens: BarItem[] = ([
    { key: 'e', label: 'Entregues', value: entregues, tone: 'success' },
    { key: 'r', label: 'Sem rastreador', value: ag.semRastreador, tone: 'muted' },
    { key: 'n', label: 'Não foi ao cliente', value: naoFoi, tone: 'danger' },
    { key: 'c', label: 'Coordenada não puxou', value: coord, tone: 'warning' },
    { key: 'v', label: 'A revisar', value: aRevisar, tone: 'info' },
  ] as BarItem[]).filter(x => x.value > 0)
  if (!itens.length) return <p className="py-10 text-center text-[13px] text-[var(--color-fg-muted)]">Sem NFs no período.</p>
  return <BarList items={itens} format={n => n.toLocaleString('pt-BR')} />
}

type Col = 'placa' | 'taxa' | 'nfs' | 'km' | 'operacao' | 'porEntrega' | 'dias'

function TabelaPlacas({ placas, umDia, onPlaca }: { placas: PlacaAgg[]; umDia: boolean; onPlaca: (p: PlacaAgg) => void }) {
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<{ col: Col; desc: boolean }>({ col: 'taxa', desc: false })
  const linhas = useMemo(() => {
    const b = busca.trim().toUpperCase()
    const f = placas.filter(p => !b || p.placa.includes(b) || p.motorista.toUpperCase().includes(b) || p.destino.toUpperCase().includes(b))
    const v = (p: PlacaAgg): number | string => {
      switch (ordem.col) {
        case 'placa': return p.placa
        case 'taxa': return p.taxa ?? -1
        case 'nfs': return p.nfPlanejado
        case 'km': return p.km
        case 'operacao': return p.operacaoMedia ?? -1
        case 'porEntrega': return p.porEntregaMedia ?? -1
        case 'dias': return p.dias
      }
    }
    return f.sort((a, b2) => {
      const x = v(a), y = v(b2)
      const r = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)
      return ordem.desc ? -r : r
    })
  }, [placas, busca, ordem])

  const th = (col: Col, rotulo: string, dir = false) => (
    <th className={`whitespace-nowrap px-4 py-2.5 font-medium ${dir ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={() => setOrdem(o => ({ col, desc: o.col === col ? !o.desc : col !== 'placa' && col !== 'taxa' }))}
        className={`inline-flex items-center gap-1 transition-colors hover:text-[var(--color-fg)] ${ordem.col === col ? 'text-[var(--color-fg)]' : ''}`}>
        {rotulo}<CaretUpDown size={11} className={ordem.col === col ? 'opacity-100' : 'opacity-40'} />
      </button>
    </th>
  )

  return (
    <div>
      <div className="px-5 pb-3">
        <label className="flex h-9 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 text-[13px] focus-within:border-[var(--color-accent)]">
          <MagnifyingGlass size={14} className="text-[var(--color-fg-subtle)]" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar placa, motorista ou destino" className="w-full bg-transparent outline-none placeholder:text-[var(--color-fg-subtle)]" />
        </label>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead className="sticky top-0 z-[1] bg-[var(--color-bg-elevated)] text-[12px] text-[var(--color-fg-muted)]">
            <tr className="border-y border-[var(--color-border)]">
              {th('placa', 'Placa')}
              {th('taxa', 'Taxa')}
              {th('nfs', 'NFs', true)}
              {!umDia && th('dias', 'Dias', true)}
              {th('km', 'KM', true)}
              {th('operacao', 'Operação', true)}
              {th('porEntrega', 'Por entrega', true)}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {linhas.map(p => {
              const t = tom(p.taxa)
              return (
                <tr key={p.placa} onClick={() => onPlaca(p)} className="group cursor-pointer border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-subtle)]">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[var(--color-fg)]">{p.placa}</div>
                    <div className="max-w-[220px] truncate text-[12px] text-[var(--color-fg-muted)]">{p.motorista || '—'} · {p.destino || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-14 text-right font-semibold tabular-nums" style={{ color: COR_TOM[t] }}>{fmtPct(p.taxa)}</span>
                        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
                          <span className="block h-full rounded-full" style={{ width: `${Math.min(100, p.taxa ?? 0)}%`, background: COR_TOM[t] }} />
                        </span>
                      </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {fmtInt(p.nfConfirmadas)}<span className="text-[var(--color-fg-subtle)]">/{fmtInt(p.nfPlanejado - p.nfForaDaConta)}</span>
                    {p.nfSemRastreador > 0 && <span title="Sem rastreador: contam como corretas na taxa" className="ml-1 text-[11px] text-[var(--color-fg-subtle)]">({p.nfSemRastreador} sem rastreador)</span>}
                  </td>
                  {!umDia && <td className="px-4 py-3 text-right tabular-nums">{p.dias}</td>}
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{fmtKm(p.km)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtDur(p.operacaoMedia)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtDur(p.porEntregaMedia)}</td>
                  <td className="pr-4 text-[var(--color-fg-subtle)]"><CaretRight size={14} className="transition-transform group-hover:translate-x-0.5" /></td>
                </tr>
              )
            })}
            {linhas.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-[13px] text-[var(--color-fg-muted)]">Nenhuma placa encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
