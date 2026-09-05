// Diagnostico de PENDENTE do KPI Nutry Max: despeja, pra cada entrega do
// romaneio, placa/nf/lat/lng/status num CSV. O cruzamento com o GPS bruto
// (posicoes_historico do monitoramento) e' feito em SQL depois -- a pergunta
// que separa "geocodificacao errada" de "parada nao detectada" e': o caminhao
// chegou a passar perto desse ponto no dia?
//
// Uso (no VPS):
//   npx tsx --env-file=.env.production scripts/diagnostico-pendentes-nutrimax.ts \
//     <escala.pdf> <romaneio.pdf> <data:YYYY-MM-DD> <saida.csv>
import { readFileSync, writeFileSync } from 'fs'
import { parseEscala } from '../src/lib/kpi-romaneio/parse-escala'
import { parseRomaneio } from '../src/lib/kpi-romaneio/parse-romaneio'
import { geocodificarEnderecos } from '../src/lib/kpi-romaneio/geocode'
import { buscarFrota, normPlaca } from '../src/lib/unitrac-api'
import { buscarAlvosDoDia, buscarParadasDoDia } from '../src/lib/kpi-romaneio/unitrac'
import { buscarHorariosBase } from '../src/lib/kpi-romaneio/base-horarios'
import { alvosDaData } from '../src/lib/kpi-romaneio/alvos-data'
import { montarVisitas } from '../src/lib/kpi-romaneio/visitas'
import { agregarPorCarga, montarDetalheEntregas } from '../src/lib/kpi-romaneio/agregacao'
import { calcularKmPercorrido } from '../src/lib/kpi-romaneio/km'
import { COD_USER_NUTRIMAX } from '../src/lib/kpi-romaneio/constants'
import type { LinhaGeocodificada, LinhaKpiRomaneio, LinhaDetalheEntrega, Visita } from '../src/lib/kpi-romaneio/types'
import type { UnitracParadaRow } from '../src/lib/kpi/matcher'

function agrupar<T>(itens: T[], chave: (item: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const i of itens) {
    const k = chave(i)
    const a = m.get(k)
    if (a) a.push(i)
    else m.set(k, [i])
  }
  return m
}

async function main() {
  const [escalaPath, romaneioPath, data, saidaPath] = process.argv.slice(2)
  if (!escalaPath || !romaneioPath || !data || !saidaPath) {
    console.error('Uso: ... <escala.pdf> <romaneio.pdf> <data> <saida.csv>')
    process.exit(1)
  }
  const [escala, romaneio] = await Promise.all([
    parseEscala(Buffer.from(readFileSync(escalaPath))),
    parseRomaneio(Buffer.from(readFileSync(romaneioPath))),
  ])
  const enderecosUnicos = [...new Set(romaneio.map(l => l.endereco))]
  const resultadosGeo = await geocodificarEnderecos(enderecosUnicos)
  const geoPorEndereco = new Map(enderecosUnicos.map((e, i) => [e, resultadosGeo[i]]))
  const romaneioGeo: LinhaGeocodificada[] = romaneio.map(l => {
    const g = geoPorEndereco.get(l.endereco) ?? null
    return { ...l, lat: g?.lat ?? null, lng: g?.lng ?? null }
  })
  const linhasPorPlaca = agrupar(romaneioGeo, l => normPlaca(l.placa))
  const placasNorm = [...linhasPorPlaca.keys()]
  const pontosPorPlacaBridge = new Map<string, { id: string; lat: number; lng: number }[]>()
  for (const [placaNorm, linhas] of linhasPorPlaca) {
    const pontos = linhas
      .filter((l): l is LinhaGeocodificada & { lat: number; lng: number } => l.lat != null && l.lng != null)
      .map(l => ({ id: l.nf, lat: l.lat, lng: l.lng }))
    if (pontos.length > 0) pontosPorPlacaBridge.set(placaNorm, pontos)
  }
  const [frota, alvosBrutos, horarioBasePorPlaca] = await Promise.all([
    buscarFrota(COD_USER_NUTRIMAX),
    buscarAlvosDoDia(placasNorm),
    buscarHorariosBase(placasNorm, data, pontosPorPlacaBridge),
  ])
  const alvos = alvosDaData(alvosBrutos, data)
  const cvPorPlaca = new Map(frota.map(v => [v.placaNorm, v.cv]))
  const temRastreadorPorPlaca = new Map(placasNorm.map(p => [p, cvPorPlaca.has(p) || horarioBasePorPlaca.has(p)]))
  const paradasPorPlaca = new Map<string, UnitracParadaRow[]>()
  const visitasPorPlaca = new Map<string, Map<string, Visita>>()
  const kmPorPlaca = new Map<string, number | null>()
  await Promise.all(placasNorm.map(async placaNorm => {
    const cv = cvPorPlaca.get(placaNorm)
    const paradas = cv ? await buscarParadasDoDia(cv, placaNorm, data, 48) : []
    paradasPorPlaca.set(placaNorm, paradas)
    visitasPorPlaca.set(placaNorm, montarVisitas(linhasPorPlaca.get(placaNorm) ?? [], paradas, horarioBasePorPlaca.get(placaNorm)?.visitasPorNf))
    kmPorPlaca.set(placaNorm, calcularKmPercorrido(paradas))
  }))
  const alvosPorPlaca = agrupar(alvos, a => a.placaNorm)
  const escalaPorChave = new Map(escala.map(e => [`${e.carga}::${e.placaNorm}`, e]))
  const cargasPorChave = agrupar(romaneioGeo, l => `${l.carga}::${normPlaca(l.placa)}`)
  const linhasKpi: LinhaKpiRomaneio[] = [...cargasPorChave.entries()].map(([chave, linhasDaCarga]) => {
    const [carga, placaNorm] = chave.split('::')
    return agregarPorCarga(carga, placaNorm, linhasDaCarga, escalaPorChave.get(chave) ?? null,
      alvosPorPlaca.get(placaNorm) ?? [], visitasPorPlaca.get(placaNorm) ?? new Map(),
      paradasPorPlaca.get(placaNorm) ?? [], kmPorPlaca.get(placaNorm) ?? null,
      horarioBasePorPlaca.get(placaNorm), temRastreadorPorPlaca.get(placaNorm) ?? false)
  })
  const resumoPorChave = new Map(linhasKpi.map(l => [`${l.carga}::${l.placa}`, l]))
  const detalhe: LinhaDetalheEntrega[] = [...cargasPorChave.entries()].flatMap(([chave, linhasDaCarga]) => {
    const [carga, placaNorm] = chave.split('::')
    const r = resumoPorChave.get(chave)
    return montarDetalheEntregas(carga, placaNorm, linhasDaCarga, alvosPorPlaca.get(placaNorm) ?? [],
      visitasPorPlaca.get(placaNorm) ?? new Map(),
      { motorista: r?.motorista ?? '', saidaCd: r?.saidaCd ?? null, chegadaCd: r?.chegadaCd ?? null, tempoOperacaoMin: r?.tempoOperacaoMin ?? null },
      temRastreadorPorPlaca.get(placaNorm) ?? false, paradasPorPlaca, r?.kmPercorrido ?? null)
  })

  const coordPorNf = new Map(romaneioGeo.map(l => [l.nf, l]))
  const bridgePorPlacaNf = new Map<string, string>()
  for (const [placa, h] of horarioBasePorPlaca) {
    for (const [nf, v] of h.visitasPorNf ?? new Map()) {
      bridgePorPlacaNf.set(`${placa}::${nf}`, v.chegada ? (v.viaVizinhanca ? 'vizinhanca' : 'sim') : 'nao')
    }
  }
  const linhasCsv = ['placa,nf,status,lat,lng,tem_coord,ponte,obs,endereco']
  for (const d of detalhe) {
    const l = coordPorNf.get(d.nf)
    const ponte = bridgePorPlacaNf.get(`${normPlaca(d.placa)}::${d.nf}`) ?? 'ausente'
    linhasCsv.push([normPlaca(d.placa), d.nf, d.status, l?.lat ?? '', l?.lng ?? '', l?.lat != null ? '1' : '0', ponte,
      (d.observacao ?? '').replace(/,/g, ';'), (l?.endereco ?? '').replace(/,/g, ';')].join(','))
  }
  writeFileSync(saidaPath, linhasCsv.join('\n'))
  console.log(`${detalhe.length} linhas -> ${saidaPath}`)
  const semCoord = detalhe.filter(d => d.status === 'pendente' && coordPorNf.get(d.nf)?.lat == null).length
  console.log(`pendentes: ${detalhe.filter(d => d.status === 'pendente').length} (sem coordenada: ${semCoord})`)
}

main().catch(e => { console.error(e); process.exit(1) })
