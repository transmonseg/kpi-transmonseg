import ExcelJS from 'exceljs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

let cachedLogoBuffer: Buffer | null = null

export async function getLogoBuffer(): Promise<Buffer> {
  if (cachedLogoBuffer) return cachedLogoBuffer
  const path = resolve(process.cwd(), 'src/assets/transmonseg-logo.png')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cachedLogoBuffer = (await readFile(path)) as any
  return cachedLogoBuffer!
}

export async function carregarOuCriarWorkbook(buffer: Uint8Array | Buffer | null): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TRANSMONSEG'
  wb.created = new Date()
  if (buffer) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buffer as any)
  }
  return wb
}

export function nomeAbaDoDia(dataISO: string): string {
  const [, m, d] = dataISO.split('-') // '2026-05-15' → m='05', d='15'
  return `${d}.${m}` // '15.05' — barra é inválida em nomes de aba do Excel
}
