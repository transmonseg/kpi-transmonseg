/**
 * Bug 3 diagnostic — ZS Loja 47 Catete dia 19, placa LQE5401
 *
 * Esperado: Manual diz CHD=19:40 (entrega noite).
 * Sys diz CHD=11:09 (parada manhã da MESMA placa em outra loja).
 *
 * Hipótese: LQE5401 fez 2+ entregas ZS no mesmo dia. Matcher pega parada errada.
 */
import { readFileSync, readdirSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { cruzaEscalaUnitrac, variantesOcr, scorePair } from '@/lib/kpi/matcher'

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
  const pasta = `${BASE}/ESCALA DIA ${dia}`
  const PLACA_ALVO = 'LQE5401'

  console.log('=' .repeat(80))
  console.log(`DIAGNOSTIC — Bug 3 Multi-trip — ZS Loja 47, placa ${PLACA_ALVO}, dia ${dia}`)
  console.log('=' .repeat(80))

  // 1. Buscar TODA escala da placa LQE5401 (todas redes)
  const { data: linhasPlaca, error: ee } = await sb
    .from('escala_linhas')
    .select('id, rede_id, placa_norm, loja_nome_raw, loja_codigo_raw, motorista_nome, carro_ordem, data_entrega, sub_rede')
    .eq('data_entrega', data)
    .in('placa_norm', variantesOcr(PLACA_ALVO))
  if (ee) { console.error('escala erro:', ee.message); return }
  if (!linhasPlaca?.length) {
    console.log(`Sem escala pra placa ${PLACA_ALVO} dia ${dia}`)
    return
  }

  console.log(`\n--- ESCALA da placa ${PLACA_ALVO} (${linhasPlaca.length} linhas) ---`)
  for (const l of linhasPlaca.sort((a,b) => a.carro_ordem - b.carro_ordem)) {
    console.log(`  ordem=${l.carro_ordem.toString().padStart(2)} rede=${l.rede_id.padEnd(14)} cod=${(l.loja_codigo_raw||'-').padEnd(10)} loja="${l.loja_nome_raw}"`)
  }

  // 2. Buscar GPS LOCAL dia 19 (não está no banco)
  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
  let veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))
  if (pdfFile) veiculos.push(...await parseUnitracPdf(readFileSync(`${pasta}/${pdfFile}`), new Set()).catch(() => []))

  // Flatten paradas e dar IDs estáveis
  const paradas: any[] = []
  for (const v of veiculos) {
    for (const p of v.paradas) {
      paradas.push({ ...p, placa_norm: v.placa_norm, id: `${v.placa_norm}-${paradas.length}` })
    }
  }

  // Paradas da placa alvo
  const variantesPlaca = new Set(variantesOcr(PLACA_ALVO))
  const paradasPlaca = paradas.filter(p => variantesPlaca.has(p.placa_norm))

  console.log(`\n--- GPS — TODAS paradas de ${PLACA_ALVO} (${paradasPlaca.length}) ---`)
  for (const p of paradasPlaca.sort((a,b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime())) {
    console.log(`  ${fmtT(p.chegada)}-${fmtT(p.saida)} class=${p.classificacao.padEnd(10)} cod=${(p.codigo_loja||'-').padEnd(10)} nome="${(p.nome_loja || p.local_parada || '').slice(0, 60)}"`)
  }

  const paradasLoja = paradasPlaca.filter((p: any) => p.classificacao === 'LOJA')
  console.log(`\n  → ${paradasLoja.length} paradas LOJA`)

  // 3. Score matrix — escala × paradas LOJA
  console.log(`\n--- SCORE MATRIX (escala × paradas LOJA, com scoreComRede preliminar) ---`)
  console.log(`  Linhas ordenadas alphabeticamente, paradas cronologicamente`)
  const linhasOrd = [...linhasPlaca].sort((a,b) => a.loja_nome_raw.localeCompare(b.loja_nome_raw))
  const paradasOrd = [...paradasLoja].sort((a,b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime())
  console.log(`\n            ${paradasOrd.map((p: any) => fmtT(p.chegada).padStart(7)).join(' ')}`)
  for (const l of linhasOrd) {
    const row = paradasOrd.map((p: any) => {
      const s = scorePair(l, p)
      return s === Infinity ? '   INF' : s.toFixed(2).padStart(7)
    }).join(' ')
    console.log(`  ${(l.rede_id+'/'+(l.loja_codigo_raw||'-')+' '+l.loja_nome_raw).slice(0, 10).padEnd(10)} ${row}`)
  }

  // 4. Rodar matcher para ver resultado real
  const { data: lojas } = await sb
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)

  // Buscar TODA escala do dia (pra contexto multi-placa)
  const { data: todaEscala } = await sb
    .from('escala_linhas')
    .select('id, rede_id, placa_norm, loja_nome_raw, loja_codigo_raw, motorista_nome, carro_ordem, data_entrega, sub_rede')
    .eq('data_entrega', data)
    .eq('rede_id', 'ZONA_SUL')
  if (!todaEscala) return

  const placasEscala = [...new Set(todaEscala.filter(l => l.placa_norm).map(l => l.placa_norm as string))]
  const placasComVar = new Set(placasEscala.flatMap(p => variantesOcr(p)))
  const paradasRede = paradas.filter(p => placasComVar.has(p.placa_norm))

  const rotas = await cruzaEscalaUnitrac(todaEscala as any, paradasRede as any, lojas as any)

  console.log(`\n--- RESULTADO DO MATCHER para placa ${PLACA_ALVO} ---`)
  for (const l of linhasPlaca) {
    const rota = rotas.find(r => r.escala_linha_id === l.id)
    const p = rota?.paradas[0]
    console.log(`  ordem=${l.carro_ordem} rede=${l.rede_id} cod=${l.loja_codigo_raw||'-'} loja="${l.loja_nome_raw}"`)
    if (p) {
      console.log(`     → match: chegada=${fmtT(p.chegada)} saida=${fmtT(p.saida)} cod_parada=${p.codigo_loja||'-'} nome="${p.nome_loja||p.local_parada||''}"`)
    } else {
      console.log(`     → UNMATCHED`)
    }
  }

  console.log(`\n--- COMPARACAO CHAVE ---`)
  console.log(`  Manual diz: Loja 47 Catete CHD = 19:40 (entrega NOITE)`)
  console.log(`  Sys diz   : Loja 47 Catete CHD = ver acima`)
  console.log(`\n  Esperado: matcher entender que LQE5401 fez Loja XX manha + Loja 47 noite,`)
  console.log(`            e atribuir parada da noite a Loja 47, NÃO a parada da manha.`)

  process.exit(0)
})()
