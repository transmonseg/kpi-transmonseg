// Analise offline de "paradas orfas" sobre dumps gerados por
// EXPORTAR_DUMP=... scripts/gerar-nutrimax-real-arquivo.ts
//
// Uso: npx tsx scripts/exp-paradas-orfas.ts <gabarito.json> <dump1.json> [dump2.json ...]
// Saida: tabela no terminal + candidatas-orfas.csv (ou $CSV_SAIDA) pra a Ana validar.

import { readFileSync, writeFileSync } from 'fs'
import { RAIO_CONFIRMACAO_AMPLIADO_METROS } from '../src/lib/kpi-romaneio/constants'
import { analisarParadasOrfas, categoriaPendente, orfasProximasDoPendente } from '../src/lib/kpi-romaneio/experimentos/paradas-orfas'
import { avaliarContraGabarito, type RotuloGabarito } from '../src/lib/kpi-romaneio/experimentos/gabarito'
import type { DumpExperimento } from '../src/lib/kpi-romaneio/experimentos/tipos'

const RAIOS = [500, 1000, 1500, 2000, 3000]
const RAIO_CSV = 1500
const PARAMS = { duracaoMinSeg: 120, raioReivindicadaM: RAIO_CONFIRMACAO_AMPLIADO_METROS }

function pct(n: number, d: number): string {
  return d === 0 ? '   - ' : `${((100 * n) / d).toFixed(1)}%`
}

function limpa(s: string): string {
  return s.replace(/[;\n\r]/g, ',')
}

function main() {
  const [gabaritoPath, ...dumpPaths] = process.argv.slice(2)
  if (!gabaritoPath || dumpPaths.length === 0) {
    console.error('Uso: npx tsx scripts/exp-paradas-orfas.ts <gabarito.json> <dump1.json> [dump2.json ...]')
    process.exit(1)
  }
  const gabarito: RotuloGabarito[] = JSON.parse(readFileSync(gabaritoPath, 'utf-8'))
  const dumps: DumpExperimento[] = dumpPaths.map(p => JSON.parse(readFileSync(p, 'utf-8')))

  for (const dump of dumps) {
    const a = analisarParadasOrfas(dump, RAIOS, PARAMS)
    console.log(`\n=== ${a.data}: ${a.totalNfs} NFs | identificadas ${pct(a.identificadas, a.totalNfs)} | pendentes ${a.pendentes} (${a.pendentesSemCoordenada} sem coordenada) | paradas orfas ${a.orfasTotal}`)
    for (const r of a.porRaio) {
      console.log(`  raio ${String(r.raioM).padStart(4)}m: pendentes com orfa ${String(r.comOrfa).padStart(3)} (${pct(r.comOrfa, a.pendentes)}) | exclusivas ${String(r.comOrfaExclusiva).padStart(3)} (${pct(r.comOrfaExclusiva, a.pendentes)})`)
    }
    const cat = a.porRaio.find(r => r.raioM === RAIO_CSV)!.porCategoria
    for (const [nome, v] of Object.entries(cat)) {
      console.log(`     [${RAIO_CSV}m] ${nome.padEnd(22)} pendentes ${String(v.pendentes).padStart(3)} | com orfa ${String(v.comOrfa).padStart(3)} (${pct(v.comOrfa, v.pendentes)})`)
    }
  }

  console.log('\n=== Gabarito da Ana (so dias com dump) ===')
  for (const raio of RAIOS) {
    const g = avaliarContraGabarito(dumps, gabarito, PARAMS, raio)
    console.log(`  raio ${String(raio).padStart(4)}m: recall entregue ${g.entregueComOrfa}/${g.entregueTotal} (${pct(g.entregueComOrfa, g.entregueTotal)}) | falso-confirmado ${g.semEvidenciaComOrfa}/${g.semEvidenciaTotal} (${pct(g.semEvidenciaComOrfa, g.semEvidenciaTotal)}) | ja confirmadas ${g.jaConfirmadas} | nao encontradas ${g.naoEncontradas}`)
  }

  const csv = ['data;placa;carga;nf;cliente;endereco;categoria;distancia_m;parada_chegada;parada_saida;duracao_min']
  for (const dump of dumps) {
    for (const l of dump.linhas.filter(x => x.status === 'pendente')) {
      const prox = orfasProximasDoPendente(dump, l, PARAMS, RAIO_CSV)[0]
      if (!prox) continue
      csv.push([
        dump.data, l.placa, l.carga, l.nf, limpa(l.clienteNome), limpa(l.endereco), categoriaPendente(l.observacao),
        Math.round(prox.distanciaM), prox.parada.chegada, prox.parada.saida, Math.round((prox.parada.duracao_seg ?? 0) / 60),
      ].join(';'))
    }
  }
  const saida = process.env.CSV_SAIDA ?? 'candidatas-orfas.csv'
  writeFileSync(saida, csv.join('\n'))
  console.log(`\nCSV de candidatas (raio ${RAIO_CSV}m): ${saida} (${csv.length - 1} linhas)`)
}

main()
