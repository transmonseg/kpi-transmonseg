// Script avulso (não faz parte do app) — gera o KPI da Nutry Max com Escala+
// Romaneio reais e ESCREVE o xlsx em disco, sem passar pela rota HTTP (sem
// auth, sem upload). Desde 06/10 usa a MESMA função da rota
// (gerarKpiNutrimax, src/lib/kpi-romaneio/gerar-nutrimax.ts) -- antes era uma
// cópia que tinha divergido (escala "SEM RASTRI", avisos de motorista/região/
// geocode parcial).
//
// Uso: npx tsx --env-file=.env.production scripts/gerar-nutrimax-real-arquivo.ts <escala.pdf> <romaneio.pdf> <data:YYYY-MM-DD> <saida.xlsx> [romaneio-pao.pdf]
//
// Variáveis de experimento (só neste script, nunca na rota):
//   OVERRIDE_CACHE_CSV=<endereco;lat;lng;confiavel;fonte;motivo>  sobrepõe o geocode só em memória
//   EXPORTAR_DUMP=<arquivo.json>                                   salva o dump de experimento
//   SEM_CADASTRO_UNITRAC=1                                          ver sem-cadastro.ts

import { readFileSync, writeFileSync } from 'fs'
import { parseEscala } from '../src/lib/kpi-romaneio/parse-escala'
import { parseRomaneio } from '../src/lib/kpi-romaneio/parse-romaneio'
import { parsePao } from '../src/lib/kpi-romaneio/parse-pao'
import { gerarKpiNutrimax, ErroEntradaKpi, type OpcoesKpiNutrimax } from '../src/lib/kpi-romaneio/gerar-nutrimax'
import { semCadastroUnitrac } from '../src/lib/kpi-romaneio/sem-cadastro'
import { montarDumpExperimento } from '../src/lib/kpi-romaneio/experimentos/dump'
import type { ResultadoGeocode } from '../src/lib/kpi-romaneio/geocode'

/** OVERRIDE_CACHE_CSV: sobrepõe o geocode SO' EM MEMORIA (nada é gravado no banco). */
function aplicarOverrideCsv(geoPorEndereco: Map<string, ResultadoGeocode>, caminho: string) {
  let n = 0
  for (const ln of readFileSync(caminho, 'utf8').split('\n').slice(1)) {
    const [endereco, lat, lng, confiavel, , motivo] = ln.split(';')
    if (!endereco || !geoPorEndereco.has(endereco) || !lat || !lng) continue
    geoPorEndereco.set(endereco, { ...(geoPorEndereco.get(endereco) as object), lat: Number(lat), lng: Number(lng), confiavel: confiavel === 'true', motivo: motivo || undefined } as ResultadoGeocode)
    n++
  }
  console.log(`Override de cache em memoria: ${n} enderecos`)
}

async function main() {
  const [escalaPath, romaneioPath, data, saidaPath, romaneioPaoPath] = process.argv.slice(2)
  if (!escalaPath || !romaneioPath || !data || !saidaPath) {
    console.error('Uso: npx tsx --env-file=.env.production scripts/gerar-nutrimax-real-arquivo.ts <escala.pdf> <romaneio.pdf> <data:YYYY-MM-DD> <saida.xlsx> [romaneio-pao.pdf]')
    process.exit(1)
  }
  const escala = await parseEscala(Buffer.from(readFileSync(escalaPath)))
  const romaneio = await parseRomaneio(Buffer.from(readFileSync(romaneioPath)))
  const pao = romaneioPaoPath ? await parsePao(Buffer.from(readFileSync(romaneioPaoPath)), data) : { linhas: [], escala: [] }
  console.log(`Escala: ${escala.length + pao.escala.length} linhas, Romaneio: ${romaneio.length + pao.linhas.length} linhas (${pao.linhas.length} do pão)`)

  const caminhoOverride = process.env.OVERRIDE_CACHE_CSV
  const caminhoDump = process.env.EXPORTAR_DUMP
  const opcoes: OpcoesKpiNutrimax = {
    semCadastroUnitrac: semCadastroUnitrac(),
    sobreporGeo: caminhoOverride ? geo => aplicarOverrideCsv(geo, caminhoOverride) : undefined,
    aoMontarDetalhe: caminhoDump
      ? x => {
        writeFileSync(caminhoDump, JSON.stringify(montarDumpExperimento({ data, ...x })))
        console.log(`Dump de experimento salvo em: ${caminhoDump}`)
      }
      : undefined,
  }

  let r: Awaited<ReturnType<typeof gerarKpiNutrimax>>
  try {
    r = await gerarKpiNutrimax({ data, escala, romaneio, pao, escalaEnviada: true, paoEnviado: romaneioPaoPath != null }, opcoes)
  } catch (err) {
    if (err instanceof ErroEntradaKpi) {
      console.error(`ERRO: ${err.message}`)
      process.exit(1)
    }
    throw err
  }
  console.log(`Total cargas: ${r.linhasKpi.length}, OK: ${r.linhasKpi.filter(l => l.status === 'OK').length}, avisos: ${r.avisos.length}`)
  writeFileSync(saidaPath, r.xlsx)
  console.log(`\nArquivo salvo em: ${saidaPath}`)
}

main().catch(e => {
  console.error('ERRO FATAL:', e)
  process.exit(1)
})
