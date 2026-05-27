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
  // Loja 11 dia 20 — 2 linhas escala (manhã + tarde)
  // Loja 07 dia 19 — 2 linhas escala
  const CASOS = [
    { dia: '20', placa: 'KRH5H67', loja: 'Loja 11' },
    { dia: '19', placa: null,      loja: 'Loja 07' }, // descobrir placa
  ]

  for (const c of CASOS) {
    console.log(`\n═══ DIA ${c.dia} — ${c.loja} ═══`)
    const data = `2026-05-${c.dia.padStart(2,'0')}`
    let escFilter: any = sb.from('escala_linhas').select('id, placa_norm, loja_nome_raw, loja_codigo_raw')
      .eq('rede_id', 'ZONA_SUL').eq('data_entrega', data)
    const { data: escala } = await escFilter
    const linhasLoja = (escala ?? []).filter((l: any) => new RegExp(c.loja.replace(' ', '\\s*'), 'i').test(l.loja_nome_raw || ''))
    console.log(`Escala linhas pra ${c.loja}: ${linhasLoja.length}`)
    for (const l of linhasLoja) console.log(`  loja=${l.loja_nome_raw}  placa=${l.placa_norm}`)

    const placas = [...new Set(linhasLoja.map((l: any) => l.placa_norm))]
    const pasta = `${BASE}/ESCALA DIA ${c.dia}`
    const files = readdirSync(pasta)
    const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
    let veiculos: any[] = []
    if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))

    const { data: lojas } = await sb.from('lojas').select('*').eq('rede_id', 'ZONA_SUL')
    const cadLoja = lojas?.find((l: any) => new RegExp(c.loja.replace(' ', '\\s*'), 'i').test(l.nome))
    console.log(`Cadastro: ${cadLoja?.nome} lat=${cadLoja?.lat} lng=${cadLoja?.lng} raio=${cadLoja?.raio_metros}`)

    for (const placa of placas) {
      const v = veiculos.find(v => v.placa_norm === placa)
      if (!v) { console.log(`\n  Placa ${placa}: ausente GPS`); continue }
      console.log(`\n  Placa ${placa} — paradas:`)
      for (const p of v.paradas) {
        if (p.classificacao === 'BASE' || p.classificacao === 'FAKE_EXIT') continue
        const dist = cadLoja?.lat && p.lat ? Math.round(Math.sqrt(((p.lat-cadLoja.lat)*111000)**2 + ((p.lng-cadLoja.lng)*111000)**2)) : '?'
        console.log(`    ${fmtT(p.chegada)} → ${fmtT(p.saida)}  ${p.classificacao.padEnd(10)} dist=${String(dist).padStart(5)}m ${p.local_parada?.slice(0,40)}`)
      }
    }
  }
})()
