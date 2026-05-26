/**
 * Step-by-step debug do parser PDF para LQU5546.
 */
import { readFileSync } from 'fs'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>

function normalizeSpaces(raw: string): string {
  return raw
    .replace(/Veículo(?=Início)/g, 'Veículo ')
    .replace(/Viagem(?=Fim|Qtd)/g, 'Viagem ')
    .replace(/Paradas(?=Distância|Tempo|Condutor)/g, 'Paradas ')
    .replace(/([A-Z]{3}-?\d[A-Z0-9]\d{2})(\d)/g, '$1 $2')
    .replace(/(\d{4})(\d{2}:\d{2})/g, '$1 $2')
    .replace(/(\d{4})(\d{2}\/\d{2}\/\d{4})/g, '$1 $2')
    .replace(/(\d{4})(\d+D \d{2}:\d{2}:\d{2})/g, '$1 $2')
    .replace(/(\d{2}:\d{2})(\d{2}\/\d{2}\/\d{4})/g, '$1 $2')
    .replace(/(\d{2}:\d{2})(\d)/g, '$1 $2')
    .replace(/(\d+D \d{2}:\d{2}:\d{2})(\d)/g, '$1 $2')
    .replace(/(\d+D \d{2}:\d{2}:\d{2})([A-ZÀ-Ýa-zà-ý])/g, '$1 $2')
    .replace(/(-?\d+\.\d+)(-\d+\.\d+)/g, '$1 $2')
    .replace(/(-?\d+\.\d+)([A-ZÀ-Ý])/g, '$1 $2')
    .replace(/([A-ZÀ-Ý])(-\d+\.\d+)/g, '$1 $2')
    .replace(/(-?\d+\.\d{6})(\d)/g, '$1 $2')
    .replace(/(\d+,\d+)(0D )/g, '$1 $2')
}

const PARADA_REGEX = new RegExp(
  [
    String.raw`(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s+`,
    String.raw`(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s+`,
    String.raw`(0D \d{2}:\d{2}:\d{2})\s+`,
    String.raw`(\d+(?:[.,]\d+)?)\s+`,
    String.raw`(0D \d{2}:\d{2}:\d{2})\s+`,
    String.raw`([\s\S]*?)\s+`,
    String.raw`(-\d{1,2}\.\d{4,6})\s+`,
    String.raw`(-\d{1,3}\.\d{4,6})\s+`,
    String.raw`([\s\S]*?)(?=\s*\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}|$)`,
  ].join(''),
  'g',
)

;(async () => {
  const buf = readFileSync('C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19/relatorio_9572.pdf')
  const result = await pdfParse(buf)

  const text = result.text
  const idx = text.indexOf('LQU-5546')
  const endIdx = text.indexOf('19/05/2026', idx + 200)
  // Encontra fim: próximo Veículo
  const nextVehicle = text.indexOf('Veículo', idx + 200)
  const section = text.slice(idx, nextVehicle > 0 ? nextVehicle : idx + 5000)

  // Aplica preprocess MANUALMENTE só normalizeSpaces (sem REPAIR)
  let normalized = normalizeSpaces(section)
  // Remove cabeçalhos
  normalized = normalized
    .replace(/Página \d+ de \d+/g, '')
    .replace(/Relatório Parada e Serviço[\s\S]*?Data Fim:\s+\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/g, '')
    .replace(/Condutor\s*Data parada\s*Data Saída[\s\S]*?Local da\s*Parada/g, '')

  console.log('═══ Section normalizada ═══')
  console.log(normalized.slice(0, 3000))
  console.log('\n═══ Aplicando PARADA_REGEX ═══')
  PARADA_REGEX.lastIndex = 0
  let m
  let count = 0
  while ((m = PARADA_REGEX.exec(normalized)) !== null) {
    count++
    const [full, dCheg, hCheg, dSai, hSai, dur, dist, tempoAte, endereco, lat, lng, local] = m
    console.log(`\n--- Parada ${count} ---`)
    console.log(`  chegada: ${dCheg} ${hCheg}`)
    console.log(`  saida:   ${dSai} ${hSai}`)
    console.log(`  duracao: ${dur}, dist: ${dist}, tempo até: ${tempoAte}`)
    console.log(`  endereço (LEN=${endereco.length}): ${JSON.stringify(endereco.slice(0, 200))}`)
    console.log(`  lat/lng: ${lat} ${lng}`)
    console.log(`  local: ${JSON.stringify(local.slice(0, 200))}`)
  }
})().catch(e => { console.error(e); process.exit(1) })
