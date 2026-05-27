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
  // Loja 1129 cadastro
  const { data: lojas } = await sb.from('lojas').select('*').eq('rede_id', 'ZONA_SUL')
  const l1129 = lojas?.find(l => /1129/.test(l.nome))
  console.log(`Loja 1129: ${l1129?.nome} lat=${l1129?.lat} lng=${l1129?.lng} raio=${l1129?.raio_metros}`)

  for (const dia of ['19', '20']) {
    console.log(`\n═══ DIA ${dia} ═══`)
    const data = `2026-05-${dia.padStart(2,'0')}`
    // Lojas escala 1129 ou Mega Box
    const { data: escala } = await sb.from('escala_linhas').select('id, placa_norm, loja_nome_raw, loja_codigo_raw')
      .eq('rede_id', 'ZONA_SUL').eq('data_entrega', data)
      .or(`loja_nome_raw.ilike.%1129%,loja_nome_raw.ilike.%Mega Box 1%`)
    for (const l of escala ?? []) console.log(`  Escala ${l.loja_nome_raw}  placa=${l.placa_norm}  cod=${l.loja_codigo_raw}`)

    // GPS placas das escalas
    const pasta = `${BASE}/ESCALA DIA ${dia}`
    const files = readdirSync(pasta)
    const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
    const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
    let veiculos: any[] = []
    if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))
    if (pdfFile) veiculos.push(...await parseUnitracPdf(readFileSync(`${pasta}/${pdfFile}`), new Set()).catch(() => []))

    const placas = new Set((escala ?? []).map(l => l.placa_norm))
    for (const v of veiculos) {
      if (!placas.has(v.placa_norm)) continue
      console.log(`\n  GPS ${v.placa_norm} (todas paradas):`)
      console.log(`    Total: ${v.paradas.length} paradas`)
      for (const p of v.paradas) {
        if (p.classificacao === 'BASE' || p.classificacao === 'FAKE_EXIT') continue
        const dist = l1129?.lat && p.lat ? Math.round(Math.sqrt(((p.lat-l1129.lat)*111000)**2 + ((p.lng-l1129.lng)*111000)**2)) : '?'
        console.log(`    ${fmtT(p.chegada)} → ${fmtT(p.saida)}  ${p.classificacao.padEnd(10)}  dist_1129=${String(dist).padStart(5)}m  ${p.local_parada?.slice(0,40)}`)
      }
    }
  }
})()
