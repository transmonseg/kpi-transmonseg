import { config } from 'dotenv'
config({ path: '.env.local' })
import { apiGet, apiPost } from '../../src/lib/unitrac-api/client.ts'
import { buscarFrota } from '../../src/lib/unitrac-api/frota.ts'

const frota = await buscarFrota()
const cvs = frota.slice(0, 60).map(v => v.cv) // amostra
const j = (o: any) => JSON.stringify(o)

console.log('===== 1) ALVOS — situação de serviço + nota fiscal =====')
const alvos = (await apiPost('/mapa_servicos/alvos', cvs)) as any
const lista = alvos?.alvos ?? []
console.log(`alvos retornados: ${lista.length}`)
if (lista[0]) console.log('CAMPOS de um alvo:', Object.keys(lista[0]).join(', '))
// distribuição de alvosituacaoservico
const sit: Record<string, number> = {}
for (const a of lista) { const s = String(a.alvosituacaoservico ?? '?'); sit[s] = (sit[s] ?? 0) + 1 }
console.log('alvosituacaoservico (0=pend,1=feito,98=outro):', j(sit))
// amostra de "feito"
const feitos = lista.filter((a: any) => String(a.alvosituacaoservico) === '1').slice(0, 3)
for (const f of feitos) console.log('  FEITO:', j({ nome: f.pontonome, id: f.pontoidentificador, nf: f.notafiscal ?? f.nf ?? null, sit: f.alvosituacaoservico }))

console.log('\n===== 2) POSIÇÕES — campos de segurança/operação =====')
const pos = (await apiPost('/mapa_servicos/posicoes/S/N', cvs)) as any
const plist = pos?.Posicoes ?? []
console.log(`posições: ${plist.length}`)
if (plist[0]) console.log('CAMPOS de uma posição:', Object.keys(plist[0]).join(', '))
// agrega sinais
let comAlerta = 0, panico = 0, bauFora = 0, atrasoAlto = 0
for (const p of plist) {
  if (p.alerta && p.alerta !== '0' && p.alerta !== 0) comAlerta++
  if (p.panico && p.panico !== '0' && p.panico !== 0) panico++
  if (p.bauForaPonto && p.bauForaPonto !== '0' && p.bauForaPonto !== 0) bauFora++
  const atr = parseInt(p.atraso ?? '0'); if (atr > 30) atrasoAlto++
}
console.log(`com alerta: ${comAlerta} | pânico: ${panico} | baú fora do ponto: ${bauFora} | atraso>30min (jammer?): ${atrasoAlto}`)
if (plist[0]) console.log('amostra:', j(plist[0]))

console.log('\n===== 3) RASTRO — trajeto completo =====')
const cv0 = frota.find(v => v.placaNorm === 'FUM8748')?.cv ?? frota[0].cv
const rastro = (await apiGet(`/mapa_servicos/rastro/${cv0}/24`)) as any
const rkeys = rastro ? Object.keys(rastro) : []
console.log(`chaves do rastro: ${rkeys.join(', ') || 'vazio'}`)
const pontos = rastro?.rastro ?? rastro?.pontos ?? rastro?.posicoes ?? []
console.log(`pontos no trajeto (24h): ${Array.isArray(pontos) ? pontos.length : 'n/a'}`)
if (Array.isArray(pontos) && pontos[0]) console.log('campos de um ponto:', Object.keys(pontos[0]).join(', '))

console.log('\n===== 4) Probe de endpoints novos =====')
for (const path of ['/area/4586', '/mapa_servicos/rotas/4586', '/motoristas/4586', '/eventos/4586', '/mapa_servicos/cercas/4586']) {
  const r = await apiGet(path)
  const ok = r != null
  const keys = ok && typeof r === 'object' ? Object.keys(r as any).slice(0, 6).join(',') : ''
  console.log(`  ${path} → ${ok ? 'RESPONDEU {' + keys + '}' : 'null/404'}`)
}
