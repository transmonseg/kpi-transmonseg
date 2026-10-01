import { describe, it, expect } from 'vitest'
import { capturarParadasRioQuality, EMPRESA_SNAPSHOT_RIOQUALITY } from './snapshot-paradas'
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
    )
    expect(chamadas).toHaveLength(6)
    expect([...r.porDia.get('2026-09-29')!.keys()].sort()).toEqual(['BBB2B22', 'CCC3C33'])
    expect(r.porDia.get('2026-09-29')!.get('CCC3C33')).toHaveLength(1)
    expect(r.falhas.sort()).toEqual(['AAA1A11/2026-09-29', 'AAA1A11/2026-09-30'])
  })
})
