/**
 * Investigar geofences POSSE/BOA VISTA + paradas FORA_BASE TML9I75
 */
import { readFileSync, readdirSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

function haversine(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371e3, t1 = la1*Math.PI/180, t2 = la2*Math.PI/180
  const dt = (la2-la1)*Math.PI/180, dl = (lo2-lo1)*Math.PI/180
  const a = Math.sin(dt/2)**2 + Math.cos(t1)*Math.cos(t2)*Math.sin(dl/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}
function fmtT(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}`
}

;(async () => {
  // Lojas ARMAZEM
  const { data: lojas } = await sb.from('lojas')
    .select('id, rede_id, nome, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('rede_id', 'ARMAZEM_GRAO').eq('ativo', true)
  console.log('=== LOJAS ARMAZEM_GRAO cadastro ===')
  for (const l of (lojas || [])) {
    console.log(`  ${l.nome}  cod_esc=${l.codigo_escala}  cod_uni=${l.codigo_unitrac}  lat=${l.lat}  lng=${l.lng}  raio=${l.raio_metros}`)
  }
  const posse = lojas?.find(l => /POSSE/i.test(l.nome))
  const boavista = lojas?.find(l => /BOA VISTA/i.test(l.nome))
  console.log('\nPOSSE:', posse?.lat, posse?.lng, posse?.raio_metros)
  console.log('BOA VISTA:', boavista?.lat, boavista?.lng, boavista?.raio_metros)

  // Paradas TML9I75 com coords
  const pasta = `${BASE}/ESCALA DIA 19`
  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))

  const placas = new Set(['TML9I75','TML9875','TML9175'])
  const ps: any[] = []
  for (const v of veiculos) {
    if (!placas.has(v.placa_norm)) continue
    for (const p of v.paradas) ps.push({ ...p, placa_norm: v.placa_norm })
  }

  console.log(`\n=== PARADAS TML9I75 com geo distance ===`)
  for (const p of ps) {
    const distP = posse?.lat && p.lat ? Math.round(haversine(p.lat, p.lng, posse.lat, posse.lng)) : null
    const distB = boavista?.lat && p.lat ? Math.round(haversine(p.lat, p.lng, boavista.lat, boavista.lng)) : null
    console.log(`  ${fmtT(p.chegada)}-${fmtT(p.saida)} cls=${p.classificacao.padEnd(10)} lat=${p.lat?.toFixed(4)} lng=${p.lng?.toFixed(4)}  dPOSSE=${distP}m dBOA=${distB}m  local=${(p.local_parada||'').slice(0,30)}`)
  }

  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
