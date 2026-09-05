// Gera o KPI Rio Quality a partir das duas planilhas, fora do HTTP/auth --
// mesma pipeline da rota /api/kpi/rioquality/gerar (src/lib/kpi-rioquality/
// pipeline.ts). Uso, no VPS (precisa do .env.production: MONITORAMENTO_URL,
// MOTOR_SECRET, SUPABASE_* pra ler a frota):
//
//   npx tsx --env-file=.env.production scripts/gerar-rioquality-real-arquivo.ts \
//     <custos.xlsx> <entregas.xlsx> <data:YYYY-MM-DD> <saida.xlsx>
//
// Imprime as estatisticas (confianca da geocodificacao, status das entregas,
// placas com/sem CV) -- e' o jeito de validar o KPI com as planilhas reais
// antes de mostrar pro cliente.
import { readFileSync, writeFileSync } from 'fs'
import { gerarKpiRioQuality } from '../src/lib/kpi-rioquality/pipeline'
import { buscarFrotaRioQuality } from '../src/lib/kpi-rioquality/frota'

async function main() {
  const [custosPath, entregasPath, data, saidaPath] = process.argv.slice(2)
  if (!custosPath || !entregasPath || !data || !saidaPath) {
    console.error('Uso: npx tsx --env-file=.env.production scripts/gerar-rioquality-real-arquivo.ts <custos.xlsx> <entregas.xlsx> <data:YYYY-MM-DD> <saida.xlsx>')
    process.exit(1)
  }
  const cvPorPlaca = await buscarFrotaRioQuality()
  console.log(`Frota Rio Quality (tabela): ${cvPorPlaca.size} placas com CV`)
  const t0 = Date.now()
  const r = await gerarKpiRioQuality({
    custosBuf: Buffer.from(readFileSync(custosPath)),
    entregasBuf: Buffer.from(readFileSync(entregasPath)),
    data,
    cvPorPlaca,
    log: msg => console.log(msg),
  })
  writeFileSync(saidaPath, r.xlsx)
  console.log(`\nOK em ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${saidaPath}`)
  console.log(JSON.stringify(r.estatisticas, null, 2))
  const obs = new Map<string, number>()
  for (const d of r.detalhe) if (d.observacao) obs.set(d.observacao, (obs.get(d.observacao) ?? 0) + 1)
  console.log('Observacoes:', Object.fromEntries(obs))
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
