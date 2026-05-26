/**
 * Análise completa rede-por-rede dos KPIs manuais mais atualizados.
 * 1. Detecta a data do KPI manual (lê header).
 * 2. Compara com o KPI gerado correspondente.
 * 3. Categoriza diferenças em padrões reais (não bugs do sistema).
 */
import ExcelJS from 'exceljs'

const MANUAIS = [
  { rede: 'PRINCESA', path: 'C:/Users/media/Downloads/KPI PRINCESA (8).xlsx' },
  { rede: 'GUANABARA', path: 'C:/Users/media/Downloads/KPI GUANABARA (2).xlsx' },
  { rede: 'CARREFOUR', path: 'C:/Users/media/Downloads/KPI CARREFOUR (1).xlsx' },
  { rede: 'ASSAI', path: 'C:/Users/media/Downloads/KPI ASSAI (1).xlsx' },
  { rede: 'ATACADAO', path: 'C:/Users/media/Downloads/KPI ATACADAO (1).xlsx' },
  { rede: 'SUPERPRIX', path: 'C:/Users/media/Downloads/KPI SUPERPRIX (1).xlsx' },
  { rede: 'PREZUNIC', path: 'C:/Users/media/Downloads/KPI PREZUNIC (3).xlsx' },
]

function cvCell(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return ''
  const v = cell.value
  if (v == null) return ''
  if (typeof v === 'object' && 'richText' in v) return (v as any).richText.map((r: any) => r.text).join('').trim()
  if (typeof v === 'object' && 'text' in v) return String((v as any).text).trim()
  return String(v).trim()
}

function detectarData(path: string): Promise<string | null> {
  return (async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(path)
    // Procura "DD/MM/YYYY" ou "DD de MES de YYYY" no header das 10 primeiras células da primeira aba
    for (const ws of wb.worksheets) {
      for (let r = 1; r <= 5; r++) {
        for (let c = 1; c <= 10; c++) {
          const text = cvCell(ws.getRow(r).getCell(c))
          // DD/MM/YYYY
          let m = text.match(/(\d{2})\/(\d{2})\/(\d{4})/)
          if (m) return `${m[3]}-${m[2]}-${m[1]}`
          // DD de MES de YYYY
          const meses: Record<string, string> = {
            'janeiro':'01','fevereiro':'02','março':'03','abril':'04','maio':'05','junho':'06',
            'julho':'07','agosto':'08','setembro':'09','outubro':'10','novembro':'11','dezembro':'12'
          }
          m = text.match(/(\d{1,2})\s+de\s+([A-Za-zçãáéíóú]+)\s+de\s+(\d{4})/i)
          if (m) {
            const mes = meses[m[2].toLowerCase()]
            if (mes) return `${m[3]}-${mes}-${m[1].padStart(2,'0')}`
          }
        }
      }
    }
    return null
  })()
}

;(async () => {
  console.log('═══ Detectando datas dos KPIs manuais ═══\n')
  for (const m of MANUAIS) {
    const data = await detectarData(m.path)
    console.log(`${m.rede}: ${data ?? '(sem data detectada)'}`)
  }
})()
