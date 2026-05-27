/**
 * KQR2J11 dia 19 — escala completa + roda matcher
 */
import { readFileSync, readdirSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseUnitrac } from '@/lib/parsers/unitrac'
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

  // Toda a escala que envolva ZS Loja 07 OU placa KQR2J11
  const { data: escalaLinhas } = await sb.from('escala_linhas')
    .select('id, rede_id, placa_norm, loja_nome_raw, loja_codigo_raw, motorista_nome, carro_ordem, data_entrega')
    .eq('data_entrega', data)

  const todasLoja07 = (escalaLinhas || []).filter((l: any) =>
    l.rede_id === 'ZONA_SUL' && /Loja 07/i.test(l.loja_nome_raw || ''))
  console.log('=== TODAS LINHAS ZS Loja 07 dia 19 ===')
  for (const l of todasLoja07) console.log(`  ${l.id} placa=${l.placa_norm} loja=${l.loja_nome_raw} ordem=${l.carro_ordem}`)

  const linhasKqr = (escalaLinhas || []).filter((l: any) => l.placa_norm === 'KQR2J11')
  console.log('\n=== ESCALA KQR2J11 (todas redes) ===')
  for (const l of linhasKqr) console.log(`  ${l.rede_id}  ${l.loja_nome_raw}  cod=${l.loja_codigo_raw}  ordem=${l.carro_ordem}`)

  // Roda matcher com TODAS as linhas de TODAS as redes que tem placa KQR2J11
  const todasRedes = [...new Set(linhasKqr.map((l: any) => l.rede_id))]
  const linhasMix = (escalaLinhas || []).filter((l: any) =>
    todasRedes.includes(l.rede_id) || todasLoja07.some(x => x.id === l.id)
  )
  const placasMix = [...new Set(linhasMix.filter((l: any) => l.placa_norm).map((l: any) => l.placa_norm))]

  const { data: lojas } = await sb.from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)

  const pasta = `${BASE}/ESCALA DIA 19`
  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))

  const placasComVar = new Set(placasMix.flatMap((p: any) => variantesOcr(p)))
  const paradas: any[] = []
  for (const v of veiculos) {
    if (!placasComVar.has(v.placa_norm)) continue
    for (const p of v.paradas) paradas.push({ ...p, placa_norm: v.placa_norm, id: `${v.placa_norm}-${paradas.length}` })
  }

  // Roda apenas para a rede ZONA_SUL (como regerar_local faz)
  const linhasZs = (escalaLinhas || []).filter((l: any) => l.rede_id === 'ZONA_SUL')
  const placasZs = [...new Set(linhasZs.filter((l: any) => l.placa_norm).map((l: any) => l.placa_norm))]
  const placasZsVar = new Set(placasZs.flatMap((p: any) => variantesOcr(p)))
  const paradasZs: any[] = []
  for (const v of veiculos) {
    if (!placasZsVar.has(v.placa_norm)) continue
    for (const p of v.paradas) paradasZs.push({ ...p, placa_norm: v.placa_norm, id: `${v.placa_norm}-${paradasZs.length}` })
  }

  const rotasZs = await cruzaEscalaUnitrac(linhasZs as any, paradasZs as any, lojas as any)
  console.log('\n=== ROTAS ZONA_SUL gerador (KQR2J11) ===')
  for (const r of rotasZs) {
    const linha = linhasZs.find((l: any) => l.id === r.escala_linha_id)
    if (linha?.placa_norm !== 'KQR2J11') continue
    const p = r.paradas[0]
    console.log(`  loja_esc=${linha.loja_nome_raw}  →  ${p ? `${fmtT(p.chegada)}/${fmtT(p.saida)} cod=${p.codigo_loja||'---'} nome=${(p.nome_loja||'').slice(0,30)}` : 'SEM PARADA'}`)
  }
  // Linhas KQR ZS sem rota
  const rotasMap = new Map(rotasZs.map(r => [r.escala_linha_id, r]))
  const linhasKqrZs = linhasZs.filter((l: any) => l.placa_norm === 'KQR2J11')
  for (const l of linhasKqrZs) {
    if (!rotasMap.has(l.id)) {
      console.log(`  loja_esc=${l.loja_nome_raw}  →  SEM ROTA EMITIDA`)
    }
  }

  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
