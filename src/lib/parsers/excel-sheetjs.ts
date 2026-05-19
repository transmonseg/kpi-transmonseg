import * as XLSX from 'xlsx'

export function readSheetRows(
  buffer: Buffer,
  sheetName?: string
): Record<string, string | number | null>[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const name = sheetName ?? wb.SheetNames[0]
  const ws = wb.Sheets[name]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false }) as Record<string, string | number | null>[]
}

export function excelSerialToDate(serial: number): Date {
  const epoch = new Date(Date.UTC(1899, 11, 30))
  return new Date(epoch.getTime() + Math.round(serial * 86400000))
}
