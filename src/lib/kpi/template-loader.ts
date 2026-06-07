import ExcelJS from 'exceljs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * Diretório dos assets do KPI. No site (Vercel/Next) `KPI_ASSETS_DIR` é unset →
 * usa `process.cwd()/src/assets` exatamente como antes (comportamento idêntico).
 * O app desktop empacotado seta `KPI_ASSETS_DIR` pra apontar pros assets que vão
 * dentro do .exe (onde não existe `src/assets`).
 */
function assetsDir(): string {
  return process.env.KPI_ASSETS_DIR || resolve(process.cwd(), 'src/assets')
}

let cachedLogoBuffer: Buffer | null = null

export async function getLogoBuffer(): Promise<Buffer> {
  if (cachedLogoBuffer) return cachedLogoBuffer
  const path = resolve(assetsDir(), 'transmonseg-logo.png')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cachedLogoBuffer = (await readFile(path)) as any
  return cachedLogoBuffer!
}

let cachedTemplateBuffer: Buffer | null = null

/** Template XLSX do KPI (layout REDESIGN) — rows 1-4 = cabeçalho, rows 5/6 = modelos de linha de dados. */
export async function getKpiTemplateBuffer(): Promise<Buffer> {
  if (cachedTemplateBuffer) return cachedTemplateBuffer
  const path = resolve(assetsDir(), 'kpi-template.xlsx')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cachedTemplateBuffer = (await readFile(path)) as any
  return cachedTemplateBuffer!
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
