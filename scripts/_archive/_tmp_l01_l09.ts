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
  const { data: lojas } = await sb.from('lojas').select('*').eq('rede_id', 'ZONA_SUL')
  const l01 = lojas?.find(l => /Loja\s*0?1\s*-\s*Ipanema/i.test(l.nome) || /^01\s*-/.test(l.nome))
  const l09 = lojas?.find(l => /Loja\s*0?9\s*-\s*Ipanema/i.test(l.nome) || /^09\s*-/.test(l.nome))
  console.log(`Loja 01: ${l01?.nome} lat=${l01?.lat} lng=${l01?.lng} raio=${l01?.raio_metros}`)
  console.log(`Loja 09: ${l09?.nome} lat=${l09?.lat} lng=${l09?.lng} raio=${l09?.raio_metros}`)

  const { data: esc } = await sb.from('escala_linhas').select('placa_norm, loja_nome_raw')
    .eq('rede_id', 'ZONA_SUL').eq('data_entrega', '2026-05-19')
  for (const e of esc ?? []) {
    if (!/Loja\s*0?[19]\s*-\s*Ipanema/i.test(e.loja_nome_raw || '')) continue
    console.log(`Escala: ${e.loja_nome_raw} placa=${e.placa_norm}`)
  }

  const placas = [...new Set((esc ?? []).filter((l: any) => /Loja\s*0?[19]\s*-\s*Ipanema/i.test(l.loja_nome_raw)).map((l: any) => l.placa_norm))]
  const pasta = `${BASE}/ESCALA DIA 19`
  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  let veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))

  for (const placa of placas) {
    const v = veiculos.find(v => v.placa_norm === placa)
    if (!v) { console.log(`\n${placa}: ausente`); continue }
    console.log(`\nGPS ${placa} dia 19:`)
    for (const p of v.paradas) {
      if (p.classificacao === 'BASE' || p.classificacao === 'FAKE_EXIT') continue
      const d01 = l01?.lat && p.lat ? Math.round(Math.sqrt(((p.lat-l01.lat)*111000)**2 + ((p.lng-l01.lng)*111000)**2)) : '?'
      const d09 = l09?.lat && p.lat ? Math.round(Math.sqrt(((p.lat-l09.lat)*111000)**2 + ((p.lng-l09.lng)*111000)**2)) : '?'
      console.log(`  ${fmtT(p.chegada)} → ${fmtT(p.saida)}  ${p.classificacao.padEnd(10)} d01=${String(d01).padStart(5)}m d09=${String(d09).padStart(5)}m ${p.local_parada?.slice(0,40)}`)
    }
  }
})()
