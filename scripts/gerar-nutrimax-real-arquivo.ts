// Script avulso (não faz parte do app) — roda o pipeline completo de KPI da
// Nutry Max com Escala+Romaneio reais e ESCREVE o xlsx em disco, sem passar
// pela rota HTTP (sem auth, sem upload). Espelha exatamente a lógica de
// src/app/api/kpi/nutrimax/gerar/route.ts.
//
// Uso: npx tsx --env-file=.env.production scripts/gerar-nutrimax-real-arquivo.ts <escala.pdf> <romaneio.pdf> <data:YYYY-MM-DD> <saida.xlsx>

import { readFileSync, writeFileSync } from 'fs'
import { parseEscala } from '../src/lib/kpi-romaneio/parse-escala'
import { parseRomaneio } from '../src/lib/kpi-romaneio/parse-romaneio'
import { parsePao } from '../src/lib/kpi-romaneio/parse-pao'
import { geocodificarEnderecos } from '../src/lib/kpi-romaneio/geocode'
import { reposicionarPorAncoras } from '../src/lib/kpi-romaneio/geocode-ancoras'
import { buscarFrota, normPlaca } from '../src/lib/unitrac-api'
import { buscarAlvosDoDia, buscarParadasDoDia, resolverParadas } from '../src/lib/kpi-romaneio/unitrac'
import { buscarHorariosBase } from '../src/lib/kpi-romaneio/base-horarios'
import { alvosDaData } from '../src/lib/kpi-romaneio/alvos-data'
import { montarVisitas } from '../src/lib/kpi-romaneio/visitas'
import { agregarPorCarga, montarDetalheEntregas } from '../src/lib/kpi-romaneio/agregacao'
import { calcularKmPercorrido } from '../src/lib/kpi-romaneio/km'
import { detectarDescasamentos } from '../src/lib/kpi-romaneio/avisos'
import { gerarKpiRomaneioXlsx } from '../src/lib/kpi-romaneio/gerador-xlsx'
import { COD_USER_NUTRIMAX, foraDoAlcanceApi } from '../src/lib/kpi-romaneio/constants'
import { logarNfDuplicadaNaMesmaPlaca } from '../src/lib/kpi-romaneio/nf-duplicada'
import { hojeBR } from '../src/lib/data-br'
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
  const [escalaPath, romaneioPath, data, saidaPath, romaneioPaoPath] = process.argv.slice(2)
  if (!escalaPath || !romaneioPath || !data || !saidaPath) {
    console.error('Uso: npx tsx --env-file=.env.production scripts/gerar-nutrimax-real-arquivo.ts <escala.pdf> <romaneio.pdf> <data:YYYY-MM-DD> <saida.xlsx> [romaneio-pao.pdf]')
    process.exit(1)
  }

  const escalaBuf = Buffer.from(readFileSync(escalaPath))
  const romaneioBuf = Buffer.from(readFileSync(romaneioPath))
  const romaneioPaoBuf = romaneioPaoPath ? Buffer.from(readFileSync(romaneioPaoPath)) : null

  const escala = await parseEscala(escalaBuf)
  const romaneio = await parseRomaneio(romaneioBuf)
  const resultadoPao = romaneioPaoBuf ? await parsePao(romaneioPaoBuf, data) : { linhas: [], escala: [] }
  const escalaCompleta = [...escala, ...resultadoPao.escala]
  const romaneioCompleto = [...romaneio, ...resultadoPao.linhas]
  console.log(`Escala: ${escalaCompleta.length} linhas, Romaneio: ${romaneioCompleto.length} linhas (${resultadoPao.linhas.length} do pão)`)
  // Fix (revisao final de branch 15/09, Important 4 -- espelha route.ts): o
  // Romaneio de Entrega da Nutry Max e' o documento obrigatorio. Linha
  // nenhuma reconhecida nele e' PDF errado, mesmo que o pao tenha trazido
  // linhas -- nao pode passar em silencio so' porque o total ficou > 0.
  if (romaneio.length === 0) {
    console.error('ERRO: nenhuma linha reconhecida no Romaneio de Entrega — confira se o PDF é o "Romaneio de Entrega" da Nutry Max.')
    process.exit(1)
  }

  const enderecosUnicos = [...new Set(romaneioCompleto.map(l => l.endereco))]
  const resultadosGeo = await geocodificarEnderecos(enderecosUnicos, { validarTerritorio: true })
  const geoPorEndereco = new Map(enderecosUnicos.map((e, i) => [e, resultadosGeo[i]]))
  const romaneioGeo: LinhaGeocodificada[] = romaneioCompleto.map(l => {
    const g = geoPorEndereco.get(l.endereco) ?? null
    return { ...l, lat: g?.lat ?? null, lng: g?.lng ?? null, geoConfiavel: g?.confiavel ?? true, geoMotivo: g?.motivo }
  })

  // Item 5 (achado real 10-09, auditoria com a Ana -- espelha route.ts):
  // Passo 7 do motor de geolocalizacao universal, endereco sem_candidato
  // resgatado usando como ancora as outras entregas geocodificadas da
  // MESMA placa/dia.
  //
  // Item 5.2 (achado real, colapso de via longa -- espelha route.ts):
  // endereco DIFERENTE geocodificado pro MESMO ponto exato de outro
  // (CNEFE caiu pro centro da rua por nao achar o numero) entra no mesmo
  // resgate -- nao e' sem_candidato mas tambem precisa de ancora.
  const enderecosColididos = new Set<string>()
  {
    const enderecosPorCoord = new Map<string, Set<string>>()
    for (const [endereco, g] of geoPorEndereco) {
      if (!g) continue
      const chave = `${g.lat},${g.lng}`
      const set = enderecosPorCoord.get(chave) ?? new Set<string>()
      set.add(endereco)
      enderecosPorCoord.set(chave, set)
    }
    for (const enderecos of enderecosPorCoord.values()) {
      if (enderecos.size > 1) for (const e of enderecos) enderecosColididos.add(e)
    }
  }

  const indicePorNf = new Map(romaneioGeo.map((l, i) => [l.nf, i]))
  const precisaResgatePorPlaca = agrupar(
    romaneioGeo.filter(l => l.lat == null || enderecosColididos.has(l.endereco)),
    l => normPlaca(l.placa),
  )
  if (precisaResgatePorPlaca.size > 0) {
    const gruposAncoras = [...precisaResgatePorPlaca.entries()].map(([placaNorm, linhas]) => ({
      id: placaNorm,
      ruas: linhas.map(l => l.endereco),
      ancoras: romaneioGeo
        .filter((o): o is LinhaGeocodificada & { lat: number; lng: number } =>
          normPlaca(o.placa) === placaNorm && o.lat != null && o.lng != null && !enderecosColididos.has(o.endereco))
        .map(o => ({ lat: o.lat, lng: o.lng })),
    }))
    const resgate = await reposicionarPorAncoras(gruposAncoras)
    let resgatados = 0
    for (const [placaNorm, linhas] of precisaResgatePorPlaca) {
      const resultadosResgate = resgate.get(placaNorm) ?? []
      linhas.forEach((l, i) => {
        const r = resultadosResgate[i]
        if (!r) return
        const idx = indicePorNf.get(l.nf)!
        romaneioGeo[idx] = { ...romaneioGeo[idx], lat: r.lat, lng: r.lng }
        resgatados++
      })
    }
    if (resgatados > 0) console.log(`Resgatados por âncora da rota do caminhão: ${resgatados}`)
  }

  console.log(`Geocodificados: ${romaneioGeo.filter(l => l.lat != null).length}/${romaneioGeo.length}`)

  const linhasPorPlaca = agrupar(romaneioGeo, l => normPlaca(l.placa))
  const placasNorm = [...linhasPorPlaca.keys()]
  logarNfDuplicadaNaMesmaPlaca(linhasPorPlaca)

  const pontosPorPlacaBridge = new Map<string, { id: string; lat: number; lng: number }[]>()
  for (const [placaNorm, linhasDaPlaca] of linhasPorPlaca) {
    const pontos = linhasDaPlaca
      .filter((l): l is LinhaGeocodificada & { lat: number; lng: number } => l.lat != null && l.lng != null)
      .map(l => ({ id: l.nf, lat: l.lat, lng: l.lng }))
    if (pontos.length > 0) pontosPorPlacaBridge.set(placaNorm, pontos)
  }
  // Fora da janela de 48h da Unitrac: pede tambem as paradas derivadas do
  // historico permanente (mesma logica da rota /api/kpi/nutrimax/gerar).
  const foraDaJanelaUnitrac = foraDoAlcanceApi(data, hojeBR())
  const horarioBasePorPlaca = await buscarHorariosBase(placasNorm, data, pontosPorPlacaBridge, true)

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
    const daPonte = horarioBasePorPlaca.get(placaNorm)?.paradas
    paradas = resolverParadas(paradas, daPonte, placaNorm, horarioBasePorPlaca.get(placaNorm)?.apagaoDeSinal ?? false)
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
    const daPonteExtra = horarioBasePorPlaca.get(placaNorm)?.paradas
    paradas = resolverParadas(paradas, daPonteExtra, placaNorm, horarioBasePorPlaca.get(placaNorm)?.apagaoDeSinal ?? false)
    paradasPorPlaca.set(placaNorm, paradas)
  }

  const alvosPorPlaca = agrupar(alvos, a => a.placaNorm)
  const escalaPorChave = new Map(escalaCompleta.map(e => [`${e.carga}::${e.placaNorm}`, e]))
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
        resumo?.kmPercorrido ?? null,
        data === hojeBR() && (resumo?.chegadaCd ?? null) == null,
        // Espelha o chamador real de producao (nutrimax/gerar/route.ts):
        // rotulo de ilha (verificarAcessoIlha) e parada curta compartilhada
        // (item 3b, detectarParadaCurtaCompartilhada) sao so' desta
        // pipeline -- sem os dois, este script de verificacao nao
        // exercitaria o mesmo comportamento que vai pro relatorio real.
        true,
        true,
      )
    })
    .sort((a, b) => a.carga.localeCompare(b.carga) || a.placa.localeCompare(b.placa) || a.nf.localeCompare(b.nf))

  const cargasRomaneioList = [...cargasPorChave.keys()].map(chave => {
    const [carga, placaNorm] = chave.split('::')
    return { carga, placaNorm }
  })
  // Fix (revisao final de branch 15/09, Critical 1 -- espelha route.ts): as
  // duas escalas sao INDEPENDENTES. A Escala de Rota so' cobre cargas Nutry
  // Max; a escala sintetica do pao so' cobre cargas PAO-*. Cruzar o conjunto
  // misturado marcava falsamente "sem_escala" no lado que nao tinha o
  // documento correspondente.
  const ehCargaPao = (carga: string) => carga.startsWith('PAO-')
  const avisos = [
    ...detectarDescasamentos(escala, cargasRomaneioList.filter(c => !ehCargaPao(c.carga))),
    ...(romaneioPaoBuf ? detectarDescasamentos(resultadoPao.escala, cargasRomaneioList.filter(c => ehCargaPao(c.carga))) : []),
  ].sort((a, b) => a.carga.localeCompare(b.carga) || a.placa.localeCompare(b.placa))

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
