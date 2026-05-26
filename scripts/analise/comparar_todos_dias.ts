/**
 * Compara KPIs gerados (pasta "teste dia XX") contra manuais de referência.
 * Uso: npx tsx scripts/analise/comparar_todos_dias.ts [REDE] [DIA]
 *   Ex: npx tsx scripts/analise/comparar_todos_dias.ts ASSAI 19
 *       npx tsx scripts/analise/comparar_todos_dias.ts         (todas as redes e dias)
 */
import { lerKpi, normLoja } from './_lib/ler-kpi'
import { existsSync } from 'fs'

const TESTE_DIR = 'C:/Users/media/Downloads/teste dia '
const MAN_DIR = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/'

// Arquivos gerados por dia e rede
const GERADO: Record<number, Record<string, string>> = {
  19: {
    ASSAI:       'KPI-ASSAI-2026-05-19 (3).xlsx',
    ATACADAO:    'KPI-ATACADAO-2026-05-19 (4).xlsx',
    CARREFOUR:   'KPI-CARREFOUR-2026-05-19 (3).xlsx',
    GUANABARA:   'KPI-GUANABARA-2026-05-19 (7).xlsx',
    PREZUNIC:    'KPI-PREZUNIC-2026-05-19 (3).xlsx',
    PRINCESA:    'KPI-PRINCESA-2026-05-19 (10).xlsx',
    SUPERPRIX:   'KPI-SUPERPRIX-2026-05-19 (3).xlsx',
    ZONA_SUL:    'KPI-ZONA_SUL-2026-05-19 (8).xlsx',
    MUNDIAL:     'KPI-MUNDIAL-2026-05-19 (4).xlsx',
    SENDAS:      'KPI-SENDAS-2026-05-19 (5).xlsx',
    SUPER_PAX:   'KPI-SUPER_PAX-2026-05-19 (3).xlsx',
    FEIRA_NOVA:  'KPI-FEIRA_NOVA-2026-05-19 (4).xlsx',
    VIANENSE:    'KPI-VIANENSE-2026-05-19 (3).xlsx',
    SAMS_CLUB:   'KPI-SAMS_CLUB-2026-05-19 (3).xlsx',
  },
  20: {
    ASSAI:       'KPI-ASSAI-2026-05-20 (2).xlsx',
    ATACADAO:    'KPI-ATACADAO-2026-05-20 (1).xlsx',
    CARREFOUR:   'KPI-CARREFOUR-2026-05-20 (1).xlsx',
    PREZUNIC:    'KPI-PREZUNIC-2026-05-20 (1).xlsx',
    PRINCESA:    'KPI-PRINCESA-2026-05-20 (1).xlsx',
    SUPERPRIX:   'KPI-SUPERPRIX-2026-05-20 (2).xlsx',
    ZONA_SUL:    'KPI-ZONA_SUL-2026-05-20 (9).xlsx',
    GUANABARA:   'KPI-GUANABARA-2026-05-20 (1).xlsx',
    ARMAZEM_GRAO:'KPI-ARMAZEM_GRAO-2026-05-20 (2).xlsx',
    MUNDIAL:     'KPI-MUNDIAL-2026-05-20 (1).xlsx',
    SENDAS:      'KPI-SENDAS-2026-05-20 (1).xlsx',
    SUPER_PAX:   'KPI-SUPER_PAX-2026-05-20 (1).xlsx',
    FEIRA_NOVA:  'KPI-FEIRA_NOVA-2026-05-20 (1).xlsx',
    VIANENSE:    'KPI-VIANENSE-2026-05-20 (1).xlsx',
    SAMS_CLUB:   'KPI-SAMS_CLUB-2026-05-20 (1).xlsx',
  },
  21: {
    ASSAI:       'KPI-ASSAI-2026-05-21.xlsx',
    ATACADAO:    'KPI-ATACADAO-2026-05-21.xlsx',
    CARREFOUR:   'KPI-CARREFOUR-2026-05-21.xlsx',
    PREZUNIC:    'KPI-PREZUNIC-2026-05-21.xlsx',
    PRINCESA:    'KPI-PRINCESA-2026-05-21.xlsx',
    SUPERPRIX:   'KPI-SUPERPRIX-2026-05-21.xlsx',
    ZONA_SUL:    'KPI-ZONA_SUL-2026-05-21 (1).xlsx',
    ARMAZEM_GRAO:'KPI-ARMAZEM_GRAO-2026-05-21 (3).xlsx',
    MUNDIAL:     'KPI-MUNDIAL-2026-05-21.xlsx',
    SENDAS:      'KPI-SENDAS-2026-05-21.xlsx',
    SUPER_PAX:   'KPI-SUPER_PAX-2026-05-21.xlsx',
    FEIRA_NOVA:  'KPI-FEIRA_NOVA-2026-05-21.xlsx',
    VIANENSE:    'KPI-VIANENSE-2026-05-21.xlsx',
    SAMS_CLUB:   'KPI-SAMS_CLUB-2026-05-21.xlsx',
    SUPERPRIX:   'KPI-SUPERPRIX-2026-05-21.xlsx',
  },
}

// Manuais de referência — arquivo + nome da aba por dia
const MANUAL: Record<string, { file: string; sheet?: Record<number, string> }> = {
  ASSAI:       { file: 'KPI-ASSAI-MANUAL.xlsx' },
  ATACADAO:    { file: 'KPI-ATACADAO-MANUAL.xlsx' },
  CARREFOUR:   { file: 'KPI-CARREFOUR-MANUAL.xlsx' },
  GUANABARA:   { file: 'KPI-GUANABARA-MANUAL.xlsx', sheet: { 19: '19', 20: undefined as any, 21: '21' } },
  PREZUNIC:    { file: 'KPI-PREZUNIC-MANUAL.xlsx' },
  PRINCESA:    { file: 'KPI-PRINCESA-MANUAL.xlsx' },
  SUPERPRIX:   { file: 'KPI-SUPERPRIX-MANUAL.xlsx' },
  ZONA_SUL:    { file: 'KPI ZONA SUL-MANUAL.xlsx' },
  ARMAZEM_GRAO:{ file: 'KPI-ARMAZEM_GRAO-MANUAL.xlsx' },
}

function toMin(t: string): number | null {
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null
}

async function compararRede(rede: string, dia: number): Promise<{ ok: number; parcial: number; erro: number; sem: number; total: number }> {
  const man = MANUAL[rede]
  if (!man) return { ok: 0, parcial: 0, erro: 0, sem: 0, total: 0 }

  const sheet = man.sheet ? man.sheet[dia] : String(dia)
  if (!sheet) return { ok: 0, parcial: 0, erro: 0, sem: 0, total: 0 } // aba não disponível

  const gerFile = GERADO[dia]?.[rede]
  if (!gerFile) return { ok: 0, parcial: 0, erro: 0, sem: 0, total: 0 }

  const gerPath = `${TESTE_DIR}${dia}/${gerFile}`
  const manPath = `${MAN_DIR}${man.file}`
  if (!existsSync(gerPath)) { console.log(`    ⚠️  Gerado não encontrado: ${gerPath}`); return { ok: 0, parcial: 0, erro: 0, sem: 0, total: 0 } }
  if (!existsSync(manPath)) { console.log(`    ⚠️  Manual não encontrado: ${manPath}`); return { ok: 0, parcial: 0, erro: 0, sem: 0, total: 0 } }

  const [linhasGer, linhasMan] = await Promise.all([
    lerKpi(gerPath),
    lerKpi(manPath, sheet),
  ])

  const byGer = new Map(linhasGer.map(l => [normLoja(l.loja), l]))
  let ok = 0, parcial = 0, erro = 0, sem = 0

  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v')

  for (const m of linhasMan) {
    const k = normLoja(m.loja)
    const g = byGer.get(k)

    // Decide usando 1º carro; se sistema não tem esse carro, checar 2º
    const manChd = m.chd1 || m.chd2 || '---'
    const manSl = m.sl1 || m.sl2 || '---'
    const sysChd = g?.chd1 || '---'
    const sysSl = g?.sl1 || '---'
    const sysChd2 = g?.chd2 || '---'
    const sysSl2 = g?.sl2 || '---'

    const naoFoi = /N[AÃ]O|SEM|RAST/i.test(manChd) || /N[AÃ]O|SEM|RAST/i.test(m.sc1)
    const sysSem = sysChd === '---' || sysChd === 'SEM'

    if (naoFoi) {
      if (sysSem) {
        ok++
        if (verbose) console.log(`    ✅ ${m.loja.slice(0, 40).padEnd(40)} ambos sem entrega`)
      } else {
        erro++
        if (verbose) console.log(`    ❌ ${m.loja.slice(0, 40).padEnd(40)} sys=${sysChd}/${sysSl}  man=não_foi`)
      }
      continue
    }

    if (!g) {
      sem++
      if (verbose) console.log(`    ❓ ${m.loja.slice(0, 40).padEnd(40)} SÓ_MANUAL man=${manChd}/${manSl}`)
      continue
    }

    // Tenta match carro1 ou carro2
    const chdM = toMin(manChd)
    const slM = toMin(manSl)
    const chdG1 = toMin(sysChd)
    const slG1 = toMin(sysSl)
    const chdG2 = toMin(sysChd2)
    const slG2 = toMin(sysSl2)

    const diff1Chd = chdM !== null && chdG1 !== null ? Math.abs(chdM - chdG1) : 999
    const diff1Sl = slM !== null && slG1 !== null ? Math.abs(slM - slG1) : 999
    const diff2Chd = chdM !== null && chdG2 !== null ? Math.abs(chdM - chdG2) : 999
    const diff2Sl = slM !== null && slG2 !== null ? Math.abs(slM - slG2) : 999

    const exactMatch1 = sysChd === manChd && sysSl === manSl
    const exactMatch2 = sysChd2 === manChd && sysSl2 === manSl
    const close1 = diff1Chd <= 5 && diff1Sl <= 10
    const close2 = diff2Chd <= 5 && diff2Sl <= 10

    if (exactMatch1 || exactMatch2) {
      ok++
      if (verbose) console.log(`    ✅ ${m.loja.slice(0, 40).padEnd(40)} ${manChd}/${manSl}`)
    } else if (sysSem) {
      erro++
      if (verbose) console.log(`    ❌ ${m.loja.slice(0, 40).padEnd(40)} sys=---  man=${manChd}/${manSl}`)
    } else if (close1 || close2) {
      const used = close1 ? { chd: sysChd, sl: sysSl, dChd: diff1Chd, dSl: diff1Sl } : { chd: sysChd2, sl: sysSl2, dChd: diff2Chd, dSl: diff2Sl }
      parcial++
      if (verbose) console.log(`    ⚠️ ${m.loja.slice(0, 40).padEnd(40)} sys=${used.chd}/${used.sl}  man=${manChd}/${manSl}  Δ=${used.dChd}/${used.dSl}min`)
    } else {
      erro++
      if (verbose) console.log(`    ❌ ${m.loja.slice(0, 40).padEnd(40)} sys=${sysChd}/${sysSl}  man=${manChd}/${manSl}`)
    }
  }

  return { ok, parcial, erro, sem, total: linhasMan.length }
}

;(async () => {
  const redeArg = process.argv[2]?.toUpperCase()
  const diaArg = process.argv[3] ? parseInt(process.argv[3]) : undefined

  const redesParaRodar = redeArg ? [redeArg] : Object.keys(MANUAL)
  const diasParaRodar = diaArg ? [diaArg] : [19, 20, 21]

  const totais: Record<string, { ok: number; parcial: number; erro: number; sem: number; total: number }> = {}

  for (const dia of diasParaRodar) {
    console.log(`\n${'═'.repeat(60)}`)
    console.log(`  DIA ${dia}/05/2026`)
    console.log('═'.repeat(60))

    for (const rede of redesParaRodar) {
      const r = await compararRede(rede, dia)
      if (r.total === 0) continue

      const pct = Math.round((r.ok / r.total) * 100)
      const bar = `${r.ok}✅ ${r.parcial}⚠️ ${r.erro}❌ ${r.sem}❓`
      console.log(`  ${rede.padEnd(14)} ${String(r.ok).padStart(3)}/${r.total} (${String(pct).padStart(3)}%)  ${bar}`)

      const key = `${rede}_${dia}`
      totais[key] = r
    }
  }

  // Resumo global
  if (redesParaRodar.length > 1) {
    let gOk = 0, gParcial = 0, gErro = 0, gSem = 0, gTotal = 0
    for (const v of Object.values(totais)) {
      gOk += v.ok; gParcial += v.parcial; gErro += v.erro; gSem += v.sem; gTotal += v.total
    }
    console.log('\n' + '═'.repeat(60))
    console.log(`  TOTAL GERAL: ${gOk}/${gTotal} (${Math.round(gOk/gTotal*100)}%) ✅   ${gParcial}⚠️  ${gErro}❌  ${gSem}❓ sem_manual`)
    console.log('═'.repeat(60))
  }
})()
