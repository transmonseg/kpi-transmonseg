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
  // Lojas e placas alvo
  const ALVO = [
    { loja: 'Loja 33', placa: 'LCO0978', man: '08:05/08:40' },
    { loja: 'Loja 36', placa: 'LCO0978', man: '06:20/07:55' },
    { loja: 'Loja 01', placa: 'LCO0978', man: '16:30/17:00' },
    { loja: 'Loja 34', placa: 'LJS2172', man: '15:20/15:45' },
    { loja: 'Loja 05', placa: 'LKR5990', man: '21:45/21:55' },
    { loja: 'Loja 03', placa: 'EFU5704', man: '20:20/20:40' },
    { loja: 'Loja 26', placa: 'EFU5704', man: '19:50/20:10' },
  ]

  const pasta = `${BASE}/ESCALA DIA 20`
  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
  let veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))
  if (pdfFile) veiculos.push(...await parseUnitracPdf(readFileSync(`${pasta}/${pdfFile}`), new Set()).catch(() => []))

  const placasUnicas = [...new Set(ALVO.map(a => a.placa))]
  for (const placa of placasUnicas) {
    const v = veiculos.find(v => v.placa_norm === placa)
    const lojasNaPlaca = ALVO.filter(a => a.placa === placa)
    console.log(`\n═══ Placa ${placa} ═══`)
    console.log(`  Escala manual: ${lojasNaPlaca.map(a => `${a.loja}@${a.man}`).join(', ')}`)
    if (!v) {
      console.log(`  GPS dia 20: AUSENTE!`)
      // Procura por variantes OCR
      const variants = veiculos.filter(v => {
        if (!v.placa_norm) return false
        // Verifica diferença em 1-2 chars
        let diff = 0
        for (let i = 0; i < Math.min(placa.length, v.placa_norm.length); i++) {
          if (placa[i] !== v.placa_norm[i]) diff++
        }
        return diff <= 2
      }).slice(0, 5)
      if (variants.length) console.log(`  Possíveis variantes OCR: ${variants.map(v => v.placa_norm).join(', ')}`)
    } else {
      console.log(`  GPS dia 20 — paradas LOJA/FORA_BASE:`)
      for (const p of v.paradas) {
        if (p.classificacao === 'BASE' || p.classificacao === 'FAKE_EXIT') continue
        console.log(`    ${fmtT(p.chegada)} → ${fmtT(p.saida)}  ${p.classificacao.padEnd(10)}  ${p.local_parada?.slice(0,55)}`)
      }
    }
  }
})()
