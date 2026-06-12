import { readFile } from 'fs/promises'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { buscarFrota } from '../../src/lib/unitrac-api/frota.ts'
import { buscarPontos } from '../../src/lib/unitrac-api/pontos.ts'
import { buscarStopsCru, consolidaParadasApi } from '../../src/lib/unitrac-api/consolida.ts'
import { parseUnitracPdfJs } from '../../src/lib/parsers/unitrac-pdf-pdfjs.ts'
import { haversine } from '../../src/lib/utils/geo.ts'
import { isRotaGigante } from '../../src/lib/kpi/rotas-gigantes.ts'

// USO: npx tsx scripts/dev/comparar-api-vs-pdf.mts <caminho-pdf> <YYYY-MM-DD> [horas]
const [pdfPath, data, horasArg] = process.argv.slice(2)
const horas = Number(horasArg ?? 48)
if (!pdfPath || !data) { console.error('uso: comparar-api-vs-pdf.mts <pdf> <YYYY-MM-DD> [horas]'); process.exit(1) }

const hhmm = (iso: string) => new Date(iso).toISOString().slice(11, 16)

const buf = await readFile(pdfPath)
const resumos = await parseUnitracPdfJs(buf, null)
const frota = await buscarFrota()
const pontos = await buscarPontos(frota.map(v => v.cv))

// GATE = LOJA distinta visitada (uma entrega = um codigo_loja, não cada parada
// física: o caminhão para em várias docas da mesma loja). Para cada (placa, loja)
// que o PDF mostra como visitada, a API tem que ter parado no mesmo ponto.
let lojaTotal = 0, lojaRepro = 0, lojaHora = 0
const verbose = process.argv.includes('-v')
for (const r of resumos) {
  const v = frota.find(x => x.placaNorm === r.placa_norm)
  // exclui rota gigante (geofences de área, não loja-ponto — espalham por km)
  const lojasPdf = (r.paradas ?? []).filter((p: any) => p.classificacao === 'LOJA' && p.codigo_loja && !isRotaGigante(p.codigo_loja))
  if (lojasPdf.length === 0) continue
  // dedup por codigo_loja → mantém a 1ª chegada (a entrega começou aí)
  const porLoja = new Map<string, any>()
  for (const p of lojasPdf) {
    const ex = porLoja.get(p.codigo_loja)
    if (!ex || new Date(p.chegada).getTime() < new Date(ex.chegada).getTime()) porLoja.set(p.codigo_loja, p)
  }
  const eventos = v ? await buscarStopsCru(v.cv, horas) : []
  const api = consolidaParadasApi(eventos, pontos, data, r.placa_norm).filter(p => p.classificacao !== 'BASE')

  for (const pdfP of porLoja.values()) {
    lojaTotal++
    // candidatas: paradas da API ≤300m da loja. Escolhe a MAIS PRÓXIMA NO TEMPO
    // da chegada do PDF (evita casar uma passagem cedo da manhã, drive-by).
    const cand = api.filter(a => a.lat != null && pdfP.lat != null && haversine(a.lat, a.lng!, pdfP.lat, pdfP.lng) <= 300)
    if (!cand.length) { if (verbose) console.log(`  ❌ ${r.placa_norm} loja ${pdfP.codigo_loja} (${hhmm(pdfP.chegada)})`); continue }
    const m = cand.reduce((best, a) =>
      Math.abs(new Date(a.chegada).getTime() - new Date(pdfP.chegada).getTime()) <
      Math.abs(new Date(best.chegada).getTime() - new Date(pdfP.chegada).getTime()) ? a : best)
    lojaRepro++
    const diff = Math.abs(new Date(m.chegada).getTime() - new Date(pdfP.chegada).getTime())
    if (diff <= 5 * 60_000) lojaHora++
    else if (verbose) console.log(`  ⏱ ${r.placa_norm} loja ${pdfP.codigo_loja}: PDF ${hhmm(pdfP.chegada)} vs API ${hhmm(m.chegada)}`)
  }
}
const pc = (n: number, t: number) => t ? Math.round((n / t) * 100) : 0
console.log(`\n=== GATE (data ${data}) ===`)
console.log(`Lojas distintas visitadas no PDF: ${lojaTotal}`)
console.log(`  reproduzidas pela API: ${lojaRepro} (${pc(lojaRepro, lojaTotal)}%)  [meta ≥95%]`)
console.log(`  chegada ±5min:          ${lojaHora} (${pc(lojaHora, lojaTotal)}%)`)
console.log(pc(lojaRepro, lojaTotal) >= 95 && pc(lojaHora, lojaTotal) >= 90 ? '\n✅ GATE PASSOU' : '\n⚠️ GATE NÃO passou')
