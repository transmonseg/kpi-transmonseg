/**
 * Simula 'processar_kpi' usando dados do banco (escala) + GPS local + matcher.
 * Imprime comparação contra manual.
 *
 * Uso: npx tsx scripts/analise/regerar_local.ts <DIA> [REDE]
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { cruzaEscalaUnitrac, variantesOcr } from '@/lib/kpi/matcher'
import { lerKpi, normLoja } from './_lib/ler-kpi'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const MAN_DIR = `${BASE}/INTENSIVA/KPIS_MANUAIS_REFERENCIA/`
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const MANUAL: Record<string, { file: string; sheet?: Record<number, string> }> = {
  ASSAI:        { file: 'KPI-ASSAI-MANUAL.xlsx' },
  ATACADAO:     { file: 'KPI-ATACADAO-MANUAL.xlsx' },
  CARREFOUR:    { file: 'KPI-CARREFOUR-MANUAL.xlsx' },
  GUANABARA:    { file: 'KPI-GUANABARA-MANUAL.xlsx', sheet: { 19: '19', 21: '21' } },
  PREZUNIC:     { file: 'KPI-PREZUNIC-MANUAL.xlsx' },
  PRINCESA:     { file: 'KPI-PRINCESA-MANUAL.xlsx' },
  SUPERPRIX:    { file: 'KPI-SUPERPRIX-MANUAL.xlsx' },
  ZONA_SUL:     { file: 'KPI ZONA SUL-MANUAL.xlsx' },
  ARMAZEM_GRAO: { file: 'KPI-ARMAZEM_GRAO-MANUAL.xlsx' },
}

function fmtT(d: Date | string | null): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}`
}

function toMin(t: string): number | null {
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  return m ? parseInt(m[1])*60 + parseInt(m[2]) : null
}

;(async () => {
  const diaArg = process.argv[2]
  const redeArg = process.argv[3]?.toUpperCase()
  if (!diaArg) { console.log('Uso: tsx regerar_local.ts <DIA> [REDE]'); return }

  const data = `2026-05-${diaArg.padStart(2,'0')}`
  const pasta = `${BASE}/ESCALA DIA ${diaArg}`

  // 1. Fetch escala do banco
  let q = sb.from('escala_linhas').select('id, rede_id, placa_norm, loja_nome_raw, loja_codigo_raw, motorista_nome, carro_ordem, data_entrega, sub_rede').eq('data_entrega', data)
  if (redeArg) q = q.eq('rede_id', redeArg)
  const { data: escalaLinhas, error: ee } = await q
  if (ee) { console.error('escala erro:', ee.message); return }
  if (!escalaLinhas?.length) { console.log(`Sem escala data_entrega=${data}`); return }

  // 2. Lê GPS local
  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
  let veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))
  if (pdfFile) veiculos.push(...await parseUnitracPdf(readFileSync(`${pasta}/${pdfFile}`), new Set()).catch(() => []))

  // Flat paradas
  const paradas: any[] = []
  for (const v of veiculos) {
    for (const p of v.paradas) {
      paradas.push({ ...p, placa_norm: v.placa_norm, id: `${v.placa_norm}-${paradas.length}` })
    }
  }

  // 3. Lê cadastro de lojas
  const { data: lojas } = await sb.from('lojas').select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros').eq('ativo', true)

  // Group by rede
  const redes = [...new Set(escalaLinhas.map(l => l.rede_id))].sort()
  const redesAlvo = redeArg ? [redeArg] : redes.filter(r => MANUAL[r])

  let gOk = 0, gParcial = 0, gErro = 0, gSem = 0, gTotal = 0
  for (const rede of redesAlvo) {
    const linhasRede = escalaLinhas.filter(l => l.rede_id === rede)
    const placasEscala = [...new Set(linhasRede.filter(l => l.placa_norm).map(l => l.placa_norm as string))]
    const placas = new Set(placasEscala.flatMap(p => variantesOcr(p)))
    const paradasRede = paradas.filter(p => placas.has(p.placa_norm))

    const rotas = await cruzaEscalaUnitrac(linhasRede as any, paradasRede as any, lojas as any)

    // Index by escala_linha_id → output
    const outByLinha = new Map<string, { chd: string; sl: string }>()
    for (const r of rotas) {
      const p = r.paradas[0]
      outByLinha.set(r.escala_linha_id as string, {
        chd: p ? fmtT(p.chegada) : '---',
        sl: p ? fmtT(p.saida) : '---',
      })
    }

    // Lê manual
    const man = MANUAL[rede]
    if (!man) continue
    const sheet = man.sheet?.[parseInt(diaArg)] ?? String(diaArg)
    const manPath = `${MAN_DIR}${man.file}`
    if (!existsSync(manPath)) continue
    const manLinhas = await lerKpi(manPath, sheet)

    // Multi-linha por loja: agrupa outputs sys por nome de loja (manual pode ter
    // 2 entregas pra mesma loja — Loja 07 KQR2J11+KWK4593). Pareia por proximidade
    // de horário (manual vs sys).
    const sysOutsByLoja = new Map<string, { chd: string; sl: string }[]>()
    for (const l of linhasRede) {
      const out = outByLinha.get(l.id)
      if (!out) continue
      const k = normLoja(l.loja_nome_raw || '')
      const arr = sysOutsByLoja.get(k) ?? []
      arr.push(out)
      sysOutsByLoja.set(k, arr)
    }

    let ok = 0, parcial = 0, erro = 0, sem = 0
    const verbose = process.argv.includes('-v')
    // Tracking pra parear múltiplas linhas com mesma loja
    const sysUsedByLoja = new Map<string, Set<number>>()
    for (const m of manLinhas) {
      const k = normLoja(m.loja)
      const allOuts = sysOutsByLoja.get(k) ?? []
      // Pega o output mais próximo do manual que ainda não foi usado
      const used = sysUsedByLoja.get(k) ?? new Set<number>()
      const manChdMin = toMin(m.chd1 || '---')
      let bestIdx = -1
      let bestDiff = Infinity
      for (let i = 0; i < allOuts.length; i++) {
        if (used.has(i)) continue
        const cMin = toMin(allOuts[i].chd)
        const diff = manChdMin !== null && cMin !== null ? Math.abs(manChdMin - cMin) : 0
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i }
      }
      const sysOut = bestIdx >= 0 ? allOuts[bestIdx] : undefined
      if (bestIdx >= 0) { used.add(bestIdx); sysUsedByLoja.set(k, used) }
      const sysChd = sysOut?.chd ?? '---'
      const sysSl = sysOut?.sl ?? '---'
      const manChd = m.chd1 || '---'
      const manSl = m.sl1 || '---'
      const naoFoi = /N[AÃ]O|SEM|RAST/i.test(manChd) || /N[AÃ]O|SEM|RAST/i.test(m.sc1 || '')
      // BLANK_OK: manual com CHD/SL em branco (Tia Érica não anotou tempos) — sys preenche via GPS
      const manBlank = manChd === '---' && manSl === '---'
      const sysSem = sysChd === '---'
      if (manBlank) {
        ok++
        if (verbose) console.log(`    ✓ ${m.loja.slice(0,40).padEnd(40)} manual em branco sys=${sysChd}/${sysSl}`)
        continue
      }
      if (naoFoi) {
        if (sysSem) { ok++; if (verbose) console.log(`    ✅ ${m.loja.slice(0,40).padEnd(40)} ambos sem`) }
        else { erro++; if (verbose) console.log(`    ❌ ${m.loja.slice(0,40).padEnd(40)} sys=${sysChd}/${sysSl} man=NAO`) }
      } else if (sysSem) {
        sem++
        if (verbose) console.log(`    ❓ ${m.loja.slice(0,40).padEnd(40)} sys=--- man=${manChd}/${manSl}`)
      } else {
        const dChd = toMin(manChd)!=null && toMin(sysChd)!=null ? Math.abs(toMin(manChd)!-toMin(sysChd)!) : 999
        const dSl = toMin(manSl)!=null && toMin(sysSl)!=null ? Math.abs(toMin(manSl)!-toMin(sysSl)!) : 999
        if (sysChd === manChd && sysSl === manSl) { ok++; if (verbose) console.log(`    ✅ ${m.loja.slice(0,40).padEnd(40)} ${manChd}/${manSl}`) }
        else if (dChd <= 7 && dSl <= 10) { parcial++; if (verbose) console.log(`    ⚠️ ${m.loja.slice(0,40).padEnd(40)} sys=${sysChd}/${sysSl} man=${manChd}/${manSl} Δ${dChd}/${dSl}`) }
        else { erro++; if (verbose) console.log(`    ❌ ${m.loja.slice(0,40).padEnd(40)} sys=${sysChd}/${sysSl} man=${manChd}/${manSl}`) }
      }
    }
    const total = manLinhas.length
    const pct = Math.round((ok/total)*100)
    console.log(`  ${rede.padEnd(14)} ${String(ok).padStart(3)}/${total} (${String(pct).padStart(3)}%)  ${ok}✅ ${parcial}⚠️ ${erro}❌ ${sem}❓`)
    gOk += ok; gParcial += parcial; gErro += erro; gSem += sem; gTotal += total
  }
  console.log(`\n  TOTAL DIA ${diaArg}: ${gOk}/${gTotal} (${Math.round(gOk/gTotal*100)}%) ✅  ${gParcial}⚠️  ${gErro}❌  ${gSem}❓`)
})()
