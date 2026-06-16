import { config } from 'dotenv'; config({ path: '.env.local' })
import { apiGet, apiPost, COD_USER } from '../../src/lib/unitrac-api/client.ts'

const keys = (o: any) => o && typeof o === 'object' ? Object.keys(o) : []
function amostra(o: any, max = 60): any {
  if (Array.isArray(o)) return o.slice(0, 1).map(x => amostra(x, max))
  if (o && typeof o === 'object') {
    const out: any = {}
    for (const k of Object.keys(o)) { const v = o[k]; out[k] = (v && typeof v === 'object') ? `[${Array.isArray(v) ? 'array' : 'obj'}]` : String(v).slice(0, max) }
    return out
  }
  return o
}

// 1) FROTA
const frota = (await apiGet(`/veiculos/masn/${COD_USER}`)) as any
const veics = frota?.veiculos ?? []
console.log(`\n===== /veiculos/masn/${COD_USER} =====`)
console.log(`total veículos: ${veics.length}`)
console.log('CHAVES de um veículo:', keys(veics[0]))
console.log('amostra:', JSON.stringify(amostra(veics[0]), null, 1))

const cvs = veics.map((v: any) => String(v.cv)).slice(0, 30) // amostra de cvs
const cvUm = [String(veics[0]?.cv)]

// 2) POSIÇÕES (campos de segurança/sensores)
const pos = (await apiPost('/mapa_servicos/posicoes/S/N', cvs)) as any
const posList = pos?.Posicoes ?? pos?.posicoes ?? []
console.log(`\n===== POST /mapa_servicos/posicoes/S/N (${cvs.length} cvs) =====`)
console.log(`retornou: ${posList.length}`)
console.log('TODAS as chaves de uma posição:', keys(posList[0]))
console.log('amostra:', JSON.stringify(amostra(posList[0]), null, 1))
// procura campos de segurança preenchidos em QUALQUER veículo
const segFields = ['panico', 'bauForaPonto', 'atraso', 'alerta', 'posicvelocidade', 'posicignicao', 'datacomunicacao', 'datagps', 'ult_rota']
for (const f of segFields) {
  const comValor = posList.filter((p: any) => p[f] != null && p[f] !== '' && p[f] !== '0' && p[f] !== 'false')
  console.log(`  campo "${f}": ${comValor.length}/${posList.length} com valor; ex=${JSON.stringify(comValor[0]?.[f] ?? posList[0]?.[f])}`)
}
// chaves de sensores posicentradaN/posicsaidaN
const sensores = keys(posList[0]).filter(k => /posicentrada|posicsaida|sensor|porta|temperatura|odometr|hodometr/i.test(k))
console.log('  sensores detectados:', sensores)

// 3) ALVOS (todas as chaves)
const alvos = (await apiPost('/mapa_servicos/alvos', cvs)) as any
const alvList = alvos?.alvos ?? []
console.log(`\n===== POST /mapa_servicos/alvos (${cvs.length} cvs) =====`)
console.log(`total alvos: ${alvList.length}`)
console.log('TODAS as chaves de um alvo:', keys(alvList[0]))
console.log('amostra (feito):', JSON.stringify(amostra(alvList.find((a: any) => String(a.alvosituacaoservico) === '1') ?? alvList[0]), null, 1))

// 4) STOPS cru
const stops = (await apiGet(`/mapa_servicos/stops/${cvUm[0]}/24`)) as any
const stopList = stops?.paradas ?? []
console.log(`\n===== GET /mapa_servicos/stops/${cvUm[0]}/24 =====`)
console.log(`paradas: ${stopList.length}`)
console.log('chaves de uma parada:', keys(stopList[0]))
console.log('amostra:', JSON.stringify(amostra(stopList[0]), null, 1))

// 5) RASTRO
const rastro = (await apiGet(`/mapa_servicos/rastro/${cvUm[0]}/24`)) as any
const rastroList = rastro?.posicoes ?? []
console.log(`\n===== GET /mapa_servicos/rastro/${cvUm[0]}/24 =====`)
console.log(`pontos: ${rastroList.length}; chaves do ponto:`, keys(rastroList[0]), 'ex:', JSON.stringify(rastroList[0]))

// 6) endpoints extras: testar o que responde 200 vs 404
console.log(`\n===== SONDAGEM de endpoints extras =====`)
for (const ep of [`/area/4586`, `/area/722`, `/mapa_servicos/motoristas`, `/mapa_servicos/rotas`, `/mapa_servicos/eventos`, `/mapa_servicos/cercas`, `/mapa_servicos/comandos`, `/mapa_servicos/historico/${cvUm[0]}/24`]) {
  const r = await apiGet(ep)
  console.log(`  ${ep} → ${r == null ? '404/erro' : 'OK keys=' + JSON.stringify(keys(r))}`)
}
