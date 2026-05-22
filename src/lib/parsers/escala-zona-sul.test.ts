import ExcelJS from 'exceljs'
import { describe, it, expect } from 'vitest'
import { isMegaBoxLoja, normalizaFilialCod, parseEscalaZonaSul } from './escala-zona-sul'

describe('normalizaFilialCod', () => {
  it('zero-pad "4" → "04"', () => {
    expect(normalizaFilialCod('4')).toBe('04')
  })

  it('"04" não muda → "04"', () => {
    expect(normalizaFilialCod('04')).toBe('04')
  })

  it('"12" não muda → "12"', () => {
    expect(normalizaFilialCod('12')).toBe('12')
  })

  it('trim de espaços antes do pad: " 5 " → "05"', () => {
    expect(normalizaFilialCod(' 5 ')).toBe('05')
  })

  it('normaliza "MEGA BOX 01" → "MEGA BOX 1"', () => {
    expect(normalizaFilialCod('MEGA BOX 01')).toBe('MEGA BOX 1')
  })

  it('normaliza "MEGA BOX 02" → "MEGA BOX 2"', () => {
    expect(normalizaFilialCod('MEGA BOX 02')).toBe('MEGA BOX 2')
  })

  it('"MEGA BOX 1" idempotente', () => {
    expect(normalizaFilialCod('MEGA BOX 1')).toBe('MEGA BOX 1')
  })

  it('"mega box 01" case-insensitive → "MEGA BOX 1"', () => {
    expect(normalizaFilialCod('mega box 01')).toBe('MEGA BOX 1')
  })

  it('"MEGA BOX 01 - Olaria" → "MEGA BOX 1 - Olaria" (preserva bairro)', () => {
    expect(normalizaFilialCod('MEGA BOX 01 - Olaria')).toBe('MEGA BOX 1 - Olaria')
  })

  it('"MEGA BOX 02 - Recreio" → "MEGA BOX 2 - Recreio"', () => {
    expect(normalizaFilialCod('MEGA BOX 02 - Recreio')).toBe('MEGA BOX 2 - Recreio')
  })

  it('"MEGA BOX 01 — Olaria" (em-dash) → "MEGA BOX 1 — Olaria"', () => {
    expect(normalizaFilialCod('MEGA BOX 01 — Olaria')).toBe('MEGA BOX 1 — Olaria')
  })

  it('"MEGA BOX 1" sem bairro idempotente', () => {
    expect(normalizaFilialCod('MEGA BOX 1')).toBe('MEGA BOX 1')
  })
})

describe('isMegaBoxLoja', () => {
  it('detecta "MEGA BOX 01"', () => {
    expect(isMegaBoxLoja('MEGA BOX 01')).toBe(true)
  })
  it('detecta "MEGA BOX 02 - Olaria"', () => {
    expect(isMegaBoxLoja('MEGA BOX 02 - Olaria')).toBe(true)
  })
  it('detecta case-insensitive', () => {
    expect(isMegaBoxLoja('mega  box  1')).toBe(true)
  })
  it('Zona Sul comum → false', () => {
    expect(isMegaBoxLoja('Zona Sul Loja 21 - Flamengo')).toBe(false)
  })
  it('null/empty → false', () => {
    expect(isMegaBoxLoja(null)).toBe(false)
    expect(isMegaBoxLoja('')).toBe(false)
    expect(isMegaBoxLoja(undefined)).toBe(false)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Sub-rede tagging via parser end-to-end (formato MATRIZ minimalista)
// ───────────────────────────────────────────────────────────────────────────

async function buildMatrizBuffer(rows: Array<Array<unknown>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('MATRIZ')
  // Linha de header com "CARREGAMENTO DIÁRIO" na col 10 e data na col 18
  const header: unknown[] = new Array(22).fill(null)
  header[9] = 'CARREGAMENTO DIÁRIO'
  header[17] = new Date(Date.UTC(2026, 4, 19)) // 2026-05-19
  ws.addRow(header)
  for (const r of rows) ws.addRow(r)
  const ab = await wb.xlsx.writeBuffer()
  return Buffer.from(ab as ArrayBuffer)
}

function makeRow(loja1: string, kilos1: number, placa: string): unknown[] {
  const r: unknown[] = new Array(22).fill(null)
  // Hora na col 2 (r[1])
  r[1] = new Date(Date.UTC(1899, 11, 30, 8, 0)) // 08:00
  // col 4 (r[3]) = loja 1
  r[3] = loja1
  // col 5 (r[4]) = kilos 1
  r[4] = kilos1
  // col 10 (r[9]) = total kilos
  r[9] = kilos1
  // col 11 (r[10]) = total paletes
  r[10] = 1
  // col 13 (r[12]) = tipo veiculo
  r[12] = 'TOCO'
  // col 15 (r[14]) = placa
  r[14] = placa
  // col 19 (r[18]) = motorista
  r[18] = 'Fulano'
  // col 20 (r[19]) = cod motorista
  r[19] = '123'
  return r
}

describe('parseEscalaZonaSul — sub_rede tagging', () => {
  it('linha Mega Box → sub_rede="MEGA_BOX" e rede_id="ZONA_SUL" preservado', async () => {
    const buf = await buildMatrizBuffer([makeRow('MEGA BOX 01', 1000, 'ABC1D23')])
    const linhas = await parseEscalaZonaSul(buf, '2026-05-19')
    expect(linhas).toHaveLength(1)
    expect(linhas[0].rede_id).toBe('ZONA_SUL')
    expect(linhas[0].sub_rede).toBe('MEGA_BOX')
  })

  it('linha Zona Sul normal → sub_rede ausente ou null', async () => {
    const buf = await buildMatrizBuffer([makeRow('21', 1000, 'XYZ1A23')])
    const linhas = await parseEscalaZonaSul(buf, '2026-05-19')
    expect(linhas).toHaveLength(1)
    expect(linhas[0].rede_id).toBe('ZONA_SUL')
    expect(linhas[0].sub_rede == null).toBe(true)
  })

  it('"MEGA BOX 01" e "MEGA BOX 1" → mesma loja_codigo_raw após normalização', async () => {
    const buf = await buildMatrizBuffer([
      makeRow('MEGA BOX 01', 1000, 'AAA1A11'),
      makeRow('MEGA BOX 1', 2000, 'BBB2B22'),
    ])
    const linhas = await parseEscalaZonaSul(buf, '2026-05-19')
    expect(linhas).toHaveLength(2)
    expect(linhas[0].loja_codigo_raw).toBe(linhas[1].loja_codigo_raw)
    expect(linhas[0].loja_codigo_raw).toBe('MEGA BOX 1')
    expect(linhas[0].sub_rede).toBe('MEGA_BOX')
    expect(linhas[1].sub_rede).toBe('MEGA_BOX')
  })
})
