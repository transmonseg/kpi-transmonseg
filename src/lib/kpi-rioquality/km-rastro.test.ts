import { describe, it, expect, vi } from 'vitest'
import { somarKmDoRastro, janelasDoDia, calcularKmPorRastro } from './km-rastro'

// Achado real 05/09: o km da Rio Quality vinha da soma da RETA ENTRE PARADAS
// e subestimava 43% a 65% (230 km contra 523 reais). O rastro da Unitrac
// (/mapa_servicos/rastro/{cv}/{horas}) resolve: validado contra a verdade da
// Nutry Max (posicoes_historico, ~35s) na MESMA janela de 12h --
//   RQU6E83  19,5 km (rastro) x 19 (verdade)
//   RQV4F38 160,0 x 158
//   TOS1I21 393,8 x 394
//   RQV9E67 176,3 x 175
// A lista vem em ordem cronologica e densa (passo mediano 0m, p90 80m, sem
// saltos), entao somar pontos consecutivos e' valido. Como nao ha timestamp,
// o dia sai por SUBTRACAO de duas janelas ancoradas em "agora".

describe('somarKmDoRastro', () => {
  it('soma a distancia entre pontos consecutivos', () => {
    // ~111m por 0.001 de latitude
    const pts = [{ lat: -22.900, long: -43.200 }, { lat: -22.901, long: -43.200 }, { lat: -22.902, long: -43.200 }]
    expect(somarKmDoRastro(pts)).toBeCloseTo(0.222, 2)
  })
  it('pontos repetidos (veiculo parado) somam zero -- nao acumula jitter', () => {
    const p = { lat: -22.9, long: -43.2 }
    expect(somarKmDoRastro([p, p, p, p])).toBe(0)
  })
  it('menos de 2 pontos: zero', () => {
    expect(somarKmDoRastro([])).toBe(0)
    expect(somarKmDoRastro([{ lat: -22.9, long: -43.2 }])).toBe(0)
  })
  it('ignora ponto invalido (lat/long nulo ou zerado)', () => {
    const pts = [{ lat: -22.900, long: -43.200 }, { lat: 0, long: 0 }, { lat: -22.901, long: -43.200 }]
    expect(somarKmDoRastro(pts)).toBeCloseTo(0.111, 2)
  })
})

describe('janelasDoDia', () => {
  const agora = new Date('2026-09-05T14:00:00Z') // 11:00 BRT de 05/09

  it('dia de ontem: duas janelas (do inicio de ontem e do inicio de hoje)', () => {
    expect(janelasDoDia('2026-09-04', agora)).toEqual({ horasInicio: 35, horasFim: 11 })
  })

  it('hoje: so uma janela -- nao ha o que subtrair', () => {
    expect(janelasDoDia('2026-09-05', agora)).toEqual({ horasInicio: 11, horasFim: 0 })
  })

  it('dia futuro ou fora do alcance do rastro: null', () => {
    expect(janelasDoDia('2026-09-06', agora)).toBeNull()
    expect(janelasDoDia('2026-08-20', agora)).toBeNull()
  })
})

describe('calcularKmPorRastro', () => {
  const agora = new Date('2026-09-05T14:00:00Z')
  const ponto = (lat: number) => ({ lat, long: -43.2 })

  it('dia de ontem = janela do inicio de ontem MENOS a janela de hoje', () => {
    const buscar = vi.fn(async (_cv: string, horas: number) =>
      horas === 35 ? [ponto(-22.900), ponto(-22.910), ponto(-22.930)] // ~3,3 km
                   : [ponto(-22.900), ponto(-22.910)])                 // ~1,1 km
    return calcularKmPorRastro('123', '2026-09-04', buscar, agora).then(km => {
      expect(buscar).toHaveBeenCalledWith('123', 35)
      expect(buscar).toHaveBeenCalledWith('123', 11)
      expect(km).toBeCloseTo(2.2, 1)
    })
  })

  it('hoje: usa a janela inteira, sem subtrair (uma chamada so)', async () => {
    const buscar = vi.fn(async () => [ponto(-22.900), ponto(-22.910)])
    const km = await calcularKmPorRastro('123', '2026-09-05', buscar, agora)
    expect(buscar).toHaveBeenCalledTimes(1)
    expect(km).toBeCloseTo(1.11, 1)
  })

  it('data fora do alcance: null (nao inventa numero)', async () => {
    const buscar = vi.fn()
    expect(await calcularKmPorRastro('123', '2026-07-01', buscar, agora)).toBeNull()
    expect(buscar).not.toHaveBeenCalled()
  })

  it('subtracao negativa (rastro inconsistente): null em vez de numero errado', async () => {
    const buscar = vi.fn(async (_cv: string, horas: number) =>
      horas === 35 ? [ponto(-22.900), ponto(-22.905)] : [ponto(-22.900), ponto(-22.930)])
    expect(await calcularKmPorRastro('123', '2026-09-04', buscar, agora)).toBeNull()
  })

  it('rastro vazio (veiculo sem dado no periodo): null, nao zero', async () => {
    const buscar = vi.fn(async () => [])
    expect(await calcularKmPorRastro('123', '2026-09-05', buscar, agora)).toBeNull()
  })

  it('falha na API nao derruba a geracao: null', async () => {
    const buscar = vi.fn(async () => { throw new Error('timeout') })
    expect(await calcularKmPorRastro('123', '2026-09-05', buscar, agora)).toBeNull()
  })
})

// Task 3 (plano 2026-09-30): sem sinal pela Unitrac precisa saber quantos
// pontos de rastro o dia teve -- e distinguir "rastro vazio" de "consulta do
// rastro falhou" (que nao conclui nada).
import { medirRastroDoDia } from './km-rastro'

describe('medirRastroDoDia', () => {
  const agora = new Date('2026-09-30T15:00:00Z') // 12:00 BRT
  it('dia de hoje: km e pontos da janela inicial', async () => {
    const r = await medirRastroDoDia('1', '2026-09-30', async () => [{ lat: -22.9, long: -43.2 }, { lat: -22.91, long: -43.2 }], agora)
    expect(r.pontosNoDia).toBe(2)
    expect(r.km).toBeGreaterThan(1)
  })
  it('dia passado: pontos = janela do inicio do dia - janela do dia seguinte', async () => {
    const pts = (n: number) => Array.from({ length: n }, () => ({ lat: -22.9, long: -43.2 }))
    const r = await medirRastroDoDia('1', '2026-09-29', async (_cv, horas) => (horas > 24 ? pts(5) : pts(4)), agora)
    expect(r.pontosNoDia).toBe(1)
  })
  it('rastro vazio confirmado: 0 pontos, km null', async () => {
    const r = await medirRastroDoDia('1', '2026-09-30', async () => [], agora)
    expect(r).toEqual({ km: null, pontosNoDia: 0 })
  })
  it('consulta do rastro falhou: pontos desconhecidos (null), km null', async () => {
    const r = await medirRastroDoDia('1', '2026-09-30', async () => { throw new Error('x') }, agora)
    expect(r).toEqual({ km: null, pontosNoDia: null })
  })
  it('fora do alcance do rastro: desconhecido', async () => {
    const r = await medirRastroDoDia('1', '2026-09-20', async () => [], agora)
    expect(r).toEqual({ km: null, pontosNoDia: null })
  })
})

// Item 3 (relatorio 01/10, LNH8A80): rastro do dia com 590 pontos IDENTICOS
// (-22.675800,-43.271062) -- GPS sem fix, posicao congelada. medirRastroDoDia
// devolve a coordenada unica do dia (o detector decide se e' congelado).
describe('medirRastroDoDia -- coordenada unica no dia', () => {
  const agora = new Date('2026-10-01T22:00:00Z')
  const LNH = { lat: -22.6758, long: -43.271062 }
  const rep = (p: { lat: number; long: number }, n: number) => Array.from({ length: n }, () => ({ ...p }))
  it('todos os pontos do dia na mesma coordenada (>= 50): devolve a coordenada', async () => {
    // dia passado (30/09): janela do inicio do dia = dia + depois; os pontos do
    // dia sao os PRIMEIROS (ordem cronologica)
    const r = await medirRastroDoDia('19381', '2026-09-30', async (_cv, horas) => (horas > 30 ? rep(LNH, 590 + 288) : rep(LNH, 288)), agora)
    expect(r.pontosNoDia).toBe(590)
    expect(r.coordenadaUnicaNoDia).toEqual({ lat: -22.6758, lng: -43.271062 })
  })
  it('pontos do dia variam (caminhao rodou), mesmo com os dias seguintes parados: sem coordenada unica', async () => {
    const dia = Array.from({ length: 100 }, (_, i) => ({ lat: -22.8 + i * 0.001, long: -43.3 }))
    const r = await medirRastroDoDia('1', '2026-09-30', async (_cv, horas) => (horas > 30 ? [...dia, ...rep(LNH, 50)] : rep(LNH, 50)), agora)
    expect(r.coordenadaUnicaNoDia ?? null).toBeNull()
  })
  it('poucos pontos no dia (< 50): nao afirma coordenada unica', async () => {
    const r = await medirRastroDoDia('1', '2026-10-01', async () => rep(LNH, 10), agora)
    expect(r.coordenadaUnicaNoDia ?? null).toBeNull()
  })
})
