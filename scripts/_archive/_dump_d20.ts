import { lerKpi, normLoja } from './_lib/ler-kpi'

const MAN = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/'
const GER = 'C:/Users/media/Downloads/teste dia 20/'

const REDES: Array<{ id: string; file: string; manFile: string; sheet: string }> = [
  { id: 'ASSAI',     file: 'KPI-ASSAI-2026-05-20 (2).xlsx',     manFile: 'KPI-ASSAI-MANUAL.xlsx',     sheet: '20' },
  { id: 'PREZUNIC',  file: 'KPI-PREZUNIC-2026-05-20 (1).xlsx',  manFile: 'KPI-PREZUNIC-MANUAL.xlsx',  sheet: '20' },
  { id: 'PRINCESA',  file: 'KPI-PRINCESA-2026-05-20 (1).xlsx',  manFile: 'KPI-PRINCESA-MANUAL.xlsx',  sheet: '20' },
  { id: 'SUPERPRIX', file: 'KPI-SUPERPRIX-2026-05-20 (2).xlsx', manFile: 'KPI-SUPERPRIX-MANUAL.xlsx', sheet: '20' },
  { id: 'CARREFOUR', file: 'KPI-CARREFOUR-2026-05-20 (1).xlsx', manFile: 'KPI-CARREFOUR-MANUAL.xlsx', sheet: '20' },
  { id: 'ATACADAO',  file: 'KPI-ATACADAO-2026-05-20 (1).xlsx',  manFile: 'KPI-ATACADAO-MANUAL.xlsx',  sheet: '20' },
  { id: 'ZONA_SUL',  file: 'KPI-ZONA_SUL-2026-05-20 (9).xlsx',  manFile: 'KPI ZONA SUL-MANUAL.xlsx',  sheet: '20' },
]

function toMin(t: string) { const m = t?.match(/^(\d+):(\d+)/); return m ? +m[1]*60 + +m[2] : null }
function diff(a: string, b: string) {
  const da = toMin(a), db = toMin(b)
  if (da == null || db == null) return '?'
  return `${Math.abs(da-db)}min`
}

;(async () => {
  const rede = process.argv[2]?.toUpperCase()
  const target = rede ? REDES.filter(r => r.id === rede) : REDES

  for (const r of target) {
    const [ger, man] = await Promise.all([
      lerKpi(GER + r.file),
      lerKpi(MAN + r.manFile, r.sheet),
    ])
    const byGer = new Map(ger.map(l => [normLoja(l.loja), l]))

    console.log(`\n${'═'.repeat(70)}`)
    console.log(`  ${r.id} — dia 20`)
    console.log('═'.repeat(70))
    console.log(`  ${'LOJA'.padEnd(38)} ${'MAN SC/CHD/SL'.padEnd(18)} SYS SC/CHD/SL       DELTA CHD/SL`)
    console.log('  ' + '─'.repeat(100))

    let ok=0, perto=0, errado=0, sem=0
    for (const m of man) {
      const k = normLoja(m.loja)
      const g = byGer.get(k)
      const mc = m.chd1||'---', ms = m.sl1||'---'
      const gc = g?.chd1||'---', gs = g?.sl1||'---'
      const naoFoi = /N[AÃ]O|SEM|RAST/i.test(mc)||/N[AÃ]O|SEM|RAST/i.test(m.sc1)
      const sysSem = gc==='---'||gc==='SEM'

      const dcm = toMin(mc), dgs = toMin(gc)
      const deltaChd = dcm!=null&&dgs!=null ? Math.abs(dcm-dgs) : 999
      const deltaSl = toMin(ms)!=null&&toMin(gs)!=null ? Math.abs(toMin(ms)!-toMin(gs)!) : 999

      let flag = '  '
      if (naoFoi && sysSem) { flag='✅'; ok++ }
      else if (naoFoi && !sysSem) { flag='❌'; errado++ }
      else if (!g) { flag='❓'; sem++ }
      else if (mc===gc && ms===gs) { flag='✅'; ok++ }
      else if (sysSem) { flag='❌'; errado++ }
      else if (deltaChd<=5 && deltaSl<=10) { flag='⚠️'; perto++ }
      else { flag='❌'; errado++ }

      const lojaStr = m.loja.slice(0,38).padEnd(38)
      const manStr = `${m.sc1||'---'}/${mc}/${ms}`.padEnd(18)
      const sysStr = `${g?.sc1||'---'}/${gc}/${gs}`.padEnd(20)
      const dStr = g && !naoFoi && !sysSem ? `Δ${diff(mc,gc)}/${diff(ms,gs)}` : ''
      console.log(`  ${flag} ${lojaStr} ${manStr} ${sysStr} ${dStr}`)
    }
    console.log(`\n  TOTAL: ${ok}✅ ${perto}⚠️ ${errado}❌ ${sem}❓  ACEITÁVEL: ${ok+perto}/${man.length}`)
  }
})()
