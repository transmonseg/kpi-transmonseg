import { readFileSync, readdirSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { variantesOcr } from '@/lib/kpi/matcher'
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
  const l14 = lojas?.find((l: any) => /^14|14\s*-\s*Z|Loja\s*14/i.test(l.nome))
  const l31 = lojas?.find((l: any) => /Loja\s*31|^31\s*-/i.test(l.nome))

  const pasta = `${BASE}/ESCALA DIA 19`
  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
  let veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))
  if (pdfFile) veiculos.push(...await parseUnitracPdf(readFileSync(`${pasta}/${pdfFile}`), new Set()).catch(() => []))

  console.log(`Loja 14: lat=${l14?.lat} lng=${l14?.lng} raio=${l14?.raio_metros}`)
  console.log(`Loja 31: lat=${l31?.lat} lng=${l31?.lng} raio=${l31?.raio_metros}`)

  for (const placa of ['UBO5E05', 'DBB8D19', 'LTE0A64']) {
    const variantes = variantesOcr(placa)
    for (const variant of variantes) {
      const v = veiculos.find(v => v.placa_norm === variant)
      if (!v) continue
      console.log(`\n${variant} dia 19 (${v.paradas.length} paradas):`)
      for (const p of v.paradas) {
        if (p.classificacao === 'BASE' || p.classificacao === 'FAKE_EXIT') continue
        const d14 = l14?.lat && p.lat ? Math.round(Math.sqrt(((p.lat-l14.lat)*111000)**2 + ((p.lng-l14.lng)*111000)**2)) : '?'
        const d31 = l31?.lat && p.lat ? Math.round(Math.sqrt(((p.lat-l31.lat)*111000)**2 + ((p.lng-l31.lng)*111000)**2)) : '?'
        console.log(`  ${fmtT(p.chegada)} → ${fmtT(p.saida)}  ${p.classificacao.padEnd(10)} d14=${String(d14).padStart(5)}m d31=${String(d31).padStart(5)}m ${p.local_parada?.slice(0,40)}`)
      }
    }
  }
})()
