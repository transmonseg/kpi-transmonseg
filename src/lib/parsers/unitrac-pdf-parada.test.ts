import { describe, it, expect } from 'vitest'
import { parseTextToResumos } from './unitrac-pdf'

// Cobertura do CORAÇÃO do parser PDF (PARADA_REGEX + classificaParada + extraiLoja),
// que estava sem testes apesar de ser o trecho que mais muda e mais quebrou em
// produção (multi-dia, FORA DE DE JANEIRO, UFW0H63, etc — ver comentários no .ts).
//
// `parseTextToResumos` recebe o texto cru já no layout pós-preprocess do PDF:
//   |VEHICLE_HEADER| PLACA dIni hIni dFim hFim qtd dist 0D HH:MM:SS  <paradas...>
// Cada parada:
//   dCheg hCheg dSai hSai <dur \d+D HH:MM:SS> <dist> <tempoAte \d+D HH:MM:SS> <endereço> <lat> <lng> <local>

interface ParadaInput {
  cheg?: string; sai?: string
  dur: string; dist?: string; tempoAte?: string
  endereco?: string; lat?: string; lng?: string; local: string
}

function mkParada(p: ParadaInput): string {
  const cheg = p.cheg ?? '20/05/2026 06:00'
  const sai = p.sai ?? '20/05/2026 06:30'
  const dist = p.dist ?? '12,5'
  const tempoAte = p.tempoAte ?? '0D 01:00:00'
  const endereco = p.endereco ?? 'RUA TESTE 123'
  const lat = p.lat ?? '-22.900000'
  const lng = p.lng ?? '-43.200000'
  return `${cheg} ${sai} ${p.dur} ${dist} ${tempoAte} ${endereco} ${lat} ${lng} ${p.local}`
}

function mkVeiculo(placa: string, paradas: ParadaInput[]): string {
  const head = `|VEHICLE_HEADER| ${placa} 20/05/2026 04:00 20/05/2026 18:00 ${paradas.length} 50,0 0D 08:00:00`
  return `${head} ${paradas.map(mkParada).join(' ')}`
}

describe('parseTextToResumos — extração e classificação de paradas', () => {
  it('parada LOJA básica: código, nome, duração, distância e coordenadas', () => {
    const out = parseTextToResumos(mkVeiculo('ABC-1234', [
      { dur: '0D 00:30:00', local: '7000999 - LOJA TESTE' },
    ]))
    expect(out).toHaveLength(1)
    expect(out[0].paradas).toHaveLength(1)
    const p = out[0].paradas[0]
    expect(p.classificacao).toBe('LOJA')
    expect(p.codigo_loja).toBe('7000999')
    expect(p.nome_loja).toBe('LOJA TESTE')
    expect(p.duracao_seg).toBe(30 * 60)
    expect(p.distancia_km).toBe(12.5)
    expect(p.lat).toBeCloseTo(-22.9, 4)
    expect(p.lng).toBeCloseTo(-43.2, 4)
  })

  it('duração MULTI-DIA (>24h) é parseada — blinda o fix \\d+D da Onda 1', () => {
    // Antes o regex só aceitava "0D ..." → a parada de fim de semana na base
    // (estacionamento >24h) não casava e o veículo era descartado.
    const out = parseTextToResumos(mkVeiculo('ABC-1234', [
      { dur: '2D 03:15:00', local: '7000999 - LOJA TESTE' },
    ]))
    expect(out).toHaveLength(1)
    expect(out[0].paradas).toHaveLength(1)
    // 2 dias + 3h15 = 2*86400 + 3*3600 + 15*60
    expect(out[0].paradas[0].duracao_seg).toBe(2 * 86400 + 3 * 3600 + 15 * 60)
  })

  it('tempo-até multi-dia também é aceito (não derruba a parada)', () => {
    const out = parseTextToResumos(mkVeiculo('ABC-1234', [
      { dur: '0D 00:20:00', tempoAte: '1D 12:00:00', local: '7000999 - LOJA TESTE' },
    ]))
    expect(out).toHaveLength(1)
    expect(out[0].paradas).toHaveLength(1)
  })

  it('BASE BENASSI com duração > 15min → BASE', () => {
    const out = parseTextToResumos(mkVeiculo('ABC-1234', [
      { dur: '0D 00:30:00', local: 'BASE BENASSI' },
    ]))
    expect(out[0].paradas[0].classificacao).toBe('BASE')
    expect(out[0].paradas[0].codigo_loja).toBeNull()
  })

  it('FORA DE BASE com duração longa → FORA_BASE', () => {
    const out = parseTextToResumos(mkVeiculo('ABC-1234', [
      { dur: '0D 00:30:00', local: 'FORA DE BASE' },
    ]))
    expect(out[0].paradas[0].classificacao).toBe('FORA_BASE')
  })

  it('local sem código nem marcador → FORA_BASE (default conservador)', () => {
    // Quebras de página produzem locais tipo "FORA DE DE JANEIRO" (FORA DE BASE
    // truncado). O default NÃO pode ser LOJA — senão lixo vira entrega.
    const out = parseTextToResumos(mkVeiculo('ABC-1234', [
      { dur: '0D 00:30:00', local: 'LUGAR DESCONHECIDO SEM CODIGO' },
    ]))
    expect(out[0].paradas[0].classificacao).toBe('FORA_BASE')
  })

  it('BASE concatenada com loja real → LOJA (raio sobreposto)', () => {
    const out = parseTextToResumos(mkVeiculo('ABC-1234', [
      { dur: '0D 00:30:00', local: 'BASE BENASSI, 9039050 - ASSAI TIJUCA' },
    ]))
    const p = out[0].paradas[0]
    expect(p.classificacao).toBe('LOJA')
    expect(p.codigo_loja).toBe('9039050')
    expect(p.nome_loja).toBe('ASSAI TIJUCA')
  })

  it('marcador de BASE customizado (Nutrimax): "BASE - BASE GARAGEM" pura → BASE', () => {
    // Bug real: com o default "BASE BENASSI", esse local nunca batia (marcador
    // errado pro cliente) e virava FORA_BASE/FAKE_EXIT em vez de BASE.
    const out = parseTextToResumos(mkVeiculo('ABC-1234', [
      { dur: '0D 00:30:00', local: 'BASE - BASE GARAGEM' },
    ]), null, 'BASE - BASE GARAGEM')
    expect(out[0].paradas[0].classificacao).toBe('BASE')
    expect(out[0].paradas[0].codigo_loja).toBeNull()
  })

  it('marcador de BASE customizado: sem passar o parâmetro, "BASE - BASE GARAGEM" NÃO vira BASE (usa default Benassi)', () => {
    const out = parseTextToResumos(mkVeiculo('ABC-1234', [
      { dur: '0D 00:30:00', local: 'BASE - BASE GARAGEM' },
    ]))
    expect(out[0].paradas[0].classificacao).not.toBe('BASE')
  })

  it('marcador de BASE customizado concatenado com loja real → LOJA', () => {
    const out = parseTextToResumos(mkVeiculo('ABC-1234', [
      { dur: '0D 00:30:00', local: 'BASE - BASE GARAGEM, 163743 - CLIENTE TESTE' },
    ]), null, 'BASE - BASE GARAGEM')
    const p = out[0].paradas[0]
    expect(p.classificacao).toBe('LOJA')
    expect(p.codigo_loja).toBe('163743')
  })

  it('marcador padrão do Benassi continua funcionando quando o parâmetro não é passado', () => {
    const out = parseTextToResumos(mkVeiculo('ABC-1234', [
      { dur: '0D 00:30:00', local: 'BASE BENASSI' },
    ]))
    expect(out[0].paradas[0].classificacao).toBe('BASE')
  })

  it('prefere código com prefixo de rede conhecido sobre ROTA genérica', () => {
    const out = parseTextToResumos(mkVeiculo('ABC-1234', [
      { dur: '0D 00:30:00', local: '2018023 - ROTA ZONA NORTE, 3030113 - SUPERPRIX LJ 13' },
    ]))
    const p = out[0].paradas[0]
    expect(p.classificacao).toBe('LOJA')
    expect(p.codigo_loja).toBe('3030113')
    expect(p.nome_loja).toBe('SUPERPRIX LJ 13')
  })

  it('múltiplas paradas no mesmo veículo: ordem crescente e ambas extraídas', () => {
    const out = parseTextToResumos(mkVeiculo('ABC-1234', [
      { cheg: '20/05/2026 06:00', sai: '20/05/2026 06:30', dur: '0D 00:30:00', local: '7000111 - LOJA UM' },
      { cheg: '20/05/2026 08:00', sai: '20/05/2026 08:45', dur: '0D 00:45:00', local: '7000222 - LOJA DOIS' },
    ]))
    expect(out[0].paradas).toHaveLength(2)
    expect(out[0].paradas[0].ordem).toBe(1)
    expect(out[0].paradas[1].ordem).toBe(2)
    expect(out[0].paradas[0].codigo_loja).toBe('7000111')
    expect(out[0].paradas[1].codigo_loja).toBe('7000222')
    expect(out[0].paradas[1].duracao_seg).toBe(45 * 60)
  })

  it('veículo sem nenhuma parada extraível é descartado', () => {
    // Header válido mas sem linha de parada → paradas.length 0 → fora do resultado.
    const out = parseTextToResumos('|VEHICLE_HEADER| ABC-1234 20/05/2026 04:00 20/05/2026 18:00 0 50,0 0D 08:00:00')
    expect(out).toHaveLength(0)
  })
})
