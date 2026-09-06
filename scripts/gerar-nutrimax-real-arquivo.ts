// Script avulso (não faz parte do app) — roda o pipeline completo de KPI da
// Nutry Max com Escala+Romaneio reais e ESCREVE o xlsx em disco, sem passar
// pela rota HTTP (sem auth, sem upload). Espelha exatamente a lógica de
// src/app/api/kpi/nutrimax/gerar/route.ts.
//
// Uso: npx tsx --env-file=.env.production scripts/gerar-nutrimax-real-arquivo.ts <escala.pdf> <romaneio.pdf> <data:YYYY-MM-DD> <saida.xlsx>

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
import { detectarDescasamentos } from '../src/lib/kpi-romaneio/avisos'
import { gerarKpiRomaneioXlsx } from '../src/lib/kpi-romaneio/gerador-xlsx'
import { COD_USER_NUTRIMAX } from '../src/lib/kpi-romaneio/constants'
import type { LinhaGeocodificada, LinhaKpiRomaneio, LinhaDetalheEntrega, Visita } from '../src/lib/kpi-romaneio/types'
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
  const [escalaPath, romaneioPath, data, saidaPath] = process.argv.slice(2)
  if (!escalaPath || !romaneioPath || !data || !saidaPath) {
    console.error('Uso: npx tsx --env-file=.env.production scripts/gerar-nutrimax-real-arquivo.ts <escala.pdf> <romaneio.pdf> <data:YYYY-MM-DD> <saida.xlsx>')
    process.exit(1)
  }

  const escalaBuf = Buffer.from(readFileSync(escalaPath))
  const romaneioBuf = Buffer.from(readFileSync(romaneioPath))

  const escala = await parseEscala(escalaBuf)
  const romaneio = await parseRomaneio(romaneioBuf)
  console.log(`Escala: ${escala.length} linhas, Romaneio: ${romaneio.length} linhas`)

  const enderecosUnicos = [...new Set(romaneio.map(l => l.endereco))]
  const resultadosGeo = await geocodificarEnderecos(enderecosUnicos)
  const geoPorEndereco = new Map(enderecosUnicos.map((e, i) => [e, resultadosGeo[i]]))
  const romaneioGeo: LinhaGeocodificada[] = romaneio.map(l => {
    const g = geoPorEndereco.get(l.endereco) ?? null
    return { ...l, lat: g?.lat ?? null, lng: g?.lng ?? null }
  })
  console.log(`Geocodificados: ${romaneioGeo.filter(l => l.lat != null).length}/${romaneioGeo.length}`)

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
    console.log('buscarAlvosDoDia falhou:', e instanceof Error ? e.message : e)
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
        console.log(`buscarParadasDoDia(${placaNorm}) falhou:`, e instanceof Error ? e.message : e)
      }
    }
    paradasPorPlaca.set(placaNorm, paradas)
    visitasPorPlaca.set(placaNorm, montarVisitas(linhasPorPlaca.get(placaNorm) ?? [], paradas, horarioBasePorPlaca.get(placaNorm)?.visitasPorNf))
    kmPorPlaca.set(placaNorm, calcularKmPercorrido(paradas))
  }

  // Achado real 06/09 (grupo KPI AJUSTES, placa TTH-3C94): "carga
  // transferida" so' enxerga placa que aparece no romaneio -- caminhao
  // reserva sem NF nenhuma sua no romaneio fica invisivel pra deteccao de
  // troca. Busca GPS tambem da frota inteira (buscarFrota ja' devolve isso
  // direto da Unitrac) so' pra alimentar paradasPorOutraPlaca -- nao cria
  // linha/aba de relatorio pra placa sem NF (placasNorm intocado).
  const placasFrotaExtra = frota.map(v => v.placaNorm).filter(p => !paradasPorPlaca.has(p))
  for (const placaNorm of placasFrotaExtra) {
    const cv = cvPorPlaca.get(placaNorm)
    let paradas: UnitracParadaRow[] = []
    if (cv) {
      try {
        paradas = await buscarParadasDoDia(cv, placaNorm, data, 48)
      } catch (e) {
        console.log(`buscarParadasDoDia(${placaNorm}) falhou:`, e instanceof Error ? e.message : e)
      }
    }
    paradasPorPlaca.set(placaNorm, paradas)
  }

  const alvosPorPlaca = agrupar(alvos, a => a.placaNorm)
  const escalaPorChave = new Map(escala.map(e => [`${e.carga}::${e.placaNorm}`, e]))
  const cargasPorChave = agrupar(romaneioGeo, l => `${l.carga}::${normPlaca(l.placa)}`)

  const linhasKpi: LinhaKpiRomaneio[] = [...cargasPorChave.entries()]
    .map(([chave, linhasDaCarga]) => {
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
    .sort((a, b) => a.carga.localeCompare(b.carga) || a.placa.localeCompare(b.placa))

  const resumoPorChave = new Map(linhasKpi.map(l => [`${l.carga}::${l.placa}`, l]))
  const detalhe: LinhaDetalheEntrega[] = [...cargasPorChave.entries()]
    .flatMap(([chave, linhasDaCarga]) => {
      const [carga, placaNorm] = chave.split('::')
      const resumo = resumoPorChave.get(chave)
      return montarDetalheEntregas(
        carga, placaNorm, linhasDaCarga, alvosPorPlaca.get(placaNorm) ?? [], visitasPorPlaca.get(placaNorm) ?? new Map(),
        {
          motorista: resumo?.motorista ?? '',
          saidaCd: resumo?.saidaCd ?? null,
          chegadaCd: resumo?.chegadaCd ?? null,
          tempoOperacaoMin: resumo?.tempoOperacaoMin ?? null,
        },
        temRastreadorPorPlaca.get(placaNorm) ?? false,
        paradasPorPlaca,
      )
    })
    .sort((a, b) => a.carga.localeCompare(b.carga) || a.placa.localeCompare(b.placa) || a.nf.localeCompare(b.nf))

  const cargasRomaneioList = [...cargasPorChave.keys()].map(chave => {
    const [carga, placaNorm] = chave.split('::')
    return { carga, placaNorm }
  })
  const avisos = detectarDescasamentos(escala, cargasRomaneioList)

  console.log(`Total cargas: ${linhasKpi.length}, OK: ${linhasKpi.filter(l => l.status === 'OK').length}, avisos: ${avisos.length}`)
  const negativos = linhasKpi.filter(l => l.tempoOperacaoMin != null && l.tempoOperacaoMin < 0)
  console.log(`Linhas com TEMPO OPERAÇÃO negativo (deveria ser 0 agora): ${negativos.length}`)

  const xlsxBuf = await gerarKpiRomaneioXlsx(linhasKpi, data, avisos, detalhe)
  writeFileSync(saidaPath, xlsxBuf)
  console.log(`\nArquivo salvo em: ${saidaPath}`)
}

main().catch(e => {
  console.error('ERRO FATAL:', e)
  process.exit(1)
})
