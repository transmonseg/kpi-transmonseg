import { config } from 'dotenv'; config({ path: '.env.local' })
import { buscarFrota } from '../../src/lib/unitrac-api/frota.ts'
import { buscarAlvos } from '../../src/lib/unitrac-api/alvos.ts'
const frota = await buscarFrota()
const alvos = await buscarAlvos(frota.map(v => v.cv))
const hoje = '2026-06-15'
const feitos = alvos.filter(a => a.situacao === 1 && a.feitoISO)
const feitoOutroDia = feitos.filter(a => a.feitoISO!.slice(0,10) !== hoje)
const inicioOutroDia = alvos.filter(a => a.inicioISO && a.inicioISO.slice(0,10) !== hoje)
console.log(`total alvos=${alvos.length}  feitos(sit=1)=${feitos.length}`)
console.log(`feitos com data != ${hoje}: ${feitoOutroDia.length}`)
for (const a of feitoOutroDia.slice(0,10)) console.log(`  ${a.placaNorm} loja=${a.codigoUnitrac} feito=${a.feitoISO}`)
console.log(`inícios com data != ${hoje}: ${inicioOutroDia.length}`)
const datas = [...new Set(feitos.map(a=>a.feitoISO!.slice(0,10)))].sort()
console.log(`datas distintas de feito: ${datas.join(', ')}`)
