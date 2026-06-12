import { config } from 'dotenv'
config({ path: '.env.local' })
import { apiPost } from '../../src/lib/unitrac-api/client.ts'
import { buscarFrota } from '../../src/lib/unitrac-api/frota.ts'

const frota = await buscarFrota()
const cvs = frota.map(v => v.cv)
const alvos = (await apiPost('/mapa_servicos/alvos', cvs)) as any
const lista: any[] = alvos?.alvos ?? []
console.log(`Total de alvos (toda a frota): ${lista.length}\n`)

// agrupa por placa
const porPlaca = new Map<string, any[]>()
for (const a of lista) { const p = (a.placa ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase(); const arr = porPlaca.get(p) ?? []; arr.push(a); porPlaca.set(p, arr) }
console.log(`Placas com alvos: ${porPlaca.size}\n`)

for (const placa of ['FUM8748', 'RJN9F68', 'LKR5990']) {
  const as = (porPlaca.get(placa) ?? []).sort((a, b) => (a.alvoordem ?? 0) - (b.alvoordem ?? 0))
  console.log(`===== ${placa}: ${as.length} alvos =====`)
  for (const a of as) {
    console.log(`  ordem ${a.alvoordem} | rota ${a.alvorota} | ${a.pontoidentificador} "${a.pontonome}" | sit ${a.alvosituacaoservico} | início ${a.alvodatainicio ?? '-'} | feito ${a.alvodatarealizado ?? '-'} | doc ${a.alvodocumento ?? '-'}`)
  }
  console.log()
}

// quantos alvos têm datarealizado preenchido entre os "feito"
const feitos = lista.filter(a => String(a.alvosituacaoservico) === '1')
const comData = feitos.filter(a => a.alvodatarealizado && String(a.alvodatarealizado).trim())
console.log(`Alvos FEITO: ${feitos.length} | com alvodatarealizado preenchido: ${comData.length} (${Math.round(comData.length / Math.max(feitos.length,1) * 100)}%)`)
if (comData[0]) console.log('exemplo datarealizado:', comData[0].alvodatarealizado)
