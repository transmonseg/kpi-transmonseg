import { describe, it, expect } from 'vitest'
import { parseUnitracPdfJs } from './unitrac-pdf-pdfjs'
import { parseTextToResumos } from './unitrac-pdf'

describe('parseUnitracPdfJs', () => {
  it('retorna [] para buffer vazio', async () => {
    expect(await parseUnitracPdfJs(Buffer.from(''))).toEqual([])
  })

  it('retorna [] para buffer invalido', async () => {
    expect(await parseUnitracPdfJs(Buffer.from('not-a-pdf'))).toEqual([])
  })
})

// --- Bug #1: OCR confuse digit↔letter na pos-4 do padrão antigo ---
//
// PDF do HLOG retorna placas antigas com a 4ª posição lida como letra
// (visualmente parecida com o dígito real). Cadastro de placas conhecidas
// (vindo de XLSX/banco) é usado pra desambiguar sem over-correction de
// placas Mercosul reais (ex: KRW8E86 onde "E" é letra Mercosul de verdade).
//
// Evidências reais do dia 2026-05-20, zona-sul:
//   LCO-0978 → OCR retorna LCO-0J78 (9 → J)
//   LQE-5401 → OCR retorna LQE-5E01 (4 → E)
//   LJS-2172 → OCR retorna LJS-2B72 (1 → B)
//   EFU-5704 → OCR retorna EFU-5H04 (7 → H)
describe('parseTextToResumos — bug OCR placa antiga pos-4 (HLOG 2026-05-20)', () => {
  // Mock do texto OCR extraído do PDF do HLOG após pre-processamento.
  // Cada veículo precisa de: marcador |VEHICLE_HEADER|, header da placa
  // (PLACA + datas viagem + qtd paradas), e ao menos UMA parada (senão o
  // parser descarta o veículo com paradas.length === 0).
  //
  // Layout pós-`preprocess()`:
  //   |VEHICLE_HEADER| PLACA dInicio hInicio dFim hFim qtdParadas distancia 0D HH:MM:SS
  //   dCheg hCheg dSai hSai 0D HH:MM:SS dist 0D HH:MM:SS ENDERECO lat lng LOCAL
  function montaTexto(placas: string[]): string {
    return placas
      .map(
        (placa) =>
          `|VEHICLE_HEADER| ${placa} 20/05/2026 04:00 20/05/2026 18:00 1 50,0 ` +
          `0D 08:00:00 ` +
          `20/05/2026 06:00 20/05/2026 06:30 0D 00:30:00 12,5 0D 02:00:00 ` +
          `RUA TESTE 123 -22.900000 -43.200000 ` +
          `7000999 - LOJA TESTE`,
      )
      .join('\n')
  }

  const placasOcrCorrompidas = [
    { ocr: 'LCO-0J78', correta: 'LCO0978', letra: 'J', digito: '9' },
    { ocr: 'LQE-5E01', correta: 'LQE5401', letra: 'E', digito: '4' },
    { ocr: 'LJS-2B72', correta: 'LJS2172', letra: 'B', digito: '1' },
    { ocr: 'EFU-5H04', correta: 'EFU5704', letra: 'H', digito: '7' },
  ]

  it('corrige LCO-0J78 → LCO-0978 quando cadastro tem a forma antiga', () => {
    const cadastro = new Set(['LCO0978'])
    const out = parseTextToResumos(montaTexto(['LCO-0J78']), cadastro)
    expect(out).toHaveLength(1)
    expect(out[0].placa_norm).toBe('LCO0978')
  })

  it('corrige todas as 4 placas conhecidas do bug HLOG 2026-05-20', () => {
    const cadastro = new Set(placasOcrCorrompidas.map((p) => p.correta))
    const texto = montaTexto(placasOcrCorrompidas.map((p) => p.ocr))
    const out = parseTextToResumos(texto, cadastro)
    const placasNorm = out.map((v) => v.placa_norm).sort()
    expect(placasNorm).toEqual(placasOcrCorrompidas.map((p) => p.correta).sort())
  })

  it('NÃO converte Mercosul real (KRW8E86) quando cadastro tem a forma Mercosul', () => {
    // KRW8E86 é placa Mercosul legítima: pos-4 = 'E' (letra real, não OCR).
    // Sem cadastro, o parser NÃO chuta; com cadastro tendo a forma Mercosul,
    // mantém Mercosul (KRW8E86), não converte pra antiga (KRW8486).
    const cadastro = new Set(['KRW8E86'])
    const out = parseTextToResumos(montaTexto(['KRW8E86']), cadastro)
    expect(out).toHaveLength(1)
    expect(out[0].placa_norm).toBe('KRW8E86')
  })

  it('mantém placa antiga já correta (KMY5561) sem mexer', () => {
    const cadastro = new Set(['KMY5561'])
    const out = parseTextToResumos(montaTexto(['KMY-5561']), cadastro)
    expect(out).toHaveLength(1)
    expect(out[0].placa_norm).toBe('KMY5561')
  })

  it('SEM cadastro: não corrige (evita over-correction de Mercosul real)', () => {
    // Sem cadastro, LCO-0J78 fica como LCO0J78 — o parser não tem evidência
    // pra preferir a forma antiga e converter pode quebrar Mercosul real.
    const out = parseTextToResumos(montaTexto(['LCO-0J78']))
    expect(out).toHaveLength(1)
    expect(out[0].placa_norm).toBe('LCO0J78')
  })

  it('cadastro com AMBAS formas: mantém o que veio (sem chute)', () => {
    // Ambiguidade real: as duas placas existem no banco. Sem mais sinal,
    // mantemos a forma OCR'd; matcher resolve via variantesOcr.
    const cadastro = new Set(['LCO0978', 'LCO0J78'])
    const out = parseTextToResumos(montaTexto(['LCO-0J78']), cadastro)
    expect(out).toHaveLength(1)
    expect(out[0].placa_norm).toBe('LCO0J78')
  })
})

// --- Bug (cliente 11/06): geofence gigante sobreposto à base polui paradas ---
// UFW-0H63 Emanuel: "17659000 - O BOM ATACADISTA" (72km, rota gigante) é
// concatenado em TODA parada, inclusive as de BASE. Sem tratamento, paradas
// de base viravam LOJA (KPI mostrava 10:58→22:12) e a entrega real Emanuel
// (11139000) ficava com o nome errado (O BOM ATACADISTA).
describe('parseTextToResumos — geofence gigante sobreposto à base', () => {
  function comLocal(local: string, dur = '0D 01:00:00'): string {
    return (
      `|VEHICLE_HEADER| UFW-0H63 10/06/2026 04:00 10/06/2026 18:00 1 50,0 ` +
      `0D 08:00:00 ` +
      `10/06/2026 10:58 10/06/2026 11:25 ${dur} 1,0 0D 02:00:00 ` +
      `AV BRASIL -22.828000 -43.339000 ` + local
    )
  }
  it('BASE + rota gigante concatenada → BASE (não LOJA)', () => {
    const out = parseTextToResumos(comLocal('BASE BENASSI - BASE BENASSI, 17659000 - O BOM ATACADISTA'))
    expect(out[0].paradas[0].classificacao).toBe('BASE')
  })
  it('loja real (gigante) primária + outra gigante → extrai a PRIMEIRA', () => {
    const out = parseTextToResumos(comLocal('11139000 - EMANUEL COMÉRCIO PEDRA DE GUARATIBA, 17659000 - O BOM ATACADISTA'))
    expect(out[0].paradas[0].classificacao).toBe('LOJA')
    expect(out[0].paradas[0].codigo_loja).toBe('11139000')
    expect(out[0].paradas[0].nome_loja).toMatch(/EMANUEL/)
  })
  it('loja NÃO-gigante vence gigante (regressão)', () => {
    const out = parseTextToResumos(comLocal('7000712 - PREZUNIC REALENGO, 17659000 - O BOM ATACADISTA'))
    expect(out[0].paradas[0].codigo_loja).toBe('7000712')
  })
})

// --- Bug: local_parada com endereço interposto entre código e nome ---
// O Unitrac às vezes formata como "CÓDIGO Cidade - UF NOME" ou
// "CÓDIGO endereço, CEP NOME" em vez do padrão "CÓDIGO - NOME".
// Casos reais (relatorio_10202): GAJ-6H51 "7000730 Niterói - RJ PREZUNIC
// ICARAÍ" virava FORA_BASE → veículo dado como "não foi ao cliente".
describe('parseTextToResumos — local_parada com endereço interposto', () => {
  function comLocal(local: string): string {
    return (
      `|VEHICLE_HEADER| GAJ-6H51 10/06/2026 04:00 10/06/2026 18:00 1 50,0 ` +
      `0D 08:00:00 ` +
      `10/06/2026 08:13 10/06/2026 08:58 0D 00:44:00 35,1 0D 02:00:00 ` +
      `RUA CORONEL MOREIRA CESAR -22.910630 -43.106850 ` + local
    )
  }
  it('"CÓDIGO Cidade - UF NOME" vira LOJA com código extraído', () => {
    const out = parseTextToResumos(comLocal('7000730 Niterói - RJ PREZUNIC ICARAÍ'))
    const p = out[0].paradas[0]
    expect(p.classificacao).toBe('LOJA')
    expect(p.codigo_loja).toBe('7000730')
    expect(p.nome_loja).toMatch(/PREZUNIC ICARAÍ/)
  })
  it('"CÓDIGO endereço, CEP NOME" vira LOJA', () => {
    const out = parseTextToResumos(comLocal('8590573 26-40 NOVA CIDADE ITABORAI RJ BRASIL CEP 24804033 PRINCESA ITABORAÍ'))
    const p = out[0].paradas[0]
    expect(p.classificacao).toBe('LOJA')
    expect(p.codigo_loja).toBe('8590573')
  })
  it('formato padrão continua funcionando (regressão)', () => {
    const out = parseTextToResumos(comLocal('7000730 - PREZUNIC ICARAÍ'))
    expect(out[0].paradas[0].codigo_loja).toBe('7000730')
  })
  it('BASE BENASSI continua BASE', () => {
    const out = parseTextToResumos(comLocal('BASE BENASSI - BASE BENASSI'))
    expect(out[0].paradas[0].classificacao).toBe('BASE')
  })
})
