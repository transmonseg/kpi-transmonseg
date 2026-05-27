import { readFileSync, readdirSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'
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
  const { data: escala } = await sb.from('escala_linhas')
    .select('id, rede_id, placa_norm, loja_nome_raw, loja_codigo_raw, motorista_nome, carro_ordem, data_entrega, sub_rede')
    .eq('rede_id', 'ZONA_SUL').eq('data_entrega', '2026-05-19')

  const pasta = `${BASE}/ESCALA DIA 19`
  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
  let veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))
  if (pdfFile) veiculos.push(...await parseUnitracPdf(readFileSync(`${pasta}/${pdfFile}`), new Set()).catch(() => []))

  const paradas: any[] = []
  for (const v of veiculos) {
    for (const p of v.paradas) {
      paradas.push({ ...p, placa_norm: v.placa_norm, id: `${v.placa_norm}-${paradas.length}` })
    }
  }
  const { data: lojas } = await sb.from('lojas').select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros').eq('ativo', true)

  const rotas = await cruzaEscalaUnitrac(escala as any, paradas, lojas as any)

  console.log('Loja 14 e Loja 31 dia 19 — output matcher:')
  for (const r of rotas) {
    const l = escala!.find(x => x.id === r.escala_linha_id)
    if (!l || !/Loja\s*(14|31)\b/i.test(l.loja_nome_raw || '')) continue
    if (/1\d{2,}/.test(l.loja_nome_raw || '')) continue
    const p = r.paradas[0]
    const sub = (r as any).placa_norm
    console.log(`  ${(l.loja_nome_raw||'').padEnd(40)} placa_esc=${l.placa_norm} → ${p ? `${fmtT(p.chegada)}/${fmtT(p.saida)} (parada_id=${p.parada_id})` : 'SEM_MATCH'}`)
  }

  // Mostra todas paradas em ZS Leblon raio
  const l14 = lojas?.find(l => /^14|14\s*-\s*Z/i.test(l.nome))
  console.log('\nParadas dia 19 dentro de 500m da Loja 14:')
  for (const p of paradas) {
    if (!p.lat || !p.lng || !l14?.lat || !l14?.lng) continue
    const dist = Math.round(Math.sqrt(((p.lat-l14.lat)*111000)**2 + ((p.lng-l14.lng)*111000)**2))
    if (dist <= 500) {
      console.log(`  ${p.placa_norm}  ${fmtT(p.chegada)}/${fmtT(p.saida)}  ${p.classificacao} d=${dist}m ${(p.local_parada||'').slice(0,40)}`)
    }
  }
})()
