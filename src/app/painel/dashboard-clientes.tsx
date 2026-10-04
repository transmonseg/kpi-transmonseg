'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowDownRight, ArrowUpRight, FileArrowUp, ClockCounterClockwise, CaretUpDown, Question } from '@phosphor-icons/react/dist/ssr'
import { iniciarTutorial, tourJaVisto } from '@/lib/tour/store'
import { SegmentedControl } from '@/components/apple/SegmentedControl'
import { CountUp } from '@/components/apple/CountUp'
import { PageHeader } from '@/components/apple/PageHeader'
import { botao } from '@/components/apple/botao'
import { SPRING_SUAVE } from '@/lib/motion'
import type { ClienteDashboard, DiaDashboard } from '@/lib/kpi-romaneio/dashboard-dados'
import type { CargaResumo } from '@/lib/kpi-romaneio/resumo-dashboard'
import { LinhaTaxa, Colunas, type Ponto } from './dashboard-graficos'

const META = 95

const fmt1 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const fmtKm = (n: number) => `${Math.round(n).toLocaleString('pt-BR')} km`
function fmtMin(n: number | null | undefined) {
  if (n == null) return '—'
  const h = Math.floor(n / 60)
  const m = Math.round(n % 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`
}
// Saída/chegada só quando é horário (a planilha põe texto tipo "SEM RASTREADOR").
const hhmm = (s: string | null) => (s && /^\d{1,2}:\d{2}$/.test(s) ? s : null)
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

function dataCurta(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}
function dataLonga(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const s = new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const kmDia = (d: DiaDashboard) => d.resumo.cargas.reduce((a, c) => a + (c.km ?? 0), 0)
const opMediaDia = (d: DiaDashboard) => media(d.resumo.cargas.map(c => c.tempoOperacaoMin).filter((v): v is number => v != null && v > 0))
const porEntregaDia = (d: DiaDashboard) => media(d.resumo.cargas.map(c => c.tempoMedioMin).filter((v): v is number => v != null && v > 0))

type Props = {
  cliente: ClienteDashboard
  clientesVisiveis: { value: ClienteDashboard; label: string }[]
  serie: DiaDashboard[]
  podeGerar: boolean
}

export function DashboardClientes({ cliente, clientesVisiveis, serie, podeGerar }: Props) {
  const router = useRouter()
  const [pendente, startTransition] = useTransition()
  const [periodo, setPeriodo] = useState('14')

  const trocarCliente = (c: string) => {
    startTransition(() => router.replace(`/painel?cliente=${c}`, { scroll: false }))
  }

  const nome = clientesVisiveis.find(c => c.value === cliente)?.label ?? cliente

  // Primeira visita do admin: abre o tour sozinho (uma vez por navegador).
  useEffect(() => {
    if (!podeGerar || tourJaVisto()) return
    const t = window.setTimeout(() => iniciarTutorial(), 900)
    return () => window.clearTimeout(t)
  }, [podeGerar])

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Performance de entregas por cliente, dia a dia."
        actions={podeGerar && (
          <>
            <button type="button" onClick={() => iniciarTutorial()} className={botao('fantasma')}>
              <Question size={16} /> Tutorial
            </button>
            <Link href={`/painel/${cliente}/historico`} className={botao('secundario')}>
              <ClockCounterClockwise size={16} /> Histórico
            </Link>
            <Link href={`/painel/${cliente}/gerar`} className={botao('primario')} data-tour="dash-gerar">
              <FileArrowUp size={16} weight="bold" /> Gerar KPI
            </Link>
          </>
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div data-tour="dash-clientes"><SegmentedControl
            aria-label="Cliente"
            tamanho="lg"
            opcoes={clientesVisiveis}
            value={cliente}
            onChange={trocarCliente}
          /></div>
          <div data-tour="dash-periodo"><SegmentedControl
            aria-label="Período"
            opcoes={[{ value: '7', label: '7 dias' }, { value: '14', label: '14 dias' }, { value: '30', label: '30 dias' }]}
            value={periodo}
            onChange={setPeriodo}
          /></div>
        </div>
      </PageHeader>

      <AnimatePresence mode="wait">
        <motion.div
          key={cliente}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: pendente ? 0.55 : 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={SPRING_SUAVE}
        >
          {serie.length === 0 ? (
            <Vazio nome={nome} cliente={cliente} podeGerar={podeGerar} />
          ) : (
            <Painel serie={serie} dias={Number(periodo)} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function Vazio({ nome, cliente, podeGerar }: { nome: string; cliente: string; podeGerar: boolean }) {
  return (
    <div className="u-card flex flex-col items-center px-6 py-16 text-center">
      <p className="text-[20px] font-semibold tracking-[-0.01em]">Ainda sem números da {nome}</p>
      <p className="mt-2 max-w-md text-[15px] text-[var(--color-fg-muted)]">
        O dashboard se monta sozinho a cada KPI gerado. Gere o primeiro e os números aparecem aqui.
      </p>
      {podeGerar && (
        <Link href={`/painel/${cliente}/gerar`} className={botao('primario') + ' mt-6'}>
          <FileArrowUp size={16} weight="bold" /> Gerar KPI
        </Link>
      )}
    </div>
  )
}

const entrar = (i: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { ...SPRING_SUAVE, delay: 0.04 * i },
})

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

function Painel({ serie, dias }: { serie: DiaDashboard[]; dias: number }) {
  // Geração no meio do dia (rota em andamento) é parcial: fica fora da média
  // e do gráfico; aparece como aviso e dá pra abrir.
  const completos = serie.filter(d => !d.resumo.aguardando)
  const ultimo = serie[serie.length - 1]
  const parcial = ultimo?.resumo.aguardando ? ultimo : null
  const base = completos.length ? completos : serie
  const janela = base.slice(-dias)
  const [diaSel, setDiaSel] = useState(janela[janela.length - 1].data)
  const dia = serie.find(d => d.data === diaSel) ?? janela[janela.length - 1]
  const ehParcial = !!dia.resumo.aguardando
  const idx = base.indexOf(dia)
  const anterior = idx > 0 ? base[idx - 1] : null
  const delta = dia.resumo.taxa != null && anterior?.resumo.taxa != null ? dia.resumo.taxa - anterior.resumo.taxa : null

  const taxas = janela.map(d => d.resumo.taxa).filter((v): v is number => v != null)
  const kmTotal = janela.reduce((a, d) => a + kmDia(d), 0)
  const opMedia = media(janela.map(opMediaDia).filter((v): v is number => v != null))
  const porEntrega = media(janela.map(porEntregaDia).filter((v): v is number => v != null))
  const diasNaMeta = taxas.filter(t => t >= META).length

  const pontosTaxa: Ponto[] = janela.map(d => ({ chave: d.data, rotulo: dataCurta(d.data), valor: d.resumo.taxa, dica: dataCurta(d.data) }))
  const pontosKm: Ponto[] = janela.map(d => ({ chave: d.data, rotulo: dataCurta(d.data), valor: kmDia(d), dica: dataCurta(d.data) }))

  return (
    <div className="flex flex-col gap-5">
      {parcial && (
        <motion.div {...entrar(0)} className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-[var(--color-warning-soft)] px-4 py-3 text-[14px] text-[var(--color-warning-soft-fg)]">
          <span className="inline-flex items-center gap-2">
            <span className="size-2 animate-pulse rounded-full bg-[var(--color-warning)]" />
            <span><b>{dataLonga(parcial.data)}</b> ainda em andamento — KPI gerado às {hora(parcial.geradoEm)} com {(parcial.resumo.aguardando ?? 0).toLocaleString('pt-BR')} NFs aguardando o fim da rota.</span>
          </span>
          <button
            type="button"
            onClick={() => setDiaSel(dia.data === parcial.data ? janela[janela.length - 1].data : parcial.data)}
            className="rounded-full bg-[var(--color-bg-elevated)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--color-fg)] u-motion u-press"
          >
            {dia.data === parcial.data ? 'Voltar ao último dia fechado' : 'Ver parcial'}
          </button>
        </motion.div>
      )}
      {/* Dia em destaque */}
      <motion.section {...entrar(0)} className="u-card overflow-hidden p-6 sm:p-8" data-tour="dash-dia">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-[15px] font-medium text-[var(--color-fg-muted)]">
              {dataLonga(dia.data)}
              {ehParcial && <span className="rounded-full bg-[var(--color-warning-soft)] px-2 py-0.5 text-[12px] font-semibold text-[var(--color-warning)]">Parcial · {hora(dia.geradoEm)}</span>}
            </p>
            <div className="mt-2 flex items-end gap-3">
              <span className="text-[64px] font-semibold leading-none tracking-[-0.04em] sm:text-[80px]">
                <CountUp value={dia.resumo.taxa} frac={1} />
                <span className="ml-1 text-[36px] tracking-[-0.02em] text-[var(--color-fg-muted)] sm:text-[44px]">%</span>
              </span>
              {delta != null && (
                <span className={`mb-3 inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-[13px] font-semibold ${delta >= 0 ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' : 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'}`}>
                  {delta >= 0 ? <ArrowUpRight size={13} weight="bold" /> : <ArrowDownRight size={13} weight="bold" />}
                  {fmt1(Math.abs(delta))} pt
                </span>
              )}
            </div>
            <p className="mt-2 text-[15px] text-[var(--color-fg-muted)]">
              {dia.resumo.entregues != null && dia.resumo.nfsNaConta != null ? (
                <><span className="num font-semibold text-[var(--color-fg)]">{dia.resumo.entregues.toLocaleString('pt-BR')}</span> de <span className="num">{dia.resumo.nfsNaConta.toLocaleString('pt-BR')}</span> NFs confirmadas</>
              ) : 'Taxa de confirmação'}
              {dia.resumo.taxa != null && (
                <span className="ml-2 inline-flex items-center gap-1.5">
                  <span className={`size-2 rounded-full ${dia.resumo.taxa >= META ? 'bg-[var(--color-success)]' : 'bg-[var(--color-warning)]'}`} />
                  {dia.resumo.taxa >= META ? 'na meta' : `abaixo da meta de ${META}%`}
                </span>
              )}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            <MiniStat rotulo="Pendentes" valor={dia.resumo.pendentes} />
            <MiniStat rotulo="Sem rastreador" valor={dia.resumo.semRastreador} />
            <MiniStat rotulo="Cargas" valor={dia.resumo.cargas.length} />
            <MiniStat rotulo="KM rodados" valor={Math.round(kmDia(dia))} />
          </dl>
        </div>
      </motion.section>

      {/* Período */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <motion.div {...entrar(1)}><Stat rotulo="Taxa média" valor={media(taxas)} frac={1} sufixo="%" dica={`${diasNaMeta} de ${taxas.length} dias na meta`} /></motion.div>
        <motion.div {...entrar(2)}><Stat rotulo="KM no período" valor={Math.round(kmTotal)} sufixo=" km" dica={`${fmtKm(kmTotal / Math.max(1, janela.length))} por dia`} /></motion.div>
        <motion.div {...entrar(3)}><Stat rotulo="Operação média" texto={fmtMin(opMedia)} dica="Saída até a volta ao CD" /></motion.div>
        <motion.div {...entrar(4)}><Stat rotulo="Tempo por entrega" texto={fmtMin(porEntrega)} dica="Média das cargas" /></motion.div>
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 lg:grid-cols-5">
        <motion.section {...entrar(5)} className="u-card p-5 lg:col-span-3" data-tour="dash-grafico">
          <Titulo titulo="Taxa de confirmação" sub="Clique num dia para ver os detalhes" />
          <LinhaTaxa pontos={pontosTaxa} meta={META} selecionado={dia.data} aoSelecionar={setDiaSel} />
        </motion.section>
        <motion.section {...entrar(6)} className="u-card p-5 lg:col-span-2">
          <Titulo titulo="KM por dia" sub="Soma de todas as placas" />
          <Colunas pontos={pontosKm} selecionado={dia.data} aoSelecionar={setDiaSel} formatar={fmtKm} />
        </motion.section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <motion.section {...entrar(7)} className="u-card p-5">
          <Titulo titulo="Pendências por motivo" sub={dataLonga(dia.data)} />
          <Motivos motivos={dia.resumo.motivos} />
        </motion.section>
        <motion.section {...entrar(8)} className="u-card overflow-hidden lg:col-span-2" data-tour="dash-placas">
          <div className="p-5 pb-2"><Titulo titulo="Placas do dia" sub="Ordene clicando no cabeçalho" /></div>
          <TabelaPlacas cargas={dia.resumo.cargas} />
        </motion.section>
      </div>
    </div>
  )
}

function Titulo({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{titulo}</h2>
      {sub && <p className="text-[13px] text-[var(--color-fg-muted)]">{sub}</p>}
    </div>
  )
}

function MiniStat({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div>
      <dt className="text-[13px] text-[var(--color-fg-muted)]">{rotulo}</dt>
      <dd className="mt-0.5 text-[24px] font-semibold tracking-[-0.02em]"><CountUp value={valor} /></dd>
    </div>
  )
}

function Stat({ rotulo, valor, frac = 0, sufixo = '', texto, dica }: {
  rotulo: string; valor?: number | null; frac?: number; sufixo?: string; texto?: string; dica?: string
}) {
  return (
    <div className="u-card h-full p-5">
      <p className="text-[13px] font-medium text-[var(--color-fg-muted)]">{rotulo}</p>
      <p className="mt-2 whitespace-nowrap text-[24px] font-semibold leading-none tracking-[-0.025em] sm:text-[28px]">
        {texto ?? <><CountUp value={valor} frac={frac} />{valor != null && <span className="text-[15px] text-[var(--color-fg-muted)] sm:text-[18px]">{sufixo}</span>}</>}
      </p>
      {dica && <p className="mt-2 text-[13px] text-[var(--color-fg-muted)]">{dica}</p>}
    </div>
  )
}

const COR_MOTIVO: Record<string, string> = {
  'Sem confirmação': 'var(--color-fg-subtle)',
  'Coordenada imprecisa': 'var(--color-series-4)',
  'Cadastro divergente': 'var(--color-series-2)',
  'Não foi ao cliente': 'var(--color-danger)',
  'Parada próxima': 'var(--color-series-1)',
  'Passou sem registrar': 'var(--color-series-5)',
  'Ilha (sem estrada)': 'var(--color-series-3)',
  'Sem rastreador': 'var(--color-navy-400)',
  'Aguardando fim da rota': 'var(--color-warning)',
  'Não saiu da base': 'var(--color-fg-muted)',
  'Parada compartilhada (revisar)': 'var(--color-series-1)',
  'Parada de outro endereço': 'var(--color-series-5)',
}

function Motivos({ motivos }: { motivos: Record<string, number> }) {
  const itens = Object.entries(motivos).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...itens.map(i => i[1]))
  if (!itens.length) return <p className="py-6 text-center text-[15px] text-[var(--color-fg-muted)]">Nenhuma pendência. Dia limpo.</p>
  return (
    <ul className="flex flex-col gap-3">
      {itens.map(([m, n], i) => (
        <li key={m}>
          <div className="mb-1 flex items-baseline justify-between text-[14px]">
            <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: COR_MOTIVO[m] ?? 'var(--color-fg-subtle)' }} />{m}</span>
            <span className="num font-semibold">{n}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
            <motion.div
              className="h-full rounded-full"
              style={{ background: COR_MOTIVO[m] ?? 'var(--color-fg-subtle)' }}
              initial={{ width: 0 }}
              animate={{ width: `${(n / max) * 100}%` }}
              transition={{ ...SPRING_SUAVE, delay: 0.05 * i }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

type Coluna = 'placa' | 'nfs' | 'km' | 'saida' | 'operacao' | 'porEntrega'
type Ordem = { col: Coluna; desc: boolean }

function Cab({ col, children, dir, ordem, setOrdem }: {
  col: Coluna; children: React.ReactNode; dir?: boolean; ordem: Ordem; setOrdem: React.Dispatch<React.SetStateAction<Ordem>>
}) {
  return (
    <th className={`whitespace-nowrap px-3 py-2 font-medium ${dir ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => setOrdem(o => ({ col, desc: o.col === col ? !o.desc : col !== 'placa' && col !== 'saida' }))}
        className={`inline-flex items-center gap-1 u-motion hover:text-[var(--color-fg)] ${ordem.col === col ? 'text-[var(--color-fg)]' : ''}`}
      >
        {children}
        <CaretUpDown size={11} className={ordem.col === col ? 'opacity-100' : 'opacity-40'} />
      </button>
    </th>
  )
}

function TabelaPlacas({ cargas }: { cargas: CargaResumo[] }) {
  const [ordem, setOrdem] = useState<Ordem>({ col: 'nfs', desc: false })
  const linhas = useMemo(() => {
    const val = (c: CargaResumo): number | string => {
      switch (ordem.col) {
        case 'placa': return c.placa
        case 'nfs': return c.nfPlanejado ? (c.nfConfirmadas ?? 0) / c.nfPlanejado : 0
        case 'km': return c.km ?? -1
        case 'saida': return c.saida ?? ''
        case 'operacao': return c.tempoOperacaoMin ?? -1
        case 'porEntrega': return c.tempoMedioMin ?? -1
      }
    }
    return [...cargas].sort((a, b) => {
      const x = val(a), y = val(b)
      const r = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)
      return ordem.desc ? -r : r
    })
  }, [cargas, ordem])

  return (
    <div className="max-h-[440px] overflow-auto">
      <table className="w-full min-w-[640px] text-[14px]">
        <thead className="sticky top-0 z-[1] bg-[var(--color-bg-elevated)] text-[13px] text-[var(--color-fg-muted)]">
          <tr className="border-b border-[var(--color-border)]">
            <Cab col="placa" ordem={ordem} setOrdem={setOrdem}>Placa</Cab>
            <th className="hidden px-3 py-2 text-left font-medium 2xl:table-cell">Destino</th>
            <Cab col="nfs" ordem={ordem} setOrdem={setOrdem}>NFs</Cab>
            <Cab col="km" dir ordem={ordem} setOrdem={setOrdem}>KM</Cab>
            <Cab col="saida" dir ordem={ordem} setOrdem={setOrdem}>Saída · volta</Cab>
            <Cab col="operacao" dir ordem={ordem} setOrdem={setOrdem}>Operação</Cab>
            <Cab col="porEntrega" dir ordem={ordem} setOrdem={setOrdem}>Por entrega</Cab>
          </tr>
        </thead>
        <tbody>
          {linhas.map(c => {
            const pct = c.nfPlanejado ? Math.min(1, (c.nfConfirmadas ?? 0) / c.nfPlanejado) : 0
            return (
              <tr key={`${c.carga}-${c.placa}`} className="border-b border-[var(--color-border)] u-motion hover:bg-[var(--color-bg-subtle)]">
                <td className="whitespace-nowrap px-3 py-2.5">
                  <div className="font-semibold">{c.placa}</div>
                  <div className="max-w-[180px] truncate text-[12px] text-[var(--color-fg-muted)]">{c.destino || c.motorista || `Carga ${c.carga}`}</div>
                </td>
                <td className="hidden max-w-[160px] truncate px-3 py-2.5 text-[var(--color-fg-muted)] 2xl:table-cell">{c.destino}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="num w-12 shrink-0">{c.nfConfirmadas ?? '—'}/{c.nfPlanejado ?? '—'}</span>
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
                      <span className="block h-full rounded-full" style={{ width: `${pct * 100}%`, background: pct >= 0.95 ? 'var(--color-success)' : pct >= 0.8 ? 'var(--color-warning)' : 'var(--color-danger)' }} />
                    </span>
                  </div>
                </td>
                <td className="num px-3 py-2.5 text-right">{c.km != null ? fmt1(c.km) : '—'}</td>
                <td className="num whitespace-nowrap px-3 py-2.5 text-right text-[var(--color-fg-muted)]">{hhmm(c.saida) ?? '—'} · {hhmm(c.chegada) ?? '—'}</td>
                <td className="num px-3 py-2.5 text-right">{fmtMin(c.tempoOperacaoMin)}</td>
                <td className="num px-3 py-2.5 text-right">{fmtMin(c.tempoMedioMin)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
