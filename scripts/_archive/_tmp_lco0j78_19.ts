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
  const { data: l07 } = await sb.from('lojas').select('*').eq('rede_id', 'ZONA_SUL').ilike('nome', '%07 - LEBLON%').single()
  console.log(`Loja 07: lat=${l07?.lat} lng=${l07?.lng} raio=${l07?.raio_metros}`)

  const pasta = `${BASE}/ESCALA DIA 19`
  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
  let veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))
  if (pdfFile) veiculos.push(...await parseUnitracPdf(readFileSync(`${pasta}/${pdfFile}`), new Set()).catch(() => []))

  // Procura placa LCO0978 e variantes
  for (const placa of ['LCO0978', 'LCO0J78']) {
    const v = veiculos.find(v => v.placa_norm === placa)
    if (!v) { console.log(`\n${placa}: ausente`); continue }
    console.log(`\n${placa} dia 19:`)
    for (const p of v.paradas) {
      if (p.classificacao === 'BASE' || p.classificacao === 'FAKE_EXIT') continue
      const dist = l07?.lat && p.lat ? Math.round(Math.sqrt(((p.lat-l07.lat)*111000)**2 + ((p.lng-l07.lng)*111000)**2)) : '?'
      console.log(`  ${fmtT(p.chegada)} → ${fmtT(p.saida)}  ${p.classificacao.padEnd(10)} dist_l07=${String(dist).padStart(5)}m ${p.local_parada?.slice(0,40)}`)
    }
  }
})()
