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
    .replace(/(-?\d+\.\d+)([A-Za-zÀ-Ýà-ý])/g, '$1 $2')
    .replace(/([A-Za-zÀ-Ýà-ý])(-\d+\.\d+)/g, '$1 $2')
    .replace(/(-?\d+\.\d{6})(\d)/g, '$1 $2')
    .replace(/(\d+,\d+)(0D )/g, '$1 $2')
}

function preprocess(raw: string): string {
  const normalized = normalizeSpaces(raw)
  return normalized
    .replace(/Página \d+ de \d+/g, '')
    .replace(/-- \d+ of \d+ --/g, '')
    .replace(/Condutor\s*Data parada\s*Data Saída[\s\S]*?Local da\s*Parada/g, '')
    .replace(/Relatório Parada e Serviço[\s\S]*?Data Fim:\s+\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/g, '')
    .replace(/Veículo\s+Início Viagem\s+Fim Viagem\s+Qtd\.\s*Paradas[\s\S]*?Cada Parada \(h\)/g, '|VEHICLE_HEADER|')
}

;(async () => {
  const buf = readFileSync('C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 18/relatorio_9401.pdf')
  const r = await pdfParse(buf)
  const idx = r.text.indexOf('LKW-2B80')
  const next = r.text.indexOf('Veículo', idx + 200)
  const section = r.text.slice(idx, next)

  const cleaned = preprocess(section)
  console.log('═══ APÓS PREPROCESS ═══')
  // Mostra parte ao redor da parada problemática
  const ipos = cleaned.indexOf('FRANCISCO SA')
  if (ipos > 0) {
    console.log(cleaned.slice(Math.max(0, ipos - 200), Math.min(cleaned.length, ipos + 500)))
  } else {
    console.log('FRANCISCO SA não achado, texto inteiro:')
    console.log(cleaned)
  }
})()
