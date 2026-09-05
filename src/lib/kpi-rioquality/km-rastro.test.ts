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
