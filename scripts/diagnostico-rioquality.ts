// Dump por entrega do KPI Rio Quality pra CONFERENCIA MANUAL da
// geolocalizacao: placa, rua do romaneio, coordenada que o motor achou,
// confianca da coerencia de grupo, status e distancia ate' a parada de GPS
// mais proxima (da propria placa). Com isso da' pra checar, caso a caso, se
// a coordenada e' mesmo daquela rua (reverse geocode) e se o caminhao esteve
// la -- que e' o teste que importa: o motor esta' puxando do romaneio certo?
//
// Uso (no VPS):
//   npx tsx --env-file=.env.production scripts/diagnostico-rioquality.ts \
//     <custos.xlsx> <entregas.xlsx> <data:YYYY-MM-DD> <saida.csv>
import { readFileSync, writeFileSync } from 'fs'
import { normPlaca, buscarStopsCru, consolidaParadasApi } from '../src/lib/unitrac-api'
import { parseCustos, parseEntregas, montarLinhasRomaneio, rotaParaZona } from '../src/lib/kpi-rioquality/parse-planilhas'
import { geocodificarPorCoerencia } from '../src/lib/kpi-rioquality/geocode-coerencia'
import { buscarFrotaRioQuality } from '../src/lib/kpi-rioquality/frota'
import { montarVisitasInclusivas } from '../src/lib/kpi-rioquality/visitas'
import { BASES_COORD_RIOQUALITY } from '../src/lib/kpi-rioquality/constants'
import type { LinhaGeocodificada } from '../src/lib/kpi-romaneio/types'

function hav(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000
  const p1 = (aLat * Math.PI) / 180, p2 = (bLat * Math.PI) / 180
  const dp = ((bLat - aLat) * Math.PI) / 180, dl = ((bLng - aLng) * Math.PI) / 180
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

function agrupar<T>(itens: T[], chave: (i: T) => string): Map<string, T[]> {
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
  const [custosPath, entregasPath, data, saidaPath] = process.argv.slice(2)
  const custos = parseCustos(Buffer.from(readFileSync(custosPath)))
  const entregas = parseEntregas(Buffer.from(readFileSync(entregasPath)))
  const romaneio = montarLinhasRomaneio(custos, entregas)
  const porPlaca = agrupar(romaneio, l => normPlaca(l.placa))
  const placas = [...porPlaca.keys()]

  const geo = await geocodificarPorCoerencia(placas.map(p => ({
    id: p,
    zona: rotaParaZona(custos.get(p) ?? null),
    ruas: (porPlaca.get(p) ?? []).map(l => l.endereco),
  })))
  const cvPorPlaca = await buscarFrotaRioQuality()

  const linhas = ['placa,rota,rua,lat,lng,confianca,candidatos,status,dist_parada_m,parada_hora']
  for (const placa of placas) {
    const doRomaneio = porPlaca.get(placa) ?? []
    const res = geo.get(placa) ?? []
    const cv = cvPorPlaca.get(placa)
    const paradas = cv
      ? consolidaParadasApi(await buscarStopsCru(cv, 48), {}, data, placa, BASES_COORD_RIOQUALITY)
      : []
    const geocodificadas: LinhaGeocodificada[] = doRomaneio.map((l, i) => ({
      ...l, lat: res[i]?.lat ?? null, lng: res[i]?.lng ?? null,
    }))
    const visitas = montarVisitasInclusivas(geocodificadas, paradas)
    const foraBase = paradas.filter(p => p.classificacao === 'FORA_BASE' && p.lat != null && p.lng != null)

    doRomaneio.forEach((l, i) => {
      const r = res[i]
      const v = visitas.get(l.nf)
      let dist: number | null = null
      let hora = ''
      if (r?.lat != null && r?.lng != null && foraBase.length > 0) {
        let melhor = foraBase[0], md = Infinity
        for (const p of foraBase) {
          const d = hav(r.lat, r.lng, p.lat as number, p.lng as number)
          if (d < md) { md = d; melhor = p }
        }
        dist = Math.round(md)
        hora = melhor.chegada ?? ''
      }
      linhas.push([
        placa, (custos.get(placa) ?? '').replace(/,/g, ' '), l.endereco.replace(/,/g, ' '),
        r?.lat ?? '', r?.lng ?? '', r?.confianca ?? 'sem_candidato', r?.candidatos ?? 0,
        cv ? (v ? (v.viaVizinhanca ? 'confirmado_vizinhanca' : 'confirmado_gps') : 'pendente') : 'sem_rastreador',
        dist ?? '', hora,
      ].join(','))
    })
  }
  writeFileSync(saidaPath, linhas.join('\n'))
  console.log(`${linhas.length - 1} linhas -> ${saidaPath}`)
}

main().catch(e => { console.error(e); process.exit(1) })
