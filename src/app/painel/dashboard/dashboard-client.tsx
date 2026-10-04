'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { Metricas } from '@/lib/kpi/dashboard-metricas'
import { REDES, REDE_LABEL, REDE_ALIASES } from '@/lib/kpi/redes'
import { formatMes } from '@/lib/kpi/meses'
import InserirManual from './inserir-manual'
import Historico from './historico'
import ResumoOperacao, { type ResumoOperacaoData } from './resumo-operacao'
import { iniciarTutorial, tourJaVisto } from '@/lib/tour/store'
import { hojeBR } from '@/lib/data-br'
import { ArrowSquareOut, CheckCircle, WarningCircle, ArrowClockwise, Question, TableIcon } from '@phosphor-icons/react/dist/ssr'
import { LineChart, BarList, ColumnChart, Donut, Gauge, Heatmap, fmtNum, type BarItem } from '@/app/painel/charts'
import { ModalDetalhe, type TipoDetalhe } from './modal-detalhe'

type Periodo = 'dia' | 'semana' | 'mes' | 'ano' | 'custom'
type Tab = 'geral' | 'inserir' | 'historico'

// True só no link público (/dashboard) — evita repassar "standalone" prop por
// toda a árvore de gráficos só pra decidir se mostra a explicação extra.
const StandaloneCtx = createContext(false)
const useStandalone = () => useContext(StandaloneCtx)

// Resumo de risco vindo da fonte da API (rota beta): paradas indevidas do dia.
type PontoRisco = { placa: string; hora: string; duracaoMin: number; lat: number; lng: number; rede?: string; motorista?: string }
type ResumoApi = {
  paradasIndevidas: number
  topIndevidas: Array<{ placa: string; hora: string; duracaoMin: number; local: string; rede?: string; motorista?: string }>
  pontosRisco: PontoRisco[]
}
type Gravidade = 'moderada' | 'alta' | 'critica'
const gravidadeDe = (min: number): Gravidade => (min >= 90 ? 'critica' : min >= 30 ? 'alta' : 'moderada')

// Mapa Leaflet só roda no client (precisa de window) — carrega sob demanda.
const MapaRisco = dynamic(() => import('./mapa-risco'), {
  ssr: false,
  loading: () => (
    <div
      style={{ height: 380, borderRadius: 'var(--radius-card)' }}
      className="animate-pulse bg-[var(--color-bg-elevated)]"
    />
  ),
})

const hoje = () => hojeBR()

// Anda N dias a partir de uma data YYYY-MM-DD (meio-dia UTC pra não virar de fuso).
const stepDay = (d: string, delta: number) => {
  const x = new Date(`${d}T12:00:00Z`)
  x.setUTCDate(x.getUTCDate() + delta)
  return x.toISOString().slice(0, 10)
}

// Anos disponíveis no seletor do período "Ano": ano atual + 2 anteriores.
const ANO_ATUAL = Number(hojeBR().slice(0, 4))
const ANOS = [ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2].map(String)

// status → token semântico (sem cores hardcoded). Só 4 categorias — pedido do
// Joaquim 2026-07-01: "em rota"/"mudou de rota"/"desatualizado" ficavam presas
// pra sempre em dias já fechados (a fonte nunca era corrigida depois). Ver
// classificarStatusManual em parse-kpi-manual.ts pra como cada legenda cai aqui.
const STATUS = {
  entregue:       { label: 'Entregue',       cor: 'var(--color-success)' },
  nao_foi:        { label: 'Não foi',        cor: 'var(--color-danger)' },
  sem_rastreador: { label: 'Sem rastreador', cor: 'var(--color-fg-subtle)' },
  indefinido:     { label: 'Sem dado',       cor: 'var(--color-fg-muted)' },
} as const

// Ordem do mix de status na barra/donut/legenda. Inclui 'indefinido' (sem dado)
// pra que a soma FECHE com o total: nenhuma linha some da visualização (era a
// raiz da informação falsa: o que não fechava taxa simplesmente desaparecia).
const MIX_CATS = ['entregue', 'nao_foi', 'sem_rastreador', 'indefinido'] as const

// semáforo discreto
const COR = { ok: 'var(--color-success)', warn: 'var(--color-warning)', bad: 'var(--color-danger)' } as const
const tomTaxa  = (p: number) => p >= 95 ? 'ok' : p >= 80 ? 'warn' : 'bad'
const tomFalha = (p: number) => p <= 5 ? 'ok' : p <= 10 ? 'warn' : 'bad'
const tomGps   = (p: number) => p >= 90 ? 'ok' : p >= 50 ? 'warn' : 'bad'

// botão secundário canônico (h-9), sem text-white hardcoded
const BTN_SEC = 'inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3.5 text-[13px] font-medium text-[var(--color-fg)] shadow-soft transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-hover)]'
// link-chip compacto (download)
const CHIP_LINK = 'rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1 text-[11px] text-[var(--color-fg-muted)] transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'
const CARD = 'rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-soft kpi-quad'

const fmtMin = (n: number | null | undefined) => {
  if (n == null) return '—'
  const h = Math.floor(n / 60)
  const m = Math.round(n % 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}

export default function DashboardClient({ resumo, tabInicial = 'geral', endpoint = '/api/dashboard', basePath = '/painel', redesPermitidas, mesesPermitidos }: { resumo?: ResumoOperacaoData; tabInicial?: Tab; endpoint?: string; basePath?: string; redesPermitidas?: string[]; mesesPermitidos?: string[] }) {
  const router = useRouter()
  const sp = useSearchParams()
  // Standalone (link público sem login, OU login restrito de dashboard): trava em
  // "Visão geral" — Inserir KPIs e Histórico exigem acesso completo ao sistema.
  const standalone = basePath !== '/painel' || !!redesPermitidas
  const opcoesRedes = redesPermitidas ?? [...REDES]
  const mesesOrdenados = useMemo(() => mesesPermitidos ? [...mesesPermitidos].sort() : undefined, [mesesPermitidos])
  const tab = standalone ? 'geral' : (sp.get('tab') as Tab) || tabInicial
  const setTab = (t: Tab) => router.replace(t === 'geral' ? basePath : `${basePath}?tab=${t}`, { scroll: false })
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  // Login restrito sem acesso ao mês atual cairia num período vazio por default —
  // parte do mês liberado mais recente em vez de "hoje".
  const [data, setData] = useState(() => {
    if (!mesesOrdenados || mesesOrdenados.length === 0 || mesesOrdenados.includes(hoje().slice(0, 7))) return hoje()
    return `${mesesOrdenados[mesesOrdenados.length - 1]}-01`
  })
  // Intervalo personalizado (de–até) — usado quando periodo === 'custom'.
  const [de, setDe] = useState(() => `${hoje().slice(0, 7)}-01`)
  const [ate, setAte] = useState(hoje())
  const [redes, setRedes] = useState<string[]>([])
  const [m, setM] = useState<Metricas | null>(null)
  const [mAnt, setMAnt] = useState<Metricas | null>(null)
  const [intervalo, setIntervalo] = useState<[string, string] | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(false)
  // Fonte da API (rota beta): mapa de risco + os MESMOS números (calculados do dado
  // do rastreamento). Buscado em paralelo. Quando a planilha (manual) não cobre o
  // período, os números caem pra cá — número e mapa deixam de sumir sem explicação.
  const [betaResumo, setBetaResumo] = useState<ResumoApi | null>(null)
  const [betaMetricas, setBetaMetricas] = useState<Metricas | null>(null)
  const [betaMAnt, setBetaMAnt] = useState<Metricas | null>(null)
  const [betaCarregando, setBetaCarregando] = useState(false)
  const tourAuto = useRef(false)

  // Expande aliases: filtrar ASSAI inclui SENDAS (mesmo grupo no Unitrac).
  const redesExpandidas = useMemo(
    () => redes.flatMap(r => REDE_ALIASES[r] ?? [r]),
    [redes],
  )

  useEffect(() => {
    if (tab !== 'geral') return
    setCarregando(true)
    const qs = new URLSearchParams(
      periodo === 'custom'
        ? { periodo, de, ate, redes: redesExpandidas.join(',') }
        : { periodo, data, redes: redesExpandidas.join(',') },
    )
    fetch(`${endpoint}?${qs}&completo=1`)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then(j => { setM(j.metricas); setMAnt(j.metricasAnterior ?? null); setIntervalo(j.intervalo); setErro(false) })
      .catch(() => { setM(null); setMAnt(null); setErro(true) })
      .finally(() => setCarregando(false))
  }, [tab, periodo, data, de, ate, redesExpandidas])

  // Fonte da API (rota beta): traz o mapa (resumoApi) E os números calculados do
  // rastreamento (metricas/metricasAnterior), no mesmo período/redes.
  useEffect(() => {
    if (tab !== 'geral') return
    setBetaCarregando(true)
    const qs = new URLSearchParams(
      periodo === 'custom'
        ? { periodo, de, ate, redes: redesExpandidas.join(',') }
        : { periodo, data, redes: redesExpandidas.join(',') },
    )
    fetch(`/api/dashboard/beta?${qs}&completo=1`)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then(j => { setBetaResumo(j.resumoApi ?? null); setBetaMetricas(j.metricas ?? null); setBetaMAnt(j.metricasAnterior ?? null) })
      .catch(() => { setBetaResumo(null); setBetaMetricas(null); setBetaMAnt(null) })
      .finally(() => setBetaCarregando(false))
  }, [tab, periodo, data, de, ate, redesExpandidas])

  useEffect(() => {
    if (standalone || tab !== 'geral' || !m || tourAuto.current || tourJaVisto()) return
    tourAuto.current = true
    const id = setTimeout(() => iniciarTutorial(), 800)
    return () => clearTimeout(id)
  }, [standalone, tab, m])

  const mesAtual = data.slice(0, 7)
  const recarregar = () => setRedes(r => [...r])

  // Combina as duas fontes: usa os números da planilha (manual) quando o período
  // tem dado; senão cai pros números do rastreamento (API). Assim os números nunca
  // somem só porque um dia foi gerado por um caminho e não pelo outro.
  const temManual = !!m && m.total > 0
  const mFinal = temManual ? m : betaMetricas
  const mAntFinal = temManual ? mAnt : betaMAnt
  const fonteDados: 'planilha' | 'rastreamento' | null = temManual
    ? 'planilha'
    : (betaMetricas && betaMetricas.total > 0 ? 'rastreamento' : null)
  // Só mostra "vazio/erro" quando NENHUMA das duas fontes trouxe número.
  const carregandoFinal = carregando || (!temManual && betaCarregando)
  const erroFinal = erro && !mFinal

  return (
    <StandaloneCtx.Provider value={standalone}>
    <div className="mx-auto w-full max-w-[1180px] px-5 sm:px-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-overline">Operação</span>
          <h1 data-tour="titulo" className="mt-1 text-display text-[30px] leading-none text-[var(--color-fg)]">Dashboard</h1>
          <p className="mt-2 max-w-[52ch] text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
            Entregas, rastreamento, paradas indevidas e desempenho por rede — consolidado no período.
          </p>
        </div>
        {tab === 'geral' && basePath === '/painel' && (
          <div className="flex gap-2">
            {/* Só no /painel autenticado (nunca no link público /dashboard) —
             *  qualquer papel logado vê, admin e login restrito a rede/loja
             *  específica. Abre a tabela do KPI na hora, pra data selecionada
             *  nesta tela — sem passar por lista de gerações pra regenerar. */}
            <Link href={`/painel/kpi/visualizar?data=${data}`} className={BTN_SEC}>
              <TableIcon size={14} weight="bold" /> Ver KPIs
            </Link>
            {!standalone && (
              <>
                <button onClick={() => iniciarTutorial()} className={BTN_SEC}>
                  <Question size={14} weight="bold" /> Ver tutorial
                </button>
                <button
                  data-tour="relatorio"
                  onClick={() => window.open(`/api/dashboard/relatorio?periodo=${periodo}&data=${data}&redes=${redes.join(',')}`, '_blank')}
                  className={BTN_SEC}
                >
                  <ArrowSquareOut size={14} weight="bold" />
                  Gerar relatório
                </button>
              </>
            )}
          </div>
        )}
      </header>

      {/* Tabs — Inserir/Histórico exigem sessão, então somem no link público. */}
      {!standalone && (
        <nav data-tour="abas" className="mt-8 flex gap-1 border-b border-[var(--color-border)]">
          {([['geral', 'Visão geral'], ['inserir', 'Inserir KPIs'], ['historico', 'Histórico']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t} onClick={() => setTab(t)}
              className={[
                'relative px-4 py-2.5 text-[13px] font-medium transition-[color,transform] duration-150 active:scale-[0.98]',
                tab === t ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]',
              ].join(' ')}
            >
              {label}
              <span
                aria-hidden
                className={`absolute inset-x-2 -bottom-px h-0.5 origin-left rounded-full bg-[var(--color-accent)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${tab === t ? 'scale-x-100' : 'scale-x-0'}`}
              />
            </button>
          ))}
        </nav>
      )}

      <div className="py-8">
        {tab === 'inserir' && <div key="inserir" className="animate-fade-up"><InserirManual data={data} onChange={setData} /></div>}
        {tab === 'historico' && <div key="historico" className="animate-fade-up"><Historico onAbrirDia={(d) => { setData(d); setPeriodo('dia'); setTab('geral') }} /></div>}
        {tab === 'geral' && (
          <div className="space-y-12">
            {resumo && <ResumoOperacao r={resumo} />}
            <VisaoGeral
              periodo={periodo} setPeriodo={setPeriodo} data={data} setData={setData}
              de={de} setDe={setDe} ate={ate} setAte={setAte}
              redes={redes} setRedes={setRedes} opcoesRedes={opcoesRedes} m={mFinal} mAnt={mAntFinal} intervalo={intervalo}
              carregando={carregandoFinal} erro={erroFinal} onRetry={recarregar} mes={mesAtual}
              resumoRisco={betaResumo} riscoCarregando={betaCarregando} fonte={fonteDados}
              mesesPermitidos={mesesOrdenados}
            />
          </div>
        )}
      </div>
    </div>
    </StandaloneCtx.Provider>
  )
}

// ──────────────────────────────────────────────────────────── Visão geral ──

function VisaoGeral(props: {
  periodo: Periodo; setPeriodo: (p: Periodo) => void
  data: string; setData: (d: string) => void
  de: string; setDe: (d: string) => void; ate: string; setAte: (d: string) => void
  redes: string[]; setRedes: (r: string[]) => void; opcoesRedes: string[]
  m: Metricas | null; mAnt: Metricas | null; intervalo: [string, string] | null
  carregando: boolean; erro: boolean; onRetry: () => void; mes: string
  resumoRisco: ResumoApi | null; riscoCarregando: boolean
  fonte: 'planilha' | 'rastreamento' | null
  mesesPermitidos?: string[]
}) {
  const { periodo, setPeriodo, data, setData, de, setDe, ate, setAte, redes, setRedes, opcoesRedes, m, mAnt, intervalo, carregando, erro, onRetry, mes, resumoRisco, riscoCarregando, fonte, mesesPermitidos } = props

  return (
    <div className="space-y-8">
      {/* Barra de controle ENXUTA — uma linha: período + data + intervalo + filtro de redes.
          Sticky logo abaixo do header do shell, sem sobrepor. */}
      <div className="sticky top-14 z-20 -mx-5 flex flex-wrap items-center gap-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 px-5 py-2.5 backdrop-blur sm:-mx-8 sm:px-8">
        <div data-tour="periodo" className="inline-flex h-9 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-0.5 shadow-soft">
          {(['dia', 'semana', 'mes', 'ano', 'custom'] as Periodo[]).map(p => (
            <button
              key={p} onClick={() => setPeriodo(p)}
              className={[
                'h-8 rounded-[var(--radius-sm)] px-3.5 text-[12px] font-medium capitalize transition-[background-color,color,transform] duration-150 active:scale-[0.97]',
                periodo === p ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)] shadow-soft' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
              ].join(' ')}
            >{p === 'mes' ? 'Mês' : p === 'ano' ? 'Ano' : p === 'custom' ? 'Período' : p}</button>
          ))}
        </div>
        {periodo === 'custom' ? (
          <div className="flex items-center gap-1.5">
            <input
              type="date" value={de} max={ate} onChange={e => setDe(e.target.value)}
              className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] px-2.5 text-[13px] text-[var(--color-fg)] outline-none transition-colors hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 [color-scheme:light] dark:[color-scheme:dark]"
            />
            <span className="text-[12px] text-[var(--color-fg-subtle)]">até</span>
            <input
              type="date" value={ate} min={de} onChange={e => setAte(e.target.value)}
              className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] px-2.5 text-[13px] text-[var(--color-fg)] outline-none transition-colors hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>
        ) : periodo === 'ano' ? (
          <select
            value={data.slice(0, 4)} onChange={e => setData(`${e.target.value}-01-01`)}
            className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[13px] text-[var(--color-fg)] outline-none transition-colors hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
          >
            {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        ) : periodo === 'mes' && mesesPermitidos ? (
          mesesPermitidos.length === 0 ? (
            <span className="text-[12px] text-[var(--color-fg-subtle)]">Nenhum mês liberado ainda — fale com o admin.</span>
          ) : (
            <select
              value={data.slice(0, 7)} onChange={e => setData(`${e.target.value}-01`)}
              className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[13px] text-[var(--color-fg)] outline-none transition-colors hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
            >
              {mesesPermitidos.map(mesOpcao => <option key={mesOpcao} value={mesOpcao}>{formatMes(mesOpcao)}</option>)}
            </select>
          )
        ) : periodo === 'mes' ? (
          <input
            type="month" value={data.slice(0, 7)} onChange={e => setData(`${e.target.value}-01`)}
            className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-[13px] text-[var(--color-fg)] outline-none transition-colors hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
          />
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setData(stepDay(data, -1))} aria-label="Dia anterior"
              className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[16px] leading-none text-[var(--color-fg-muted)] shadow-soft transition-[background-color,border-color,transform] duration-150 active:scale-[0.95] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]"
            >‹</button>
            <input
              type="date" value={data} max={hoje()} onChange={e => setData(e.target.value)}
              className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-[13px] text-[var(--color-fg)] outline-none transition-colors hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
            />
            <button
              onClick={() => setData(stepDay(data, 1))} aria-label="Próximo dia" disabled={data >= hoje()}
              className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[16px] leading-none text-[var(--color-fg-muted)] shadow-soft transition-[background-color,border-color,transform] duration-150 active:scale-[0.95] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)] disabled:pointer-events-none disabled:opacity-40"
            >›</button>
          </div>
        )}
        {intervalo && (
          <span className="hidden text-numeric text-[11px] text-[var(--color-fg-subtle)] sm:inline">
            {periodo === 'dia' ? intervalo[0] : `${intervalo[0]} → ${intervalo[1]}`}
          </span>
        )}
        {/* Filtro de redes recolhido num dropdown — não polui o topo com 18 chips */}
        <div data-tour="filtro-redes" className="ml-auto"><RedesFiltro redes={redes} setRedes={setRedes} opcoes={opcoesRedes} /></div>
      </div>

      {carregando ? <Skeleton /> : erro ? <Erro onRetry={onRetry} /> : !m || m.total === 0 ? <Vazio /> : (
        <Conteudo key={`${periodo}-${data}-${de}-${ate}-${redes.join(',')}`} m={m} mAnt={mAnt} mes={mes} periodo={periodo} data={data} resumoRisco={resumoRisco} riscoCarregando={riscoCarregando} fonte={fonte} />
      )}
    </div>
  )
}

// Filtro de redes recolhido: botão "Redes: Todas ▾" abre um painel com os chips.
// Mantém todos os filtros, mas tira os 18 chips da cara do topo.
function RedesFiltro({ redes, setRedes, opcoes }: { redes: string[]; setRedes: (r: string[]) => void; opcoes: string[] }) {
  const [aberto, setAberto] = useState(false)
  const toggleRede = (r: string) => setRedes(redes.includes(r) ? redes.filter(x => x !== r) : [...redes, r])
  const label = redes.length === 0 ? 'Todas as redes' : redes.length === 1 ? (REDE_LABEL[redes[0]] ?? redes[0]) : `${redes.length} redes`
  return (
    <div className="relative">
      <button
        onClick={() => setAberto(v => !v)}
        className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[12px] font-medium text-[var(--color-fg)] shadow-soft transition-[background-color,border-color] duration-150 hover:border-[var(--color-border-strong)]"
      >
        <span className="text-[var(--color-fg-subtle)]">Redes:</span> {label}
        <span className={`transition-transform duration-150 ${aberto ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {aberto && (
        <>
          <button aria-label="Fechar" className="fixed inset-0 z-30 cursor-default" onClick={() => setAberto(false)} />
          <div className="absolute right-0 z-40 mt-1.5 w-[min(92vw,360px)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 shadow-diffusion">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-overline">Filtrar por rede</span>
              {redes.length > 0 && (
                <button onClick={() => setRedes([])} className="text-[11px] font-medium text-[var(--color-accent)] hover:underline">Limpar</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chip ativo={redes.length === 0} onClick={() => setRedes([])}>Todas</Chip>
              {opcoes.map(r => (
                <Chip key={r} ativo={redes.includes(r)} onClick={() => toggleRede(r)}>{REDE_LABEL[r] ?? r}</Chip>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        'rounded-full border px-3 py-1 text-[12px] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]',
        ativo
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-soft-fg)]'
          : 'border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]',
      ].join(' ')}
    >{children}</button>
  )
}

function Skeleton() {
  // espelha o layout real: 4 hero tiles + barra + bloco de conteúdo
  return (
    <div className="space-y-12">
      <div className={`grid grid-cols-2 overflow-hidden divide-x divide-y divide-[var(--color-border)] sm:grid-cols-4 sm:divide-y-0 ${CARD}`}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-5 sm:p-6">
            <div className="h-9 w-20 rounded animate-shimmer" />
            <div className="mt-3 h-2.5 w-24 rounded animate-shimmer" />
          </div>
        ))}
      </div>
      <div className="h-2.5 w-full rounded-full animate-shimmer" />
      <div className="h-[240px] rounded-[var(--radius-card)] animate-shimmer" />
    </div>
  )
}

function Vazio() {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] py-20 text-center animate-fade-up">
      <WarningCircle size={28} weight="bold" className="text-[var(--color-fg-subtle)]" />
      <div className="mt-3 text-[14px] font-semibold text-[var(--color-fg)]">Sem dados neste período</div>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
        Insira os KPIs do dia na aba <span className="font-medium text-[var(--color-fg)]">Inserir KPIs</span> para ver as análises aqui.
      </p>
    </div>
  )
}

function Erro({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] py-20 text-center animate-fade-up">
      <WarningCircle size={28} weight="fill" style={{ color: 'var(--color-danger)' }} />
      <div className="mt-3 text-[14px] font-semibold text-[var(--color-fg)]">Não foi possível carregar</div>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-[var(--color-fg-muted)]">Houve uma falha ao buscar as métricas. Tente novamente.</p>
      <button onClick={onRetry} className={`mt-4 ${BTN_SEC}`}>
        <ArrowClockwise size={14} weight="bold" /> Tentar de novo
      </button>
    </div>
  )
}

// "Segurança da carga" (paradas indevidas + mapa) em STAND BY — o cliente pediu pra
// não usar por enquanto. O mapa, o backend e os componentes continuam no código;
// troque pra `true` pra reativar a seção (a numeração das demais se ajusta sozinha).
const MOSTRAR_SEGURANCA_CARGA = false

function Conteudo({ m, mAnt, mes, periodo, data, resumoRisco, riscoCarregando, fonte }: { m: Metricas; mAnt: Metricas | null; mes: string; periodo: Periodo; data: string; resumoRisco: ResumoApi | null; riscoCarregando: boolean; fonte: 'planilha' | 'rastreamento' | null }) {
  const lojaHref = (rede: string, loja: string) =>
    `/painel/loja?rede=${encodeURIComponent(rede)}&loja=${encodeURIComponent(loja)}&periodo=${periodo}&data=${data}`
  // Clicar num quadradinho amplia o detalhe AQUI na tela (modal), não em outra página.
  const [detalhe, setDetalhe] = useState<TipoDetalhe | null>(null)
  const pctGps = m.total ? Math.round(100 * m.com_rastreador / m.total) : 0
  const pctFalha = m.total ? Math.round(100 * m.nao_foi / m.total) : 0
  const pctGpsAnt = mAnt ? Math.round(100 * mAnt.com_rastreador / (mAnt.total || 1)) : null
  const pctFalhaAnt = mAnt ? Math.round(100 * mAnt.nao_foi / (mAnt.total || 1)) : null

  const problema = useMemo(() => {
    const map = new Map<string, { rede_id: string; loja: string; sem: number; nao: number }>()
    const get = (r: string, l: string) => {
      const k = `${r}|${l}`; let e = map.get(k)
      if (!e) { e = { rede_id: r, loja: l, sem: 0, nao: 0 }; map.set(k, e) }
      return e
    }
    for (const x of m.topSemRastreador) get(x.rede_id, x.loja).sem = x.ocorrencias
    for (const x of m.topNaoFoi) get(x.rede_id, x.loja).nao = x.ocorrencias
    return [...map.values()].sort((a, b) => (b.sem + b.nao) - (a.sem + a.nao)).slice(0, 10)
  }, [m])

  return (
    <div className="space-y-8">
      {/* De onde vieram os números deste período (planilha ou rastreamento) */}
      {fonte && (
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-fg-subtle)]">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: fonte === 'planilha' ? 'var(--color-info)' : 'var(--color-success)' }} />
          Números deste período vindos {fonte === 'planilha' ? 'da planilha (Inserir KPIs)' : 'da geração por rastreamento (Unitrac)'}
        </div>
      )}

      {/* Baixar KPI mensal — no topo, visível (era escondido lá embaixo) */}
      <div data-tour="tendencias-export" className={`flex flex-wrap items-center gap-2 p-4 sm:p-5 ${CARD}`}>
        <span className="mr-1 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--color-fg)]">
          <ArrowSquareOut size={15} weight="bold" /> Baixar KPI mensal ({mes}):
        </span>
        {m.porRede.map(r => (
          <a key={r.rede_id} href={`/api/dashboard/export-mensal?rede=${r.rede_id}&mes=${mes}`} className={CHIP_LINK}>
            {REDE_LABEL[r.rede_id] ?? r.rede_id}
          </a>
        ))}
      </div>

      {/* Resumo executivo — o período inteiro numa frase, pro cliente ler em 3s */}
      <div data-tour="resumo-exec" className="scroll-mt-32"><ResumoExecutivo m={m} mAnt={mAnt} periodo={periodo} /></div>

      {/* Alertas automáticos — o sistema destaca os pontos críticos sozinho */}
      <div data-tour="alertas" className="scroll-mt-32"><Alertas m={m} mAnt={mAnt} lojaHref={lojaHref} /></div>

      {/* ═══════ 01 — COMO FOI A OPERAÇÃO ═══════ */}
      <section id="sec-resumo" key="v-resumo" data-tour="resumo" className="scroll-mt-32 space-y-4 animate-fade-up">
        <SecaoHead n="01" titulo="Como foi a operação" sub="O resultado do período num olhar." />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Número dominante — taxa de entrega manda na hierarquia */}
          <div data-tour="resumo-taxa" onClick={() => setDetalhe('rede')} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetalhe('rede') } }} className={`flex cursor-pointer flex-col justify-between gap-8 p-6 sm:p-7 lg:col-span-4 ${CARD}`}>
            <div className="flex items-center gap-1.5 text-overline">
              Taxa de entrega
              <span className="text-[10px] text-[var(--color-fg-subtle)]">↗</span>
              {tomTaxa(m.pctEntregue) !== 'ok' && <span className="h-1.5 w-1.5 rounded-full" style={{ background: COR[tomTaxa(m.pctEntregue)] }} />}
              <InfoTip titulo="Como a taxa é calculada">
                Entregas <strong>concluídas</strong> dividido pelas <strong>conferíveis</strong> (concluídas + não foi ao cliente). Linhas sem rastreador ou sem dado ficam <strong>fora</strong> da conta — por isso a taxa não esconde o dia incompleto. Meta ≥ 95%.
                <br /><br />A seta <strong>▲▼</strong> compara com o período anterior. <strong>pts</strong> = pontos percentuais: de 94% para 97% é ▲ 3 pts, e não 3%.
              </InfoTip>
            </div>
            <div>
              <div className="text-display text-numeric text-[clamp(44px,6vw,60px)] leading-none text-[var(--color-fg)]">{m.pctEntregue}%</div>
              <div className="mt-2 text-[12px] text-[var(--color-fg-subtle)]">
                <span className="text-numeric">{m.entregue}</span> de <span className="text-numeric">{m.entregue + m.nao_foi}</span> definitivas · meta ≥ 95%
              </div>
              {(m.sem_rastreador > 0 || m.indefinido > 0) && (
                <div className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                  fora da taxa: <span className="text-numeric">{m.sem_rastreador}</span> sem rastreador · <span className="text-numeric">{m.indefinido}</span> sem dado
                </div>
              )}
              <div className="mt-2"><Delta atual={m.pctEntregue} anterior={mAnt?.pctEntregue} /></div>
            </div>
          </div>

          {/* Secundários — menores, comunicam o resto do status */}
          <div data-tour="resumo-secundarios" className={`grid grid-cols-1 overflow-hidden divide-y divide-[var(--color-border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:col-span-8 ${CARD}`}>
            <HeroTile i={0} valor={`${pctFalha}%`} label="Não foi ao cliente" status={tomFalha(pctFalha)} nota={`${m.nao_foi} não realizadas`} delta={<Delta atual={pctFalha} anterior={pctFalhaAnt} inverso />} onClick={() => setDetalhe('nao-foi')} />
            <HeroTile i={1} valor={`${pctGps}%`} label="Cobertura GPS" status={tomGps(pctGps)} nota={`${m.sem_rastreador} sem rastreador`} delta={<Delta atual={pctGps} anterior={pctGpsAnt} />} onClick={() => setDetalhe('gps')}
              info={<InfoTip titulo="Cobertura GPS">Quantas entregas tiveram <strong>posição do rastreador</strong>. O resto (&quot;sem rastreador&quot;) é placa sem aparelho de GPS ou que não está no cadastro do Unitrac — nesses não dá pra confirmar a entrega pelo mapa.</InfoTip>} />
            <HeroTile i={2} valor={fmtNum(m.total)} label="Entregas no período" nota={`${m.serie.length} dia${m.serie.length === 1 ? '' : 's'} operados`} delta={<Delta atual={m.total} anterior={mAnt?.total} neutro suf="" />} onClick={() => setDetalhe('rede')} />
          </div>
        </div>

        {/* Barra empilhada do mix de status, com rótulo (não depende só de cor) */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-2.5 min-w-[200px] flex-1 overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
            {MIX_CATS.filter(k => m[k] > 0).map(k => (
              <Tip key={k} label={`${STATUS[k].label}: ${m[k]}`}>
                <div className="h-full" style={{ width: `${100 * m[k] / (m.total || 1)}%`, background: STATUS[k].cor }} />
              </Tip>
            ))}
          </div>
          <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--color-fg-muted)]">
            {MIX_CATS.filter(k => m[k] > 0).map(k => (
              <span key={k} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS[k].cor }} />
                {STATUS[k].label} <span className="text-numeric font-semibold">{m[k]}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Tempos médios da operação */}
        <TempoStrip m={m} mAnt={mAnt} onVer={setDetalhe} />

        {/* Visão visual — rosca de status + medidores */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className={`p-5 sm:p-6 lg:col-span-6 ${CARD} animate-fade-up`}>
            <h3 className="mb-4 flex items-center gap-1.5 text-overline">
              Mix de status
              <ChartInfo titulo="Mix de status">
                Como as <strong>{fmtNum(m.total)}</strong> entregas do período se dividem entre entregue, não foi, sem rastreador etc — mesma proporção da barra colorida logo acima, só que em rosca.
              </ChartInfo>
            </h3>
            <Donut
              slices={MIX_CATS
                .filter(k => m[k] > 0)
                .map(k => ({ label: STATUS[k].label, value: m[k], color: STATUS[k].cor }))}
              centerValue={fmtNum(m.total)} centerLabel="entregas"
            />
          </div>
          <div className={`grid grid-cols-2 divide-x divide-[var(--color-border)] overflow-hidden lg:col-span-6 ${CARD} animate-fade-up`}>
            <div className="flex flex-col items-center justify-center p-5">
              <Gauge value={m.pctEntregue} label="Taxa de entrega" color={COR[tomTaxa(m.pctEntregue)]} sub="meta ≥ 95%" />
            </div>
            <div className="flex flex-col items-center justify-center p-5">
              <Gauge value={m.total ? Math.round(100 * m.com_rastreador / m.total) : 0} label="Cobertura GPS" color={COR[tomGps(m.total ? Math.round(100 * m.com_rastreador / m.total) : 0)]} sub={`${m.sem_rastreador} sem rastreador`} />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ 02 — SEGURANÇA DA CARGA (paradas indevidas + mapa) ═══════ */}
      {MOSTRAR_SEGURANCA_CARGA && (
        <SecaoRiscoMapa resumo={resumoRisco} carregando={riscoCarregando} n="02" onVerAnalise={setDetalhe} fonte={fonte} />
      )}

      {/* ═══════ 03 — ONDE AGIR AGORA ═══════ */}
      <section id="sec-agir" key="v-agir" data-tour="agir" className="scroll-mt-32 space-y-5 animate-fade-up">
        <SecaoHead n={MOSTRAR_SEGURANCA_CARGA ? '03' : '02'} titulo="Onde agir agora" sub="Lojas com problema e os clientes/rotas mais lentos." />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div data-tour="agir-tabela" className={`overflow-hidden lg:col-span-3 ${CARD}`}>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[10px] uppercase tracking-[0.1em] text-[var(--color-fg-subtle)]">
                  <th className="px-5 py-3 font-semibold">Loja com mais problema</th>
                  <th className="px-3 py-3 text-right font-semibold">Sem GPS</th>
                  <th className="px-3 py-3 text-right font-semibold">Não foi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {problema.length === 0 && (
                  <tr><td colSpan={3} className="px-5 py-8 text-center text-[13px] text-[var(--color-fg-muted)]">Nenhuma loja com ocorrência neste período.</td></tr>
                )}
                {problema.map((p, i) => (
                  <tr key={i} className="transition-colors hover:bg-[var(--color-bg-subtle)]">
                    <td className="px-5 py-3">
                      <Link href={lojaHref(p.rede_id, p.loja)} className="block max-w-[260px] truncate font-medium text-[var(--color-fg)] transition-colors hover:text-[var(--color-accent)]">{p.loja}</Link>
                      <div className="text-[11px] text-[var(--color-fg-subtle)]">{REDE_LABEL[p.rede_id] ?? p.rede_id}</div>
                    </td>
                    <td className="px-3 py-3 text-right text-numeric" style={{ color: p.sem ? 'var(--color-danger)' : 'var(--color-fg-subtle)' }}>{p.sem || '—'}</td>
                    <td className="px-3 py-3 text-right text-numeric" style={{ color: p.nao ? 'var(--color-warning)' : 'var(--color-fg-subtle)' }}>{p.nao || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-[var(--color-border)] px-5 py-3">
              <button onClick={() => setDetalhe('lojas')} className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-accent)] hover:underline">Ver todas as lojas →</button>
            </div>
          </div>

          <div data-tour="agir-paineis" className="grid grid-cols-2 gap-5 lg:col-span-2 lg:grid-cols-1">
            <Painel titulo="Sem rastreador">
              <div className="flex items-end gap-2">
                <span className="text-display text-numeric text-[40px] leading-none" style={{ color: m.pctSemRastreador > 10 ? 'var(--color-danger)' : 'var(--color-fg)' }}>{m.sem_rastreador}</span>
                <span className="mb-1.5 text-numeric text-[12px] text-[var(--color-fg-muted)]">{m.pctSemRastreador}% do total</span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">entregas sem registro de GPS — geralmente placa sem rastreador ou cadastro do Unitrac.</p>
            </Painel>
            <Painel titulo="Não foi ao cliente">
              <div className="flex items-end gap-2">
                <span className="text-display text-numeric text-[40px] leading-none" style={{ color: pctFalha > 10 ? 'var(--color-warning)' : 'var(--color-fg)' }}>{m.nao_foi}</span>
                <span className="mb-1.5 text-numeric text-[12px] text-[var(--color-fg-muted)]">{pctFalha}% do total</span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">programadas que o veículo não chegou a entregar.</p>
            </Painel>
          </div>
        </div>

        {/* Rotas e lojas mais lentas — agir = atacar os piores */}
        {(m.topRotasDemoradas.length > 0 || m.topTempoEmLoja.length > 0) && (
          <div data-tour="agir-lentos" className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
            <TopRotas m={m} lojaHref={lojaHref} onVerTodos={() => setDetalhe('rotas')} />
            <TopTempoLoja m={m} lojaHref={lojaHref} onVerTodos={() => setDetalhe('tempo-loja')} />
          </div>
        )}
      </section>

      {/* ═══════ 04 — POR REDE ═══════ */}
      <section id="sec-rede" key="v-rede" data-tour="tendencias" className="scroll-mt-32 space-y-5 animate-fade-up">
        <SecaoHead n={MOSTRAR_SEGURANCA_CARGA ? '04' : '03'} titulo="Por rede" sub="Desempenho de cada rede e onde puxar o resultado." />

        <ComparativoRede m={m} />

        <HeatmapDiaRede m={m} />

        <div data-tour="tendencias-rede" className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
          <DonutRede porRede={m.porRede} />
          <PorRede redes={m.porRede} />
          <CoberturaGpsRede redes={m.porRede} />
          <Painel titulo={<>
            Volume por turno
            <ChartInfo titulo="Volume por turno">
              Quantidade de entregas por faixa de horário — <strong>madrugada</strong> 00–06h, <strong>manhã</strong> 06–12h, <strong>tarde</strong> 12–18h, <strong>noite</strong> 18–24h. Mostra quando a operação mais roda no dia.
            </ChartInfo>
          </>}>
            <div className="space-y-2.5 pt-1">
              {(['madrugada', 'manha', 'tarde', 'noite'] as const).map(t => {
                const max = Math.max(1, ...Object.values(m.turnos))
                const label = { madrugada: 'Madrugada', manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' }[t]
                return (
                  <div key={t} className="flex items-center gap-2.5">
                    <span className="w-24 shrink-0 text-[12px] text-[var(--color-fg-muted)]">{label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
                      <div className="h-full w-full origin-left rounded-full" style={{ transform: `scaleX(${m.turnos[t] / max})`, transition: 'transform 0.7s cubic-bezier(0.16,1,0.3,1)', background: 'var(--color-accent)', opacity: 0.6 }} />
                    </div>
                    <span className="w-10 text-right text-numeric text-[11px] text-[var(--color-fg-muted)]">{m.turnos[t]}</span>
                  </div>
                )
              })}
            </div>
          </Painel>
        </div>

      </section>

      {/* ═══════ 05 — TENDÊNCIAS ═══════ */}
      <section id="sec-tend" key="v-tend" data-tour="tendencias" className="scroll-mt-32 space-y-5 animate-fade-up">
        <SecaoHead n={MOSTRAR_SEGURANCA_CARGA ? '05' : '04'} titulo="Tendências e análise" sub="Como o período evoluiu dia a dia." />

        {(m.tempoMedioRotaMin != null || m.tempoMedioLojaMin != null) && <JornadaOperacional m={m} />}

        {m.serie.length > 1 && <SerieChart serie={m.serie} />}

        {(m.serieTempos.length >= 2 || m.distHorarioSaida.some(h => h.entregas > 0)) && (
          // auto-fit: um gráfico sozinho ocupa a largura toda (sem "buraco" ao lado);
          // dois ou três se distribuem em colunas iguais.
          <div data-tour="tendencias-tempos" className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
            <EvolucaoTempos m={m} />
            <DistribuicaoHoraria m={m} />
            <DistribuicaoVolta m={m} />
          </div>
        )}

        {m.topMotoristas.length > 0 && (
          <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(420px,1fr))]">
            <TopMotoristas m={m} onVerTodos={() => setDetalhe('motoristas')} />
          </div>
        )}
      </section>

      {detalhe && (
        <ModalDetalhe tipo={detalhe} m={m} resumo={resumoRisco} lojaHref={lojaHref} onClose={() => setDetalhe(null)} />
      )}
    </div>
  )
}

// tooltip CSS-only (substitui title nativo)
function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="group/tip relative h-full">
      {children}
      <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 scale-95 whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1 text-numeric text-[10px] text-[var(--color-fg)] opacity-0 shadow-soft transition-[opacity,transform] duration-150 group-hover/tip:scale-100 group-hover/tip:opacity-100">
        {label}
      </span>
    </div>
  )
}

// Cabeçalho de camada — número + pergunta + uma linha de contexto. Cria a
// hierarquia de seção que faltava (antes eram só text-overline soltos).
// Alertas automáticos: o sistema acha sozinho os 3-4 pontos mais críticos do
// período (taxa, queda, rede ruim, GPS, loja problema) — tira do cliente o
// trabalho de garimpar nos gráficos. Tudo derivado das métricas existentes.
function Alertas({ m, mAnt, lojaHref }: { m: Metricas; mAnt: Metricas | null; lojaHref: (r: string, l: string) => string }) {
  type Al = { sev: 'bad' | 'warn'; txt: string; href?: string }
  const al: Al[] = []
  const pctFalha = m.total ? Math.round(100 * m.nao_foi / m.total) : 0
  const delta = mAnt && mAnt.total ? m.pctEntregue - mAnt.pctEntregue : null

  if (m.pctEntregue < META_ENTREGA) al.push({ sev: m.pctEntregue < 80 ? 'bad' : 'warn', txt: `Taxa de entrega em ${m.pctEntregue}% (meta ${META_ENTREGA}%)` })
  if (delta != null && delta <= -3) al.push({ sev: 'bad', txt: `Caiu ${Math.abs(delta)} pts vs período anterior` })
  const pior = [...m.porRede].filter(r => r.total >= 5).sort((a, b) => a.pctEntregue - b.pctEntregue)[0]
  if (pior && pior.pctEntregue < 80) al.push({ sev: 'bad', txt: `${REDE_LABEL[pior.rede_id] ?? pior.rede_id} com ${pior.pctEntregue}% de entrega` })
  if (m.pctSemRastreador > 10) al.push({ sev: m.pctSemRastreador > 20 ? 'bad' : 'warn', txt: `${m.pctSemRastreador}% sem rastreador (${m.sem_rastreador} entregas)` })
  if (pctFalha > 10) al.push({ sev: pctFalha > 20 ? 'bad' : 'warn', txt: `${pctFalha}% não foi ao cliente (${m.nao_foi})` })
  // Safeguard anti-falsa-confiança: muita linha "em análise" (sem legenda nem
  // horário) significa que a taxa, mesmo alta, cobre só uma parte do dia.
  const pctIndef = m.total ? Math.round(100 * m.indefinido / m.total) : 0
  if (pctIndef > 15) al.push({ sev: pctIndef > 30 ? 'bad' : 'warn', txt: `${pctIndef}% em análise (${m.indefinido} sem legenda/horário)` })
  const topLoja = m.topNaoFoi[0] ?? m.topSemRastreador[0]
  if (topLoja && topLoja.ocorrencias >= 3) al.push({ sev: 'warn', txt: `${topLoja.loja}: ${topLoja.ocorrencias} ocorrências`, href: lojaHref(topLoja.rede_id, topLoja.loja) })

  const top = al.slice(0, 4)
  if (top.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-success)]/30 bg-[var(--color-success-soft)] px-4 py-2.5 text-[12.5px] font-medium animate-fade-up" style={{ color: 'var(--color-success-soft-fg)' }}>
        <CheckCircle size={15} weight="fill" /> Tudo dentro da meta neste período — nenhum alerta.
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2 animate-fade-up">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">
        <WarningCircle size={13} weight="fill" style={{ color: COR.warn }} /> Atenção
      </span>
      {top.map((a, i) => {
        const cor = a.sev === 'bad' ? COR.bad : COR.warn
        const inner = (
          <>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cor }} />
            {a.txt}
          </>
        )
        const cls = 'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium'
        return a.href
          ? <Link key={i} href={a.href} className={`${cls} transition-colors hover:bg-[var(--color-bg-hover)]`} style={{ borderColor: `color-mix(in oklab, ${cor} 45%, transparent)`, color: 'var(--color-fg)' }}>{inner}</Link>
          : <span key={i} className={cls} style={{ borderColor: `color-mix(in oklab, ${cor} 45%, transparent)`, color: 'var(--color-fg)' }}>{inner}</span>
      })}
    </div>
  )
}

// Resumo executivo: o período inteiro numa frase. Usa só dados que já existem.
function ResumoExecutivo({ m, mAnt, periodo }: { m: Metricas; mAnt: Metricas | null; periodo: Periodo }) {
  const pctGps = m.total ? Math.round(100 * m.com_rastreador / m.total) : 0
  const conferiveis = m.entregue + m.nao_foi
  const foraConf = m.total - conferiveis // sem rastreador + sem dado
  const delta = mAnt && mAnt.total ? m.pctEntregue - mAnt.pctEntregue : null
  const periodoLabel = ({ dia: 'No dia', semana: 'Na semana', mes: 'No mês', ano: 'No ano', custom: 'No período' } as Record<Periodo, string>)[periodo]
  const pior = [...m.porRede].filter(r => r.total >= 5).sort((a, b) => a.pctEntregue - b.pctEntregue)[0]
  const tom = tomTaxa(m.pctEntregue)
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-4 shadow-soft animate-fade-up sm:px-6">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: COR[tom] }} />
      <p className="text-[14px] leading-relaxed text-[var(--color-fg-muted)] sm:text-[15px]">
        {periodoLabel}, <strong style={{ color: COR[tom] }}>{m.pctEntregue}% das conferíveis</strong> foram concluídas <span className="text-numeric">({m.entregue} de {conferiveis})</span>
        {delta != null && delta !== 0 && (
          <span className="text-numeric"> ({delta > 0 ? '↑' : '↓'} {Math.abs(delta)} pts vs período anterior)</span>
        )}
        {' · '}<strong className="text-[var(--color-fg)]">{m.nao_foi}</strong> não foi ao cliente
        {foraConf > 0 && (
          <> · <strong className="text-[var(--color-fg)]">{foraConf}</strong> fora da conferência</>
        )}
        {' · '}<strong className="text-[var(--color-fg)]">{pctGps}%</strong> com GPS
        {pior && pior.pctEntregue < m.pctEntregue && (
          <> · rede que mais puxa pra baixo: <strong className="text-[var(--color-fg)]">{REDE_LABEL[pior.rede_id] ?? pior.rede_id}</strong> <span className="text-numeric">({pior.pctEntregue}%)</span></>
        )}.
      </p>
    </div>
  )
}

function SecaoHead({ n, titulo, sub }: { n: string; titulo: string; sub: string }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-[var(--color-border)] pb-3">
      <span className="text-numeric text-[11px] font-semibold tabular-nums text-[var(--color-fg-subtle)]">{n}</span>
      <div className="min-w-0">
        <h2 className="text-[16px] font-semibold leading-tight tracking-[-0.01em] text-[var(--color-fg)]">{titulo}</h2>
        <p className="mt-0.5 text-[12px] text-[var(--color-fg-muted)]">{sub}</p>
      </div>
    </div>
  )
}

function HeroTile({ i, valor, label, status, nota, delta, info, onClick }: { i: number; valor: string | number; label: string; status?: 'ok' | 'warn' | 'bad'; nota?: string; delta?: React.ReactNode; info?: React.ReactNode; onClick?: () => void }) {
  const alerta = status && status !== 'ok'
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      className={`p-5 sm:p-6 animate-fade-up ${onClick ? 'cursor-pointer' : ''}`}
      style={{ animationDelay: `${i * 60}ms` }}
    >
      <div className="text-display text-numeric text-[40px] text-[var(--color-fg)]">{valor}</div>
      <div className="mt-2 flex items-center gap-1.5">
        <div className="text-overline">{label}</div>
        {alerta && <span className="h-1.5 w-1.5 rounded-full" style={{ background: COR[status!] }} />}
        {onClick && <span className="text-[10px] text-[var(--color-fg-subtle)]">↗</span>}
        {info}
      </div>
      {nota && <div className="mt-0.5 text-[11px]" style={{ color: alerta ? COR[status!] : 'var(--color-fg-subtle)' }}>{nota}</div>}
      {delta && <div className="mt-1.5">{delta}</div>}
    </div>
  )
}

function Delta({ atual, anterior, inverso, neutro, suf = ' pts' }: { atual: number | null | undefined; anterior: number | null | undefined; inverso?: boolean; neutro?: boolean; suf?: string }) {
  if (atual == null || anterior == null) return <span className="text-[10px] text-[var(--color-fg-subtle)]">sem comparação</span>
  const d = Math.round((atual - anterior) * 10) / 10
  if (d === 0) return <span className="text-[10px] text-[var(--color-fg-subtle)]">estável vs anterior</span>
  const seta = d > 0 ? '▲' : '▼'
  const cor = neutro ? 'var(--color-fg-muted)' : (inverso ? d < 0 : d > 0) ? 'var(--color-success)' : 'var(--color-danger)'
  return <span className="text-[10px] font-medium" style={{ color: cor }}>{seta} {Math.abs(d).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}{suf} vs anterior</span>
}

function Painel({ titulo, children, className }: { titulo: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`${CARD} p-5 sm:p-6 animate-fade-up ${className ?? ''}`}>
      <h3 className="flex items-center gap-1.5 text-overline">{titulo}</h3>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function VazioMini({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-[12px] text-[var(--color-fg-muted)]">{children}</p>
}

// Botão de ajuda (ⓘ): abre um balão com a explicação ao clicar. Fecha ao clicar
// de novo ou ao perder o foco — sem depender de hover (funciona no touch).
function InfoTip({ children, titulo }: { children: React.ReactNode; titulo?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label={titulo ? `Explicação: ${titulo}` : 'Explicação'}
        className="flex h-[15px] w-[15px] items-center justify-center rounded-full border border-[var(--color-border)] text-[10px] font-bold italic leading-none text-[var(--color-fg-subtle)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
      >i</button>
      {open && (
        <span className="absolute left-1/2 top-[22px] z-40 w-64 -translate-x-1/2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 text-left text-[11.5px] font-normal normal-case leading-relaxed tracking-normal text-[var(--color-fg-muted)] shadow-soft">
          {titulo && <span className="mb-1 block text-[11px] font-semibold text-[var(--color-fg)]">{titulo}</span>}
          {children}
        </span>
      )}
    </span>
  )
}

// Mesmo balão do InfoTip, mas só aparece no link público (/dashboard) — pra
// alguém de fora entender cada gráfico sem precisar perguntar. No /painel
// (equipe já conhece o sistema) o ícone nem é renderizado.
function ChartInfo({ children, titulo }: { children: React.ReactNode; titulo?: string }) {
  if (!useStandalone()) return null
  return <InfoTip titulo={titulo}>{children}</InfoTip>
}

// Seção de segurança da carga: paradas indevidas (FORA_BASE ≥10min) + mapa dos
// pontos. Vem da FONTE DA API (resumoApi), buscada em paralelo na Visão geral.
function SecaoRiscoMapa({ resumo, carregando, n, onVerAnalise, fonte }: { resumo: ResumoApi | null; carregando: boolean; n: string; onVerAnalise: (t: TipoDetalhe) => void; fonte: 'planilha' | 'rastreamento' | null }) {
  const [filtro, setFiltro] = useState<Gravidade | 'todas'>('todas')
  const pontosTodos = resumo?.pontosRisco ?? []
  const pontos = filtro === 'todas' ? pontosTodos : pontosTodos.filter(p => gravidadeDe(p.duracaoMin) === filtro)
  const pior = resumo?.topIndevidas?.[0] ?? null
  const indevidas = resumo?.paradasIndevidas ?? 0

  // Ranking de placas que MAIS PARAM (nº de paradas indevidas + tempo total parado),
  // do conjunto filtrado. Responde "quais placas são as mais problemáticas".
  const porPlaca = new Map<string, { placa: string; n: number; totalMin: number }>()
  for (const p of pontos) {
    const e = porPlaca.get(p.placa) ?? { placa: p.placa, n: 0, totalMin: 0 }
    e.n++; e.totalMin += p.duracaoMin; porPlaca.set(p.placa, e)
  }
  const rankingPlacas = [...porPlaca.values()].sort((a, b) => b.n - a.n || b.totalMin - a.totalMin)
  const rankingTop: BarItem[] = rankingPlacas.slice(0, 12).map(e => ({
    key: e.placa, label: e.placa, value: e.n, sub: `${fmtMin(e.totalMin)} parado no total`, tone: 'danger' as const,
  }))

  // Quebra por rede (do total, não do filtro — visão geral da distribuição).
  const porRede = new Map<string, number>()
  for (const p of pontosTodos) { const r = p.rede ?? '—'; porRede.set(r, (porRede.get(r) ?? 0) + 1) }
  const porRedeOrd = [...porRede.entries()].sort((a, b) => b[1] - a[1])
  const temRede = porRedeOrd.some(([r]) => r !== '—')

  const FILTROS: Array<{ k: Gravidade | 'todas'; rotulo: string; cor?: string }> = [
    { k: 'todas', rotulo: 'Todas' },
    { k: 'moderada', rotulo: '< 30min', cor: '#eab308' },
    { k: 'alta', rotulo: '30min–1h30', cor: '#f97316' },
    { k: 'critica', rotulo: '> 1h30', cor: '#ef4444' },
  ]

  return (
    <section id="sec-risco" data-tour="risco" className="scroll-mt-32 space-y-5 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SecaoHead n={n} titulo="Segurança da carga" sub="Paradas fora de loja e da base por 10min ou mais — o evento de risco da carga, e onde aconteceram." />
        {/* Filtros de gravidade NO TOPO da seção — controlam o ranking e o mapa juntos */}
        {pontosTodos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-[var(--color-fg-subtle)]">Tempo parado:</span>
            {FILTROS.map(f => (
              <button
                key={f.k} onClick={() => setFiltro(f.k)}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                  filtro === f.k ? 'border-[var(--color-accent)] text-[var(--color-fg)]' : 'border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)]',
                ].join(' ')}
              >
                {f.cor && <span className="h-2 w-2 rounded-full" style={{ background: f.cor }} />}
                {f.rotulo}
              </button>
            ))}
          </div>
        )}
      </div>

      {carregando && !resumo ? (
        <div style={{ height: 320, borderRadius: 'var(--radius-card)' }} className="animate-pulse bg-[var(--color-bg-elevated)]" />
      ) : (!resumo || (indevidas === 0 && fonte !== 'rastreamento')) ? (
        // Tem número (planilha) mas não tem rastreamento gerado pra este período:
        // explica o porquê em vez de sumir o mapa sem aviso.
        <div className={`${CARD} p-8 text-center`}>
          <p className="text-[13px] font-medium text-[var(--color-fg)]">Este período não tem rastreamento gerado.</p>
          <p className="mx-auto mt-1.5 max-w-[48ch] text-[12px] leading-relaxed text-[var(--color-fg-muted)]">
            Os números acima vieram da planilha. Para ver o mapa e as paradas indevidas, gere este período em <strong>Gerar KPI</strong> (escala + relatório do Unitrac).
          </p>
        </div>
      ) : indevidas === 0 ? (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-success)]/30 bg-[var(--color-success-soft)] px-4 py-3 text-[13px] font-medium" style={{ color: 'var(--color-success-soft-fg)' }}>
          <CheckCircle size={16} weight="fill" /> Rastreamento gerado, nenhuma parada indevida no período.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div onClick={() => onVerAnalise('placas')} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onVerAnalise('placas') } }} className={`flex cursor-pointer flex-col gap-4 p-5 sm:p-6 ${CARD}`}>
              <div>
                <div className="flex items-center gap-1.5 text-overline">
                  Paradas indevidas
                  <span className="text-[10px] text-[var(--color-fg-subtle)]">↗</span>
                  <InfoTip titulo="O que é uma parada indevida?">
                    Veículo parado <strong>10 minutos ou mais</strong> fora de qualquer loja e fora da base. É o principal sinal de risco da carga: desvio de rota, parada não programada ou abordagem. Quanto mais tempo parado, mais grave.
                  </InfoTip>
                </div>
                <div className="mt-2 text-display text-numeric text-[44px] leading-none" style={{ color: 'var(--color-danger)' }}>{fmtNum(indevidas)}</div>
                <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">eventos de risco no período</p>
              </div>
              {pior && (
                <div className="border-t border-[var(--color-border)] pt-3">
                  <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-fg-subtle)]">Pior caso</div>
                  <div className="mt-1 text-numeric text-[15px] font-semibold text-[var(--color-fg)]">{pior.placa}</div>
                  <div className="text-[11px] text-[var(--color-fg-subtle)]">{fmtMin(pior.duracaoMin)} parada, às {pior.hora}</div>
                </div>
              )}
              {temRede && (
                <div className="border-t border-[var(--color-border)] pt-3">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.1em] text-[var(--color-fg-subtle)]">Por rede</div>
                  <div className="flex flex-wrap gap-1.5">
                    {porRedeOrd.filter(([r]) => r !== '—').slice(0, 8).map(([r, q]) => (
                      <span key={r} className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] text-[var(--color-fg-muted)]">
                        {REDE_LABEL[r] ?? r} <span className="text-numeric font-semibold text-[var(--color-fg)]">{q}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="lg:col-span-2">
              <Painel titulo="Placas que mais param">
                {rankingTop.length ? (
                  <>
                    <BarList items={rankingTop} format={(v) => `${v}×`} showRank />
                    {rankingPlacas.length > rankingTop.length && (
                      <button onClick={() => onVerAnalise('placas')} className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-accent)] hover:underline">
                        Ver todas as {rankingPlacas.length} placas →
                      </button>
                    )}
                  </>
                ) : <VazioMini>Nenhuma parada indevida nesse filtro.</VazioMini>}
              </Painel>
            </div>
          </div>

          {/* Atalhos pra TODAS as análises de paradas indevidas (abrem ampliado na tela) */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-[var(--color-fg-subtle)]">Ver paradas por:</span>
            {([['placas', 'Placa'], ['mot-paradas', 'Motorista'], ['paradas-rede', 'Rede'], ['paradas-local', 'Local'], ['paradas-longas', 'Mais longas'], ['paradas-horario', 'Horário']] as [TipoDetalhe, string][]).map(([t, label]) => (
              <button key={t} onClick={() => onVerAnalise(t)} className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-fg)]">
                {label} →
              </button>
            ))}
          </div>

          {pontosTodos.length > 0 && (
            <div className="space-y-2">
              <div className={`overflow-hidden p-1.5 ${CARD}`}>
                <MapaRisco pontos={pontos} />
              </div>
              <p className="text-[11px] text-[var(--color-fg-subtle)]">
                {pontos.length === pontosTodos.length
                  ? `${pontos.length} parada${pontos.length === 1 ? '' : 's'} no mapa`
                  : `${pontos.length} de ${pontosTodos.length} paradas (filtro ativo)`}
                {' · '}bolha maior = parada mais longa · passe o mouse para ver placa, duração e horário.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  )
}

const META_ENTREGA = 95

function PorRede({ redes }: { redes: Metricas['porRede'] }) {
  // ordena pior → melhor: quem está abaixo da meta aparece primeiro (onde agir)
  const ord = [...redes].sort((a, b) => a.pctEntregue - b.pctEntregue)
  const abaixo = ord.filter(r => r.pctEntregue < META_ENTREGA).length
  return (
    <div className={`${CARD} p-5 sm:p-6 animate-fade-up`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-overline">
          Desempenho por rede
          <ChartInfo titulo="Desempenho por rede">
            Barra de <strong>% de entrega</strong> de cada rede no período, da pior pra melhor. O traço vertical marca a meta ({META_ENTREGA}%); o número à direita é o total de entregas da rede.
          </ChartInfo>
        </h3>
        <span className="text-[11px] text-[var(--color-fg-subtle)]">
          meta ≥ {META_ENTREGA}%{abaixo > 0 && <> · <span className="font-semibold" style={{ color: COR.bad }}>{abaixo} abaixo</span></>}
        </span>
      </div>
      <div className="mt-4 space-y-2.5">
        {ord.map(r => {
          const tom = tomTaxa(r.pctEntregue)
          return (
            <div key={r.rede_id} className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COR[tom] }} title={tom === 'ok' ? 'na meta' : tom === 'warn' ? 'atenção' : 'abaixo da meta'} />
              <span className="w-24 shrink-0 truncate text-[12px] text-[var(--color-fg)]" title={REDE_LABEL[r.rede_id] ?? r.rede_id}>{REDE_LABEL[r.rede_id] ?? r.rede_id}</span>
              <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-subtle)] ring-1 ring-inset ring-[var(--color-border)]">
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${r.pctEntregue}%`, transition: 'width 0.7s cubic-bezier(0.16,1,0.3,1)', background: COR[tom] }} />
                {/* marca da meta */}
                <span className="absolute inset-y-0 w-px bg-[var(--color-fg-subtle)]" style={{ left: `${META_ENTREGA}%`, opacity: 0.55 }} />
              </div>
              <span className="w-10 text-right text-numeric text-[11px] font-semibold" style={{ color: COR[tom] }}>{r.pctEntregue}%</span>
              <span className="w-7 text-right text-numeric text-[11px] text-[var(--color-fg-subtle)]" title="entregas no período">{r.total}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Cobertura de GPS por rede — espelho do "Desempenho por rede", mas pra rastreamento.
// Mostra quais redes têm mais entregas sem registro de GPS (onde o rastreador falha).
function CoberturaGpsRede({ redes }: { redes: Metricas['porRede'] }) {
  const linhas = redes
    .map(r => ({ rede_id: r.rede_id, total: r.total, sem: r.sem_rastreador, pct: r.total > 0 ? Math.round(((r.total - r.sem_rastreador) / r.total) * 100) : 0 }))
    .sort((a, b) => a.pct - b.pct) // pior cobertura primeiro (onde agir)
  return (
    <div className={`${CARD} p-5 sm:p-6 animate-fade-up`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-overline">
          Cobertura de GPS por rede
          <ChartInfo titulo="Cobertura de GPS por rede">
            % de entregas de cada rede com <strong>posição confirmada pelo rastreador</strong>, da pior cobertura pra melhor. O número à direita é quantas entregas ficaram sem GPS.
          </ChartInfo>
        </h3>
        <span className="text-[11px] text-[var(--color-fg-subtle)]">% das entregas com rastreador</span>
      </div>
      <div className="mt-4 space-y-2.5">
        {linhas.map(r => {
          const tom = tomGps(r.pct)
          return (
            <div key={r.rede_id} className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COR[tom] }} />
              <span className="w-24 shrink-0 truncate text-[12px] text-[var(--color-fg)]" title={REDE_LABEL[r.rede_id] ?? r.rede_id}>{REDE_LABEL[r.rede_id] ?? r.rede_id}</span>
              <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-subtle)] ring-1 ring-inset ring-[var(--color-border)]">
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${r.pct}%`, transition: 'width 0.7s cubic-bezier(0.16,1,0.3,1)', background: COR[tom] }} />
              </div>
              <span className="w-10 text-right text-numeric text-[11px] font-semibold" style={{ color: COR[tom] }}>{r.pct}%</span>
              <span className="w-9 text-right text-numeric text-[11px] text-[var(--color-fg-subtle)]" title="entregas sem rastreador">{r.sem || '—'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const PALETA_REDE = ['var(--color-accent)', 'var(--color-info)', 'var(--color-success)', 'var(--color-warning)', 'var(--color-danger)', 'var(--color-navy-300)']

function DonutRede({ porRede }: { porRede: Metricas['porRede'] }) {
  const sorted = [...porRede].sort((a, b) => b.total - a.total)
  const top = sorted.slice(0, 6)
  const resto = sorted.slice(6)
  const slices = top.map((r, i) => ({ label: REDE_LABEL[r.rede_id] ?? r.rede_id, value: r.total, color: PALETA_REDE[i] }))
  if (resto.length) slices.push({ label: `Outras (${resto.length})`, value: resto.reduce((s, r) => s + r.total, 0), color: 'var(--color-fg-subtle)' })
  return (
    <div className={`${CARD} p-5 sm:p-6 animate-fade-up`}>
      <h3 className="mb-4 flex items-center gap-1.5 text-overline">
        Participação no volume por rede
        <ChartInfo titulo="Participação no volume por rede">
          Fatia de cada rede no <strong>total de entregas</strong> do período — quem puxa mais volume, não necessariamente quem entrega melhor (isso é a seção &quot;Desempenho por rede&quot;).
        </ChartInfo>
      </h3>
      <Donut slices={slices} centerLabel="entregas" />
    </div>
  )
}

function HeatmapDiaRede({ m }: { m: Metricas }) {
  const md = m.matrizDiaRede
  if (!md || md.dias.length < 2 || md.redes.length === 0) return null
  const { dias, redes } = md
  return (
    <div className={`${CARD} p-5 sm:p-6 animate-fade-up`}>
      <h3 className="text-overline mb-1">Taxa de entrega — dia × rede</h3>
      <p className="mb-4 text-[12px] text-[var(--color-fg-subtle)]">Cada célula é a % de entrega da rede naquele dia. Vermelho = ponto fraco; passe o mouse pra ver o valor.</p>
      <Heatmap
        colLabels={dias.map(d => d.slice(8, 10))}
        rows={redes.map(r => ({ key: r.rede_id, label: REDE_LABEL[r.rede_id] ?? r.rede_id, cells: r.celulas.map(c => ({ value: c.pct, n: c.n })) }))}
      />
    </div>
  )
}

// ──────────────────────────────────────────────── Seções de tempo (novas) ──

function TempoStrip({ m, mAnt, onVer }: { m: Metricas; mAnt: Metricas | null; onVer: (t: TipoDetalhe) => void }) {
  if (m.tempoMedioRotaMin == null && m.tempoMedioTotalMin == null) return null
  const tiles: Array<{ label: string; value: string; sub: string; color: string; atual: number | null; anterior: number | null | undefined; detalhe?: TipoDetalhe }> = [
    { label: 'Tempo médio de rota', value: fmtMin(m.tempoMedioRotaMin), sub: 'CD → Loja', color: 'var(--color-accent)', atual: m.tempoMedioRotaMin, anterior: mAnt?.tempoMedioRotaMin, detalhe: 'rotas' },
    { label: 'Tempo médio em loja', value: fmtMin(m.tempoMedioLojaMin), sub: 'Chegada → Saída', color: 'var(--color-warning)', atual: m.tempoMedioLojaMin, anterior: mAnt?.tempoMedioLojaMin, detalhe: 'tempo-loja' },
    { label: 'Tempo total médio', value: fmtMin(m.tempoMedioTotalMin), sub: 'Saída CD → Saída Loja', color: 'var(--color-info)', atual: m.tempoMedioTotalMin, anterior: mAnt?.tempoMedioTotalMin },
  ]
  // Tempo de volta e tempo de operação (Chegada CD) só aparecem quando os KPIs do
  // período têm a coluna preenchida.
  if (m.tempoMedioVoltaMin != null) {
    tiles.push({ label: 'Tempo de volta', value: fmtMin(m.tempoMedioVoltaMin), sub: 'Saída Loja → Chegada CD', color: 'var(--color-fg-muted)', atual: m.tempoMedioVoltaMin, anterior: mAnt?.tempoMedioVoltaMin ?? null })
  }
  if (m.tempoMedioOperacaoMin != null) {
    tiles.push({ label: 'Tempo de operação', value: fmtMin(m.tempoMedioOperacaoMin), sub: 'Saída CD → Chegada CD', color: 'var(--color-success)', atual: m.tempoMedioOperacaoMin, anterior: mAnt?.tempoMedioOperacaoMin ?? null })
  }
  const gridCols = tiles.length >= 5 ? 'grid-cols-2 sm:grid-cols-5' : tiles.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
  return (
    <div data-tour="resumo-tempos" className={`grid ${gridCols} overflow-hidden divide-x divide-[var(--color-border)] ${CARD} animate-fade-up`}>
      {tiles.map((t, i) => (
        <div
          key={t.label}
          onClick={t.detalhe ? () => onVer(t.detalhe!) : undefined}
          role={t.detalhe ? 'button' : undefined} tabIndex={t.detalhe ? 0 : undefined}
          onKeyDown={t.detalhe ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onVer(t.detalhe!) } } : undefined}
          className={`p-4 sm:p-5 ${t.detalhe ? 'cursor-pointer transition-colors hover:bg-[var(--color-bg-subtle)]' : ''}`}
        >
          <div className="flex items-center gap-1.5 text-overline">
            {t.label}
            {t.detalhe && <span className="text-[10px] text-[var(--color-fg-subtle)]">↗</span>}
            {i === 0 && (
              <InfoTip titulo="Como ler os tempos">
                Cada número é a <strong>média</strong> de todas as entregas do período (soma os tempos e divide pela quantidade). O texto embaixo diz o trecho medido: <strong>rota</strong> é do CD até a loja, <strong>em loja</strong> é da chegada à saída, e <strong>total</strong> é da saída do CD até sair da loja.
              </InfoTip>
            )}
          </div>
          <div className="mt-2 text-display text-numeric text-[28px] leading-none" style={{ color: t.color }}>
            {t.value}
          </div>
          <div className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">{t.sub}</div>
          <div className="mt-1.5"><Delta atual={t.atual} anterior={t.anterior} inverso suf=" min" /></div>
        </div>
      ))}
    </div>
  )
}

function EvolucaoTempos({ m }: { m: Metricas }) {
  if (m.serieTempos.length < 2) return null
  const temOperacao = m.serieTempos.some(s => s.tempo_operacao != null)
  const series = [
    { name: 'Tempo de Rota', color: 'var(--color-accent)', values: m.serieTempos.map(s => s.tempo_rota ?? 0), fill: true },
    { name: 'Tempo em Loja', color: 'var(--color-warning)', values: m.serieTempos.map(s => s.tempo_loja ?? 0), fill: true },
    { name: 'Tempo Total', color: 'var(--color-info)', values: m.serieTempos.map(s => s.tempo_total ?? 0), dashed: true },
  ]
  if (temOperacao) series.push({ name: 'Operação (base→base)', color: 'var(--color-success)', values: m.serieTempos.map(s => s.tempo_operacao ?? 0), dashed: true })
  return (
    <div className={`${CARD} p-5 sm:p-6 animate-fade-up`}>
      <h3 className="mb-4 flex items-center gap-1.5 text-overline">
        Evolução dos tempos médios
        <ChartInfo titulo="Evolução dos tempos médios">
          Como os tempos de <strong>rota</strong>, <strong>loja</strong> e <strong>total</strong> mudaram dia a dia no período — linha subindo é o trecho ficando mais lento.
        </ChartInfo>
      </h3>
      <LineChart
        labels={m.serieTempos.map(s => s.data.slice(8, 10))}
        series={series}
        height={260}
        labelEvery={m.serieTempos.length > 14 ? 3 : 2}
      />
    </div>
  )
}

function DistribuicaoHoraria({ m }: { m: Metricas }) {
  const temDados = m.distHorarioSaida.some(h => h.entregas > 0)
  if (!temDados) return null
  const peak = m.distHorarioSaida.reduce((best, h) => h.entregas > best.entregas ? h : best)
  const total = m.distHorarioSaida.reduce((s, h) => s + h.entregas, 0)
  const earlyShare = total ? Math.round(m.distHorarioSaida.filter(h => h.hora >= 3 && h.hora <= 6).reduce((s, h) => s + h.entregas, 0) / total * 100) : 0
  return (
    <div className={`${CARD} p-5 sm:p-6 animate-fade-up`}>
      <h3 className="text-overline mb-1">Horário de saída do CD</h3>
      <p className="mb-4 text-[12px] text-[var(--color-fg-subtle)]">Quando os caminhões deixam o centro de distribuição</p>
      <ColumnChart
        items={m.distHorarioSaida.map(h => ({
          label: String(h.hora).padStart(2, '0'),
          value: h.entregas,
        }))}
        format={n => String(Math.round(n))}
        height={220}
        highlightIndex={peak.hora}
        labelEvery={2}
      />
      <div className="mt-3 rounded-[var(--radius-md)] border-l-[3px] border-l-[var(--color-info)] bg-[var(--color-info-soft)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--color-info-soft-fg)]">
        <strong>Pico às {String(peak.hora).padStart(2, '0')}h</strong> — {earlyShare}% das saídas ocorrem entre 03h e 06h.
      </div>
    </div>
  )
}

function DistribuicaoVolta({ m }: { m: Metricas }) {
  const temDados = m.distHorarioVolta.some(h => h.entregas > 0)
  if (!temDados) return null
  const peak = m.distHorarioVolta.reduce((best, h) => h.entregas > best.entregas ? h : best)
  return (
    <div className={`${CARD} p-5 sm:p-6 animate-fade-up`}>
      <h3 className="text-overline mb-1">Horário de retorno à base</h3>
      <p className="mb-4 text-[12px] text-[var(--color-fg-subtle)]">Quando os caminhões voltam pro CD (coluna Chegada CD)</p>
      <ColumnChart
        items={m.distHorarioVolta.map(h => ({ label: String(h.hora).padStart(2, '0'), value: h.entregas }))}
        format={n => String(Math.round(n))}
        height={220}
        highlightIndex={peak.hora}
        labelEvery={2}
      />
      <div className="mt-3 rounded-[var(--radius-md)] border-l-[3px] border-l-[var(--color-success)] bg-[var(--color-success-soft)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--color-success-soft-fg)]">
        <strong>Pico de retorno às {String(peak.hora).padStart(2, '0')}h</strong> — {m.pctComVolta}% das entregas registraram a volta à base no período.
      </div>
    </div>
  )
}

type MetricaRede = 'tempo_rota' | 'tempo_loja' | 'tempo_total' | 'tempo_operacao'
const LABEL_METRICA: Record<MetricaRede, string> = { tempo_rota: 'Tempo de Rota', tempo_loja: 'Tempo em Loja', tempo_total: 'Tempo Total', tempo_operacao: 'Operação' }

function ComparativoRede({ m }: { m: Metricas }) {
  const [metrica, setMetrica] = useState<MetricaRede>('tempo_rota')
  const temDados = m.porClienteComTempos.some(c => c.tempo_rota != null || c.tempo_loja != null)
  if (!temDados) return null

  const sorted = [...m.porClienteComTempos]
    .filter(c => c[metrica] != null)
    .sort((a, b) => (b[metrica] ?? 0) - (a[metrica] ?? 0))

  const items: BarItem[] = sorted.map(c => ({
    key: c.rede_id,
    label: REDE_LABEL[c.rede_id] ?? c.rede_id,
    value: c[metrica] ?? 0,
    sub: `${c.entregas} entregas · ${c.lojas} lojas`,
    tone: 'accent' as const,
  }))

  return (
    <div data-tour="tendencias-comparativo" className={`${CARD} p-5 sm:p-6 animate-fade-up`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-overline">
          {LABEL_METRICA[metrica]} médio por rede
          <ChartInfo titulo="Tempo médio por rede">
            Média do trecho escolhido nos botões acima, por rede — <strong>rota</strong> é CD→loja, <strong>em loja</strong> é chegada→saída, <strong>total</strong> é saída do CD até sair da loja. Barras maiores = mais tempo (pior).
          </ChartInfo>
        </h3>
        <div className="flex gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-0.5">
          {(Object.keys(LABEL_METRICA) as MetricaRede[]).map(k => (
            <button
              key={k}
              onClick={() => setMetrica(k)}
              className={[
                'cursor-pointer rounded-[calc(var(--radius-md)-3px)] px-2.5 py-1 text-[11px] font-medium transition-colors duration-150',
                metrica === k
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
                  : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
              ].join(' ')}
            >
              {LABEL_METRICA[k]}
            </button>
          ))}
        </div>
      </div>
      {items.length > 0 ? (
        <BarList items={items} format={fmtMin} />
      ) : (
        <p className="py-6 text-center text-[12px] text-[var(--color-fg-subtle)]">
          Sem dados de {LABEL_METRICA[metrica].toLowerCase()} no período.
        </p>
      )}
    </div>
  )
}

function TopRotas({ m, lojaHref, onVerTodos }: { m: Metricas; lojaHref: (rede: string, loja: string) => string; onVerTodos: () => void }) {
  if (m.topRotasDemoradas.length === 0) return null
  const maxRota = m.topRotasDemoradas[0].tempo_rota ?? 1
  const items: BarItem[] = m.topRotasDemoradas.slice(0, 15).map((r, i) => ({
    key: `${r.rede_id}|${r.loja}`,
    label: r.loja,
    value: r.tempo_rota ?? 0,
    sub: `${REDE_LABEL[r.rede_id] ?? r.rede_id} · ${r.n} entregas`,
    tone: i < 3 ? 'danger' : ('warning' as const),
  }))
  const worst = m.topRotasDemoradas[0]
  const pctAcima = m.tempoMedioRotaMin
    ? Math.round((worst.tempo_rota ?? 0) / m.tempoMedioRotaMin * 100 - 100)
    : null
  return (
    <div className={`${CARD} p-5 sm:p-6 animate-fade-up`}>
      <h3 className="text-overline mb-1">Rotas mais demoradas</h3>
      <p className="mb-5 text-[12px] text-[var(--color-fg-subtle)]">Top 15 lojas com maior tempo médio CD → Loja</p>
      <BarList items={items} format={fmtMin} showRank maxValue={maxRota} hrefDe={it => { const [r, l] = it.key.split('|'); return lojaHref(r, l) }} />
      {pctAcima != null && (
        <div className="mt-4 rounded-[var(--radius-md)] border-l-[3px] border-l-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--color-warning-soft-fg)]">
          <strong>{worst.loja}</strong> ({REDE_LABEL[worst.rede_id] ?? worst.rede_id}) lidera com {fmtMin(worst.tempo_rota)} — {pctAcima}% acima da média geral.
        </div>
      )}
      <button onClick={onVerTodos} className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-accent)] hover:underline">Ver todas as rotas →</button>
    </div>
  )
}

function TopTempoLoja({ m, lojaHref, onVerTodos }: { m: Metricas; lojaHref: (rede: string, loja: string) => string; onVerTodos: () => void }) {
  if (m.topTempoEmLoja.length === 0) return null
  const maxLoja = m.topTempoEmLoja[0].tempo_loja ?? 1
  const items: BarItem[] = m.topTempoEmLoja.slice(0, 15).map((r, i) => ({
    key: `${r.rede_id}|${r.loja}`,
    label: r.loja,
    value: r.tempo_loja ?? 0,
    sub: `${REDE_LABEL[r.rede_id] ?? r.rede_id} · ${r.n} entregas`,
    tone: i < 3 ? 'danger' : ('warning' as const),
  }))
  return (
    <div className={`${CARD} p-5 sm:p-6 animate-fade-up`}>
      <h3 className="text-overline mb-1">Maior tempo parado em cliente</h3>
      <p className="mb-5 text-[12px] text-[var(--color-fg-subtle)]">Top 15 lojas com maior tempo médio de descarga</p>
      <BarList items={items} format={fmtMin} showRank maxValue={maxLoja} hrefDe={it => { const [r, l] = it.key.split('|'); return lojaHref(r, l) }} />
      <button onClick={onVerTodos} className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-accent)] hover:underline">Ver todas as lojas →</button>
    </div>
  )
}

function TopMotoristas({ m, onVerTodos }: { m: Metricas; onVerTodos: () => void }) {
  if (m.topMotoristas.length === 0) return null
  const maxEnt = m.topMotoristas[0].entregas
  return (
    <div data-tour="tendencias-motoristas" className={`${CARD} overflow-hidden animate-fade-up`}>
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <h3 className="text-overline mb-1">Visão por motorista</h3>
        <p className="mb-4 text-[12px] text-[var(--color-fg-subtle)]">Top 15 por volume de entregas no período</p>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[10px] uppercase tracking-[0.1em] text-[var(--color-fg-subtle)]">
              <th className="px-5 py-2.5 font-semibold">#</th>
              <th className="px-3 py-2.5 font-semibold">Motorista</th>
              <th className="px-3 py-2.5 font-semibold">Entregas</th>
              <th className="px-3 py-2.5 text-right font-semibold">Rota</th>
              <th className="px-5 py-2.5 text-right font-semibold">Loja</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {m.topMotoristas.slice(0, 15).map((r, i) => (
              <tr key={r.motorista} className="transition-colors hover:bg-[var(--color-bg-subtle)]">
                <td className="px-5 py-2.5">
                  <span className={[
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[11px] font-semibold tabular-nums',
                    i < 3
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-soft-fg)]'
                      : 'bg-[var(--color-bg-subtle)] text-[var(--color-fg-subtle)]',
                  ].join(' ')}>{i + 1}</span>
                </td>
                <td className="px-3 py-2.5 font-medium text-[var(--color-fg)]">{r.motorista}</td>
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2">
                    <span
                      className="hidden h-1.5 rounded-full bg-[var(--color-accent)] sm:inline-block"
                      style={{ width: `${(r.entregas / maxEnt) * 56}px` }}
                    />
                    <span className="font-semibold tabular-nums text-[var(--color-fg)]">{r.entregas}</span>
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-fg-muted)]">{fmtMin(r.tempo_rota)}</td>
                <td className="px-5 py-2.5 text-right tabular-nums text-[var(--color-fg-muted)]">{fmtMin(r.tempo_loja)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 pb-5 sm:px-6">
        <button onClick={onVerTodos} className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-accent)] hover:underline">Ver todos os motoristas →</button>
      </div>
    </div>
  )
}

// Jornada do dia — o ciclo médio do veículo: sai do CD, roda, fica na loja e volta
// à base. Linha do tempo com as horas de pico e os tempos de cada trecho.
function JornadaOperacional({ m }: { m: Metricas }) {
  const pico = (arr: Metricas['distHorarioSaida']) => {
    let best: { hora: number; entregas: number } | null = null
    for (const h of arr) if (h.entregas > 0 && (!best || h.entregas > best.entregas)) best = h
    return best ? best.hora : null
  }
  const fmtH = (h: number | null) => (h == null ? null : `${String(h).padStart(2, '0')}h`)
  const temVolta = m.tempoMedioOperacaoMin != null && m.pctComVolta > 0

  const marcos = [
    { label: 'Sai do CD', hora: fmtH(pico(m.distHorarioSaida)), cor: 'var(--color-accent)' },
    { label: 'Chega na loja', hora: null as string | null, cor: 'var(--color-warning)' },
    { label: 'Sai da loja', hora: null as string | null, cor: 'var(--color-warning)' },
    ...(temVolta ? [{ label: 'Volta à base', hora: fmtH(pico(m.distHorarioVolta)), cor: 'var(--color-success)' }] : []),
  ]
  const segmentos = [
    { label: 'rota', valor: m.tempoMedioRotaMin },
    { label: 'na loja', valor: m.tempoMedioLojaMin },
    ...(temVolta ? [{ label: 'volta', valor: m.tempoMedioVoltaMin }] : []),
  ]

  return (
    <div className={`${CARD} p-5 sm:p-6 animate-fade-up`}>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-overline">Jornada do dia</h3>
          <p className="mt-0.5 text-[12px] text-[var(--color-fg-subtle)]">O ciclo médio do veículo, do CD até a volta à base</p>
        </div>
        {temVolta && (
          <span className="text-[12px] text-[var(--color-fg-muted)]">operação completa <strong className="text-numeric text-[var(--color-fg)]">{fmtMin(m.tempoMedioOperacaoMin)}</strong></span>
        )}
      </div>
      <div className="flex items-start gap-1 overflow-x-auto pb-1">
        {marcos.flatMap((mk, i) => {
          const els = [
            <div key={`n${i}`} className="flex shrink-0 flex-col items-center gap-1.5" style={{ minWidth: 92 }}>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-bg-subtle)] ring-1 ring-inset ring-[var(--color-border)]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: mk.cor }} />
              </span>
              <span className="text-center text-[11px] font-medium leading-tight text-[var(--color-fg)]">{mk.label}</span>
              {mk.hora && <span className="text-numeric text-[11px] text-[var(--color-fg-subtle)]">~{mk.hora}</span>}
            </div>,
          ]
          if (i < segmentos.length) {
            const s = segmentos[i]
            els.push(
              <div key={`s${i}`} className="flex min-w-[78px] flex-1 flex-col items-center pt-1.5">
                <span className="mb-1.5 text-numeric text-[13px] font-semibold text-[var(--color-fg)]">{fmtMin(s.valor)}</span>
                <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--color-border-strong)] to-transparent" />
                <span className="mt-1.5 text-[10px] uppercase tracking-wide text-[var(--color-fg-subtle)]">{s.label}</span>
              </div>,
            )
          }
          return els
        })}
      </div>
      <p className="mt-4 text-[11px] text-[var(--color-fg-subtle)]">
        {temVolta
          ? `A volta à base foi registrada em ${m.pctComVolta}% das entregas do período.`
          : 'A volta à base (coluna Chegada CD) ainda não vem preenchida nos KPIs deste período — quando vier, o ciclo completa até o retorno.'}
      </p>
    </div>
  )
}

function SerieChart({ serie }: { serie: Metricas['serie'] }) {
  const max = useMemo(() => Math.max(1, ...serie.map(s => s.total)), [serie])
  return (
    <div data-tour="tendencias-serie" className={`${CARD} p-5 sm:p-6 animate-fade-up`}>
      <div className="mb-5 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-overline">
          Entregas por dia
          <ChartInfo titulo="Entregas por dia">
            Cada barra é um dia do período, empilhando <strong>entregues</strong>, <strong>não foi</strong> e <strong>sem rastreador</strong> — passe o mouse (ou toque) numa barra pra ver os números daquele dia.
          </ChartInfo>
        </h3>
        <div className="flex gap-3 text-[11px] text-[var(--color-fg-muted)]">
          {(['entregue', 'nao_foi', 'sem_rastreador'] as const).map(k => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: STATUS[k].cor }} />{STATUS[k].label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-end gap-1" style={{ height: 168 }}>
        {serie.map(s => (
          <Tip key={s.data} label={`${s.data.slice(8, 10)}/${s.data.slice(5, 7)} · ${s.total} entregas`}>
            <div className="flex h-full w-full flex-col items-center justify-end gap-1.5">
              <div className="flex w-full flex-col justify-end overflow-hidden rounded-[3px] transition-opacity group-hover/tip:opacity-80" style={{ height: 138 }}>
                <div className="w-full" style={{ height: `${138 * s.sem_rastreador / max}px`, background: STATUS.sem_rastreador.cor, opacity: 0.85 }} />
                <div className="w-full" style={{ height: `${138 * s.nao_foi / max}px`, background: STATUS.nao_foi.cor, opacity: 0.85 }} />
                <div className="w-full" style={{ height: `${138 * s.entregue / max}px`, background: STATUS.entregue.cor, opacity: 0.9 }} />
              </div>
              <span className="text-numeric text-[9px] text-[var(--color-fg-muted)]">{s.data.slice(8, 10)}</span>
            </div>
          </Tip>
        ))}
      </div>
    </div>
  )
}
