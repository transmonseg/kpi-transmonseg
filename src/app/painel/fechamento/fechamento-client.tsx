'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Truck,
  Storefront,
  UsersThree,
  Path,
  Timer,
  Gauge,
  WarningCircle,
  CaretDown,
} from '@phosphor-icons/react/dist/ssr'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { BarList, ColumnChart, LineChart, fmtMin, fmtNum, type BarItem } from './charts'
import type { FechamentoData } from '@/lib/kpi/fechamento-data'

type Metric = 'tempo_rota' | 'tempo_loja' | 'tempo_total'

function rotuloMes(mes: string): string {
  const [a, m] = mes.split('-')
  const nomes = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  return `${nomes[Number(m)]} ${a}`
}

export default function FechamentoClient({ d, meses, mesAtual }: { d: FechamentoData; meses: string[]; mesAtual: string }) {
  const k = d.kpis
  const [metric, setMetric] = useState<Metric>('tempo_rota')

  // ---- derivados ----
  const diaMaxIdx = d.por_dia.reduce((best, x, i, arr) => (x.entregas > arr[best].entregas ? i : best), 0)

  const horas = Array.from({ length: 24 }, (_, h) => d.distribuicao_horario_saida.find(x => x.hora_saida === h)?.entregas ?? 0)
  const totalHoras = horas.reduce((a, b) => a + b, 0)
  const peakHora = horas.indexOf(Math.max(...horas))
  const earlyShare = totalHoras ? Math.round((horas.slice(3, 7).reduce((a, b) => a + b, 0) / totalHoras) * 100) : 0

  const worstRota = d.top_rotas_demoradas[0]
  const pctRota = Math.round((worstRota.tempo_rota / k.tempo_rota_medio) * 100 - 100)
  const worstTotal = d.top_tempo_total[0]

  // ---- comparativo por cliente ----
  const labelMetric: Record<Metric, string> = { tempo_rota: 'Tempo de Rota', tempo_loja: 'Tempo em Loja', tempo_total: 'Tempo Total' }
  const clientesSorted = [...d.por_cliente].sort((a, b) => b[metric] - a[metric])
  const clienteItems: BarItem[] = clientesSorted.map(c => ({
    key: c.cliente,
    label: c.cliente,
    value: c[metric],
    sub: `${fmtNum(c.entregas)} entregas · ${c.lojas} lojas`,
    tone: 'accent',
  }))

  const kpis: { icon: PhosphorIcon; label: string; value: string; sub: string; tone?: 'danger' }[] = [
    { icon: Truck, label: 'Entregas no mês', value: fmtNum(k.total_entregas), sub: `${k.total_dias} dias operados` },
    { icon: Storefront, label: 'Redes atendidas', value: String(k.total_clientes), sub: `${fmtNum(k.total_lojas)} lojas no total` },
    { icon: UsersThree, label: 'Motoristas ativos', value: fmtNum(k.total_motoristas), sub: 'Entregadores únicos no mês' },
    { icon: Path, label: 'Tempo médio de rota', value: fmtMin(k.tempo_rota_medio), sub: 'CD → Loja' },
    { icon: Timer, label: 'Tempo médio em loja', value: fmtMin(k.tempo_loja_medio), sub: 'Aguardo + descarga' },
    { icon: Gauge, label: 'Tempo total médio', value: fmtMin(k.tempo_total_medio), sub: 'Saída CD → Saída Loja' },
    { icon: WarningCircle, label: 'Sem rastreador', value: fmtNum(k.sem_rastreador), sub: `${k.pct_sem_rastreador}% das entregas`, tone: 'danger' },
  ]

  const maxTotalTab = Math.max(...d.top_tempo_total.map(r => r.tempo_total), 1)
  const maxMotorista = Math.max(...d.top_motoristas.map(r => r.entregas), 1)

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      {/* Hero */}
      <header className="border-b border-[var(--color-border)] pb-7">
        <span className="text-overline">Benassi · Operação Logística</span>
        <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-fg)] md:text-[36px]">
          Fechamento Mensal
        </h1>
        <p className="mt-2 max-w-[64ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Consolidação dos indicadores operacionais de entregas de todas as redes atendidas — tempos de rota, permanência em
          loja e oportunidades de otimização.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <MesSelect meses={meses} mesAtual={mesAtual} />
          <Pill>{k.total_clientes} redes monitoradas</Pill>
          <Pill>{fmtNum(k.total_lojas)} lojas</Pill>
        </div>
      </header>

      {/* KPIs */}
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {kpis.map(x => (
          <div
            key={x.label}
            className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 shadow-soft transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--color-border-strong)]"
          >
            <div className="flex items-start justify-between">
              <span className="text-overline">{x.label}</span>
              <span
                className={
                  'flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] ' +
                  (x.tone === 'danger'
                    ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-fg)]'
                    : 'bg-[var(--color-accent-soft)] text-[var(--color-accent-soft-fg)]')
                }
              >
                <x.icon size={18} weight="bold" />
              </span>
            </div>
            <div className="mt-3 text-display text-numeric text-[30px] leading-none text-[var(--color-fg)]">{x.value}</div>
            <div className="mt-1.5 text-[12px] text-[var(--color-fg-subtle)]">{x.sub}</div>
          </div>
        ))}
      </div>

      {/* Performance ao longo do mês */}
      <Section title="Performance ao longo do mês" sub="Volume diário de entregas e evolução dos tempos médios.">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card title="Entregas por dia" desc="Volume diário consolidado de todas as redes">
            <ColumnChart
              items={d.por_dia.map(x => ({ label: String(x.dia).padStart(2, '0'), value: x.entregas }))}
              format={fmtNum}
              height={240}
              highlightIndex={diaMaxIdx}
              labelEvery={2}
            />
          </Card>
          <Card title="Evolução dos tempos médios" desc="Tempo de rota, em loja e total (minutos) por dia">
            <LineChart
              labels={d.por_dia.map(x => String(x.dia).padStart(2, '0'))}
              series={[
                { name: 'Tempo de Rota', color: 'var(--color-accent)', values: d.por_dia.map(x => x.tempo_rota), fill: true },
                { name: 'Tempo em Loja', color: 'var(--color-warning)', values: d.por_dia.map(x => x.tempo_loja), fill: true },
                { name: 'Tempo Total', color: 'var(--color-info)', values: d.por_dia.map(x => x.tempo_total), dashed: true },
              ]}
              format={fmtMin}
              height={240}
              labelEvery={3}
            />
          </Card>
        </div>
      </Section>

      {/* Comparativo por cliente + horário */}
      <Section title="Comparativo por cliente" sub="Benchmark dos tempos médios entre as redes atendidas.">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card
            title={`${labelMetric[metric]} médio por cliente`}
            desc="Quanto menor, melhor"
            action={
              <div className="flex gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-1">
                {(Object.keys(labelMetric) as Metric[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setMetric(m)}
                    className={
                      'cursor-pointer rounded-[calc(var(--radius-md)-3px)] px-2.5 py-1 text-[11.5px] font-medium transition-colors duration-150 ' +
                      (metric === m
                        ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
                        : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]')
                    }
                  >
                    {labelMetric[m]}
                  </button>
                ))}
              </div>
            }
          >
            <BarList items={clienteItems} format={fmtMin} />
          </Card>

          <Card title="Distribuição de horário de saída do CD" desc="Quando os caminhões deixam o centro de distribuição">
            <ColumnChart
              items={horas.map((v, h) => ({ label: String(h).padStart(2, '0'), value: v }))}
              format={fmtNum}
              height={240}
              highlightIndex={peakHora}
              labelEvery={2}
            />
            <Insight tone="info">
              <strong>Pico de saída às {String(peakHora).padStart(2, '0')}h.</strong> {earlyShare}% das entregas saem entre 03h
              e 07h — concentração na madrugada, janela ideal para evitar trânsito mas que exige escala bem dimensionada.
            </Insight>
          </Card>
        </div>
      </Section>

      {/* Rotas mais demoradas */}
      <Section title="Rotas mais demoradas" sub="Top 15 lojas com maior tempo médio de rota CD → Loja.">
        <Card>
          <BarList
            showRank
            format={fmtMin}
            maxValue={worstRota.tempo_rota}
            items={d.top_rotas_demoradas.map((r, i) => ({
              key: r.loja,
              label: r.loja,
              value: r.tempo_rota,
              sub: `${r.cliente} · ${fmtNum(r.n)} entregas`,
              tone: i < 3 ? 'danger' : 'warning',
            }))}
          />
          <Insight tone="warning">
            <strong>{worstRota.loja}</strong> ({worstRota.cliente}) lidera com {fmtMin(worstRota.tempo_rota)} de tempo médio de
            rota — {pctRota}% acima da média geral. Reavaliar janela de saída e roteirização pode reduzir o tempo total da
            operação.
          </Insight>
        </Card>
      </Section>

      {/* Tempo parado em cliente */}
      <Section title="Maior tempo parado em cliente" sub="Lojas onde os caminhões ficam mais tempo aguardando descarga.">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card title="Top tempo em loja" desc="Tempo médio entre chegada e saída da loja">
            <BarList
              showRank
              format={fmtMin}
              maxValue={d.top_tempo_loja[0].tempo_loja}
              items={d.top_tempo_loja.map((r, i) => ({
                key: r.loja,
                label: r.loja,
                value: r.tempo_loja,
                sub: r.cliente,
                tone: i < 3 ? 'danger' : 'warning',
              }))}
            />
          </Card>

          <Card title="Ranking detalhado" desc="Lojas com maior tempo total de operação">
            <div className="max-h-[440px] overflow-auto">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-[var(--color-bg-elevated)]">
                  <tr className="border-b border-[var(--color-border)] text-left text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-fg-subtle)]">
                    <th className="py-2.5 pr-2 font-semibold">#</th>
                    <th className="py-2.5 pr-2 font-semibold">Loja</th>
                    <th className="py-2.5 pr-2 font-semibold">Cliente</th>
                    <th className="py-2.5 pr-2 text-right font-semibold">Tempo total</th>
                  </tr>
                </thead>
                <tbody>
                  {d.top_tempo_total.map((r, i) => (
                    <tr key={r.loja} className="border-b border-[var(--color-border)]/60 transition-colors hover:bg-[var(--color-bg-subtle)]">
                      <td className="py-2.5 pr-2">
                        <span
                          className={
                            'inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[11px] font-semibold tabular-nums ' +
                            (i < 3 ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-fg)]' : 'bg-[var(--color-bg-subtle)] text-[var(--color-fg-subtle)]')
                          }
                        >
                          {i + 1}
                        </span>
                      </td>
                      <td className="py-2.5 pr-2 font-medium text-[var(--color-fg)]">{r.loja}</td>
                      <td className="py-2.5 pr-2">
                        <span className="rounded-md bg-[var(--color-bg-subtle)] px-1.5 py-0.5 text-[11px] text-[var(--color-fg-muted)]">{r.cliente}</span>
                      </td>
                      <td className="py-2.5 pr-0 text-right">
                        <span className="inline-flex items-center justify-end gap-2">
                          <span
                            className="hidden h-1.5 rounded-full bg-[var(--color-accent)] sm:inline-block"
                            style={{ width: `${(r.tempo_total / maxTotalTab) * 56}px` }}
                          />
                          <span className="font-semibold tabular-nums text-[var(--color-fg)]">{fmtMin(r.tempo_total)}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
        <Insight tone="danger">
          <strong>{worstTotal.loja}</strong> ({worstTotal.cliente}) acumula o maior tempo total de operação:{' '}
          {fmtMin(worstTotal.tempo_total)} em média por entrega. Ações: agendar janela específica de descarga, negociar
          prioridade com o cliente e validar a volumetria por viagem.
        </Insight>
      </Section>

      {/* Motoristas */}
      <Section title="Visão por motorista" sub="Top 15 motoristas por volume de entregas no período.">
        <Card>
          <div className="overflow-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-fg-subtle)]">
                  <th className="py-2.5 pr-2 font-semibold">#</th>
                  <th className="py-2.5 pr-2 font-semibold">Motorista</th>
                  <th className="py-2.5 pr-2 font-semibold">Entregas</th>
                  <th className="py-2.5 pr-2 text-right font-semibold">Tempo médio rota</th>
                  <th className="py-2.5 pr-0 text-right font-semibold">Tempo médio loja</th>
                </tr>
              </thead>
              <tbody>
                {d.top_motoristas.map((r, i) => (
                  <tr key={r.motorista} className="border-b border-[var(--color-border)]/60 transition-colors hover:bg-[var(--color-bg-subtle)]">
                    <td className="py-2.5 pr-2">
                      <span
                        className={
                          'inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[11px] font-semibold tabular-nums ' +
                          (i < 3 ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-soft-fg)]' : 'bg-[var(--color-bg-subtle)] text-[var(--color-fg-subtle)]')
                        }
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-2.5 pr-2 font-medium text-[var(--color-fg)]">{r.motorista}</td>
                    <td className="py-2.5 pr-2">
                      <span className="flex items-center gap-2">
                        <span className="hidden h-1.5 rounded-full bg-[var(--color-accent)] sm:inline-block" style={{ width: `${(r.entregas / maxMotorista) * 56}px` }} />
                        <span className="font-semibold tabular-nums text-[var(--color-fg)]">{fmtNum(r.entregas)}</span>
                      </span>
                    </td>
                    <td className="py-2.5 pr-2 text-right tabular-nums text-[var(--color-fg-muted)]">{fmtMin(r.tempo_rota)}</td>
                    <td className="py-2.5 pr-0 text-right tabular-nums text-[var(--color-fg-muted)]">{fmtMin(r.tempo_loja)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>

      {/* Recomendações */}
      <Section title="Recomendações de melhoria" sub="Insights acionáveis para o próximo ciclo operacional.">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <RecoCard tone="danger" title="Reduzir entregas sem rastreador">
            <strong>{fmtNum(k.sem_rastreador)} entregas ({k.pct_sem_rastreador}%)</strong> ocorreram sem rastreamento ativo.
            Priorizar instalação/manutenção dos equipamentos para garantir visibilidade total e SLA com os clientes.
          </RecoCard>
          <RecoCard tone="warning" title="Otimizar rotas críticas">
            As <strong>15 rotas mais demoradas</strong> têm tempo médio acima de {fmtMin(d.top_rotas_demoradas[14].tempo_rota)}.
            Revisar roteirização, consolidar cargas e testar horários alternativos de saída.
          </RecoCard>
          <RecoCard tone="info" title="Negociar janelas de descarga">
            Lojas com maior permanência (acima de {fmtMin(d.top_tempo_loja[14].tempo_loja)}) impactam o ciclo total. Um SLA de
            descarga formal com os top clientes pode liberar capacidade relevante na frota.
          </RecoCard>
        </div>
      </Section>

      <footer className="mt-16 border-t border-[var(--color-border)] pt-6 text-center text-[12px] text-[var(--color-fg-subtle)]">
        Benassi · Painel consolidado a partir dos KPIs operacionais de {k.total_clientes} redes · {rotuloMes(d.mes)}
      </footer>
    </div>
  )
}

// ---------- subcomponentes ----------

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1 text-[12px] text-[var(--color-fg-muted)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
      {children}
    </span>
  )
}

function MesSelect({ meses, mesAtual }: { meses: string[]; mesAtual: string }) {
  const router = useRouter()
  return (
    <span className="relative inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1 pl-3 pr-2 text-[12px] font-medium text-[var(--color-fg)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
      {rotuloMes(mesAtual)}
      {meses.length > 1 && (
        <>
          <CaretDown size={12} weight="bold" className="text-[var(--color-fg-subtle)]" />
          <select
            aria-label="Selecionar mês do fechamento"
            value={mesAtual}
            onChange={e => router.push(`/painel/fechamento?mes=${e.target.value}`)}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {meses.map(m => (
              <option key={m} value={m}>
                {rotuloMes(m)}
              </option>
            ))}
          </select>
        </>
      )}
    </span>
  )
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mt-12 animate-fade-up">
      <div className="mb-5">
        <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--color-fg)]">{title}</h2>
        {sub && <p className="mt-1 text-[13px] text-[var(--color-fg-muted)]">{sub}</p>}
      </div>
      {children}
    </section>
  )
}

function Card({
  title,
  desc,
  action,
  children,
}: {
  title?: string
  desc?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 shadow-soft sm:p-6">
      {(title || action) && (
        <div className="mb-1 flex items-start justify-between gap-3">
          {title && <h3 className="text-[15px] font-semibold text-[var(--color-fg)]">{title}</h3>}
          {action}
        </div>
      )}
      {desc && <p className="mb-5 text-[12px] text-[var(--color-fg-subtle)]">{desc}</p>}
      {children}
    </div>
  )
}

function Insight({ tone, children }: { tone: 'info' | 'warning' | 'danger'; children: React.ReactNode }) {
  const styles: Record<string, string> = {
    info: 'border-l-[var(--color-info)] bg-[var(--color-info-soft)] text-[var(--color-info-soft-fg)]',
    warning: 'border-l-[var(--color-warning)] bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-fg)]',
    danger: 'border-l-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-fg)]',
  }
  return <div className={'mt-4 rounded-[var(--radius-md)] border-l-[3px] px-4 py-3 text-[13px] leading-relaxed ' + styles[tone]}>{children}</div>
}

function RecoCard({ tone, title, children }: { tone: 'info' | 'warning' | 'danger'; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 shadow-soft">
      <h3 className="mb-2 text-[15px] font-semibold text-[var(--color-fg)]">{title}</h3>
      <Insight tone={tone}>{children}</Insight>
    </div>
  )
}
