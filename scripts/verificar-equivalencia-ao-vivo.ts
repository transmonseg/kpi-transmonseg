// Prova da spec do KPI ao vivo (2026-10-06): gerar a partir dos dados
// guardados (passados por JSON, como ficam no banco) dá o MESMO resultado que
// gerar a partir dos PDFs. Sai com 1 se houver qualquer diferença.
// Uso: npx tsx --env-file=.env.production scripts/verificar-equivalencia-ao-vivo.ts <escala.pdf> <romaneio.pdf> <data> [pao.pdf]
import { readFileSync } from 'fs'
import { parseEscala } from '../src/lib/kpi-romaneio/parse-escala'
import { parseRomaneio } from '../src/lib/kpi-romaneio/parse-romaneio'
import { parsePao } from '../src/lib/kpi-romaneio/parse-pao'
import { gerarKpiNutrimax } from '../src/lib/kpi-romaneio/gerar-nutrimax'
import { compararDetalhes } from '../src/lib/kpi-romaneio/comparar-kpi'
import { extrairResumoKpiXlsx } from '../src/lib/kpi-romaneio/resumo-dashboard'

async function main() {
  const [escalaPath, romaneioPath, data, paoPath] = process.argv.slice(2)
  if (!escalaPath || !romaneioPath || !data) {
    console.error('Uso: npx tsx --env-file=.env.production scripts/verificar-equivalencia-ao-vivo.ts <escala.pdf> <romaneio.pdf> <data> [pao.pdf]')
    process.exit(1)
  }
  const escala = await parseEscala(Buffer.from(readFileSync(escalaPath)))
  const romaneio = await parseRomaneio(Buffer.from(readFileSync(romaneioPath)))
  const pao = paoPath ? await parsePao(Buffer.from(readFileSync(paoPath)), data) : { linhas: [], escala: [] }
  const entrada = { data, escala, romaneio, pao, escalaEnviada: true, paoEnviado: paoPath != null }

  const a = await gerarKpiNutrimax(entrada)
  const guardado = JSON.parse(JSON.stringify({ escala, romaneio, pao }))
  const b = await gerarKpiNutrimax({ ...entrada, ...guardado })

  const dif = compararDetalhes(a.detalhe, b.detalhe)
  const [ra, rb] = await Promise.all([extrairResumoKpiXlsx(a.xlsx), extrairResumoKpiXlsx(b.xlsx)])
  console.log(`A (PDF): ${ra.taxa}% (${ra.entregues}/${ra.nfsNaConta})  B (guardado): ${rb.taxa}% (${rb.entregues}/${rb.nfsNaConta})  NFs: ${a.detalhe.length}/${b.detalhe.length}`)
  if (dif.length > 0 || ra.taxa !== rb.taxa || ra.entregues !== rb.entregues || ra.nfsNaConta !== rb.nfsNaConta) {
    console.error(`DIFERENTE (${dif.length} NFs):\n${dif.slice(0, 50).join('\n')}`)
    process.exit(1)
  }
  console.log('IGUAL')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
