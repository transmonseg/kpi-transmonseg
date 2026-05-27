import { readFileSync, readdirSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
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
  const recreio = lojas?.find(l => /recreio/i.test(l.nome))
  const vilar = lojas?.find(l => /vilar.*teles|teles/i.test(l.nome))

  const pasta20 = `${BASE}/ESCALA DIA 20`
  const files = readdirSync(pasta20)
  const geralFile = files.find(f => /ESCALA GERAL/i.test(f) && f.endsWith('.xlsx'))!
  const escala = await parseEscalaGeral(readFileSync(`${pasta20}/${geralFile}`), '2026-05-20')

  for (const [nome, loja] of [['RECREIO', recreio], ['VILAR DOS TELES', vilar]] as const) {
    console.log(`\n═══ ${nome} ═══`)
    console.log(`Loja: ${loja?.nome}  raio=${loja?.raio_metros}m`)
    const lines = escala.filter(l => l.rede_id === 'PREZUNIC' && new RegExp(nome.replace(' ', '.*'), 'i').test(l.loja_nome_raw || ''))
    for (const l of lines) console.log(`  Escala: ${l.loja_nome_raw}  placa=${l.placa_norm}`)

    const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
    const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
    let veiculos: any[] = []
    if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta20}/${xlsxFile}`)))
    if (pdfFile) veiculos.push(...await parseUnitracPdf(readFileSync(`${pasta20}/${pdfFile}`), new Set()).catch(() => []))

    const placas = new Set(lines.map(l => l.placa_norm).filter(Boolean))
    for (const v of veiculos) {
      if (!placas.has(v.placa_norm)) continue
      console.log(`\nGPS ${v.placa_norm} — 04-13h:`)
      for (const p of v.paradas) {
        const h = new Date(p.chegada).getUTCHours()
        if (h < 4 || h > 13) continue
        const dist = loja?.lat && p.lat ? Math.round(Math.sqrt(((p.lat-loja.lat)*111000)**2 + ((p.lng-loja.lng)*111000)**2)) : '?'
        console.log(`  ${fmtT(p.chegada)} → ${fmtT(p.saida)} ${p.classificacao.padEnd(10)} dur=${Math.round((p.duracao_seg||0)/60)}min dist≈${String(dist).padStart(5)}m local=${p.local_parada?.slice(0,30)}`)
      }
    }
  }
})()
