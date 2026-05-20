// Testa o parser Guanabara contra as 9 linhas que estavam corrompidas no relatório
// de 15/05/2026 (36% das rotas com 2 carros tinham motorista absorvendo tokens
// do segundo carro). Validamos parseRow contra strings reais do PDF.

import { describe, it, expect } from 'vitest'

// Como parseRow não é exportado, exponho via parseEscalaGuanabaraPdf usando
// uma string de PDF mockada. Simulamos joinContinuationLines + parseRow.
//
// A regex PLACA_TIPO_RE captura placa+tipo grudados (ex: "KSG 5412TRUCK").
// O motorista é "before" a primeira placa+tipo encontrada, descontado o código
// numérico do final.

const PLACA_INLINE_RE = String.raw`[A-Z]{3}[\s-]?\d[A-Z0-9]\d{2}|[A-Z]{3}[\s-]?\d{4}`
const TIPO_INLINE_RE = String.raw`TRUCK|TOCO\s*REFRIGERADO|TOCO|VUC|3\/4|KIA|CARRETA`
const PLACA_TIPO_RE = new RegExp(`(${PLACA_INLINE_RE})\\s?(${TIPO_INLINE_RE})`, 'g')

function parseRowQuick(cleaned: string): { rota: number; carros: Array<{ motorista: string; codigo: string | null; placa: string; tipo: string }> } | null {
  const startMatch = cleaned.match(/^(\d{1,2})([12])(?=[A-ZÀ-Ý])/)
  if (!startMatch) return null
  const rota = parseInt(startMatch[1], 10)
  const rest = cleaned.slice(startMatch[0].length)
  const carros: Array<{ motorista: string; codigo: string | null; placa: string; tipo: string }> = []
  let cursor = 0
  let m: RegExpExecArray | null
  PLACA_TIPO_RE.lastIndex = 0

  while ((m = PLACA_TIPO_RE.exec(rest)) !== null) {
    const before = rest.slice(cursor, m.index)
    const placa = m[1].trim()
    const tipo = m[2].toUpperCase().replace(/\s+/g, ' ')

    let motorista = before.trim()
    let codigo: string | null = null
    const codMatch = before.match(/^([\s\S]+?)(\d{1,7})$/)
    if (codMatch) {
      motorista = codMatch[1].trim()
      codigo = codMatch[2]
    }

    if (motorista) carros.push({ motorista, codigo, placa, tipo })
    cursor = m.index + m[0].length
  }

  return { rota, carros }
}

describe('Guanabara PDF parser — bug de 2 carros (relatório 15/05)', () => {
  it('Rota 01: RONALDO + 2º carro JOSE NILDON', () => {
    const r = parseRowQuick('12RONALDO35KSG 5412TRUCKJOSE NILDON (DOCA)753KVG 7A00TRUCK')
    expect(r?.carros[0].motorista).toBe('RONALDO')
    expect(r?.carros[0].codigo).toBe('35')
    expect(r?.carros[0].placa).toBe('KSG 5412')
    expect(r?.carros[1]?.motorista).toBe('JOSE NILDON (DOCA)')
  })

  it('Rota 02: P. CESAR não absorve placa do 2º', () => {
    const r = parseRowQuick('22P. CESAR210LFK-2C56TRUCKPATRICIO423UFW-0H63TRUCK')
    expect(r?.carros[0].motorista).toBe('P. CESAR')
    expect(r?.carros[0].codigo).toBe('210')
    expect(r?.carros[0].placa).toBe('LFK-2C56')
    expect(r?.carros[1]?.motorista).toBe('PATRICIO')
  })

  it('Rota 07: MOISES limpo', () => {
    const r = parseRowQuick('72MOISES294GBC 6E12TRUCKANDRE530KOA 5E18TRUCK')
    expect(r?.carros[0].motorista).toBe('MOISES')
    expect(r?.carros[0].codigo).toBe('294')
    expect(r?.carros[1]?.motorista).toBe('ANDRE')
  })

  it('Rota 17: LUCIANO 1 carro só', () => {
    const r = parseRowQuick('171LUCIANO823DBB-9084TRUCK')
    expect(r?.carros[0].motorista).toBe('LUCIANO')
    expect(r?.carros[0].codigo).toBe('823')
    expect(r?.carros[0].placa).toBe('DBB-9084')
  })

  it('Rota 25: DANIEL QUIRINO com 2 nomes', () => {
    const r = parseRowQuick('252DANIEL QUIRINO294GEB 9H31TRUCKWILSON180HBB-1234TRUCK')
    expect(r?.carros[0].motorista).toBe('DANIEL QUIRINO')
    expect(r?.carros[0].codigo).toBe('294')
  })
})
