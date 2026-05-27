/**
 * Bug 4B repro — ARMAZEM_GRAO dia 19 placa TML9I75 (POSSE + BOA VISTA)
 *
 * Manual:
 *   POSSE — 14:25/14:55
 *   BOA VISTA — 15:30/15:55
 *
 * Pergunta: existem duas linhas escala mesma placa pra duas lojas distintas
 * — POSSE vem no gerado, BOA VISTA fica vazia. Por quê?
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
  const data = '2026-05-19'
  const pasta = `${BASE}/ESCALA DIA 19`

  // 1. Linhas escala ARMAZEM_GRAO + placa TML9I75
  const { data: escalaLinhas } = await sb.from('escala_linhas')
    .select('id, rede_id, placa_norm, loja_nome_raw, loja_codigo_raw, motorista_nome, carro_ordem, data_entrega, sub_rede')
    .eq('data_entrega', data).eq('rede_id', 'ARMAZEM_GRAO')

  const tml = (escalaLinhas || []).filter(l => l.placa_norm === 'TML9I75')
  console.log('\n=== ESCALA ARMAZEM TML9I75 dia 19 ===')
  for (const l of tml) console.log(`  ${l.id}  loja=${l.loja_nome_raw}  cod=${l.loja_codigo_raw}  ordem=${l.carro_ordem}`)

  // 2. GPS dia 19 TML9I75 + variantes
  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
  const veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))
  if (pdfFile) veiculos.push(...await parseUnitracPdf(readFileSync(`${pasta}/${pdfFile}`), new Set()).catch(() => []))

  const variantes = new Set(variantesOcr('TML9I75'))
  console.log('\n=== Variantes OCR TML9I75:', [...variantes])

  const paradas: any[] = []
  for (const v of veiculos) {
    if (!variantes.has(v.placa_norm)) continue
    for (const p of v.paradas) {
      paradas.push({ ...p, placa_norm: v.placa_norm, id: `${v.placa_norm}-${paradas.length}` })
    }
  }
  console.log(`\n=== PARADAS GPS TML9I75 dia 19 (${paradas.length}) ===`)
  for (const p of paradas) {
    console.log(`  ${fmtT(p.chegada)}-${fmtT(p.saida)}  cls=${p.classificacao}  cod=${p.codigo_loja || '---'}  nome=${(p.nome_loja || '').slice(0, 40)}  local=${(p.local_parada || '').slice(0, 30)}`)
  }

  // 3. Lojas cadastro (precisamos pra rodar matcher)
  const { data: lojas } = await sb.from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)

  // 4. Roda matcher só pra ARMAZEM_GRAO
  const linhasArm = (escalaLinhas as any) || []
  const placasArm = [...new Set(linhasArm.filter((l: any) => l.placa_norm).map((l: any) => l.placa_norm))]
  const placasComVariantes = new Set(placasArm.flatMap((p: any) => variantesOcr(p)))

  // GPS de todas placas armazem
  const todasParadas: any[] = []
  for (const v of veiculos) {
    if (!placasComVariantes.has(v.placa_norm)) continue
    for (const p of v.paradas) {
      todasParadas.push({ ...p, placa_norm: v.placa_norm, id: `${v.placa_norm}-${todasParadas.length}` })
    }
  }

  const rotas = await cruzaEscalaUnitrac(linhasArm, todasParadas as any, lojas as any)

  console.log('\n=== ROTAS gerador ARMAZEM TML9I75 ===')
  for (const r of rotas) {
    const linhaEsc = linhasArm.find((l: any) => l.id === r.escala_linha_id)
    if (linhaEsc?.placa_norm !== 'TML9I75') continue
    const p = r.paradas[0]
    console.log(`  linha=${r.escala_linha_id}  loja_esc=${linhaEsc.loja_nome_raw}  →  ${p ? `${fmtT(p.chegada)}/${fmtT(p.saida)} cod=${p.codigo_loja} nome=${(p.nome_loja || '').slice(0, 30)}` : 'SEM PARADA'}`)
  }

  // Quais linhas TML não receberam rota?
  const linhaIds = new Set(rotas.map(r => r.escala_linha_id))
  const tmlSemRota = tml.filter(l => !linhaIds.has(l.id))
  console.log(`\n=== Linhas TML9I75 SEM rota (${tmlSemRota.length}) ===`)
  for (const l of tmlSemRota) console.log(`  ${l.loja_nome_raw}  cod=${l.loja_codigo_raw}`)

  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
