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
  const { data: lojas } = await sb.from('lojas').select('*').eq('rede_id', 'PREZUNIC')
  const ilha = lojas?.find(l => /ILHA.*GOVERN/i.test(l.nome))
  console.log(`Loja: ${ilha?.nome} lat=${ilha?.lat} lng=${ilha?.lng} raio=${ilha?.raio_metros}`)

  const { data: esc } = await sb.from('escala_linhas').select('placa_norm, loja_nome_raw')
    .eq('rede_id', 'PREZUNIC').eq('data_entrega', '2026-05-20')
  const linhas = (esc ?? []).filter((l: any) => /ILHA.*GOVERN/i.test(l.loja_nome_raw))
  for (const l of linhas) console.log(`Escala: ${l.loja_nome_raw} placa=${l.placa_norm}`)

  const pasta = `${BASE}/ESCALA DIA 20`
  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  let veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))

  const placas = [...new Set(linhas.map((l: any) => l.placa_norm))]
  for (const placa of placas) {
    const v = veiculos.find(v => v.placa_norm === placa)
    if (!v) { console.log(`\nPlaca ${placa}: ausente`); continue }
    console.log(`\nGPS ${placa} dia 20 — todas paradas:`)
    for (const p of v.paradas) {
      const dist = ilha?.lat && p.lat ? Math.round(Math.sqrt(((p.lat-ilha.lat)*111000)**2 + ((p.lng-ilha.lng)*111000)**2)) : '?'
      console.log(`  ${fmtT(p.chegada)} → ${fmtT(p.saida)}  ${p.classificacao.padEnd(10)} dist=${String(dist).padStart(5)}m ${p.local_parada?.slice(0,45)}`)
    }
  }
})()
