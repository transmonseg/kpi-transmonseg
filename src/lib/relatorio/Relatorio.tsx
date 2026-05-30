import { Document, Page, View, Text } from '@react-pdf/renderer'
import type { Metricas, MetricasRede } from '@/lib/kpi/dashboard-metricas'
import type { Narrativa } from '@/lib/kpi/relatorio-narrativa'
import { REDE_LABEL } from '@/lib/kpi/redes'
import { C, S, fmtMin, fmtNum } from './tema'
import { ColumnPdf, BarPdf, LinePdf } from './charts-pdf'

// Largura útil de uma página A4 com as margens de S.page (595pt - 2*44).
const CONTENT_W = 595 - 44 * 2

export interface RelatorioCtx {
  m: Metricas
  ant: Metricas | null
  periodo: string
  intervalo: [string, string]
  redes: string[]
  narrativa: Narrativa
  mes: string
  geradoEm: string
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

/** "Maio de 2026" / "21/05/2026 a 27/05/2026" conforme o período. */
function periodoExtenso(periodo: string, intervalo: [string, string], mes: string): string {
  const [de, ate] = intervalo
  if (periodo === 'mes' || periodo === 'ano') {
    const [y, m] = (mes || de).split('-')
    if (periodo === 'ano') return `Ano de ${y}`
    const idx = Number(m) - 1
    return `${MESES[idx] ?? m} de ${y}`
  }
  const br = (d: string) => d.split('-').reverse().join('/')
  if (periodo === 'dia') return br(de)
  return `${br(de)} a ${br(ate)}`
}

function rotuloRedes(redes: string[]): string {
  if (!redes || redes.length === 0) return 'Todas as redes'
  return redes.map(r => REDE_LABEL[r] ?? r).join(', ')
}

// ── Delta vs período anterior (em pontos percentuais ou minutos) ─────────────
type Sentido = 'maior_melhor' | 'menor_melhor'

function statusDelta(delta: number | null, sentido: Sentido): string {
  if (delta == null || delta === 0) return C.muted
  const bom = sentido === 'maior_melhor' ? delta > 0 : delta < 0
  return bom ? C.ok : C.bad
}

function seta(delta: number | null): string {
  if (delta == null || delta === 0) return '='
  return delta > 0 ? '▲' : '▼'
}

// ── Rodapé fixo em todas as páginas ──────────────────────────────────────────
function Rodape({ geradoEm }: { geradoEm: string }) {
  return (
    <Text
      fixed
      style={{
        position: 'absolute',
        bottom: 28,
        left: 44,
        right: 44,
        fontSize: 7.5,
        color: C.muted,
        textAlign: 'center',
        borderTopWidth: 1,
        borderTopColor: C.border,
        paddingTop: 6,
      }}
      render={({ pageNumber, totalPages }) =>
        `Transmonseg · Relatório gerado em ${geradoEm} · página ${pageNumber} de ${totalPages}`
      }
    />
  )
}

// ── Card de KPI do scorecard ─────────────────────────────────────────────────
function KpiCard({
  rotulo,
  valor,
  delta,
  unidadeDelta,
  sentido,
}: {
  rotulo: string
  valor: string
  delta: number | null
  unidadeDelta: string
  sentido: Sentido
}) {
  const cor = statusDelta(delta, sentido)
  return (
    <View
      style={{
        width: '31.5%',
        marginRight: '2.75%',
        marginBottom: 10,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 8,
        padding: 10,
      }}
    >
      <Text style={[S.overline, { marginBottom: 4 }]}>{rotulo}</Text>
      <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.ink }}>{valor}</Text>
      <Text style={{ fontSize: 7.5, color: cor, marginTop: 3 }}>
        {delta == null
          ? 'sem comparação'
          : `${seta(delta)} ${Math.abs(delta)}${unidadeDelta} vs período anterior`}
      </Text>
    </View>
  )
}

// ── Tabela genérica (header + linhas), número à direita ──────────────────────
function Tabela({
  cols,
  rows,
}: {
  cols: { titulo: string; width: string; align?: 'left' | 'right' }[]
  rows: (string)[][]
}) {
  return (
    <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 6 }}>
      <View
        style={{ flexDirection: 'row', backgroundColor: C.bgSubtle, borderTopLeftRadius: 6, borderTopRightRadius: 6 }}
      >
        {cols.map((c, i) => (
          <Text
            key={i}
            style={{
              width: c.width,
              padding: 5,
              fontSize: 7.5,
              fontFamily: 'Helvetica-Bold',
              color: C.inkSoft,
              textAlign: c.align ?? 'left',
            }}
          >
            {c.titulo}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View
          key={ri}
          style={{
            flexDirection: 'row',
            borderTopWidth: 1,
            borderTopColor: C.border,
          }}
        >
          {r.map((cell, ci) => (
            <Text
              key={ci}
              style={{
                width: cols[ci].width,
                padding: 5,
                fontSize: 8,
                color: C.ink,
                textAlign: cols[ci].align ?? 'left',
              }}
            >
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

function TituloSecao({ over, titulo }: { over: string; titulo: string }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={S.overline}>{over}</Text>
      <Text style={[S.h2, { marginTop: 2, marginBottom: 0 }]}>{titulo}</Text>
    </View>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Documento
// ═════════════════════════════════════════════════════════════════════════════
export function Relatorio({ ctx }: { ctx: RelatorioCtx }) {
  const { m, ant, periodo, intervalo, redes, narrativa, mes, geradoEm } = ctx

  // deltas vs período anterior
  const dEntrega = ant ? m.pctEntregue - ant.pctEntregue : null
  const dGps = ant ? (100 - m.pctSemRastreador) - (100 - ant.pctSemRastreador) : null
  const dNaoFoi = ant ? m.nao_foi - ant.nao_foi : null
  const dTotal =
    ant && m.tempoMedioTotalMin != null && ant.tempoMedioTotalMin != null
      ? m.tempoMedioTotalMin - ant.tempoMedioTotalMin
      : null
  const dRota =
    ant && m.tempoMedioRotaMin != null && ant.tempoMedioRotaMin != null
      ? m.tempoMedioRotaMin - ant.tempoMedioRotaMin
      : null
  const dLoja =
    ant && m.tempoMedioLojaMin != null && ant.tempoMedioLojaMin != null
      ? m.tempoMedioLojaMin - ant.tempoMedioLojaMin
      : null

  const pExtenso = periodoExtenso(periodo, intervalo, mes)

  // ── Tendências: interpretações simples (por regras) ──
  const serie = m.serie
  const diaPico = serie.reduce<{ data: string; total: number } | null>(
    (acc, p) => (acc == null || p.total > acc.total ? { data: p.data, total: p.total } : acc),
    null,
  )
  const horaPico = m.distHorarioSaida.reduce<{ hora: number; entregas: number } | null>(
    (acc, h) => (acc == null || h.entregas > acc.entregas ? { hora: h.hora, entregas: h.entregas } : acc),
    null,
  )

  // dados dos gráficos
  const colEntregas = serie.map(p => ({ label: p.data.slice(8, 10), value: p.total }))
  const colHorario = m.distHorarioSaida.map(h => ({ label: String(h.hora), value: h.entregas }))
  const linhaLabels = m.serieTempos.map(p => p.data.slice(8, 10))
  const linhaSeries = [
    { name: 'Rota (CD-loja)', color: C.navy, values: m.serieTempos.map(p => p.tempo_rota) },
    { name: 'Em loja', color: C.warn, values: m.serieTempos.map(p => p.tempo_loja) },
    { name: 'Total', color: C.info, values: m.serieTempos.map(p => p.tempo_total) },
  ]

  // ── Exceções: lojas-problema cruzando sem GPS + não foi ──
  type LojaProb = { rede_id: string; loja: string; sem_rast: number; nao_foi: number }
  const probMap = new Map<string, LojaProb>()
  for (const r of m.topSemRastreador) {
    const k = `${r.rede_id}|${r.loja}`
    const cur = probMap.get(k) ?? { rede_id: r.rede_id, loja: r.loja, sem_rast: 0, nao_foi: 0 }
    cur.sem_rast += r.ocorrencias
    probMap.set(k, cur)
  }
  for (const r of m.topNaoFoi) {
    const k = `${r.rede_id}|${r.loja}`
    const cur = probMap.get(k) ?? { rede_id: r.rede_id, loja: r.loja, sem_rast: 0, nao_foi: 0 }
    cur.nao_foi += r.ocorrencias
    probMap.set(k, cur)
  }
  const lojasProblema = [...probMap.values()]
    .sort((a, b) => (b.sem_rast + b.nao_foi) - (a.sem_rast + a.nao_foi))
    .slice(0, 12)

  const rotasDemoradas = m.topRotasDemoradas
    .slice(0, 8)
    .map(l => ({ label: `${l.loja} · ${REDE_LABEL[l.rede_id] ?? l.rede_id}`, value: l.tempo_rota ?? 0 }))
  const tempoEmLoja = m.topTempoEmLoja
    .slice(0, 8)
    .map(l => ({ label: `${l.loja} · ${REDE_LABEL[l.rede_id] ?? l.rede_id}`, value: l.tempo_loja ?? 0 }))

  const redeRow = (r: MetricasRede): string[] => [
    REDE_LABEL[r.rede_id] ?? r.rede_id,
    fmtNum(r.entregue),
    `${r.pctEntregue}%`,
    fmtMin(r.tempoMedioMin),
  ]

  return (
    <Document>
      {/* ─────────────────── 1. CAPA ─────────────────── */}
      <Page size="A4" style={S.page}>
        <View
          style={{
            backgroundColor: C.navy,
            marginHorizontal: -44,
            marginTop: -44,
            paddingHorizontal: 44,
            paddingTop: 90,
            paddingBottom: 40,
          }}
        >
          <Text style={{ fontSize: 8, letterSpacing: 1.5, color: '#A9BBD6', fontFamily: 'Helvetica-Bold' }}>
            BENASSI · TRANSMONSEG
          </Text>
          <Text style={{ fontSize: 30, fontFamily: 'Helvetica-Bold', color: '#FFFFFF', marginTop: 14 }}>
            Relatório de Operação
          </Text>
          <Text style={{ fontSize: 14, color: C.navySoft, marginTop: 8 }}>{pExtenso}</Text>
        </View>

        <View style={{ marginTop: 36 }}>
          <View style={{ marginBottom: 16 }}>
            <Text style={S.overline}>Período</Text>
            <Text style={{ fontSize: 12, marginTop: 3 }}>{pExtenso}</Text>
          </View>
          <View style={{ marginBottom: 16 }}>
            <Text style={S.overline}>Redes incluídas</Text>
            <Text style={{ fontSize: 12, marginTop: 3 }}>{rotuloRedes(redes)}</Text>
          </View>
          <View style={{ marginBottom: 16 }}>
            <Text style={S.overline}>Total de entregas no período</Text>
            <Text style={{ fontSize: 12, marginTop: 3 }}>
              {m.total.toLocaleString('pt-BR')} programadas · {m.pctEntregue}% entregues
            </Text>
          </View>
        </View>

        <View style={{ position: 'absolute', bottom: 56, left: 44, right: 44 }}>
          <Text style={{ fontSize: 8, color: C.muted }}>Gerado em {geradoEm}</Text>
          <Text style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>
            Benassi · Transmonseg — Monitoramento de operação logística
          </Text>
        </View>
        <Rodape geradoEm={geradoEm} />
      </Page>

      {/* ─────────────────── 2. SUMÁRIO EXECUTIVO ─────────────────── */}
      <Page size="A4" style={S.page}>
        <TituloSecao over="Visão geral" titulo="Sumário executivo" />
        <View style={{ marginTop: 4 }}>
          {narrativa.sumario.map((b, i) => (
            <View key={i} style={{ flexDirection: 'row', marginBottom: 9 }}>
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: C.navy,
                  marginTop: 4,
                  marginRight: 8,
                }}
              />
              <Text style={{ flex: 1, fontSize: 10.5, lineHeight: 1.45, color: C.ink }}>{b}</Text>
            </View>
          ))}
        </View>
        <Rodape geradoEm={geradoEm} />
      </Page>

      {/* ─────────────────── 3. SCORECARD ─────────────────── */}
      <Page size="A4" style={S.page}>
        <TituloSecao over="Indicadores" titulo="Scorecard do período" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <KpiCard
            rotulo="Taxa de entrega"
            valor={`${m.pctEntregue}%`}
            delta={dEntrega}
            unidadeDelta=" p.p."
            sentido="maior_melhor"
          />
          <KpiCard
            rotulo="Não realizadas"
            valor={fmtNum(m.nao_foi)}
            delta={dNaoFoi}
            unidadeDelta=""
            sentido="menor_melhor"
          />
          <KpiCard
            rotulo="Cobertura GPS"
            valor={`${100 - m.pctSemRastreador}%`}
            delta={dGps}
            unidadeDelta=" p.p."
            sentido="maior_melhor"
          />
          <KpiCard
            rotulo="Tempo total (CD-loja)"
            valor={fmtMin(m.tempoMedioTotalMin)}
            delta={dTotal}
            unidadeDelta=" min"
            sentido="menor_melhor"
          />
          <KpiCard
            rotulo="Tempo de rota"
            valor={fmtMin(m.tempoMedioRotaMin)}
            delta={dRota}
            unidadeDelta=" min"
            sentido="menor_melhor"
          />
          <KpiCard
            rotulo="Tempo em loja"
            valor={fmtMin(m.tempoMedioLojaMin)}
            delta={dLoja}
            unidadeDelta=" min"
            sentido="menor_melhor"
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <Text style={[S.h2, { fontSize: 11 }]}>Desempenho por rede</Text>
          <Tabela
            cols={[
              { titulo: 'Rede', width: '40%' },
              { titulo: 'Entregas', width: '20%', align: 'right' },
              { titulo: '% entrega', width: '20%', align: 'right' },
              { titulo: 'Tempo médio', width: '20%', align: 'right' },
            ]}
            rows={m.porRede.slice(0, 18).map(redeRow)}
          />
        </View>
        <Rodape geradoEm={geradoEm} />
      </Page>

      {/* ─────────────────── 4. TENDÊNCIAS ─────────────────── */}
      <Page size="A4" style={S.page}>
        <TituloSecao over="Evolução" titulo="Tendências do período" />

        <View style={{ marginBottom: 16 }}>
          <Text style={[S.h2, { fontSize: 11 }]}>Entregas por dia</Text>
          {colEntregas.length > 0 ? (
            <ColumnPdf data={colEntregas} width={CONTENT_W} height={120} color={C.navy} />
          ) : (
            <Text style={S.muted}>Sem dados no período.</Text>
          )}
          {diaPico && (
            <Text style={{ fontSize: 8.5, color: C.muted, marginTop: 6 }}>
              Maior volume em {diaPico.data.split('-').reverse().join('/')} ({diaPico.total} entregas).
            </Text>
          )}
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={[S.h2, { fontSize: 11 }]}>Evolução dos tempos (min)</Text>
          {linhaLabels.length > 0 ? (
            <LinePdf labels={linhaLabels} series={linhaSeries} width={CONTENT_W} height={140} />
          ) : (
            <Text style={S.muted}>Sem dados de tempo no período.</Text>
          )}
        </View>

        <View>
          <Text style={[S.h2, { fontSize: 11 }]}>Horário de saída do CD</Text>
          <ColumnPdf data={colHorario} width={CONTENT_W} height={100} color={C.info} labelEvery={2} />
          {horaPico && horaPico.entregas > 0 && (
            <Text style={{ fontSize: 8.5, color: C.muted, marginTop: 6 }}>
              Pico de saídas às {horaPico.hora}h ({horaPico.entregas} entregas).
            </Text>
          )}
        </View>
        <Rodape geradoEm={geradoEm} />
      </Page>

      {/* ─────────────────── 5. EXCEÇÕES ─────────────────── */}
      <Page size="A4" style={S.page}>
        <TituloSecao over="Onde agir" titulo="Exceções do período" />

        <View style={{ marginBottom: 16 }}>
          <Text style={[S.h2, { fontSize: 11 }]}>Lojas com mais ocorrências</Text>
          {lojasProblema.length > 0 ? (
            <Tabela
              cols={[
                { titulo: 'Loja', width: '38%' },
                { titulo: 'Rede', width: '30%' },
                { titulo: 'Sem GPS', width: '16%', align: 'right' },
                { titulo: 'Não foi', width: '16%', align: 'right' },
              ]}
              rows={lojasProblema.map(l => [
                l.loja,
                REDE_LABEL[l.rede_id] ?? l.rede_id,
                String(l.sem_rast),
                String(l.nao_foi),
              ])}
            />
          ) : (
            <Text style={S.muted}>Nenhuma loja com ocorrências relevantes.</Text>
          )}
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={[S.h2, { fontSize: 11 }]}>Rotas mais demoradas (CD-loja)</Text>
          {rotasDemoradas.length > 0 ? (
            <BarPdf data={rotasDemoradas} width={CONTENT_W} color={C.bad} format={v => fmtMin(v)} />
          ) : (
            <Text style={S.muted}>Sem dados de rota no período.</Text>
          )}
        </View>

        <View>
          <Text style={[S.h2, { fontSize: 11 }]}>Maior tempo parado em loja</Text>
          {tempoEmLoja.length > 0 ? (
            <BarPdf data={tempoEmLoja} width={CONTENT_W} color={C.warn} format={v => fmtMin(v)} />
          ) : (
            <Text style={S.muted}>Sem dados de tempo em loja no período.</Text>
          )}
        </View>
        <Rodape geradoEm={geradoEm} />
      </Page>

      {/* ─────────────────── 6. RECOMENDAÇÕES ─────────────────── */}
      <Page size="A4" style={S.page}>
        <TituloSecao over="Plano de ação" titulo="Recomendações" />
        <View>
          {narrativa.recomendacoes.map((r, i) => (
            <View
              key={i}
              style={{
                borderWidth: 1,
                borderColor: C.border,
                borderLeftWidth: 3,
                borderLeftColor: C.navy,
                borderRadius: 6,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 4 }}>
                {i + 1}. {r.titulo}
              </Text>
              <Text style={{ fontSize: 9.5, lineHeight: 1.45, color: C.inkSoft }}>{r.corpo}</Text>
            </View>
          ))}
        </View>
        <Rodape geradoEm={geradoEm} />
      </Page>

      {/* ─────────────────── 7. APÊNDICE ─────────────────── */}
      <Page size="A4" style={S.page}>
        <TituloSecao over="Detalhamento" titulo="Apêndice" />

        <View style={{ marginBottom: 18 }}>
          <Text style={[S.h2, { fontSize: 11 }]}>Top motoristas</Text>
          {m.topMotoristas.length > 0 ? (
            <Tabela
              cols={[
                { titulo: 'Motorista', width: '40%' },
                { titulo: 'Entregas', width: '20%', align: 'right' },
                { titulo: 'Tempo rota', width: '20%', align: 'right' },
                { titulo: 'Tempo loja', width: '20%', align: 'right' },
              ]}
              rows={m.topMotoristas.slice(0, 15).map(mt => [
                mt.motorista,
                fmtNum(mt.entregas),
                fmtMin(mt.tempo_rota),
                fmtMin(mt.tempo_loja),
              ])}
            />
          ) : (
            <Text style={S.muted}>Sem dados de motoristas no período.</Text>
          )}
        </View>

        <View>
          <Text style={[S.h2, { fontSize: 11 }]}>Definições das métricas</Text>
          <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 12 }}>
            {[
              ['Taxa de entrega', 'Entregas realizadas ÷ entregas programadas no período.'],
              ['Cobertura GPS', 'Percentual de entregas com rastreador ativo (100% − sem rastreador).'],
              ['Tempo de rota', 'Da saída do CD até a chegada na loja.'],
              ['Tempo em loja', 'Da chegada na loja até a saída da loja.'],
              ['Tempo total', 'Da saída do CD até a saída da loja (rota + tempo em loja).'],
              ['Não realizadas', 'Entregas programadas que não foram concluídas no período.'],
            ].map(([t, d], i) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: i === 5 ? 0 : 5 }}>
                <Text style={{ width: 110, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.ink }}>
                  {t}
                </Text>
                <Text style={{ flex: 1, fontSize: 8.5, color: C.inkSoft }}>{d}</Text>
              </View>
            ))}
          </View>
        </View>
        <Rodape geradoEm={geradoEm} />
      </Page>
    </Document>
  )
}
