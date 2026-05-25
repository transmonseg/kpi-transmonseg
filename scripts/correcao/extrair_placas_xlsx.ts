/**
 * Extração LIMPA — usa SheetJS (xlsx) que é tolerante a arquivos diversos.
 * Cada aba do XLSX = 1 placa. Pra cada parada, extrai:
 *  Chegada / Saída / Duração / Endereço (linhas 1-2 textuais) / Lat / Lng / Local da Parada
 *
 * Output: docs/correcao-sistema/todas-placas/dia-{D}.md (5 arquivos)
 *
 * Depois EU (Claude) leio cada arquivo do começo ao fim.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx') as typeof import('xlsx')

const RELATORIOS = [
  { dia: 18, path: 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 18/relatorio_9402.xlsx' },
  { dia: 19, path: 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19/relatorio_9391.xlsx' },
  { dia: 20, path: 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 20/relatorio_9573.xlsx' },
  { dia: 21, path: 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 21/relatorio_9552.xlsx' },
  { dia: 22, path: 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 22/relatorio_9588.xlsx' },
]

interface Parada {
  chegada: string
  saida: string
  duracao: string
  endereco: string
  lat: string
  lng: string
  local: string
}

interface Placa {
  placa: string
  totalParadas: string
  distanciaKm: string
  tempoDirigido: string
  paradas: Parada[]
}

function fmtDate(v: unknown): string {
  if (v instanceof Date) {
    const d = v
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  }
  if (typeof v === 'string') return v
  return String(v ?? '')
}

function processarAba(sheet: import('xlsx').WorkSheet, placa: string): Placa {
  // Layout do Unitrac (linhas 1-indexed):
  // Row 4: cabeçalho "Veículo: | DIP-5557 | Início Viagem | Fim Viagem | Qtd Paradas | Distância(Km) | Tempo Total Dirigido(h) | ..."
  // Row 5: valores correspondentes
  // Row 6: cabeçalho "Condutor | Veículo | Data Parada | Data Saída | Duração Parada | ... | Local da Parada"
  // Row 7+: paradas

  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:Z100')

  function cell(r: number, c: number): unknown {
    const ref = XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })
    const cellObj = sheet[ref]
    if (!cellObj) return null
    return cellObj.v ?? cellObj.w ?? null
  }

  const totalParadas = String(cell(5, 5) ?? '?')
  const distanciaKm = String(cell(5, 6) ?? '?')
  const tempoDirigido = String(cell(5, 7) ?? '?')

  const paradas: Parada[] = []
  for (let r = 7; r <= range.e.r + 1; r++) {
    const chegada = fmtDate(cell(r, 3))
    const saida = fmtDate(cell(r, 4))
    if (!chegada && !saida) continue
    const duracao = String(cell(r, 5) ?? '')
    const endereco = String(cell(r, 8) ?? '').replace(/\s+/g, ' ').trim()
    const lat = String(cell(r, 9) ?? '')
    const lng = String(cell(r, 10) ?? '')
    const local = String(cell(r, 11) ?? '').replace(/\s+/g, ' ').trim()
    paradas.push({ chegada, saida, duracao, endereco: endereco.slice(0, 80), lat, lng, local })
  }

  return { placa, totalParadas, distanciaKm, tempoDirigido, paradas }
}

function main() {
  for (const { dia, path } of RELATORIOS) {
    try {
      const buf = readFileSync(path)
      const wb = XLSX.read(buf)
      const placas: Placa[] = []
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName]
        if (!sheet) continue
        const placa = processarAba(sheet, sheetName)
        placas.push(placa)
      }

      const md: string[] = []
      md.push(`# Dia ${dia}/05/2026 — todas as ${placas.length} placas`)
      md.push('')
      for (const p of placas) {
        md.push(`## ${p.placa}`)
        md.push(`- Total paradas: ${p.totalParadas} | Distância: ${p.distanciaKm} km | Tempo dirigido: ${p.tempoDirigido}`)
        md.push(`- ${p.paradas.length} paradas detalhadas:`)
        for (const parada of p.paradas) {
          md.push(`  - **${parada.chegada} → ${parada.saida}** (${parada.duracao}) | ${parada.lat},${parada.lng}`)
          md.push(`    - Endereço: ${parada.endereco}`)
          md.push(`    - Local: \`${parada.local}\``)
        }
        md.push('')
      }

      mkdirSync('docs/correcao-sistema/todas-placas', { recursive: true })
      writeFileSync(`docs/correcao-sistema/todas-placas/dia-${dia}.md`, md.join('\n'), 'utf8')
      console.log(`Dia ${dia}: ${placas.length} placas → dia-${dia}.md`)
    } catch (e) {
      console.error(`Dia ${dia} falhou:`, (e as Error).message)
    }
  }
}

main()
