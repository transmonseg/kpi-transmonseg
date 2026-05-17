import ExcelJS from 'exceljs'
import { KPI_COLORS, KPI_FONTS, KPI_BORDER_THIN } from './kpi-styles'

// Mapeamento filial → bairro/local (do KPI ZONA SUL original)
export const FILIAIS_ZONA_SUL: Array<{ numero: number | string; nome: string }> = [
  { numero: 1, nome: 'Zona Sul Loja 01 - Ipanema' },
  { numero: 2, nome: 'Zona Sul Loja 02 - Ipanema' },
  { numero: 3, nome: 'Zona Sul Loja 03 - Copacabana I' },
  { numero: 4, nome: 'Zona Sul Loja 04 - Copacabana II' },
  { numero: 5, nome: 'Zona Sul Loja 05 - Copacabana III' },
  { numero: 6, nome: 'Zona Sul Loja 06 - Gávea' },
  { numero: 7, nome: 'Zona Sul Loja 07 - Leblon' },
  { numero: 8, nome: 'Zona Sul Loja 08 - Leblon' },
  { numero: 9, nome: 'Zona Sul Loja 09 - Ipanema' },
  { numero: 10, nome: 'Zona Sul Loja 10 - Recreio' },
  { numero: 11, nome: 'Zona Sul Loja 11 - Leblon' },
  { numero: 12, nome: 'Zona Sul Loja 12 - Leme' },
  { numero: 13, nome: 'Zona Sul Loja 13 - Angra' },
  { numero: 14, nome: 'Zona Sul Loja 14 - Leblon' },
  { numero: 15, nome: 'Zona Sul Loja 15 - Leblon' },
  { numero: 16, nome: 'Zona Sul Loja 16 - Leblon' },
  { numero: 17, nome: 'Zona Sul Loja 17 - Barra' },
  { numero: 18, nome: 'Zona Sul Loja 18 - Copacabana' },
  { numero: 19, nome: 'Zona Sul Loja 19 - Copacabana' },
  { numero: 20, nome: 'Zona Sul Loja 20 - Botafogo' },
  { numero: 21, nome: 'Zona Sul Loja 21 - Flamengo' },
  { numero: 22, nome: 'Zona Sul Loja 22 - São Conrado' },
  { numero: 23, nome: 'Zona Sul Loja 23 - Barra' },
  { numero: 24, nome: 'Zona Sul Loja 24 - Penha' },
  { numero: 25, nome: 'Zona Sul Loja 25 - Jardim Botânico' },
  { numero: 26, nome: 'Zona Sul Loja 26 - Copacabana' },
  { numero: 27, nome: 'Zona Sul Loja 27 - Ipanema' },
  { numero: 28, nome: 'Zona Sul Loja 28 - Urca' },
  { numero: 29, nome: 'Zona Sul Loja 29 - Flamengo' },
  { numero: 30, nome: 'Zona Sul Loja 30 - Laranjeiras' },
  { numero: 31, nome: 'Zona Sul Loja 31 - Jardim Botânico' },
  { numero: 32, nome: 'Zona Sul Loja 32 - Laranjeiras' },
  { numero: 33, nome: 'Zona Sul Loja 33 - Humaitá' },
  { numero: 34, nome: 'Zona Sul Loja 34 - Barra' },
  { numero: 35, nome: 'Zona Sul Loja 35 - Barra' },
  { numero: 36, nome: 'Zona Sul Loja 36 - Botafogo' },
  { numero: 37, nome: 'Zona Sul Loja 37 - Botafogo' },
  { numero: 38, nome: 'Zona Sul Loja 38 - Copacabana' },
  { numero: 39, nome: 'Zona Sul Loja 39 - Centro' },
  { numero: 40, nome: 'Zona Sul Loja 40 - Ipanema' },
  { numero: 41, nome: 'Zona Sul Loja 41 - Laranjeiras' },
  { numero: 42, nome: 'Zona Sul Loja 42 - Botafogo' },
  { numero: 43, nome: 'Zona Sul Loja 43 - Barra (Península)' },
  { numero: 44, nome: 'Zona Sul Loja 44 - Barra' },
  { numero: 45, nome: 'Zona Sul Loja 45 - Flamengo' },
  { numero: 46, nome: 'Zona Sul Loja 46 - Botafogo' },
  { numero: 47, nome: 'Zona Sul Loja 47' },
  { numero: 48, nome: 'Zona Sul Loja 48 - Recreio' },
  { numero: 1129, nome: 'Zona Sul Olaria' },
  { numero: 'MEGA BOX 01', nome: 'MEGA BOX 01 - Olaria' },
  { numero: 'MEGA BOX 1', nome: 'MEGA BOX 01 - Olaria' },
  { numero: 'MEGA BOX 02', nome: 'MEGA BOX 02 - Olaria' },
  { numero: 'MEGA BOX 2', nome: 'MEGA BOX 2 - Recreio' },
]

export function gerarAbaBaseZonaSul(wb: ExcelJS.Workbook): void {
  const existente = wb.getWorksheet('BASE')
  if (existente) wb.removeWorksheet(existente.id)

  const ws = wb.addWorksheet('BASE')
  ws.columns = [
    { width: 5 },
    { width: 5 },
    { width: 14 },
    { width: 45 },
    { width: 14 },
    { width: 45 },
  ]

  const h = ws.getRow(1)
  h.values = ['', '', 'LOJA', 'NOME', 'INPUT', 'NOME PROCV']
  h.height = 30
  h.eachCell((cell, col) => {
    if (col < 3) return
    cell.font = KPI_FONTS.HEADER
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_COLORS.BRAND_BLUE } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })

  FILIAIS_ZONA_SUL.forEach((f, i) => {
    const r = ws.getRow(2 + i)
    r.getCell('C').value = f.numero
    r.getCell('D').value = f.nome
    r.getCell('F').value = { formula: `IFERROR(VLOOKUP(E${2 + i},C:D,2,FALSE),"")` }
    r.eachCell({ includeEmpty: false }, (cell) => {
      cell.font = KPI_FONTS.BODY
      cell.border = KPI_BORDER_THIN
      cell.alignment = { vertical: 'middle' }
    })
  })
}
