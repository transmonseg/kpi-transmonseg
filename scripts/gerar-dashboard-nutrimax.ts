// Dashboard de performance/ranking de motoristas da Nutry Max (pedido do
// usuario 06/09) -- roda o MESMO pipeline de gerar-nutrimax-real-arquivo.ts
// (Escala+Romaneio reais, sem HTTP/auth) pra CADA dia do periodo, e junta
// tudo no dashboard (ver dashboard.ts pra logica, gerador-dashboard-xlsx.ts
// pro xlsx).
//
// Uso: npx tsx --env-file=.env.production scripts/gerar-dashboard-nutrimax.ts \
//   <saida.xlsx> <escala1.pdf> <romaneio1.pdf> <data1:YYYY-MM-DD> [<escala2.pdf> <romaneio2.pdf> <data2> ...]
import { readFileSync, writeFileSync } from 'fs'
import { parseEscala } from '../src/lib/kpi-romaneio/parse-escala'
import { parseRomaneio } from '../src/lib/kpi-romaneio/parse-romaneio'
import { geocodificarEnderecos } from '../src/lib/kpi-romaneio/geocode'
import { buscarFrota, normPlaca } from '../src/lib/unitrac-api'
import { buscarAlvosDoDia, buscarParadasDoDia } from '../src/lib/kpi-romaneio/unitrac'
import { buscarHorariosBase } from '../src/lib/kpi-romaneio/base-horarios'
import { alvosDaData } from '../src/lib/kpi-romaneio/alvos-data'
import { montarVisitas } from '../src/lib/kpi-romaneio/visitas'
import { agregarPorCarga } from '../src/lib/kpi-romaneio/agregacao'
import { calcularKmPercorrido } from '../src/lib/kpi-romaneio/km'
import { COD_USER_NUTRIMAX } from '../src/lib/kpi-romaneio/constants'
import { montarLinhaDashboardDiaria, atribuirRankEPerformance, agregarEquipeSemanal, montarResumoPeriodo, type LinhaDashboardComRank } from '../src/lib/kpi-romaneio/dashboard'
import { gerarDashboardNutrimaxXlsx } from '../src/lib/kpi-romaneio/gerador-dashboard-xlsx'
import type { LinhaGeocodificada, LinhaKpiRomaneio, Visita } from '../src/lib/kpi-romaneio/types'
import type { UnitracParadaRow } from '../src/lib/kpi/matcher'

function agrupar<T>(itens: T[], chave: (item: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>()
  for (const item of itens) {
    const k = chave(item)
    const arr = mapa.get(k)
    if (arr) arr.push(item)
    else mapa.set(k, [item])
  }
  return mapa
}

// Mesma pipeline de scripts/gerar-nutrimax-real-arquivo.ts, so' devolvendo
// linhasKpi em vez de escrever xlsx -- ver aquele arquivo pra comentarios
// de cada passo.
async function gerarLinhasKpiDoDia(escalaPath: string, romaneioPath: string, data: string): Promise<LinhaKpiRomaneio[]> {
  const escalaBuf = Buffer.from(readFileSync(escalaPath))
  const romaneioBuf = Buffer.from(readFileSync(romaneioPath))
  const escala = await parseEscala(escalaBuf)
  const romaneio = await parseRomaneio(romaneioBuf)
  console.log(`  Escala: ${escala.length} linhas, Romaneio: ${romaneio.length} linhas`)

  const enderecosUnicos = [...new Set(romaneio.map(l => l.endereco))]
  const resultadosGeo = await geocodificarEnderecos(enderecosUnicos)
  const geoPorEndereco = new Map(enderecosUnicos.map((e, i) => [e, resultadosGeo[i]]))
  const romaneioGeo: LinhaGeocodificada[] = romaneio.map(l => {
    const g = geoPorEndereco.get(l.endereco) ?? null
    return { ...l, lat: g?.lat ?? null, lng: g?.lng ?? null }
  })
  console.log(`  Geocodificados: ${romaneioGeo.filter(l => l.lat != null).length}/${romaneioGeo.length}`)

  const linhasPorPlaca = agrupar(romaneioGeo, l => normPlaca(l.placa))
  const placasNorm = [...linhasPorPlaca.keys()]

  const pontosPorPlacaBridge = new Map<string, { id: string; lat: number; lng: number }[]>()
  for (const [placaNorm, linhasDaPlaca] of linhasPorPlaca) {
    const pontos = linhasDaPlaca
      .filter((l): l is LinhaGeocodificada & { lat: number; lng: number } => l.lat != null && l.lng != null)
      .map(l => ({ id: l.nf, lat: l.lat, lng: l.lng }))
    if (pontos.length > 0) pontosPorPlacaBridge.set(placaNorm, pontos)
  }
  const horarioBasePorPlaca = await buscarHorariosBase(placasNorm, data, pontosPorPlacaBridge)

  const frota = await buscarFrota(COD_USER_NUTRIMAX)
  const cvPorPlaca = new Map(frota.map(v => [v.placaNorm, v.cv]))
  const temRastreadorPorPlaca = new Map(placasNorm.map(p => [p, cvPorPlaca.has(p) || horarioBasePorPlaca.has(p)]))
  let alvosBrutos: Awaited<ReturnType<typeof buscarAlvosDoDia>> = []
  try {
    alvosBrutos = await buscarAlvosDoDia(placasNorm)
  } catch (e) {
    console.log('  buscarAlvosDoDia falhou:', e instanceof Error ? e.message : e)
  }
  const alvos = alvosDaData(alvosBrutos, data)

  const paradasPorPlaca = new Map<string, UnitracParadaRow[]>()
  const visitasPorPlaca = new Map<string, Map<string, Visita>>()
  const kmPorPlaca = new Map<string, number | null>()

  for (const placaNorm of placasNorm) {
    const cv = cvPorPlaca.get(placaNorm)
    let paradas: UnitracParadaRow[] = []
    if (cv) {
      try {
        paradas = await buscarParadasDoDia(cv, placaNorm, data, 48)
      } catch (e) {
        console.log(`  buscarParadasDoDia(${placaNorm}) falhou:`, e instanceof Error ? e.message : e)
      }
    }
    paradasPorPlaca.set(placaNorm, paradas)
    visitasPorPlaca.set(placaNorm, montarVisitas(linhasPorPlaca.get(placaNorm) ?? [], paradas, horarioBasePorPlaca.get(placaNorm)?.visitasPorNf))
    kmPorPlaca.set(placaNorm, calcularKmPercorrido(paradas))
  }

  const alvosPorPlaca = agrupar(alvos, a => a.placaNorm)
  const escalaPorChave = new Map(escala.map(e => [`${e.carga}::${e.placaNorm}`, e]))
  const cargasPorChave = agrupar(romaneioGeo, l => `${l.carga}::${normPlaca(l.placa)}`)

  return [...cargasPorChave.entries()].map(([chave, linhasDaCarga]) => {
    const [carga, placaNorm] = chave.split('::')
    return agregarPorCarga(
      carga, placaNorm, linhasDaCarga,
      escalaPorChave.get(chave) ?? null,
      alvosPorPlaca.get(placaNorm) ?? [],
      visitasPorPlaca.get(placaNorm) ?? new Map(),
      paradasPorPlaca.get(placaNorm) ?? [],
      kmPorPlaca.get(placaNorm) ?? null,
      horarioBasePorPlaca.get(placaNorm),
      temRastreadorPorPlaca.get(placaNorm) ?? false,
    )
  })
}

async function main() {
  const args = process.argv.slice(2)
  const saidaPath = args[0]
  const resto = args.slice(1)
  if (!saidaPath || resto.length === 0 || resto.length % 3 !== 0) {
    console.error('Uso: npx tsx --env-file=.env.production scripts/gerar-dashboard-nutrimax.ts <saida.xlsx> <escala1.pdf> <romaneio1.pdf> <data1:YYYY-MM-DD> [...]')
    process.exit(1)
  }

  const linhasPorDia = new Map<string, LinhaDashboardComRank[]>()
  for (let i = 0; i < resto.length; i += 3) {
    const [escalaPath, romaneioPath, data] = resto.slice(i, i + 3)
    console.log(`Dia ${data}:`)
    const linhasKpi = await gerarLinhasKpiDoDia(escalaPath, romaneioPath, data)
    const diaria = linhasKpi.map(l => montarLinhaDashboardDiaria(l, data))
    const comRank = atribuirRankEPerformance(diaria)
    linhasPorDia.set(data, comRank)
    const semDado = comRank.filter(l => l.rankDia == null).length
    console.log(`  ${comRank.length} saidas, ${semDado} sem dado valido`)
  }

  const todasLinhas = [...linhasPorDia.values()].flat()
  const equipesSemanal = agregarEquipeSemanal(todasLinhas)
  const resumo = montarResumoPeriodo(todasLinhas)

  const xlsxBuf = await gerarDashboardNutrimaxXlsx(linhasPorDia, equipesSemanal, resumo)
  writeFileSync(saidaPath, xlsxBuf)
  console.log(`\nOK -> ${saidaPath}`)
  console.log(JSON.stringify({ ...resumo, equipes: equipesSemanal.length }, null, 2))
}

main().catch(e => {
  console.error('ERRO FATAL:', e)
  process.exit(1)
})
