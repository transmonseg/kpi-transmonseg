import ExcelJS from 'exceljs'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const JSZip = require('jszip')
import type { ParadaUnitrac, ResumoVeiculo } from '@/lib/types/unitrac'
import { normalizaPlaca } from '@/lib/utils/placa'

/**
 * Some Unitrac XLSX files are generated with namespace prefixes on all XML element names
 * (e.g. <x:worksheet>, <ap:Properties>) which ExcelJS can't parse. This function
 * detects and strips ALL namespace prefixes from element names across all XML files
 * in the ZIP before handing the buffer to ExcelJS.
 */
async function normalizeXlsxNamespaces(buf: Buffer): Promise<Buffer> {
  try {
    const zip = new JSZip()
    await zip.loadAsync(buf)

    let needsRebuild = false
    const xmlEntries = zip.file(/\.xml$/)

    for (const entry of xmlEntries) {
      // Only normalize spreadsheet-related XMLs (xl/*). NEVER touch docProps/*
      // because Dublin Core / extended-properties XMLs use prefixes like <dc:creator>
      // that ExcelJS depends on. Stripping them breaks valid files.
      if (!entry.name.startsWith('xl/')) continue
      const xml: string = await entry.async('string')
      // Only process files that actually have prefixed element names like <ns:tag or </ns:tag
      if (!/<\w+:\w/.test(xml)) continue
      // Strip prefix from element names: <ns:tag → <tag, </ns:tag → </tag
      // Also convert xmlns:ns= → xmlns= for the primary namespace declaration
      const normalized = xml
        .replace(/(<\/?)(\w+):(\w)/g, '$1$3')
        .replace(/xmlns:\w+="http:\/\/schemas\.openxmlformats\.org\/spreadsheetml/g,
          'xmlns="http://schemas.openxmlformats.org/spreadsheetml')
      zip.file(entry.name, normalized)
      needsRebuild = true
    }

    if (!needsRebuild) return buf
    const fixed: Buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    return fixed
  } catch {
    return buf
  }
}

function parseDuracao(s: string): number {
  if (!s) return 0
  const m = s.match(/(\d+)D\s+(\d+):(\d+):(\d+)/)
  if (!m) return 0
  const [, d, h, mi, ss] = m.map(Number)
  return d * 86400 + h * 3600 + mi * 60 + ss
}

function toDate(val: unknown): Date | null {
  if (val instanceof Date) return val
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function toNumber(val: unknown): number | null {
  if (typeof val === 'number') return val
  if (typeof val === 'string') {
    const n = parseFloat(val.replace(',', '.'))
    return isNaN(n) ? null : n
  }
  return null
}

function toString(val: unknown): string | null {
  if (val === null || val === undefined) return null
  if (typeof val === 'string') return val.trim() || null
  return String(val).trim() || null
}

function cellValue(row: ExcelJS.Row, col: number): unknown {
  const cell = row.getCell(col)
  const v = cell.value
  if (v === null || v === undefined) return null
  if (typeof v === 'object' && 'result' in (v as object)) {
    return (v as { result: unknown }).result
  }
  return v
}

const BASE_LOCAL = 'BASE BENASSI - BASE BENASSI'
const FORA_LOCAL = 'FORA DE BASE E LOCAL DE SERVIÇO'

function classificaParada(local: string, duracaoSeg: number): ParadaUnitrac['classificacao'] {
  if (local === BASE_LOCAL) {
    return duracaoSeg > 900 ? 'BASE' : 'FAKE_EXIT'
  }
  if (local === FORA_LOCAL) {
    return duracaoSeg < 600 ? 'FAKE_EXIT' : 'FORA_BASE'
  }
  return 'LOJA'
}

function extraiLoja(local: string): { codigo_loja: string | null; nome_loja: string | null } {
  const idx = local.indexOf(' - ')
  if (idx === -1) return { codigo_loja: null, nome_loja: null }
  const codigo = local.slice(0, idx).trim()
  const nome = local.slice(idx + 3).trim() || null
  return { codigo_loja: codigo || null, nome_loja: nome }
}

function computeSaidaCd(paradas: ParadaUnitrac[]): Date | null {
  let lastBaseSaida: Date | null = null
  for (const p of paradas) {
    if (p.classificacao === 'FAKE_EXIT') continue
    if (p.classificacao === 'BASE') {
      lastBaseSaida = p.saida
    } else {
      return lastBaseSaida
    }
  }
  return null
}

export async function parseUnitrac(
  buffer: ArrayBuffer | Buffer
): Promise<ResumoVeiculo[]> {
  const wb = new ExcelJS.Workbook()
  let buf = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer
  buf = await normalizeXlsxNamespaces(buf)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buf as any)

  const result: ResumoVeiculo[] = []

  wb.eachSheet((ws) => {
    const placaRaw = ws.name
    const placaNorm = normalizaPlaca(placaRaw)
    if (!placaNorm) return

    let inicio_viagem: Date | null = null
    let fim_viagem: Date | null = null
    let qtd_paradas = 0

    const row5 = ws.getRow(5)
    inicio_viagem = toDate(cellValue(row5, 3))
    fim_viagem = toDate(cellValue(row5, 4))
    const qtdRaw = toNumber(cellValue(row5, 5))
    if (qtdRaw !== null) qtd_paradas = qtdRaw

    const paradas: ParadaUnitrac[] = []
    let ordem = 1

    let rowNum = 7
    while (true) {
      const row = ws.getRow(rowNum)
      const col2 = cellValue(row, 2)
      if (col2 === null || col2 === undefined) break

      const chegadaRaw = cellValue(row, 3)
      const saidaRaw = cellValue(row, 4)
      const duracaoRaw = toString(cellValue(row, 5))
      const distanciaRaw = toNumber(cellValue(row, 6))
      const enderecoRaw = toString(cellValue(row, 8))
      const latRaw = toNumber(cellValue(row, 9))
      const lngRaw = toNumber(cellValue(row, 10))
      const localRaw = toString(cellValue(row, 11))

      const chegada = toDate(chegadaRaw)
      const saida = toDate(saidaRaw)
      const duracaoSeg = parseDuracao(duracaoRaw ?? '')
      const local = localRaw ?? ''

      if (!chegada || !saida) {
        rowNum++
        continue
      }

      const classificacao = classificaParada(local, duracaoSeg)

      let codigo_loja: string | null = null
      let nome_loja: string | null = null

      if (classificacao === 'LOJA') {
        const loja = extraiLoja(local)
        codigo_loja = loja.codigo_loja
        nome_loja = loja.nome_loja
      }

      paradas.push({
        placa_norm: placaNorm,
        chegada,
        saida,
        duracao_seg: duracaoSeg,
        distancia_km: distanciaRaw,
        endereco: enderecoRaw,
        lat: latRaw,
        lng: lngRaw,
        local_parada: local,
        codigo_loja,
        nome_loja,
        classificacao,
        ordem,
      })

      ordem++
      rowNum++
    }

    const saida_cd = computeSaidaCd(paradas)

    result.push({
      placa_norm: placaNorm,
      placa_raw: placaRaw,
      inicio_viagem,
      fim_viagem,
      qtd_paradas,
      paradas,
      saida_cd,
    })
  })

  return result
}
