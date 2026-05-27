import { readFileSync, readdirSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

function fmtT(d: Date | string | null): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}`
}

;(async () => {
  const { data: lojas } = await sb.from('lojas').select('*').eq('rede_id', 'SUPERPRIX')
  const verdun = lojas?.find(l => /verdun|loja.*04|04.*grajau/i.test(l.nome))
  const grajau08 = lojas?.find(l => /loja.*08|08.*grajau/i.test(l.nome))
  console.log('Verdun:', verdun?.nome, `lat=${verdun?.lat} lng=${verdun?.lng}`)
  console.log('Grajaú 08:', grajau08?.nome, `lat=${grajau08?.lat} lng=${grajau08?.lng}`)

  const pasta20 = `${BASE}/ESCALA DIA 20`
  const files = readdirSync(pasta20)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))

  let veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta20}/${xlsxFile}`)))
  if (pdfFile) veiculos.push(...await parseUnitracPdf(readFileSync(`${pasta20}/${pdfFile}`), new Set()).catch(() => []))

  const v = veiculos.find(v => v.placa_norm === 'CXA7B36')
  if (!v) { console.log('Placa CXA7B36 não encontrada no GPS dia 20'); return }

  console.log(`\nGPS CXA7B36 dia 20 — ${v.paradas.length} paradas total:`)
  for (const p of v.paradas) {
    const dv = verdun?.lat && p.lat ? Math.round(Math.sqrt(((p.lat-verdun.lat)*111000)**2 + ((p.lng-verdun.lng)*111000)**2)) : '?'
    const d8 = grajau08?.lat && p.lat ? Math.round(Math.sqrt(((p.lat-grajau08.lat)*111000)**2 + ((p.lng-grajau08.lng)*111000)**2)) : '?'
    console.log(`  ${fmtT(p.chegada)} → ${fmtT(p.saida)}  ${p.classificacao.padEnd(10)} dist_v=${String(dv).padStart(5)}m  dist_g08=${String(d8).padStart(5)}m  local=${p.local_parada?.slice(0,35)}`)
  }
})()
