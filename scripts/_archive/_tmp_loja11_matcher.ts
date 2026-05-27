import { readFileSync, readdirSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { cruzaEscalaUnitrac, variantesOcr } from '@/lib/kpi/matcher'
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
    .eq('rede_id', 'ZONA_SUL').eq('data_entrega', '2026-05-20')

  const pasta = `${BASE}/ESCALA DIA 20`
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

  // Filtra por Loja 11
  console.log('Loja 11 dia 20 — output matcher:')
  for (const r of rotas) {
    const l = escala!.find(x => x.id === r.escala_linha_id)
    if (!l || !/Loja\s*11\b/i.test(l.loja_nome_raw || '')) continue
    const p = r.paradas[0]
    console.log(`  ${(l.loja_nome_raw||'').padEnd(40)} placa=${l.placa_norm?.padEnd(8)} → ${p ? fmtT(p.chegada)+'/'+fmtT(p.saida) : 'SEM_MATCH'}`)
  }
})()
