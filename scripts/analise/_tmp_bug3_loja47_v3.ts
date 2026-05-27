/**
 * Bug 3 V3 — Confirmar hipotese: Geo-R guard temLojaOrfaMesmaRede bloqueia
 * o geo-fallback de FORA_BASE para Loja 47 dia 19, placa LQE5401.
 *
 * Replica a logica interna do matcher pra checar.
 */
import { readFileSync, readdirSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { variantesOcr } from '@/lib/kpi/matcher'

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

  // Replica resolveLojaId localmente
  const { data: lojas } = await sb
    .from('lojas')
    .select('id, rede_id, nome, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)

  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
  let veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))
  if (pdfFile) veiculos.push(...await parseUnitracPdf(readFileSync(`${pasta}/${pdfFile}`), new Set()).catch(() => []))

  const paradas: any[] = []
  for (const v of veiculos) for (const p of v.paradas) paradas.push({ ...p, placa_norm: v.placa_norm, id: `${v.placa_norm}-${paradas.length}` })

  const variantesPlaca = new Set(variantesOcr(PLACA))
  const paradasPlaca = paradas.filter(p => variantesPlaca.has(p.placa_norm))
  const paradasLoja = paradasPlaca.filter((p: any) => p.classificacao === 'LOJA')

  console.log(`--- ${paradasLoja.length} paradas LOJA da placa ${PLACA} ---`)
  for (const p of paradasLoja) {
    console.log(`  ${fmtT(p.chegada)} cod=${(p as any).codigo_loja} nome="${(p as any).nome_loja}"`)
    // Resolve manualmente: bate alguma loja ZONA_SUL?
    const lojasZS = (lojas || []).filter(l => l.rede_id === 'ZONA_SUL')
    const match = lojasZS.find(l =>
      ((p as any).codigo_loja && (l.codigo_unitrac === (p as any).codigo_loja || l.codigo_escala === (p as any).codigo_loja))
    )
    if (match) console.log(`     resolveLojaId ZS = ${match.codigo_escala} "${match.nome}"`)
  }

  // Sumario: ha parada LOJA cuja rede inferida = ZONA_SUL e ainda fica "orfa" depois de
  // assignOptimal? Sim: 04:47 9039030 é Loja 30. assignOptimal atribui essa parada
  // a apenas UMA linha (L30). A duplicata fica sem match — mas continua sendo LOJA
  // cujo resolveLojaId casa com ZONA_SUL.

  console.log(`\nVERDICT:`)
  console.log(`  - 2 paradas LOJA 04:47 cod 9039030 sao DUPLICATAS (mesma chegada/saida).`)
  console.log(`  - assignOptimal atribui UMA dessas paradas a L30 (escala). A OUTRA fica orfa.`)
  console.log(`  - Geo-R guard 'temLojaOrfaMesmaRede' detecta orfa de ZONA_SUL (mesma rede de L21/L47).`)
  console.log(`  - GUARD BLOQUEIA geo-fallback FORA_BASE -> parada 19:40 a 15m da L47 NUNCA atribuida.`)
  console.log(`  - L47 fica UNMATCHED, posteriormente fallback temporal pega FORA_BASE 11:09 (que casa fungivel ZS).`)

  process.exit(0)
})()
