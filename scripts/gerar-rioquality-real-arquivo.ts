// Gera o KPI Rio Quality a partir das planilhas reais, fora do HTTP/auth --
// mesma pipeline da rota /api/kpi/rioquality/gerar (src/lib/kpi-rioquality/
// pipeline.ts). Uso, no VPS (precisa do .env.production: MONITORAMENTO_URL,
// MOTOR_SECRET, SUPABASE_* pra ler a frota):
//
//   npx tsx --env-file=.env.production scripts/gerar-rioquality-real-arquivo.ts \
//     <custos.xlsx> <entregas.xlsx> <data:YYYY-MM-DD> <saida.xlsx>
//
// Formato NOVO (achado real 06/09): um UNICO arquivo, ja' com cidade/bairro/
// cliente/motorista -- passe "--completo <arquivo.xlsx>" no lugar de
// <custos.xlsx> <entregas.xlsx>:
//
//   npx tsx --env-file=.env.production scripts/gerar-rioquality-real-arquivo.ts \
//     --completo <entregas.xlsx> <data:YYYY-MM-DD> <saida.xlsx>
//
// Imprime as estatisticas (confianca da geocodificacao, status das entregas,
// placas com/sem CV) -- e' o jeito de validar o KPI com as planilhas reais
// antes de mostrar pro cliente.
import { readFileSync, writeFileSync } from 'fs'
import { gerarKpiRioQuality } from '../src/lib/kpi-rioquality/pipeline'
import { buscarFrotaRioQuality } from '../src/lib/kpi-rioquality/frota'

async function main() {
  const args = process.argv.slice(2)
  const completo = args[0] === '--completo'
  const argsRestantes = completo ? args.slice(1) : args

  const cvPorPlaca = await buscarFrotaRioQuality()
  console.log(`Frota Rio Quality (tabela): ${cvPorPlaca.size} placas com CV`)
  const t0 = Date.now()

  let r: Awaited<ReturnType<typeof gerarKpiRioQuality>>
  let saidaPath: string
  if (completo) {
    const [arquivoPath, data, saida] = argsRestantes
    if (!arquivoPath || !data || !saida) {
      console.error('Uso: npx tsx --env-file=.env.production scripts/gerar-rioquality-real-arquivo.ts --completo <entregas.xlsx> <data:YYYY-MM-DD> <saida.xlsx>')
      process.exit(1)
    }
    saidaPath = saida
    r = await gerarKpiRioQuality({
      completaBuf: Buffer.from(readFileSync(arquivoPath)),
      data,
      cvPorPlaca,
      log: msg => console.log(msg),
    })
  } else {
    const [custosPath, entregasPath, data, saida] = argsRestantes
    if (!custosPath || !entregasPath || !data || !saida) {
      console.error('Uso: npx tsx --env-file=.env.production scripts/gerar-rioquality-real-arquivo.ts <custos.xlsx> <entregas.xlsx> <data:YYYY-MM-DD> <saida.xlsx>')
      process.exit(1)
    }
    saidaPath = saida
    r = await gerarKpiRioQuality({
      custosBuf: Buffer.from(readFileSync(custosPath)),
      entregasBuf: Buffer.from(readFileSync(entregasPath)),
      data,
      cvPorPlaca,
      log: msg => console.log(msg),
    })
  }

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
