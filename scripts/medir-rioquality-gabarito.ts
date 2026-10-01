// Mede o xlsx do KPI Rio Quality contra o gabarito do arquivo de 55 colunas
// ("Relatório de Entregas (14)": Check-In + Status da Entrega do app do
// motorista). Logica em src/lib/kpi-rioquality/gabarito.ts (testada). Uso:
//
//   npx tsx scripts/medir-rioquality-gabarito.ts <kpi-rq.xlsx> <entregas-55col.xlsx> [--json saida.json]
//
// Imprime: % das NFs Entregue+check-in que o KPI confirma; erro da CHEGADA NA
// LOJA vs Data Check-In (mediana, p90, % <=10 min); suspeitas (KPI confirma,
// status Devolvido/Faturado); tabela por placa.
import { readFileSync, writeFileSync } from 'fs'
import { parseEntregasCompletas } from '../src/lib/kpi-rioquality/parse-planilhas'
import { lerDetalheKpiXlsx, medirGabarito } from '../src/lib/kpi-rioquality/gabarito'

const pct = (v: number | null) => (v == null ? '-' : `${v.toFixed(1)}%`)
const min = (v: number | null) => (v == null ? '-' : `${v} min`)

async function main() {
  const args = process.argv.slice(2)
  const iJson = args.indexOf('--json')
  const jsonPath = iJson >= 0 ? args[iJson + 1] : null
  const [kpiPath, gabPath] = iJson >= 0 ? args.filter((_, i) => i !== iJson && i !== iJson + 1) : args
  if (!kpiPath || !gabPath) {
    console.error('Uso: npx tsx scripts/medir-rioquality-gabarito.ts <kpi-rq.xlsx> <entregas-55col.xlsx> [--json saida.json]')
    process.exit(1)
  }
  const gab = parseEntregasCompletas(readFileSync(gabPath))
  if (!gab.some(g => g.gabarito && g.nf)) {
    console.error('Arquivo de gabarito sem Nota Fiscal/Status da Entrega (precisa do formato de 55 colunas).')
    process.exit(1)
  }
  const kpi = await lerDetalheKpiXlsx(readFileSync(kpiPath))
  const r = medirGabarito(kpi, gab)
  const g = r.geral
  console.log(`NFs no gabarito: ${g.nfsGabarito} | no KPI: ${kpi.length} | do gabarito fora do KPI: ${g.nfsGabaritoForaDoKpi}`)
  console.log(`Entregue+check-in confirmadas pelo KPI: ${g.confirmadasPeloKpi}/${g.baseEntregueComCheckIn} (${pct(g.pctConfirmadas)})`)
  console.log(`Erro chegada vs check-in (n=${g.erroChegada.n}): mediana ${min(g.erroChegada.medianaMin)}, p90 ${min(g.erroChegada.p90Min)}, <=10 min ${pct(g.erroChegada.pctAte10Min)}`)
  console.log(`Suspeitas (KPI confirma, status Devolvido/Faturado): ${r.suspeitas.length}`)
  for (const s of r.suspeitas) console.log(`  ${s.placa}  NF ${s.nf}  ${s.statusGabarito}${s.motivoDevolucao ? ` (${s.motivoDevolucao})` : ''}  KPI: ${s.statusKpi}`)
  console.log('\nPLACA     BASE  CONF  %CONF   MED   P90  <=10  SUSP')
  for (const p of r.porPlaca) {
    console.log([
      p.placa.padEnd(8), String(p.baseEntregueComCheckIn).padStart(5), String(p.confirmadasPeloKpi).padStart(5),
      pct(p.pctConfirmadas).padStart(6), String(p.erroChegada.medianaMin ?? '-').padStart(5),
      String(p.erroChegada.p90Min ?? '-').padStart(5), pct(p.erroChegada.pctAte10Min).padStart(6), String(p.suspeitas).padStart(5),
    ].join(' '))
  }
  if (jsonPath) writeFileSync(jsonPath, JSON.stringify(r, null, 2))
}

main().catch(e => { console.error(e); process.exit(1) })
