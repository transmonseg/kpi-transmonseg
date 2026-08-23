// Script avulso de validação (não faz parte do app) — roda o pipeline de KPI
// da Nutry Max com um Escala+Romaneio reais, sem passar pela rota HTTP (sem
// auth, sem upload). Objetivo: confirmar que o parser lê PDFs de verdade
// corretamente e que a geocodificação funciona, antes de considerar o
// pipeline validado. A parte de GPS/Unitrac só funciona pra data dentro das
// últimas 48h (limite da API deles) — se o arquivo for mais antigo, essa
// parte fica vazia mas o resto ainda é útil.
//
// Uso: npx tsx --env-file=.env.production scripts/validar-nutrimax-real.ts <escala.pdf> <romaneio.pdf> <data:YYYY-MM-DD>

import { readFileSync } from 'fs'
import { parseEscala } from '../src/lib/kpi-romaneio/parse-escala'
import { parseRomaneio } from '../src/lib/kpi-romaneio/parse-romaneio'
import { geocodificarEnderecos } from '../src/lib/kpi-romaneio/geocode'
import { buscarFrota, normPlaca } from '../src/lib/unitrac-api'
import { buscarAlvosDoDia, buscarParadasDoDia } from '../src/lib/kpi-romaneio/unitrac'
import { alvosDaData } from '../src/lib/kpi-romaneio/alvos-data'
import { montarVisitas } from '../src/lib/kpi-romaneio/visitas'
import { agregarPorCarga } from '../src/lib/kpi-romaneio/agregacao'
import { calcularKmPercorrido } from '../src/lib/kpi-romaneio/km'
import { detectarDescasamentos } from '../src/lib/kpi-romaneio/avisos'
import { COD_USER_NUTRIMAX } from '../src/lib/kpi-romaneio/constants'
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

async function main() {
  const [escalaPath, romaneioPath, data] = process.argv.slice(2)
  if (!escalaPath || !romaneioPath || !data) {
    console.error('Uso: npx tsx --env-file=.env.production scripts/validar-nutrimax-real.ts <escala.pdf> <romaneio.pdf> <data:YYYY-MM-DD>')
    process.exit(1)
  }

  console.log(`\n=== Validação Nutry Max — data ${data} ===\n`)

  const escalaBuf = Buffer.from(readFileSync(escalaPath))
  const romaneioBuf = Buffer.from(readFileSync(romaneioPath))

  console.log('--- Parse ---')
  const escala = await parseEscala(escalaBuf)
  const romaneio = await parseRomaneio(romaneioBuf)
  console.log(`Escala: ${escala.length} linhas`)
  console.log(`Romaneio: ${romaneio.length} linhas`)
  if (romaneio.length === 0) {
    console.error('ERRO: Romaneio não reconheceu nenhuma linha. Parser precisa de ajuste pro formato real.')
    process.exit(1)
  }
  console.log('Exemplo escala[0]:', JSON.stringify(escala[0], null, 2))
  console.log('Exemplo romaneio[0]:', JSON.stringify(romaneio[0], null, 2))

  console.log('\n--- Geocodificação ---')
  const enderecosUnicos = [...new Set(romaneio.map(l => l.endereco))]
  console.log(`Endereços únicos: ${enderecosUnicos.length}`)
  const resultadosGeo = await geocodificarEnderecos(enderecosUnicos)
  const geoPorEndereco = new Map(enderecosUnicos.map((e, i) => [e, resultadosGeo[i]]))
  const semGeo = enderecosUnicos.filter(e => !geoPorEndereco.get(e))
  console.log(`Geocodificados: ${enderecosUnicos.length - semGeo.length}/${enderecosUnicos.length}`)
  if (semGeo.length > 0) {
    console.log('Endereços SEM geocodificação:')
    semGeo.forEach(e => console.log(`  - ${e}`))
  }

  const romaneioGeo: LinhaGeocodificada[] = romaneio.map(l => {
    const g = geoPorEndereco.get(l.endereco) ?? null
    return { ...l, lat: g?.lat ?? null, lng: g?.lng ?? null }
  })

  const linhasPorPlaca = agrupar(romaneioGeo, l => normPlaca(l.placa))
  const placasNorm = [...linhasPorPlaca.keys()]
  console.log(`\nPlacas no romaneio: ${placasNorm.join(', ')}`)

  console.log('\n--- Unitrac (frota + GPS) ---')
  const frota = await buscarFrota(COD_USER_NUTRIMAX)
  console.log(`Frota Nutry Max no Unitrac: ${frota.length} veículos`)
  const cvPorPlaca = new Map(frota.map(v => [v.placaNorm, v.cv]))
  const semCv = placasNorm.filter(p => !cvPorPlaca.get(p))
  if (semCv.length > 0) console.log(`Placas do romaneio SEM correspondência na frota Unitrac: ${semCv.join(', ')}`)

  let alvosBrutos: Awaited<ReturnType<typeof buscarAlvosDoDia>> = []
  try {
    alvosBrutos = await buscarAlvosDoDia(placasNorm)
  } catch (e) {
    console.log('buscarAlvosDoDia falhou (esperado se a data for antiga):', e instanceof Error ? e.message : e)
  }
  const alvos = alvosDaData(alvosBrutos, data)
  console.log(`Alvos Unitrac na data: ${alvos.length}`)

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
        console.log(`buscarParadasDoDia(${placaNorm}) falhou:`, e instanceof Error ? e.message : e)
      }
    }
    console.log(`Placa ${placaNorm}: ${paradas.length} paradas GPS encontradas`)
    paradasPorPlaca.set(placaNorm, paradas)
    visitasPorPlaca.set(placaNorm, montarVisitas(linhasPorPlaca.get(placaNorm) ?? [], paradas))
    kmPorPlaca.set(placaNorm, calcularKmPercorrido(paradas))
  }

  console.log('\n--- Agregação por carga ---')
  const alvosPorPlaca = agrupar(alvos, a => a.placaNorm)
  const escalaPorChave = new Map(escala.map(e => [`${e.carga}::${e.placaNorm}`, e]))
  const cargasPorChave = agrupar(romaneioGeo, l => `${l.carga}::${normPlaca(l.placa)}`)

  const linhasKpi: LinhaKpiRomaneio[] = [...cargasPorChave.entries()]
    .map(([chave, linhasDaCarga]) => {
      const [carga, placaNorm] = chave.split('::')
      return agregarPorCarga(
        carga,
        placaNorm,
        linhasDaCarga,
        escalaPorChave.get(chave) ?? null,
        alvosPorPlaca.get(placaNorm) ?? [],
        visitasPorPlaca.get(placaNorm) ?? new Map(),
        paradasPorPlaca.get(placaNorm) ?? [],
        kmPorPlaca.get(placaNorm) ?? null,
      )
    })
    .sort((a, b) => a.carga.localeCompare(b.carga) || a.placa.localeCompare(b.placa))

  console.log(`Total de cargas agregadas: ${linhasKpi.length}`)
  const ok = linhasKpi.filter(l => l.status === 'OK').length
  console.log(`Status: ${ok}/${linhasKpi.length} marcadas como OK, ${linhasKpi.length - ok} INCOMPLETO`)
  console.log(`Total de paradas reais confirmadas (soma): ${linhasKpi.reduce((s, l) => s + l.paradasReais, 0)}`)
  console.log('\nPrimeiras 5 linhas do KPI final:')
  linhasKpi.slice(0, 5).forEach(l => console.log(JSON.stringify(l)))

  const cargasRomaneioList = [...cargasPorChave.keys()].map(chave => {
    const [carga, placaNorm] = chave.split('::')
    return { carga, placaNorm }
  })
  const avisos = detectarDescasamentos(escala, cargasRomaneioList)
  console.log(`\nAvisos de descasamento Escala<->Romaneio: ${avisos.length}`)
  avisos.forEach(a => console.log(' -', JSON.stringify(a)))

  console.log('\n=== Fim da validação ===')
}

main().catch(e => {
  console.error('ERRO FATAL:', e)
  process.exit(1)
})
