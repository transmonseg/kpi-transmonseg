/**
 * Reproducao DO regerar_local mas focando em LQE5401 ZS only
 */
import { readFileSync, readdirSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { cruzaEscalaUnitrac, variantesOcr } from '@/lib/kpi/matcher'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

function fmtT(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}`
}

;(async () => {
  const dia = '19'
  const data = `2026-05-${dia}`
  const PLACA = 'LQE5401'
  const pasta = `${BASE}/ESCALA DIA ${dia}`

  const { data: linhas } = await sb
    .from('escala_linhas')
    .select('id, rede_id, placa_norm, loja_nome_raw, loja_codigo_raw, motorista_nome, carro_ordem, data_entrega, sub_rede')
    .eq('data_entrega', data)
    .eq('rede_id', 'ZONA_SUL')
  console.log(`Total linhas ZS: ${linhas?.length}`)

  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
  let veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))
  if (pdfFile) veiculos.push(...await parseUnitracPdf(readFileSync(`${pasta}/${pdfFile}`), new Set()).catch(() => []))

  const paradas: any[] = []
  for (const v of veiculos) for (const p of v.paradas) paradas.push({ ...p, placa_norm: v.placa_norm, id: `${v.placa_norm}-${paradas.length}` })

  const placasEscala = [...new Set(linhas?.filter(l => l.placa_norm).map(l => l.placa_norm as string))]
  const placas = new Set(placasEscala.flatMap(p => variantesOcr(p)))
  const paradasRede = paradas.filter(p => placas.has(p.placa_norm))

  const { data: lojas } = await sb
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)

  const rotas = await cruzaEscalaUnitrac(linhas! as any, paradasRede as any, lojas! as any)
  // Show LQE5401 linhas
  const linhasPlaca = linhas!.filter(l => variantesOcr(PLACA).includes(l.placa_norm || ''))
  console.log(`\n--- LQE5401 linhas ZS apenas ---`)
  for (const l of linhasPlaca) {
    const r = rotas.find(r => r.escala_linha_id === l.id)
    const p = r?.paradas[0]
    console.log(`  cod=${l.loja_codigo_raw} loja="${l.loja_nome_raw}" → chd=${p ? fmtT(p.chegada) : '---'} sl=${p ? fmtT(p.saida) : '---'}`)
  }
  process.exit(0)
})()
