import { config } from 'dotenv'; config({ path: '.env.local' })
import { buscarFrota } from '../../src/lib/unitrac-api/frota.ts'
import { buscarAlvos } from '../../src/lib/unitrac-api/alvos.ts'
import { buscarPontos } from '../../src/lib/unitrac-api/pontos.ts'
import { buscarStopsCru, consolidaParadasApi } from '../../src/lib/unitrac-api/consolida.ts'

const data = process.argv[2] ?? '2026-06-15'
const RECLAMADAS = ['FQN6J72', 'INW8A51', 'KRK3D12', 'KXB6E57', 'TML7D61', 'UBF5G36', 'KPB5I95', 'GAJ6H51', 'KNC1I34', 'EFU5H04', 'NTT4858', 'DBB8D19', 'MES7F27', 'JAJ6B36']

const frota = await buscarFrota()
const cvs = frota.map(v => v.cv)
const alvos = await buscarAlvos(cvs)
const pontos = await buscarPontos(cvs)
console.log(`frota=${frota.length}  alvos=${alvos.length}\n`)

const dt = (iso: string | null) => iso ? iso.replace('T', ' ').slice(0, 16) : '—'

for (const placa of RECLAMADAS) {
  const v = frota.find(x => x.placaNorm === placa)
  console.log(`\n========== ${placa} ${v ? `(cv=${v.cv})` : '(FORA DA FROTA API)'} ==========`)
  const meus = alvos.filter(a => a.placaNorm === placa)
  console.log(`alvos: ${meus.length}`)
  // ordena por início pra ver o mais cedo (que inicioRotaPorAlvo escolhe)
  const porIni = [...meus].sort((a, b) => String(a.inicioISO).localeCompare(String(b.inicioISO)))
  for (const a of porIni.slice(0, 12)) {
    const flagOutroDia = a.inicioISO && a.inicioISO.slice(0, 10) !== data ? '  <<< OUTRO DIA' : ''
    console.log(`  loja=${a.codigoUnitrac.padEnd(8)} sit=${a.situacao} inicio=${dt(a.inicioISO)} feito=${dt(a.feitoISO)} nf=${a.documento ?? '—'} ${a.nome.slice(0, 24)}${flagOutroDia}`)
  }
  // o que inicioRotaPorAlvo retornaria por loja (o mais cedo global por loja)
  const inicios = meus.filter(a => a.inicioISO).map(a => a.inicioISO!).sort()
  if (inicios.length) console.log(`  >>> inicioRotaPorAlvo escolheria o MAIS CEDO: ${dt(inicios[0])}`)

  // paradas consolidadas da API (do dia) p/ comparar a saída de base real
  if (v) {
    const paradas = consolidaParadasApi(await buscarStopsCru(v.cv, 48), pontos, data, placa)
    const base = paradas.filter(p => p.classificacao === 'BASE')
    const ultBase = base[base.length - 1]
    console.log(`  paradas API(dia): ${paradas.length} | última BASE saída: ${ultBase ? dt(ultBase.saida) : '—'}`)
  }
}
