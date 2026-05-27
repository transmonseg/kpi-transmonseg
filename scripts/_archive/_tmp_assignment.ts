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
  // EFU5704 escala dia 20: Loja 03 + Loja 26 (Copacabana)
  // Loja 03 manual: 20:20/20:40 (real GPS: 20:18→20:40)
  // Loja 26 manual: 19:50/20:10 (real GPS: 19:48→20:09)

  // KRH5H67 escala dia 20: Loja 11 (2 entregas: 1ª manhã + 2ª tarde)
  // 11 1ª: man 13:35/15:25
  // 11 2ª: man 16:05/16:55

  const { data: lojas } = await sb.from('lojas').select('*').eq('rede_id', 'ZONA_SUL')

  const pasta = `${BASE}/ESCALA DIA 20`
  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  let veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))

  // Variante OCR EFU5704 → EFU5H04
  const placa = 'EFU5H04'
  const v = veiculos.find(v => v.placa_norm === placa)
  if (v) {
    console.log(`\n${placa} dia 20:`)
    const l03 = lojas?.find(l => /Loja\s*0?3\s*-\s*Copacabana\s*I\b/i.test(l.nome))
    const l26 = lojas?.find(l => /Loja\s*26.*Copacabana/i.test(l.nome))
    console.log(`Loja 03: lat=${l03?.lat} lng=${l03?.lng} raio=${l03?.raio_metros}`)
    console.log(`Loja 26: lat=${l26?.lat} lng=${l26?.lng} raio=${l26?.raio_metros}`)
    for (const p of v.paradas) {
      if (p.classificacao === 'BASE' || p.classificacao === 'FAKE_EXIT') continue
      const d03 = l03?.lat && p.lat ? Math.round(Math.sqrt(((p.lat-l03.lat)*111000)**2 + ((p.lng-l03.lng)*111000)**2)) : '?'
      const d26 = l26?.lat && p.lat ? Math.round(Math.sqrt(((p.lat-l26.lat)*111000)**2 + ((p.lng-l26.lng)*111000)**2)) : '?'
      console.log(`  ${fmtT(p.chegada)} → ${fmtT(p.saida)}  ${p.classificacao.padEnd(10)}  dist03=${String(d03).padStart(4)}m dist26=${String(d26).padStart(4)}m`)
    }
  }
})()
