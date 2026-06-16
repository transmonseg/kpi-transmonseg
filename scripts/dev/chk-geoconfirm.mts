import { config } from 'dotenv'; config({ path: '.env.local' })
import { buscarFrota } from '../../src/lib/unitrac-api/frota.ts'
import { buscarPontos } from '../../src/lib/unitrac-api/pontos.ts'
import { buscarAlvos, confirmaPorAlvo } from '../../src/lib/unitrac-api/alvos.ts'
import { buscarStopsCru, consolidaParadasApi } from '../../src/lib/unitrac-api/consolida.ts'
import { confirmaEntregaViaApi } from '../../src/lib/unitrac-api/confirma.ts'
import { buscarPosicoes } from '../../src/lib/unitrac-api/posicoes.ts'

const data = process.argv[2] ?? '2026-06-16'
const frota = await buscarFrota()
const cvs = frota.map(v => v.cv)
const [pontos, alvos, poss] = await Promise.all([buscarPontos(cvs), buscarAlvos(cvs), buscarPosicoes(cvs)])
console.log(`pontos(geofences)=${Object.keys(pontos).length}  alvos=${alvos.length}  posicoes=${Object.keys(poss).length}`)

// item 1: pega 5 entregas FEITAS hoje e confirma por COORDENADA
const feitos = alvos.filter(a => a.situacao === 1 && a.feitoISO && a.feitoISO.slice(0,10) === data).slice(0, 6)
let ok = 0
console.log('\n=== ITEM 1: confirmação por coordenada (GPS dentro da geofence) ===')
for (const a of feitos) {
  const v = frota.find(x => x.placaNorm === a.placaNorm); if (!v) continue
  const stops = consolidaParadasApi(await buscarStopsCru(v.cv, 24), pontos, data, a.placaNorm)
    .map(p => ({ id: p.id, lat: p.lat, lng: p.lng, chegada: p.chegada, saida: p.saida, classificacao: p.classificacao }))
  const conf = confirmaEntregaViaApi(a.codigoUnitrac, stops, pontos)
  console.log(`  ${a.placaNorm} loja ${a.codigoUnitrac} (${a.nome.slice(0,20)}): ${conf ? `CONFIRMADO a ${conf.distMetros}m` : 'não achou GPS na geofence'}`)
  if (conf) ok++
}
console.log(`  => ${ok}/${feitos.length} confirmadas por coordenada`)

// item 2: determinismo (já testado) — mostra ordem/rota num feito
const comOrdem = alvos.find(a => a.situacao === 1 && a.rota)
console.log(`\n=== ITEM 2: ordem/rota expostos ===\n  ex: ${comOrdem?.placaNorm} rota="${comOrdem?.rota}" ordem=${comOrdem?.ordem}`)

// item 3: placas com atraso alto (sem comunicar) — o que viraria "sem comunicação há X"
const atrasadas = Object.entries(poss).filter(([,p]) => p.atraso >= 30).sort((a,b)=>b[1].atraso-a[1].atraso).slice(0,8)
console.log(`\n=== ITEM 3: placas sem comunicar há >=30min (viram "sem comunicação há X", não "sem rastreador") ===`)
for (const [placa, p] of atrasadas) console.log(`  ${placa}: ${p.atraso} min (últ GPS ${p.datagps})`)
console.log(`  total na API com atraso>=30min: ${Object.values(poss).filter(p=>p.atraso>=30).length}/${Object.keys(poss).length}`)
