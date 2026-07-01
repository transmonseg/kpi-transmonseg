import { Document, Page, View, Text } from '@react-pdf/renderer'
import type { Metricas, MetricasRede } from '@/lib/kpi/dashboard-metricas'
import type { Narrativa } from '@/lib/kpi/relatorio-narrativa'
import type { ResumoDiaApi } from '@/lib/kpi/dashboard-api-fonte'
import { REDE_LABEL } from '@/lib/kpi/redes'
import { C, S, fmtMin, fmtNum, ORDEM_STATUS, STATUS_LABEL, STATUS_COR } from './tema'
import { ColumnPdf, BarPdf, LinePdf, StackedBarPdf, StackedColumnPdf } from './charts-pdf'
import { conferiveis, foraConferencia, visibilidadeGps, seloTexto } from './derivados'

// Largura útil de uma página A4 com as margens de S.page (595pt - 2*44).
const CONTENT_W = 595 - 44 * 2

export interface RelatorioCtx {
  m: Metricas
  ant: Metricas | null
  periodo: string
  intervalo: [string, string]
  redes: string[]
  narrativa: Narrativa
  resumo: ResumoDiaApi | null
  mes: string
  geradoEm: string
}

/** Agrupa as paradas indevidas do resumo por placa / motorista / rede e por local. */
function agregaRisco(resumo: ResumoDiaApi | null) {
  const pts = resumo?.pontosRisco ?? []
  const top = resumo?.topIndevidas ?? []
  const grupo = <K extends string>(key: (p: typeof pts[number]) => K | undefined, fallback: K) => {
    const m = new Map<string, { chave: string; n: number; totalMin: number }>()
    for (const p of pts) {
      const k = key(p) ?? fallback
      const e = m.get(k) ?? { chave: k, n: 0, totalMin: 0 }
      e.n++; e.totalMin += p.duracaoMin; m.set(k, e)
    }
    return [...m.values()].sort((a, b) => b.n - a.n || b.totalMin - a.totalMin)
  }
  const porLocal = new Map<string, { chave: string; n: number; totalMin: number }>()
  for (const p of top) {
    const k = p.local || 'Fora de base'
    const e = porLocal.get(k) ?? { chave: k, n: 0, totalMin: 0 }
    e.n++; e.totalMin += p.duracaoMin; porLocal.set(k, e)
  }
  return {
    total: resumo?.paradasIndevidas ?? 0,
    placas: grupo(p => p.placa, '—'),
    motoristas: grupo(p => p.motorista, 'Sem motorista'),
    redes: grupo(p => p.rede, '—'),
    locais: [...porLocal.values()].sort((a, b) => b.n - a.n),
    maisLongas: [...top].sort((a, b) => b.duracaoMin - a.duracaoMin),
  }
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
  sub,
}: {
  rotulo: string
  valor: string
  delta: number | null
  unidadeDelta: string
  sentido: Sentido
  sub?: string
}) {
  const cor = statusDelta(delta, sentido)
  return (
    <View
      style={{
        width: '31.5%',
        marginBottom: 10,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 8,
        padding: 10,
      }}
    >
      <Text style={[S.overline, { marginBottom: 4 }]}>{rotulo}</Text>
      <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.ink }}>{valor}</Text>
      {sub ? <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 2 }}>{sub}</Text> : null}
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

// Cabeçalho de seção: título forte + régua navy. Sem eyebrow tracked repetido.
function TituloSecao({ titulo }: { titulo: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 15, fontFamily: 'Helvetica-Bold', color: C.ink }}>{titulo}</Text>
      <View style={{ height: 2, width: 36, backgroundColor: C.navy, marginTop: 5, borderRadius: 1 }} />
    </View>
  )
}

function H3({ children }: { children: string }) {
  return <Text style={[S.h2, { fontSize: 11 }]}>{children}</Text>
}

// ═════════════════════════════════════════════════════════════════════════════
// Documento
// ═════════════════════════════════════════════════════════════════════════════
export function Relatorio({ ctx }: { ctx: RelatorioCtx }) {
  const { m, ant, periodo, intervalo, redes, narrativa, resumo, mes, geradoEm } = ctx
  const risco = agregaRisco(resumo)

  // deltas vs período anterior
  const dEntrega = ant ? m.pctEntregue - ant.pctEntregue : null
  const dGps = ant ? visibilidadeGps(m) - visibilidadeGps(ant) : null
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

  // honestidade: conferíveis, fora da conferência, visibilidade, selo
  const conf = conferiveis(m)
  const fora = foraConferencia(m)
  const vis = visibilidadeGps(m)
  const selo = seloTexto()
  const mix = ORDEM_STATUS.map(k => ({ key: k, label: STATUS_LABEL[k], value: m[k] as number, color: STATUS_COR[k] }))

  // série diária empilhada por status (fecha com o total do dia via "outros")
  const serieStack = m.serie.map(p => {
    const outros = Math.max(p.total - p.entregue - p.nao_foi - p.sem_rastreador, 0)
    return {
      label: p.data.slice(8, 10),
      segments: [
        { value: p.entregue, color: STATUS_COR.entregue },
        { value: p.nao_foi, color: STATUS_COR.nao_foi },
        { value: p.sem_rastreador, color: STATUS_COR.sem_rastreador },
        { value: outros, color: STATUS_COR.indefinido },
      ],
    }
  })

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

  const colHorario = m.distHorarioSaida.map(h => ({ label: String(h.hora), value: h.entregas }))
  const linhaLabels = m.serieTempos.map(p => p.data.slice(8, 10))
  const linhaSeries = [
    { name: 'Rota (CD-loja)', color: C.navy, values: m.serieTempos.map(p => p.tempo_rota) },
    { name: 'Em loja', color: C.warn, values: m.serieTempos.map(p => p.tempo_loja) },
    { name: 'Total', color: C.info, values: m.serieTempos.map(p => p.tempo_total) },
  ]

  // ── Exceções: lojas-problema cruzando sem GPS + não foi + em análise ──
  type LojaProb = { rede_id: string; loja: string; sem_rast: number; nao_foi: number; em_analise: number }
  const probMap = new Map<string, LojaProb>()
  const acc = (r: { rede_id: string; loja: string }) => {
    const k = `${r.rede_id}|${r.loja}`
    let cur = probMap.get(k)
    if (!cur) { cur = { rede_id: r.rede_id, loja: r.loja, sem_rast: 0, nao_foi: 0, em_analise: 0 }; probMap.set(k, cur) }
    return cur
  }
  for (const r of m.topSemRastreador) acc(r).sem_rast += r.ocorrencias
  for (const r of m.topNaoFoi) acc(r).nao_foi += r.ocorrencias
  for (const r of m.topIndefinido) acc(r).em_analise += r.ocorrencias
  const lojasProblema = [...probMap.values()]
    .sort((a, b) => (b.sem_rast + b.nao_foi + b.em_analise) - (a.sem_rast + a.nao_foi + a.em_analise))
    .slice(0, 12)

  const rotasDemoradas = m.topRotasDemoradas
    .slice(0, 8)
    .map(l => ({ label: `${l.loja} · ${REDE_LABEL[l.rede_id] ?? l.rede_id}`, value: l.tempo_rota ?? 0 }))
  const tempoEmLoja = m.topTempoEmLoja
    .slice(0, 8)
    .map(l => ({ label: `${l.loja} · ${REDE_LABEL[l.rede_id] ?? l.rede_id}`, value: l.tempo_loja ?? 0 }))

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
            <Text style={S.overline}>Resultado do período</Text>
            <Text style={{ fontSize: 12, marginTop: 3 }}>
              {m.entregue.toLocaleString('pt-BR')} de {conf.toLocaleString('pt-BR')} entregas conferíveis concluídas ({m.pctEntregue}%) · visibilidade GPS {vis}%
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: selo.provisorio ? C.warn : C.ok, marginRight: 6 }} />
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: selo.provisorio ? C.warn : C.ok }}>{selo.texto}</Text>
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
        <TituloSecao titulo="Sumário executivo" />
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

      {/* ─────────────────── 3. PAINEL DE CONFIANÇA ─────────────────── */}
      <Page size="A4" style={S.page}>
        <TituloSecao titulo="Painel de confiança" />
        <View style={{ flexDirection: 'row', marginBottom: 16 }}>
          {[
            { rot: 'Entregas confirmadas', val: `${m.pctEntregue}%`, sub: `${fmtNum(m.entregue)} de ${fmtNum(conf)} conferíveis` },
            { rot: 'Visibilidade GPS', val: `${vis}%`, sub: 'da operação rastreada' },
            { rot: 'Fora da conferência', val: fmtNum(fora), sub: `${m.sem_rastreador} sem GPS · ${m.indefinido} em análise` },
          ].map((c, i) => (
            <View key={i} style={{ width: '31.5%', marginRight: i < 2 ? '2.75%' : 0, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 10 }}>
              <Text style={[S.overline, { marginBottom: 4 }]}>{c.rot}</Text>
              <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.navy }}>{c.val}</Text>
              <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 3 }}>{c.sub}</Text>
            </View>
          ))}
        </View>

        <H3>Mix de status do período</H3>
        <View style={{ marginBottom: 14 }}>
          <StackedBarPdf data={mix} width={CONTENT_W} />
        </View>

        <Tabela
          cols={[
            { titulo: 'Categoria', width: '55%' },
            { titulo: 'Linhas', width: '22%', align: 'right' },
            { titulo: '% do total', width: '23%', align: 'right' },
          ]}
          rows={mix.map(s => [s.label, fmtNum(s.value), m.total ? `${Math.round((100 * s.value) / m.total)}%` : '0%'])}
        />

        <View style={{ marginTop: 12, borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 10, backgroundColor: C.navySoft }}>
          <Text style={{ fontSize: 9, lineHeight: 1.45, color: C.inkSoft }}>
            Como lemos a taxa: contamos como entrega só o que foi confirmado e dividimos pelas linhas conferíveis (entregue mais não foi). Linhas sem rastreador ou em análise ficam fora da taxa, não inflam nem derrubam o número. O detalhe do cálculo está no apêndice.
          </Text>
        </View>
        <Rodape geradoEm={geradoEm} />
      </Page>

      {/* ─────────────────── 4. SCORECARD ─────────────────── */}
      <Page size="A4" style={S.page}>
        <TituloSecao titulo="Scorecard do período" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <KpiCard rotulo="Taxa de entrega" valor={`${m.pctEntregue}%`} sub={`${fmtNum(m.entregue)} de ${fmtNum(conf)} conferíveis`} delta={dEntrega} unidadeDelta=" p.p." sentido="maior_melhor" />
          <KpiCard rotulo="Não realizadas" valor={fmtNum(m.nao_foi)} delta={dNaoFoi} unidadeDelta="" sentido="menor_melhor" />
          <KpiCard rotulo="Visibilidade GPS" valor={`${vis}%`} delta={dGps} unidadeDelta=" p.p." sentido="maior_melhor" />
          <KpiCard rotulo="Em análise" valor={fmtNum(m.indefinido)} delta={null} unidadeDelta="" sentido="menor_melhor" />
          <KpiCard rotulo="Tempo total (CD-loja)" valor={fmtMin(m.tempoMedioTotalMin)} delta={dTotal} unidadeDelta=" min" sentido="menor_melhor" />
          <KpiCard rotulo="Tempo de rota" valor={fmtMin(m.tempoMedioRotaMin)} delta={dRota} unidadeDelta=" min" sentido="menor_melhor" />
          <KpiCard rotulo="Tempo em loja" valor={fmtMin(m.tempoMedioLojaMin)} delta={dLoja} unidadeDelta=" min" sentido="menor_melhor" />
        </View>

        <View style={{ marginTop: 12 }}>
          <H3>Desempenho por rede</H3>
          <Tabela
            cols={[
              { titulo: 'Rede', width: '34%' },
              { titulo: 'Entregas', width: '16%', align: 'right' },
              { titulo: '% entrega', width: '17%', align: 'right' },
              { titulo: 'Sem conf.', width: '16%', align: 'right' },
              { titulo: 'Tempo médio', width: '17%', align: 'right' },
            ]}
            rows={m.porRede.slice(0, 18).map((r: MetricasRede) => [
              REDE_LABEL[r.rede_id] ?? r.rede_id,
              fmtNum(r.entregue),
              `${r.pctEntregue}%`,
              fmtNum(r.total - r.entregue - r.nao_foi),
              fmtMin(r.tempoMedioMin),
            ])}
          />
        </View>
        <Rodape geradoEm={geradoEm} />
      </Page>

      {/* ─────────────────── 5. TENDÊNCIAS ─────────────────── */}
      <Page size="A4" style={S.page}>
        <TituloSecao titulo="Tendências do período" />

        <View style={{ marginBottom: 16 }}>
          <H3>Entregas por dia (por status)</H3>
          {serieStack.length > 0 ? (
            <StackedColumnPdf data={serieStack} width={CONTENT_W} height={120} />
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
          <H3>Evolução dos tempos (min)</H3>
          {linhaLabels.length > 0 ? (
            <LinePdf labels={linhaLabels} series={linhaSeries} width={CONTENT_W} height={140} />
          ) : (
            <Text style={S.muted}>Sem dados de tempo no período.</Text>
          )}
        </View>

        <View>
          <H3>Horário de saída do CD</H3>
          <ColumnPdf data={colHorario} width={CONTENT_W} height={100} color={C.info} labelEvery={2} />
          {horaPico && horaPico.entregas > 0 && (
            <Text style={{ fontSize: 8.5, color: C.muted, marginTop: 6 }}>
              Pico de saídas às {horaPico.hora}h ({horaPico.entregas} entregas).
            </Text>
          )}
        </View>
        <Rodape geradoEm={geradoEm} />
      </Page>

      {/* ─────────────────── 6. EXCEÇÕES ─────────────────── */}
      <Page size="A4" style={S.page}>
        <TituloSecao titulo="Exceções do período" />

        <View style={{ marginBottom: 16 }}>
          <H3>Lojas com mais ocorrências</H3>
          {lojasProblema.length > 0 ? (
            <Tabela
              cols={[
                { titulo: 'Loja', width: '34%' },
                { titulo: 'Rede', width: '26%' },
                { titulo: 'Sem GPS', width: '13%', align: 'right' },
                { titulo: 'Não foi', width: '13%', align: 'right' },
                { titulo: 'Em análise', width: '14%', align: 'right' },
              ]}
              rows={lojasProblema.map(l => [
                l.loja,
                REDE_LABEL[l.rede_id] ?? l.rede_id,
                String(l.sem_rast),
                String(l.nao_foi),
                String(l.em_analise),
              ])}
            />
          ) : (
            <Text style={S.muted}>Nenhuma loja com ocorrências relevantes.</Text>
          )}
        </View>

        <View style={{ marginBottom: 16 }}>
          <H3>Rotas mais demoradas (CD-loja)</H3>
          {rotasDemoradas.length > 0 ? (
            <BarPdf data={rotasDemoradas} width={CONTENT_W} color={C.bad} format={v => fmtMin(v)} />
          ) : (
            <Text style={S.muted}>Sem dados de rota no período.</Text>
          )}
        </View>

        <View>
          <H3>Maior tempo parado em loja</H3>
          {tempoEmLoja.length > 0 ? (
            <BarPdf data={tempoEmLoja} width={CONTENT_W} color={C.warn} format={v => fmtMin(v)} />
          ) : (
            <Text style={S.muted}>Sem dados de tempo em loja no período.</Text>
          )}
        </View>
        <Rodape geradoEm={geradoEm} />
      </Page>

      {/* ─────────────────── 7. RECOMENDAÇÕES ─────────────────── */}
      <Page size="A4" style={S.page}>
        <TituloSecao titulo="Recomendações" />
        <View>
          {narrativa.recomendacoes.map((r, i) => (
            <View
              key={i}
              style={{
                borderWidth: 1,
                borderColor: C.border,
                borderRadius: 6,
                padding: 12,
                marginBottom: 10,
                backgroundColor: C.bgSubtle,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
                  <Text style={{ fontSize: 8, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' }}>{i + 1}</Text>
                </View>
                <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.navy }}>{r.titulo}</Text>
              </View>
              <Text style={{ fontSize: 9.5, lineHeight: 1.45, color: C.inkSoft }}>{r.corpo}</Text>
            </View>
          ))}
        </View>
        <Rodape geradoEm={geradoEm} />
      </Page>

      {/* ─────────────────── 8. APÊNDICE ─────────────────── */}
      {/* ═══ Segurança da carga (paradas indevidas) ═══ */}
      <Page size="A4" style={S.page}>
        <TituloSecao titulo="Segurança da carga" />
        <Text style={[S.muted, { marginBottom: 14 }]}>
          Paradas fora de loja e da base por 10 minutos ou mais — o evento de risco da carga no período.
        </Text>

        {risco.total === 0 ? (
          <Text style={S.muted}>
            Sem rastreamento gerado para este período (ou nenhuma parada indevida registrada). Gere o KPI pelo Unitrac para alimentar esta seção.
          </Text>
        ) : (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={{ width: '48%', borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 12 }}>
                <Text style={[S.overline, { marginBottom: 4 }]}>Paradas indevidas</Text>
                <Text style={{ fontSize: 24, fontFamily: 'Helvetica-Bold', color: C.bad }}>{fmtNum(risco.total)}</Text>
                <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 2 }}>eventos de risco no período</Text>
              </View>
              <View style={{ width: '48%', borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 12 }}>
                <Text style={[S.overline, { marginBottom: 4 }]}>Pior caso</Text>
                {risco.maisLongas[0] ? (
                  <View>
                    <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.ink }}>{risco.maisLongas[0].placa}</Text>
                    <Text style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>{fmtMin(risco.maisLongas[0].duracaoMin)} parado · às {risco.maisLongas[0].hora}</Text>
                  </View>
                ) : <Text style={S.muted}>—</Text>}
              </View>
            </View>

            <View style={{ marginBottom: 16 }}>
              <H3>Placas que mais param</H3>
              <Tabela
                cols={[{ titulo: 'Placa', width: '50%' }, { titulo: 'Paradas', width: '25%', align: 'right' }, { titulo: 'Tempo total parado', width: '25%', align: 'right' }]}
                rows={risco.placas.slice(0, 12).map(p => [p.chave, String(p.n), fmtMin(p.totalMin)])}
              />
            </View>

            <View style={{ marginBottom: 16 }}>
              <H3>Motoristas com mais paradas indevidas</H3>
              <Tabela
                cols={[{ titulo: 'Motorista', width: '56%' }, { titulo: 'Paradas', width: '22%', align: 'right' }, { titulo: 'Tempo total', width: '22%', align: 'right' }]}
                rows={risco.motoristas.slice(0, 12).map(p => [p.chave, String(p.n), fmtMin(p.totalMin)])}
              />
            </View>

            {risco.redes.some(r => r.chave !== '—') ? (
              <View>
                <H3>Por rede</H3>
                <Tabela
                  cols={[{ titulo: 'Rede', width: '60%' }, { titulo: 'Paradas', width: '20%', align: 'right' }, { titulo: 'Tempo total', width: '20%', align: 'right' }]}
                  rows={risco.redes.map(p => [p.chave === '—' ? 'Sem rede' : (REDE_LABEL[p.chave] ?? p.chave), String(p.n), fmtMin(p.totalMin)])}
                />
              </View>
            ) : null}
          </View>
        )}
        <Rodape geradoEm={geradoEm} />
      </Page>

      <Page size="A4" style={S.page}>
        <TituloSecao titulo="Apêndice" />

        <View style={{ marginBottom: 18 }}>
          <H3>Top motoristas</H3>
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

        <View style={{ marginBottom: 18 }}>
          <H3>Definições das métricas</H3>
          <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 12 }}>
            {[
              ['Taxa de entrega', 'Entregas confirmadas ÷ conferíveis (entregue + não foi). Linhas sem confirmação ficam fora.'],
              ['Conferíveis', 'Linhas com desfecho definido: entregue ou não foi ao cliente.'],
              ['Visibilidade GPS', 'Percentual da operação com rastreador ativo no período.'],
              ['Fora da conferência', 'Linhas sem desfecho confirmável: em rota, sem rastreador, em análise, desatualizado ou mudou de rota.'],
              ['Tempo de rota', 'Da saída do CD até a chegada na loja.'],
              ['Tempo em loja', 'Da chegada na loja até a saída da loja.'],
              ['Não realizadas', 'Entregas programadas com confirmação de que não foram concluídas.'],
            ].map(([t, d], i, arr) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: i === arr.length - 1 ? 0 : 5 }}>
                <Text style={{ width: 110, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.ink }}>{t}</Text>
                <Text style={{ flex: 1, fontSize: 8.5, color: C.inkSoft }}>{d}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ marginBottom: 18 }}>
          <H3>Como a taxa foi calculada</H3>
          <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 12 }}>
            {[
              ['Entregas confirmadas (numerador)', fmtNum(m.entregue)],
              ['Não realizadas', fmtNum(m.nao_foi)],
              ['Conferíveis (denominador)', `${fmtNum(conf)}  =  ${fmtNum(m.entregue)} + ${fmtNum(m.nao_foi)}`],
              ['Taxa de entrega', `${m.pctEntregue}%  =  ${fmtNum(m.entregue)} / ${fmtNum(conf)}`],
              ['Total de linhas no período', fmtNum(m.total)],
              ['Fora da conferência', `${fmtNum(fora)}  (${m.sem_rastreador} sem GPS · ${m.indefinido} sem dado)`],
            ].map(([t, d], i, arr) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: i === arr.length - 1 ? 0 : 5 }}>
                <Text style={{ width: 180, fontSize: 8.5, color: C.inkSoft }}>{t}</Text>
                <Text style={{ flex: 1, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.ink }}>{d}</Text>
              </View>
            ))}
          </View>
        </View>

        <View>
          <H3>Glossário das categorias</H3>
          <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 12 }}>
            {[
              ['Entregue', 'Entrega confirmada na loja esperada.'],
              ['Em rota', 'Veículo ainda em operação no fechamento (período provisório).'],
              ['Não foi', 'Confirmado que o veículo não chegou ao cliente.'],
              ['Mudou de rota', 'Entregou, mas em destino diferente do programado.'],
              ['Desatualizado', 'Rastreador existe mas parou de comunicar.'],
              ['Sem rastreador', 'Placa sem GPS ou sem cadastro no Unitrac.'],
              ['Em análise', 'Sem legenda nem horário no relatório de origem: aguarda classificação.'],
            ].map(([t, d], i, arr) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: i === arr.length - 1 ? 0 : 5 }}>
                <Text style={{ width: 90, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.ink }}>{t}</Text>
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
