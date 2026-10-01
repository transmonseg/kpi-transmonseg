import { describe, it, expect } from 'vitest'
import { capturarParadasRioQuality, EMPRESA_SNAPSHOT_RIOQUALITY, comUmRetry, falhasSnapshotRqExcedemLimite, LIMITE_FRACAO_FALHAS_SNAPSHOT_RQ } from './snapshot-paradas'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

// Task 4 (plano 2026-09-30, estudo item 10): o cron noturno de paradas
// (scripts/snapshot-paradas-noturno.ts) so' cobria a Nutry Max -- a RQ perdia
// o dia inteiro quando o /stops (48h) vencia. Captura por CV da
// kpi_rioquality_frota, gravada com empresa 'rioquality'.
const p = (placa: string): UnitracParadaRow => ({
  id: placa, placa_norm: placa, chegada: '2026-09-29T10:00:00.000Z', saida: '2026-09-29T10:20:00.000Z',
  duracao_seg: 1200, local_parada: '', codigo_loja: null, nome_loja: null, lat: -22.9, lng: -43.2, classificacao: 'FORA_BASE', ordem: 0,
})

describe('capturarParadasRioQuality', () => {
  it('empresa do snapshot e rioquality', () => {
    expect(EMPRESA_SNAPSHOT_RIOQUALITY).toBe('rioquality')
  })

  it('consulta cada CV da frota em cada dia; placa com erro NAO entra no snapshot (nunca grava [] por falha)', async () => {
    const chamadas: string[] = []
    const r = await capturarParadasRioQuality(
      new Map([['AAA1A11', '1'], ['BBB2B22', '2'], ['CCC3C33', '3']]),
      ['2026-09-30', '2026-09-29'],
      async (cv, placa, dia) => {
        chamadas.push(`${placa}/${dia}`)
        if (placa === 'AAA1A11') throw new Error('timeout')
        return placa === 'BBB2B22' ? [] : [p(placa)]
      },
      { esperar: async () => {} },
    )
    // AAA1A11: 2 tentativas por dia (1 retry), demais 1
    expect(chamadas).toHaveLength(8)
    expect(r.totalConsultas).toBe(6)
    expect([...r.porDia.get('2026-09-29')!.keys()].sort()).toEqual(['BBB2B22', 'CCC3C33'])
    expect(r.porDia.get('2026-09-29')!.get('CCC3C33')).toHaveLength(1)
    expect(r.falhas.sort()).toEqual(['AAA1A11/2026-09-29', 'AAA1A11/2026-09-30'])
  })
})

// Revisao independente 30/09: /stops por placa sem retry -- um soluco da
// Unitrac perdia a placa no snapshot daquele dia (e o dia vira irregeneravel
// depois das 48h).
describe('comUmRetry', () => {
  it('falha na 1a tentativa e sucesso na 2a: devolve o valor, espera entre elas', async () => {
    let n = 0
    const esperas: number[] = []
    const r = await comUmRetry(async () => { n++; if (n === 1) throw new Error('503'); return 'ok' }, 1500, async ms => { esperas.push(ms) })
    expect(r).toBe('ok')
    expect(n).toBe(2)
    expect(esperas).toEqual([1500])
  })

  it('falha nas 2 tentativas: lanca o ultimo erro, sem 3a tentativa', async () => {
    let n = 0
    await expect(comUmRetry(async () => { n++; throw new Error(`e${n}`) }, 0, async () => {})).rejects.toThrow('e2')
    expect(n).toBe(2)
  })
})

describe('capturarParadasRioQuality -- retry', () => {
  it('soluco na 1a tentativa nao perde a placa', async () => {
    const tentativas = new Map<string, number>()
    const r = await capturarParadasRioQuality(
      new Map([['AAA1A11', '1']]), ['2026-09-29'],
      async (_cv, placa, dia) => {
        const k = `${placa}/${dia}`
        tentativas.set(k, (tentativas.get(k) ?? 0) + 1)
        if (tentativas.get(k) === 1) throw new Error('timeout')
        return [p(placa)]
      },
      { esperar: async () => {} },
    )
    expect(r.falhas).toEqual([])
    expect(r.porDia.get('2026-09-29')!.get('AAA1A11')).toHaveLength(1)
  })
})

describe('falhasSnapshotRqExcedemLimite', () => {
  it(`limite documentado = ${LIMITE_FRACAO_FALHAS_SNAPSHOT_RQ * 100}% das consultas`, () => {
    expect(LIMITE_FRACAO_FALHAS_SNAPSHOT_RQ).toBe(0.2)
  })
  it('falha isolada nao derruba o cron; acima do limite sim', () => {
    expect(falhasSnapshotRqExcedemLimite(1, 200)).toBe(false)
    expect(falhasSnapshotRqExcedemLimite(40, 200)).toBe(false) // exatamente 20%
    expect(falhasSnapshotRqExcedemLimite(41, 200)).toBe(true)
    expect(falhasSnapshotRqExcedemLimite(0, 0)).toBe(false)
  })
})
